-- This Source Code Form is subject to the terms of the Mozilla Public
-- License, v. 2.0. If a copy of the MPL was not distributed with this
-- file, You can obtain one at https://mozilla.org/MPL/2.0/.

-- me[tt]: Mega Empires Turn Tracker
-- Database schema

-- Static civilization reference data. Seeded at startup from CIVS in src/civs.ts
-- (the single source of truth); never changes at runtime.
CREATE TABLE IF NOT EXISTS civs (
  id          INTEGER PRIMARY KEY,
  number      INTEGER NOT NULL UNIQUE,  -- Official civ number 1-18
  name        TEXT    NOT NULL UNIQUE,  -- "Egypt"
  slug        TEXT    NOT NULL UNIQUE,  -- "egypt" (URL path)
  color       TEXT    NOT NULL,         -- "#F7E6DE"
  text_color  TEXT    NOT NULL,         -- "black" or "white" (default, based on origin region)
  def_region  TEXT    NOT NULL          -- "west" or "east" (default region)
);

-- One active game (id always 1, reset on new game start)
CREATE TABLE IF NOT EXISTS game (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  expert          INTEGER NOT NULL DEFAULT 1,  -- 1=expert (default), 0=basic
  current_round   INTEGER NOT NULL DEFAULT 1,
  active          INTEGER NOT NULL DEFAULT 0,  -- 0=setup, 1=active
  census_revealed INTEGER NOT NULL DEFAULT 0,  -- 0=hidden, 1=revealed for current round
  is_final_round  INTEGER NOT NULL DEFAULT 0,  -- expert only: LIA reached, one more round
  cities_phase    INTEGER NOT NULL DEFAULT 0,  -- 0=pre-trade, 1=post-calamity
  admin_password  TEXT,                        -- scrypt hash, seeded from ADMIN_PASSWORD env on first boot; never selected into GameRow
  started_at      TEXT
);
INSERT OR IGNORE INTO game (id, expert, current_round, active) VALUES (1, 1, 1, 0);

-- Active players in current game
CREATE TABLE IF NOT EXISTS players (
  id                   INTEGER PRIMARY KEY,
  civ_id               INTEGER NOT NULL REFERENCES civs(id),
  name                 TEXT    NOT NULL,
  military             INTEGER NOT NULL DEFAULT 0,
  wonder               INTEGER NOT NULL DEFAULT 0,
  ast_level            INTEGER NOT NULL DEFAULT 0,  -- current AST points (0,5,10...80)
  adv_points           INTEGER NOT NULL DEFAULT 0,  -- total civilization advance VP
  adv_1vp              INTEGER NOT NULL DEFAULT 0,  -- count of <100 VP advances
  adv_3vp              INTEGER NOT NULL DEFAULT 0,  -- count of ≥100 VP advances
  adv_6vp              INTEGER NOT NULL DEFAULT 0,  -- count of ≥200 VP advances
  region               TEXT    NOT NULL,            -- "west" or "east" for this game
  rank_order           INTEGER NOT NULL DEFAULT 0,  -- 0=unresolved; nonzero=admin tie-break rank
  late_iron_age_bonus  INTEGER NOT NULL DEFAULT 0,  -- 5 VP bonus for simultaneous LIA finish
  regressed            INTEGER NOT NULL DEFAULT 0   -- 1 = admin regressed this player (calamity) this round; red marker on status board, cleared on round advance
);

-- Census entries per player per round
CREATE TABLE IF NOT EXISTS census (
  id           INTEGER PRIMARY KEY,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round        INTEGER NOT NULL,
  population   INTEGER,              -- NULL = not yet submitted
  submitted_at TEXT,
  city_count   INTEGER,              -- NULL = not yet submitted
  moved        INTEGER NOT NULL DEFAULT 0,  -- 1 = units moved this round (optional neighbour-readiness signal)
  UNIQUE(player_id, round)
);

-- Admin login sessions. The cookie carries a random token; only its SHA-256 is
-- stored. Cleared wholesale when the admin password changes.
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT    PRIMARY KEY,
  expires_at  INTEGER NOT NULL      -- unix epoch ms
);
