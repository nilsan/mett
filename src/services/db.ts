import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = process.env.DATABASE_PATH ?? join(import.meta.dir, '..', '..', 'data', 'mett.db');

let _db: Database | null = null;
let _testDb: Database | null = null;

/** Override the DB instance for isolated unit/integration tests. Pass null to restore. */
export function _setTestDb(db: Database | null): void {
  _testDb = db;
}

// Structured AST requirements seeded into ast_levels.{basic,expert}_req_json.
// Tier values: 'any' = all advances, 'medium' = adv_3vp+adv_6vp (≥100 each),
//              'expensive' = adv_6vp (≥200 each), 'cheap' = adv_1vp (<100 each).
const AST_REQ_SEED: Record<number, { basic: object | null; expert: object | null }> = {
  0:  { basic: null, expert: null },
  5:  { basic: null, expert: null },
  10: { basic: null, expert: null },
  15: { basic: null, expert: null },
  20: { basic: { cities: 2 },                                                     expert: { cities: 3 } },
  25: { basic: { cities: 2 },                                                     expert: { cities: 3 } },
  30: { basic: { cities: 2 },                                                     expert: { cities: 3 } },
  35: { basic: { cities: 3, advCount: 3, advTier: 'any' },                        expert: { cities: 3, advVpTotal: 5 } },
  40: { basic: { cities: 3, advCount: 3, advTier: 'any' },                        expert: { cities: 3, advVpTotal: 5 } },
  45: { basic: { cities: 3, advCount: 3, advTier: 'any' },                        expert: { cities: 3, advVpTotal: 5 } },
  50: { basic: { cities: 3, advCount: 3, advTier: 'medium' },                     expert: { cities: 4, advCount: 12, advTier: 'any' } },
  55: { basic: { cities: 3, advCount: 3, advTier: 'medium' },                     expert: { cities: 4, advCount: 12, advTier: 'any' } },
  60: { basic: { cities: 3, advCount: 3, advTier: 'medium' },                     expert: { cities: 4, advCount: 12, advTier: 'any' } },
  65: { basic: { cities: 4, advCount: 2, advTier: 'expensive' },                  expert: { cities: 5, advCount: 10, advTier: 'cheap', totalVp: 38 } },
  70: { basic: { cities: 5, advCount: 3, advTier: 'expensive' },                  expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 } },
  75: { basic: { impossible: true },                                               expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 } },
  80: { basic: { impossible: true },                                               expert: { impossible: true } },
};

export function getDb(): Database {
  if (_testDb) return _testDb;
  if (_db) return _db;

  _db = new Database(DB_PATH, { create: true });
  _db.exec('PRAGMA journal_mode=WAL;');
  _db.exec('PRAGMA foreign_keys=ON;');
  const schema = readFileSync(join(import.meta.dir, '..', '..', 'db', 'schema.sql'), 'utf8');
  _db.exec(schema);

  function migrate(sql: string) {
    try { _db!.exec(sql); } catch (e: any) {
      if (!String(e?.message).includes('duplicate column name')) throw e;
    }
  }

  migrate('ALTER TABLE players ADD COLUMN rank_order INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN adv_1vp INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN adv_3vp INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN adv_6vp INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE census ADD COLUMN city_count INTEGER');
  migrate('ALTER TABLE players ADD COLUMN ast_moved INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE game ADD COLUMN is_final_round INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN late_iron_age_bonus INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE game ADD COLUMN cities_phase INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE game ADD COLUMN admin_password TEXT');
  migrate('ALTER TABLE players ADD COLUMN wonder INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE ast_levels ADD COLUMN basic_req_json TEXT');
  migrate('ALTER TABLE ast_levels ADD COLUMN expert_req_json TEXT');

  // Fix basic EIA/LIA era assignments
  _db.query("UPDATE ast_levels SET era='Early Iron Age', basic_req='5 cities + 3 advances (≥200 each)' WHERE level=70").run();
  _db.query("UPDATE ast_levels SET era='Late Iron Age', basic_req='N/A', expert_req='6 cities + all 17 advances (<100 each) + 56 VP' WHERE level=75").run();

  // Seed JSON requirements (idempotent)
  const seedStmt = _db.prepare('UPDATE ast_levels SET basic_req_json=?, expert_req_json=? WHERE level=?');
  for (const [lvl, { basic, expert }] of Object.entries(AST_REQ_SEED)) {
    seedStmt.run(
      basic  ? JSON.stringify(basic)  : null,
      expert ? JSON.stringify(expert) : null,
      parseInt(lvl),
    );
  }

  // Seed admin password from env var on first run
  const envPassword = process.env.ADMIN_PASSWORD ?? 'PASSWORD';
  const row = _db.query<{ admin_password: string | null }, []>('SELECT admin_password FROM game WHERE id=1').get();
  if (!row?.admin_password) {
    _db.query('UPDATE game SET admin_password=? WHERE id=1').run(envPassword);
  }

  return _db;
}
