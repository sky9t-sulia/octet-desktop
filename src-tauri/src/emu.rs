//! The console: a cartridge in it, and the sound it makes.
//!
//! Run entirely on one thread that owns the `Nes`, so the picture needs no
//! lock and the interface can never stall emulation. The window talks to it
//! over a channel and reads finished frames out of a slot; the sound device
//! reads samples out of a ring.
//!
//! Pacing follows the Android front end's approach, and for the same reason:
//! a wall-clock deadline sets the tempo, but when the speaker is running short
//! the thread runs extra frames to catch up. Sound is the thing a player
//! notices, so it gets to be the clock.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, SyncSender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use octet_emu::{Button, Cartridge, Nes, FRAME_HEIGHT, FRAME_WIDTH};

use crate::art;
use crate::frame::{self, Encoded};

/// How many frames the thread will run back-to-back to refill the speaker.
///
/// Bounded so a machine too slow to keep up falls behind steadily instead of
/// locking up chasing a deficit it cannot close. Four, as on Android.
const CATCHUP: u32 = 4;

/// How many frames of sound to keep ahead of the speaker, at least.
///
/// The real target is set from the device's own block size — see
/// [`Speaker::target`] — because that is what decides how much the callback
/// can ask for at once. This is only the floor.
const TARGET_FRAMES: usize = 3;

/// How large a block to ask the device for, in frames.
///
/// Left to itself, this machine's default was 4410 frames — a tenth of a
/// second, asked for in one go. Nothing that runs a frame at a time can keep
/// a buffer that size fed from a standing start, so the callback drained the
/// ring, held its last sample for the rest of the block, and the sound came
/// out with an echo on it at the block rate. A shorter block is asked for
/// instead, and the ring is sized against whatever the device settles on.
const WANTED_BLOCK: u32 = 1024;

/// Anything past this is a device reporting nonsense, not a real backlog.
const MAX_QUEUED: usize = 1 << 20;

/// Nanoseconds per unit of [`Nes::frame_rate`].
///
/// That rate is in *thousandths* of a frame per second — 60,098 for NTSC, not
/// 60 — so converting it to a duration takes a billion for the nanoseconds and
/// a further thousand for the rate's own scale. Miss the thousand and the
/// deadline comes out a thousand times too short, the loop never waits, and
/// the console runs as fast as the machine can go.
const NANOS_PER_MILLIFRAME: u64 = 1_000_000_000_000;

/// Samples in one frame, at whatever rate the cartridge runs.
///
/// The same factor of a thousand applies: the sample rate is per second, the
/// frame rate is per thousand seconds of frames. Doubled, because the core
/// hands over interleaved stereo pairs.
fn samples_per_frame(nes: &Nes) -> usize {
    (nes.sample_rate() as u64 * 1_000 / nes.frame_rate().max(1) as u64).max(1) as usize * 2
}

/// How long one frame should take.
fn frame_time(nes: &Nes) -> Duration {
    Duration::from_nanos(NANOS_PER_MILLIFRAME / nes.frame_rate().max(1) as u64)
}

/// What the window asks the console to do.
///
/// The two that answer carry a channel to answer down. Only this thread holds
/// the machine, so freezing it and thawing it have to happen here.
enum Cmd {
    Buttons { port: usize, bits: u8 },
    Pause(bool),
    Reset,
    /// Freeze the machine and send the bytes back, with the frame that was on
    /// screen when it was taken.
    Freeze(SyncSender<(Vec<u8>, Box<[u16; PIXELS]>)>),
    /// Thaw a machine frozen earlier. False if the bytes were not this
    /// cartridge's.
    Thaw(Vec<u8>, SyncSender<bool>),
    Close,
}

/// Pixels in a frame, for the picture that rides along with a freeze.
const PIXELS: usize = FRAME_WIDTH * FRAME_HEIGHT;

/// The latest finished frame, and the number of the last one taken.
struct Slot {
    encoded: Mutex<Option<Encoded>>,
    /// Bumped per frame produced, so the window can tell a new one from a
    /// repeat without comparing 61 kilobytes.
    sequence: AtomicU32,
    /// Frames the emulator produced but nobody collected — the window
    /// redrawing slower than the console runs.
    dropped: AtomicU32,
    /// Scanlines whose emphasis changed mid-line; see `frame::Encoded`.
    torn_lines: AtomicU32,
}

/// Samples waiting for the speaker.
struct Ring {
    queue: Mutex<VecDeque<f32>>,
    /// 0..=100, read fresh by the audio callback so a change lands at once.
    volume: AtomicU32,
}

