#!/usr/bin/env python3
"""
me[tt] end-to-end game simulations via API.

  SIM 1 — 6-player Basic: late-start civs (Celt/Iberia) at MBA levels 35/40,
           LIA bonus when all hit 70 simultaneously, game end at 75.
  SIM 2 — 5-player Expert: slow-start civs (Minoa/Kushan) free through level 20,
           Wonder +1 city, expert MBA stall, LIA bonus to exactly-1, final round.
  SIM 3 — 7-player Basic: move order (military last, lowest-pop first), game end.
  SIM 4 — 16-player Expert (official 16p scenario): all 16 empires reach AST 80, round 16.
  SIM 5 — 16-player Expert: varied AST progress (groups at 80/65/50/35).

Usage:
  python3 tests/simulate.py
  METT_ADMIN_PASSWORD=mypass python3 tests/simulate.py
"""

import os
import sys
import time
import traceback
import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

BASE = "http://localhost:3000"
PASS_COUNT = 0
FAIL_COUNT = 0
SIM_ERRS   = []

ADMIN_COOKIE = os.environ.get('METT_ADMIN_PASSWORD', 'password')
SESSION = requests.Session()
SESSION.cookies.set('mett_admin', ADMIN_COOKIE)


# ─── API helpers ──────────────────────────────────────────────────────────────

def api(method, path, **kwargs):
    r = SESSION.request(method.upper(), f"{BASE}/api{path}", **kwargs)
    if r.status_code >= 400:
        raise RuntimeError(f"API {r.status_code}: {path} → {r.text[:300]}")
    return r.json()

def reset():          api('post', '/game/reset', json={'confirm': True})
def reveal():         api('post', '/census/reveal', json={})
def next_round():     return api('post', '/game/round/next', json={})
def state():          return api('get', '/state')

def start_game(expert, players):
    api('post', '/game/start', json={'expert': expert, 'players': players})
    return {p['civ_name']: p['id'] for p in state()['players']}

def census(pid, pop):           api('post', f'/players/{pid}/census',     json={'population': pop})
def city_count(pid, n):         api('post', f'/players/{pid}/city-count', json={'city_count': n})
def adv(pid, v1=0, v3=0, v6=0): api('post', f'/players/{pid}/adv',       json={'adv_1vp': v1, 'adv_3vp': v3, 'adv_6vp': v6})
def military(pid):              api('post', f'/players/{pid}/military',   json={})
def wonder_toggle(pid):         api('post', f'/players/{pid}/wonder',     json={})

def players_by_name():
    return {p['civ_name']: p for p in state()['players']}


def selenium_census_order():
    """Read census table row order from the rendered main page via headless Chrome."""
    opts = Options()
    opts.add_argument('--headless')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-cache')
    svc = Service('/usr/bin/chromedriver')
    driver = webdriver.Chrome(service=svc, options=opts)
    try:
        driver.get(BASE + '/')
        time.sleep(0.8)
        rows = driver.find_elements(By.CSS_SELECTOR, '.census-table tbody tr')
        names = []
        for row in rows:
            cell = row.find_element(By.CSS_SELECTOR, '.empire-cell')
            # cell text = "17Egypt" (span + text node); get just the text node
            name = driver.execute_script(
                "return Array.from(arguments[0].childNodes)"
                ".filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()",
                cell,
            )
            names.append(name)
        return names
    finally:
        driver.quit()


# ─── Assertion helpers ────────────────────────────────────────────────────────

def check(label, cond, detail=''):
    global PASS_COUNT, FAIL_COUNT
    if cond:
        PASS_COUNT += 1
        print(f"  ✓ {label}")
    else:
        FAIL_COUNT += 1
        print(f"  ✗ {label}{(' — ' + str(detail)) if detail else ''}")

def check_eq(label, got, expected):
    check(label, got == expected, f"got {got!r}, expected {expected!r}")


# ─── Round helpers ────────────────────────────────────────────────────────────

def do_round(pids, cities_map, adv_map, pops=None):
    """Submit census, reveal, submit cities+advances, advance round."""
    if pops is None:
        # Give each player a different population so ordering is deterministic
        pops = {pid: 10 + i * 5 for i, pid in enumerate(pids)}
    for pid, pop in pops.items():
        census(pid, pop)
    reveal()
    for pid, n in cities_map.items():
        city_count(pid, n)
    for pid, (v1, v3, v6) in adv_map.items():
        adv(pid, v1, v3, v6)
    return next_round()


# ─── SIM 1: 6-player Basic ────────────────────────────────────────────────────
# AST key facts (basic):
#   Levels 0,5,10,15: null req → always free
#   Levels 20,25,30:  {cities: 2}
#   Levels 35,40,45:  {cities:3, advCount:3, advTier:'any'}
#   EXCEPT late-start civs (ebaEnd=40): override at level 35 only → {cities: 2}
#   Levels 50,55,60:  {cities:3, advCount:3, advTier:'medium'}
#   Level 65:         {cities:4, advCount:2, advTier:'expensive'}
#   Level 70:         {cities:5, advCount:3, advTier:'expensive'}
#   Levels 75,80:     impossible

