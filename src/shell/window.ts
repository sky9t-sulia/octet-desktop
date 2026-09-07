import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * The window's own buttons, safe to call anywhere.
 *
 * `getCurrentWindow()` reads Tauri's injected globals and throws outright
 * without them, which would take the whole interface down the moment the page
 * is opened in a plain browser — `npm run dev` on its own, or the design diff
 * in `tools/`. Off Tauri these do nothing, and the interface still draws.
 */

const underTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const on = <T>(f: (w: ReturnType<typeof getCurrentWindow>) => T) => () => {
  if (!underTauri()) return;
  try {
    f(getCurrentWindow());
  } catch {
    // A window that will not answer is not worth taking the interface down for.
  }
};

export const windowControls = {
  minimize: on((w) => w.minimize()),
  toggleMaximize: on((w) => w.toggleMaximize()),
  close: on((w) => w.close()),
};

/**
 * Paints the window's own ground, behind the page.
 *
 * `tauri.conf.json` can only name one colour, and it is the light theme's —
 * so without this a dark session shows a pale window for the moment before
 * the webview has drawn anything, and again in the gap while it resizes.
 */
export function setWindowGround(color: string) {
  if (!underTauri()) return;
  try {
    void getCurrentWindow().setBackgroundColor(color);
  } catch {
    // Older shells have no such call; the page still paints itself.
  }
}
