# Gospel Library MCP Server

An MCP server for [GitHub Copilot CLI](https://docs.github.com/copilot/concepts/agents/about-copilot-cli) that gives Copilot proactive, always-available access to the [Church of Jesus Christ Gospel Library](https://www.churchofjesuschrist.org/) — scriptures, General Conference talks, handbooks, manuals, and magazines.

**No API key required. Zero configuration. Works out of the box.**

Search is powered by a local semantic vector index using the `all-MiniLM-L6-v2` model (runs entirely on your machine). Build it once with `build-index` and refresh it after each General Conference.

## Tools

| Tool | Description |
|---|---|
| `search_gospel_library` | Semantic vector search (or slug-based fallback before index is built) |
| `get_article` | Fetch the full content of any article, talk, or manual page |
| `browse_category` | List articles/talks in a category (conference sessions, scripture books, etc.) |
| `get_scripture` | Fetch a scripture passage by reference (e.g. "John 3:16", "Moroni 10:4") |

---

## Quick Setup

Add this to `~/.copilot/mcp-config.json` (create the file if it does not exist):

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

Restart Copilot CLI and run `/mcp` — you should see `gospel-library` with 4 tools connected.

---

## Building the Semantic Search Index

For the best search quality, build the local vector index once after installation:

```bash
npx @jasonbellz/gospel-library-mcp build-index
```

This crawls ~10,000+ pages (General Conference talks, General Handbook, Gospel Topics essays), extracts their titles, and generates 384-dimension embeddings using the `all-MiniLM-L6-v2` model. The model (~25 MB) is downloaded automatically on first run.

**Expected time:** 15–30 minutes (mostly network; faster on subsequent runs)

The index is stored at `~/.gospel-library-mcp/index.db`.

### Refreshing After New Content

New General Conference talks are published in April and October. Refresh the index incrementally (only new articles):

```bash
npx @jasonbellz/gospel-library-mcp refresh
```

**Expected time:** 1–5 minutes (only new articles are fetched and embedded)

> If the index is more than 30 days old, the MCP server will automatically remind you to refresh.

---

## Usage Examples

**Search by meaning (semantic search):**
> "What does the Church teach about the Word of Wisdom?"

Copilot finds articles semantically related to dietary law, health, and the Word of Wisdom — even if those exact words aren't in the URL.

**Look up a scripture:**
> "What does Moroni 10:4-5 say?"

Copilot will use `get_scripture` to fetch it directly.

**Browse a conference:**
> "List the talks from October 2024 General Conference"

Copilot will use `browse_category` with `general-conference/2024/10`.

**Read Church policy:**
> "What is the Church's policy on tithing?"

Copilot will use `search_gospel_library` then `get_article` on the General Handbook.

---

## Supported Scripture References

All standard LDS scripture works are supported:

- **Bible**: `Genesis 1:1`, `John 3:16`, `Revelation 22:20`
- **Book of Mormon**: `1 Nephi 3:7`, `2 Nephi 2:25`, `Moroni 10:4`
- **Doctrine & Covenants**: `D&C 76:22`, `D&C 89`
- **Pearl of Great Price**: `Moses 1:39`, `Abraham 3:22`, `Joseph Smith History 1:17`

---

## Key Category Paths for `browse_category`

| Category | Path |
|---|---|
| All General Conferences | `general-conference` |
| Oct 2024 Conference | `general-conference/2024/10` |
| Apr 2025 Conference | `general-conference/2025/04` |
| Book of Mormon | `scriptures/bofm` |
| New Testament | `scriptures/nt` |
| Old Testament | `scriptures/ot` |
| Doctrine & Covenants | `scriptures/dc-testament` |
| Pearl of Great Price | `scriptures/pgp` |
| General Handbook | `manual/general-handbook` |
| Gospel Topics | `manual/gospel-topics` |

---

## Local Development

```bash
git clone https://github.com/jasonbellz/gospel-library-mcp
cd gospel-library-mcp
npm install
npm run build
node setup.js          # register using local dist/
node setup.js --npx    # register using published npm package
```

## Publishing

```bash
npm login
npm publish --access public
```


## Tools

| Tool | Description |
|---|---|
| `search_gospel_library` | Search the full Gospel Library by keyword |
| `get_article` | Fetch the full content of any article, talk, or manual page |
| `browse_category` | List articles/talks in a category (conference sessions, scripture books, etc.) |
| `get_scripture` | Fetch a scripture passage by reference (e.g. "John 3:16", "Moroni 10:4") |

---

## Quick Setup

Add this to `~/.copilot/mcp-config.json` (create the file if it does not exist):

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

Restart Copilot CLI and run `/mcp` — you should see `gospel-library` with 4 tools connected.

---

## Usage Examples

**Search for doctrine:**
> "What does the Church teach about the Word of Wisdom?"

Copilot will use `search_gospel_library` to find talks and handbook sections, then `get_article` to read the content.

**Look up a scripture:**
> "What does Moroni 10:4-5 say?"

Copilot will use `get_scripture` to fetch it directly.

**Browse a conference:**
> "List the talks from October 2024 General Conference"

Copilot will use `browse_category` with `general-conference/2024/10`.

**Read Church policy:**
> "What is the Church''s policy on tithing?"

Copilot will use `search_gospel_library` then `get_article` on the General Handbook.

---

## Supported Scripture References

All standard LDS scripture works are supported:

- **Bible**: `Genesis 1:1`, `John 3:16`, `Revelation 22:20`
- **Book of Mormon**: `1 Nephi 3:7`, `2 Nephi 2:25`, `Moroni 10:4`
- **Doctrine & Covenants**: `D&C 76:22`, `D&C 89`
- **Pearl of Great Price**: `Moses 1:39`, `Abraham 3:22`, `Joseph Smith History 1:17`

---

## Key Category Paths for `browse_category`

| Category | Path |
|---|---|
| All General Conferences | `general-conference` |
| Oct 2024 Conference | `general-conference/2024/10` |
| Apr 2025 Conference | `general-conference/2025/04` |
| Book of Mormon | `scriptures/bofm` |
| New Testament | `scriptures/nt` |
| Old Testament | `scriptures/ot` |
| Doctrine & Covenants | `scriptures/dc-testament` |
| Pearl of Great Price | `scriptures/pgp` |
| General Handbook | `manual/general-handbook` |
| Gospel Topics | `manual/gospel-topics` |

---

## Local Development

```bash
git clone https://github.com/jasonbellz/gospel-library-mcp
cd gospel-library-mcp
npm install
npm run build
node setup.js          # register using local dist/
node setup.js --npx    # register using published npm package
```

## Publishing

```bash
npm login
npm publish --access public
```
