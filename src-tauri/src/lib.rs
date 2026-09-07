//! The desktop shell.
//!
//! What belongs here is everything the web view cannot do for itself. Right
//! now that is the library: which folders hold cartridges, what is in them,
//! and what the player has done with each one. The emulator core is not
//! involved — it takes raw bytes and hands raw bytes back, and a listing never
//! needs to open a cartridge to draw it.

mod art;
mod cart;
mod emu;
mod frame;
mod library;
mod saves;
mod store;
mod watch;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{Manager, State};

use emu::Session;
use library::Rom;
use store::{Mark, Store};
use watch::Watch;

/// Where the store lives, under the app's own config directory.
const STORE_FILE: &str = "library.json";

/// Where save states and their pictures live.
const STATE_DIR: &str = "states";

/// Where cartridges' battery saves live.
const BATTERY_DIR: &str = "saves";

/// How loud to play until the window says otherwise. Eight of its ten blocks.
const DEFAULT_VOLUME: u32 = 80;

/// Where library art lives, under the app's own data directory.
///
/// A cache rather than something the player keeps: named by a hash, rebuilt by
/// playing, and safe to delete. That is why it does not go to the screenshots
/// folder, which is for pictures somebody asked for.
const ART_DIR: &str = "art";

struct App {
    store: Mutex<Store>,
    store_path: PathBuf,
    /// The cartridge currently running, if any. At most one at a time: this is
    /// a console, not a bank of them.
    session: Mutex<Option<Session>>,
    /// Tells the window when a ROM folder changed under it.
    watch: std::sync::Arc<Watch>,
    art_dir: PathBuf,
    state_dir: PathBuf,
    battery_dir: PathBuf,
    /// How loud to play, nought to a hundred.
    ///
    /// Kept here rather than only in the running session, because the window
    /// sets it whether or not one is running — and a cartridge opened after
    /// it was turned down should open turned down.
    volume: AtomicU32,
}

impl App {
    /// Applies a change and writes it out.
    ///
    /// A failed write is reported rather than swallowed: silently losing a
    /// folder the player just added would be worse than saying so.
    fn update<T>(&self, f: impl FnOnce(&mut Store) -> T) -> Result<T, String> {
        let mut store = self.store.lock().map_err(|_| "store lock poisoned")?;
        let out = f(&mut store);
        store
            .save(&self.store_path)
            .map_err(|e| format!("could not save settings: {e}"))?;
        // The watcher follows the folder list, so it is repointed here rather
        // than at each of the four call sites that can change it.
        self.watch.set_folders(
            store
                .folders
                .iter()
                .filter(|f| f.enabled)
                .map(|f| PathBuf::from(&f.path))
                .collect(),
        );
        Ok(out)
    }
}

/// One folder, as the interface shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderView {
    path: String,
    /// The path as somebody would write it down: `~/ROMS/NES`. Computed here
    /// because only this side knows where home is.
    label: String,
    enabled: bool,
    /// How many cartridges it holds, counted whether or not it is enabled —
    /// the interface shows the number of a skipped folder too.
    count: usize,
    /// Whether the folder answered at all — false for an absent drive.
    readable: bool,
}

/// A path with the home directory folded back to `~`, upper-cased to match
/// the rest of the interface.
fn label_for(path: &str) -> String {
    let shortened = std::env::var("HOME")
        .ok()
        .filter(|home| !home.is_empty())
        .and_then(|home| path.strip_prefix(&home).map(|rest| format!("~{rest}")))
        .unwrap_or_else(|| path.to_string());
    shortened.to_uppercase()
}

/// One cartridge, its file and its history together.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RomView {
    #[serde(flatten)]
    rom: Rom,
    #[serde(flatten)]
    mark: Mark,
    /// Whether library art has been kept for this cartridge yet.
    has_art: bool,
}

/// Everything the library screen draws itself from.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryView {
    folders: Vec<FolderView>,
    roms: Vec<RomView>,
    /// Total bytes on disk across every listed cartridge.
    total_bytes: u64,
}

