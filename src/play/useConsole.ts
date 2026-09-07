import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasBackend } from "../library/api";
import { firstPad, padBits } from "./gamepad";
import { actionForKey, BIT, settle, type Bindings } from "./pad";
import { Screen, type Look } from "./screen";

/**
 * Driving a running cartridge.
 *
 * The console runs on its own thread in Rust; this only collects finished
 * frames and forwards the keyboard. Frames are pulled on `requestAnimationFrame`
 * rather than pushed, so the window asks for one when it is actually about to
 * draw — a push would pile up behind a slow repaint.
 */

type Opened = {
  width: number;
  height: number;
  palette: number[];
};

export type ConsoleStats = {
  /** Frames a second, measured over the last half second. */
  fps: number;
  /** Frames the console produced that the window never collected. */
  dropped: number;
  /** Scanlines the frame format simplified; see `frame.rs`. */
  tornLines: number;
};

/** Gives a screen the palette to expand frames with, and the look to wear. */
function apply(screen: Screen | null, opened: Opened | null, look: Look) {
  if (!screen || !opened) return;
  screen.setPalette(opened.palette);
  screen.setLook(look);
}

/**
 * Driving a running cartridge.
 *
 * `onMenu` is the controller's menu button arriving; the keyboard's is handled
 * with the rest of the keys that mean something to the app rather than to the
 * console, in `useShell`.
 */
export function useConsole(
  look: Look,
  bindings: Bindings,
  onMenu: () => void,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenRef = useRef<Screen | null>(null);
  const heldRef = useRef(0);
  const padRef = useRef(0);
  const sequenceRef = useRef(0);
  /**
   * What the last `open` reported.
   *
   * Kept because the two halves of setup race: `open` is called the moment a
   * card is clicked, while the canvas it needs only exists after React has
   * rendered the play view. Whichever happens second applies it.
   */
  const openedRef = useRef<Opened | null>(null);
  const [stats, setStats] = useState<ConsoleStats>({ fps: 0, dropped: 0, tornLines: 0 });
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  /** Opens a cartridge. Resolves once the console is actually running. */
  const open = useCallback(async (path: string) => {
    if (!hasBackend()) {
      // Off the shell there is no emulator; the caller shows the placeholder.
      setRunning(false);
      return false;
    }
    try {
      const opened = await invoke<Opened>("open_rom", { path });
      sequenceRef.current = 0;
      heldRef.current = 0;
      openedRef.current = opened;
      apply(screenRef.current, opened, look);
      setError(null);
      setRunning(true);
      return true;
    } catch (e) {
      setError(String(e));
      setRunning(false);
      return false;
    }
  }, [look]);

  const close = useCallback(async () => {
    setRunning(false);
    heldRef.current = 0;
    openedRef.current = null;
    if (!hasBackend()) return;
    try {
      await invoke("close_rom");
    } catch {
      // Closing a console that is already shut is not worth reporting.
    }
  }, []);

  /** Attaches the canvas. Called by the play view once it has mounted one. */
  const attach = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas) {
      screenRef.current?.close();
      screenRef.current = null;
      return;
    }
    try {
      const screen = new Screen(canvas);
      screenRef.current = screen;
      // A cartridge opened before this canvas existed still needs its palette.
      apply(screen, openedRef.current, look);
    } catch (e) {
      setError(String(e));
    }
  }, [look]);

  // The VIDEO settings, pushed down whenever they change.
  useEffect(() => {
    screenRef.current?.setLook(look);
  }, [look]);

  // ── Collecting frames ──
  useEffect(() => {
    if (!running || !hasBackend()) return;
    let alive = true;
    let raf = 0;
    let shown = 0;
    let since = performance.now();

    const tick = async () => {
      if (!alive) return;
      try {
        const bytes = await invoke<ArrayBuffer>("frame", { since: sequenceRef.current });
        const frame = new Uint8Array(bytes);
        if (frame.length > 0) {
          // Bytes 4..8 are the sequence number the encoder stamped.
          sequenceRef.current = new DataView(frame.buffer, frame.byteOffset).getUint32(4, true);
          screenRef.current?.draw(frame);
          shown++;
        }
      } catch (e) {
        setError(String(e));
        alive = false;
        return;
      }

      const now = performance.now();
      if (now - since >= 500) {
        const fps = Math.round((shown * 1000) / (now - since));
        shown = 0;
        since = now;
        // Rust's own counters come along for the ride, so the format's
        // per-scanline assumption can be checked rather than trusted.
        try {
          const s = await invoke<{ dropped: number; tornLines: number } | null>("stats");
          setStats({ fps, dropped: s?.dropped ?? 0, tornLines: s?.tornLines ?? 0 });
        } catch {
          setStats((was) => ({ ...was, fps }));
        }
      }
      raf = requestAnimationFrame(() => void tick());
    };

    raf = requestAnimationFrame(() => void tick());
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [running]);

  /**
   * Tells the console what is held, keyboard and controller together, so
   * either can work any button and neither can release the other's.
   */
  const send = useCallback(() => {
    if (!hasBackend()) return;
    void invoke("press", { port: 0, bits: settle(heldRef.current | padRef.current) });
  }, []);

  // ── The keyboard ──
  useEffect(() => {
    if (!running || !hasBackend()) return;
    const { keys } = bindings;

    const down = (e: KeyboardEvent) => {
      const action = actionForKey(keys, e.code);
      if (action == null) return;
      // The arrows would otherwise scroll the pane behind the picture, and
      // whatever is bound would work whichever button still has focus.
      e.preventDefault();
      const next = heldRef.current | BIT[action];
      if (next === heldRef.current) return; // a key repeat, or MENU
      heldRef.current = next;
      send();
    };
    const up = (e: KeyboardEvent) => {
      const action = actionForKey(keys, e.code);
      if (action == null) return;
      e.preventDefault();
      heldRef.current &= ~BIT[action];
      send();
    };
    /** Losing focus with a button held would leave it stuck down. */
    const release = () => {
      if (heldRef.current === 0) return;
      heldRef.current = 0;
      send();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      release();
    };
  }, [running, bindings, send]);

  // ── The controller ──
  //
  // Polled rather than listened to, because that is the only way a controller
  // can be read. Its buttons go to the console; its menu key comes back out
  // through `onMenu`, on the press rather than the release, and once however
  // long it is held.
  useEffect(() => {
    if (!running || !hasBackend()) return;
    const { pad } = bindings;
    let raf = 0;
    let menuHeld = false;

    const poll = () => {
      const held = firstPad();
      if (held) {
        const bits = padBits(held, pad);
        if (bits !== padRef.current) {
          padRef.current = bits;
          send();
        }
        const menu = held.buttons[pad.menu]?.pressed ?? false;
        if (menu && !menuHeld) onMenu();
        menuHeld = menu;
      } else if (padRef.current !== 0) {
        // Unplugged mid-press, which would otherwise stay pressed forever.
        padRef.current = 0;
        send();
      }
      raf = requestAnimationFrame(poll);
    };

    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      if (padRef.current !== 0) {
        padRef.current = 0;
        send();
      }
    };
  }, [running, bindings, onMenu, send]);

  const setPaused = useCallback((on: boolean) => {
    if (!hasBackend()) return;
    void invoke("pause", { on });
  }, []);

  const reset = useCallback(() => {
    if (!hasBackend()) return;
    void invoke("reset");
  }, []);

  return { attach, open, close, setPaused, reset, running, stats, error };
}
