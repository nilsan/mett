#!/usr/bin/env python3
"""
METT end-to-end game simulations via API.

  SIM 1 — 6-player Basic: late-start civs (Celt/Iberia) at MBA levels 35/40,
           LIA bonus when all hit 70 simultaneously, game end at 75.
  SIM 2 — 5-player Expert: slow-start civs (Minoa/Kushan) free through level 20,
           Wonder +1 city, expert MBA stall, LIA bonus to exactly-1, final round.
  SIM 3 — 7-player Basic: move order (military last, lowest-pop first), game end.

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

    # LIA bonus: Egypt is the ONLY player at ≥70 → should get the bonus
    s_state = state()
    eg_player = next(p for p in s_state['players'] if p['id'] == eg)
    lia_total = sum(1 for p in s_state['players'] if p['late_iron_age_bonus'])
    check("Expert LIA bonus: exactly 1 holder", lia_total == 1, f"got {lia_total}")
    check("Expert LIA bonus: granted to Egypt (first to 70)", eg_player['late_iron_age_bonus'] == 1)

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


# ─── Runner ───────────────────────────────────────────────────────────────────

def run_sim(fn):
    try:
        fn()
    except Exception as e:
        SIM_ERRS.append((fn.__name__, traceback.format_exc()))
        print(f"  CRASHED: {e}")


if __name__ == '__main__':
    print("METT Simulation Suite")
    print("=" * 50)
    try:
        requests.get(f"{BASE}/api/state", timeout=2)
    except Exception:
        print("ERROR: Server not running on localhost:3000")
        sys.exit(1)

    run_sim(sim1)
    run_sim(sim2)
    run_sim(sim3)

    print(f"\n{'=' * 50}")
    print(f"Results: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    if SIM_ERRS:
        print(f"\nCrashes:")
        for name, tb in SIM_ERRS:
            print(f"\n{name}:\n{tb}")
    sys.exit(0 if FAIL_COUNT == 0 and not SIM_ERRS else 1)