/// Scans the enabled folders and gathers what the interface needs.
///
/// Called after every change rather than kept in sync incrementally: a scan of
/// a few hundred headers is cheap, and a library that is recomputed cannot
/// drift from the filesystem.
fn view(store: &Store, art_dir: &Path) -> LibraryView {
    let folders = store
        .folders
        .iter()
        .map(|f| {
            let path = PathBuf::from(&f.path);
            let scan = library::scan(&path);
            FolderView {
                label: label_for(&f.path),
                path: f.path.clone(),
                enabled: f.enabled,
                count: scan.roms.len(),
                readable: scan.readable,
            }
        })
        .collect();

    let roms = library::scan_all(&store.scan_list());
    let total_bytes = roms
        .iter()
        .map(|r| std::fs::metadata(&r.path).map(|m| m.len()).unwrap_or(0))
        .sum();

    let roms = roms
        .into_iter()
        .map(|rom| RomView {
            mark: store.mark(&rom.path),
            has_art: art::path_for(art_dir, &rom.path).is_file(),
            rom,
        })
        .collect();

    LibraryView {
        folders,
        roms,
        total_bytes,
    }
}

fn read(app: &State<App>) -> Result<LibraryView, String> {
    let store = app.store.lock().map_err(|_| "store lock poisoned")?;
    Ok(view(&store, &app.art_dir))
}

#[tauri::command]
fn library(app: State<App>) -> Result<LibraryView, String> {
    read(&app)
}

/// Adds a folder the player picked. The picker itself is the dialog plugin's,
/// called from the front end; this only records the answer.
#[tauri::command]
fn add_folder(app: State<App>, path: String) -> Result<LibraryView, String> {
    let path = PathBuf::from(&path);
    if !path.is_dir() {
        return Err(format!("{} is not a folder", path.display()));
    }
    // Stored canonical, so the same folder reached by two different paths — a
    // symlink, a relative path, a trailing slash — is recognised as one.
    let path = path
        .canonicalize()
        .map_err(|e| format!("could not read {}: {e}", path.display()))?;
    app.update(|s| s.add_folder(path.to_string_lossy().into_owned()))?;
    read(&app)
}

#[tauri::command]
fn remove_folder(app: State<App>, path: String) -> Result<LibraryView, String> {
    app.update(|s| s.remove_folder(&path))?;
    read(&app)
}

#[tauri::command]
fn set_folder_enabled(
    app: State<App>,
    path: String,
    enabled: bool,
) -> Result<LibraryView, String> {
    app.update(|s| s.set_folder_enabled(&path, enabled))?;
    read(&app)
}

#[tauri::command]
fn set_favorite(app: State<App>, path: String, favorite: bool) -> Result<LibraryView, String> {
    app.update(|s| s.set_favorite(&path, favorite))?;
    read(&app)
}

/// What the front end needs to draw a running cartridge.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Opened {
    width: usize,
    height: usize,
    /// Every colour the PPU can emit, as `0x00RRGGBB`, indexed by identity.
    ///
    /// Sent once when a cartridge opens rather than per frame. The core builds
    /// it, so the shader that expands a frame cannot disagree with the
    /// emulator about what a colour is.
    palette: Vec<u32>,
}

/// Opens a cartridge and starts it running.
///
/// The file is read here and handed over as bytes; the core takes nothing else.
#[tauri::command]
fn open_rom(app: State<App>, path: String) -> Result<Opened, String> {
    let rom = std::fs::read(&path).map_err(|e| format!("could not read {path}: {e}"))?;

    // Art is kept only where there is none yet: a card should go on showing
    // what it showed the first time, not change every time you play.
    let art = {
        let to = art::path_for(&app.art_dir, &path);
        if to.is_file() { None } else { Some(to) }
    };
    let files = emu::Files {
        art,
        battery: saves::battery(&app.battery_dir, &path),
    };
    let session = Session::open(&path, rom, app.volume.load(Ordering::Relaxed), files)?;

    // Closing the previous cartridge first: dropping the old session joins its
    // thread, so two consoles never run at once.
    let mut held = app.session.lock().map_err(|_| "session lock poisoned")?;
    *held = None;
    *held = Some(session);

    Ok(Opened {
        width: emu::SIZE.0,
        height: emu::SIZE.1,
        palette: octet_emu::palette_table().to_vec(),
    })
}

