/* Materials / Quote controller — builds the calculator UI and keeps totals live. */
(function (global) {
  const $ = (id) => document.getElementById(id);

  // Live quantity/price state keyed by material id
  const state = {}; // id -> { qty, price }

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

  function updateEstimated() {
    const concrete = Calc.concreteCuYd($('c_length').value, $('c_width').value, $('c_depth').value);
    const footing = Calc.footingCuYd($('f_length').value, $('f_width').value, $('f_depth').value);
    const area = Calc.areaSqFt($('c_length').value, $('c_width').value);
    const rebar = Calc.rebarEstimate(area, $('rebarSpacing').value);

    setEst('concreto_3000', concrete);
    setEst('footing', footing);
    setEst('varilla_3', rebar);
    setEst('varilla_4', rebar);
    setEst('varilla_5', rebar);
    setEst('varilla_fundacion', rebar);

    $('c_result').textContent = Calc.fmtNum(concrete);
    $('f_result').textContent = Calc.fmtNum(footing);

    // auto-fill area unless user typed a custom one
    const areaInput = $('area_sqft');
    if (!areaInput.dataset.touched) areaInput.value = area ? Calc.round2(area) : '';
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
    return {
      concrete: { length: $('c_length').value, width: $('c_width').value, depth: $('c_depth').value,
                  cuyd: Calc.round2(Calc.concreteCuYd($('c_length').value, $('c_width').value, $('c_depth').value)) },
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
    ['c_length','c_width','c_depth','f_length','f_width','f_depth','area_sqft'].forEach((id) => { $(id).value = ''; });
    $('area_sqft').dataset.touched = '';
    Object.keys(state).forEach((id) => { state[id].qty = 0; });
    renderMaterials();
    recompute();
  }

  function init() {
    initState();
    renderEstimated();
    renderMaterials();

    ['c_length','c_width','c_depth','f_length','f_width','f_depth','price_sqft','rebarSpacing']
      .forEach((id) => $(id).addEventListener('input', recompute));
    $('area_sqft').addEventListener('input', (e) => { e.target.dataset.touched = '1'; recompute(); });
    $('resetQuoteBtn').addEventListener('click', reset);

    // re-render labels on language change
    document.addEventListener('i18n:changed', () => {
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

  global.Quote = { init, getState, reset, recompute };
})(window);
