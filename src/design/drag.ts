/**
 * Marks an element as one that drags the frameless window.
 *
 * The design marks its title strips with `-webkit-app-region: drag`, which is
 * Chromium's and does nothing in the WebKitGTK view Tauri uses on Linux. Tauri
 * reads this attribute instead, and only on the element that carries it —
 * never on its children. So controls sitting on a strip need no opt-out, while
 * the spacers between them do want one, or most of the strip would be dead.
 *
 *     <div {...dragRegion} className="...">
 */
export const dragRegion = { "data-tauri-drag-region": true } as const;
