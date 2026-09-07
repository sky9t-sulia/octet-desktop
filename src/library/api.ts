import { invoke } from "@tauri-apps/api/core";
import { FALLBACK } from "./fixtures";

/**
 * The library, as the Rust side reports it.
 *
 * Every call returns the whole view rather than a delta: a scan of a few
 * hundred iNES headers is cheap, and a library recomputed from the filesystem
 * cannot drift out of step with it.
 */

export type Rom = {
  /** Whether library art has been kept for this cartridge yet. */
  hasArt: boolean;
  /** Absolute path, and the identity a favourite or a playtime is keyed by. */
  path: string;
  title: string;
  /** `NROM`, `MMC3`, or `MAPPER 249` where the number has no common name. */
  mapper: string;
  sizeKb: number;
  /** Whether the core will play this mapper rather than refuse it. */
  supported: boolean;
  favorite: boolean;
  playMinutes: number;
  /** Milliseconds since the epoch, or null if never played. */
  lastPlayedAt: number | null;
};

export type Folder = {
  path: string;
  /** The path as somebody would write it down: `~/ROMS/NES`. */
  label: string;
  enabled: boolean;
  count: number;
  /** False for a folder that did not answer — an absent drive, a deleted path. */
  readable: boolean;
};

/** One save slot, as the Rust side reports it. */
export type SlotView = {
  slot: number;
  used: boolean;
  /** Milliseconds since the epoch, or null for an empty slot. */
  savedAt: number | null;
  playMinutes: number;
  hasShot: boolean;
  /** The slot written on the way out rather than by hand. */
};

export type LibraryView = {
  folders: Folder[];
  roms: Rom[];
  totalBytes: number;
};

/**
 * Whether a Tauri backend is behind us.
 *
 * Opened in a plain browser — `npm run dev` on its own, or the design diff in
 * `tools/` — there is none, and every call below falls back to the ten
 * cartridges the design was drawn against. That keeps the interface working
 * away from the shell, and keeps the pixel diff comparing like with like.
 */
export const hasBackend = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** State the fallback has to keep, since there is no backend holding it. */
let fallback: LibraryView = FALLBACK;

/**
 * Blob URLs for art already fetched, and `null` for cartridges that have none.
 *
 * Never revoked: one small PNG per cartridge in the library, held for as long
 * as the window is open, is cheaper than re-reading them on every re-render.
 */
const artUrls = new Map<string, string | null>();

async function call(cmd: string, args?: Record<string, unknown>): Promise<LibraryView> {
  if (!hasBackend()) return fallback;
  return invoke<LibraryView>(cmd, args);
}

export const api = {
  library: () => call("library"),

  addFolder: (path: string) => call("add_folder", { path }),

  removeFolder: (path: string) => call("remove_folder", { path }),

  setFolderEnabled: (path: string, enabled: boolean) =>
    call("set_folder_enabled", { path, enabled }),

  setFavorite: (path: string, favorite: boolean) => {
    if (!hasBackend()) {
      // Answered locally so the interface still responds off the shell.
      fallback = {
        ...fallback,
        roms: fallback.roms.map((r) => (r.path === path ? { ...r, favorite } : r)),
      };
      return Promise.resolve(fallback);
    }
    return call("set_favorite", { path, favorite });
  },

  /** Every slot for the cartridge currently running. */
  slots: () => (hasBackend() ? invoke<SlotView[]>("slots") : Promise.resolve([])),

  /** Freezes the machine into a slot. Hands back the slots as they now are. */
  saveState: (slot: number) =>
    hasBackend() ? invoke<SlotView[]>("save_state", { slot }) : Promise.resolve([]),

  /** Puts a slot back into the running machine. */
  loadState: (slot: number) =>
    hasBackend() ? invoke<void>("load_state", { slot }) : Promise.resolve(),

  /**
   * One slot's picture, as a URL the page can use.
   *
   * Not cached the way library art is: a slot's picture changes every time
   * the slot is written.
   */
  async shot(slot: number): Promise<string | null> {
    if (!hasBackend()) return null;
    try {
      const bytes = await invoke<ArrayBuffer>("slot_shot", { slot });
      const view = new Uint8Array(bytes);
      if (view.length === 0) return null;
      return URL.createObjectURL(new Blob([view], { type: "image/png" }));
    } catch {
      return null;
    }
  },

  /**
   * One cartridge's library art, as a URL the page can use.
   *
   * Cached per path: the bytes never change once written — art is kept the
   * first time a cartridge is played and then left alone — so a card that
   * re-renders should not fetch it again.
   */
  async art(path: string): Promise<string | null> {
    if (!hasBackend()) return null;
    const held = artUrls.get(path);
    if (held !== undefined) return held;
    try {
      const bytes = await invoke<ArrayBuffer>("art", { path });
      const view = new Uint8Array(bytes);
      if (view.length === 0) {
        artUrls.set(path, null);
        return null;
      }
      const url = URL.createObjectURL(new Blob([view], { type: "image/png" }));
      artUrls.set(path, url);
      return url;
    } catch {
      artUrls.set(path, null);
      return null;
    }
  },

  /**
   * The native folder picker.
   *
   * The dialog plugin's own, called straight from here: routing it through a
   * Rust command would add a hop and tell us nothing new. `null` when the
   * player cancels, or when there is no shell to ask.
   */
  async pickFolder(): Promise<string | null> {
    if (!hasBackend()) return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, multiple: false });
    return typeof picked === "string" ? picked : null;
  },
};
