/**
 * The design's icons, rectangle for rectangle.
 *
 * Every one is drawn on a tiny integer grid and scaled up whole, with
 * `shapeRendering="crispEdges"` so the browser never softens an edge. That is
 * what keeps them reading as pixel art rather than as shrunken line art.
 *
 * Colour arrives as a `fill-*` class rather than an attribute, so these stay
 * inside the one palette like everything else.
 */

/** Three stepped bars: the sort order button. */
export function SortGlyph() {
  return (
    <svg
      width="17"
      height="9"
      viewBox="0 0 9 5"
      shapeRendering="crispEdges"
      className="block flex-none fill-mute"
    >
      <rect x="0" y="0" width="9" height="1" />
      <rect x="0" y="2" width="6" height="1" />
      <rect x="0" y="4" width="3" height="1" />
    </svg>
  );
}

/** Four squares: the card view toggle. */
export function GridGlyph({ ink }: { ink: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className={`block ${ink}`}
    >
      <rect x="0" y="0" width="3" height="3" />
      <rect x="4" y="0" width="3" height="3" />
      <rect x="0" y="4" width="3" height="3" />
      <rect x="4" y="4" width="3" height="3" />
    </svg>
  );
}

/** Four rules: the list view toggle. */
export function ListGlyph({ ink }: { ink: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className={`block ${ink}`}
    >
      <rect x="0" y="0" width="7" height="1" />
      <rect x="0" y="2" width="7" height="1" />
      <rect x="0" y="4" width="7" height="1" />
      <rect x="0" y="6" width="7" height="1" />
    </svg>
  );
}

/** The favourite star. In the list it is boxed wider than it draws. */
export function StarGlyph({ ink, wide }: { ink: string; wide?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      className={`block ${ink} ${wide ? "w-[24px] flex-none" : ""}`}
    >
      <rect x="1" y="0" width="2" height="1" />
      <rect x="6" y="0" width="2" height="1" />
      <rect x="0" y="1" width="4" height="1" />
      <rect x="5" y="1" width="4" height="1" />
      <rect x="0" y="2" width="9" height="1" />
      <rect x="0" y="3" width="9" height="1" />
      <rect x="0" y="4" width="9" height="1" />
      <rect x="1" y="5" width="7" height="1" />
      <rect x="2" y="6" width="5" height="1" />
      <rect x="3" y="7" width="3" height="1" />
      <rect x="4" y="8" width="1" height="1" />
    </svg>
  );
}

/** A stepped triangle: the language dropdown's caret. `flip` turns it over. */
export function CaretGlyph({ flip }: { flip: string }) {
  return (
    <svg
      width="13"
      height="8"
      viewBox="0 0 7 4"
      shapeRendering="crispEdges"
      className={`block flex-none fill-ink ${flip}`}
    >
      <rect x="0" y="0" width="7" height="1" />
      <rect x="1" y="1" width="5" height="1" />
      <rect x="2" y="2" width="3" height="1" />
      <rect x="3" y="3" width="1" height="1" />
    </svg>
  );
}

/** The search field's magnifier, built from a bordered box and its handle. */
export function SearchGlyph() {
  return (
    <div className="flex w-[38px] flex-none items-center justify-center">
      <div className="relative h-[11px] w-[11px] border-[3px] border-mute">
        <div className="absolute right-[-5px] bottom-[-7px] h-[7px] w-[3px] rotate-[-45deg] bg-mute" />
      </div>
    </div>
  );
}

/** The three bars on the settings button. */
export function MenuGlyph() {
  return (
    <div className="flex flex-none flex-col gap-[3px]">
      <div className="h-[2px] w-[14px] bg-ink" />
      <div className="h-[2px] w-[14px] bg-ink" />
      <div className="h-[2px] w-[14px] bg-ink" />
    </div>
  );
}
