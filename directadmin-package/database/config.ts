import dotenv from 'dotenv';
import crypto from 'crypto';
import mysql, { type PoolConnection, type ResultSetHeader } from 'mysql2/promise';
import { resolveMysqlDatabaseName } from './databaseName.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEFAULT_POOL_MAX = Number(process.env.DB_POOL_MAX || 20);
const DEFAULT_IDLE_TIMEOUT = Number(process.env.DB_IDLE_TIMEOUT || 30_000);
const DEFAULT_CONNECTION_TIMEOUT = Number(process.env.DB_CONNECTION_TIMEOUT || 10_000);

const buildMysqlConfig = () => {
  if (process.env.MYSQL_URL) {
    return {
      uri: process.env.MYSQL_URL,
      connectionLimit: DEFAULT_POOL_MAX,
      connectTimeout: DEFAULT_CONNECTION_TIMEOUT,
    };
  }

  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: resolveMysqlDatabaseName(),
    user: process.env.MYSQL_USER || process.env.USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    socketPath: process.env.MYSQL_SOCKET || undefined,
    connectionLimit: DEFAULT_POOL_MAX,
    connectTimeout: DEFAULT_CONNECTION_TIMEOUT,
    idleTimeout: DEFAULT_IDLE_TIMEOUT,
  };
};

const config = buildMysqlConfig();
const pool = (config as { uri?: string }).uri
  ? mysql.createPool((config as { uri: string }).uri)
  : mysql.createPool(config);

/**
 * Rewrite Postgres-flavored SQL so it can run on MySQL/MariaDB.
 * Callers keep using $1 placeholders, ILIKE, RETURNING, etc.
 *
 * Note: numbered placeholders ($1, $2, …) are expanded in runNormalized
 * so repeated $1 correctly binds the same value to multiple ?.
 */
export const normalizeQuery = (text: string): string => {
  let sql = text;

  // Case-insensitive match
  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');

  // INTERVAL '30 days' → INTERVAL 30 DAY
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+days?'/gi, 'INTERVAL $1 DAY');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+hours?'/gi, 'INTERVAL $1 HOUR');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+minutes?'/gi, 'INTERVAL $1 MINUTE');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+months?'/gi, 'INTERVAL $1 MONTH');
  sql = sql.replace(/INTERVAL\s+'(\d+)\s+years?'/gi, 'INTERVAL $1 YEAR');

  // Strip common Postgres casts (leave the expression)
  sql = sql.replace(
    /::\s*(text|uuid|int|integer|bigint|smallint|boolean|bool|json|jsonb|date|timestamptz|timestamp|float|double|numeric|decimal|varchar|char)\b/gi,
    ''
  );

  // Boolean literals
  sql = sql.replace(/\bTRUE\b/gi, '1');
  sql = sql.replace(/\bFALSE\b/gi, '0');

  // ON CONFLICT DO NOTHING → INSERT IGNORE
  if (/\bON\s+CONFLICT\b/i.test(sql) && /\bDO\s+NOTHING\b/i.test(sql)) {
    sql = sql.replace(/\s+ON\s+CONFLICT\b[\s\S]*$/i, '');
    sql = sql.replace(/^(\s*)INSERT\s+INTO/i, '$1INSERT IGNORE INTO');
  }

  // ON CONFLICT (...) DO UPDATE SET a = EXCLUDED.a → ON DUPLICATE KEY UPDATE a = VALUES(a)
  if (/\bON\s+CONFLICT\b/i.test(sql) && /\bDO\s+UPDATE\s+SET\b/i.test(sql)) {
    const conflict = sql.match(/\s+ON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\s+SET\s+([\s\S]+)$/i);
    if (conflict) {
      const setClause = conflict[1].replace(/\bEXCLUDED\.(\w+)/gi, 'VALUES($1)');
      sql = sql.replace(/\s+ON\s+CONFLICT\b[\s\S]+$/i, '') + ` ON DUPLICATE KEY UPDATE ${setClause}`;
    }
  }

  return sql;
};

/** Expand Postgres $1/$2… (including repeats) into MySQL ? with a flat params array. */
export const expandDollarPlaceholders = (
  text: string,
  params: any[] = []
): { sql: string; params: any[] } => {
  if (!/\$\d+/.test(text)) {
    return { sql: text, params: [...params] };
  }
  const out: any[] = [];
  const sql = text.replace(/\$(\d+)/g, (_m, num: string) => {
    const idx = Number(num) - 1;
    out.push(params[idx]);
    return '?';
  });
  return { sql, params: out };
};

const countPlaceholdersBefore = (sql: string, index: number): number => {
  const slice = sql.slice(0, Math.max(0, index));
  return (slice.match(/\?/g) || []).length;
};

type QueryResult = { rows: any[]; insertId?: number; affectedRows?: number };

