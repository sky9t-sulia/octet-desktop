import { dragRegion } from "../design/drag";
import { MenuGlyph } from "../design/Glyphs";
import { CAPS, cx, t } from "../design/type";
import type { Vals } from "../state/useShell";

/**
 * The left rail: the mark, the library tabs, the folders, and the way in to
 * settings.
 *
 * Inert while a cartridge runs, along with the rest of the library — see
 * [`App`].
 */
export function Sidebar({ v }: { v: Vals }) {
  return (
    <div
      className="flex w-[236px] flex-none flex-col border-r-[3px] border-ink bg-panel"
      inert={v.playing}
    >
      {/* The mark sits in the title strip, and drags the window with it. */}
      <div
        {...dragRegion}
        className="flex h-[58px] flex-none items-center gap-[11px] border-b-2 border-rule px-[18px]"
      >
        <div
          {...dragRegion}
          className="flex h-[22px] w-[22px] flex-none items-center justify-center bg-accent"
        >
          <div className="h-[8px] w-[8px] bg-panel" />
        </div>
        <div {...dragRegion} className={cx("flex-1 tracking-[-0.01em] text-ink", t.pixel15)}>
          OCTET
        </div>
      </div>

      {/* ── LIBRARY ── */}
      <section className="flex flex-col gap-[10px] px-[14px] pt-[22px] pb-[8px]">
        <h2 className={cx(CAPS, "px-[4px]")}>{v.say("nav_library")}</h2>
        <div className="flex flex-col gap-[4px]">
          {v.navs.map((nav) => (
            <button
              key={nav.label}
              onClick={nav.pick}
              className={cx(
                "flex h-[42px] cursor-pointer items-center gap-[10px] border-2 px-[12px] text-left hover:border-ink",
                nav.box,
              )}
            >
              <div className={cx("h-[9px] w-[9px] flex-none", nav.dot)} />
              <div className={cx("min-w-0 flex-1", t.pixel10, nav.fg)}>{nav.label}</div>
              <div className={cx(t.screen11, "text-dim")}>{nav.count}</div>
            </button>
          ))}
        </div>
      </section>

      {/* ── FOLDERS ── */}
      <section className="flex flex-col gap-[10px] px-[14px] pt-[22px] pb-[8px]">
        <div className="flex items-center justify-between px-[4px]">
          <h2 className={CAPS}>{v.say("nav_folders")}</h2>
          <button
            onClick={v.addFolder}
            aria-label="Add ROM folder"
            className={cx("cursor-pointer text-mute hover:text-ink", t.pixel10)}
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-[2px]">
          {v.folders.map((fold) => (
            <button
              key={fold.key}
              onClick={fold.pick}
              title={fold.name}
              className="flex h-[36px] cursor-pointer items-center gap-[9px] px-[12px] text-left hover:bg-hover-panel"
            >
              <div className="h-[8px] w-[11px] flex-none border-2 border-rule-mid" />
              <div className={cx("min-w-0 flex-1 truncate text-slate", t.screen11)}>
                {fold.name}
              </div>
              <div className={cx(t.screen11, "text-dim")}>{fold.n}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="flex-1" />

      {/* ── Footer: what is on disk, and settings ── */}
      <div className="flex flex-col gap-[8px] border-t-2 border-rule p-[14px]">
        <div className={cx("px-[4px] leading-[1.6] text-dim", t.screen11)}>{v.diskLabel}</div>
        <button
          onClick={v.openSettings}
          className={cx(
            "flex h-[42px] cursor-pointer items-center gap-[10px] border-2 border-ink bg-paper px-[12px] text-ink hover:bg-hover-face",
            t.pixel9,
          )}
        >
          <MenuGlyph />
          <span>{v.say("nav_settings")}</span>
        </button>
      </div>
    </div>
  );
}
