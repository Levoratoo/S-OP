import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

function splitStatements(raw) {
  if (raw.includes("--> statement-breakpoint")) {
    return raw
      .split(/-->\s*statement-breakpoint/g)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Fallback: split by semicolon, keep non-comment statements
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  return withoutBlockComments
    .split(";")
    .map(s =>
      s
        .split("\n")
        .filter(line => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

const drizzleDir = path.resolve("drizzle");
const files = (await fs.readdir(drizzleDir))
  .filter(f => f.endsWith(".sql"))
  .sort();

const conn = await mysql.createConnection(url);
await conn.query(`
  CREATE TABLE IF NOT EXISTS __sql_migrations (
    id VARCHAR(255) PRIMARY KEY,
    appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

for (const file of files) {
  const [rows] = await conn.query("SELECT id FROM __sql_migrations WHERE id = ?", [file]);
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`[migrate] skip ${file}`);
    continue;
  }
  const raw = await fs.readFile(path.join(drizzleDir, file), "utf8");
  const statements = splitStatements(raw);
  console.log(`[migrate] apply ${file} (${statements.length} statements)`);
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      const msg = String(err?.message || err);
      if (
        /already exists|Duplicate column|Duplicate key name|check that .+ exists|Unknown column|doesn't exist|ER_NO_SUCH_TABLE|ER_BAD_FIELD_ERROR/i.test(
          msg
        )
      ) {
        console.warn(`[migrate] warn (${file}): ${msg}`);
        continue;
      }
      throw err;
    }
  }
  await conn.query("INSERT INTO __sql_migrations (id) VALUES (?)", [file]);
}

await conn.end();
console.log("[migrate] done");