const runNormalized = async (
  executor: { query: (sql: string, params?: any[]) => Promise<any> },
  text: string,
  params: any[] = []
): Promise<QueryResult> => {
  const returningMatch = text.match(/\bRETURNING\b\s+[\s\S]+$/i);
  const rawWithoutReturning = returningMatch
    ? text.slice(0, returningMatch.index).trim()
    : text;

  let sql = normalizeQuery(rawWithoutReturning);
  // Expand $1/$2… so repeated $1 binds the same value to each ?
  let queryParams: any[];
  ({ sql, params: queryParams } = expandDollarPlaceholders(sql, params));

  // Postgres often omits id and relies on DB defaults + RETURNING.
  // For MySQL VARCHAR PK tables, inject a UUID when INSERT has no id column.
  if (returningMatch) {
    const insertMatchPre = sql.match(
      /^\s*INSERT\s+(IGNORE\s+)?INTO\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)(\s+ON\s+DUPLICATE\s+KEY\s+UPDATE[\s\S]*)?$/i
    );
    if (insertMatchPre) {
      const ignoreKw = insertMatchPre[1] || '';
      const table = insertMatchPre[2];
      const cols = insertMatchPre[3].split(',').map((c) => c.trim().replace(/[`"]/g, ''));
      const valuesList = insertMatchPre[4];
      const dupClause = insertMatchPre[5] || '';
      if (!cols.some((c) => c.toLowerCase() === 'id')) {
        const uuid = crypto.randomUUID();
        sql = `INSERT ${ignoreKw}INTO \`${table}\` (id, ${cols.join(', ')}) VALUES (?, ${valuesList})${dupClause}`;
        queryParams = [uuid, ...queryParams];
      }
    }
  }

  const [result] = await executor.query(sql, queryParams);

  // SELECT / SHOW / etc. already return row arrays
  if (Array.isArray(result)) {
    return { rows: result as any[] };
  }

  const header = result as ResultSetHeader;
  const base: QueryResult = {
    rows: [],
    insertId: header.insertId,
    affectedRows: header.affectedRows,
  };

  if (!returningMatch) {
    return base;
  }

  // Emulate RETURNING for INSERT … (id, …) VALUES (?, …)
  const insertMatch = sql.match(
    /^\s*INSERT\s+(?:IGNORE\s+)?INTO\s+`?([a-zA-Z0-9_]+)`?\s*\(([^)]+)\)/i
  );
  if (insertMatch) {
    const table = insertMatch[1];
    const cols = insertMatch[2].split(',').map((c) => c.trim().replace(/[`"]/g, ''));
    const idIdx = cols.findIndex((c) => c.toLowerCase() === 'id');
    if (idIdx >= 0 && queryParams[idIdx] != null) {
      const [rows] = await executor.query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [
        queryParams[idIdx],
      ]);
      return { ...base, rows: rows as any[] };
    }
    if (header.insertId) {
      const [rows] = await executor.query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [
        header.insertId,
      ]);
      return { ...base, rows: rows as any[] };
    }
  }

  // Emulate RETURNING for UPDATE/DELETE … WHERE id = ?
  const tableMatch =
    sql.match(/^\s*UPDATE\s+`?([a-zA-Z0-9_]+)`?/i) ||
    sql.match(/^\s*DELETE\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i);
  if (tableMatch) {
    const table = tableMatch[1];
    const whereIdx = sql.search(/\bWHERE\b/i);
    if (whereIdx >= 0) {
      const whereSql = sql.slice(whereIdx);
      const idEq = whereSql.match(/\bid\s*=\s*\?/i);
      if (idEq && idEq.index != null) {
        const paramIndex = countPlaceholdersBefore(sql, whereIdx + idEq.index);
        const idVal = queryParams[paramIndex];
        if (idVal != null) {
          const [rows] = await executor.query(`SELECT * FROM \`${table}\` WHERE id = ? LIMIT 1`, [
            idVal,
          ]);
          return { ...base, rows: rows as any[] };
        }
      }
    }
  }

  return base;
};

const query = async (text: string, params: any[] = []): Promise<QueryResult> =>
  runNormalized(pool, text, params);

const connect = async () => {
  const connection: PoolConnection = await pool.getConnection();
  try {
    await connection.query(
      "SET SESSION sql_mode = CONCAT(@@sql_mode, ',PIPES_AS_CONCAT')"
    );
  } catch {
    // ignore if mode already set / unsupported
  }
  return {
    query: async (text: string, params: any[] = []): Promise<QueryResult> =>
      runNormalized(connection, text, params),
    release: () => connection.release(),
  };
};

const end = async () => {
  await pool.end();
};

pool.on('connection', (connection) => {
  // mysql2 Connection#query overloads treat a function as QueryValues unless typed as callback
  void (connection as any).query(
    "SET SESSION sql_mode = CONCAT(@@sql_mode, ',PIPES_AS_CONCAT')"
  );
  if (process.env.DB_LOG_CONNECT === '1') {
    console.log('✅ Connected to MySQL database');
  }
});

export default {
  query,
  connect,
  end,
  normalizeQuery,
  pool,
};
