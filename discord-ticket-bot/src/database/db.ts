import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

let instance: Database.Database | null = null;

/**
 * Lightweight migration runner.
 * Tracks applied migrations in a `_migrations` table.
 * Never re-runs completed migrations. Never resets existing data.
 * ALTER TABLE ADD COLUMN failures for "duplicate column" are treated as success
 * so upgrades remain idempotent across environments.
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (db.prepare(`SELECT name FROM _migrations`).all() as { name: string }[]).map((r) => r.name)
  );

  const insert = db.prepare(`INSERT INTO _migrations (name) VALUES (?)`);

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    try {
      const tx = db.transaction(() => {
        db.exec(sql);
        insert.run(file);
      });
      tx();
      console.log(`[db] Applied migration: ${file}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Idempotent ALTER TABLE ADD COLUMN when the column already exists.
      if (/duplicate column/i.test(msg)) {
        insert.run(file);
        console.log(`[db] Migration ${file}: column already present, marked applied.`);
        continue;
      }
      console.error(`[db] Migration failed: ${file}`, err);
      throw err;
    }
  }
}

export function getDb(): Database.Database {
  if (instance) return instance;

  const dir = path.dirname(env.DATABASE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(env.DATABASE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  runMigrations(db);

  instance = db;
  return db;
}

export function ensureGuild(guildId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO guilds (guild_id) VALUES (?)
     ON CONFLICT(guild_id) DO NOTHING`
  ).run(guildId);
  db.prepare(
    `INSERT INTO settings (guild_id) VALUES (?)
     ON CONFLICT(guild_id) DO NOTHING`
  ).run(guildId);
}
