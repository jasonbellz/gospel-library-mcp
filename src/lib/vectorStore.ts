/**
 * vectorStore.ts — SQLite-backed vector store for semantic search
 *
 * Stores article embeddings in ~/.gospel-library-mcp/index.db and provides
 * cosine similarity search over them in pure JavaScript (no native extensions).
 */

import Database from "better-sqlite3";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

export const DB_DIR = path.join(os.homedir(), ".gospel-library-mcp");
export const DB_PATH = path.join(DB_DIR, "index.db");

export const STALE_DAYS = 30;

export interface VectorDocument {
  url: string;
  title: string;
  category: string;
  embedding: Float32Array;
  indexed_at: number;
}

export interface VectorSearchResult {
  url: string;
  title: string;
  category: string;
  score: number;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        url        TEXT    PRIMARY KEY,
        title      TEXT    NOT NULL,
        category   TEXT    NOT NULL DEFAULT '',
        embedding  BLOB    NOT NULL,
        indexed_at INTEGER NOT NULL
      )
    `);
  }
  return db;
}

export function isIndexBuilt(): boolean {
  if (!fs.existsSync(DB_PATH)) return false;
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM documents")
      .get() as { n: number };
    return row.n > 0;
  } catch {
    return false;
  }
}

/** Returns the age of the oldest document in the index, in days. */
export function getIndexAgeDays(): number {
  if (!fs.existsSync(DB_PATH)) return Infinity;
  try {
    const row = getDb()
      .prepare("SELECT MIN(indexed_at) AS oldest FROM documents")
      .get() as { oldest: number | null };
    if (!row?.oldest) return Infinity;
    return (Date.now() - row.oldest) / (1000 * 60 * 60 * 24);
  } catch {
    return Infinity;
  }
}

export function getDocumentCount(): number {
  if (!fs.existsSync(DB_PATH)) return 0;
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM documents")
      .get() as { n: number };
    return row.n;
  } catch {
    return 0;
  }
}

export function getAllIndexedUrls(): Set<string> {
  const rows = getDb()
    .prepare("SELECT url FROM documents")
    .all() as { url: string }[];
  return new Set(rows.map((r) => r.url));
}

export function upsertDocuments(docs: VectorDocument[]): void {
  const database = getDb();
  const stmt = database.prepare(
    `INSERT OR REPLACE INTO documents (url, title, category, embedding, indexed_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertMany = database.transaction((items: VectorDocument[]) => {
    for (const doc of items) {
      stmt.run(
        doc.url,
        doc.title,
        doc.category,
        Buffer.from(doc.embedding.buffer),
        doc.indexed_at
      );
    }
  });
  insertMany(docs);
}

/**
 * Search for documents most similar to queryEmbedding.
 * Optionally filter by URL substring (categoryFilter).
 */
export function searchByVector(
  queryEmbedding: Float32Array,
  categoryFilter?: string,
  topN: number = 10
): VectorSearchResult[] {
  const database = getDb();

  type Row = { url: string; title: string; category: string; embedding: Buffer };

  let rows: Row[];
  if (categoryFilter) {
    rows = database
      .prepare("SELECT url, title, category, embedding FROM documents WHERE url LIKE ?")
      .all(`%${categoryFilter}%`) as Row[];
  } else {
    rows = database
      .prepare("SELECT url, title, category, embedding FROM documents")
      .all() as Row[];
  }

  const scored = rows.map((row) => {
    const stored = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    return {
      url: row.url,
      title: row.title,
      category: row.category,
      score: cosineSimilarity(queryEmbedding, stored),
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}
