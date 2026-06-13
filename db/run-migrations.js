import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runJsonArray, runSql } from '../apps/cloud/src/psql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationTable() {
  await runSql(`
    CREATE SCHEMA IF NOT EXISTS synqora_core;
    CREATE TABLE IF NOT EXISTS synqora_core.schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations() {
  return runJsonArray(`
    SELECT COALESCE(json_agg(migration_name ORDER BY migration_name), '[]'::json)
    FROM synqora_core.schema_migrations;
  `);
}

async function applyMigration(fileName) {
  const migrationPath = path.join(migrationsDir, fileName);
  const sql = await fs.readFile(migrationPath, 'utf8');
  const safeFileName = fileName.replace(/'/g, "''");

  await runSql(`
    BEGIN;
    ${sql}
    INSERT INTO synqora_core.schema_migrations (migration_name)
    VALUES ('${safeFileName}')
    ON CONFLICT (migration_name) DO NOTHING;
    COMMIT;
  `);
}

async function main() {
  await ensureMigrationTable();
  const applied = new Set(await getAppliedMigrations());
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file}`);
      continue;
    }
    console.log(`apply ${file}`);
    await applyMigration(file);
  }

  console.log('Synqora migrations complete.');
}

main().catch((error) => {
  console.error(`Migration runner failed: ${error.message}`);
  process.exitCode = 1;
});
