/**
 * Database name shared by the API pool and the migrator.
 * An unset MYSQL_DB must not send migrate at one schema and the API at another.
 * Local `.env` sets MYSQL_DB, so this default applies only when the variable is missing.
 */
export function resolveMysqlDatabaseName(): string {
  const name = (process.env.MYSQL_DB || '').trim();
  if (name) return name;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MYSQL_DB is required when NODE_ENV is production');
  }
  return 'digital_research_manager';
}