def sim1():
    print("\n═══ SIM 1: 6-player Basic ═══")
    reset()
    ids = start_game(0, [
        {'civ_id': 17, 'name': 'Egypt',   'region': 'west'},
        {'civ_id': 15, 'name': 'Hellas',  'region': 'west'},
        {'civ_id': 11, 'name': 'Rome',    'region': 'west'},
        {'civ_id':  5, 'name': 'Celt',    'region': 'west'},  # late-start: ebaEnd=40
        {'civ_id': 13, 'name': 'Iberia',  'region': 'west'},  # late-start: ebaEnd=40
        {'civ_id':  6, 'name': 'Babylon', 'region': 'east'},
    ])
    pids = [ids['Egypt'], ids['Hellas'], ids['Rome'], ids['Celt'], ids['Iberia'], ids['Babylon']]
    eg, he, ro, ce, ib, ba = pids

    def rnd(cities, v1=0, v3=0, v6=0, cities_override=None, adv_override=None):
        cm = cities_override or {p: cities for p in pids}
        am = adv_override or {p: (v1, v3, v6) for p in pids}
        return do_round(pids, cm, am)

    # ── Stone Age: rounds 1-4 (levels 0→5→10→15→20, all null req = free) ──────
    for _ in range(4):
        rnd(0)
    s = players_by_name()
    check_eq("After 4 rounds: all at level 20 (Stone Age all free)", s['Egypt']['ast_level'], 20)
    check_eq("After 4 rounds: Celt at 20 (late-start, same Stone Age)", s['Celt']['ast_level'], 20)

    # ── EBA: rounds 5-7 (levels 20→25→30→35, need 2 cities) ─────────────────
    for _ in range(3):
        rnd(2)
    s = players_by_name()
    check_eq("After 7 rounds: all at level 35 (EBA done)", s['Egypt']['ast_level'], 35)
    check_eq("Babylon also at 35 (2 cities sufficient)", s['Babylon']['ast_level'], 35)

    # ── MBA round 8: advance 35→40 ────────────────────────────────────────────
    # Celt/Iberia (ebaEnd=40): level 35 override → need only 2 cities (no advances)
    # Others: need 3 cities + 3 any advances
    rnd(0,
        cities_override={eg:3, he:3, ro:3, ce:2, ib:2, ba:3},
        adv_override   ={eg:(3,0,0), he:(3,0,0), ro:(3,0,0), ce:(0,0,0), ib:(0,0,0), ba:(3,0,0)},
    )
    s = players_by_name()
    check_eq("Level 35 override: Celt advances to 40 with 2 cities (no advances needed)", s['Celt']['ast_level'], 40)
    check_eq("Level 35 override: Iberia advances to 40 with 2 cities", s['Iberia']['ast_level'], 40)
    check_eq("Level 35 normal: Egypt advances to 40 (3 cities + 3 advances)", s['Egypt']['ast_level'], 40)

    # ── MBA round 9: advance 40→45 (no override — ebaEnd exhausted at 40) ─────
    # All need 3 cities + 3 any advances, including Celt/Iberia
    rnd(4, v1=3)
    s = players_by_name()
    check_eq("Level 40: Celt needs 3 advances now (override gone at 40)", s['Celt']['ast_level'], 45)
    check_eq("Level 40: Iberia at 45", s['Iberia']['ast_level'], 45)

    # ── MBA/LBA rounds 10-15: 45→50→55→60→65→70→75 ─────────────────────────
    # Levels 45: {cities:3, advCount:3, advTier:'any'}  (3 any adv; use adv_6vp which is also any)
    # Levels 50,55,60: {cities:3, advCount:3, advTier:'medium'}  (adv_3vp + adv_6vp >= 3)
    # Level 65: {cities:4, advCount:2, advTier:'expensive'}      (adv_6vp >= 2)
    # Level 70: {cities:5, advCount:3, advTier:'expensive'}      (adv_6vp >= 3)
    #
    # Using adv_6vp for all rounds because expensive ⊆ medium ⊆ any:
    #   expensive=3 → counts as 3 medium, 3 any → satisfies MBA and LBA too
    #   at level 65 need 2 expensive → 3 >= 2 ✓
    #   at level 70 need 3 expensive → 3 >= 3 ✓

    # Round 10 (from 45, need 3 any + 3 cities)
    rnd(4, v6=3)
    # Round 11 (from 50, need 3 medium + 3 cities) — adv_6vp=3 is also medium
    rnd(4, v6=3)
    # Round 12 (from 55, same)
    rnd(4, v6=3)
    s = players_by_name()
    check_eq("After LBA rounds: all at 60", s['Egypt']['ast_level'], 60)

    # Round 13 (from 60, need 3 medium + 3 cities → advance to 65)
    rnd(5, v6=3)
    s = players_by_name()
    check_eq("EIA: all advance to 65 (5 cities, 3 expensive counts as medium)", s['Egypt']['ast_level'], 65)

    # Round 14 (from 65, need 2 expensive + 4 cities → advance to 70)
    rnd(6, v6=3)
    s = players_by_name()
    check_eq("EIA: all at 70", s['Egypt']['ast_level'], 70)
    check_eq("Celt at 70", s['Celt']['ast_level'], 70)

    # LIA bonus: all 6 players hit 70 in the same round → no bonus granted (correct)
    lia_count = sum(1 for p in state()['players'] if p['late_iron_age_bonus'])
    check("LIA bonus: 0 granted when all hit 70 simultaneously", lia_count == 0,
          f"got {lia_count}")

    # Round 15 (from 70, need 3 expensive + 5 cities → advance to 75 → game ends)
    result = rnd(6, v6=3)
    s = state()
    check("Basic game ended when players hit 75", not s['game']['active'],
          f"active={s['game']['active']}")
    check("is_final_round cleared on end", s['game']['is_final_round'] == 0)


# ─── SIM 2: 5-player Expert ───────────────────────────────────────────────────
# AST key facts (expert):
#   Levels 0,5,10,15: null req → free for everyone
#   Level 20: {cities:3}; BUT slow-start civs (1,2,10,13, stoneEnd=25): free (20 < 25)
#   Levels 25,30: {cities:3}; slow-start at 25 is NOT free (25 not < 25) → need 3 cities
#   Levels 35,40,45: {cities:3, advVpTotal:5}  (3 cities + 5 VP in advances)
#   Levels 50,55,60: {cities:4, advCount:12, advTier:'any'}
#   Level 65: {cities:5, advCount:10, advTier:'cheap', totalVp:38}
#   Level 70,75: {cities:6, advCount:17, advTier:'cheap', totalVp:56}
#   Level 80: impossible
# Expert game end: is_final_round=1 when any player hits ≥75; one more round, then end.

