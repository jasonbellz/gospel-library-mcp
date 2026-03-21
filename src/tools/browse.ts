/**
 * browse.ts — Browse a Gospel Library category or collection index page.
 *
 * Fetches a category page (e.g. /study/general-conference/2024/10) and returns
 * the list of articles/talks with their titles and URLs.
 */

import fetch from "node-fetch";
import * as cheerio from "cheerio";

const BASE = "https://www.churchofjesuschrist.org";
const LANG = "eng";

export interface ArticleLink {
  title: string;
  url: string;
  description?: string;
}

export interface CategoryPage {
  title: string;
  url: string;
  articles: ArticleLink[];
}

/**
 * Browse a category index page.
 * @param category - a path like "general-conference", "general-conference/2024/10",
 *                   "scriptures", "scriptures/bofm", etc.
 */
export async function browseCategory(category: string): Promise<CategoryPage> {
  const cleanCategory = category.replace(/^\/+|\/+$/g, "");
  const url = `${BASE}/study/${cleanCategory}?lang=${LANG}`;

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; GospelLibraryMCP/1.0; +https://github.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch category ${category}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const pageTitle =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  const articles: ArticleLink[] = [];

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

    const title = $(el).find("h4, h3, h2, h5, strong").first().text().trim()
      || $(el).text().trim();
    if (!title || title.length < 2) return;

    const description = $(el).find("p").first().text().trim() || undefined;

    // Avoid duplicates
    if (!articles.some((a) => a.url === fullUrl)) {
      articles.push({
        title: title.replace(/\s+/g, " ").trim(),
        url: ensureLang(fullUrl),
        description,
      });
    }
  });

  return { title: pageTitle, url, articles };
}

function ensureLang(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("lang")) {
      parsed.searchParams.set("lang", LANG);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