impl Ring {
    fn queued(&self) -> usize {
        self.queue.lock().map(|q| q.len().min(MAX_QUEUED)).unwrap_or(0)
    }
}

/// The files a running cartridge reads and writes.
pub struct Files {
    /// Where to keep library art, or `None` if it already has some.
    pub art: Option<PathBuf>,
    /// The cartridge's own battery. Read at open, written at close.
    pub battery: PathBuf,
}

/// A cartridge, open and running.
pub struct Session {
    tx: Sender<Cmd>,
    slot: Arc<Slot>,
    ring: Arc<Ring>,
    running: Arc<AtomicBool>,
    /// What was opened, so the library can be told what was played.
    pub path: String,
    pub started_at: Instant,
    handle: Option<thread::JoinHandle<()>>,
}

impl Session {
    /// Opens a cartridge and starts running it.
    ///
    /// The ROM arrives as bytes because that is all the core takes: it has
    /// never heard of a path, and reading the file is this side's business.
    pub fn open(path: &str, rom: Vec<u8>, volume: u32, files: Files) -> Result<Self, String> {
        let cart = Cartridge::from_ines(&rom).map_err(|e| format!("{e:?}"))?;
        let mut nes =
            Nes::new(cart).map_err(|e| format!("{} is not a mapper this build plays", e.0))?;

        // The cartridge's own saved game, if it kept one. A cartridge with no
        // battery has nowhere to put it and ignores this.
        if let Ok(saved) = std::fs::read(&files.battery) {
            nes.load_save_data(&saved);
        }

        let slot = Arc::new(Slot {
            encoded: Mutex::new(None),
            sequence: AtomicU32::new(0),
            dropped: AtomicU32::new(0),
            torn_lines: AtomicU32::new(0),
        });
        let ring = Arc::new(Ring {
            queue: Mutex::new(VecDeque::new()),
            volume: AtomicU32::new(volume.min(100)),
        });
        let running = Arc::new(AtomicBool::new(true));

        let (tx, rx) = mpsc::channel();
        let handle = {
            let slot = Arc::clone(&slot);
            let ring = Arc::clone(&ring);
            let running = Arc::clone(&running);
            thread::Builder::new()
                .name("octet-console".into())
                .spawn(move || run(nes, rx, slot, ring, running, files))
                .map_err(|e| format!("could not start the console thread: {e}"))?
        };

        Ok(Session {
            tx,
            slot,
            ring,
            running,
            path: path.to_string(),
            started_at: Instant::now(),
            handle: Some(handle),
        })
    }

    /// The newest frame, if it is newer than `since`.
    ///
    /// Returning nothing for a frame already seen is what keeps the window
    /// from re-sending 61 kilobytes it already has when it redraws faster than
    /// the console runs.
    pub fn frame(&self, since: u32) -> Option<Vec<u8>> {
        if self.slot.sequence.load(Ordering::Acquire) == since {
            return None;
        }
        let mut held = self.slot.encoded.lock().ok()?;
        held.take().map(|e| e.bytes)
    }

    pub fn press(&self, port: usize, bits: u8) {
        let _ = self.tx.send(Cmd::Buttons { port, bits });
    }

    pub fn pause(&self, on: bool) {
        let _ = self.tx.send(Cmd::Pause(on));
    }

    pub fn reset(&self) {
        let _ = self.tx.send(Cmd::Reset);
    }

    /// Freezes the machine: the bytes, and the frame that was on screen.
    ///
    /// Answered by the console's own thread, so this waits on it — a frame at
    /// worst, and only when somebody asked for a save.
    pub fn freeze(&self) -> Result<(Vec<u8>, Box<[u16; PIXELS]>), String> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx
            .send(Cmd::Freeze(tx))
            .map_err(|_| "the console is not running")?;
        rx.recv_timeout(Duration::from_secs(2))
            .map_err(|_| "the console did not answer".to_string())
    }

    /// Thaws a machine frozen earlier.
    pub fn thaw(&self, bytes: Vec<u8>) -> Result<(), String> {
        let (tx, rx) = mpsc::sync_channel(1);
        self.tx
            .send(Cmd::Thaw(bytes, tx))
            .map_err(|_| "the console is not running")?;
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(true) => Ok(()),
            Ok(false) => Err("that state belongs to another cartridge".into()),
            Err(_) => Err("the console did not answer".into()),
        }
    }

    pub fn set_volume(&self, volume: u32) {
        self.ring.volume.store(volume.min(100), Ordering::Relaxed);
    }

    /// Frames produced, frames nobody collected, and lines the frame format
    /// simplified. Reported so the guesses in it can be checked rather than
    /// assumed.
    pub fn stats(&self) -> (u32, u32, u32) {
        (
            self.slot.sequence.load(Ordering::Relaxed),
            self.slot.dropped.load(Ordering::Relaxed),
            self.slot.torn_lines.load(Ordering::Relaxed),
        )
    }

    /// How long the cartridge has been open, in whole minutes.
    pub fn minutes(&self) -> u32 {
        self.started_at.elapsed().as_secs() as u32 / 60
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
        let _ = self.tx.send(Cmd::Close);
        if let Some(handle) = self.handle.take() {
            // The thread checks `running` once a frame, so this is a short
            // wait; joining rather than detaching means the `Nes` is dropped
            // before the next cartridge opens.
            let _ = handle.join();
        }
    }
}

