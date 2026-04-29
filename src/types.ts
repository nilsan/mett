/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Shared TypeScript interfaces — no project-level imports

/** Map region for the West & East block split. Validated at API boundaries
 *  (POST /game/start) so the rest of the codebase can trust the literal type. */
export type Region = 'west' | 'east';

/** Foreground colour against the civ's brand colour. Static reference data. */
export type TextColor = 'black' | 'white';

/** Type guard for Region — use at request boundaries before passing user input
 *  to functions whose signature expects Region. */
export function isRegion(s: unknown): s is Region {
  return s === 'west' || s === 'east';
}

export interface GameRow {
  id: number;
  expert: number;
  current_round: number;
  active: number;
  census_revealed: number;
  is_final_round: number;
  cities_phase: number;
  admin_password: string | null;
  started_at: string | null;
}

export interface PlayerRow {
  id: number;
  civ_id: number;
  name: string;
  military: number;
  wonder: number;
  ast_level: number;
  adv_points: number;
  adv_1vp: number;
  adv_3vp: number;
  adv_6vp: number;
  region: Region;
  rank_order: number;
  late_iron_age_bonus: number;
  // joined from civs
  civ_number: number;
  civ_name: string;
  civ_slug: string;
  civ_color: string;
  civ_text_color: TextColor;
}

export interface CensusRow {
  id: number;
  player_id: number;
  round: number;
  population: number | null;
  city_count: number | null;
  submitted_at: string | null;
}

export interface AstLevelRow {
  level: number;
  era: string;
  basic_req: string | null;
  expert_req: string | null;
  basic_req_json: string | null;
  expert_req_json: string | null;
}

export type AstStatus = 'advance' | 'stay' | 'regress' | 'unknown';

export interface FullState {
  game: GameRow;
  players: PlayerRow[];
  census: CensusRow[];
  astLevels: AstLevelRow[];
  /** Per-player next-AST prediction. Keyed by player id; computed once in
   *  getFullState so render paths and the WS broadcast both read the same map. */
  astStatus: Record<number, AstStatus>;
}

export interface CivRefRow {
  id: number;
  number: number;
  name: string;
  slug: string;
  color: string;
  text_color: TextColor;
  def_region: Region;
}
