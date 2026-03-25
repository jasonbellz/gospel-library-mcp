/**
 * browse.ts — Browse a Gospel Library category or collection index page.
 *
 * Fetches a category page (e.g. /study/general-conference/2024/10) and returns
 * the list of articles/talks with their titles and URLs.
 */

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { DEFAULT_LANG } from "../lib/locale.js";

const BASE = "https://www.churchofjesuschrist.org";

export interface ArticleLink {
  title: string;
  url: string;
  description?: string;
}

export interface CategoryPage {
  title: string;
  url: string;
  articles: ArticleLink[];
  notFound?: boolean;   // true when the path returned HTTP 404
  suggestion?: string;  // guidance shown to Copilot when notFound
}

/**
 * Browse a category index page.
 * @param category - a path like "general-conference", "general-conference/2024/10",
 *                   "scriptures", "scriptures/bofm", etc.
 */
export async function browseCategory(category: string, lang?: string): Promise<CategoryPage> {
  const cleanCategory = category.replace(/^\/+|\/+$/g, "");
  const useLang = lang ?? DEFAULT_LANG;
  const url = `${BASE}/study/${cleanCategory}?lang=${useLang}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; GospelLibraryMCP/1.0; +https://github.com)",
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return {
        title: "Category Not Found",
        url,
        articles: [],
        notFound: true,
        suggestion:
          `The category path "${category}" was not found (HTTP 404).\n\n` +
          `IMPORTANT: Category paths are exact and often year-specific. Common mistakes:\n` +
          `  ❌ manual/come-follow-me\n` +
          `  ✅ manual/come-follow-me-for-individuals-and-families-new-testament-2023\n` +
          `  ✅ manual/come-follow-me-for-individuals-and-families-old-testament-2022\n` +
          `  ✅ manual/come-follow-me-for-sunday-school-new-testament-2023\n\n` +
          `Use search_gospel_library with a descriptive query to discover the correct path first.\n` +
          `Example: search_gospel_library(query="come follow me 2023 new testament")`,
      };
    }
    throw new Error(`Failed to fetch category ${category}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const pageTitle =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  const articles: ArticleLink[] = [];

  // Remove navigation and breadcrumb elements before scanning for article links
  // so that parent-path "back" links don't appear in the results list.
  $(
    "header, footer, nav, .nav, " +
      "[class*='breadcrumb'], [class*='navigation'], " +
      "[class*='lc-nav'], [class*='lc-header'], [class*='lc-footer']"
  ).remove();

  // Compute depth of the current category URL for ancestor-link filtering.
  const currentDepth = url.split("?")[0].split("/").filter(Boolean).length;

  // Find all internal study links
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";
    // Only include links to study content (not anchors, external links, etc.)
    if (!href.startsWith("/study/") && !href.startsWith("https://www.churchofjesuschrist.org/study/")) {
      return;
    }
    // Skip the current page itself
    const fullUrl = href.startsWith("http")
      ? href
      : `${BASE}${href}`;
    const normalised = fullUrl.split("?")[0];
    const currentPath = url.split("?")[0];
    if (normalised === currentPath) return;

    // Skip ancestor/parent links (e.g. decade nav "2020–2024" on a year/month page).
    // Any link shallower than the current page is a back-navigation link, not content.
    const linkDepth = normalised.split("/").filter(Boolean).length;
    if (linkDepth < currentDepth) return;

    const title = $(el).find("h4, h3, h2, h5, strong").first().text().trim()
      || $(el).text().trim();
    if (!title || title.length < 2) return;

    const description = $(el).find("p").first().text().trim() || undefined;

    // Avoid duplicates
    if (!articles.some((a) => a.url === fullUrl)) {
      articles.push({
        title: title.replace(/\s+/g, " ").trim(),
        url: ensureLang(fullUrl, useLang),
        description,
      });
    }
  });

  return { title: pageTitle, url, articles };
}

function ensureLang(url: string, lang: string = DEFAULT_LANG): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("lang")) {
      parsed.searchParams.set("lang", lang);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
