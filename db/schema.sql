-- METT: Mega Empires Turn Tracker
-- Database schema

-- Static civilization reference data (seeded at startup, never changes at runtime)
CREATE TABLE IF NOT EXISTS civs (
  id          INTEGER PRIMARY KEY,
  number      INTEGER NOT NULL UNIQUE,  -- Official civ number 1-18
  name        TEXT    NOT NULL UNIQUE,  -- "Egypt"
  slug        TEXT    NOT NULL UNIQUE,  -- "egypt" (URL path)
  color       TEXT    NOT NULL,         -- "#F7E6DE"
  text_color  TEXT    NOT NULL,         -- "black" or "white" (default, based on origin region)
  def_region  TEXT    NOT NULL          -- "west" or "east" (default region)
);

-- AST level definitions (seeded at startup)
CREATE TABLE IF NOT EXISTS ast_levels (
  level       INTEGER PRIMARY KEY,   -- 0, 5, 10, … 80
  era         TEXT    NOT NULL,       -- "Stone Age", "Early Bronze Age", etc.
  basic_req   TEXT,
  expert_req  TEXT
);

-- One active game (id always 1, reset on new game start)
CREATE TABLE IF NOT EXISTS game (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  expert        INTEGER NOT NULL DEFAULT 1,  -- 1=expert (default), 0=basic
  current_round INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 0,  -- 0=setup, 1=active
  census_revealed INTEGER NOT NULL DEFAULT 0, -- 0=hidden, 1=revealed for current round
  cities_phase  INTEGER NOT NULL DEFAULT 0,   -- 0=pre-trade, 1=post-calamity
  started_at    TEXT
);
INSERT OR IGNORE INTO game (id, expert, current_round, active) VALUES (1, 1, 1, 0);

-- Active players in current game
CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY,
  civ_id      INTEGER NOT NULL REFERENCES civs(id),
  name        TEXT    NOT NULL,
  military    INTEGER NOT NULL DEFAULT 0,
  ast_level   INTEGER NOT NULL DEFAULT 0,  -- current AST points (0,5,10...80)
  adv_points  INTEGER NOT NULL DEFAULT 0,  -- total civilization advance VP
  region      TEXT    NOT NULL             -- "west" or "east" for this game (may differ from default)
);

-- Census entries per player per round
CREATE TABLE IF NOT EXISTS census (
  id           INTEGER PRIMARY KEY,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round        INTEGER NOT NULL,
  population   INTEGER,              -- NULL = not yet submitted
  submitted_at TEXT,
  city_count   INTEGER,              -- NULL = not yet submitted
  UNIQUE(player_id, round)
);

-- Seed civilization data
INSERT OR IGNORE INTO civs (number, name, slug, color, text_color, def_region) VALUES
  (1,  'Minoa',    'minoa',    '#BDCF01', 'black', 'west'),
  (2,  'Saba',     'saba',     '#FF6A14', 'white', 'east'),
  (3,  'Assyria',  'assyria',  '#A3D8E2', 'black', 'west'),
  (4,  'Maurya',   'maurya',   '#DD4343', 'white', 'east'),
  (5,  'Celt',     'celt',     '#16C345', 'black', 'west'),
  (6,  'Babylon',  'babylon',  '#A7A9AB', 'white', 'east'),
  (7,  'Carthage', 'carthage', '#FE9016', 'black', 'west'),
  (8,  'Dravidia', 'dravidia', '#0A2A8A', 'white', 'east'),
  (9,  'Hatti',    'hatti',    '#E8AFCE', 'black', 'west'),
  (10, 'Kushan',   'kushan',   '#9C422C', 'white', 'east'),
  (11, 'Rome',     'rome',     '#EC008D', 'black', 'west'),
  (12, 'Persia',   'persia',   '#5F43B7', 'white', 'east'),
  (13, 'Iberia',   'iberia',   '#FFFFFF', 'black', 'west'),
  (14, 'Nubia',    'nubia',    '#00B1B7', 'white', 'east'),
  (15, 'Hellas',   'hellas',   '#F5EE2A', 'black', 'west'),
  (16, 'Indus',    'indus',    '#3F8D43', 'white', 'east'),
  (17, 'Egypt',    'egypt',    '#F7E6DE', 'black', 'west'),
  (18, 'Parthia',  'parthia',  '#847C49', 'white', 'east');

-- Seed AST level data
-- Notation: C=cities, ADV=civilization advances, >N=min cost N each, <N=max cost N each, VP=victory points
INSERT OR IGNORE INTO ast_levels (level, era, basic_req, expert_req) VALUES
  (0,  'Stone Age',        'None',                          'None'),
  (5,  'Stone Age',        'None',                          'None'),
  (10, 'Stone Age',        'None',                          'None'),
  (15, 'Stone Age',        'None',                          'None'),
  (20, 'Early Bronze Age', '2 cities',                      '3 cities'),
  (25, 'Early Bronze Age', '2 cities',                      '3 cities'),
  (30, 'Early Bronze Age', '2 cities',                      '3 cities'),
  (35, 'Middle Bronze Age','3 cities + 3 advances',         '3 cities + 5 VP in advances'),
  (40, 'Middle Bronze Age','3 cities + 3 advances',         '3 cities + 5 VP in advances'),
  (45, 'Middle Bronze Age','3 cities + 3 advances',         '3 cities + 5 VP in advances'),
  (50, 'Late Bronze Age',  '3 cities + 3 advances (≥100 each)', '4 cities + 12 advances'),
  (55, 'Late Bronze Age',  '3 cities + 3 advances (≥100 each)', '4 cities + 12 advances'),
  (60, 'Late Bronze Age',  '3 cities + 3 advances (≥100 each)', '4 cities + 12 advances'),
  (65, 'Early Iron Age',   '4 cities + 2 advances (≥200 each)', '5 cities + 10 advances (<100 each) + 38 VP'),
  (70, 'Early Iron Age',   '5 cities + 3 advances (≥200 each)', '6 cities + all 17 advances (<100 each) + 56 VP'),
  (75, 'Late Iron Age',    'N/A',                           '6 cities + all 17 advances (<100 each) + 56 VP'),
  (80, 'Late Iron Age',    'N/A',                           'N/A');
