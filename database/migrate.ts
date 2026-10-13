/**
 * Apply all database/migrations/mysql_*.sql files idempotently.
 * Tracks applied files in schema_migrations.
 *
 * Usage: pnpm run db:migrate
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { resolveMysqlDatabaseName } from './databaseName.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MIGRATIONS_DIR = path.join(process.cwd(), 'database', 'migrations');

const connect = async () =>
  mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: resolveMysqlDatabaseName(),
    multipleStatements: true,
  });

const isIgnorable = (err: any): boolean => {
  const code = err?.code || '';
  const msg = String(err?.sqlMessage || err?.message || '');
  return (
    code === 'ER_DUP_FIELDNAME' ||
    code === 'ER_TABLE_EXISTS_ERROR' ||
    code === 'ER_DUP_KEYNAME' ||
    code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
    code === 'ER_DUP_ENTRY' ||
    code === 'ER_FK_DUP_NAME' ||
    code === 'ER_CANNOT_ADD_FOREIGN' ||
    /duplicate column/i.test(msg) ||
    /already exists/i.test(msg) ||
    /duplicate key/i.test(msg) ||
    /check that column\/key exists/i.test(msg) ||
    /Cannot add foreign key constraint/i.test(msg) ||
    /errno: 121/i.test(msg)
  );
};

/** Split SQL into executable statements; keep PREPARE/EXECUTE blocks intact enough via multipleStatements. */
function splitStatements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function ensureMigrationsTable(conn: mysql.Connection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function applyFile(conn: mysql.Connection, file: string) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const warnings: string[] = [];
  const deferred: string[] = [];

  const accept = (e: any, stmt: string) => {
    if (isIgnorable(e)) {
      warnings.push(`${e.code || 'WARN'}: ${e.sqlMessage || e.message}`);
      return;
    }
    // Alphabetical filenames run some ALTERs before the CREATE. Retry after every file.
    if (e?.code === 'ER_NO_SUCH_TABLE' && /^\s*(ALTER\s+TABLE|UPDATE|DELETE\s+FROM)\b/i.test(stmt)) {
      deferred.push(stmt);
      warnings.push(`deferred until later: ${e.sqlMessage || e.message}`);
      return;
    }
    throw e;
  };

  // Prefer whole-file execution (needed for PREPARE/EXECUTE patterns)
  try {
    await conn.query(sql);
    return { warnings, deferred };
  } catch (err: any) {
    if (isIgnorable(err)) {
      warnings.push(`${err.code || 'WARN'}: ${err.sqlMessage || err.message}`);
      return { warnings, deferred };
    }
  }

  for (const stmt of splitStatements(sql)) {
    try {
      await conn.query(stmt);
    } catch (e: any) {
      accept(e, stmt);
    }
  }
  return { warnings, deferred };
}

async function main() {
  const conn = await connect();
  await ensureMigrationsTable(conn);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.startsWith('mysql_') && f.endsWith('.sql'))
    .sort();

  // Ensure heal migration runs after others alphabetically — rename isn't needed;
  // mysql_schema_heal_common.sql sorts near the end.

  const [appliedRows] = await conn.query<any[]>('SELECT id FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.id));

  console.log(`Found ${files.length} migrations; ${applied.size} already recorded.`);

  let ran = 0;
  let skipped = 0;
  const deferred: { file: string; stmt: string }[] = [];
  const waiting = new Set<string>();

  for (const file of files) {
    if (applied.has(file)) {
      skipped++;
      continue;
    }
    process.stdout.write(`→ ${file} ... `);
    try {
      const result = await applyFile(conn, file);
      if (result.deferred.length > 0) {
        waiting.add(file);
        for (const stmt of result.deferred) deferred.push({ file, stmt });
        console.log(`ok (${result.deferred.length} deferred)`);
      } else {
        await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
        ran++;
        console.log(result.warnings.length ? `ok (${result.warnings.length} ignorable)` : 'ok');
      }
    } catch (err: any) {
      console.log('FAILED');
      console.error(`  ${err.code || ''} ${err.sqlMessage || err.message}`);
      console.error('Stopping. Fix the migration or database, then re-run.');
      await conn.end();
      process.exit(1);
    }
  }

  if (deferred.length > 0) {
    process.stdout.write(`→ deferred alters (${deferred.length}) ... `);
    try {
      for (const item of deferred) {
        try {
          await conn.query(item.stmt);
        } catch (e: any) {
          if (!isIgnorable(e)) throw e;
        }
      }
      for (const file of waiting) {
        await conn.query('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
        ran++;
      }
      console.log('ok');
    } catch (err: any) {
      console.log('FAILED');
      console.error(`  ${err.code || ''} ${err.sqlMessage || err.message}`);
      console.error('Stopping. Fix the migration or database, then re-run.');
      await conn.end();
      process.exit(1);
    }
  }

  // Always re-apply heal migration statements (idempotent) so local DBs catch up
  // even if an older heal version was recorded.
  process.stdout.write('→ heal pass (mysql_schema_heal_common.sql) ... ');
  try {
    await applyFile(conn, 'mysql_schema_heal_common.sql');
    console.log('ok');
  } catch (err: any) {
    console.log('FAILED');
    console.error(`  ${err.code || ''} ${err.sqlMessage || err.message}`);
  }

  console.log(`Done. Applied ${ran}, skipped ${skipped}.`);
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
