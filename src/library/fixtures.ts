import type { LibraryView } from "./api";

/**
 * The library the design was drawn against, as a stand-in backend.
 *
 * Used only when there is no Rust side to ask — a plain browser, or the design
 * diff in `tools/`. Under the shell this is never touched; the real library
 * comes from a folder scan.
 *
 * The numbers are chosen so the formatters in `format.ts` reproduce the exact
 * strings the design shows. Times are offsets from now rather than fixed
 * dates, so `TODAY` stays today and the pixel diff does not rot overnight.
 */

const DAY = 86_400_000;
const ago = (days: number) => Date.now() - days * DAY;

/** `[title, mapper, KB, minutes played, days since played, favourite]` */
type Row = [string, string, number, number, number, boolean];

const ROWS: Row[] = [
  ["ASTRO VOLE", "NROM", 40, 161, 2, true],
  ["BLOCK WARDEN", "MMC1", 128, 662, 1, true],
  ["CINDER KNIGHT", "MMC3", 256, 38, 7, false],
  ["DELTA RUNNER", "CNROM", 64, 257, 3, false],
  ["ECHO CAVERNS", "MMC3", 256, 1195, 0, true],
  ["FROST HAULER", "UNROM", 128, 68, 14, false],
  ["GRAVITY PICNIC", "NROM", 32, 22, 5, false],
  ["HELIX TOWER", "MMC5", 512, 450, 0, true],
  ["IRON LULLABY", "AOROM", 128, 192, 4, false],
  ["JADE CIRCUIT", "MMC1", 128, 55, 30, false],
];

/** Lands on `1.4 MB` once `onDisk` has rounded it, as the design's footer reads. */
const TOTAL_BYTES = 1_468_006;

/**
 * The rate the stand-in console reports.
 *
 * With no Rust side there is no emulator to measure, and the play view would
 * read `0 FPS` — but the fallback's job is to stand in for a running console
 * the way the cartridges above stand in for a library. The design says 60.
 */
export const FALLBACK_FPS = 60;

export const FALLBACK: LibraryView = {
  folders: [
    { path: "~/ROMS/NES", label: "~/ROMS/NES", enabled: true, count: 7, readable: true },
    {
      path: "~/ROMS/UNSORTED",
      label: "~/ROMS/UNSORTED",
      enabled: true,
      count: 3,
      readable: true,
    },
    {
      path: "EXTERNAL / SDCARD",
      label: "EXTERNAL / SDCARD",
      enabled: false,
      count: 0,
      readable: true,
    },
  ],
  roms: ROWS.map(([title, mapper, sizeKb, playMinutes, days, favorite]) => ({
    path: `~/ROMS/NES/${title}.nes`,
    title,
    mapper,
    sizeKb,
    supported: true,
    hasArt: false,
    favorite,
    playMinutes,
    lastPlayedAt: ago(days),
  })),
  totalBytes: TOTAL_BYTES,
};