def sim2():
    print("\n═══ SIM 2: 5-player Expert ═══")
    reset()
    ids = start_game(1, [
        {'civ_id':  1, 'name': 'Minoa',  'region': 'west'},  # slow-start expert: stoneEnd=25
        {'civ_id': 10, 'name': 'Kushan', 'region': 'east'},  # slow-start expert: stoneEnd=25
        {'civ_id': 17, 'name': 'Egypt',  'region': 'west'},  # gets Wonder; normal stoneEnd=20
        {'civ_id': 15, 'name': 'Hellas', 'region': 'west'},  # normal
        {'civ_id': 12, 'name': 'Persia', 'region': 'east'},  # normal; stalls at MBA
    ])
    mi, ku, eg, he, pe = ids['Minoa'], ids['Kushan'], ids['Egypt'], ids['Hellas'], ids['Persia']

    # Give Egypt a Wonder (counts as +1 effective city in autoAdvanceAst)
    wonder_toggle(eg)
    check("Egypt Wonder enabled", next(p['wonder'] for p in state()['players'] if p['id']==eg) == 1)

    # ── Stone Age: rounds 1-4 (null reqs, all free) ───────────────────────────
    for _ in range(4):
        do_round([mi,ku,eg,he,pe], {p:0 for p in [mi,ku,eg,he,pe]}, {p:(0,0,0) for p in [mi,ku,eg,he,pe]})
    s = players_by_name()
    check_eq("After 4 rounds: all at 20 (Stone Age free for everyone)", s['Minoa']['ast_level'], 20)
    check_eq("After 4 rounds: Egypt at 20", s['Egypt']['ast_level'], 20)

    # ── Round 5: advance 20→25 ────────────────────────────────────────────────
    # Minoa/Kushan (slow-start, stoneEnd=25): level 20 < 25 → FREE → advance with 0 cities
    # Egypt: 2 real cities + Wonder = 3 effective → passes {cities:3} req
    # Hellas/Persia: need 3 cities
    do_round([mi,ku,eg,he,pe],
             {mi:0, ku:0, eg:2, he:3, pe:3},
             {p:(0,0,0) for p in [mi,ku,eg,he,pe]})
    s = players_by_name()
    check_eq("Round 5: Minoa at 25 (free advancement from 20, slow-start)", s['Minoa']['ast_level'], 25)
    check_eq("Round 5: Kushan at 25 (free, slow-start)", s['Kushan']['ast_level'], 25)
    check_eq("Round 5: Egypt at 25 (2+1 Wonder = 3 effective cities)", s['Egypt']['ast_level'], 25)
    check_eq("Round 5: Hellas at 25 (3 cities)", s['Hellas']['ast_level'], 25)

    # ── Round 6: advance 25→30 ────────────────────────────────────────────────
    # Minoa/Kushan now need 3 cities (level 25: 25 not < 25, shortcut doesn't fire)
    do_round([mi,ku,eg,he,pe],
             {mi:3, ku:3, eg:2, he:3, pe:3},  # Egypt: 2+1=3 effective
             {p:(0,0,0) for p in [mi,ku,eg,he,pe]})
    s = players_by_name()
    check_eq("Round 6: Minoa at 30 (needs 3 cities at level 25)", s['Minoa']['ast_level'], 30)
    check_eq("Round 6: Egypt at 30 (Wonder still helping)", s['Egypt']['ast_level'], 30)

    # ── Round 7: advance 30→35 ────────────────────────────────────────────────
    do_round([mi,ku,eg,he,pe],
             {mi:3, ku:3, eg:2, he:3, pe:3},
             {p:(0,0,0) for p in [mi,ku,eg,he,pe]})

    # ── Round 8: advance 35→40 (expert MBA: 3 cities + 5 VP in advances) ─────
    # Persia gets only 3VP → stalls at 35; others get 5VP → advance to 40
    do_round([mi,ku,eg,he,pe],
             {mi:3, ku:3, eg:2, he:3, pe:3},
             {mi:(5,0,0), ku:(5,0,0), eg:(5,0,0), he:(5,0,0), pe:(3,0,0)})
    s = players_by_name()
    check_eq("MBA 35: Minoa at 40 (3 cities + 5VP)", s['Minoa']['ast_level'], 40)
    check_eq("MBA 35: Egypt at 40 (2+1 Wonder + 5VP)", s['Egypt']['ast_level'], 40)
    check_eq("MBA 35: Persia stalls at 35 (only 3VP < 5VP required)", s['Persia']['ast_level'], 35)

    # ── Round 9: advance 40→45; Persia catches up (now 5VP) ──────────────────
    do_round([mi,ku,eg,he,pe],
             {mi:3, ku:3, eg:2, he:3, pe:3},
             {mi:(5,0,0), ku:(5,0,0), eg:(5,0,0), he:(5,0,0), pe:(5,0,0)})
    s = players_by_name()
    check_eq("Round 9: Persia at 40 (catches up)", s['Persia']['ast_level'], 40)
    check_eq("Round 9: Egypt at 45", s['Egypt']['ast_level'], 45)

    # ── Round 10: advance 45→50 ───────────────────────────────────────────────
    do_round([mi,ku,eg,he,pe],
             {mi:3, ku:3, eg:2, he:3, pe:3},
             {mi:(5,0,0), ku:(5,0,0), eg:(5,0,0), he:(5,0,0), pe:(5,0,0)})

    # ── Remove Wonder from Egypt before LBA (need 4 real cities for LBA) ──────
    # At level 50, expert req = {cities:4, advCount:12, advTier:'any'}.
    # With Wonder: 3+1=4 effective. Without: need 4 real cities.
    # Test Wonder at LBA: keep it on → Egypt passes with 3 real cities.

    # ── LBA: rounds 11-13 (levels 50→55→60, 4 cities + 12 any advances) ──────
    # Egypt has Wonder → 3 real = 4 effective → qualifies
    # Using 12 adv_1vp (12 any advances, adv_points=12)
    for _ in range(3):
        do_round([mi,ku,eg,he,pe],
                 {mi:4, ku:4, eg:3, he:4, pe:4},  # Egypt 3+1=4 effective
                 {p:(12,0,0) for p in [mi,ku,eg,he,pe]})
    s = players_by_name()
    # 3 LBA rounds advance from 50→55→60→65, so everyone is at 65 after the loop
    check_eq("LBA done: Egypt at 65 (3 LBA rounds: 50→55→60→65, Wonder gave 4th city)", s['Egypt']['ast_level'], 65)
    check_eq("LBA done: Hellas at 65", s['Hellas']['ast_level'], 65)

    # ── Remove Wonder before EIA (level 65 needs 5 cities, Wonder only adds 1) ─
    wonder_toggle(eg)
    check("Egypt Wonder removed", next(p['wonder'] for p in state()['players'] if p['id']==eg) == 0)

    # ── EIA round 1: advance 60→65 ────────────────────────────────────────────
    # Level 60 expert req: {cities:4, advCount:12, advTier:'any'} → 4 cities + 12 any
    # Level 65 expert req: {cities:5, advCount:10, advTier:'cheap', totalVp:38}
    #   cheap = adv_1vp; need: 5 cities, adv_1vp>=10, adv_points>=38
    #   Using adv_1vp=38 → 38 cheap ✓, adv_points=38 ✓
    # Stagger: give Egypt 38VP (advances to 65), others only 12VP (stall at 60)
    # BUT first, everyone is at 60 → check for level 60 req (4 cities + 12 any) to advance to 65
    # Wait: everyone is already past level 60 (they're AT 60, trying to advance to 65)
    # The req check uses the CURRENT level's req. At level 60: {cities:4, advCount:12, advTier:'any'}
    # With adv_1vp=12, passes. So in round 14, everyone with 4+ cities + 12 adv_1vp advances to 65.
    # To stagger: give Persia 5 cities but only 10 adv_1vp → fails count check → stalls at 60.

    # Actually wait - I want Hellas to advance to 65 too (for LIA bonus test).
    # Strategy: Egypt + Hellas get enough to advance 60→65; others stall.
    # Level 60 req: 4 cities + 12 any → give Egypt/Hellas 12+ advances, others 10 → stall.
    do_round([mi,ku,eg,he,pe],
             {mi:4, ku:4, eg:5, he:5, pe:4},
             {mi:(10,0,0), ku:(10,0,0), eg:(12,0,0), he:(12,0,0), pe:(10,0,0)})
    s = players_by_name()
    check_eq("EIA: Egypt at 65 (5 cities + 12 advances at level 60)", s['Egypt']['ast_level'], 65)
    check_eq("EIA: Hellas at 65", s['Hellas']['ast_level'], 65)
    # Minoa is already at 65 (advanced through LBA), now stalls at 65 (4 cities < 5 needed, 10VP < 38VP)
    check_eq("EIA: Minoa stalls at 65 (4 cities < 5 needed for level 65)", s['Minoa']['ast_level'], 65)

    # ── EIA round 2: advance 65→70 ────────────────────────────────────────────
    # Level 65 req: {cities:5, advCount:10, advTier:'cheap', totalVp:38}
    # Egypt gets enough: adv_1vp=38 (38 VP) → passes both advCount and totalVp
    # Hellas gets only 9 cheap → stalls (9 < 10)
    # Others still at 60: need 12 any → give them 12 but they still need level 60 req
    do_round([mi,ku,eg,he,pe],
             {mi:4, ku:4, eg:6, he:6, pe:4},
             {mi:(12,0,0), ku:(12,0,0), eg:(38,0,0), he:(9,0,0), pe:(12,0,0)})
    s = players_by_name()
    check_eq("EIA: Egypt reaches 70 (38 cheap >= 10 and >= 38VP)", s['Egypt']['ast_level'], 70)
    check_eq("EIA: Hellas stalls at 65 (9 cheap < 10 required)", s['Hellas']['ast_level'], 65)
    check_eq("EIA: Minoa at 65 (12 advances satisfied level 60 req → now at 65)", s['Minoa']['ast_level'], 65)

    # LIA bonus: Egypt is at 70, but ≥75 threshold not yet reached → no bonus yet
    s_state = state()
    lia_total = sum(1 for p in s_state['players'] if p['late_iron_age_bonus'])
    check("Expert LIA bonus: 0 granted when leader only at 70", lia_total == 0, f"got {lia_total}")

    # is_final_round should NOT be set yet (nobody at ≥75)
    check("is_final_round=0 before anyone reaches 75", s_state['game']['is_final_round'] == 0)

    # ── EIA round 3: advance 70→75 ────────────────────────────────────────────
    # Level 70 req: {cities:6, advCount:17, advTier:'cheap', totalVp:56}
    # Egypt (at 70): adv_1vp=56 → 56 cheap >= 17 ✓, adv_points=56 ✓, 6 cities ✓ → advance to 75
    # Others still catching up
    do_round([mi,ku,eg,he,pe],
             {mi:5, ku:5, eg:6, he:6, pe:5},
             {mi:(38,0,0), ku:(38,0,0), eg:(56,0,0), he:(38,0,0), pe:(38,0,0)})
    s_state = state()
    eg_lvl = next(p['ast_level'] for p in s_state['players'] if p['id'] == eg)
    check_eq("Egypt reaches 75 (final round triggered)", eg_lvl, 75)
    check("Expert: is_final_round=1 set after someone reaches 75", s_state['game']['is_final_round'] == 1)
    check("Game still active (one more round to play)", s_state['game']['active'] == 1)
    eg_player = next(p for p in s_state['players'] if p['id'] == eg)
    lia_total = sum(1 for p in s_state['players'] if p['late_iron_age_bonus'])
    check("Expert LIA bonus: exactly 1 holder after Egypt reaches 75", lia_total == 1, f"got {lia_total}")
    check("Expert LIA bonus: granted to Egypt (first to ≥75 alone)", eg_player['late_iron_age_bonus'] == 1)

    # ── Final round: autoAdvanceAst runs, then game ends ──────────────────────
    do_round([mi,ku,eg,he,pe],
             {mi:5, ku:5, eg:6, he:6, pe:5},
             {mi:(56,0,0), ku:(56,0,0), eg:(56,0,0), he:(56,0,0), pe:(56,0,0)})
    s_state = state()
    check("Expert game ended after final round", s_state['game']['active'] == 0)
    he_lvl = next(p['ast_level'] for p in s_state['players'] if p['id'] == he)
    # Hellas was at 70 entering the final round (advanced from 65→70 in the previous round).
    # In the final round: level 70 req met (6 cities, 56 cheap >= 17, 56VP >= 56) → advances to 75.
    check_eq("Hellas at 75 after final round (advanced 70→75 using level 70 req)",
             he_lvl, 75)


