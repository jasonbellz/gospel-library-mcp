#!/usr/bin/env node
/**
 * Gospel Library MCP Server
 *
 * Provides Copilot CLI with structured access to the Church of Jesus Christ
 * Gospel Library at churchofjesuschrist.org.
 *
 * Tools:
 *   - search_gospel_library  — Semantic vector search (or slug fallback)
 *   - get_article            — Fetch and parse an article by URL
 *   - browse_category        — List articles in a category
 *   - get_scripture          — Fetch a scripture passage by reference
 *
 * CLI commands (not MCP server mode):
 *   npx @jasonbellz/gospel-library-mcp build-index   — Build the vector index
 *   npx @jasonbellz/gospel-library-mcp refresh       — Incremental refresh
 *
 * No API key or configuration required.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { searchGospelLibrary } from "./tools/search.js";
import { getArticle } from "./tools/fetch.js";
import { browseCategory } from "./tools/browse.js";
import { getScripture } from "./tools/scripture.js";
import { getIndexAgeDays, getDocumentCount, STALE_DAYS } from "./lib/vectorStore.js";
import { buildIndex } from "./lib/indexer.js";
import { refresh } from "./lib/refresh.js";
import { downloadIndex } from "./lib/downloader.js";

const server = new Server(
  { name: "gospel-library", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_gospel_library",
      description:
        "Search the Church of Jesus Christ Gospel Library (churchofjesuschrist.org) " +
        "for articles, talks, scriptures, manuals, and policies. " +
        "Returns a list of matching articles with titles and URLs. " +
        "No API key required. " +
        "Use this proactively when answering questions about Church doctrine, " +
        "policies, scriptures, or general conference talks.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query (e.g. 'faith hope charity', 'law of tithing', 'word of wisdom')",
          },
          category: {
            type: "string",
            description:
              "Optional category to restrict search. Examples: 'general-conference', " +
              "'scriptures', 'manual', 'liahona', 'ensign', 'friend', 'handbooks'",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (1-10, default 5)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_article",
      description:
        "Fetch the full content of a specific Gospel Library article, talk, " +
        "manual chapter, or policy page by URL. Returns clean markdown text. " +
        "Use this after search_gospel_library to read the full content of an article.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "The full URL of the article, e.g. " +
              "'https://www.churchofjesuschrist.org/study/general-conference/2024/10/12andersen?lang=eng'",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browse_category",
      description:
        "List articles and talks available in a Gospel Library category or collection. " +
        "Returns titles and URLs. Useful for browsing conference sessions, scripture books, or magazine issues. " +
        "IMPORTANT: Category paths must be exact. For manuals, paths are often year-specific — " +
        "if you are unsure of the exact path, use search_gospel_library first to discover the correct URL. " +
        "Come Follow Me paths include the year and audience, e.g. " +
        "'manual/come-follow-me-for-individuals-and-families-new-testament-2023' or " +
        "'manual/come-follow-me-for-sunday-school-new-testament-2023'. " +
        "Do NOT guess a generic path like 'manual/come-follow-me' — it will 404.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Exact category path relative to /study/. Examples: " +
              "'general-conference/2024/10' (Oct 2024 conference), " +
              "'general-conference/2025/04' (Apr 2025 conference), " +
              "'scriptures/bofm' (Book of Mormon), " +
              "'scriptures/nt' (New Testament), " +
              "'manual/general-handbook' (Church policies and procedures), " +
              "'manual/gospel-topics', " +
              "'manual/come-follow-me-for-individuals-and-families-new-testament-2023', " +
              "'manual/come-follow-me-for-sunday-school-new-testament-2023'. " +
              "When unsure, call search_gospel_library first.",
          },
        },
        required: ["category"],
      },
    },
    {
      name: "get_scripture",
      description:
        "Fetch a specific scripture passage by reference. " +
        "Supports the Bible (Old and New Testament), Book of Mormon, " +
        "Doctrine & Covenants, and Pearl of Great Price. " +
        "Returns the chapter content as markdown.",
      inputSchema: {
        type: "object",
        properties: {
          reference: {
            type: "string",
            description:
              "Scripture reference in standard format. Examples: " +
              "'John 3:16', '2 Nephi 2:25', 'D&C 76:22', 'Moses 1:39', " +
              "'Alma 32:21', 'Moroni 10:4-5'",
          },
        },
        required: ["reference"],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "search_gospel_library": {
        const { query, category, maxResults } = args as {
          query: string;
          category?: string;
          maxResults?: number;
        };
        const results = await searchGospelLibrary(query, category, maxResults ?? 5);
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No results found for "${query}".` }],
          };
        }
        const formatted = results
          .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
          .join("\n\n");
        return {
          content: [
            {
              type: "text",
              text: `Found ${results.length} result(s) for "${query}":\n\n${formatted}`,
            },
          ],
        };
      }

      case "get_article": {
        const { url } = args as { url: string };
        const article = await getArticle(url);
        const header = article.author
          ? `# ${article.title}\n*by ${article.author}*\n\n`
          : `# ${article.title}\n\n`;
        return {
          content: [
            {
              type: "text",
              text: header + article.content,
            },
          ],
        };
      }

      case "browse_category": {
        const { category } = args as { category: string };
        const page = await browseCategory(category);
        if (page.notFound) {
          return {
            content: [{ type: "text", text: page.suggestion ?? `Category "${category}" was not found.` }],
          };
        }
        if (page.articles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No articles found in category "${category}". The category may not exist or may require JavaScript to render.\n\nTry using search_gospel_library to find content instead.`,
              },
            ],
          };
        }
        const list = page.articles
          .slice(0, 50)
          .map((a, i) => {
            const desc = a.description ? `\n   ${a.description}` : "";
            return `${i + 1}. **${a.title}**\n   ${a.url}${desc}`;
          })
          .join("\n\n");
        return {
          content: [
            {
              type: "text",
              text: `## ${page.title}\n\n${list}${page.articles.length > 50 ? `\n\n_(showing 50 of ${page.articles.length} results)_` : ""}`,
            },
          ],
        };
      }

      case "get_scripture": {
        const { reference } = args as { reference: string };
        const result = await getScripture(reference);
        return {
          content: [
            {
              type: "text",
              text: `# ${result.reference}\n\nSource: ${result.url}\n\n${result.content}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Start server ──────────────────────────────────────────────────────────────

async function runDownloadIndex() {
  console.log("Gospel Library MCP — Downloading pre-built index\n");
  console.log("Source: github.com/jasonbellz/gospel-library-mcp (latest release)\n");

  await downloadIndex((downloaded, total) => {
    if (total > 0) {
      const pct = Math.round((downloaded / total) * 100);
      const mb = (downloaded / 1024 / 1024).toFixed(1);
      const totalMb = (total / 1024 / 1024).toFixed(1);
      process.stdout.write(`\r[${pct}%] ${mb} / ${totalMb} MB...    `);
    } else {
      const mb = (downloaded / 1024 / 1024).toFixed(1);
      process.stdout.write(`\r${mb} MB downloaded...    `);
    }
  });

  console.log("\n\nDone! Restart Copilot CLI to use semantic search.");
}

async function runBuildIndex() {
  console.log("Gospel Library MCP — Building vector search index\n");
  console.log("This will index ~10,000+ articles for semantic search.");
  console.log("Each article is indexed using its title + description for richer results.");
  console.log("Expected time: 15–30 minutes (model download on first run).\n");

  const { added, skipped } = await buildIndex(false, ({ current, total, message }) => {
    if (total > 0) {
      const pct = Math.round((current / total) * 100);
      process.stdout.write(`\r[${pct}%] ${message}                    `);
    } else {
      process.stdout.write(`\r${message}                    `);
    }
  });

  console.log(`\n\nDone! Indexed ${added} articles (${skipped} already indexed).`);
  console.log("Search quality is now semantic — try it in Copilot.");
}

async function runRefresh() {
  console.log("Gospel Library MCP — Refreshing vector index (incremental)\n");

  const { added, skipped } = await refresh(({ current, total, message }) => {
    if (total > 0) {
      const pct = Math.round((current / total) * 100);
      process.stdout.write(`\r[${pct}%] ${message}                    `);
    } else {
      process.stdout.write(`\r${message}                    `);
    }
  });

  console.log(`\n\nDone! Added ${added} new articles (${skipped} already up to date).`);
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === "download-index") {
    await runDownloadIndex();
    return;
  }

  if (cmd === "build-index") {
    await runBuildIndex();
    return;
  }

  if (cmd === "refresh") {
    await runRefresh();
    return;
  }

  // MCP server mode — warn if the index is stale
  const ageDays = getIndexAgeDays();
  const docCount = getDocumentCount();

  if (docCount > 0 && ageDays > STALE_DAYS) {
    process.stderr.write(
      `[gospel-library] Index is ${Math.round(ageDays)} days old (${docCount} documents).\n` +
      `  Run: npx @jasonbellz/gospel-library-mcp refresh\n`
    );
  } else if (docCount === 0) {
    process.stderr.write(
      `[gospel-library] Vector index not built — using slug-based search.\n` +
      `  Fast setup (~30s): npx @jasonbellz/gospel-library-mcp download-index\n` +
      `  Build fresh (15-30m): npx @jasonbellz/gospel-library-mcp build-index\n`
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
