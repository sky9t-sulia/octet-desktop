import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConsole } from "../play/useConsole";
import { useGamepadCapture, useGamepadPresent } from "../play/gamepad";
import {
  ACTIONS,
  actionForKey,
  bind,
  DEFAULTS,
  keyLabel,
  loadBindings,
  PAD_REBINDABLE,
  padLabel,
  saveBindings,
  type Action,
  type Bindings,
} from "../play/pad";
import { knobs, type Look } from "../play/screen";
import { setWindowGround } from "../shell/window";
import { invoke } from "@tauri-apps/api/core";
import { api, hasBackend, type LibraryView, type Rom, type SlotView } from "../library/api";
import { FALLBACK_FPS } from "../library/fixtures";
import {
  folderDetail,
  mapperAndSize,
  onDisk,
  playtime,
  savedAt,
  whenPlayed,
} from "../library/format";
import { LANGS, useLanguage, type Key } from "../i18n";
import {
  CATS,
  FILTERS,
  initialsFor,
  MENU,
  PATHS,
  SCALES,
  SHORTCUTS,
  SORTS,
  TABS,
  THEMES,
  tintFor,
} from "../settings/options";

/**
 * The two grounds, the only colours outside `index.css` — because the window
 * behind the page is the platform's, not the stylesheet's. They are
 * `--color-paper` in each theme, and have to agree with it.
 */
const LIGHT_GROUND = "#e3e1d4";
const DARK_GROUND = "#17181a";

/**
 * Everything the shell remembers, and everything it derives.
 *
 * The library itself is not in here — it belongs to the Rust side and arrives
 * whole from `api`. What this holds is what the *window* is doing: which tab,
 * which sort, what is selected, which overlay is up, and every setting.
 *
 * Where a style depends on state, this returns the class name and never a
 * colour: every colour in the app is a token in `src/index.css`.
 */

export type Shell = {
  query: string;
  tab: number;
  sort: number;
  /** The selected cartridge, by path — stable when the library is rescanned. */
  selPath: string | null;
  playing: boolean;
  pause: boolean;
  saves: boolean;
  /** Whether the browser was opened to write a slot or to read one. */
  savesMode: "save" | "load";
  slot: number | null;
  view: "grid" | "list";
  settings: boolean;
  cat: number;
  langOpen: boolean;
  theme: number;
  vol: number;
  scale: number;
  filter: number;
  confirmClose: boolean;
  scanlines: boolean;
  fps: boolean;
  fullscreen: boolean;
  pauseUnfocused: boolean;
  fastForward: boolean;
  autoShot: boolean;
  watchFolders: boolean;
};

const INITIAL: Shell = {
  query: "",
  tab: 0,
  sort: 0,
  selPath: null,
  playing: false,
  pause: false,
  saves: false,
  savesMode: "load",
  slot: null,
  view: "grid",
  settings: false,
  cat: 0,
  langOpen: false,
  theme: 0,
  vol: 8,
  scale: 0,
  filter: 0,
  confirmClose: false,
  scanlines: true,
  fps: false,
  fullscreen: false,
  pauseUnfocused: true,
  fastForward: false,
  autoShot: true,
  watchFolders: true,
};

/** How many cartridges the RECENT tab shows. */
const RECENT_COUNT = 6;

