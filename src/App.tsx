import { LibraryPane, StatusBar } from "./screens/LibraryPane";
import { PauseModal, PlayOverlay, SavesModal } from "./screens/PlayOverlay";
import { SettingsWindow } from "./screens/SettingsWindow";
import { Sidebar } from "./screens/Sidebar";
import { TopBar } from "./screens/TopBar";
import { useShell } from "./state/useShell";

/**
 * The window.
 *
 * The design draws this as a 1440×900 artboard with a 3px keyline; here that
 * keyline is the window's own edge, so the box fills whatever the window is
 * and the layout — already flexed in the design — takes up the slack. At the
 * default size the two are the same thing, pixel for pixel.
 *
 * This is the one element sized border-box rather than content-box: it has to
 * fit the window exactly, keyline included. Everything inside it is spaced the
 * way the design spaces it, which is content-box.
 *
 * Everything past the library is an overlay rather than a route — playing a
 * cartridge covers the library, and closing it uncovers the library that was
 * already there.
 *
 * Because it is covered rather than unmounted, the library keeps its buttons —
 * and a covered button that still holds focus is a button the keyboard can
 * press. So while a cartridge runs the whole library is `inert`: unfocusable,
 * untabbable, and deaf to clicks, which leaves the play view the only thing on
 * screen the keyboard can reach.
 */
export default function App() {
  const v = useShell();

  return (
    <div
      id="oct-win"
      className="relative box-border flex h-full w-full overflow-hidden border-[3px] border-ink bg-paper"
    >
      <Sidebar v={v} />

      {/*
        Everything beside the rail, and the container the shelf counts its
        columns against: this is the width that actually decides how many
        cards fit, and unlike the pane inside it, it does not lose a
        scrollbar's width when the shelf grows long. `inline-size` contains
        the width only, so heights and scrolling are untouched.
      */}
      <div
        className="@container flex min-w-0 flex-1 flex-col"
        inert={v.playing}
      >
        <TopBar v={v} />
        <LibraryPane v={v} />
        <StatusBar v={v} />
      </div>

      <PlayOverlay v={v} />
      <PauseModal v={v} />
      <SavesModal v={v} />
      <SettingsWindow v={v} />
    </div>
  );
}
