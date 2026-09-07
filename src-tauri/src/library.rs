//! Finding cartridges on disk, and naming what they are.
//!
//! None of this belongs to the emulator. The core takes raw bytes and hands
//! raw bytes back; it has never heard of a path, and it is not asked to open
//! anything here. A listing only needs a file's first sixteen bytes — the
//! iNES header — so a folder of hundreds of ROMs is read in kilobytes rather
//! than megabytes, and a whole cartridge is loaded only when one is played.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// How deep a scan will walk before it decides a folder tree is pathological.
///
/// Guards against a symlink loop without the bookkeeping of tracking every
/// canonical path visited. Real ROM collections are two or three deep.
const MAX_DEPTH: usize = 8;

/// The extension a cartridge carries, matched without regard to case — the
/// same rule the Android front end applies.
const ROM_EXT: &str = "nes";

/// A cartridge as the library knows it, before anything has been played.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rom {
    /// Absolute path, and the identity everything else is keyed by.
    pub path: String,
    /// The file's name without its extension, upper-cased for the interface.
    pub title: String,
    /// `NROM`, `MMC3`, or `MAPPER 249` where the number has no common name.
    pub mapper: String,
    /// PRG plus CHR, in whole kilobytes, as the header declares them.
    pub size_kb: u32,
    /// Whether this cartridge's mapper is one the core can actually play.
    pub supported: bool,
}

/// What a walk turned up.
///
/// `readable` distinguishes "this folder holds no cartridges" from "this
/// folder did not answer" — an unplugged drive, a deleted path, a directory
/// somebody else owns. That is worth reporting to the player, but it is not
/// load-bearing: the library is derived fresh from the filesystem on every
/// scan and nothing is stored that a missing folder could invalidate. What
/// *is* kept — a cartridge's favourite mark and playtime — is keyed by path
/// and simply goes unmentioned while its drive is away.
///
/// (Android needs a stronger guarantee than this, because there the folder is
/// reached through a revocable permission and its ROM list is a database that
/// a bad reading really could wipe. Here the filesystem is the database.)
#[derive(Debug, Default)]
pub struct Scan {
    pub roms: Vec<Rom>,
    pub readable: bool,
}

/// Every ROM under `root`, subfolders walked as well.
pub fn scan(root: &Path) -> Scan {
    let mut out = Scan {
        roms: Vec::new(),
        readable: false,
    };
    let Ok(entries) = fs::read_dir(root) else {
        // The folder did not answer. Nothing found, and say so.
        return out;
    };
    out.readable = true;
    walk(entries, 0, &mut out.roms);
    out.roms.sort_by(|a, b| a.title.cmp(&b.title));
    out
}

/// Walks one directory, appending every cartridge below it.
///
/// Anything that will not answer — a subfolder we may not read, an entry whose
/// type the filesystem will not state — is stepped over rather than reported.
/// A listing is allowed to be incomplete; it is not allowed to stop.
fn walk(entries: fs::ReadDir, depth: usize, out: &mut Vec<Rom>) {
    for entry in entries.flatten() {
        let path = entry.path();
        // `file_type` does not follow a symlink, so a link to a directory
        // reports as a link; `is_dir` on the path resolves it. Depth is what
        // stops a loop of them.
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() || (kind.is_symlink() && path.is_dir()) {
            if depth + 1 > MAX_DEPTH {
                continue;
            }
            if let Ok(inside) = fs::read_dir(&path) {
                walk(inside, depth + 1, out);
            }
            continue;
        }
        if is_rom(&path) {
            // A file ending in .nes with no iNES header is not a cartridge.
            if let Some(rom) = read_rom(&path) {
                out.push(rom);
            }
        }
    }
}

fn is_rom(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(ROM_EXT))
}

/// Reads one cartridge's header. `None` if it is not an iNES file at all.
fn read_rom(path: &Path) -> Option<Rom> {
    let header = read_header(path)?;
    let (mapper, size_kb) = describe(&header);
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())?
        .to_uppercase();
    Some(Rom {
        path: path.to_string_lossy().into_owned(),
        title,
        supported: is_supported(mapper),
        mapper: mapper_name(mapper),
        size_kb,
    })
}

