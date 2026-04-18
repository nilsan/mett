/**
 * Individual empire page.
 * Handles census submission and empire advance points update.
 * Also reloads on state changes that affect this player.
 */
(function () {
  const playerId = window.PLAYER_ID;
  const gameActive = window.GAME_ACTIVE;

  // ── Census submission (active game only) ───────────────────────────────────
  const submitBtn = document.getElementById('submit-census');
  const popInput = document.getElementById('pop-input');

  if (gameActive && submitBtn && popInput) {
    submitBtn.addEventListener('click', async () => {
      let value = parseInt(popInput.value, 10);
      if (isNaN(value)) { popInput.focus(); return; }
      // Negative shorthand: -27 means 55 - 27 = 28 tokens remaining from max
      if (value < 0) value = 55 + value;
      if (value < 1 || value > 55) { popInput.focus(); return; }
      popInput.value = value; // show resolved value before submit
      submitBtn.disabled = true;
      try {
        const res = await fetch(`/api/players/${playerId}/census`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ population: value }),
        });
        if (res.ok) location.reload();
      } finally {
        submitBtn.disabled = false;
      }
    });

    popInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBtn.click();
    });
  }

  // ── City count ────────────────────────────────────────────────────────────
  const cityInput = document.getElementById('city-input');
  if (cityInput && cityInput.dataset.serverValue !== '') cityInput.value = cityInput.dataset.serverValue;
  const cityBtn = document.getElementById('submit-city');

  document.getElementById('city-dec')?.addEventListener('click', () => {
    const cur = parseInt(cityInput.value, 10);
    const next = isNaN(cur) ? 0 : cur - 1;
    if (next < 0) return;
    cityInput.value = next;
  });
  document.getElementById('city-inc')?.addEventListener('click', () => {
    const cur = parseInt(cityInput.value, 10);
    const next = isNaN(cur) ? 0 : cur + 1;
    if (next > 9) return;
    cityInput.value = next;
  });

  if (cityBtn && cityInput) {
    cityBtn.addEventListener('click', async () => {
      const value = parseInt(cityInput.value, 10);
      if (isNaN(value) || value < 0 || value > 9) return;
      cityBtn.disabled = true;
      try {
        const res = await fetch(`/api/players/${playerId}/city-count`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city_count: value }),
        });
        if (res.ok) location.reload();
      } finally {
        cityBtn.disabled = false;
      }
    });
  }

  // ── ADV card inputs ────────────────────────────────────────────────────────
  const adv1 = document.getElementById('adv-1vp');
  const adv3 = document.getElementById('adv-3vp');
  const adv6 = document.getElementById('adv-6vp');
  const advTotal = document.getElementById('adv-total');
  const advBtn = document.getElementById('submit-adv');

  function calcAdvTotal() {
    const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
    const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
    const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
    return v1 * 1 + v3 * 3 + v6 * 6;
  }

  function refreshAdvTotal() {
    if (advTotal) advTotal.textContent = String(calcAdvTotal());
  }

  [adv1, adv3, adv6].forEach(inp => {
    if (inp) inp.addEventListener('input', refreshAdvTotal);
  });

  // +/- buttons for card counts
  document.querySelectorAll('.adv-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      if (!inp) return;
      const dir = parseInt(btn.dataset.dir, 10);
      const cur = parseInt(inp.value, 10) || 0;
      inp.value = Math.max(0, cur + dir);
      refreshAdvTotal();
    });
  });

  if (advBtn) {
    advBtn.addEventListener('click', async () => {
      const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
      const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
      const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
      advBtn.disabled = true;
      try {
        await fetch(`/api/players/${playerId}/adv`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adv_1vp: v1, adv_3vp: v3, adv_6vp: v6 }),
        });
      } finally {
        advBtn.disabled = false;
      }
    });
  }

  // ── Military toggle (active game only) ────────────────────────────────────
  const milBtn = document.getElementById('mil-toggle');
  if (gameActive && milBtn) {
    milBtn.addEventListener('click', async () => {
      milBtn.disabled = true;
      await fetch(`/api/players/${playerId}/military`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      location.reload();
    });
  }

  // ── Live reload on relevant state changes ──────────────────────────────────
  let reloadTimer = null;
  window.addEventListener('mett:state', () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => location.reload(), 500);
  });
})();
