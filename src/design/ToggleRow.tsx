import { cx, t } from "./type";

/**
 * A labelled setting with a hard ON / OFF pair.
 *
 * The same row appears under all four settings categories, so it is written
 * once. Which half is lit arrives as a class from the state, not as a colour.
 */
export type Toggle = {
  label: string;
  sub: string;
  on: string;
  off: string;
  /** The two words themselves, which are English on the phone as well. */
  onLabel: string;
  offLabel: string;
  flip: () => void;
};

export function ToggleRow({ tg }: { tg: Toggle }) {
  return (
    <button
      onClick={tg.flip}
      role="switch"
      className="flex min-h-[56px] cursor-pointer items-center gap-[14px] border-2 border-rule bg-card px-[14px] py-[10px] text-left hover:border-rule-mid"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
        <div className={cx(t.pixel10, "text-ink")}>{tg.label}</div>
        <div className={cx(t.screen11, "text-dim")}>{tg.sub}</div>
      </div>
      <div className="flex h-[30px] flex-none border-2 border-ink">
        <div className={cx("flex w-[38px] items-center justify-center", t.pixel9, tg.on)}>
          {tg.onLabel}
        </div>
        <div className="w-[2px] bg-ink" />
        <div className={cx("flex w-[38px] items-center justify-center", t.pixel9, tg.off)}>
          {tg.offLabel}
        </div>
      </div>
    </button>
  );
}

/**
 * A row of mutually exclusive buttons — theme, scaling, filter.
 *
 * Fills whatever it is put in; the segments share the width equally.
 */
export function Segments({
  items,
  size = t.pixel9,
}: {
  items: { key: number; label: string; face: string; pick: () => void }[];
  size?: string;
}) {
  return (
    <div className="flex gap-[8px]">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={it.pick}
          className={cx(
            "flex h-[44px] flex-1 cursor-pointer items-center justify-center border-2 border-ink",
            size,
            it.face,
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