/// The sixteen header bytes, or `None` if the file is shorter or not iNES.
fn read_header(path: &Path) -> Option<[u8; 16]> {
    use std::io::Read;
    let mut file = fs::File::open(path).ok()?;
    let mut header = [0u8; 16];
    file.read_exact(&mut header).ok()?;
    // "NES\x1a". Without it, whatever this is, it is not a cartridge.
    if &header[0..4] != b"NES\x1a" {
        return None;
    }
    Some(header)
}

/// The mapper number and the ROM's declared size, in whole kilobytes.
fn describe(header: &[u8; 16]) -> (u16, u32) {
    let nes2 = header[7] & 0x0c == 0x08;

    let mut mapper = ((header[7] as u16 & 0xf0) | (header[6] as u16 >> 4)) & 0x0ff;
    if nes2 {
        // NES 2.0 widens the mapper by the low nibble of byte 8.
        mapper |= (header[8] as u16 & 0x0f) << 8;
    }

    // Byte 4 counts 16KB of PRG, byte 5 counts 8KB of CHR. NES 2.0 may spell
    // either as an exponent instead, which the high nibble of byte 9 marks.
    let (prg_units, chr_units) = if nes2 {
        let hi = header[9];
        (
            ((hi as u16 & 0x0f) << 8) | header[4] as u16,
            ((hi as u16 & 0xf0) << 4) | header[5] as u16,
        )
    } else {
        (header[4] as u16, header[5] as u16)
    };
    let size_kb = prg_units as u32 * 16 + chr_units as u32 * 8;

    (mapper, size_kb)
}

/// What a mapper is called, in the vocabulary the interface already uses.
///
/// Only the ones the core implements are named; anything else is reported by
/// number, which is more honest than a name nobody would recognise.
fn mapper_name(mapper: u16) -> String {
    let name = match mapper {
        0 => "NROM",
        1 => "MMC1",
        2 => "UNROM",
        3 => "CNROM",
        4 => "MMC3",
        5 => "MMC5",
        7 => "AOROM",
        11 => "COLOR DREAMS",
        21 | 22 | 23 | 25 | 27 => "VRC2/VRC4",
        28 => "ACTION 53",
        34 => "BNROM",
        66 => "GXROM",
        69 => "FME-7",
        180 => "UNROM 180",
        183 => "VRC2/VRC4",
        118 => "MMC3 TLSROM",
        119 => "MMC3 TQROM",
        _ => return format!("MAPPER {mapper}"),
    };
    name.to_string()
}

/// Whether the core will play this mapper, rather than refuse it by name.
///
/// Mirrors the list in `octet-emu`'s own README. Kept as data here rather than
/// asked of the core, so a listing never has to load a cartridge to be drawn.
fn is_supported(mapper: u16) -> bool {
    matches!(
        mapper,
        0 | 1 | 2 | 3 | 4 | 5 | 7 | 11 | 21 | 22 | 23 | 25 | 27 | 28 | 34 | 66 | 69 | 118 | 119
            | 180 | 183
    )
}

