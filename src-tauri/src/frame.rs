//! Packing a finished picture small enough to send sixty times a second.
//!
//! The obvious thing — hand over RGBA — costs 256 × 240 × 4 = 245,760 bytes a
//! frame, which is 14 MB/s across the bridge to the web view. But the PPU does
//! not think in RGB. Every pixel it emits is one of sixty-four palette entries
//! under one of eight emphasis settings, so its whole colour identity fits in
//! nine bits, and the front end can hold the palette and expand it on the GPU.
//!
//! Those nine bits split unevenly on purpose: the six-bit palette entry
//! changes every pixel, while emphasis comes from `$2001` and in practice
//! changes at most once a scanline. So a frame is one byte per pixel plus a
//! byte per line — 61,688 bytes, four times smaller, and the difference is
//! carried by a shader rather than by the bridge.
//!
//! ## The wire format
//!
//! ```text
//! 0      version, currently 1
//! 1      emphasis mode: 0 uniform, 1 per scanline
//! 2      the emphasis value, when mode is 0
//! 3      reserved, zero
//! 4..8   frame sequence number, u32 little-endian
//! 8..    when mode is 1, one emphasis byte per scanline (240)
//! then   one palette entry per pixel (61,440), row major
//! ```

use octet_emu::{FRAME_HEIGHT, FRAME_WIDTH};

/// Bumped if the layout above ever changes, so a stale front end says so
/// rather than drawing nonsense.
const VERSION: u8 = 1;

const HEADER: usize = 8;
const PIXELS: usize = FRAME_WIDTH * FRAME_HEIGHT;

/// A frame, encoded, and what it cost to notice.
pub struct Encoded {
    pub bytes: Vec<u8>,
    /// How many scanlines carried more than one emphasis value.
    ///
    /// Per-scanline emphasis is an assumption, not a guarantee: `$2001` is
    /// writable at any dot. Games change it during blanking because changing
    /// it mid-line tears, but rather than trust that, every line is checked
    /// and the exceptions are counted. A non-zero total here is the signal to
    /// widen the format, and until it appears the format stays cheap.
    pub torn_lines: u32,
}

/// Packs one frame of colour identities.
pub fn encode(ids: &[u16; PIXELS], sequence: u32) -> Encoded {
    // The emphasis each line begins with, and whether it holds for the line.
    let mut per_line = [0u8; FRAME_HEIGHT];
    let mut torn_lines = 0;
    for (y, line) in per_line.iter_mut().enumerate() {
        let row = &ids[y * FRAME_WIDTH..(y + 1) * FRAME_WIDTH];
        let first = emphasis_of(row[0]);
        *line = first;
        if row.iter().any(|id| emphasis_of(*id) != first) {
            torn_lines += 1;
        }
    }

    let uniform = per_line.iter().all(|e| *e == per_line[0]);
    let mut bytes = Vec::with_capacity(HEADER + FRAME_HEIGHT + PIXELS);

    bytes.push(VERSION);
    bytes.push(if uniform { 0 } else { 1 });
    bytes.push(if uniform { per_line[0] } else { 0 });
    bytes.push(0);
    bytes.extend_from_slice(&sequence.to_le_bytes());
    if !uniform {
        bytes.extend_from_slice(&per_line);
    }
    bytes.extend(ids.iter().map(|id| (*id & 0x3f) as u8));

    Encoded { bytes, torn_lines }
}

/// The three `$2001` emphasis bits an identity carries, in its bits 6-8.
const fn emphasis_of(id: u16) -> u8 {
    ((id >> 6) & 7) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(f: impl Fn(usize, usize) -> u16) -> Box<[u16; PIXELS]> {
        let mut out = Box::new([0u16; PIXELS]);
        for y in 0..FRAME_HEIGHT {
            for x in 0..FRAME_WIDTH {
                out[y * FRAME_WIDTH + x] = f(x, y);
            }
        }
        out
    }

    #[test]
    fn a_flat_frame_needs_no_emphasis_plane() {
        // Palette entry 5 under emphasis 3, everywhere.
        let frame = ids(|_, _| 5 | (3 << 6));
        let out = encode(&frame, 7);

        assert_eq!(out.bytes[0], VERSION);
        assert_eq!(out.bytes[1], 0, "uniform, so no per-line plane");
        assert_eq!(out.bytes[2], 3, "the emphasis it is uniform at");
        assert_eq!(u32::from_le_bytes(out.bytes[4..8].try_into().unwrap()), 7);
        assert_eq!(out.bytes.len(), HEADER + PIXELS);
        assert_eq!(out.torn_lines, 0);
        // Every pixel is the six-bit entry, emphasis stripped out of it.
        assert!(out.bytes[HEADER..].iter().all(|b| *b == 5));
    }

    #[test]
    fn emphasis_that_changes_down_the_screen_rides_per_line() {
        let frame = ids(|_, y| 9 | (((y % 8) as u16) << 6));
        let out = encode(&frame, 0);

        assert_eq!(out.bytes[1], 1, "not uniform, so the plane is present");
        assert_eq!(out.bytes.len(), HEADER + FRAME_HEIGHT + PIXELS);
        for y in 0..FRAME_HEIGHT {
            assert_eq!(out.bytes[HEADER + y], (y % 8) as u8, "line {y}");
        }
        assert_eq!(out.torn_lines, 0, "each line is uniform within itself");
        assert!(out.bytes[HEADER + FRAME_HEIGHT..].iter().all(|b| *b == 9));
    }

    #[test]
    fn emphasis_that_changes_mid_line_is_counted_rather_than_hidden() {
        // Two lines tear; the rest hold. The encoder keeps the value each
        // line opened with and reports how often that was a simplification.
        let frame = ids(|x, y| {
            let emphasis = if (y == 4 || y == 100) && x > 128 { 5 } else { 1 };
            2 | (emphasis << 6)
        });
        let out = encode(&frame, 0);
        assert_eq!(out.torn_lines, 2, "both torn lines noticed");
        assert_eq!(out.bytes[1], 0, "still uniform by line-opening value");
    }

    #[test]
    fn a_frame_is_a_quarter_the_size_of_rgba() {
        let frame = ids(|x, y| ((x ^ y) & 0x3f) as u16);
        let rgba = PIXELS * 4;
        let out = encode(&frame, 1);
        assert!(
            out.bytes.len() * 4 <= rgba + 4096,
            "{} bytes against RGBA's {rgba}",
            out.bytes.len()
        );
    }
}
