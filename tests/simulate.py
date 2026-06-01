#!/usr/bin/env python3
"""
me[tt] end-to-end game simulations via API.

Usage:
  python3 tests/simulate.py
  METT_ADMIN_PASSWORD=mypass python3 tests/simulate.py
"""

import os
import re
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

ADMIN_COOKIE = os.environ.get('METT_ADMIN_PASSWORD', 'PASSWORD')
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


def selenium_wonder_trade_chip(civ_name):
    """Return True if the wonder X chip appears in the trade cards row for the given civ_name."""
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
        rows = driver.find_elements(By.CSS_SELECTOR, '.trade-table tbody tr')
        for row in rows:
            cells = row.find_elements(By.CSS_SELECTOR, '.empire-cell')
            if not cells:
                continue
            name = driver.execute_script(
                "return Array.from(arguments[0].childNodes)"
                ".filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()",
                cells[0],
            )
            if name == civ_name:
                wonder_chips = row.find_elements(By.CSS_SELECTOR, '.trade-chip-wonder')
                return len(wonder_chips) > 0
        return False
    finally:
        driver.quit()


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

    print(f"\n{'=' * 50}")
    print(f"Results: {PASS_COUNT} passed, {FAIL_COUNT} failed")
    if SIM_ERRS:
        print(f"\nCrashes:")
        for name, tb in SIM_ERRS:
            print(f"\n{name}:\n{tb}")
    sys.exit(0 if FAIL_COUNT == 0 and not SIM_ERRS else 1)
