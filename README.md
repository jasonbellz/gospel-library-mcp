# Gospel Library MCP Server

> **Unofficial tool. Not affiliated with or endorsed by The Church of Jesus Christ of Latter-day Saints.**
> See [DISCLAIMER.md](./DISCLAIMER.md) for full details.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI agents direct, structured access to the [Church of Jesus Christ Gospel Library](https://www.churchofjesuschrist.org/) — scriptures, General Conference talks, handbooks, manuals, and magazines.

**Compatible with any MCP-enabled AI agent**, including GitHub Copilot CLI, Claude Desktop, Claude Code, Cursor, Windsurf, and others.

**No API key required. No external service. Everything runs locally.**

Search is powered by a local semantic vector index using the `all-MiniLM-L6-v2` model. When the index is built, the agent finds articles by *meaning* — not just URL keywords. Content is served in your OS locale language automatically, with per-request language override support.

---

## Requirements

- **Node.js ≥ 18**
- Any **MCP-compatible AI agent** (see setup below)

---

## Quick Setup

The MCP server configuration format is the same across all agents. Pick your agent below.

### GitHub Copilot CLI

Add to `~/.copilot/mcp-config.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "gospel-library": {
      "command": "npx",
      "args": ["-y", "@jasonbellz/gospel-library-mcp"]
    }
  }
}
```

Restart Copilot CLI and run `/mcp` — you should see `gospel-library` listed with 4 tools.

### Claude Desktop

Add to your Claude Desktop config file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gospel-library": {
      "command": "npx",
      "args": ["-y", "@jasonbellz/gospel-library-mcp"]
    }
  }
}
```

Restart Claude Desktop. The tools will be available automatically.

### Claude Code (CLI)

```bash
claude mcp add gospel-library -- npx -y @jasonbellz/gospel-library-mcp
```

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "gospel-library": {
      "command": "npx",
      "args": ["-y", "@jasonbellz/gospel-library-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "gospel-library": {
      "command": "npx",
      "args": ["-y", "@jasonbellz/gospel-library-mcp"]
    }
  }
}
```

### Other MCP-Compatible Agents

Any agent that supports the MCP `stdio` transport uses the same `mcpServers` JSON block. Consult your agent's documentation for the config file location.

### (Optional) Add Agent Instructions for Proactive Use

Tell your agent to use the Gospel Library tools automatically when answering Church-related questions. Add the following to your agent's system prompt or instructions file:

```markdown
## Gospel Library MCP

You have access to an MCP server (`gospel-library`) that provides structured access to the
Church of Jesus Christ of Latter-day Saints Gospel Library at churchofjesuschrist.org.

Use the Gospel Library MCP tools whenever the user asks about:
- Church doctrine, teachings, or gospel principles
- Scriptures (Bible, Book of Mormon, Doctrine & Covenants, Pearl of Great Price)
- General Conference talks (1971–present)
- Church policies, handbooks, or guidelines
- Church history or historical documents
- Magazines (Liahona, Ensign, Friend, New Era)
- Church manuals or curriculum

When a question is clearly about Church topics, call the relevant tool FIRST before answering.
```

- **GitHub Copilot CLI:** add to `~/.copilot/copilot-instructions.md`
- **Claude Desktop / Claude Code:** add to your project's `CLAUDE.md` or system prompt
- **Cursor:** add to `.cursorrules` or project instructions

---

## Building the Semantic Search Index

Without the index, search falls back to URL slug matching (still useful, just less precise).
For semantic search — which finds articles by *meaning* rather than exact keywords — you need a local index.

Three options are available, from fastest to most thorough:

| Option | Command | Size | Time | Quality |
|--------|---------|------|------|---------|
| **Download** (pre-built) | `download-index` | ~12.5 MB | ~30 sec | Good |
| **Standard build** (truncated) | `build-index` | ~12–13 MB | ~45–90 min | Good |
| **Full build** (chunked) | `build-index --full` | ~35–40 MB | ~2–4 hrs | Best |
| **Download full** (pre-built chunked) | `download-index --full` | ~35–40 MB | ~1–2 min | Best |

### Option 1: Download the Pre-Built Index (Recommended, ~30 seconds)

Download a pre-built `index.db` from the latest GitHub Release:

```bash
npx @jasonbellz/gospel-library-mcp download-index
```

Saves to `~/.gospel-library-mcp/index.db`. Shows live download progress.