/// Shuts the console down, and credits the time played to the cartridge.
///
/// Dropping the session joins the console's thread, which writes the
/// cartridge's own battery as it ends. Save states are written by hand, so
/// nothing is kept here beyond the battery and the time.
#[tauri::command]
fn close_rom(app: State<App>) -> Result<LibraryView, String> {
    let parting = {
        let mut held = app.session.lock().map_err(|_| "session lock poisoned")?;
        let Some(session) = held.as_ref() else {
            return read(&app);
        };
        let rom = session.path.clone();
        let minutes = session.minutes();
        held.take();
        (rom, minutes)
    };

    let (rom, minutes) = parting;

    app.update(|store| store.add_playtime(&rom, minutes))?;
    read(&app)
}

/// One cartridge's library art, as PNG bytes.
///
/// Read through a command rather than served over the asset protocol: the
/// window asks for a couple of dozen small files once, and a command needs no
/// scope to be configured and cannot be pointed anywhere but here.
#[tauri::command]
fn art(app: State<App>, path: String) -> Response {
    let at = art::path_for(&app.art_dir, &path);
    Response::new(std::fs::read(at).unwrap_or_default())
}

/// One save slot, as the browser shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SlotView {
    slot: u8,
    /// Whether anything has been written into it.
    used: bool,
    /// When, in milliseconds since the epoch.
    saved_at: Option<i64>,
    /// The cartridge's playtime at the moment it was written.
    play_minutes: u32,
    /// Whether a picture was kept with it.
    has_shot: bool,
}

/// Every slot for the cartridge currently running.
fn slot_views(store: &Store, dir: &Path, rom: &str) -> Vec<SlotView> {
    let held = store.slots_for(rom);
    (0..saves::SLOTS)
        .map(|slot| {
            let meta = held.get(&slot);
            SlotView {
                slot,
                used: meta.is_some(),
                saved_at: meta.map(|m| m.saved_at),
                play_minutes: meta.map(|m| m.play_minutes).unwrap_or(0),
                has_shot: saves::shot(dir, rom, slot).is_file(),
            }
        })
        .collect()
}

/// Now, in milliseconds since the epoch.
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// What the running cartridge has in its slots.
#[tauri::command]
fn slots(app: State<App>) -> Result<Vec<SlotView>, String> {
    let held = app.session.lock().map_err(|_| "session lock poisoned")?;
    let Some(session) = held.as_ref() else {
        return Ok(Vec::new());
    };
    let rom = session.path.clone();
    drop(held);
    let store = app.store.lock().map_err(|_| "store lock poisoned")?;
    Ok(slot_views(&store, &app.state_dir, &rom))
}

/// One slot's picture, as PNG bytes. Empty if it has none.
#[tauri::command]
fn slot_shot(app: State<App>, slot: u8) -> Response {
    let path = app
        .session
        .lock()
        .ok()
        .and_then(|held| held.as_ref().map(|s| s.path.clone()));
    let bytes = path
        .map(|rom| saves::shot(&app.state_dir, &rom, slot))
        .and_then(|at| std::fs::read(at).ok())
        .unwrap_or_default();
    Response::new(bytes)
}