# ─── SIM 3: 7-player Basic, move order ────────────────────────────────────────
# Tests: census auto-reveal (all submitted), move order (military last, lowest-pop first).

def sim3():
    print("\n═══ SIM 3: 7-player Basic, move order ═══")
    reset()
    ids = start_game(0, [
        {'civ_id': 17, 'name': 'Egypt',   'region': 'west'},
        {'civ_id': 15, 'name': 'Hellas',  'region': 'west'},
        {'civ_id': 11, 'name': 'Rome',    'region': 'west'},
        {'civ_id':  6, 'name': 'Babylon', 'region': 'east'},
        {'civ_id':  9, 'name': 'Hatti',   'region': 'west'},
        {'civ_id': 14, 'name': 'Nubia',   'region': 'east'},
        {'civ_id':  4, 'name': 'Maurya',  'region': 'east'},
    ])
    eg, he, ro, ba, ha, nu, ma = (ids['Egypt'], ids['Hellas'], ids['Rome'],
                                   ids['Babylon'], ids['Hatti'], ids['Nubia'], ids['Maurya'])
    pids = [eg, he, ro, ba, ha, nu, ma]

    # Mark Rome and Nubia as military
    military(ro)
    military(nu)
    s = state()
    check("Rome military=1", next(p['military'] for p in s['players'] if p['id']==ro) == 1)
    check("Nubia military=1", next(p['military'] for p in s['players'] if p['id']==nu) == 1)

    # ── Census move order test ────────────────────────────────────────────────
    # Submit 6 of 7 — verify not yet auto-revealed
    pops = {eg:30, he:20, ro:5, ba:10, ha:40, nu:50, ma:25}
    for pid in [eg, he, ro, ba, ha, nu]:  # 6 players first
        census(pid, pops[pid])
    s = state()
    check("Census not auto-revealed after 6 of 7 submitted", s['game']['census_revealed'] == 0)

    # Submit last player → auto-reveal triggers
    census(ma, pops[ma])
    s = state()
    check("Census auto-revealed when all 7 submitted", s['game']['census_revealed'] == 1)

    # Verify move order: non-military sorted by pop ASC, then military sorted by pop ASC
    # Non-military: Babylon(10) < Hellas(20) < Maurya(25) < Egypt(30) < Hatti(40)
    # Military:     Rome(5) < Nubia(50)
    # Expected order: Babylon, Hellas, Maurya, Egypt, Hatti, Rome, Nubia
    players_data = {p['id']: p for p in s['players']}
    census_pops  = {c['player_id']: c['population'] for c in s['census']}

    # Verify the server's actual rendered census table order (reads from main page HTML).
    # Expected: non-military highest-pop-first, then military highest-pop-first.
    # Populations: Hatti=40, Egypt=30, Maurya=25, Hellas=20, Babylon=10 (non-mil)
    #              Nubia=50, Rome=5 (military)
    rendered_order = selenium_census_order()
    check_eq("Move order in rendered HTML: non-military highest pop first, military last",
             rendered_order,
             ['Hatti', 'Egypt', 'Maurya', 'Hellas', 'Babylon', 'Nubia', 'Rome'])

    # ── Finish round 1 and run fast to game end ───────────────────────────────
    for pid in pids:
        city_count(pid, 0)
    next_round()

    def fast_rnd(cities, v1=0, v3=0, v6=0):
        for pid in pids:
            census(pid, 30)
        reveal()
        for pid in pids:
            city_count(pid, cities)
            adv(pid, v1=v1, v3=v3, v6=v6)
        next_round()

    # Stone Age: rounds 2-4 (advance 5→10→15→20, all free)
    for _ in range(3):
        fast_rnd(0)

    # EBA: rounds 5-7 (20→25→30→35, 2 cities)
    for _ in range(3):
        fast_rnd(2)

    s = players_by_name()
    check_eq("All at 35 after EBA", s['Egypt']['ast_level'], 35)

    # MBA: rounds 8-10 (35→40→45→50, 3 cities + 3 any)
    for _ in range(3):
        fast_rnd(4, v1=3)

    # LBA: rounds 11-13 (50→55→60→65, 3 cities + 3 medium — using adv_6vp)
    for _ in range(3):
        fast_rnd(4, v6=3)

    s = players_by_name()
    check_eq("After MBA+LBA: all at 65", s['Egypt']['ast_level'], 65)

    # EIA: rounds 14-15 (65→70→75, expensive advances)
    fast_rnd(5, v6=3)  # 65→70: {cities:4, advCount:2, expensive}
    s = players_by_name()
    check_eq("All at 70", s['Egypt']['ast_level'], 70)

    # LIA bonus: all 7 hit 70 simultaneously → none gets bonus
    lia_count = sum(1 for p in state()['players'] if p['late_iron_age_bonus'])
    check("LIA bonus: 0 (all hit 70 simultaneously)", lia_count == 0, f"got {lia_count}")

    fast_rnd(6, v6=3)  # 70→75: {cities:5, advCount:3, expensive} → game ends
    s = state()
    check("Basic game ends when players reach 75", s['game']['active'] == 0)


