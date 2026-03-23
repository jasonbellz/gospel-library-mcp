/**
 * scripture.ts — Fetch a scripture passage by reference.
 *
 * Converts common scripture references (e.g. "John 3:16", "2 Nephi 2:25",
 * "D&C 76:22", "Moses 1:39") into Gospel Library URLs and fetches the content.
 */

import { getArticle, ArticleContent } from "./fetch.js";
import { DEFAULT_LANG } from "../lib/locale.js";

const BASE = "https://www.churchofjesuschrist.org";

// Maps common book names / abbreviations to their URL paths
const SCRIPTURE_MAP: Record<string, string> = {
  // Old Testament
  "genesis": "ot/gen", "gen": "ot/gen",
  "exodus": "ot/ex", "ex": "ot/ex",
  "leviticus": "ot/lev", "lev": "ot/lev",
  "numbers": "ot/num", "num": "ot/num",
  "deuteronomy": "ot/deut", "deut": "ot/deut",
  "joshua": "ot/josh", "josh": "ot/josh",
  "judges": "ot/judg", "judg": "ot/judg",
  "ruth": "ot/ruth",
  "1 samuel": "ot/1-sam", "1 sam": "ot/1-sam",
  "2 samuel": "ot/2-sam", "2 sam": "ot/2-sam",
  "1 kings": "ot/1-kgs", "1 kgs": "ot/1-kgs",
  "2 kings": "ot/2-kgs", "2 kgs": "ot/2-kgs",
  "1 chronicles": "ot/1-chr", "1 chr": "ot/1-chr",
  "2 chronicles": "ot/2-chr", "2 chr": "ot/2-chr",
  "ezra": "ot/ezra",
  "nehemiah": "ot/neh", "neh": "ot/neh",
  "esther": "ot/esth",
  "job": "ot/job",
  "psalms": "ot/ps", "psalm": "ot/ps", "ps": "ot/ps",
  "proverbs": "ot/prov", "prov": "ot/prov",
  "ecclesiastes": "ot/eccl", "eccl": "ot/eccl",
  "song of solomon": "ot/song",
  "isaiah": "ot/isa", "isa": "ot/isa",
  "jeremiah": "ot/jer", "jer": "ot/jer",
  "lamentations": "ot/lam",
  "ezekiel": "ot/ezek", "ezek": "ot/ezek",
  "daniel": "ot/dan", "dan": "ot/dan",
  "hosea": "ot/hosea",
  "joel": "ot/joel",
  "amos": "ot/amos",
  "obadiah": "ot/obad",
  "jonah": "ot/jonah",
  "micah": "ot/micah",
  "nahum": "ot/nahum",
  "habakkuk": "ot/hab",
  "zephaniah": "ot/zeph",
  "haggai": "ot/hag",
  "zechariah": "ot/zech", "zech": "ot/zech",
  "malachi": "ot/mal",
  // New Testament
  "matthew": "nt/matt", "matt": "nt/matt",
  "mark": "nt/mark",
  "luke": "nt/luke",
  "john": "nt/john",
  "acts": "nt/acts",
  "romans": "nt/rom", "rom": "nt/rom",
  "1 corinthians": "nt/1-cor", "1 cor": "nt/1-cor",
  "2 corinthians": "nt/2-cor", "2 cor": "nt/2-cor",
  "galatians": "nt/gal", "gal": "nt/gal",
  "ephesians": "nt/eph", "eph": "nt/eph",
  "philippians": "nt/philip", "philip": "nt/philip",
  "colossians": "nt/col", "col": "nt/col",
  "1 thessalonians": "nt/1-thes", "1 thes": "nt/1-thes",
  "2 thessalonians": "nt/2-thes", "2 thes": "nt/2-thes",
  "1 timothy": "nt/1-tim", "1 tim": "nt/1-tim",
  "2 timothy": "nt/2-tim", "2 tim": "nt/2-tim",
  "titus": "nt/titus",
  "philemon": "nt/philem",
  "hebrews": "nt/heb", "heb": "nt/heb",
  "james": "nt/james",
  "1 peter": "nt/1-pet", "1 pet": "nt/1-pet",
  "2 peter": "nt/2-pet", "2 pet": "nt/2-pet",
  "1 john": "nt/1-jn", "1 jn": "nt/1-jn",
  "2 john": "nt/2-jn", "2 jn": "nt/2-jn",
  "3 john": "nt/3-jn", "3 jn": "nt/3-jn",
  "jude": "nt/jude",
  "revelation": "nt/rev", "rev": "nt/rev",
  // Book of Mormon
  "1 nephi": "bofm/1-ne", "1 ne": "bofm/1-ne",
  "2 nephi": "bofm/2-ne", "2 ne": "bofm/2-ne",
  "jacob": "bofm/jacob",
  "enos": "bofm/enos",
  "jarom": "bofm/jarom",
  "omni": "bofm/omni",
  "words of mormon": "bofm/w-of-m",
  "mosiah": "bofm/mosiah",
  "alma": "bofm/alma",
  "helaman": "bofm/hel", "hel": "bofm/hel",
  "3 nephi": "bofm/3-ne", "3 ne": "bofm/3-ne",
  "4 nephi": "bofm/4-ne", "4 ne": "bofm/4-ne",
  "mormon": "bofm/morm", "morm": "bofm/morm",
  "ether": "bofm/ether",
  "moroni": "bofm/moro", "moro": "bofm/moro",
  // Doctrine & Covenants
  "doctrine and covenants": "dc-testament/dc", "d&c": "dc-testament/dc", "dc": "dc-testament/dc",
  // Pearl of Great Price
  "moses": "pgp/moses",
  "abraham": "pgp/abr", "abr": "pgp/abr",
  "joseph smith history": "pgp/js-h", "js-h": "pgp/js-h",
  "joseph smith matthew": "pgp/js-m", "js-m": "pgp/js-m",
  "articles of faith": "pgp/a-of-f", "a of f": "pgp/a-of-f",
};

export interface ScriptureResult extends ArticleContent {
  reference: string;
}

/**
 * Fetch a scripture passage by reference.
 * Examples: "John 3:16", "2 Nephi 2:25", "D&C 76", "Moses 1:39"
 */
export async function getScripture(reference: string, lang?: string): Promise<ScriptureResult> {
  const url = referenceToUrl(reference, lang ?? DEFAULT_LANG);
  const article = await getArticle(url);
  return { ...article, reference };
}

/**
 * Convert a scripture reference string to a Gospel Library URL.
 */
export function referenceToUrl(reference: string, lang: string = DEFAULT_LANG): string {
  const ref = reference.trim();

  // Try to parse: "<book> <chapter>:<verse>" or "<book> <chapter>"
  const match = ref.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i);
  if (!match) {
    throw new Error(
      `Cannot parse scripture reference: "${reference}". ` +
        `Expected format like "John 3:16", "2 Nephi 2", "D&C 76:22".`
    );
  }

  const bookName = match[1].toLowerCase().trim();
  const chapter = match[2];
  const verseStart = match[3];
  const verseEnd = match[4];

  const bookPath = SCRIPTURE_MAP[bookName];
  if (!bookPath) {
    throw new Error(
      `Unknown book: "${match[1]}". ` +
        `Try using the full book name (e.g. "1 Nephi" instead of "1Ne").`
    );
  }

  let path = `/study/scriptures/${bookPath}/${chapter}`;
  if (verseStart) {
    path += `.${verseStart}`;
    if (verseEnd) path += `-${verseEnd}`;
  }
  path += `?lang=${lang}`;

  if (verseStart) {
    path += `#p${verseStart}`;
  }

  return `${BASE}${path}`;
}
