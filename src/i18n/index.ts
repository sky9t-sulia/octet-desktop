/**
 * What language the app speaks.
 *
 * The list is octet-android's, tag for tag, so the two apps offer the same
 * choice and a player who set the phone to Ukrainian finds Ukrainian here.
 * `SYS` follows whatever the desktop is set to.
 *
 * Lookup falls back rather than fails: a key with no translation in the
 * chosen language comes back in English, which reads worse than a translation
 * and better than a key name.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DE } from "./de";
import { EN, type Dict, type Key } from "./en";
import { ES } from "./es";
import { FR } from "./fr";
import { IT } from "./it";
import { PL } from "./pl";
import { PT } from "./pt";
import { RU } from "./ru";
import { TR } from "./tr";
import { UK } from "./uk";

export type { Key } from "./en";

/**
 * One choice in the LANGUAGE list: the tag to ask for, the two letters the
 * field shows, and the language's name in itself — a name nobody has to
 * already speak the app's language to recognise.
 */
export type Lang = { tag: string | null; code: string; name: string };

/** The same list, in the same order, as `languages()` on Android. */
export const LANGS: Lang[] = [
  { tag: null, code: "SYS", name: "SYSTEM DEFAULT" },
  { tag: "en", code: "EN", name: "ENGLISH" },
  { tag: "de", code: "DE", name: "DEUTSCH" },
  { tag: "es", code: "ES", name: "ESPAÑOL" },
  { tag: "fr", code: "FR", name: "FRANÇAIS" },
  { tag: "it", code: "IT", name: "ITALIANO" },
  { tag: "pl", code: "PL", name: "POLSKI" },
  { tag: "pt-BR", code: "PT", name: "PORTUGUÊS" },
  { tag: "ru", code: "RU", name: "РУССКИЙ" },
  { tag: "tr", code: "TR", name: "TÜRKÇE" },
  { tag: "uk", code: "UK", name: "УКРАЇНСЬКА" },
];

const DICTS: Record<string, Dict> = {
  en: EN,
  de: DE,
  es: ES,
  fr: FR,
  it: IT,
  pl: PL,
  "pt-BR": PT,
  ru: RU,
  tr: TR,
  uk: UK,
};

/**
 * Which of the tags a locale asks for, by its language part.
 *
 * `pt-PT` is not `pt-BR`, but Brazilian Portuguese is the Portuguese this app
 * has, and a Portuguese speaker reading it is better served than one reading
 * English.
 */
function match(locale: string): string | null {
  const want = locale.toLowerCase();
  for (const { tag } of LANGS) {
    if (tag && want === tag.toLowerCase()) return tag;
  }
  const lang = want.split("-")[0];
  for (const { tag } of LANGS) {
    if (tag && tag.toLowerCase().split("-")[0] === lang) return tag;
  }
  return null;
}

/** The first language the desktop asks for that this app has. */
export function systemTag(): string {
  for (const locale of navigator.languages ?? [navigator.language]) {
    const found = match(locale);
    if (found) return found;
  }
  return "en";
}

/** Puts values in a string's `{holes}`. */
export function format(text: string, holes?: Record<string, string | number>) {
  if (!holes) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in holes ? String(holes[name]) : whole,
  );
}

/** Says one thing in one language. */
export type Say = (key: Key, holes?: Record<string, string | number>) => string;

/** Says things in `tag`, falling back through English. */
export function sayer(tag: string): Say {
  const dict = DICTS[tag] ?? EN;
  return (key, holes) => format(dict[key] ?? EN[key], holes);
}

const STORED = "octet.language";

/** The language last chosen, as an index into [`LANGS`]. Zero is the system's. */
function loadLang(): number {
  try {
    const raw = window.localStorage.getItem(STORED);
    const at = LANGS.findIndex((lang) => lang.tag === raw);
    return raw === null || at < 0 ? 0 : at;
  } catch {
    return 0;
  }
}

/**
 * The chosen language, what it says, and how to change it.
 *
 * Also sets the document's own `lang`, which is what the platform reads to
 * pick hyphenation and a fallback face for the scripts the pixel fonts do not
 * carry.
 */
export function useLanguage() {
  const [lang, setLang] = useState<number>(loadLang);
  const tag = LANGS[lang]?.tag ?? systemTag();
  // Held, or every render would hand the shell a new function and make it
  // rebuild everything it derives.
  const say = useMemo(() => sayer(tag), [tag]);

  useEffect(() => {
    document.documentElement.lang = tag;
  }, [tag]);

  const choose = useCallback((at: number) => {
    setLang(at);
    try {
      const { tag: picked } = LANGS[at] ?? LANGS[0];
      if (picked === null) window.localStorage.removeItem(STORED);
      else window.localStorage.setItem(STORED, picked);
    } catch {
      // A session without storage keeps its choice until it closes.
    }
  }, []);

  return { lang, tag, say, choose };
}