# ─── SIM 4: 16-player Expert, round-16 finish ────────────────────────────────
# Official 16-player scenario (SETUP_RECOMMENDATIONS[16] in civs.ts):
#   West: Egypt(17), Hellas(15), Iberia(13), Rome(11), Hatti(9), Carthage(7), Celt(5), Minoa(1)
#   East: Assyria(3→east override), Kushan(10), Indus(16), Babylon(6), Persia(12), Saba(2), Nubia(14), Parthia(18)
# Military: Rome(i=3), Hatti(i=4), Nubia(i=14). Wonder: Minoa(i=7).
# Slow-start (expert stoneEnd=25): Iberia(i=2), Minoa(i=7), Kushan(i=9), Saba(i=13).
# All 16 empires advance to AST 80 in round 16. LIA bonus: 0 (all hit 70 simultaneously).

def sim4():
    print("\n═══ SIM 4: 16-player Expert, round-16 finish ═══")
    reset()

    civs_setup = [
        {'civ_id': 17, 'name': 'Egypt',    'region': 'west'},   # i=0
        {'civ_id': 15, 'name': 'Hellas',   'region': 'west'},   # i=1
        {'civ_id': 13, 'name': 'Iberia',   'region': 'west'},   # i=2, slow-start
        {'civ_id': 11, 'name': 'Rome',     'region': 'west'},   # i=3, military
        {'civ_id':  9, 'name': 'Hatti',    'region': 'west'},   # i=4, military
        {'civ_id':  7, 'name': 'Carthage', 'region': 'west'},   # i=5
        {'civ_id':  5, 'name': 'Celt',     'region': 'west'},   # i=6
        {'civ_id':  1, 'name': 'Minoa',    'region': 'west'},   # i=7, slow-start + wonder
        {'civ_id':  3, 'name': 'Assyria',  'region': 'east'},   # i=8, east override
        {'civ_id': 10, 'name': 'Kushan',   'region': 'east'},   # i=9, slow-start
        {'civ_id': 16, 'name': 'Indus',    'region': 'east'},   # i=10
        {'civ_id':  6, 'name': 'Babylon',  'region': 'east'},   # i=11
        {'civ_id': 12, 'name': 'Persia',   'region': 'east'},   # i=12
        {'civ_id':  2, 'name': 'Saba',     'region': 'east'},   # i=13, slow-start
        {'civ_id': 14, 'name': 'Nubia',    'region': 'east'},   # i=14, military
        {'civ_id': 18, 'name': 'Parthia',  'region': 'east'},   # i=15
    ]
    ids = start_game(1, civs_setup)
    names = [c['name'] for c in civs_setup]
    pids  = [ids[n] for n in names]

    military(pids[3])   # Rome
    military(pids[4])   # Hatti
    military(pids[14])  # Nubia
    wonder_toggle(pids[7])  # Minoa

    s = state()
    check("Rome military=1",   next(p['military'] for p in s['players'] if p['id']==pids[3])  == 1)
    check("Hatti military=1",  next(p['military'] for p in s['players'] if p['id']==pids[4])  == 1)
    check("Nubia military=1",  next(p['military'] for p in s['players'] if p['id']==pids[14]) == 1)
    check("Minoa wonder=1",    next(p['wonder']   for p in s['players'] if p['id']==pids[7])  == 1)

    WONDER_PID   = pids[7]   # Minoa: +1 effective city (not counted in city VP scoring)
    SLOW_START   = {pids[2], pids[7], pids[9], pids[13]}  # Iberia, Minoa, Kushan, Saba

    def do_rnd(std_cities, v1=0, v3_map=None, city_override=None):
        pops = {pid: 5 + i*3 for i, pid in enumerate(pids)}  # 5..50, within 1-55 limit
        for pid in pids: census(pid, pops[pid])
        reveal()
        cities = city_override if city_override is not None else {
            pid: (std_cities - 1 if pid == WONDER_PID and std_cities > 0 else std_cities)
            for pid in pids
        }
        for i, pid in enumerate(pids):
            city_count(pid, cities[pid])
            v3 = v3_map[pid] if v3_map else 0
            adv(pid, v1=v1, v3=v3)
        return next_round()

    # ── Stone Age rounds 1-4: all null req ───────────────────────────────────
    for _ in range(4): do_rnd(0)
    s = players_by_name()
    check_eq("After 4 rounds: all at 20", s['Minoa']['ast_level'], 20)

    # ── Round 5: 20→25 ───────────────────────────────────────────────────────
    # Slow-start (stoneEnd=25): level 20 < 25 → free; others need 3 cities
    city_r5 = {pid: (0 if pid in SLOW_START else
                     2 if pid == WONDER_PID else 3)
               for pid in pids}
    do_rnd(0, city_override=city_r5)
    s = players_by_name()
    check_eq("Round 5: Iberia at 25 (slow-start free at level 20)", s['Iberia']['ast_level'], 25)
    check_eq("Round 5: Minoa at 25 (slow-start free)", s['Minoa']['ast_level'], 25)
    check_eq("Round 5: Kushan at 25 (slow-start free)", s['Kushan']['ast_level'], 25)
    check_eq("Round 5: Saba at 25 (slow-start free)", s['Saba']['ast_level'], 25)
    check_eq("Round 5: Celt at 25 (3 cities, no late-start in expert)", s['Celt']['ast_level'], 25)

    # ── Rounds 6-7: 25→30→35 (3 cities, no advances) ────────────────────────
    for _ in range(2): do_rnd(3)
    s = players_by_name()
    check_eq("After round 7: all at 35", s['Iberia']['ast_level'], 35)
    check_eq("Minoa at 35 (2 real + 1 wonder = 3 effective)", s['Minoa']['ast_level'], 35)

    # ── Rounds 8-10: 35→40→45→50 (MBA: 3 cities + 5 VP) ────────────────────
    for _ in range(3): do_rnd(3, v1=5)
    s = players_by_name()
    check_eq("After MBA (round 10): all at 50", s['Babylon']['ast_level'], 50)
    check_eq("Minoa at 50 (wonder: 2 real = 3 effective)", s['Minoa']['ast_level'], 50)

    # ── Rounds 11-13: 50→55→60→65 (LBA: 4 cities + 12 any advances) ─────────
    # 17 cheap satisfies "12 any" (17 ≥ 12). Minoa: 3 real + 1 wonder = 4 effective.
    for _ in range(3): do_rnd(4, v1=17)
    s = players_by_name()
    check_eq("After LBA (round 13): all at 65", s['Hellas']['ast_level'], 65)
    check_eq("Minoa at 65 (3 real + 1 wonder = 4 effective LBA)", s['Minoa']['ast_level'], 65)

    # ── Round 14: 65→70 (EIA: 5 cities + 10 cheap + 38 VP total) ────────────
    # 38 cheap: adv_1vp=38 ≥ 10 ✓, adv_points=38 ≥ 38 ✓
    # Minoa: 4 real + 1 wonder = 5 effective ✓
    do_rnd(5, v1=38)
    s = players_by_name()
    check_eq("Round 14: all at 70", s['Hatti']['ast_level'], 70)
    check_eq("Minoa at 70 (4 real + wonder)", s['Minoa']['ast_level'], 70)
    lia_count = sum(1 for p in state()['players'] if p['late_iron_age_bonus'])
    check("LIA bonus: 0 granted (all 16 hit 70 simultaneously)", lia_count == 0, f"got {lia_count}")

    # ── Round 15: 70→75 (LIA: 6 cities + 17 cheap + 56 VP total) ────────────
    # Player i: adv_3vp = 13+2*i → adv_points = 17 + (13+2*i)*3 = 56 + 6*i ≥ 56 ✓
    v3_each = {pid: 13 + 2*i for i, pid in enumerate(pids)}
    city_r15 = {pid: (5 if pid == WONDER_PID else 6) for pid in pids}
    do_rnd(0, v1=17, v3_map=v3_each, city_override=city_r15)
    s = players_by_name()
    check_eq("Round 15: all at 75", s['Indus']['ast_level'], 75)
    check_eq("Minoa at 75 (5 real + wonder = 6 effective)", s['Minoa']['ast_level'], 75)
    sg = state()
    check("is_final_round=1 after all reach 75", sg['game']['is_final_round'] == 1)
    check("Game still active before final round", sg['game']['active'] == 1)

    # ── Round 16 (final): 75→80 (same req as level 70) ───────────────────────
    # City counts vary per player (for city VP scoring); all ≥ 6 effective:
    #   Minoa (i=0): 5 real cities (5+1 wonder=6 effective), city VP = 5
    #   Others (i): 6 + (i % 4)  →  7, 8, 9, 6, 7, 8, 9, 6, 7, 8, 9, 6, 7, 8, (i=15)=9
    # Total VP = 80 + (56+6*i) + city_i — all unique (step ≥ 6 per player, city range ±3).
    city_r16 = {pid: (5 if pid == WONDER_PID else 6 + (i % 4))
                for i, pid in enumerate(pids)}
    do_rnd(0, v1=17, v3_map=v3_each, city_override=city_r16)

    sg = state()
    check("Round 16: game ended",         sg['game']['active'] == 0)
    check("is_final_round cleared",       sg['game']['is_final_round'] == 0)
    check_eq("Ended at round 16",         sg['game']['current_round'], 16)

    s = players_by_name()
    check_eq("All reach AST 80",          s['Minoa']['ast_level'], 80)
    check_eq("Indus (max ADV) at 80",     s['Indus']['ast_level'], 80)
    check_eq("Rome (military) at 80",     s['Rome']['ast_level'], 80)

    # ── Verify final VP components ────────────────────────────────────────────
    census_map = {c['player_id']: c['city_count'] for c in sg['census']}
    totals = []
    for i, pid in enumerate(pids):
        p = next(pl for pl in sg['players'] if pl['id'] == pid)
        exp_adv  = 56 + 6*i
        exp_city = 5 if pid == WONDER_PID else 6 + (i % 4)
        got_city = census_map.get(pid, 0)
        check_eq(f"{names[i]}: ADV VP = {exp_adv}",  p['adv_points'], exp_adv)
        check_eq(f"{names[i]}: city VP = {exp_city}", got_city,        exp_city)
        totals.append(80 + exp_adv + exp_city)

    # All 16 totals must be unique (no ties on leaderboard)
    check("All 16 final scores are unique (no ties)", len(set(totals)) == 16, f"got {sorted(set(totals))}")

    # Wonder city VP: Minoa scored 5 (real cities), not 6 (wonder excluded from scoring)
    check_eq("Minoa city VP = 5 (wonder bonus excluded from scoring)",
             census_map.get(pids[7], -1), 5)

    print("  Final leaderboard preview:")
    ranked = sorted(zip(names, totals), key=lambda x: -x[1])
    for rank, (name, total) in enumerate(ranked, 1):
        print(f"    {rank:2}. {name:<12} {total} VP")


