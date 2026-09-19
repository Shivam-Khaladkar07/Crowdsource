import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type QueryResult<T> = { rows: T[] };

interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  engine: "pglite" | "postgres";
}

let client: DbClient | null = null;

function toPgParams(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  return { text: sql, values: params };
}

async function createPglite(): Promise<DbClient> {
  const configuredDir = process.env.PGLITE_DATA_DIR;
  const dataDir = configuredDir
    ? path.resolve(configuredDir)
    : path.join(__dirname, "../../data/pglite");
  let db: PGlite;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new PGlite(dataDir);
    await db.waitReady;
  } catch (error) {
    if (configuredDir) throw error;
    const recoveryDir = path.join(__dirname, "../../data/pglite-recovery");
    console.warn(`Default PGlite store could not open; preserving it and using recovery store: ${recoveryDir}`);
    fs.mkdirSync(recoveryDir, { recursive: true });
    db = new PGlite(recoveryDir);
    await db.waitReady;
  }
  return {
    engine: "pglite",
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await db.query<T>(sql, params);
      return { rows: (res.rows ?? []) as T[] };
    },
  };
}

async function createPostgres(url: string): Promise<DbClient> {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("SELECT 1");
  return {
    engine: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const { text, values } = toPgParams(sql, params);
      const res = await pool.query(text, values);
      return { rows: res.rows as T[] };
    },
  };
}

export async function getDb(): Promise<DbClient> {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      client = await createPostgres(url);
      return client;
    } catch (err) {
      console.warn("PostgreSQL unavailable, falling back to embedded PGlite:", err);
    }
  }
  client = await createPglite();
  return client;
}

function splitSql(raw: string) {
  return raw
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*(?:\r?\n|$)/gm, "").trim())
    .filter((s) => s.length > 0);
}

const ALTERS = [
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS impact_description TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS urgency INTEGER DEFAULT 3",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS assigned_department TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT FALSE",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS info_request TEXT",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS golden_key TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS secondary_slug TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS sub_domain TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS skills_json TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS technologies_json TEXT",
  "ALTER TABLE ai_analysis ADD COLUMN IF NOT EXISTS pipeline_json TEXT",
  "ALTER TABLE projects ADD COLUMN IF NOT EXISTS irl_level INTEGER DEFAULT 1",
  "ALTER TABLE projects ADD COLUMN IF NOT EXISTS golden_key TEXT",
  "ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS institution_status TEXT DEFAULT 'pending'",
  "ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS institution_note TEXT",
  "ALTER TABLE university_matches ADD COLUMN IF NOT EXISTS breakdown_json TEXT",
  "ALTER TABLE universities ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 4",
  "ALTER TABLE universities ADD COLUMN IF NOT EXISTS technologies TEXT",
  "ALTER TABLE universities ADD COLUMN IF NOT EXISTS verified_on DATE",
  "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url TEXT",
  "ALTER TABLE industry_interests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'expressed'",
  "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT",
];

export async function migrate() {
  const db = await getDb();
  for (const file of ["schema.sql", "schema.v2.sql"]) {
    const schema = fs.readFileSync(path.join(__dirname, file), "utf8");
    for (const stmt of splitSql(schema)) {
      await db.query(stmt);
    }
  }
  for (const stmt of ALTERS) {
    try {
      await db.query(stmt);
    } catch {
      /* column already exists on older engines */
    }
  }
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const db = await getDb();
  return db.query<T>(sql, params);
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const { rows } = await query<T>(sql, params);
  return rows[0] ?? null;
}
