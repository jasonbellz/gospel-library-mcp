/**
 * fetch.ts — Fetch and parse article content from churchofjesuschrist.org
 *
 * Fetches a Gospel Library URL and extracts the article body as clean markdown,
 * stripping navigation, headers, footers, and image elements.
 */

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { DEFAULT_LANG } from "../lib/locale.js";
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Remove footnote reference links (they are inline anchors with no useful text)
turndown.addRule("footnoteAnchors", {
  filter: (node) => {
    if (node.nodeName !== "A") return false;
    const el = node as unknown as { getAttribute?: (attr: string) => string | null };
    return el.getAttribute?.("class")?.includes("note-ref") === true;
  },
  replacement: () => "",
});

export interface ArticleContent {
  title: string;
  author?: string;
  url: string;
  content: string;
}

/**
 * Fetch an article from the Gospel Library and return its content as markdown.
 * The url should be a full https://www.churchofjesuschrist.org/... URL.
 * If a lang code is not already in the URL, the OS default language is used.
 */
export async function getArticle(inputUrl: string, lang?: string): Promise<ArticleContent> {
  const url = ensureLang(inputUrl, lang);

  const response = await fetch(url, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (compatible; GospelLibraryMCP/1.0; +https://github.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract title
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("h1").first().text().trim() ||
    $("title").text().trim();

  // Extract author (speaker name for conference talks, author for articles)
  const author =
    $(".author-name").first().text().trim() ||
    $("[class*='author']").first().text().trim() ||
    undefined;

  // Remove non-content elements
  $(
    "header, footer, nav, .nav, .header, .footer, script, style, " +
      ".lc-header, .lc-footer, .lc-nav, " +
      "[class*='navigation'], [class*='breadcrumb'], [class*='sidebar'], " +
      "[class*='related'], [class*='share'], [class*='social'], " +
      "[class*='cookie'], [class*='banner'], " +
      "figure img, picture"
  ).remove();

  // Try to find the main article content
  const contentSelectors = [
    "article",
    "[class*='body-block']",
    "[class*='article-content']",
    ".study-content",
    "main",
    "#content",
    ".content",
  ];

  let contentHtml = "";
  for (const selector of contentSelectors) {
    const el = $(selector).first();
    if (el.length && el.text().trim().length > 100) {
      contentHtml = el.html() || "";
      break;
    }
  }

  // Fall back to body if no specific content area found
  if (!contentHtml) {
    contentHtml = $("body").html() || "";
  }

  const content = turndown.turndown(contentHtml).trim();

  return { title, author: author || undefined, url, content };
}

function ensureLang(url: string, override?: string): string {
  try {
    const parsed = new URL(url);
    if (override) {
      parsed.searchParams.set("lang", override);
    } else if (!parsed.searchParams.has("lang")) {
      parsed.searchParams.set("lang", DEFAULT_LANG);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