### Option 2: Download the Pre-Built Full Index (~1–2 minutes)

Download the pre-built chunked index for best semantic coverage:

```bash
npx @jasonbellz/gospel-library-mcp download-index --full
```

Saves to `~/.gospel-library-mcp/index.db` (replaces any existing index).

### Option 3: Build the Standard Index Locally (~45–90 minutes)

Build from scratch by crawling the live sitemap. Each article is indexed using its full content, truncated to ~350 words (one embedding per article).

```bash
npx @jasonbellz/gospel-library-mcp build-index
```

**What it does:**
- Downloads the English sitemaps (~50k URLs)
- Filters to indexed categories: General Conference talks, General Handbook, Gospel Topics essays (~10,000+ pages)
- Fetches and parses each page, using the first ~350 words as the embed text
- Generates 384-dimension embeddings using `Xenova/all-MiniLM-L6-v2` (runs locally, ~25 MB download on first run)
- Stores everything in `~/.gospel-library-mcp/index.db`

### Option 4: Build the Full Chunked Index Locally (~2–4 hours)

Build a deeper index where each article is split into overlapping ~350-word chunks. Produces multiple embeddings per article for full semantic coverage of long talks and handbook sections.

```bash
npx @jasonbellz/gospel-library-mcp build-index --full
```

**When to use:** When you want the best possible search quality and are willing to wait for the longer build. Especially useful for finding specific passages within long articles.

### Refreshing After New Content

New General Conference talks are published in April and October. Run an incremental refresh — only new articles are fetched and embedded. The refresh automatically detects whether your current index is standard or full and uses the same mode:

```bash
npx @jasonbellz/gospel-library-mcp refresh
```

**Expected time:** 1–5 minutes (a few hundred new articles per conference)

> The MCP server automatically reminds you to refresh when the index is more than **30 days** old.

---

## Tools

### `search_gospel_library`

Search the Gospel Library for articles, talks, scriptures, manuals, and policies.