/// A running output, and what the ring has to keep up with.
struct Speaker {
    stream: cpal::Stream,
    /// How many of the core's samples to stay ahead by.
    target: usize,
}

/// Picks an output configuration, preferring the core's own rate.
///
/// The core chooses 48 kHz precisely so no conversion is needed, but the
/// default configuration this device offers is 44.1 kHz — so the supported
/// ranges are searched for one that will take 48 kHz before falling back.
fn choose_config(device: &cpal::Device, want_rate: u32) -> Option<cpal::SupportedStreamConfig> {
    if let Ok(ranges) = device.supported_output_configs() {
        let wanted = cpal::SampleRate(want_rate);
        let mut best: Option<cpal::SupportedStreamConfigRange> = None;
        for range in ranges {
            if range.sample_format() != cpal::SampleFormat::F32 {
                continue;
            }
            if range.min_sample_rate() > wanted || range.max_sample_rate() < wanted {
                continue;
            }
            // Stereo for preference, then whatever is closest to it.
            //
            // Not the fewest: a mono stream is not sent straight to both
            // speakers, it is upmixed by whatever is downstream, and the
            // result sits off to one side and sounds like it is coming from
            // the next room. The same sample goes to every channel here, so
            // asking for two costs nothing and lands where it should.
            let score = |ch: u16| (ch as i32 - 2).abs();
            if best
                .as_ref()
                .is_none_or(|b| score(range.channels()) < score(b.channels()))
            {
                best = Some(range);
            }
        }
        if let Some(range) = best {
            return Some(range.with_sample_rate(wanted));
        }
    }
    device.default_output_config().ok()
}

/// Opens the default output and starts it. `None` if the machine has no sound.
fn open_speaker(sample_rate: u32, ring: Arc<Ring>, per_frame: usize) -> Option<Speaker> {
    let device = cpal::default_host().default_output_device()?;
    let config = choose_config(&device, sample_rate)?;
    let channels = config.channels() as usize;
    let device_rate = config.sample_rate().0;

    // Ask for a short block. A device may refuse and use its own size, which
    // is why the ring is sized from what was asked rather than assumed.
    let mut stream_config = config.config();
    let block = match config.buffer_size() {
        cpal::SupportedBufferSize::Range { min, max } => WANTED_BLOCK.clamp(*min, *max),
        cpal::SupportedBufferSize::Unknown => WANTED_BLOCK,
    };
    stream_config.buffer_size = cpal::BufferSize::Fixed(block);

    // Enough for three of the device's blocks, or three frames, whichever is
    // the larger — converted back into the core's own samples.
    let block_in_core_samples =
        (block as f64 * sample_rate as f64 / device_rate as f64).ceil() as usize;
    let target = (block_in_core_samples * 3).max(per_frame * TARGET_FRAMES);

    // The core picks its rate to be one a device is likely to want, so the
    // usual case is no conversion at all. Where they do differ, step through
    // the ring at the ratio and hold between samples; the APU is already
    // band-limited, so there is nothing here for a filter to protect.
    //
    // The ring holds interleaved pairs, so every step takes two.
    let step = sample_rate as f64 / device_rate as f64;
    let matched = sample_rate == device_rate;
    let mut carry = 0.0f64;
    // The last sample handed over, repeated if the ring runs dry. Holding a
    // level is a pause in the sound; dropping to zero is a click, and a click
    // is what an underrun sounds like when it is filled with silence.
    let mut held = (0.0f32, 0.0f32);

    let stream = device
        .build_output_stream(
            &stream_config,
            move |out: &mut [f32], _| {
                let gain = ring.volume.load(Ordering::Relaxed) as f32 / 100.0;
                let Ok(mut queue) = ring.queue.lock() else { return };

                for frame in out.chunks_mut(channels) {
                    if matched {
                        if let Some(p) = next_pair(&mut queue) {
                            held = p;
                        }
                    } else {
                        carry += step;
                        let take = carry as usize;
                        carry -= take as f64;
                        for _ in 0..take {
                            match next_pair(&mut queue) {
                                Some(p) => held = p,
                                None => break,
                            }
                        }
                    }
                    let (left, right) = (held.0 * gain, held.1 * gain);
                    for (i, slot) in frame.iter_mut().enumerate() {
                        *slot = if i % 2 == 0 { left } else { right };
                    }
                }
            },
            |e| eprintln!("octet: audio stream error: {e}"),
            None,
        )
        .ok()?;
    stream.play().ok()?;
    Some(Speaker { stream, target })
}

