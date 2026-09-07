import { useEffect, useState } from "react";
import { StarGlyph } from "../design/Glyphs";
import { CAPS, cx, t } from "../design/type";
import { api } from "../library/api";
import type { Vals } from "../state/useShell";

/**
 * The capture slot on a card: a frame of the game, once one has been kept.
 *
 * Until then the design's own stand-in shows — the cartridge tint under its
 * initials, labelled NO CAPTURE. Art is written the first time a cartridge is
 * played, five seconds in, so a card fills itself by being used.
 */
function Capture({
  path,
  hasArt,
  initials,
}: {
  path: string;
  hasArt: boolean;
  initials: string;
}) {
  const [art, setArt] = useState<string | null>(null);

  useEffect(() => {
    if (!hasArt) {
      setArt(null);
      return;
    }
    let alive = true;
    void api.art(path).then((url) => {
      if (alive) setArt(url);
    });
    return () => {
      alive = false;
    };
  }, [path, hasArt]);

  if (!art) {
    return (
      <span className={cx(t.pixel22, "text-white/90")}>{initials}</span>
    );
  }
  return (
    <img
      src={art}
      alt=""
      // Nearest-neighbour, or a 256x240 frame scaled up would come out
      // blurred — the one thing this design cannot have.
      className="absolute inset-0 h-full w-full object-cover [image-rendering:pixelated]"
    />
  );
}

/** The scrolling middle of the window: a headline, then cards or a list. */
export function LibraryPane({ v }: { v: Vals }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[28px] pt-[26px] pb-[30px]">
      <header className="flex items-baseline gap-[12px] pb-[20px]">
        <h1 className={cx(t.pixel12, "text-ink")}>{v.headline}</h1>
        <span className={cx(t.screen12, "text-dim")}>{v.headlineSub}</span>
      </header>

      {v.error && <Trouble v={v} message={v.error} />}
      {!v.error && v.empty && <Empty v={v} />}
      {!v.error && !v.empty && v.isGrid && <CardGrid v={v} />}
      {!v.error && !v.empty && v.isList && <RomList v={v} />}
    </div>
  );
}

/**
 * A library with nothing in it.
 *
 * The design never drew this state — it was mocked up against a full shelf —
 * but a fresh install has no folders at all, and a blank grid with no way
 * forward is not a screen. Built from the pieces the design does define: the
 * dashed drop target from the PATHS pane, and its own type scale.
 */
function Empty({ v }: { v: Vals }) {
  return (
    <div className="flex flex-col items-center gap-[16px] border-2 border-dashed border-rule-mid px-[28px] py-[64px]">
      <div className={cx(t.pixel12, "text-ink")}>
        {v.say(v.hasFolders ? "empty_found" : "empty_none")}
      </div>
      <div className={cx(t.screen12, "text-dim")}>
        {v.hasFolders
          ? v.say("empty_found_sub")
          : v.say("empty_none_sub")}
      </div>
      <button
        onClick={v.addFolder}
        className={cx(
          "mt-[8px] flex h-[44px] cursor-pointer items-center gap-[9px] border-2 border-ink bg-paper px-[20px] text-ink shadow-press hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-press-in",
          t.pixel9,
        )}
      >
        <span className={t.pixel11}>+</span>
        <span>{v.say("add_folder")}</span>
      </button>
    </div>
  );
}

/** Something the Rust side refused to do, said plainly rather than swallowed. */
function Trouble({ v, message }: { v: Vals; message: string }) {
  return (
    <div className="flex flex-col gap-[12px] border-2 border-accent bg-card px-[18px] py-[16px]">
      <div className={cx(t.pixel10, "text-accent")}>{v.say("library_error")}</div>
      <div className={cx(t.screen11, "leading-[1.6] text-mute")}>{message}</div>
    </div>
  );
}

/**
 * The shelf: five across at the design's own size, fewer as the window narrows.
 *
 * The steps are container queries against the space beside the rail — see
 * [`App`] — rather than against the window, so the rail's width is not a
 * number repeated here, and rather than against this pane, whose own width
 * moves by a scrollbar's worth the moment the shelf is long enough to scroll.
 * A count that changed on scrolling would be worse than a wrong count.
 *
 * At the design's 1446px window that space is 1201px, the pane keeps 56px of
 * it as padding, and five columns with four 20px gaps put a card at 213px —
 * which is the design's own card. Each step down is roughly a card and a gap
 * narrower, set a little under where the columns stop fitting so the design's
 * width lands inside the five-column step rather than on its edge.
 *
 * The narrowest window the app allows is 1000px, which is three columns. The
 * last two steps are for a window that can go narrower than that, or a rail
 * that one day folds away.
 */
