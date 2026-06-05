/* Accounting — clean profit per job.
   Income (received) − Costs (materials imported from the calc + manual extras) = Net profit. */
(function (global) {
  const $ = (id) => document.getElementById(id);
  let income = [];   // [{concept, amount}]
  let costs = [];    // [{concept, amount}]
  let currentId = null;

  /* ---------- Render the two editable lists ---------- */
  function renderList(list, listName, wrapId) {
    const wrap = $(wrapId);
    wrap.innerHTML = '';
    list.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'lineitem';
      row.innerHTML = `
        <input class="lineitem__desc" type="text" placeholder="${I18n.t('concept')}"
               data-list="${listName}" data-i="${i}" data-k="concept" value="${escapeAttr(it.concept)}" />
        <input class="lineitem__amt" type="number" inputmode="decimal" min="0" step="0.01"
               placeholder="0.00" data-list="${listName}" data-i="${i}" data-k="amount" value="${it.amount || ''}" />
        <button class="lineitem__del" data-list="${listName}" data-del="${i}" aria-label="x">✕</button>`;
      wrap.appendChild(row);
    });
    wrap.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', onInput));
    wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      (b.dataset.list === 'income' ? income : costs).splice(+b.dataset.del, 1);
      renderAll();
    }));
  }

  function onInput(e) {
    const { list, i, k } = e.target.dataset;
    const arr = list === 'income' ? income : costs;
    arr[+i][k] = k === 'amount' ? Calc.num(e.target.value) : e.target.value;
    recompute();
  }

  function renderAll() {
    renderList(income, 'income', 'incomeList');
    renderList(costs, 'costs', 'costsList');
    recompute();
  }

  /* ---------- Totals ---------- */
  function recompute() {
    const totalIncome = income.reduce((s, it) => s + Calc.num(it.amount), 0);
    const totalCosts = costs.reduce((s, it) => s + Calc.num(it.amount), 0);
    const net = totalIncome - totalCosts;
    $('acc_income').textContent = Calc.fmtMoney(totalIncome);
    $('acc_costs').textContent = Calc.fmtMoney(totalCosts);
    $('acc_net').textContent = Calc.fmtMoney(net);
    $('acc_net').classList.toggle('is-negative', net < 0);
    return { totalIncome, totalCosts, net };
  }

  /* ---------- Actions ---------- */
  function addIncome(concept, amount) { income.push({ concept: concept || '', amount: amount || 0 }); renderAll(); }
  function addCost(concept, amount) { costs.push({ concept: concept || '', amount: amount || 0 }); renderAll(); }

  function importFromCalc() {
    const q = Quote.getState();
    if (q.materialsTotal > 0) {
      addCost(I18n.t('materials_calc'), Calc.round2(q.materialsTotal));
      App.toast(I18n.t('imported'));
    } else {
      App.toast(I18n.t('calc_empty'));
    }
  }

  function newJob() {
    currentId = null;
    income = [{ concept: '', amount: 0 }];
    costs = [];
    $('job_title').value = '';
    $('job_date').value = todayISO();
    renderAll();
  }

  function buildRecord() {
    const t = recompute();
    return {
      id: currentId || 'job_' + makeId(),
      title: $('job_title').value,
      date: $('job_date').value || todayISO(),
      income: income.filter((it) => it.concept || it.amount),
      costs: costs.filter((it) => it.concept || it.amount),
      totalIncome: Calc.round2(t.totalIncome),
      totalCosts: Calc.round2(t.totalCosts),
      net: Calc.round2(t.net),
      savedAt: todayISO()
    };
  }

  function save() {
    const rec = buildRecord();
    currentId = rec.id;
    Storage.saveJob(rec);
    renderHistory();
    App.toast(I18n.t('saved'));
  }

  function loadJob(rec) {
    currentId = rec.id;
    $('job_title').value = rec.title || '';
    $('job_date').value = rec.date || todayISO();
    income = (rec.income || []).map((it) => ({ ...it }));
    costs = (rec.costs || []).map((it) => ({ ...it }));
    if (!income.length) income = [{ concept: '', amount: 0 }];
    renderAll();
    App.showView('view-accounting');
    window.scrollTo({ top: 0 });
  }

  /* ---------- Saved jobs list ---------- */
  function renderHistory() {
    const wrap = $('jobsList');
    const list = Storage.getJobs();
    if (!list.length) { wrap.innerHTML = `<p class="muted">${I18n.t('empty_jobs')}</p>`; return; }
    wrap.innerHTML = list.map((r) => `
      <div class="histitem">
        <div class="histitem__info">
          <strong>${escapeHtml(r.title || '—')}</strong>
          <small>${fmtDate(r.date)}</small>
          <small class="${r.net < 0 ? 'neg' : 'pos'}">${I18n.t('net_profit')}: ${Calc.fmtMoney(r.net)}</small>
        </div>
        <div class="histitem__actions">
          <button class="btn btn--sm btn--ghost" data-open="${r.id}">${I18n.t('open')}</button>
          <button class="btn btn--sm btn--danger" data-del="${r.id}">${I18n.t('delete')}</button>
        </div>
      </div>`).join('');
    wrap.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      const rec = Storage.getJobs().find((r) => r.id === b.dataset.open);
      if (rec) loadJob(rec);
    }));
    wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      Storage.deleteJob(b.dataset.del); renderHistory();
    }));
  }

  /* ---------- helpers ---------- */
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!d) return iso;
    return `${+m}/${+d}/${y}`;
  }
  function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function init() {
    $('job_date').value = todayISO();
    $('addIncomeBtn').addEventListener('click', () => addIncome('', 0));
    $('addCostBtn').addEventListener('click', () => addCost('', 0));
    $('importCalcBtn').addEventListener('click', importFromCalc);
    $('newJobBtn').addEventListener('click', () => { newJob(); App.toast(I18n.t('new_job')); });
    $('saveJobBtn').addEventListener('click', save);
    $('job_title').addEventListener('input', () => {});
    document.addEventListener('i18n:changed', renderHistory);
    newJob();
    renderHistory();
  }

  global.Accounting = { init, renderHistory };
})(window);