/// One interleaved pair off the ring, or nothing if it holds less than one.
///
/// Never half a pair: taking one value would swap the channels for every
/// sample after it.
fn next_pair(queue: &mut VecDeque<f32>) -> Option<(f32, f32)> {
    if queue.len() < 2 {
        return None;
    }
    let left = queue.pop_front()?;
    let right = queue.pop_front()?;
    Some((left, right))
}

/// The console's own thread.
///
/// The sound device is opened and held here rather than by [`Session`],
/// because a `cpal::Stream` is not `Send` and Tauri's managed state must be.
/// It is the right home regardless: the thread that fills the speaker is the
/// one that should own it, and dropping it on the way out stops the sound.
fn run(
    mut nes: Nes,
    rx: Receiver<Cmd>,
    slot: Arc<Slot>,
    ring: Arc<Ring>,
    running: Arc<AtomicBool>,
    files: Files,
) {
    let per_frame = samples_per_frame(&nes);
    let speaker = open_speaker(nes.sample_rate(), Arc::clone(&ring), per_frame);
    let audible = speaker.is_some();
    if !audible {
        // Not fatal: a machine with no sound device should still play.
        eprintln!("octet: no audio device; running on the clock alone");
    }
    // Held for as long as the cartridge runs; dropping it stops the sound.
    let target = speaker.as_ref().map_or(per_frame, |s| s.target);
    let _stream = speaker.map(|s| s.stream);

    let mut paused = false;
    let mut samples = Vec::with_capacity(4096);
    let mut due = Instant::now();
    // Frames run since the cartridge opened, for the art capture.
    let mut ran: u64 = 0;
    let mut captured = false;

    let frame_time = frame_time(&nes);

    while running.load(Ordering::Acquire) {
        // ── What the window has asked for ──
        loop {
            match rx.try_recv() {
                Ok(Cmd::Buttons { port, bits }) => set_buttons(&mut nes, port, bits),
                Ok(Cmd::Pause(on)) => {
                    paused = on;
                    // A stale deadline would read as a pile of missed frames.
                    due = Instant::now();
                }
                Ok(Cmd::Reset) => nes.reset(),
                Ok(Cmd::Freeze(reply)) => {
                    let frame = Box::new(*nes.color_ids());
                    let _ = reply.send((nes.save_state(), frame));
                }
                Ok(Cmd::Thaw(bytes, reply)) => {
                    let _ = reply.send(nes.load_state(&bytes).is_ok());
                }
                Ok(Cmd::Close) => break,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            }
        }

        if paused {
            thread::sleep(frame_time);
            continue;
        }

        let now = Instant::now();
        if now < due {
            thread::sleep(due - now);
            continue;
        }
        // A late frame moves the deadline: nothing is owed for one missed.
        due = (due + frame_time).max(now);

        advance(&mut nes, &ring, &mut samples);
        publish(&nes, &slot);
        ran += 1;

        // Library art, once, at the frame the design asks for.
        if !captured && ran >= art::CAPTURE_AT {
            captured = true;
            if let Some(to) = files.art.as_deref() {
                if let Err(e) = art::write(to, nes.color_ids()) {
                    eprintln!("octet: could not keep library art: {e}");
                }
            }
        }

        // Then as many extra frames as the speaker is short of, so sound
        // stays ahead of the deadline rather than the other way round.
        if audible {
            let mut extra = 0;
            while extra < CATCHUP && ring.queued() < target {
                advance(&mut nes, &ring, &mut samples);
                publish(&nes, &slot);
                extra += 1;
            }
        }
    }

    // On the way out, the cartridge's own saved game. Written here because
    // this thread is the only thing holding the machine, and skipped for a
    // cartridge with no battery, which has nothing to say.
    let battery = nes.save_data();
    if !battery.is_empty() {
        if let Some(dir) = files.battery.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Err(e) = std::fs::write(&files.battery, battery) {
            eprintln!("octet: could not keep the battery save: {e}");
        }
    }
}

