import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = path.join(process.cwd(), "bytecode.db");

let _db: Client | null = null;
let _migrated = false;

export function getDb(): Client {
  if (!_db) {
    _db = createClient({
      url: `file:${DB_PATH}`,
    });
  }
  return _db;
}

export async function ensureMigrated(): Promise<void> {
  if (_migrated) return;
  const db = getDb();
  const schemaPath = path.join(process.cwd(), "src", "lib", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
  await ensureColumn(
    db,
    "projects",
    "provider",
    "TEXT NOT NULL DEFAULT 'openrouter'"
  );
  await ensureColumn(
    db,
    "messages",
    "reasoning",
    "TEXT NOT NULL DEFAULT ''"
  );
  _migrated = true;
}

async function ensureColumn(
  db: Client,
  tableName: string,
  columnName: string,
  definition: string
) {
  const result = await db.execute(`PRAGMA table_info(${tableName})`);
  const hasColumn = result.rows.some((row) => row.name === columnName);

  if (!hasColumn) {
    await db.execute(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    );
  }
}