export function useShell() {
  const [st, setSt] = useState<Shell>(INITIAL);
  const [lib, setLib] = useState<LibraryView | null>(null);
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Whether the window has focus, for MUTE WHEN UNFOCUSED. */
  const [focused, setFocused] = useState(true);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { lang, say, choose: chooseLang } = useLanguage();

  const patch = useCallback(
    (next: Partial<Shell> | ((prev: Shell) => Partial<Shell>)) =>
      setSt((prev) => ({ ...prev, ...(typeof next === "function" ? next(prev) : next) })),
    [],
  );

  // What the picture should look like, from the VIDEO pane.
  //
  // The filter and scanline settings become the two numbers the tube shader
  // takes, by the same rule `Play.Knobs` applies on Android — so SHARP,
  // SMOOTH and CRT mean there what they mean here.
  const look: Look = useMemo(
    () => ({
      scale: st.scale === 0 ? "pixel" : "fill",
      ...knobs((["sharp", "smooth", "crt"] as const)[st.filter] ?? "sharp", st.scanlines),
    }),
    [st.filter, st.scanlines, st.scale],
  );

  // ── Input mapping ──
  //
  // The player's, and the browser's storage keeps them: they belong to this
  // keyboard and this controller rather than to the library.
  const [bindings, setBindings] = useState<Bindings>(loadBindings);
  /** Which row of the CONTROLS pane is waiting for a key, if any. */
  const [listening, setListening] = useState<{
    on: "keys" | "pad";
    action: Action;
  } | null>(null);

  const keep = useCallback((next: Bindings) => {
    setBindings(next);
    saveBindings(next);
  }, []);

  /** The controller's menu button: in and out of the pause menu, like Escape. */
  const toggleMenu = useCallback(
    () => patch((prev) => (prev.playing ? { pause: !prev.pause } : {})),
    [patch],
  );

  const console_ = useConsole(look, bindings, toggleMenu);

  /** Whether a controller is on hand. The GAMEPAD rows are dead without one. */
  const padPresent = useGamepadPresent();

  // A row cannot go on listening for a controller that has been unplugged.
  useEffect(() => {
    if (!padPresent) setListening((was) => (was?.on === "pad" ? null : was));
  }, [padPresent]);

  // One key, for whichever row is listening. Escape gets out of it, which is
  // why Escape cannot be bound this way — it is already MENU's default.
  useEffect(() => {
    if (listening?.on !== "keys") return;
    const grab = (e: KeyboardEvent) => {
      e.preventDefault();
      // Taken on the way down and stopped here, so the key being bound does
      // not also reach the pad and press the button it is about to become.
      e.stopPropagation();
      if (e.code === "Escape") {
        setListening(null);
        return;
      }
      keep({ ...bindings, keys: bind(bindings.keys, listening.action, e.code) });
      setListening(null);
    };
    window.addEventListener("keydown", grab, true);
    return () => window.removeEventListener("keydown", grab, true);
  }, [listening, bindings, keep]);

  const grabPad = useCallback(
    (index: number) => {
      if (listening?.on !== "pad") return;
      keep({ ...bindings, pad: bind(bindings.pad, listening.action, index) });
      setListening(null);
    },
    [listening, bindings, keep],
  );
  useGamepadCapture(listening?.on === "pad", grabPad);

  /** Runs a library call and takes the fresh view it hands back. */
  const run = useCallback(async (call: () => Promise<LibraryView>) => {
    try {
      setLib(await call());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void run(api.library);
  }, [run]);

  const roms = lib?.roms ?? [];

  // ── Which cartridges the main pane is showing ──
  const shown = useMemo(() => {
    const q = st.query.trim().toUpperCase();
    let out = roms;
    if (st.tab === 1) out = out.filter((r) => r.favorite);
    if (st.tab === 2) {
      out = out
        .filter((r) => r.lastPlayedAt != null)
        .slice()
        .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
        .slice(0, RECENT_COUNT);
    }
    if (q) out = out.filter((r) => r.title.includes(q));
    // NAME is the order the scan already returns; the other two re-sort.
    if (st.sort === 1) {
      out = out.slice().sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
    }
    if (st.sort === 2) {
      out = out.slice().sort((a, b) => b.playMinutes - a.playMinutes);
    }
    return out;
  }, [roms, st.query, st.tab, st.sort]);

  /** The selected cartridge, falling back to the first one listed. */
  const sel: Rom | null =
    roms.find((r) => r.path === st.selPath) ?? shown[0] ?? roms[0] ?? null;

  const play = useCallback(
    (path: string) => {
      // The library goes inert behind the play view, which by itself takes
      // focus off the card that started this. Dropped here as well because
      // that is the one thing a keypress must not still be able to press.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      patch({ selPath: path, playing: true, pause: false, saves: false, slot: null });
      void console_.open(path);
    },
    [patch, console_],
  );

  /**
   * Shuts the cartridge down and takes the library back.
   *
   * The Rust side credits the session's playtime as it closes, so the library
   * is re-read rather than assumed: LAST PLAYED and PLAYTIME have just changed.
   */
  const closeRom = useCallback(async () => {
    if (st.confirmClose && st.playing && hasBackend()) {
      // A dialog that cannot be shown must not leave the close button doing
      // nothing at all, which is what swallowing the failure amounted to.
      // Say so and close: the player asked to.
      try {
        const { ask } = await import("@tauri-apps/plugin-dialog");
        const sure = await ask(say("close_ask"), {
          title: "Octet",
          kind: "warning",
          okLabel: say("close_ask_ok"),
          cancelLabel: say("close_ask_no"),
        });
        if (!sure) return;
      } catch (e) {
        console.error("octet: could not ask before closing", e);
      }
    }
    patch({ playing: false, pause: false, saves: false });
    await console_.close();
    void run(api.library);
  }, [patch, console_, run, say, st.confirmClose, st.playing]);

  /** Re-reads the slots. Cheap, and the browser is never open for long. */
  const readSlots = useCallback(async () => {
    try {
      setSlots(await api.slots());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // The browser reads the slots as it opens, so it never shows a stale one.
  useEffect(() => {
    if (st.playing && st.saves) {
      setSlotError(null);
      void readSlots();
    }
  }, [st.playing, st.saves, readSlots]);

  const [slotError, setSlotError] = useState<string | null>(null);

  /**
   * Writes the chosen slot, or reads it — whichever the browser was opened
   * for. Closes on success, and says why on failure rather than closing.
   */
  const commitSlot = useCallback(async () => {
    const slot = st.slot;
    if (slot == null) return;
    try {
      if (st.savesMode === "save") {
        setSlots(await api.saveState(slot));
        setSlotError(null);
        patch({ saves: false });
      } else {
        await api.loadState(slot);
        setSlotError(null);
        patch({ saves: false, pause: false });
      }
    } catch (e) {
      setSlotError(String(e).toUpperCase());
    }
  }, [st.slot, st.savesMode, patch]);

  const toggleFavorite = useCallback(
    (rom: Rom) => void run(() => api.setFavorite(rom.path, !rom.favorite)),
    [run],
  );

  const pickAndAddFolder = useCallback(async () => {
    const path = await api.pickFolder();
    if (path) await run(() => api.addFolder(path));
  }, [run]);

  /// Whether the console should be standing still.
  //
  // The pause menu, or the window having gone to the background if that is
  // what the player asked for. Both mean the same thing to the console.
  const backgrounded = st.pauseUnfocused && !focused;

  useEffect(() => {
    console_.setPaused(st.playing && (st.pause || backgrounded));
  }, [console_, st.playing, st.pause, backgrounded]);

  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);

  // WATCH FOLDERS, and the rescan it asks for.
  useEffect(() => {
    if (!hasBackend()) return;
    void invoke("set_watch_folders", { on: st.watchFolders });
  }, [st.watchFolders]);

  useEffect(() => {
    if (!hasBackend()) return;
    let stop: (() => void) | undefined;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      stop = await listen("library-changed", () => void run(api.library));
    })();
    return () => stop?.();
  }, [run]);

  // The volume the console actually plays at.
  //
  // Silenced along with the pause, not instead of it: a paused console stops
  // producing samples, the ring drains, and the callback holds its last level
  // — which is a constant tone rather than silence.
  useEffect(() => {
    if (!hasBackend()) return;
    void invoke("set_volume", { volume: backgrounded ? 0 : st.vol * 10 });
  }, [st.vol, backgrounded]);

  // ── The theme ──
  //
  // Stamped on the root element, where the palette in `index.css` reads it:
  // LIGHT and DARK say so outright, AUTO says nothing and leaves the system's
  // own `prefers-color-scheme` to answer. The window's own ground is painted
  // to match, since that is what shows before the page has drawn.
  useEffect(() => {
    const root = document.documentElement;
    const chosen = (["light", "dark"] as const)[st.theme];
    if (chosen) root.dataset.theme = chosen;
    else delete root.dataset.theme;

    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const paint = () =>
      setWindowGround(
        chosen === "dark" || (chosen == null && system.matches)
          ? DARK_GROUND
          : LIGHT_GROUND,
      );
    paint();

    // On AUTO the stylesheet follows the system on its own, but the window
    // behind it is the platform's and has to be told.
    if (chosen != null) return;
    system.addEventListener("change", paint);
    return () => system.removeEventListener("change", paint);
  }, [st.theme]);

  // ── Keys ──
  //
  // Escape backs out of whatever is deepest. The rest are the shortcuts the
  // status bar advertises, and they stay out of the way while a field has
  // focus or an overlay is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A listening row owns the keyboard until it has its key.
      if (listening) return;
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.isContentEditable);

      /** Back out of whatever is deepest, or open the menu if nothing is. */
      const backOut = () =>
        setSt((s) => {
          if (s.settings) {
            e.preventDefault();
            return { ...s, settings: false, langOpen: false };
          }
          if (!s.playing) return s;
          e.preventDefault();
          return s.saves ? { ...s, saves: false } : { ...s, pause: !s.pause };
        });

      // Escape backs out from anywhere, a field included — getting out of
      // something is the one thing that must always work.
      if (e.code === "Escape") {
        backOut();
        return;
      }

      if (typing) return;

      // And so does whatever the player has put MENU on, which is Escape
      // until they move it.
      if (e.code === bindings.keys.menu) {
        backOut();
        return;
      }

      // Settings, from anywhere. The pause menu advertises this one, but
      // there is no reason it should not open over the library too.
      if (e.code === "KeyS" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        patch({ pause: false, settings: true });
        return;
      }

      // A key the player has put on the pad is the pad's, and none of the
      // accelerators below get a look at it.
      if (st.playing && actionForKey(bindings.keys, e.code) != null) return;

      // The rest of the pause menu's accelerators, which only mean anything
      // with a cartridge in. Live whether or not the menu itself is up.
      if (st.playing && !st.settings) {
        if (e.code === "KeyW" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void closeRom();
          return;
        }
        if (e.code === "F5") {
          e.preventDefault();
          patch({ saves: true, savesMode: "save", slot: null });
          return;
        }
        if (e.code === "F6") {
          e.preventDefault();
          patch({ saves: true, savesMode: "load", slot: null });
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.code === "KeyR") {
          // What the pause menu's RESET GAME does, since the menu offers
          // this as its accelerator: back to power-on, and playing.
          e.preventDefault();
          console_.reset();
          patch({ pause: false, saves: false });
          return;
        }
        if (e.code === "Space") {
          // Nothing is bound to it, and left alone it presses whichever
          // button still holds focus behind the picture.
          e.preventDefault();
          return;
        }
      }

      if (st.playing || st.settings) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Enter" && sel) {
        e.preventDefault();
        play(sel.path);
        return;
      }
      if ((e.key === "f" || e.key === "F") && sel) {
        e.preventDefault();
        toggleFavorite(sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    sel,
    play,
    toggleFavorite,
    console_,
    closeRom,
    patch,
    bindings,
    listening,
    st.playing,
    st.settings,
  ]);

  /**
   * One row of the CONTROLS pane.
   *
   * Colour is a class rather than a value, as everywhere else — the palette
   * itself lives in `index.css` and nothing here knows what these are.
   */
  const bindRow = useCallback(
    (on: "keys" | "pad", action: Action, label: string, bound: string, live: boolean) => {
      const hot = listening?.on === on && listening.action === action;
      return {
        key: `${on}-${action}`,
        label,
        bound: hot ? say("press_a_key") : bound,
        live,
        row: live
          ? "border-rule bg-card hover:border-ink hover:bg-hover-face"
          : "border-rule-soft bg-card",
        labelInk: live ? "text-ink" : "text-mute",
        cap: hot
          ? "border-ink bg-accent text-on-accent"
          : live
            ? "border-ink bg-panel text-ink"
            : "border-rule bg-transparent text-mute",
        pick: () => {
          if (!live) return;
          setListening((was) =>
            was?.on === on && was.action === action ? null : { on, action },
          );
        },
      };
    },
    [listening, say],
  );

  const vals = useMemo(() => {
    const folders = lib?.folders ?? [];
    const favCount = roms.filter((r) => r.favorite).length;

    const navs = (
      [
        [TABS[0], roms.length],
        [TABS[1], favCount],
        [TABS[2], Math.min(RECENT_COUNT, roms.filter((r) => r.lastPlayedAt != null).length)],
      ] as [Key, number][]
    ).map(([label, count], i) => {
      const on = st.tab === i;
      return {
        label: say(label),
        count,
        box: on ? "border-ink bg-ink" : "border-rule bg-transparent",
        fg: on ? "text-panel" : "text-ink",
        dot: on ? "bg-accent" : "bg-rule-mid",
        pick: () => patch({ tab: i }),
      };
    });

    const cards = shown.map((rom) => {
      const on = sel?.path === rom.path;
      return {
        key: rom.path,
        name: rom.title,
        meta:
          st.sort === 2
            ? say("played", { time: playtime(say, rom.playMinutes) })
            : whenPlayed(say, rom.lastPlayedAt),
        mapper: mapperAndSize(rom.mapper, rom.sizeKb),
        when: whenPlayed(say, rom.lastPlayedAt),
        played: playtime(say, rom.playMinutes),
        initials: initialsFor(rom.title),
        tint: tintFor(rom.title),
        /** Art if it has been kept, and then the label is when, as designed. */
        hasArt: rom.hasArt,
        path: rom.path,
        capture: rom.hasArt ? whenPlayed(say, rom.lastPlayedAt) : say("no_capture"),
        /** The star over artwork, where an unlit one must still read. */
        star: rom.favorite ? "fill-accent" : "fill-white/32",
        /** The same star on paper, in the list. */
        starInk: rom.favorite ? "fill-accent" : "fill-rule",
        card: on ? "border-ink bg-panel" : "border-rule bg-card",
        rule: on ? "border-ink" : "border-rule",
        row: on ? "bg-selected" : "bg-transparent",
        play: () => play(rom.path),
        favorite: rom.favorite,
        /** Clicking the star favourites the cartridge instead of playing it. */
        star_: () => toggleFavorite(rom),
      };
    });

    // ── The pause menu ──
    const menuActs: Record<string, () => void> = {
      menu_resume: () => patch({ pause: false }),
      menu_save_state: () => patch({ saves: true, savesMode: "save", slot: null }),
      menu_load_state: () => patch({ saves: true, savesMode: "load", slot: null }),
      menu_settings: () => patch({ pause: false, settings: true }),
      menu_reset: () => {
        console_.reset();
        patch({ pause: false });
      },
      menu_close: () => void closeRom(),
    };
    const menu = MENU.map(([id, accelerator]) => ({
      key: id,
      label: say(id),
      // RESUME answers to the menu key itself, whatever that has been set to.
      accelerator: accelerator ?? keyLabel(bindings.keys.menu),
      act: menuActs[id],
    }));

    // ── The save slots ──
    const selTint = tintFor(sel?.title ?? "");
    const saving = st.savesMode === "save";
    // Loading needs a slot with something in it; writing does not care.
    const chosen = slots.find((it) => it.slot === st.slot);
    const slotReady = chosen != null && (saving || chosen.used);
    const slotViews = slots.map((it) => {
      const on = st.slot === it.slot;
      const empty = !it.used;
      return {
        key: it.slot,
        no: String(it.slot + 1),
        stamp: empty ? say("slot_empty") : savedAt(say, it.savedAt ?? 0),
        detail: empty ? say("slot_nothing") : playtime(say, it.playMinutes),
        /** The frame that was on screen, once one has been kept. */
        hasShot: it.hasShot,
        shot: empty ? "bg-empty" : selTint,
        shotFg: empty ? "text-faint" : "text-white/86",
        shotLabel: empty ? say("slot_empty_shot") : it.hasShot ? "" : say("no_capture"),
        scan: empty ? "opacity-0" : "opacity-100",
        badge: on
          ? "bg-accent text-on-accent"
          : empty
            ? "bg-rule text-slate"
            : "bg-caption text-on-accent",
        card: on ? "border-ink bg-panel" : "border-rule bg-card",
        rule: on ? "border-ink" : "border-rule",
        pick: () => patch((prev) => ({ slot: prev.slot === it.slot ? null : it.slot })),
      };
    });

    // ── Settings ──
    const seg = (arr: Key[], cur: number, key: keyof Shell) =>
      arr.map((label, i) => ({
        key: i,
        label: say(label),
        face: cur === i ? "bg-ink text-panel" : "bg-panel text-ink",
        pick: () => patch({ [key]: i } as Partial<Shell>),
      }));

    const tg = (defs: [Key, Key, keyof Shell][]) =>
      defs.map(([label, sub, key]) => {
        const on = st[key] as boolean;
        return {
          key,
          label: say(label),
          sub: say(sub),
          onLabel: say("toggle_on"),
          offLabel: say("toggle_off"),
          on: on ? "bg-accent text-on-accent" : "bg-transparent text-faint",
          off: on ? "bg-transparent text-faint" : "bg-ink text-panel",
          flip: () => patch((s) => ({ [key]: !s[key] }) as Partial<Shell>),
        };
      });

    const enabledFolders = folders.filter((f) => f.enabled).length;

    return {
      /** What everything on screen is said in; see `src/i18n`. */
      say,

      // ── Library ──
      loading: lib === null,
      error,
      /** Nothing to show and nowhere to look: the first-run way in. */
      empty: lib !== null && roms.length === 0,
      hasFolders: folders.length > 0,
      navs,
      cards,
      folders: folders.map((f) => ({
        key: f.path,
        name: f.label,
        n: f.count,
        pick: () => void run(() => api.setFolderEnabled(f.path, !f.enabled)),
      })),
      query: st.query,
      onQuery: (e: React.ChangeEvent<HTMLInputElement>) => patch({ query: e.target.value }),
      searchRef,
      sortLabel: say(SORTS[st.sort]),
      cycleSort: () => patch((s) => ({ sort: (s.sort + 1) % SORTS.length })),
      headline: say(TABS[st.tab]),
      headlineSub: say(cards.length === 1 ? "count_title" : "count_titles", {
        n: cards.length,
      }),
      diskLabel: say("disk_line", {
        n: roms.length,
        size: onDisk(lib?.totalBytes ?? 0),
      }),
      statusLeft: say("status_line", { n: roms.length, favorites: favCount }),
      hints: (
        [
          ["ENTER", "hint_play"],
          ["F", "hint_favorite"],
          ["/", "hint_search"],
        ] as [string, Key][]
      ).map(([key, label]) => ({ key, label: say(label) })),
      isGrid: st.view === "grid",
      isList: st.view === "list",
      setGrid: () => patch({ view: "grid" }),
      setList: () => patch({ view: "list" }),
      gridFace: st.view === "grid" ? "bg-ink" : "bg-panel",
      gridInk: st.view === "grid" ? "fill-panel" : "fill-mute",
      listFace: st.view === "list" ? "bg-ink" : "bg-panel",
      listInk: st.view === "list" ? "fill-panel" : "fill-mute",
      addFolder: pickAndAddFolder,

      // ── Playing ──
      selName: sel?.title ?? "",
      selMeta: sel
        ? `${mapperAndSize(sel.mapper, sel.sizeKb)} / ` +
          say("played", { time: playtime(say, sel.playMinutes) })
        : "",
      playStatus: say("play_status", {
        fps: hasBackend() ? (console_.running ? console_.stats.fps : 0) : FALLBACK_FPS,
        slot: st.slot == null ? "-" : st.slot + 1,
      }),
      /** Attaches the canvas the picture is drawn on. */
      attachScreen: console_.attach,
      /** FPS COUNTER — SHOW IN CORNER. */
      showFps: st.fps,
      fpsReadout: say("fps_readout", { fps: console_.running ? console_.stats.fps : 0 }),
      /** Whether the emulator is actually running, as against the placeholder. */
      live: console_.running,
      consoleError: console_.error,
      selTint,
      playing: st.playing,
      paused: st.playing && st.pause && !st.saves,
      savesOpen: st.playing && st.saves,
      menu,
      slots: slotViews,
      resume: () => patch({ pause: false }),
      /** What the X in the play strip does: the menu, not the door. */
      openMenu: () => patch({ pause: true, saves: false }),
      closeRom: () => void closeRom(),
      closeSaves: () => patch({ saves: false }),
      saving,
      slotStatus:
        slotError ??
        (st.slot == null
          ? say(saving ? "slot_pick_write" : "slot_pick_read")
          : say("slot_selected", { n: st.slot + 1 })),
      loadFace: slotReady ? "bg-accent text-on-accent" : "bg-empty text-faint",
      loadLabel:
        st.slot == null
          ? say(saving ? "slot_save_none" : "slot_load_none")
          : say(saving ? "slot_save" : "slot_load", { n: st.slot + 1 }),
      commitSlot: () => void commitSlot(),

      // ── Settings ──
      settingsOpen: st.settings,
      openSettings: () => patch({ settings: true, pause: false, saves: false }),
      closeSettings: () => patch({ settings: false, langOpen: false }),
      /** The real version, stamped in at build time; see `vite.config.ts`. */
      version: say("settings_version", { version: __APP_VERSION__ }),
      setStatus: say("settings_status"),
      cats: CATS.map((label, i) => ({
        key: i,
        label: say(label),
        face: st.cat === i ? "bg-selected" : "bg-transparent",
        dot: st.cat === i ? "bg-accent" : "bg-rule-mid",
        pick: () => patch({ cat: i, langOpen: false }),
      })),
      cat: st.cat,
      /**
       * The CONTROLS pane, both halves.
       *
       * A row is a console button, the key it answers to, and whether it is
       * listening for another. The keyboard's rows are always live; the
       * controller's are dead without one plugged in, which is what the
       * design's greyed state is for.
       */
      keyBinds: ACTIONS.map((action) =>
        bindRow(
          "keys",
          action.id,
          say(action.label),
          keyLabel(bindings.keys[action.id]),
          true,
        ),
      ),
      padBinds: PAD_REBINDABLE.map((id) => {
        const action = ACTIONS.find((it) => it.id === id);
        return bindRow(
          "pad",
          id,
          action ? say(action.label) : id.toUpperCase(),
          padLabel(bindings.pad[id]),
          padPresent,
        );
      }),
      padPresent,
      /**
       * What the play strip says opens the menu — the binding rather than a
       * fixed ESC, since the player may have moved it.
       */
      menuHint: say("play_menu_hint", { key: keyLabel(bindings.keys.menu) }),
      /** The heading itself greys out with the rows under it. */
      padHeadInk: padPresent ? "text-dim" : "text-faint",
      restoreBinds: () => {
        setListening(null);
        keep(DEFAULTS);
      },
      /** Whether the bindings are still the ones the app shipped with. */
      bindsStock:
        JSON.stringify(bindings) === JSON.stringify(DEFAULTS),
      shortcuts: SHORTCUTS.map(([group, rows]) => ({
        key: group,
        group: say(group),
        rows: rows.map(([keys, what]) => ({ key: keys, keys, what: say(what) })),
      })),
      langOpen: st.langOpen,
      langCode: LANGS[lang].code,
      langName: LANGS[lang].name,
      caretFlip: st.langOpen ? "rotate-180" : "rotate-0",
      toggleLang: () => patch((s) => ({ langOpen: !s.langOpen })),
      langs: LANGS.map((it, i) => ({
        key: i,
        code: it.code,
        // Its own name, never translated — the point of the list is that you
        // can find your language without already reading the app's.
        name: it.tag === null ? say("language_system") : it.name,
        face: lang === i ? "bg-selected" : "bg-transparent",
        tick: lang === i ? "X" : "",
        pick: () => {
          chooseLang(i);
          patch({ langOpen: false });
        },
      })),
      themes: seg(THEMES, st.theme, "theme"),
      scales: seg(SCALES, st.scale, "scale"),
      filters: seg(FILTERS, st.filter, "filter"),
      genToggles: tg([
        ["pause_background", "pause_background_sub", "pauseUnfocused"],
        ["confirm_close", "confirm_close_sub", "confirmClose"],
      ]),
      vidToggles: tg([
        ["scanlines", "scanlines_sub", "scanlines"],
        ["fps_counter", "fps_counter_sub", "fps"],
        ["start_fullscreen", "start_fullscreen_sub", "fullscreen"],
      ]),
      audToggles: tg([["fast_forward_audio", "fast_forward_audio_sub", "fastForward"]]),
      pathToggles: tg([
        ["auto_screenshot", "auto_screenshot_sub", "autoShot"],
        ["watch_folders", "watch_folders_sub", "watchFolders"],
      ]),
      paths: PATHS.map(([label, dir]) => ({ key: label, label: say(label), dir })),
      romFolderCount: say("folders_scanned", { on: enabledFolders, all: folders.length }),
      romFolders: folders.map((f) => ({
        key: f.path,
        dir: f.label,
        detail: folderDetail(say, f.count, f.enabled, f.readable),
        row: f.enabled ? "border-rule bg-card" : "border-rule-soft bg-transparent",
        box: f.enabled ? "bg-accent" : "bg-transparent",
        tick: f.enabled ? "X" : "",
        toggle: () => void run(() => api.setFolderEnabled(f.path, !f.enabled)),
        remove: () => void run(() => api.removeFolder(f.path)),
      })),
      volReadout: st.vol * 10 + "%",
      volBlocks: Array.from({ length: 10 }, (_, n) => ({
        key: n,
        // The top two blocks warn: past 80% the mix can clip.
        face: n < st.vol ? (n > 7 ? "bg-accent" : "bg-ink") : "bg-card",
        /**
         * Click an unlit block to fill through it, a lit one to empty from it.
         *
         * Which makes the leftmost lit block mute, in one click — the design
         * draws ten blocks and no mute button, and a row where nought is only
         * reachable by turning the volume down to one first and clicking again
         * is a row that cannot be silenced.
         */
        set: () => patch({ vol: n < st.vol ? n : n + 1 }),
      })),
      previewPad: st.scale === 0 ? "px-[56px] py-[12px]" : "px-[30px] py-[12px]",
      previewLabel: SCALES[st.scale],
      previewTint: selTint,
      previewFilter:
        st.filter === 1
          ? "blur-[0.8px]"
          : st.filter === 2
            ? "saturate-[1.3] contrast-[1.1]"
            : "",
      scanOpacity: st.scanlines ? (st.filter === 2 ? "opacity-100" : "opacity-[0.55]") : "opacity-0",

      noop: () => {},
    };
  }, [
    st,
    patch,
    lib,
    roms,
    shown,
    sel,
    error,
    run,
    play,
    toggleFavorite,
    pickAndAddFolder,
    console_,
    closeRom,
    bindings,
    bindRow,
    padPresent,
    keep,
    slots,
    say,
    lang,
    chooseLang,
  ]);

  return vals;
}

export type Vals = ReturnType<typeof useShell>;
