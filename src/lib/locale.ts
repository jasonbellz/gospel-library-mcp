/**
 * locale.ts — OS locale detection and Gospel Library language code mapping
 *
 * Detects the user's OS locale at startup and maps it to a Gospel Library
 * lang code (e.g. "es-MX" → "spa"). Falls back to "eng" if unrecognized.
 */

// BCP 47 language tag (lowercase) → Gospel Library lang code
const LOCALE_MAP: Record<string, string> = {
  // English
  "en": "eng",
  // Spanish
  "es": "spa",
  // Portuguese
  "pt": "por",
  // French
  "fr": "fra",
  // German
  "de": "deu",
  // Italian
  "it": "ita",
  // Japanese
  "ja": "jpn",
  // Korean
  "ko": "kor",
  // Chinese Simplified
  "zh-hans": "zhs", "zh-cn": "zhs", "zh-sg": "zhs", "zh": "zhs",
  // Chinese Traditional
  "zh-hant": "zht", "zh-tw": "zht", "zh-hk": "zht", "zh-mo": "zht",
  // Russian
  "ru": "rus",
  // Filipino / Tagalog
  "tl": "tgl", "fil": "tgl",
  // Dutch
  "nl": "nld",
  // Swedish
  "sv": "swe",
  // Norwegian
  "no": "nor", "nb": "nor", "nn": "nor",
  // Danish
  "da": "dan",
  // Finnish
  "fi": "fin",
  // Polish
  "pl": "pol",
  // Ukrainian
  "uk": "ukr",
  // Hungarian
  "hu": "hun",
  // Czech
  "cs": "ces",
  // Romanian
  "ro": "ron",
  // Bulgarian
  "bg": "bul",
  // Greek
  "el": "ell",
  // Turkish
  "tr": "tur",
  // Arabic
  "ar": "ara",
  // Hebrew
  "he": "heb",
  // Thai
  "th": "tha",
  // Indonesian
  "id": "ind",
  // Malay
  "ms": "msa",
  // Vietnamese
  "vi": "vie",
  // Khmer / Cambodian
  "km": "khm",
  // Burmese / Myanmar
  "my": "mya",
  // Mongolian
  "mn": "mon",
  // Samoan
  "sm": "smo",
  // Tongan
  "to": "ton",
  // Hawaiian
  "haw": "haw",
  // Māori
  "mi": "mao",
  // Fijian
  "fj": "fij",
};

/**
 * Detect the Gospel Library lang code for the current OS locale.
 * Tries the full BCP 47 tag first (e.g. "zh-TW"), then the base language (e.g. "zh").
 * Returns "eng" if the locale is unrecognized.
 */
export function detectLang(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const lower = locale.toLowerCase();
    if (LOCALE_MAP[lower]) return LOCALE_MAP[lower];
    const base = lower.split("-")[0];
    return LOCALE_MAP[base] ?? "eng";
  } catch {
    return "eng";
  }
}

/** The Gospel Library lang code resolved from the OS locale at startup. */
export const DEFAULT_LANG: string = detectLang();