function CardGrid({ v }: { v: Vals }) {
  return (
    <div
      className={cx(
        "grid gap-[20px]",
        "grid-cols-1 @min-[480px]:grid-cols-2 @min-[715px]:grid-cols-3",
        "@min-[950px]:grid-cols-4 @min-[1180px]:grid-cols-5",
      )}
    >
      {v.cards.map((rom) => (
        <button
          key={rom.key}
          onClick={rom.play}
          className={cx(
            "flex cursor-pointer flex-col border-2 text-left hover:translate-x-[-2px] hover:translate-y-[-2px] hover:border-ink hover:shadow-lift",
            rom.card,
          )}
        >
          <div
            className={cx(
              "relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b-2",
              rom.rule,
              rom.tint,
            )}
          >
            <Capture path={rom.path} hasArt={rom.hasArt} initials={rom.initials} />
            <div className="absolute inset-0 scanlines-card" />
            <div
              className={cx(
                "absolute bottom-0 left-0 bg-caption px-[7px] py-[5px] tracking-[0.06em] text-paper",
                t.screen10,
              )}
            >
              {rom.capture}
            </div>
            <span
              role="button"
              tabIndex={-1}
              aria-label={rom.favorite ? `Unfavourite ${rom.name}` : `Favourite ${rom.name}`}
              // Stopped here, or the click would fall through to the card and
              // launch the cartridge instead of starring it.
              onClick={(e) => {
                e.stopPropagation();
                rom.star_();
              }}
              className="absolute top-[6px] right-[6px] flex cursor-pointer p-[2px]"
            >
              <StarGlyph ink={rom.star} />
            </span>
          </div>
          <div className="flex flex-col gap-[8px] px-[11px] pt-[11px] pb-[12px]">
            <div
              className={cx(
                "line-clamp-2 min-h-[30px] leading-[1.5] text-ink",
                t.pixel10,
              )}
            >
              {rom.name}
            </div>
            <div className={cx("truncate text-mute", t.screen11)}>{rom.meta}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/** The same cartridges as rows, with mapper, last played and playtime as columns. */
function RomList({ v }: { v: Vals }) {
  const cell = cx(t.screen11, "flex-none text-mute");

  return (
    <div className="flex flex-col border-2 border-ink bg-card">
      <div className="flex h-[40px] items-center gap-[16px] border-b-2 border-ink bg-panel px-[14px]">
        <div className="w-[34px] flex-none" />
        <div className={cx(CAPS, "min-w-0 flex-1")}>{v.say("col_title")}</div>
        <div className={cx(CAPS, "w-[170px] flex-none")}>{v.say("col_mapper")}</div>
        <div className={cx(CAPS, "w-[150px] flex-none")}>{v.say("col_played")}</div>
        <div className={cx(CAPS, "w-[110px] flex-none")}>{v.say("col_playtime")}</div>
        <div className="w-[24px] flex-none" />
      </div>

      {v.cards.map((rom) => (
        <button
          key={rom.key}
          onClick={rom.play}
          className={cx(
            "flex h-[52px] cursor-pointer items-center gap-[16px] border-b-2 border-rule-soft px-[14px] text-left hover:bg-hover-row",
            rom.row,
          )}
        >
          <div
            className={cx(
              "flex h-[26px] w-[34px] flex-none items-center justify-center",
              rom.tint,
            )}
          >
            <span className={cx(t.pixel9, "text-white/90")}>{rom.initials}</span>
          </div>
          <div className={cx("min-w-0 flex-1 truncate text-ink", t.pixel10)}>{rom.name}</div>
          <div className={cx(cell, "w-[170px]")}>{rom.mapper}</div>
          <div className={cx(cell, "w-[150px]")}>{rom.when}</div>
          <div className={cx(cell, "w-[110px]")}>{rom.played}</div>
          <span
            role="button"
            tabIndex={-1}
            aria-label={rom.favorite ? `Unfavourite ${rom.name}` : `Favourite ${rom.name}`}
            onClick={(e) => {
              e.stopPropagation();
              rom.star_();
            }}
            className="flex w-[24px] flex-none cursor-pointer justify-start"
          >
            <StarGlyph ink={rom.starInk} />
          </span>
        </button>
      ))}
    </div>
  );
}

/** The bottom rule: what the library holds, and the keys that drive it. */
export function StatusBar({ v }: { v: Vals }) {
  return (
    <footer className="flex h-[36px] flex-none items-center gap-[22px] border-t-2 border-rule bg-panel px-[20px]">
      <span className={cx(t.screen11, "text-mute")}>{v.statusLeft}</span>
      <div className="flex-1" />
      {v.hints.map((hint) => (
        <div key={hint.key} className="flex items-center gap-[7px]">
          <kbd
            className={cx(
              "border-2 border-rule-mid px-[5px] py-[4px] not-italic text-ink",
              t.pixel8,
            )}
          >
            {hint.key}
          </kbd>
          <span className={cx(t.screen11, "text-dim")}>{hint.label}</span>
        </div>
      ))}
    </footer>
  );
}
