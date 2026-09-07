import { dragRegion } from "../design/drag";
import { GridGlyph, ListGlyph, SearchGlyph, SortGlyph } from "../design/Glyphs";
import { cx, t } from "../design/type";
import { windowControls } from "../shell/window";
import type { Vals } from "../state/useShell";

/**
 * The title strip over the library: search, sort, the two view modes, and the
 * window's own buttons.
 *
 * The strip drags the window. Only the element carrying the attribute drags,
 * so the controls on it need no opt-out — but the spacer does, or the widest
 * part of the strip would be dead to the pointer.
 */
export function TopBar({ v }: { v: Vals }) {
  return (
    <div
      {...dragRegion}
      className="flex h-[58px] flex-none items-center gap-[14px] border-b-[3px] border-ink bg-paper pr-[10px] pl-[20px]"
    >
      {/* Search */}
      <div className="flex h-[38px] max-w-[420px] flex-1 items-center border-2 border-ink bg-card">
        <SearchGlyph />
        <input
          ref={v.searchRef}
          value={v.query}
          onChange={v.onQuery}
          placeholder={v.say("search_hint")}
          className={cx("h-full min-w-0 flex-1 border-none bg-transparent text-ink outline-none", t.pixel10)}
        />
      </div>

      {/* Sort order, cycled */}
      <button
        onClick={v.cycleSort}
        className={cx(
          "flex h-[38px] cursor-pointer items-center gap-[9px] border-2 border-ink bg-panel px-[13px] text-ink hover:bg-hover-face",
          t.pixel9,
        )}
      >
        <SortGlyph />
        <span>{v.sortLabel}</span>
      </button>

      {/* Cards or list */}
      <div className="flex h-[38px] items-stretch border-2 border-ink">
        <button
          onClick={v.setGrid}
          aria-label="Card view"
          className={cx("flex w-[40px] cursor-pointer items-center justify-center", v.gridFace)}
        >
          <GridGlyph ink={v.gridInk} />
        </button>
        <div className="w-[2px] bg-ink" />
        <button
          onClick={v.setList}
          aria-label="List view"
          className={cx("flex w-[40px] cursor-pointer items-center justify-center", v.listFace)}
        >
          <ListGlyph ink={v.listInk} />
        </button>
      </div>

      <div {...dragRegion} className="h-full flex-1" />

      {/* The window's own buttons */}
      <div className="flex items-center gap-[2px]">
        <button
          onClick={windowControls.minimize}
          aria-label="Minimize"
          className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center hover:bg-hover-btn"
        >
          <div className="h-[2px] w-[13px] bg-slate" />
        </button>
        <button
          onClick={windowControls.toggleMaximize}
          aria-label="Maximize"
          className="flex h-[36px] w-[36px] cursor-pointer items-center justify-center hover:bg-hover-btn"
        >
          <div className="h-[12px] w-[12px] border-2 border-slate" />
        </button>
        <button
          onClick={windowControls.close}
          aria-label="Close"
          className={cx(
            "flex h-[36px] w-[36px] cursor-pointer items-center justify-center text-slate hover:bg-accent hover:text-on-accent",
            t.pixel11,
          )}
        >
          X
        </button>
      </div>
    </div>
  );
}
