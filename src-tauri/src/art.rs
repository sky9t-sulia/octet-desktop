//! Library art: a frame of the game itself, kept for the card to wear.
//!
//! The design calls for frame three hundred — five seconds in, which is past
//! most title screens and into something that looks like the game. One per
//! cartridge, written once and then left alone, so a card shows whatever it
//! showed the first time you played rather than changing under you.

use std::path::{Path, PathBuf};

use octet_emu::{expand, FRAME_HEIGHT, FRAME_WIDTH};

/// Which frame to keep, counted from the moment the cartridge opened.
pub const CAPTURE_AT: u64 = 300;

/// Where a cartridge's art lives, under the app's own data directory.
pub fn path_for(dir: &Path, rom: &str) -> PathBuf {
    dir.join(format!("{}.png", crate::cart::stem(rom)))
}

/// Writes one frame of colour identities as a PNG.
///
/// The identities are expanded through the core's own palette, so the art
/// agrees with what was on screen. Written to a neighbouring file and renamed
/// over, so a card never finds a half-written picture.
pub fn write(to: &Path, ids: &[u16; FRAME_WIDTH * FRAME_HEIGHT]) -> std::io::Result<()> {
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir)?;
    }

    let mut rgb = Vec::with_capacity(FRAME_WIDTH * FRAME_HEIGHT * 3);
    for id in ids.iter() {
        let colour = expand(*id);
        rgb.push((colour >> 16) as u8);
        rgb.push((colour >> 8) as u8);
        rgb.push(colour as u8);
    }

    let tmp = to.with_extension("png.tmp");
    {
        let file = std::fs::File::create(&tmp)?;
        let mut encoder = png::Encoder::new(
            std::io::BufWriter::new(file),
            FRAME_WIDTH as u32,
            FRAME_HEIGHT as u32,
        );
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(&rgb)?;
    }
    std::fs::rename(&tmp, to)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_written_frame_reads_back_as_a_png() {
        let dir = std::env::temp_dir().join("octet-art-test");
        let _ = std::fs::remove_dir_all(&dir);
        let to = path_for(&dir, "/roms/test.nes");

        // A gradient, so the file is not one flat colour.
        let mut ids = Box::new([0u16; FRAME_WIDTH * FRAME_HEIGHT]);
        for (i, id) in ids.iter_mut().enumerate() {
            *id = (i % 64) as u16;
        }
        write(&to, &ids).unwrap();

        let bytes = std::fs::read(&to).unwrap();
        assert_eq!(&bytes[1..4], b"PNG", "should carry a PNG signature");
        let decoder = png::Decoder::new(std::io::Cursor::new(&bytes));
        let reader = decoder.read_info().unwrap();
        let info = reader.info();
        assert_eq!((info.width, info.height), (256, 240));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
