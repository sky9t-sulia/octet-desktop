/**
 * The type scale, named once.
 *
 * The design sets type with a `font` shorthand at every call site, in two
 * faces and eight sizes. Those combinations are listed here so a component can
 * name the one it wants instead of spelling out a font stack — and so the set
 * of sizes in use is visible in one place rather than inferred from a grep.
 *
 * `pixel` is Press Start 2P, the interface face. `screen` is Silkscreen, used
 * for data, counts and small caps, where it is narrower and reads smaller.
 */
export const t = {
  /** Keycaps in the status bar, and a folder checkbox's tick. */
  pixel8: "font-pixel text-[8px]",
  /** Buttons, badges, segment labels. */
  pixel9: "font-pixel text-[9px]",
  /** Row and menu labels — the workhorse. */
  pixel10: "font-pixel text-[10px]",
  /** Window glyphs, and a modal's cartridge name. */
  pixel11: "font-pixel text-[11px]",
  /** Pane headlines and modal titles. */
  pixel12: "font-pixel text-[12px]",
  /** The wordmark. */
  pixel15: "font-pixel text-[15px]",
  /** A card's initials over its artwork. */
  pixel22: "font-pixel text-[22px]",
  /** The running cartridge's title. */
  pixel26: "font-pixel text-[26px]",

  /** Table headers and small caps group labels. */
  screen10: "font-screen text-[10px]",
  /** Counts, timestamps, secondary lines — the workhorse. */
  screen11: "font-screen text-[11px]",
  /** A headline's subtitle, and a modal title's second half. */
  screen12: "font-screen text-[12px]",
  /** "EMULATOR OUTPUT", under the running title. */
  screen13: "font-screen text-[13px]",
} as const;

/**
 * The small caps label that sits over a group of controls, without its
 * colour — for the few that grey out with the controls they head.
 */
export const CAPS_BARE = `${t.screen10} tracking-caps`;

/** The same label as it usually appears. */
export const CAPS = `${CAPS_BARE} text-dim`;

/** Joins class names, dropping anything falsy. */
export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");
