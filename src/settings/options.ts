/**
 * The fixed choices the settings and library screens offer.
 *
 * Not library data and not stored state — just the option lists the design
 * spells out, kept here so the screens themselves stay presentation.
 *
 * These hold keys rather than words: what a choice is called depends on the
 * language, and that lives in `src/i18n`. The language list itself lives
 * there too, since it is the one list that cannot be translated.
 */

import type { Key } from "../i18n";

export const SORTS: Key[] = ["sort_name", "sort_recent", "sort_playtime"];

export const CATS: Key[] = [
  "cat_general",
  "cat_video",
  "cat_audio",
  "cat_controls",
  "cat_paths",
  "cat_shortcuts",
];

export const THEMES: Key[] = ["theme_light", "theme_dark", "theme_auto"];
export const SCALES: Key[] = ["scale_pixel", "scale_fill"];
export const FILTERS: Key[] = ["filter_sharp", "filter_smooth", "filter_crt"];

/** The three tabs of the library, in the order the rail lists them. */
export const TABS: Key[] = ["tab_all", "tab_favorites", "tab_recent"];

/** Where save states and screenshots are written. Not yet configurable. */
export const PATHS: [Key, string][] = [
  ["path_states", "~/LIBRARY/OCTET/STATES"],
  ["path_shots", "~/PICTURES/OCTET"],
];

/**
 * The pause menu, and the accelerator each entry answers to.
 *
 * RESUME's is `null` because it is not fixed: it answers to whatever the
 * player has bound MENU to, and the shell fills in that key's own name.
 */
export const MENU: [Key, string | null][] = [
  ["menu_resume", null],
  ["menu_save_state", "F5"],
  ["menu_load_state", "F6"],
  ["menu_settings", "CTRL+S"],
  ["menu_reset", "R"],
  ["menu_close", "CTRL+W"],
];

/**
 * Every shortcut the app answers to, grouped by where it applies.
 *
 * Shortcuts only — the pad is not here. Which key works which console button
 * is a binding rather than a shortcut, it is rebindable, and it lives in the
 * CONTROLS pane with the rest of the input mapping.
 */
export const SHORTCUTS: [Key, [string, Key][]][] = [
  [
    "where_anywhere",
    [
      ["CTRL+S", "does_settings"],
      ["ESC", "does_back"],
    ],
  ],
  [
    "where_library",
    [
      ["/", "does_search"],
      ["ENTER", "does_play"],
      ["F", "does_favorite"],
    ],
  ],
  [
    "where_playing",
    [
      ["ESC", "does_menu"],
      ["F5", "does_save_state"],
      ["F6", "does_load_state"],
      ["R", "does_reset"],
      ["CTRL+W", "does_close"],
    ],
  ],
];

/**
 * Cartridge tints, as class names. The colours themselves live with every
 * other colour, in the `@theme` block of `src/index.css`.
 */
export const TINT_BG = [
  "bg-tint-red",
  "bg-tint-blue",
  "bg-tint-green",
  "bg-tint-amber",
  "bg-tint-violet",
  "bg-tint-slate",
];

/**
 * A cartridge's tint, from its title — stable across runs, and spread across
 * the six so a shelf of them does not come out one colour.
 */
export const tintFor = (title: string) =>
  TINT_BG[(title.charCodeAt(0) + title.length) % TINT_BG.length];

/** A cartridge's initials, for the corner of its capture slot. */
export const initialsFor = (title: string) =>
  title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