/// Freezes the machine into a slot, with the frame that was on screen.
#[tauri::command]
fn save_state(app: State<App>, slot: u8) -> Result<Vec<SlotView>, String> {
    if slot >= saves::SLOTS {
        return Err(format!("there is no slot {slot}"));
    }
    let (rom, machine, frame, minutes) = {
        let held = app.session.lock().map_err(|_| "session lock poisoned")?;
        let session = held.as_ref().ok_or("no cartridge is running")?;
        let (machine, frame) = session.freeze()?;
        (session.path.clone(), machine, frame, session.minutes())
    };

    saves::write(&app.state_dir, &rom, slot, &machine, &frame)
        .map_err(|e| format!("could not keep the state: {e}"))?;

    let played = {
        let store = app.store.lock().map_err(|_| "store lock poisoned")?;
        store.mark(&rom).play_minutes + minutes
    };
    app.update(|store| {
        store.set_slot(
            &rom,
            slot,
            store::Slot {
                saved_at: now_ms(),
                play_minutes: played,
            },
        )
    })?;

    let store = app.store.lock().map_err(|_| "store lock poisoned")?;
    Ok(slot_views(&store, &app.state_dir, &rom))
}

/// Puts a slot back into the running machine.
#[tauri::command]
fn load_state(app: State<App>, slot: u8) -> Result<(), String> {
    let held = app.session.lock().map_err(|_| "session lock poisoned")?;
    let session = held.as_ref().ok_or("no cartridge is running")?;
    let bytes = saves::read(&app.state_dir, &session.path, slot)
        .ok_or_else(|| format!("slot {} is empty", slot + 1))?;
    session.thaw(bytes)
}

/// The newest frame, or nothing if the front end already has it.
///
/// Returned as a raw byte response rather than JSON: at sixty frames a second
/// the encoding is the cost, and there is nothing here for JSON to describe.
#[tauri::command]
fn frame(app: State<App>, since: u32) -> Response {
    let bytes = app
        .session
        .lock()
        .ok()
        .and_then(|held| held.as_ref().and_then(|s| s.frame(since)))
        .unwrap_or_default();
    Response::new(bytes)
}

/// Every button of one pad at once, as the bits a pad clocks out.
#[tauri::command]
fn press(app: State<App>, port: usize, bits: u8) {
    if let Ok(held) = app.session.lock() {
        if let Some(session) = held.as_ref() {
            session.press(port, bits);
        }
    }
}

#[tauri::command]
fn pause(app: State<App>, on: bool) {
    if let Ok(held) = app.session.lock() {
        if let Some(session) = held.as_ref() {
            session.pause(on);
        }
    }
}

#[tauri::command]
fn reset(app: State<App>) {
    if let Ok(held) = app.session.lock() {
        if let Some(session) = held.as_ref() {
            session.reset();
        }
    }
}

/// Turns folder watching on or off — the WATCH FOLDERS setting.
#[tauri::command]
fn set_watch_folders(app: State<App>, on: bool) {
    app.watch.set_enabled(on);
}

/// Sets how loud to play, now and for whatever is opened next.
#[tauri::command]
fn set_volume(app: State<App>, volume: u32) {
    let volume = volume.min(100);
    app.volume.store(volume, Ordering::Relaxed);
    if let Ok(held) = app.session.lock() {
        if let Some(session) = held.as_ref() {
            session.set_volume(volume);
        }
    }
}

/// Frames produced, frames the window never collected, and scanlines the
/// frame format simplified. For the FPS readout, and for checking the format's
/// per-scanline assumption holds.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Stats {
    frames: u32,
    dropped: u32,
    torn_lines: u32,
}