/// Scans several folders, skipping the ones that are turned off.
///
/// A cartridge reachable from two folders is listed once, under its own path;
/// nested folders are a normal thing for somebody to add by accident.
pub fn scan_all(folders: &[(PathBuf, bool)]) -> Vec<Rom> {
    let mut roms: Vec<Rom> = Vec::new();
    for (path, enabled) in folders {
        if !*enabled {
            continue;
        }
        for rom in scan(path).roms {
            if !roms.iter().any(|r| r.path == rom.path) {
                roms.push(rom);
            }
        }
    }
    roms.sort_by(|a, b| a.title.cmp(&b.title));
    roms
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A scratch directory of our own, removed when the test ends.
    struct Dir(PathBuf);

    impl Dir {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!("octet-scan-{name}"));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Dir(path)
        }

        /// Writes a cartridge with the given header fields and some body.
        fn rom(&self, name: &str, prg_16k: u8, chr_8k: u8, mapper: u16) {
            let mut header = [0u8; 16];
            header[0..4].copy_from_slice(b"NES\x1a");
            header[4] = prg_16k;
            header[5] = chr_8k;
            // The mapper's low nibble rides in the top of byte 6, its high
            // nibble in the top of byte 7.
            header[6] = ((mapper & 0x0f) << 4) as u8;
            header[7] = (mapper & 0xf0) as u8;
            let mut f = fs::File::create(self.0.join(name)).unwrap();
            f.write_all(&header).unwrap();
            f.write_all(&vec![0u8; 64]).unwrap();
        }

        fn raw(&self, name: &str, bytes: &[u8]) {
            fs::write(self.0.join(name), bytes).unwrap();
        }

        fn subdir(&self, name: &str) -> Dir {
            let path = self.0.join(name);
            fs::create_dir_all(&path).unwrap();
            Dir(path)
        }
    }

    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_mapper_and_size_from_the_header() {
        let dir = Dir::new("header");
        // 2 x 16KB PRG plus 1 x 8KB CHR is the 40 KB the design's NROM shows.
        dir.rom("astro vole.nes", 2, 1, 0);
        dir.rom("block warden.nes", 8, 0, 1);
        dir.rom("echo caverns.nes", 16, 0, 4);

        let found = scan(&dir.0);
        assert!(found.readable);
        let by_title: Vec<_> = found
            .roms
            .iter()
            .map(|r| (r.title.as_str(), r.mapper.as_str(), r.size_kb, r.supported))
            .collect();
        assert_eq!(
            by_title,
            vec![
                ("ASTRO VOLE", "NROM", 40, true),
                ("BLOCK WARDEN", "MMC1", 128, true),
                ("ECHO CAVERNS", "MMC3", 256, true),
            ]
        );
    }

    #[test]
    fn names_a_mapper_it_cannot_play_by_number() {
        let dir = Dir::new("unknown");
        dir.rom("oddity.nes", 4, 0, 250);
        let roms = scan(&dir.0).roms;
        assert_eq!(roms.len(), 1);
        assert_eq!(roms[0].mapper, "MAPPER 250");
        assert!(!roms[0].supported, "250 is not one the core implements");
    }

    #[test]
    fn ignores_anything_that_is_not_a_cartridge() {
        let dir = Dir::new("chaff");
        dir.rom("real.nes", 2, 1, 0);
        dir.raw("notes.txt", b"not a rom");
        // The extension lies: no iNES magic, so it is not a cartridge.
        dir.raw("liar.nes", b"PK\x03\x04 this is a zip");
        // Shorter than a header.
        dir.raw("stub.nes", b"NES");

        let roms = scan(&dir.0).roms;
        assert_eq!(roms.len(), 1, "only the real one counts: {roms:?}");
        assert_eq!(roms[0].title, "REAL");
    }

    #[test]
    fn matches_the_extension_whatever_its_case() {
        let dir = Dir::new("case");
        dir.rom("shouty.NES", 2, 1, 0);
        dir.rom("mixed.Nes", 2, 1, 0);
        assert_eq!(scan(&dir.0).roms.len(), 2);
    }

    #[test]
    fn walks_subfolders() {
        let dir = Dir::new("nested");
        dir.rom("top.nes", 2, 1, 0);
        let inner = dir.subdir("boxed");
        inner.rom("deep.nes", 2, 1, 0);
        let deeper = inner.subdir("deeper still");
        deeper.rom("deepest.nes", 2, 1, 0);

        let titles: Vec<_> = scan(&dir.0).roms.iter().map(|r| r.title.clone()).collect();
        assert_eq!(titles, vec!["DEEP", "DEEPEST", "TOP"], "sorted by title");
    }

    #[test]
    fn a_folder_that_is_not_there_is_not_an_empty_one() {
        let missing = std::env::temp_dir().join("octet-scan-nothing-here-at-all");
        let _ = fs::remove_dir_all(&missing);
        let found = scan(&missing);
        assert!(!found.readable, "an absent folder did not answer");
        assert!(found.roms.is_empty());
    }

    #[test]
    fn lists_a_cartridge_once_however_many_folders_reach_it() {
        let dir = Dir::new("overlap");
        let inner = dir.subdir("inner");
        inner.rom("shared.nes", 2, 1, 0);

        // The outer folder contains the inner one, so both find the same file.
        let roms = scan_all(&[(dir.0.clone(), true), (inner.0.clone(), true)]);
        assert_eq!(roms.len(), 1, "deduplicated by path: {roms:?}");
    }

    #[test]
    fn skips_folders_that_are_turned_off() {
        let dir = Dir::new("disabled");
        dir.rom("hidden.nes", 2, 1, 0);
        assert!(scan_all(&[(dir.0.clone(), false)]).is_empty());
        assert_eq!(scan_all(&[(dir.0.clone(), true)]).len(), 1);
    }
}