# ─── SIM 5: 16-player Expert, varied AST progress ────────────────────────────
# Same 16-player scenario as SIM 4. Four groups reach different final AST levels:
#   Group A (5 empires → AST 80): Egypt(0), Hellas(1), Hatti(4), Kushan(9), Indus(10)
#   Group B (4 empires → AST 65): Celt(6), Assyria(8), Babylon(11), Persia(12) — stall: 4 cities < 5 for EIA
#   Group C (4 empires → AST 50): Rome(3), Carthage(5), Nubia(14), Parthia(15) — stall: 3 cities < 4 for LBA
#   Group D (3 empires → AST 35): Iberia(2), Minoa(7), Saba(13) — stall: 4 VP < 5 for MBA

def sim5():
    print("\n═══ SIM 5: 16-player Expert, varied AST progress ═══")
    reset()

    civs_setup = [
        {'civ_id': 17, 'name': 'Egypt',    'region': 'west'},   # i=0, GROUP_A
        {'civ_id': 15, 'name': 'Hellas',   'region': 'west'},   # i=1, GROUP_A
        {'civ_id': 13, 'name': 'Iberia',   'region': 'west'},   # i=2, GROUP_D, slow-start
        {'civ_id': 11, 'name': 'Rome',     'region': 'west'},   # i=3, GROUP_C, military
        {'civ_id':  9, 'name': 'Hatti',    'region': 'west'},   # i=4, GROUP_A, military
        {'civ_id':  7, 'name': 'Carthage', 'region': 'west'},   # i=5, GROUP_C
        {'civ_id':  5, 'name': 'Celt',     'region': 'west'},   # i=6, GROUP_B
        {'civ_id':  1, 'name': 'Minoa',    'region': 'west'},   # i=7, GROUP_D, slow-start
        {'civ_id':  3, 'name': 'Assyria',  'region': 'east'},   # i=8, GROUP_B, east override
        {'civ_id': 10, 'name': 'Kushan',   'region': 'east'},   # i=9, GROUP_A, slow-start
        {'civ_id': 16, 'name': 'Indus',    'region': 'east'},   # i=10, GROUP_A
        {'civ_id':  6, 'name': 'Babylon',  'region': 'east'},   # i=11, GROUP_B
        {'civ_id': 12, 'name': 'Persia',   'region': 'east'},   # i=12, GROUP_B
        {'civ_id':  2, 'name': 'Saba',     'region': 'east'},   # i=13, GROUP_D, slow-start
        {'civ_id': 14, 'name': 'Nubia',    'region': 'east'},   # i=14, GROUP_C, military
        {'civ_id': 18, 'name': 'Parthia',  'region': 'east'},   # i=15, GROUP_C
    ]
    ids = start_game(1, civs_setup)
    names = [c['name'] for c in civs_setup]
    pids  = [ids[n] for n in names]

    military(pids[3])   # Rome
    military(pids[4])   # Hatti
    military(pids[14])  # Nubia

    GROUP_A    = {0, 1, 4, 9, 10}   # → AST 80
    GROUP_B    = {6, 8, 11, 12}     # → AST 65
    GROUP_C    = {3, 5, 14, 15}     # → AST 50
    GROUP_D    = {2, 7, 13}         # → AST 35
    SLOW_START = {2, 7, 9, 13}      # expert stoneEnd=25: Iberia, Minoa, Kushan, Saba

    def do_rnd5(cities_fn, adv_fn):
        pops = {pid: 5 + i*3 for i, pid in enumerate(pids)}
        for pid in pids: census(pid, pops[pid])
        reveal()
        for i, pid in enumerate(pids):
            city_count(pid, cities_fn(i))
            v1, v3, v6 = adv_fn(i)
            adv(pid, v1=v1, v3=v3, v6=v6)
        return next_round()

    # ── Stone Age rounds 1-4: all null req ───────────────────────────────────
    for _ in range(4):
        do_rnd5(lambda i: 0, lambda i: (0, 0, 0))
    s = players_by_name()
    check_eq("After 4 rounds: all at 20", s['Egypt']['ast_level'], 20)

    # ── Round 5: 20→25 (slow-start groups free; others 3 cities) ─────────────
    do_rnd5(lambda i: 0 if i in SLOW_START else 3, lambda i: (0, 0, 0))
    s = players_by_name()
    check_eq("Round 5: Iberia at 25 (slow-start free)", s['Iberia']['ast_level'], 25)
    check_eq("Round 5: Kushan at 25 (slow-start free)", s['Kushan']['ast_level'], 25)
    check_eq("Round 5: Egypt at 25 (3 cities)", s['Egypt']['ast_level'], 25)

    # ── Rounds 6-7: 25→30→35 (3 cities) ─────────────────────────────────────
    for _ in range(2):
        do_rnd5(lambda i: 3, lambda i: (0, 0, 0))
    s = players_by_name()
    check_eq("After round 7: all at 35", s['Egypt']['ast_level'], 35)
    check_eq("Iberia at 35", s['Iberia']['ast_level'], 35)

    # ── Rounds 8-10: MBA (35→50), 3 cities + 5 VP in advances ────────────────
    # Group D: only 4 VP → stall at 35; others advance
    for _ in range(3):
        do_rnd5(lambda i: 3, lambda i: (5, 0, 0) if i not in GROUP_D else (4, 0, 0))
    s = players_by_name()
    check_eq("After MBA (round 10): Egypt at 50", s['Egypt']['ast_level'], 50)
    check_eq("After MBA (round 10): Celt at 50", s['Celt']['ast_level'], 50)
    check_eq("MBA stall: Iberia at 35 (4 VP < 5 required)", s['Iberia']['ast_level'], 35)
    check_eq("MBA stall: Minoa at 35 (4 VP < 5 required)", s['Minoa']['ast_level'], 35)
    check_eq("MBA stall: Saba at 35 (4 VP < 5 required)", s['Saba']['ast_level'], 35)

    # ── Rounds 11-13: LBA (50→65), 4 cities + 12 any advances ───────────────
    # Group C: only 3 cities → stall at 50; Group D: still at 35
    for _ in range(3):
        do_rnd5(
            lambda i: 4 if i in GROUP_A | GROUP_B else 3,
            lambda i: (12, 0, 0) if i in GROUP_A | GROUP_B else (4, 0, 0),
        )
    s = players_by_name()
    check_eq("After LBA (round 13): Egypt at 65", s['Egypt']['ast_level'], 65)
    check_eq("After LBA (round 13): Celt at 65", s['Celt']['ast_level'], 65)
    check_eq("LBA stall: Rome at 50 (3 cities < 4 required)", s['Rome']['ast_level'], 50)
    check_eq("LBA stall: Carthage at 50", s['Carthage']['ast_level'], 50)
    check_eq("MBA stall persists: Iberia still at 35", s['Iberia']['ast_level'], 35)

    # ── Round 14: EIA 65→70 (5 cities + 10 cheap + 38 VP) ───────────────────
    # Group B: only 4 cities → stall at 65; Group D: keeps 4 VP → stays stalled at 35
    do_rnd5(
        lambda i: 5 if i in GROUP_A else (4 if i in GROUP_B else 3),
        lambda i: (38, 0, 0) if i in GROUP_A else ((4, 0, 0) if i in GROUP_D else (12, 0, 0)),
    )
    s = players_by_name()
    check_eq("Round 14: Egypt at 70", s['Egypt']['ast_level'], 70)
    check_eq("Round 14: Hatti at 70 (military, Group A)", s['Hatti']['ast_level'], 70)
    check_eq("EIA stall: Celt at 65 (4 cities < 5 required)", s['Celt']['ast_level'], 65)
    check_eq("EIA stall: Babylon at 65", s['Babylon']['ast_level'], 65)
    lia_count = sum(1 for p in state()['players'] if p['late_iron_age_bonus'])
    check("LIA bonus: 0 (all Group A hit 70 simultaneously)", lia_count == 0, f"got {lia_count}")

    # ── Round 15: LIA 70→75 (6 cities + 17 cheap + 56 VP) ───────────────────
    # Group A advances to 75 → triggers is_final_round; Group D: keeps 4 VP → stays at 35
    do_rnd5(
        lambda i: 6 if i in GROUP_A else (4 if i in GROUP_B else 3),
        lambda i: (17, 13, 0) if i in GROUP_A else ((4, 0, 0) if i in GROUP_D else (12, 0, 0)),
    )
    s = players_by_name()
    check_eq("Round 15: Egypt at 75", s['Egypt']['ast_level'], 75)
    check_eq("Round 15: Kushan at 75", s['Kushan']['ast_level'], 75)
    sg = state()
    check("is_final_round=1 after Group A reaches 75", sg['game']['is_final_round'] == 1)
    check("Game still active", sg['game']['active'] == 1)

    # ── Round 16 (final): 75→80 + set final VP values ────────────────────────
    # Group A: 6 cities + 17 cheap + ≥56 VP → advance to 80; game ends
    # Final ADV VP per player (all unique totals when combined with AST + city VP):
    final_adv = {
        0:  (17, 21, 0),  # Egypt:    80VP ADV (17+63)
        1:  (17, 18, 0),  # Hellas:   71VP ADV (17+54)
        2:  ( 4,  0, 0),  # Iberia:    4VP ADV  (stalled at 35)
        3:  (25,  0, 0),  # Rome:     25VP ADV
        4:  (17, 16, 0),  # Hatti:    65VP ADV (17+48)
        5:  (18,  0, 0),  # Carthage: 18VP ADV
        6:  ( 0, 15, 0),  # Celt:     45VP ADV
        7:  ( 3,  0, 0),  # Minoa:     3VP ADV  (stalled at 35)
        8:  ( 0, 12, 0),  # Assyria:  36VP ADV
        9:  (17, 13, 0),  # Kushan:   56VP ADV (17+39)
        10: (17, 24, 0),  # Indus:    89VP ADV (17+72)
        11: ( 0, 10, 0),  # Babylon:  30VP ADV
        12: ( 0, 18, 0),  # Persia:   54VP ADV
        13: ( 2,  0, 0),  # Saba:      2VP ADV  (stalled at 35)
        14: (35,  0, 0),  # Nubia:    35VP ADV
        15: (12,  0, 0),  # Parthia:  12VP ADV
    }
    final_cities = {
        0: 6, 1: 6, 2: 3, 3: 3, 4: 6, 5: 3,
        6: 4, 7: 3, 8: 4, 9: 6, 10: 6, 11: 4,
        12: 4, 13: 3, 14: 3, 15: 3,
    }

    pops = {pid: 5 + i*3 for i, pid in enumerate(pids)}
    for pid in pids: census(pid, pops[pid])
    reveal()
    for i, pid in enumerate(pids):
        city_count(pid, final_cities[i])
        v1, v3, v6 = final_adv[i]
        adv(pid, v1=v1, v3=v3, v6=v6)
    next_round()

    sg = state()
    check("Round 16: game ended",   sg['game']['active'] == 0)
    check("is_final_round cleared", sg['game']['is_final_round'] == 0)
    check_eq("Ended at round 16",   sg['game']['current_round'], 16)

    s = players_by_name()
    check_eq("Group A: Egypt at 80",    s['Egypt']['ast_level'],    80)
    check_eq("Group A: Hellas at 80",   s['Hellas']['ast_level'],   80)
    check_eq("Group A: Hatti at 80",    s['Hatti']['ast_level'],    80)
    check_eq("Group A: Kushan at 80",   s['Kushan']['ast_level'],   80)
    check_eq("Group A: Indus at 80",    s['Indus']['ast_level'],    80)
    check_eq("Group B: Celt at 65",     s['Celt']['ast_level'],     65)
    check_eq("Group B: Assyria at 65",  s['Assyria']['ast_level'],  65)
    check_eq("Group B: Babylon at 65",  s['Babylon']['ast_level'],  65)
    check_eq("Group B: Persia at 65",   s['Persia']['ast_level'],   65)
    check_eq("Group C: Rome at 50",     s['Rome']['ast_level'],     50)
    check_eq("Group C: Carthage at 50", s['Carthage']['ast_level'], 50)
    check_eq("Group C: Nubia at 50",    s['Nubia']['ast_level'],    50)
    check_eq("Group C: Parthia at 50",  s['Parthia']['ast_level'],  50)
    check_eq("Group D: Iberia at 35",   s['Iberia']['ast_level'],   35)
    check_eq("Group D: Minoa at 35",    s['Minoa']['ast_level'],    35)
    check_eq("Group D: Saba at 35",     s['Saba']['ast_level'],     35)

    # ── Verify final VP totals are all unique ─────────────────────────────────
    # Expected: AST 80+ADV 80+city 6=166, ..., AST 35+ADV 2+city 3=40  (all 16 unique)
    census_map = {c['player_id']: c['city_count'] for c in sg['census']}
    exp_adv_pts = {0:80, 1:71, 2:4, 3:25, 4:65, 5:18, 6:45, 7:3, 8:36,
                   9:56, 10:89, 11:30, 12:54, 13:2, 14:35, 15:12}
    totals = []
    for i, pid in enumerate(pids):
        p = next(pl for pl in sg['players'] if pl['id'] == pid)
        check_eq(f"{names[i]}: ADV VP = {exp_adv_pts[i]}", p['adv_points'], exp_adv_pts[i])
        totals.append(p['ast_level'] + p['adv_points'] + (census_map.get(pid, 0)))

    check("All 16 final scores are unique (no ties)", len(set(totals)) == 16, f"got {sorted(set(totals))}")

    print("  Final leaderboard preview:")
    ranked = sorted(zip(names, totals), key=lambda x: -x[1])
    for rank, (name, total) in enumerate(ranked, 1):
        print(f"    {rank:2}. {name:<12} {total} VP")


