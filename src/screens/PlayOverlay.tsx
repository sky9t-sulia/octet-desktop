import { useEffect, useRef, useState } from "react";
import { dragRegion } from "../design/drag";
import { cx, t } from "../design/type";
import { api } from "../library/api";
import type { Vals } from "../state/useShell";

/**
 * The frame that was on screen when a slot was written.
 *
 * Fetched per slot rather than cached: unlike a card's art, a slot's picture
 * changes every time the slot is written. The URL is released when the
 * browser closes, or the window would hold one per save for the session.
 */
function SlotShot({
  slot,
  hasShot,
  label,
  labelInk,
}: {
  slot: number;
  hasShot: boolean;
  label: string;
  labelInk: string;
}) {
  const [shot, setShot] = useState<string | null>(null);

  useEffect(() => {
    if (!hasShot) {
      setShot(null);
      return;
    }
    let url: string | null = null;
    let alive = true;
    void api.shot(slot).then((got) => {
      url = got;
      if (alive) setShot(got);
      else if (got) URL.revokeObjectURL(got);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [slot, hasShot]);

  if (!shot) {
    return (
      <span className={cx(t.screen11, "tracking-[0.08em]", labelInk)}>{label}</span>
    );
  }
  return (
    <img
      src={shot}
      alt=""
      className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
    />
  );
}

/**
 * The cartridge, running — laid over the library rather than replacing it, so
 * closing it puts the library back exactly as it was.
 *
 * The 4:3 block in the middle is where the emulator's own output will go. The
 * design draws it as the cartridge tint with the title over it, and that is
 * what stands in until the core is wired up.
 *
 * Takes focus itself, and takes it back whenever the last thing over it
 * closes. Otherwise focus would be left on whichever menu button was clicked
 * last, and space — which is a keypress like any other, but also how a browser
 * presses a focused button — would fire that button again.
 */
export function PlayOverlay({ v }: { v: Vals }) {
  const root = useRef<HTMLDivElement>(null);
  const covered = v.paused || v.savesOpen || v.settingsOpen;

  useEffect(() => {
    if (v.playing && !covered) root.current?.focus();
  }, [v.playing, covered]);

  if (!v.playing) return null;

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="absolute inset-0 z-[3] flex flex-col bg-void outline-none"
    >
      <div
        {...dragRegion}
        className="flex h-[44px] flex-none items-center gap-[16px] border-b-2 border-void-rule pr-[8px] pl-[18px]"
      >
        <span className={cx(t.pixel10, "text-paper")}>{v.selName}</span>
        <span className={cx(t.screen11, "text-void-dim")}>{v.playStatus}</span>
        <div {...dragRegion} className="h-full flex-1" />
        <span className={cx(t.screen11, "text-void-dim")}>{v.menuHint}</span>
        <button
          onClick={v.openMenu}
          aria-label="Open menu"
          className={cx(
            "flex h-[36px] w-[36px] cursor-pointer items-center justify-center text-void-dim hover:bg-accent hover:text-on-accent",
            t.pixel11,
          )}
        >
          X
        </button>
      </div>

      {v.live ? (
        // Running, the canvas takes the whole play area rather than sitting in
        // the design's framed box. The tube centres the picture inside it and
        // paints its own ground, so the room around it belongs to the shader —
        // which is where a glow would go.
        <div className="relative min-h-0 flex-1">
          <canvas ref={v.attachScreen} className="block h-full w-full" />
          {v.showFps && (
            // SHOW IN CORNER, as the setting says. Over the picture rather
            // than in the strip, which carries its own readout regardless.
            <div
              className={cx(
                "pointer-events-none absolute top-[10px] left-[12px] bg-caption px-[7px] py-[5px] text-paper",
                t.screen11,
              )}
            >
              {v.fpsReadout}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-[26px]">
          <div
            className={cx(
              "relative flex h-full aspect-[4/3] items-center justify-center border-2 border-void-rule",
              v.selTint,
            )}
          >
            <div className="relative z-[2] flex flex-col items-center gap-[16px]">
              <div className={cx(t.pixel26, "tracking-[0.02em] text-white/94")}>
                {v.selName}
              </div>
              <div className={cx(t.screen13, "tracking-[0.1em] text-white/66")}>
                {v.say(v.consoleError ? "play_failed" : "play_output")}
              </div>
              {v.consoleError && (
                <div
                  className={cx(
                    t.screen11,
                    "max-w-[520px] text-center leading-[1.6] text-white/66",
                  )}
                >
                  {v.consoleError}
                </div>
              )}
            </div>
            <div className="absolute inset-0 scanlines-picture" />
          </div>
        </div>
      )}
    </div>
  );
}

/** ESC over a running cartridge: the six things you can do to it. */
export function PauseModal({ v }: { v: Vals }) {
  if (!v.paused) return null;

  return (
    <div className="absolute inset-0 z-[4] flex items-center justify-center bg-scrim">
      <div className="w-[440px] border-[3px] border-ink bg-paper shadow-modal">
        <div className="flex h-[52px] items-center justify-between bg-ink pr-[8px] pl-[18px]">
          <h2 className={cx(t.pixel12, "text-paper")}>{v.say("paused")}</h2>
          <button
            onClick={v.resume}
            aria-label="Resume"
            className={cx(
              "flex h-[36px] w-[36px] cursor-pointer items-center justify-center text-dim hover:text-on-accent",
              t.pixel11,
            )}
          >
            X
          </button>
        </div>

        <div className="flex flex-col gap-[6px] border-b-2 border-rule px-[16px] pt-[14px] pb-[10px]">
          <span className={cx(t.pixel11, "text-ink")}>{v.selName}</span>
          <span className={cx(t.screen11, "text-mute")}>{v.selMeta}</span>
        </div>

        <div className="flex flex-col gap-[4px] p-[12px]">
          {v.menu.map((it) => (
            <button
              key={it.label}
              onClick={it.act}
              className="flex h-[48px] cursor-pointer items-center justify-between gap-[12px] border-2 border-rule bg-card px-[14px] hover:border-ink hover:bg-panel"
            >
              <span className={cx(t.pixel10, "text-ink")}>{it.label}</span>
              <span className={cx(t.screen11, "text-dim")}>{it.accelerator}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Eight slots, each with the same capture slot the library cards use.
 *
 * Four across while the modal has its full 1020px, fewer once the window is
 * narrow enough to squeeze it: the modal gives up 80px to the room around it,
 * so at the 1000px minimum it is 914px and the slots go three across rather
 * than four thumbnails at 200px. A container query, so the steps are read off
 * the modal's own width rather than off the window's minus that 80.
 */
export function SavesModal({ v }: { v: Vals }) {
  if (!v.savesOpen) return null;

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-scrim">
      <div className="@container flex w-[1020px] max-w-[calc(100%-80px)] flex-col border-[3px] border-ink bg-paper shadow-modal">
        <div className="flex h-[56px] flex-none items-center gap-[14px] bg-ink pr-[8px] pl-[20px]">
          <h2 className={cx(t.pixel12, "text-paper")}>{v.say("saves_title")}</h2>
          <span className={cx(t.screen12, "text-dim")}>{v.selName}</span>
          <div className="flex-1" />
          <button
            onClick={v.closeSaves}
            aria-label="Close save states"
            className={cx(
              "flex h-[38px] w-[38px] cursor-pointer items-center justify-center text-dim hover:text-on-accent",
              t.pixel11,
            )}
          >
            X
          </button>
        </div>

        <div
          className={cx(
            "grid gap-[16px] p-[22px]",
            "grid-cols-1 @min-[520px]:grid-cols-2 @min-[770px]:grid-cols-3",
            "@min-[1000px]:grid-cols-4",
          )}
        >
          {v.slots.map((slot) => (
            <button
              key={slot.key}
              onClick={slot.pick}
              className={cx(
                "flex cursor-pointer flex-col border-2 text-left hover:border-ink",
                slot.card,
              )}
            >
              <div
                className={cx(
                  "relative flex aspect-[4/3] items-center justify-center border-b-2",
                  slot.rule,
                  slot.shot,
                )}
              >
                <SlotShot
                  slot={slot.key}
                  hasShot={slot.hasShot}
                  label={slot.shotLabel}
                  labelInk={slot.shotFg}
                />
                <div className={cx("absolute inset-0 scanlines-shot", slot.scan)} />
                <div
                  className={cx(
                    "absolute top-0 left-0 px-[6px] py-[4px]",
                    t.pixel9,
                    slot.badge,
                  )}
                >
                  {slot.no}
                </div>
              </div>
              <div className="flex flex-col gap-[7px] px-[11px] pt-[10px] pb-[12px]">
                <div className={cx(t.screen11, "text-ink")}>{slot.stamp}</div>
                <div className={cx(t.screen11, "text-dim")}>{slot.detail}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex h-[64px] flex-none items-center gap-[12px] border-t-2 border-rule bg-panel px-[22px]">
          <span className={cx(t.screen11, "text-mute")}>{v.slotStatus}</span>
          <div className="flex-1" />
          <button
            onClick={v.closeSaves}
            className={cx(
              "flex h-[40px] cursor-pointer items-center border-2 border-ink bg-paper px-[18px] text-ink hover:bg-hover-face",
              t.pixel9,
            )}
          >
            {v.say("cancel")}
          </button>
          <button
            onClick={v.commitSlot}
            className={cx(
              "flex h-[40px] cursor-pointer items-center border-2 border-ink px-[18px] shadow-press hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-press-in",
              t.pixel9,
              v.loadFace,
            )}
          >
            {v.loadLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
