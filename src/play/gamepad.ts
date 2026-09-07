/**
 * Controllers, as the browser hands them over.
 *
 * There is no event for a button; a controller has to be asked what it is
 * doing, so everything here is a poll. The rate is the display's, which is
 * also the console's — a button pressed and released between two frames was
 * not pressed as far as the game is concerned either.
 */

import { useEffect, useState } from "react";
import { BIT, BUTTON, isPadButtonBindable, type Action, type Padmap } from "./pad";

/** How far a stick has to leave the middle to count as pushed. */
const DEAD = 0.5;

/** The first controller that has anything to say. */
export function firstPad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (pad?.connected) return pad;
  }
  return null;
}

/**
 * The console buttons a controller is holding down.
 *
 * The left stick works the D-pad as well as the hat does: plenty of pads put
 * a stick where the thumb lands first, and a game that wants four directions
 * should not care which of the two it came from.
 */
export function padBits(pad: Gamepad, map: Padmap): number {
  let bits = 0;
  for (const id of Object.keys(map) as Action[]) {
    if (BIT[id] === 0) continue; // MENU, which the console never sees
    if (pad.buttons[map[id]]?.pressed) bits |= BIT[id];
  }

  const [x = 0, y = 0] = pad.axes;
  if (x < -DEAD) bits |= BUTTON.left;
  if (x > DEAD) bits |= BUTTON.right;
  if (y < -DEAD) bits |= BUTTON.up;
  if (y > DEAD) bits |= BUTTON.down;
  return bits;
}

/**
 * Whether a controller is on hand, followed as they come and go mid-session.
 *
 * Both the events and a poll: the events say when one arrives, and the poll
 * catches the ones that go away quietly. A browser keeps a controller to
 * itself until something is pressed on it, so one plugged in and left alone
 * reads as absent until it is touched — which is also when it starts working,
 * so the pane is never wrong about what the player can do right now.
 */
export function useGamepadPresent(): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    const look = () => setPresent(firstPad() != null);
    look();
    const every = window.setInterval(look, 400);
    window.addEventListener("gamepadconnected", look);
    window.addEventListener("gamepaddisconnected", look);
    return () => {
      window.clearInterval(every);
      window.removeEventListener("gamepadconnected", look);
      window.removeEventListener("gamepaddisconnected", look);
    };
  }, []);

  return present;
}

/**
 * Watches for one bindable button on a controller, for as long as `listening`
 * is true, and hands over the first one pressed.
 *
 * Only the buttons a binding may point at answer: pressing BACK or the hat
 * while a row is listening leaves it listening, which is the honest answer,
 * since those are not the player's to move.
 */
export function useGamepadCapture(
  listening: boolean,
  onPress: (index: number) => void,
): void {
  useEffect(() => {
    if (!listening) return;
    let raf = 0;
    // Whatever is already held when the row starts listening does not count,
    // or the click that started it would bind the button still under the
    // thumb from a moment ago.
    let settled = false;

    const poll = () => {
      const pad = firstPad();
      if (pad) {
        const down = pad.buttons.findIndex(
          (button, index) => button.pressed && isPadButtonBindable(index),
        );
        if (!settled) {
          if (!pad.buttons.some((button) => button.pressed)) settled = true;
        } else if (down >= 0) {
          onPress(down);
          return;
        }
      }
      raf = requestAnimationFrame(poll);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [listening, onPress]);
}