#[tauri::command]
fn stats(app: State<App>) -> Option<Stats> {
    let held = app.session.lock().ok()?;
    let (frames, dropped, torn_lines) = held.as_ref()?.stats();
    Some(Stats {
        frames,
        dropped,
        torn_lines,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Picking ROM folders, and the save/screenshot directories later.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let store_path = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("no config directory: {e}"))?
                .join(STORE_FILE);
            let data = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("no data directory: {e}"))?;
            let art_dir = data.join(ART_DIR);
            let store = Store::load(&store_path);
            let watch = Watch::new(app.handle().clone());
            watch.set_folders(
                store
                    .folders
                    .iter()
                    .filter(|f| f.enabled)
                    .map(|f| PathBuf::from(&f.path))
                    .collect(),
            );
            app.manage(App {
                store: Mutex::new(store),
                store_path,
                session: Mutex::new(None),
                watch,
                art_dir,
                state_dir: data.join(STATE_DIR),
                battery_dir: data.join(BATTERY_DIR),
                // The window says what it wants the moment it is up; this is
                // only what the first cartridge would open at if it did not.
                volume: AtomicU32::new(DEFAULT_VOLUME),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library,
            add_folder,
            remove_folder,
            set_folder_enabled,
            set_favorite,
            open_rom,
            close_rom,
            frame,
            press,
            pause,
            reset,
            set_volume,
            set_watch_folders,
            art,
            slots,
            slot_shot,
            save_state,
            load_state,
            stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::Path;

    fn dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("octet-view-{name}"));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn rom(at: &Path, name: &str, mapper: u16) {
        let mut header = [0u8; 16];
        header[0..4].copy_from_slice(b"NES\x1a");
        header[4] = 2;
        header[5] = 1;
        header[6] = ((mapper & 0x0f) << 4) as u8;
        header[7] = (mapper & 0xf0) as u8;
        let mut f = std::fs::File::create(at.join(name)).unwrap();
        f.write_all(&header).unwrap();
        f.write_all(&[0u8; 64]).unwrap();
    }

    /// The shape the front end destructures. A `flatten` that nested its
    /// fields, or renamed one, would leave the interface rendering `undefined`
    /// with nothing to say about it — so the keys are pinned here by name.
    #[test]
    fn a_rom_serialises_flat_and_in_camel_case() {
        let folder = dir("shape");
        rom(&folder, "astro vole.nes", 0);

        let mut store = Store::default();
        store.add_folder(folder.to_string_lossy().into_owned());
        let path = folder.join("astro vole.nes").to_string_lossy().into_owned();
        store.set_favorite(&path, true);

        let json = serde_json::to_value(view(&store, Path::new("/tmp/octet-art-none"))).unwrap();
        let rom = &json["roms"][0];

        assert_eq!(rom["title"], "ASTRO VOLE");
        assert_eq!(rom["mapper"], "NROM");
        assert_eq!(rom["sizeKb"], 40);
        assert_eq!(rom["supported"], true);
        // From the Mark, flattened in beside the Rom's own fields.
        assert_eq!(rom["favorite"], true);
        assert_eq!(rom["playMinutes"], 0);
        assert_eq!(rom["lastPlayedAt"], serde_json::Value::Null);
        assert!(
            rom.get("rom").is_none() && rom.get("mark").is_none(),
            "flatten should not leave the two halves nested: {rom}"
        );

        let f = &json["folders"][0];
        assert_eq!(f["enabled"], true);
        assert_eq!(f["count"], 1);
        assert_eq!(f["readable"], true);
        assert!(json["totalBytes"].as_u64().unwrap() > 0);

        let _ = std::fs::remove_dir_all(&folder);
    }

    #[test]
    fn a_folder_under_home_is_written_with_a_tilde() {
        let home = std::env::var("HOME").unwrap_or_default();
        if home.is_empty() {
            return;
        }
        assert_eq!(label_for(&format!("{home}/roms/nes")), "~/ROMS/NES");
        assert_eq!(label_for("/mnt/games/nes"), "/MNT/GAMES/NES");
    }

    #[test]
    fn an_absent_folder_is_reported_rather_than_shown_empty() {
        let mut store = Store::default();
        store.add_folder("/definitely/not/a/real/path".into());
        let json = serde_json::to_value(view(&store, Path::new("/tmp/octet-art-none"))).unwrap();
        assert_eq!(json["folders"][0]["readable"], false);
        assert_eq!(json["folders"][0]["count"], 0);
        assert!(json["roms"].as_array().unwrap().is_empty());
    }
}
