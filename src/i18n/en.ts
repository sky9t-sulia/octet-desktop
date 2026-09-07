/**
 * Every word the app says, in the language it was written in.
 *
 * This is the source: a key is only real if it is here, and the other
 * languages are `Partial` maps over it, so a string nobody has translated yet
 * falls back to English rather than to a key name on screen.
 *
 * The wording is the design's, down to the capitals — the whole interface is
 * set in pixel faces that have no lower case worth reading at these sizes.
 * `{name}` is a hole something is put in; see `format` in `./index.ts`.
 */
export const EN = {
  // ── The rail and the top bar ──
  nav_library: "LIBRARY",
  nav_folders: "FOLDERS",
  nav_settings: "SETTINGS",
  search_hint: "SEARCH",

  // ── The library ──
  tab_all: "ALL ROMS",
  tab_favorites: "FAVORITES",
  tab_recent: "RECENT",
  sort_name: "NAME",
  sort_recent: "RECENT",
  sort_playtime: "PLAYTIME",
  count_title: "{n} TITLE",
  count_titles: "{n} TITLES",
  disk_line: "{n} ROMS / {size} ON DISK",
  status_line: "{n} ROMS / {favorites} FAVORITES / NES-NTSC",
  hint_play: "PLAY",
  hint_favorite: "FAVORITE",
  hint_search: "SEARCH",
  empty_found: "NO CARTRIDGES FOUND",
  empty_found_sub: "THE FOLDERS BEING SCANNED HOLD NO .NES FILES",
  empty_none: "NO ROM FOLDER YET",
  empty_none_sub: "POINT OCTET AT A FOLDER OF .NES FILES TO BEGIN",
  add_folder: "ADD FOLDER",
  library_error: "COULD NOT READ THE LIBRARY",
  col_title: "TITLE",
  col_mapper: "MAPPER / SIZE",
  col_played: "LAST PLAYED",
  col_playtime: "PLAYTIME",
  no_capture: "NO CAPTURE",
  played: "{time} PLAYED",

  // ── How long ago, and how long for ──
  when_never: "NEVER",
  when_today: "TODAY",
  when_yesterday: "YESTERDAY",
  when_days: "{n} DAYS AGO",
  when_week: "1 WEEK AGO",
  when_weeks: "{n} WEEKS AGO",
  when_month: "1 MONTH AGO",
  when_months: "{n} MONTHS AGO",
  span_hours: "{h}H {m}M",
  span_minutes: "{m}M",

  // ── Folders ──
  rom_one: "ROM",
  rom_many: "ROMS",
  folder_missing: "FOLDER MISSING",
  folder_skipped: "{roms} / SKIPPED",
  folders_scanned: "{on} OF {all} SCANNED",

  // ── The cartridge, running ──
  play_output: "EMULATOR OUTPUT",
  play_failed: "COULD NOT START",
  play_menu_hint: "{key} — MENU",
  play_status: "{fps} FPS / SLOT {slot}",
  fps_readout: "{fps} FPS",
  paused: "PAUSED",

  // ── The pause menu ──
  menu_resume: "RESUME",
  menu_save_state: "SAVE STATE",
  menu_load_state: "LOAD STATE",
  menu_settings: "SETTINGS",
  menu_reset: "RESET GAME",
  menu_close: "CLOSE CARTRIDGE",

  // ── The save slots ──
  saves_title: "SAVE STATES",
  slot_empty: "EMPTY",
  slot_nothing: "NOTHING HERE",
  slot_empty_shot: "EMPTY SLOT",
  slot_pick_write: "SELECT A SLOT TO WRITE",
  slot_pick_read: "SELECT A SLOT",
  slot_selected: "SLOT {n} SELECTED",
  slot_save: "SAVE SLOT {n}",
  slot_load: "LOAD SLOT {n}",
  slot_save_none: "SAVE SLOT",
  slot_load_none: "LOAD SLOT",
  cancel: "CANCEL",
  close_ask: "Close the cartridge? Anything unsaved is lost.",
  close_ask_ok: "Close",
  close_ask_no: "Keep playing",

  // ── Settings, and its categories ──
  settings_title: "SETTINGS",
  settings_version: "OCTET / V{version}",
  settings_status: "CHANGES APPLY IMMEDIATELY",
  done: "DONE",
  browse: "BROWSE",
  cat_general: "GENERAL",
  cat_video: "VIDEO",
  cat_audio: "AUDIO",
  cat_controls: "CONTROLS",
  cat_paths: "PATHS",
  cat_shortcuts: "SHORTCUTS",

  // ── GENERAL ──
  language: "LANGUAGE",
  language_system: "SYSTEM DEFAULT",
  theme: "THEME",
  theme_light: "LIGHT",
  theme_dark: "DARK",
  theme_auto: "AUTO",
  toggle_on: "ON",
  toggle_off: "OFF",
  pause_background: "PAUSE IN BACKGROUND",
  pause_background_sub: "STOP THE GAME WHEN THE WINDOW LOSES FOCUS",
  confirm_close: "CONFIRM ON CLOSE",
  confirm_close_sub: "ASK BEFORE QUITTING MID-GAME",

  // ── VIDEO ──
  scaling: "SCALING",
  scale_pixel: "PIXEL 1:1",
  scale_fill: "FILL",
  filter: "FILTER",
  filter_sharp: "SHARP",
  filter_smooth: "SMOOTH",
  filter_crt: "CRT",
  preview: "PREVIEW",
  scanlines: "SCANLINES",
  scanlines_sub: "CRT LINE OVERLAY",
  fps_counter: "FPS COUNTER",
  fps_counter_sub: "SHOW IN CORNER",
  start_fullscreen: "START FULLSCREEN",
  start_fullscreen_sub: "LAUNCH ROMS FULLSCREEN",

  // ── AUDIO ──
  volume: "VOLUME",
  fast_forward_audio: "AUDIO ON FAST-FORWARD",
  fast_forward_audio_sub: "KEEP SOUND WHILE HOLDING TAB",

  // ── CONTROLS ──
  keyboard: "KEYBOARD",
  gamepad: "GAMEPAD",
  gamepad_absent: "NO CONTROLLER — PRESS A BUTTON ON ONE",
  press_a_key: "PRESS A KEY",
  restore_defaults: "RESTORE DEFAULTS",
  button_up: "UP",
  button_down: "DOWN",
  button_left: "LEFT",
  button_right: "RIGHT",
  button_a: "A",
  button_b: "B",
  button_select: "SELECT",
  button_start: "START",
  button_menu: "MENU",

  // ── PATHS ──
  rom_folders: "ROM FOLDERS",
  directories: "DIRECTORIES",
  path_states: "SAVE STATES",
  path_shots: "SCREENSHOTS",
  auto_screenshot: "AUTO SCREENSHOT",
  auto_screenshot_sub: "CAPTURE FRAME 300 FOR LIBRARY ART",
  watch_folders: "WATCH FOLDERS",
  watch_folders_sub: "RESCAN ON FILE CHANGE",

  // ── SHORTCUTS ──
  where_anywhere: "ANYWHERE",
  where_library: "LIBRARY",
  where_playing: "PLAYING",
  does_settings: "SETTINGS",
  does_back: "BACK OUT OF WHATEVER IS OPEN",
  does_search: "FOCUS SEARCH",
  does_play: "PLAY SELECTED",
  does_favorite: "FAVORITE SELECTED",
  does_menu: "PAUSE MENU",
  does_save_state: "SAVE STATE",
  does_load_state: "LOAD STATE",
  does_reset: "RESET GAME",
  does_close: "CLOSE CARTRIDGE",
} as const;

/** Anything the app can say. */
export type Key = keyof typeof EN;

/** A language other than the one this is written in. */
export type Dict = Partial<Record<Key, string>>;
