/**
 * The pad: which key, and which key on a controller, works which button.
 *
 * The bit order is the order a real pad clocks its buttons out, which is what
 * the core expects and what the Android front end already uses — so a map
 * means the same thing on both.
 *
 * Bindings are the player's, so they are kept in the browser's own storage
 * rather than the library file: they belong to this machine's keyboard and
 * this machine's controller, not to the cartridges.
 */

import type { Key } from "../i18n";

export const BUTTON = {
  a: 1 << 0,
  b: 1 << 1,
  select: 1 << 2,
  start: 1 << 3,
  up: 1 << 4,
  down: 1 << 5,
  left: 1 << 6,
  right: 1 << 7,
} as const;

/**
 * Everything a key may be pointed at: the console's eight buttons, and the
 * app's own way into the pause menu.
 */
export type Action =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "select"
  | "start"
  | "menu";

/** The actions in the order the settings pane lists them. */
export const ACTIONS: { id: Action; label: Key }[] = [
  { id: "up", label: "button_up" },
  { id: "down", label: "button_down" },
  { id: "left", label: "button_left" },
  { id: "right", label: "button_right" },
  { id: "b", label: "button_b" },
  { id: "a", label: "button_a" },
  { id: "select", label: "button_select" },
  { id: "start", label: "button_start" },
  { id: "menu", label: "button_menu" },
];

/**
 * The console bit an action works. MENU has none — it is the app's key, not
 * the console's, and the cartridge never sees it.
 */
export const BIT: Record<Action, number> = {
  up: BUTTON.up,
  down: BUTTON.down,
  left: BUTTON.left,
  right: BUTTON.right,
  a: BUTTON.a,
  b: BUTTON.b,
  select: BUTTON.select,
  start: BUTTON.start,
  menu: 0,
};

/** A key per action, by `KeyboardEvent.code`. */
export type Keymap = Record<Action, string>;

/** A controller button per action, by its index in the standard layout. */
export type Padmap = Record<Action, number>;

export type Bindings = { keys: Keymap; pad: Padmap };

/**
 * The keyboard as it comes.
 *
 * Z and X for B and A, in that order: they sit left-to-right under the hand
 * the way the console's own two buttons do. Keyed by `code` so a binding
 * follows the physical key rather than the layout — Z is where Z is on a
 * QWERTY board whatever the software layout says.
 */
export const KEY_DEFAULTS: Keymap = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  b: "KeyZ",
  a: "KeyX",
  select: "ShiftRight",
  start: "Enter",
  menu: "Escape",
};

/**
 * A controller as it comes, in the indices of the standard layout: the two
 * bottom face buttons for B and A, the left shoulder for the menu, BACK and
 * START where they are written on the thing, and the hat for the D-pad.
 */
export const PAD_DEFAULTS: Padmap = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  b: 1,
  a: 0,
  select: 8,
  start: 9,
  menu: 4,
};

/**
 * What may be moved on a controller.
 *
 * Only these three, as on the phone: a controller's D-pad, BACK and START are
 * where the maker put them and the labels agree with the console's own, so
 * there is nothing to decide. The face buttons and the menu key are the parts
 * players actually disagree about.
 */
export const PAD_REBINDABLE: Action[] = ["b", "a", "menu"];

/**
 * The controller buttons a binding may point at: face, shoulders and thumbs.
 * Not BACK or START, which the fixed half of the map holds, and not the hat.
 */
const PAD_BINDABLE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 10, 11]);

export const isPadButtonBindable = (index: number) => PAD_BINDABLE.has(index);

/** What a controller's button is called on the face of it, rather than by number. */
const PAD_NAMES: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "L1",
  5: "R1",
  6: "L2",
  7: "R2",
  8: "BACK",
  9: "START",
  10: "L3",
  11: "R3",
  12: "UP",
  13: "DOWN",
  14: "LEFT",
  15: "RIGHT",
  16: "HOME",
};

export const padLabel = (index: number) => PAD_NAMES[index] ?? `B${index}`;

/** The keys whose `code` says nothing a player would recognise. */
const KEY_NAMES: Record<string, string> = {
  Escape: "ESC",
  Enter: "ENTER",
  NumpadEnter: "NUM ENTER",
  Space: "SPACE",
  Tab: "TAB",
  Backspace: "BACKSPACE",
  Delete: "DEL",
  Insert: "INS",
  Home: "HOME",
  End: "END",
  PageUp: "PGUP",
  PageDown: "PGDN",
  CapsLock: "CAPS",
  ShiftLeft: "L SHIFT",
  ShiftRight: "R SHIFT",
  ControlLeft: "L CTRL",
  ControlRight: "R CTRL",
  AltLeft: "L ALT",
  AltRight: "R ALT",
  MetaLeft: "L META",
  MetaRight: "R META",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Slash: "/",
  IntlBackslash: "\\",
};

/** What a key is called on its own face. */
export function keyLabel(code: string): string {
  if (code in KEY_NAMES) return KEY_NAMES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5).toUpperCase();
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6).toUpperCase()}`;
  return code.toUpperCase();
}

/**
 * Points one action at one key. Where another action held it, the two trade,
 * so a binding never leaves a button with nothing on it.
 */
export function bind<T extends string | number>(
  map: Record<Action, T>,
  action: Action,
  value: T,
): Record<Action, T> {
  const held = (Object.keys(map) as Action[]).find(
    (id) => id !== action && map[id] === value,
  );
  const next = { ...map, [action]: value };
  if (held) next[held] = map[action];
  return next;
}

/** Which action a key works, if any. */
export function actionForKey(keys: Keymap, code: string): Action | null {
  return (Object.keys(keys) as Action[]).find((id) => keys[id] === code) ?? null;
}

/** Opposite directions cannot be held at once; a real stick cannot do it. */
export function settle(bits: number): number {
  let out = bits;
  if ((out & BUTTON.up) !== 0 && (out & BUTTON.down) !== 0) {
    out &= ~(BUTTON.up | BUTTON.down);
  }
  if ((out & BUTTON.left) !== 0 && (out & BUTTON.right) !== 0) {
    out &= ~(BUTTON.left | BUTTON.right);
  }
  return out;
}

export const DEFAULTS: Bindings = { keys: KEY_DEFAULTS, pad: PAD_DEFAULTS };

const STORED = "octet.bindings";

/**
 * The bindings as last left, or the defaults.
 *
 * Merged over the defaults rather than trusted whole: a stored map written by
 * an older version may be missing an action the app has since grown, and a
 * missing binding is a button that cannot be pressed.
 */
export function loadBindings(): Bindings {
  try {
    const raw = window.localStorage.getItem(STORED);
    if (!raw) return DEFAULTS;
    const got = JSON.parse(raw) as Partial<Bindings>;
    return {
      keys: { ...KEY_DEFAULTS, ...(got.keys ?? {}) },
      pad: { ...PAD_DEFAULTS, ...(got.pad ?? {}) },
    };
  } catch {
    // No storage, or nonsense in it. The defaults work.
    return DEFAULTS;
  }
}

export function saveBindings(bindings: Bindings): void {
  try {
    window.localStorage.setItem(STORED, JSON.stringify(bindings));
  } catch {
    // A session without storage keeps its bindings until it closes.
  }
}
