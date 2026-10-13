import { readFileSync } from 'fs';
import { join } from 'path';

describe('experiment shape heal', () => {
  const sql = readFileSync(
    join(process.cwd(), 'database/migrations/mysql_experiments_shape_heal.sql'),
    'utf8'
  );

  it('adds tracker columns and the three lookup indexes', () => {
    for (const column of ['title', 'protocol_id', 'notebook_entry_id', 'lab_id', 'researcher_id']) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('idx_experiments_lab');
    expect(sql).toContain('idx_experiments_protocol');
    expect(sql).toContain('idx_experiments_researcher');
    expect(sql).toContain('SET title = name');
  });
});
