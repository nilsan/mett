/**
 * Individual empire page.
 * Handles census submission and empire advance points update.
 * Re-initialises after each HTMX swap of #civ-content.
 */
(function () {
  function init() {
    const civEl = document.getElementById('civ-content');
    const playerId = civEl ? Number(civEl.dataset.playerId) : window.PLAYER_ID;

    // ── Census submission ─────────────────────────────────────────────────────
    const submitBtn = document.getElementById('submit-census');
    const popInput = document.getElementById('pop-input');

    if (submitBtn && popInput) {
      submitBtn.addEventListener('click', async () => {
        let value = parseInt(popInput.value, 10);
        if (isNaN(value)) { popInput.focus(); return; }
        // Negative shorthand: -27 means 55 - 27 = 28 tokens remaining from max
        if (value < 0) value = 55 + value;
        if (value < 1 || value > 55) { popInput.focus(); return; }
        popInput.value = value;
        submitBtn.disabled = true;
        await mettPost(`/api/players/${playerId}/census`, { population: value });
        submitBtn.disabled = false;
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
        await mettPost(`/api/players/${playerId}/city-count`, { city_count: value });
        cityBtn.disabled = false;
      });
    }

    // ── ADV card inputs — auto-submit, no Update button ───────────────────────
    const adv1 = document.getElementById('adv-1vp');
    const adv3 = document.getElementById('adv-3vp');
    const adv6 = document.getElementById('adv-6vp');
    const advTotal = document.getElementById('adv-total');

    function calcAdvTotal() {
      const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
      const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
      const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
      return v1 * 1 + v3 * 3 + v6 * 6;
    }

    function refreshAdvTotal() {
      if (advTotal) advTotal.textContent = String(calcAdvTotal());
    }

    async function submitAdv() {
      const v1 = Math.max(0, parseInt(adv1?.value ?? '0', 10) || 0);
      const v3 = Math.max(0, parseInt(adv3?.value ?? '0', 10) || 0);
      const v6 = Math.max(0, parseInt(adv6?.value ?? '0', 10) || 0);
      await mettPost(`/api/players/${playerId}/adv`, { adv_1vp: v1, adv_3vp: v3, adv_6vp: v6 });
    }

    // Typing: debounce so we don't hammer the API on multi-digit input.
    let advTypingTimer;
    function submitAdvDebounced() {
      clearTimeout(advTypingTimer);
      advTypingTimer = setTimeout(submitAdv, 400);
    }

    [adv1, adv3, adv6].forEach(inp => {
      if (!inp) return;
      inp.addEventListener('input', () => { refreshAdvTotal(); submitAdvDebounced(); });
      // Submit immediately on blur so a pending debounce doesn't get lost to an HTMX swap.
      inp.addEventListener('blur', () => { clearTimeout(advTypingTimer); submitAdv(); });
    });

    document.querySelectorAll('.adv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        if (!inp) return;
        const dir = parseInt(btn.dataset.dir, 10);
        const cur = parseInt(inp.value, 10) || 0;
        inp.value = Math.max(0, cur + dir);
        refreshAdvTotal();
        clearTimeout(advTypingTimer);
        submitAdv();
      });
    });

    // ── Military / Wonder toggles ─────────────────────────────────────────────
    const milBtn = document.getElementById('mil-toggle');
    if (milBtn) {
      milBtn.addEventListener('click', async () => {
        milBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/military`);
        if (!res.ok) milBtn.disabled = false;
      });
    }

    const wonBtn = document.getElementById('won-toggle');
    if (wonBtn) {
      wonBtn.addEventListener('click', async () => {
        wonBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/wonder`);
        if (!res.ok) wonBtn.disabled = false;
      });
    }
  }

  init();

  // Re-bind event listeners after each HTMX swap of #civ-content
  document.body.addEventListener('htmx:afterSwap', (e) => {
    if (e.detail?.target?.id === 'civ-content' || document.getElementById('civ-content')) {
      init();
    }
  });
})();