fn advance(nes: &mut Nes, ring: &Ring, samples: &mut Vec<f32>) {
    nes.run_frame();
    samples.clear();
    nes.drain_audio_stereo(samples);
    if let Ok(mut queue) = ring.queue.lock() {
        // Never let a stalled speaker grow an unbounded backlog.
        if queue.len() < MAX_QUEUED {
            queue.extend(samples.iter().copied());
        }
    }
}

fn publish(nes: &Nes, slot: &Slot) {
    let sequence = slot.sequence.fetch_add(1, Ordering::AcqRel) + 1;
    let encoded = frame::encode(nes.color_ids(), sequence);
    slot.torn_lines
        .fetch_add(encoded.torn_lines, Ordering::Relaxed);
    if let Ok(mut held) = slot.encoded.lock() {
        if held.replace(encoded).is_some() {
            // The previous frame was never collected: the window is redrawing
            // slower than the console runs, which is normal on a 60Hz display
            // running a 60Hz console and worth counting rather than hiding.
            slot.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// The bits of the button byte, in the order a pad clocks them out — the same
/// order the Android front end uses, so a key map is portable between them.
fn set_buttons(nes: &mut Nes, port: usize, bits: u8) {
    const ORDER: [Button; 8] = [
        Button::A,
        Button::B,
        Button::Select,
        Button::Start,
        Button::Up,
        Button::Down,
        Button::Left,
        Button::Right,
    ];
    for (i, button) in ORDER.iter().enumerate() {
        nes.set_button(port, *button, bits & (1 << i) != 0);
    }
}

/// The picture's dimensions, told to the front end so it need not assume them.
pub const SIZE: (usize, usize) = (FRAME_WIDTH, FRAME_HEIGHT);

#[cfg(test)]
mod tests {
    use super::*;
    use octet_emu::Cartridge;

    /// A bare NROM cartridge that does nothing, for asking the machine about
    /// its own timing.
    fn quiet_cartridge() -> Cartridge {
        let mut prg = vec![0; 16 * 1024];
        // JMP to itself at $C000, and a reset vector pointing there.
        prg[0] = 0x4c;
        prg[1] = 0x00;
        prg[2] = 0xc0;
        prg[0x3ffc] = 0x00;
        prg[0x3ffd] = 0xc0;
        Cartridge {
            prg_rom: prg,
            chr_rom: Vec::new(),
            chr_ram: vec![0; 8192],
            prg_ram: vec![0; 8192],
            prg_nvram: Vec::new(),
            mapper: 0,
            submapper: 0,
            mirroring: octet_emu::Mirroring::Horizontal,
            tv: octet_emu::TvSystem::Ntsc,
        }
    }

    /// `Nes::frame_rate` is in thousandths of a frame per second, and reading
    /// it as whole frames makes a deadline a thousand times too short — which
    /// does not fail, it just runs the console at a thousand times speed. So
    /// the arithmetic is pinned to a number a person can check.
    #[test]
    fn a_frame_lasts_about_a_sixtieth_of_a_second() {
        let nes = Nes::new(quiet_cartridge()).unwrap();
        let millis = frame_time(&nes).as_secs_f64() * 1000.0;
        assert!(
            (16.0..17.0).contains(&millis),
            "NTSC should be ~16.64ms a frame, got {millis:.4}ms",
        );
    }

    /// A frame is a sixtieth of a second of sound, twice over: the core hands
    /// its one channel across as interleaved stereo pairs, so everything
    /// counting samples has to count two per sample or the ring is sized half
    /// as deep as it needs to be.
    #[test]
    fn a_frame_carries_a_sixtieth_of_a_second_of_stereo() {
        let nes = Nes::new(quiet_cartridge()).unwrap();
        let per_frame = samples_per_frame(&nes);
        let rate = nes.sample_rate() as f64;
        let expected = (rate / 60.098) * 2.0;
        assert!(
            (per_frame as f64 - expected).abs() < 4.0,
            "{per_frame} values a frame at {rate}Hz stereo, expected about {expected:.0}",
        );
    }
}
