import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function buildPsqlArgs() {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-At'];
  const database = process.env.SYNQORA_DATABASE_URL || process.env.SYNQORA_DB_NAME || process.env.PGDATABASE;
  if (database) {
    args.push('-d', database);
  }
  return args;
}

function buildEnv() {
  return {
    ...process.env
  };
}

export async function runSql(sql) {
  const { stdout } = await execFileAsync('psql', [...buildPsqlArgs(), '-c', sql], {
    env: buildEnv(),
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout.trim();
}

export async function runSqlFile(filePath) {
  const { stdout } = await execFileAsync('psql', [...buildPsqlArgs(), '-f', filePath], {
    env: buildEnv(),
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout.trim();
}

export async function runJsonObject(sql, fallback = null) {
  const output = await runSql(sql);
  if (!output) {
    return fallback;
  }
  return JSON.parse(output);
}

export async function runJsonArray(sql) {
  const result = await runJsonObject(sql, []);
  return Array.isArray(result) ? result : [];
}

export function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function sqlNullable(value) {
  return value === null || value === undefined ? 'NULL' : sqlString(value);
}

export function sqlBoolean(value) {
  return value ? 'true' : 'false';
}

export function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? {}))}::jsonb`;
}