# ─── SIM 6: admin round button enables via WebSocket after city count submission ──

def selenium_admin_button_state(cookie_value):
    """Return (button_id, is_disabled) for the round action button on the admin page."""
    opts = Options()
    opts.add_argument('--headless')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-cache')
    svc = Service('/usr/bin/chromedriver')
    driver = webdriver.Chrome(service=svc, options=opts)
    try:
        driver.get(BASE + '/admin')
        driver.add_cookie({'name': 'mett_admin', 'value': cookie_value})
        driver.get(BASE + '/admin')
        time.sleep(1.5)  # wait for WS to connect and page to settle
        for btn_id in ('prepare-ast', 'advance-round'):
            btns = driver.find_elements(By.ID, btn_id)
            if btns:
                return btn_id, btns[0].get_attribute('disabled') is not None
        return None, None
    finally:
        driver.quit()


def sim6():
    """Admin round button: disabled before all city counts in, enabled after."""
    print("\nSIM 6: Admin round button WebSocket enable/disable")
    reset()

    ids = start_game(0, [
        {'civ_id': 17, 'name': 'Alice', 'region': 'west'},
        {'civ_id': 11, 'name': 'Bob',   'region': 'west'},
        {'civ_id':  5, 'name': 'Carol', 'region': 'west'},
    ])
    egypt, rome, celt = ids['Egypt'], ids['Rome'], ids['Celt']

    # Submit census so city count fields become available
    census(egypt, 20); census(rome, 15); census(celt, 10)
    reveal()

    btn_id, disabled = selenium_admin_button_state(ADMIN_COOKIE)
    check("Button present", btn_id is not None, f"no round button found")
    check("Button disabled before any city count submitted", disabled is True, f"button was enabled")

    # Submit city count for 2 of 3 — button must stay disabled
    city_count(egypt, 4); city_count(rome, 3)
    time.sleep(0.3)
    _, disabled2 = selenium_admin_button_state(ADMIN_COOKIE)
    check("Button still disabled with 2/3 submitted", disabled2 is True, f"button was enabled early")

    # Submit last city count — button must become enabled via WebSocket
    city_count(celt, 5)
    time.sleep(1.5)  # allow WS broadcast to reach browser
    _, disabled3 = selenium_admin_button_state(ADMIN_COOKIE)
    check("Button enabled after all city counts submitted", disabled3 is False, f"button stayed disabled")

    reset()


# ─── Runner ───────────────────────────────────────────────────────────────────

def run_sim(fn):
    try:
        fn()
    except Exception as e:
        SIM_ERRS.append((fn.__name__, traceback.format_exc()))
        print(f"  CRASHED: {e}")


if __name__ == '__main__':
    print("me[tt] Simulation Suite")
    print("=" * 50)
    try:
        requests.get(f"{BASE}/api/state", timeout=2)
    except Exception:
        print("ERROR: Server not running on localhost:3000")
        sys.exit(1)

    run_sim(sim1)
    run_sim(sim2)
    run_sim(sim3)
    run_sim(sim4)
    run_sim(sim5)
    run_sim(sim6)

    print(f"\n{'=' * 50}")
    print(f"Results: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    if SIM_ERRS:
        print(f"\nCrashes:")
        for name, tb in SIM_ERRS:
            print(f"\n{name}:\n{tb}")
    sys.exit(0 if FAIL_COUNT == 0 and not SIM_ERRS else 1)
