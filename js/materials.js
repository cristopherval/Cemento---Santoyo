/* Materials / Quote controller — builds the calculator UI and keeps totals live. */
(function (global) {
  const $ = (id) => document.getElementById(id);

  // Live quantity/price state keyed by material id
  const state = {}; // id -> { qty, price }
  let currentQuoteId = null; // id of the quote being edited (null = new)
  // Extra concrete sectors (sector 1 lives in the static #mainSector fields).
  // A job can be split across several slabs; areas and cubic yards are summed.
  let sectors = []; // [{ id, length, width, depth }]

  function initState() {
    AppData.MATERIAL_GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        if (!state[it.id]) state[it.id] = { qty: 0, price: it.price };
      });
    });
  }

  /* ---------- Render materials ---------- */
  function renderMaterials() {
    const wrap = $('materialsGroups');
    wrap.innerHTML = '';
    AppData.MATERIAL_GROUPS.forEach((g) => {
      const section = document.createElement('div');
      section.className = 'mgroup';
      section.innerHTML = `<div class="mgroup__head">${I18n.group(g.id)}</div>
        <div class="mgroup__cols">
          <span class="mcol mcol--name"></span>
          <span class="mcol">${I18n.t('qty')}</span>
          <span class="mcol">${I18n.t('unit_price')}</span>
          <span class="mcol mcol--total">${I18n.t('line_total')}</span>
        </div>`;
      g.items.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'mrow';
        row.innerHTML = `
          <span class="mrow__name" data-name="${it.id}">${I18n.material(it.id)}</span>
          <input class="mrow__qty" type="number" inputmode="decimal" min="0" step="0.01"
                 data-id="${it.id}" data-kind="qty" value="${state[it.id].qty || ''}" placeholder="0" />
          <input class="mrow__price" type="number" inputmode="decimal" min="0" step="0.01"
                 data-id="${it.id}" data-kind="price" value="${state[it.id].price}" />
          <span class="mrow__total" data-total="${it.id}">$0.00</span>`;
        section.appendChild(row);
      });
      wrap.appendChild(section);
    });
    wrap.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('input', onMaterialInput);
    });
  }

  function onMaterialInput(e) {
    const { id, kind } = e.target.dataset;
    state[id][kind] = Calc.num(e.target.value);
    recompute();
  }

  /* ---------- Estimated values ---------- */
  function renderEstimated() {
    const tbody = $('estimatedTable').querySelector('tbody');
    const rows = [
      { key: 'concreto_3000', val: 0 },
      { key: 'footing', val: 0 },
      { key: 'varilla_3', val: 0 },
      { key: 'varilla_4', val: 0 },
      { key: 'varilla_5', val: 0 },
      { key: 'varilla_fundacion', val: 0 }
    ];
    tbody.innerHTML = rows.map((r) =>
      `<tr><td data-est-name="${r.key}">${I18n.material(r.key)}</td>
           <td class="est-val" data-est="${r.key}">0.00</td></tr>`
    ).join('');
  }

  function isAreaOnly() { const cb = $('areaOnly'); return !!(cb && cb.checked); }
  // show/hide the Length & Width fields based on the "only area" checkbox.
  // Only sector 1 has the checkbox; extra sectors always ask for Length × Width.
  function applyAreaOnly() {
    const view = $('view-calc');
    if (view) view.classList.toggle('is-area-only', isAreaOnly());
  }

  /* ---------- Sectors (extra slabs) ---------- */
  // Area & cubic yards of every sector, plus the totals that drive the whole quote.
  function sectorTotals() {
    const on = isAreaOnly();
    const mainArea = on ? Calc.num($('c_area').value)
                        : Calc.areaSqFt($('c_length').value, $('c_width').value);
    const mainCuyd = on
      ? Calc.concreteCuYdFromArea(mainArea, $('c_depth').value)
      : Calc.concreteCuYd($('c_length').value, $('c_width').value, $('c_depth').value);
    const extras = sectors.map((s) => ({
      id: s.id,
      area: Calc.areaSqFt(s.length, s.width),
      cuyd: Calc.concreteCuYd(s.length, s.width, s.depth)
    }));
    return {
      mainArea, mainCuyd, extras,
      area: extras.reduce((t, e) => t + e.area, mainArea),
      cuyd: extras.reduce((t, e) => t + e.cuyd, mainCuyd)
    };
  }

  // Rebuilt only when a sector is added / removed / loaded — never while typing,
  // so the focused input keeps its caret. Live values go through updateEstimated().
  function renderSectors() {
    const wrap = $('extraSectors');
    if (!wrap) return;
    wrap.innerHTML = sectors.map((s, i) => `
      <div class="sector sector--extra" data-sid="${s.id}">
        <div class="sector__head">
          <span class="sector__label">${I18n.t('sector')} ${i + 2}</span>
          <strong class="sector__cuyd" data-cuyd>0.00</strong>
          <button type="button" class="sector__del" data-del
                  aria-label="${I18n.t('remove_sector')}" title="${I18n.t('remove_sector')}">✕</button>
        </div>
        <div class="grid3">
          <label class="field">
            <span>${I18n.t('length_ft')}</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"
                   data-k="length" value="${s.length}" />
          </label>
          <label class="field">
            <span>${I18n.t('width_ft')}</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"
                   data-k="width" value="${s.width}" />
          </label>
          <label class="field">
            <span>${I18n.t('depth_in')}</span>
            <input type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"
                   data-k="depth" value="${s.depth}" />
          </label>
        </div>
      </div>`).join('');
  }

  function addSector() {
    sectors.push({ id: 's_' + makeId(), length: '', width: '', depth: '' });
    renderSectors();
    recompute();
    const last = $('extraSectors').lastElementChild;
    if (last) last.querySelector('input').focus();
  }

  function updateEstimated() {
    const areaInput = $('area_sqft');
    const sec = sectorTotals();

    // per-sector cubic yards
    $('c_cuyd').textContent = Calc.fmtNum(sec.mainCuyd);
    sec.extras.forEach((e) => {
      const el = document.querySelector(`[data-sid="${e.id}"] [data-cuyd]`);
      if (el) el.textContent = Calc.fmtNum(e.cuyd);
    });

    // the Sq.Ft. price is charged on the summed area — unless it was typed by hand
    if (!areaInput.dataset.touched) areaInput.value = sec.area ? Calc.round2(sec.area) : '';

    const area = Calc.num(areaInput.value);
    const footing = Calc.footingCuYd($('f_length').value, $('f_width').value, $('f_depth').value);
    const rebar = Calc.rebarEstimate(area, $('rebarSpacing').value);

    setEst('concreto_3000', sec.cuyd);
    setEst('footing', footing);
    setEst('varilla_3', rebar);
    setEst('varilla_4', rebar);
    setEst('varilla_5', rebar);
    setEst('varilla_fundacion', rebar);

    $('c_result').textContent = Calc.fmtNum(sec.cuyd);
    $('f_result').textContent = Calc.fmtNum(footing);
  }

  function setEst(key, val) {
    const el = document.querySelector(`[data-est="${key}"]`);
    if (el) el.textContent = Calc.fmtNum(val);
  }

  /* ---------- Totals ---------- */
  function recompute() {
    updateEstimated();

    const area = Calc.num($('area_sqft').value);
    const pricePerSqft = Calc.num($('price_sqft').value);
    const sqftTotal = Calc.sqftPrice(area, pricePerSqft);

    let materialsTotal = 0;
    AppData.MATERIAL_GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        const lt = Calc.lineTotal(state[it.id].qty, state[it.id].price);
        materialsTotal += lt;
        const cell = document.querySelector(`[data-total="${it.id}"]`);
        if (cell) cell.textContent = Calc.fmtMoney(lt);
      });
    });

    const profit = sqftTotal - materialsTotal;

    $('sqft_total').textContent = Calc.fmtMoney(sqftTotal);
    $('t_sqft').textContent = Calc.fmtMoney(sqftTotal);
    $('t_materials').textContent = Calc.fmtMoney(materialsTotal);
    $('t_profit').textContent = Calc.fmtMoney(profit);
    $('t_profit').classList.toggle('is-negative', profit < 0);
  }

  /* ---------- Public state for invoice/history ---------- */
  function getState() {
    const materials = [];
    AppData.MATERIAL_GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        if (state[it.id].qty > 0) {
          materials.push({
            id: it.id, group: g.id,
            qty: state[it.id].qty, price: state[it.id].price,
            total: Calc.round2(Calc.lineTotal(state[it.id].qty, state[it.id].price))
          });
        }
      });
    });
    const area = Calc.num($('area_sqft').value);
    const pricePerSqft = Calc.num($('price_sqft').value);
    const sqftTotal = Calc.sqftPrice(area, pricePerSqft);
    const materialsTotal = materials.reduce((s, m) => s + m.total, 0);
    const areaOnly = isAreaOnly();
    const sec = sectorTotals();
    return {
      areaOnly,
      // `concrete` is sector 1; `sectors` holds the extra ones. concreteCuyd is the sum.
      concrete: { length: $('c_length').value, width: $('c_width').value, depth: $('c_depth').value,
                  area: Calc.round2(sec.mainArea), cuyd: Calc.round2(sec.mainCuyd) },
      sectors: sectors.map((s, i) => ({
        length: s.length, width: s.width, depth: s.depth,
        area: Calc.round2(sec.extras[i].area), cuyd: Calc.round2(sec.extras[i].cuyd)
      })),
      concreteCuyd: Calc.round2(sec.cuyd),
      footing: { length: $('f_length').value, width: $('f_width').value, depth: $('f_depth').value,
                 cuyd: Calc.round2(Calc.footingCuYd($('f_length').value, $('f_width').value, $('f_depth').value)) },
      area, pricePerSqft,
      sqftTotal: Calc.round2(sqftTotal),
      materials,
      materialsTotal: Calc.round2(materialsTotal),
      profit: Calc.round2(sqftTotal - materialsTotal)
    };
  }

  function reset() {
    ['c_length','c_width','c_depth','c_area','f_length','f_width','f_depth','area_sqft',
     'q_title','q_name','q_phone','q_address','q_email'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
    $('area_sqft').dataset.touched = '';
    const cb = $('areaOnly'); if (cb) cb.checked = false;
    applyAreaOnly();
    sectors = [];
    renderSectors();
    Object.keys(state).forEach((id) => { state[id].qty = 0; });
    currentQuoteId = null;
    renderMaterials();
    recompute();
  }

  /* ---------- Quote persistence (Cotizaciones) ---------- */
  function saveQuote() {
    const calc = getState();
    if (!calc.area && !calc.materialsTotal && !calc.sqftTotal) {
      App.toast(I18n.t('need_calc'));
      return null;
    }
    const existing = currentQuoteId ? Storage.getQuote(currentQuoteId) : null;
    const rec = {
      id: currentQuoteId || 'q_' + makeId(),
      title: $('q_title').value,
      date: existing ? existing.date : todayISO(),
      customer: {
        name: $('q_name').value, phone: $('q_phone').value,
        address: $('q_address').value, email: $('q_email').value
      },
      calc,
      status: existing ? existing.status : 'pendiente',
      invoiceId: existing ? existing.invoiceId : null,
      jobId: existing ? existing.jobId : null,
      savedAt: todayISO()
    };
    Storage.saveQuote(rec);
    currentQuoteId = rec.id;
    if (global.Quotes) Quotes.renderList();
    if (global.Finance) Finance.render();
    App.toast(I18n.t('quote_saved'));
    App.showView('view-quotes');
    return rec;
  }

  // Reload a saved quote back into the calculator for editing.
  function loadQuote(rec) {
    currentQuoteId = rec.id;
    const c = rec.calc || {};
    const con = c.concrete || {}, foo = c.footing || {};
    $('c_length').value = con.length || '';
    $('c_width').value = con.width || '';
    $('c_depth').value = con.depth || '';
    $('f_length').value = foo.length || '';
    $('f_width').value = foo.width || '';
    $('f_depth').value = foo.depth || '';
    // sector-1 area: new quotes keep it in `concrete.area`; older "only area"
    // quotes had no sectors, so the top-level `area` *was* the sector-1 area.
    $('c_area').value = c.areaOnly ? (con.area != null ? con.area : (c.area != null ? c.area : '')) : '';
    if (c.pricePerSqft != null) $('price_sqft').value = c.pricePerSqft;
    const cb = $('areaOnly'); if (cb) cb.checked = !!c.areaOnly;
    applyAreaOnly();

    sectors = (c.sectors || []).map((s) => ({
      id: 's_' + makeId(), length: s.length || '', width: s.width || '', depth: s.depth || ''
    }));
    renderSectors();

    Object.keys(state).forEach((id) => { state[id].qty = 0; });
    (c.materials || []).forEach((m) => {
      if (!state[m.id]) state[m.id] = { qty: 0, price: m.price };
      state[m.id].qty = Calc.num(m.qty);
      state[m.id].price = Calc.num(m.price);
    });

    const cust = rec.customer || {};
    $('q_title').value = rec.title || '';
    $('q_name').value = cust.name || '';
    $('q_phone').value = cust.phone || '';
    $('q_address').value = cust.address || '';
    $('q_email').value = cust.email || '';

    renderMaterials();
    // Let the area re-derive from the sectors. If the saved area doesn't match that
    // sum, the user had typed it by hand back then — restore the override.
    $('area_sqft').dataset.touched = '';
    recompute();
    if (c.area != null && Math.abs(Calc.num($('area_sqft').value) - Calc.num(c.area)) > 0.01) {
      $('area_sqft').value = c.area;
      $('area_sqft').dataset.touched = '1';
      recompute();
    }
    App.showView('view-calc');
    window.scrollTo({ top: 0 });
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function init() {
    initState();
    renderEstimated();
    renderMaterials();

    ['c_length','c_width','c_depth','c_area','f_length','f_width','f_depth','price_sqft','rebarSpacing']
      .forEach((id) => $(id).addEventListener('input', recompute));
    $('area_sqft').addEventListener('input', (e) => { e.target.dataset.touched = '1'; recompute(); });
    $('areaOnly').addEventListener('change', () => {
      applyAreaOnly();
      $('area_sqft').dataset.touched = '';   // resume auto-summing in the new mode
      recompute();
    });

    // extra sectors: delegated so rows can come and go without rebinding
    $('addSectorBtn').addEventListener('click', addSector);
    $('extraSectors').addEventListener('input', (e) => {
      const row = e.target.closest('[data-sid]');
      const sec = row && sectors.find((s) => s.id === row.dataset.sid);
      if (!sec) return;
      sec[e.target.dataset.k] = e.target.value;
      recompute();
    });
    $('extraSectors').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (!btn) return;
      sectors = sectors.filter((s) => s.id !== btn.closest('[data-sid]').dataset.sid);
      renderSectors();
      recompute();
    });

    $('resetQuoteBtn').addEventListener('click', reset);
    $('saveQuoteBtn').addEventListener('click', saveQuote);

    // re-render labels on language change
    document.addEventListener('i18n:changed', () => {
      renderSectors();
      recompute();
      document.querySelectorAll('[data-name]').forEach((el) => { el.textContent = I18n.material(el.dataset.name); });
      document.querySelectorAll('[data-est-name]').forEach((el) => { el.textContent = I18n.material(el.dataset.estName); });
      document.querySelectorAll('.mgroup__head').forEach((el, i) => {
        el.textContent = I18n.group(AppData.MATERIAL_GROUPS[i].id);
      });
      document.querySelectorAll('.mgroup__cols').forEach((row) => {
        const cols = row.querySelectorAll('.mcol');
        if (cols[1]) cols[1].textContent = I18n.t('qty');
        if (cols[2]) cols[2].textContent = I18n.t('unit_price');
        if (cols[3]) cols[3].textContent = I18n.t('line_total');
      });
    });

    recompute();
  }

  global.Quote = { init, getState, reset, recompute, saveQuote, loadQuote,
                   getCurrentId: () => currentQuoteId };
})(window);
