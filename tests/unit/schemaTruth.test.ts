import { readFileSync } from 'fs';
import { join } from 'path';

describe('schema truth', () => {
  it('does not create ai_platform_usage at runtime', () => {
    const source = readFileSync(join(process.cwd(), 'server/services/platformAiAccess.ts'), 'utf8');
    expect(source).not.toMatch(/CREATE\s+TABLE/i);
  });

  it('ships the missing-table migration', () => {
    const sql = readFileSync(
      join(process.cwd(), 'database/migrations/mysql_schema_truth_missing_tables.sql'),
      'utf8'
    );
    for (const table of [
      'calendar_events',
      'instrument_maintenance',
      'resource_exchange_requests',
      'resource_exchange_offers',
      'data_templates',
      'experiment_risks',
      'experiment_comments',
      'successful_alternatives',
      'failure_patterns',
      'negative_results_contributor_stats',
      'user_ai_failure_patterns',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql).toContain("DEFAULT 'student'");
    expect(sql).toContain("DEFAULT 'active'");
  });
});
