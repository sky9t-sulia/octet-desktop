/**
 * Turning stored numbers into the strings the design shows.
 *
 * The design wrote its sample data out by hand — `2 DAYS AGO`, `11H 02M`,
 * `1.4 MB ON DISK`. These are the rules those strings follow, so real data
 * reads the same way the mock-up did.
 *
 * The ones with words in them take a [`Say`], because the words depend on the
 * language and the numbers do not. The ones without — bytes, kilobytes, a
 * mapper's name — are the same in every language and take nothing.
 */

import type { Say } from "../i18n";

const MINUTE = 60_000;
const DAY = 86_400_000;

/**
 * How long ago, in the design's vocabulary: `TODAY`, `YESTERDAY`,
 * `5 DAYS AGO`, `2 WEEKS AGO`, `1 MONTH AGO`.
 *
 * Counted in whole days elapsed rather than calendar boundaries, which is what
 * the design's own wording implies and what stays stable across a timezone.
 */
export function whenPlayed(say: Say, at: number | null | undefined): string {
  if (at == null) return say("when_never");
  const days = Math.floor((Date.now() - at) / DAY);
  if (days <= 0) return say("when_today");
  if (days === 1) return say("when_yesterday");
  if (days < 7) return say("when_days", { n: days });
  if (days < 14) return say("when_week");
  if (days < 28) return say("when_weeks", { n: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  return months <= 1 ? say("when_month") : say("when_months", { n: months });
}

/**
 * Playtime as `2H 41M`, or `38M` under the hour.
 *
 * Minutes are padded to two digits only when hours precede them, which is
 * where the design's `11H 02M` comes from.
 */
export function playtime(say: Say, minutes: number): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h
    ? say("span_hours", { h, m: String(m).padStart(2, "0") })
    : say("span_minutes", { m });
}

/** A cartridge's mapper and size, as one line: `MMC1 / 128 KB`. */
export const mapperAndSize = (mapper: string, sizeKb: number) =>
  `${mapper} / ${sizeKb} KB`;

/**
 * Bytes as the footer states them: `1.4 MB`, `840 KB`.
 *
 * Binary units, one decimal place past a megabyte and none below it.
 */
export function onDisk(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** How many minutes a session lasted, for accumulating playtime. */
export const minutesSince = (startedAt: number) =>
  Math.max(0, Math.round((Date.now() - startedAt) / MINUTE));

/**
 * When a save was written, as the browser labels it: `TODAY 14:22`.
 *
 * The day relative, the time absolute — which is how you tell two saves from
 * the same afternoon apart.
 */
export function savedAt(say: Say, at: number): string {
  const when = new Date(at);
  const clock = `${String(when.getHours()).padStart(2, "0")}:${String(
    when.getMinutes(),
  ).padStart(2, "0")}`;
  return `${whenPlayed(say, at)} ${clock}`;
}

/** A folder's own line in the sidebar and in PATHS. */
export function folderDetail(
  say: Say,
  count: number,
  enabled: boolean,
  readable: boolean,
): string {
  if (!readable) return say("folder_missing");
  const roms = `${count} ${say(count === 1 ? "rom_one" : "rom_many")}`;
  return enabled ? roms : say("folder_skipped", { roms });
}
