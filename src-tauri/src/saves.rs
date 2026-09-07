//! Save states and the cartridge's own battery.
//!
//! Two different things that both persist. A battery save is the handful of
//! bytes a cartridge kept in its own RAM — the game's idea of a saved game,
//! and its own business. A save state is the whole machine frozen, which the
//! game knows nothing about.
//!
//! Both are files rather than rows in `library.json`: a snapshot runs to tens
//! of kilobytes and that file is read at every launch. What does live in the
//! store is a slot's label — see [`crate::store::Slot`].

use std::path::{Path, PathBuf};

use octet_emu::{FRAME_HEIGHT, FRAME_WIDTH};

use crate::{art, cart};

/// How many slots a cartridge has. All eight are written by hand.
pub const SLOTS: u8 = 8;

/// Where one slot's frozen machine lives.
pub fn state(dir: &Path, rom: &str, slot: u8) -> PathBuf {
    dir.join(format!("{}-{slot}.state", cart::stem(rom)))
}

/// Where one slot's picture lives — the frame that was on screen.
pub fn shot(dir: &Path, rom: &str, slot: u8) -> PathBuf {
    dir.join(format!("{}-{slot}.png", cart::stem(rom)))
}

/// Where a cartridge's battery lives.
pub fn battery(dir: &Path, rom: &str) -> PathBuf {
    dir.join(format!("{}.sav", cart::stem(rom)))
}

/// Writes a slot: the machine, and the frame that was on screen with it.
///
/// Both to a neighbouring name and renamed over, so a slot is never found
/// half written. The picture failing is not worth failing the save for — a
/// slot without one still loads.
pub fn write(
    dir: &Path,
    rom: &str,
    slot: u8,
    machine: &[u8],
    frame: &[u16; FRAME_WIDTH * FRAME_HEIGHT],
) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let to = state(dir, rom, slot);
    let tmp = to.with_extension("state.tmp");
    std::fs::write(&tmp, machine)?;
    std::fs::rename(&tmp, &to)?;

    if let Err(e) = art::write(&shot(dir, rom, slot), frame) {
        eprintln!("octet: slot {slot} kept, but its picture did not: {e}");
    }
    Ok(())
}

/// Reads a slot's machine back, or nothing if it holds none.
pub fn read(dir: &Path, rom: &str, slot: u8) -> Option<Vec<u8>> {
    std::fs::read(state(dir, rom, slot)).ok()
}