**When the index is built:** uses cosine similarity over the local vector index for semantic search — finds articles by *meaning*.
**Before the index is built:** falls back to URL slug keyword matching.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✅ | The search query (e.g. `'faith hope charity'`, `'word of wisdom'`) |
| `category` | string | ❌ | Restrict results to a category. See [Category Aliases](#category-aliases) below |
| `maxResults` | number | ❌ | Max results to return (1–10, default 5) |

**Category aliases** (pass these as the `category` parameter):

| Alias | Resolves to |
|-------|-------------|
| `general-conference` | All General Conference talks |
| `scriptures` | All scripture content |
| `manual` | All manuals and handbooks |
| `handbooks` | General Handbook only |
| `liahona` | Liahona magazine |
| `ensign` | Ensign magazine |
| `friend` | Friend magazine |

You can also pass any path relative to `/study/` (e.g. `general-conference/2024/10`).

---

### `get_article`

Fetch the full content of a specific article, talk, manual chapter, or policy page. Returns clean markdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ | Full `https://www.churchofjesuschrist.org/...` URL |
| `lang` | string | ❌ | Language code (e.g. `'spa'`, `'por'`, `'fra'`). Defaults to OS locale |

**Example URL:** `https://www.churchofjesuschrist.org/study/general-conference/2024/10/12andersen?lang=eng`

---

### `browse_category`

List all articles and talks in a category or collection. Returns titles and URLs. Useful for browsing a specific conference session, scripture book, or magazine issue.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | ✅ | Path relative to `/study/` — see table below |
| `lang` | string | ❌ | Language code (e.g. `'spa'`, `'por'`, `'fra'`). Defaults to OS locale |

**Common category paths:**

| Content | Path |
|---------|------|
| All General Conferences | `general-conference` |
| October 2024 Conference | `general-conference/2024/10` |
| April 2025 Conference | `general-conference/2025/04` |
| Book of Mormon | `scriptures/bofm` |
| New Testament | `scriptures/nt` |
| Old Testament | `scriptures/ot` |
| Doctrine & Covenants | `scriptures/dc-testament` |
| Pearl of Great Price | `scriptures/pgp` |
| General Handbook | `manual/general-handbook` |
| Gospel Topics | `manual/gospel-topics` |
| Liahona (current) | `liahona` |

---

### `get_scripture`

Fetch a specific scripture passage by reference. Parses the reference, constructs the Gospel Library URL, and returns the chapter content as markdown.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference` | string | ✅ | Scripture reference (e.g. `'John 3:16'`, `'2 Nephi 2:25'`, `'D&C 76:22'`) |
| `lang` | string | ❌ | Language code (e.g. `'spa'`, `'por'`, `'fra'`). Defaults to OS locale |

**Supported reference formats:**
- Full chapter: `Genesis 1`, `Alma 32`
- Single verse: `John 3:16`, `Moroni 10:4`
- Verse range: `Moroni 10:4-5`, `D&C 76:22-24`

**Supported books and abbreviations:**

<details>
<summary>Old Testament</summary>

| Book | Abbreviations |
|------|--------------|
| Genesis | `Gen` |
| Exodus | `Ex` |
| Leviticus | `Lev` |
| Numbers | `Num` |
| Deuteronomy | `Deut` |
| Joshua | `Josh` |
| Judges | `Judg` |
| Ruth | — |
| 1 Samuel | `1 Sam` |
| 2 Samuel | `2 Sam` |
| 1 Kings | `1 Kgs` |
| 2 Kings | `2 Kgs` |
| 1 Chronicles | `1 Chr` |
| 2 Chronicles | `2 Chr` |
| Ezra | — |
| Nehemiah | `Neh` |
| Esther | — |
| Job | — |
| Psalms | `Psalm`, `Ps` |
| Proverbs | `Prov` |
| Ecclesiastes | `Eccl` |
| Song of Solomon | — |
| Isaiah | `Isa` |
| Jeremiah | `Jer` |
| Lamentations | — |
| Ezekiel | `Ezek` |
| Daniel | `Dan` |
| Hosea | — |
| Joel | — |
| Amos | — |
| Obadiah | — |
| Jonah | — |
| Micah | — |
| Nahum | — |
| Habakkuk | — |
| Zephaniah | — |
| Haggai | — |
| Zechariah | `Zech` |
| Malachi | — |
</details>

<details>
<summary>New Testament</summary>

| Book | Abbreviations |
|------|--------------|
| Matthew | `Matt` |
| Mark | — |
| Luke | — |
| John | — |
| Acts | — |
| Romans | `Rom` |
| 1 Corinthians | `1 Cor` |
| 2 Corinthians | `2 Cor` |
| Galatians | `Gal` |
| Ephesians | `Eph` |
| Philippians | `Philip` |
| Colossians | `Col` |
| 1 Thessalonians | `1 Thes` |
| 2 Thessalonians | `2 Thes` |
| 1 Timothy | `1 Tim` |
| 2 Timothy | `2 Tim` |
| Titus | — |
| Philemon | — |
| Hebrews | `Heb` |
| James | — |
| 1 Peter | `1 Pet` |
| 2 Peter | `2 Pet` |
| 1 John | `1 Jn` |
| 2 John | `2 Jn` |
| 3 John | `3 Jn` |
| Jude | — |
| Revelation | `Rev` |
</details>

<details>
<summary>Book of Mormon</summary>

| Book | Abbreviations |
|------|--------------|
| 1 Nephi | `1 Ne` |
| 2 Nephi | `2 Ne` |
| Jacob | — |
| Enos | — |
| Jarom | — |
| Omni | — |
| Words of Mormon | — |
| Mosiah | — |
| Alma | — |
| Helaman | `Hel` |
| 3 Nephi | `3 Ne` |
| 4 Nephi | `4 Ne` |
| Mormon | `Morm` |
| Ether | — |
| Moroni | `Moro` |
</details>

<details>
<summary>Doctrine & Covenants / Pearl of Great Price</summary>

| Book | Abbreviations |
|------|--------------|
| Doctrine and Covenants | `D&C`, `DC` |
| Moses | — |
| Abraham | `Abr` |
| Joseph Smith History | `JS-H` |
| Joseph Smith Matthew | `JS-M` |
| Articles of Faith | `A of F` |
</details>

---

## Multilingual Support

The MCP server automatically detects your OS locale at startup and serves content in that language. No configuration required.

**How it works:**
- **Search** always uses the English index (cross-lingual retrieval — the embedding model is multilingual)
- **Content** (`get_article`, `browse_category`, `get_scripture`) is served in your OS locale language by default
- Every tool accepts an optional `lang` parameter to override per-request

**Override language per-request:**
> "Read Alma 32 in Spanish"
→ `get_scripture(reference: "Alma 32", lang: "spa")`

> "Get that talk in Portuguese"
→ `get_article(url: "...", lang: "por")`

**Supported language codes:**

| Code | Language | Code | Language |
|------|----------|------|----------|
| `eng` | English | `spa` | Spanish |
| `por` | Portuguese | `fra` | French |
| `deu` | German | `ita` | Italian |
| `jpn` | Japanese | `kor` | Korean |
| `zhs` | Chinese (Simplified) | `zht` | Chinese (Traditional) |
| `rus` | Russian | `tgl` | Filipino / Tagalog |
| `nld` | Dutch | `swe` | Swedish |
| `nor` | Norwegian | `dan` | Danish |
| `fin` | Finnish | `pol` | Polish |
| `ukr` | Ukrainian | `hun` | Hungarian |
| `ces` | Czech | `ron` | Romanian |
| `bul` | Bulgarian | `ell` | Greek |
| `tur` | Turkish | `ara` | Arabic |
| `heb` | Hebrew | `tha` | Thai |
| `ind` | Indonesian | `msa` | Malay |
| `vie` | Vietnamese | `khm` | Khmer |
| `mya` | Burmese | `mon` | Mongolian |
| `smo` | Samoan | `ton` | Tongan |
| `haw` | Hawaiian | `mao` | Māori |

> **Note:** Not all content is available in every language. English content is the most complete.

---

## Files Created on Your System

| Path | Purpose |
|------|---------|
| `~/.gospel-library-mcp/index.db` | SQLite vector index — standard (~12–13 MB) or full chunked (~35–40 MB) |
| `~/.cache/huggingface/` | Cached embedding model (~25 MB, downloaded once on first `build-index`) |

**Agent config files** (you create these — see [Quick Setup](#quick-setup) above):

| Agent | Config file |
|-------|-------------|
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

---

## Usage Examples

**Semantic search:**
> "What does the Church teach about the Word of Wisdom?"

Finds articles about dietary law, health, and the Word of Wisdom — even articles where those words don't appear in the URL.

**Scripture lookup:**
> "What does Moroni 10:4-5 say?"

Uses `get_scripture` to fetch the passage directly.

**Browse a conference:**
> "List the talks from October 2024 General Conference"

Uses `browse_category` with `general-conference/2024/10`.

**Read Church policy:**
> "What is the Church's policy on fast offerings?"

Uses `search_gospel_library` to find the relevant General Handbook section, then `get_article` to read it.

---

## Local Development

```bash
git clone https://github.com/jasonbellz/gospel-library-mcp
cd gospel-library-mcp
npm install
npm run build
```

Then add `dist/index.js` as the command in your agent's MCP config:

```json
{
  "mcpServers": {
    "gospel-library": {
      "command": "node",
      "args": ["/path/to/gospel-library-mcp/dist/index.js"]
    }
  }
}
```

Or use `node setup.js` to auto-register with GitHub Copilot CLI, or `node setup.js --npx` to register using the published npm package.

## Publishing a New Version

```bash
# 1. Bump version in package.json (e.g. 2.0.1)
npm version patch   # or minor / major

# 2. Publish (build runs automatically via prepublishOnly)
npm publish --access public

# 3. Commit and push
git add package.json package-lock.json
git commit -m "chore: bump to vX.Y.Z"
git push
```

---

## Disclaimer

This project is an independent, unofficial tool and is **not affiliated with, endorsed by, or sponsored by The Church of Jesus Christ of Latter-day Saints.**

The Church of Jesus Christ of Latter-day Saints, Book of Mormon, Liahona, Mormon, LDS, CTR, and FamilySearch are trademarks of The Church of Jesus Christ of Latter-day Saints or Intellectual Reserve, Inc., and may be registered in the United States of America and other countries. Use of these marks does not imply endorsement by or affiliation with The Church of Jesus Christ of Latter-day Saints.

All Gospel Library content accessed through this tool is the property of The Church of Jesus Christ of Latter-day Saints or Intellectual Reserve, Inc. This tool provides a programmatic interface to publicly accessible content at [churchofjesuschrist.org](https://www.churchofjesuschrist.org) and does not host, copy, or redistribute that content.

See [DISCLAIMER.md](./DISCLAIMER.md) for full details. For official trademark guidelines, visit [churchofjesuschrist.org/reference/trademark-guidelines](https://www.churchofjesuschrist.org/reference/trademark-guidelines).

---

## License

[MIT](./LICENSE) © 2026 Jason Bell
