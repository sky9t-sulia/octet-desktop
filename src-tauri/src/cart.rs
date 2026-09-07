//! Naming the files a cartridge accumulates.
//!
//! Art, save states and a battery all need somewhere to live, keyed to the
//! cartridge they belong to. A hash of the path rather than the title: two
//! cartridges can share a name, a title can hold anything a filesystem will
//! not, and renaming a file should not orphan its saves.

/// A cartridge's filename stem — sixteen hex digits of FNV-1a over its path.
///
/// Written out rather than taken from `DefaultHasher`, which is explicitly
/// not stable between releases: a name that changed with the compiler would
/// lose every save the next time the toolchain moved.
pub fn stem(rom: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in rom.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_cartridge_always_gets_the_same_name() {
        assert_eq!(stem("/roms/astro vole.nes"), stem("/roms/astro vole.nes"));
        assert_ne!(stem("/roms/astro vole.nes"), stem("/roms/block warden.nes"));
    }

    #[test]
    fn a_name_a_filesystem_would_refuse_still_hashes() {
        let awkward = stem("/roms/a: b/c*d?.nes");
        assert_eq!(awkward.len(), 16);
        assert!(awkward.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
