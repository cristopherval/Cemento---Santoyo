/* Finance — confirmed jobs, down-payment tracking and monthly balance.
   A job enters here when a quote is confirmed. Two layers per job:
     · Profitability:  net = total charged - costs
     · Cash flow:      paid (down payment + payments), balance = total - paid
   payStatus: pendiente (nothing paid) / parcial (partial) / pagado (settled). */
(function (global) {
  const $ = (id) => document.getElementById(id);

  let editId = null;          // job being edited in the dialog
  let editCosts = [];         // working copy of that job's costs
  const st = { query: '', month: 'all', week: false };   // list filters

  const getDate = (j) => j.date;
  const getText = (j) => j.title || '';

  /* ---------- Derived fields ---------- */
  function payStatusOf(total, paid) {
    total = Calc.num(total); paid = Calc.num(paid);
    if (paid <= 0) return 'pendiente';
    if (paid + 0.005 >= total) return 'pagado';
    return 'parcial';
  }
  function compute(rec) {
    rec.totalCosts = Calc.round2((rec.costs || []).reduce((s, c) => s + Calc.num(c.amount), 0));
    rec.net = Calc.round2(Calc.num(rec.total) - rec.totalCosts);
    rec.balance = Calc.round2(Calc.num(rec.total) - Calc.num(rec.paid));
    rec.payStatus = payStatusOf(rec.total, rec.paid);
    return rec;
  }

  /* ---------- Confirm a quote into Finance ---------- */
  function confirmFromQuote(quote) {
    if (quote.jobId) {
      const existing = Storage.getJobs().find((j) => j.id === quote.jobId);
      if (existing) {
        App.toast(I18n.t('already_confirmed'));
        App.showView('view-finance'); render(); openEditor(existing.id);
        return;
      }
    }
    const calc = quote.calc || {};
    let total = Calc.num(calc.sqftTotal);
    let paid = 0;
    if (quote.invoiceId) {
      const inv = Storage.getHistory().find((r) => r.id === quote.invoiceId);
      if (inv) { total = Calc.num(inv.total) || total; paid = Calc.num(inv.paid) || 0; }
    }
    const rec = compute({
      id: 'job_' + makeId(),
      quoteId: quote.id,
      title: quote.title || (quote.customer && quote.customer.name) || '',
      date: quote.date || todayISO(),
      size: Calc.num(calc.area),
      total: Calc.round2(total),
      costs: [{ concept: I18n.t('materials_calc'), amount: Calc.round2(Calc.num(calc.materialsTotal)) }],
      paid: Calc.round2(paid),
      savedAt: todayISO()
    });
    Storage.saveJob(rec);
    quote.jobId = rec.id;
    quote.status = 'confirmada';
    Storage.saveQuote(quote);
    if (global.Quotes) Quotes.renderList();
    render();
    App.showView('view-finance');
    App.toast(I18n.t('sent_finance'));
    openEditor(rec.id);
  }

  /* ---------- Filters + totals ---------- */
  function render() {
    const jobs = Storage.getJobs();
    const sel = $('finMonth');
    if (sel) {
      sel.innerHTML = Filters.monthOptionsHTML(jobs, getDate);
      sel.value = st.month;
      if (sel.value !== st.month) { st.month = 'all'; sel.value = 'all'; }
    }
    const filtered = Filters.apply(jobs, getDate, getText, st);
    renderGrand(filtered);
    renderJobs(filtered);
  }

  function renderGrand(jobs) {
    const collected = jobs.reduce((s, j) => s + Calc.num(j.paid), 0);
    const pending = jobs.reduce((s, j) => s + Calc.num(j.balance), 0);
    const net = jobs.reduce((s, j) => s + Calc.num(j.net), 0);
    $('g_collected').textContent = Calc.fmtMoney(collected);
    $('g_pending').textContent = Calc.fmtMoney(pending);
    $('g_net').textContent = Calc.fmtMoney(net);
    $('g_net').classList.toggle('is-negative', net < 0);
  }

  function jobHTML(j) {
    return `
      <div class="histitem histitem--job" data-open="${j.id}">
        <div class="histitem__info">
          <span class="badge badge--${j.payStatus}">${I18n.t('pay_' + j.payStatus)}</span>
          <strong>${escapeHtml(j.title || '—')}</strong>
          <small>${fmtDate(j.date)} · ${I18n.t('job_size')}: ${Calc.fmtNum(j.size || 0)} Sq.Ft.</small>
          <small>${I18n.t('charged')}: ${Calc.fmtMoney(j.total)} · ${I18n.t('total_costs')}: ${Calc.fmtMoney(j.totalCosts)}</small>
          <small>${I18n.t('balance_pending')}: ${Calc.fmtMoney(j.balance)}</small>
        </div>
        <div class="histitem__net money ${j.net < 0 ? 'neg' : 'pos'}">
          <span>${I18n.t('net_profit')}</span>
          <strong>${Calc.fmtMoney(j.net)}</strong>
        </div>
      </div>`;
  }

  function renderJobs(jobs) {
    const wrap = $('financeList');
    if (!wrap) return;
    if (!jobs.length) {
      const all = Storage.getJobs();
      wrap.innerHTML = `<p class="muted">${I18n.t(all.length ? 'no_results' : 'finance_empty')}</p>`;
      return;
    }
    if (st.week) {
      wrap.innerHTML = Filters.groupByWeek(jobs, getDate).map((g) =>
        `<div class="weekgroup"><div class="weekgroup__head">${g.label}</div>${g.items.map(jobHTML).join('')}</div>`).join('');
    } else {
      wrap.innerHTML = jobs.map(jobHTML).join('');
    }
    wrap.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', () => openEditor(el.dataset.open)));
  }

  /* ---------- Edit dialog ---------- */
  function openEditor(id) {
    const job = Storage.getJobs().find((j) => j.id === id);
    if (!job) return;
    editId = id;
    editCosts = (job.costs || []).map((c) => ({ ...c }));
    $('j_title').value = job.title || '';
    $('j_date').value = job.date || todayISO();
    $('j_size').value = job.size || '';
    $('j_total').value = job.total || '';
    $('j_paid').value = job.paid || '';
    renderCosts();
    recomputeDialog();
    App.openModal('jobEditModal');
  }

  function renderCosts() {
    const wrap = $('jobCostsList');
    wrap.innerHTML = '';
    editCosts.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'lineitem';
      row.innerHTML = `
        <input class="lineitem__desc" type="text" placeholder="${I18n.t('concept')}"
               data-i="${i}" data-k="concept" value="${escapeAttr(it.concept)}" />
        <input class="lineitem__amt" type="number" inputmode="decimal" min="0" step="0.01"
               placeholder="0.00" data-i="${i}" data-k="amount" value="${it.amount || ''}" />
        <button class="lineitem__del" data-del="${i}" aria-label="x">✕</button>`;
      wrap.appendChild(row);
    });
    wrap.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', onCostInput));
    wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      editCosts.splice(+b.dataset.del, 1); renderCosts(); recomputeDialog();
    }));
  }

  function onCostInput(e) {
    const { i, k } = e.target.dataset;
    editCosts[+i][k] = k === 'amount' ? Calc.num(e.target.value) : e.target.value;
    recomputeDialog();
  }

  function recomputeDialog() {
    const total = Calc.num($('j_total').value);
    const paid = Calc.num($('j_paid').value);
    const totalCosts = editCosts.reduce((s, c) => s + Calc.num(c.amount), 0);
    const net = total - totalCosts;
    const balance = total - paid;
    $('j_costs_total').textContent = Calc.fmtMoney(totalCosts);
    $('j_balance').textContent = Calc.fmtMoney(balance);
    $('j_net').textContent = Calc.fmtMoney(net);
    $('j_net').classList.toggle('is-negative', net < 0);
  }

  function saveEdit() {
    if (!editId) return;
    const job = Storage.getJobs().find((j) => j.id === editId) || { id: editId };
    job.title = $('j_title').value;
    job.date = $('j_date').value || todayISO();
    job.size = Calc.num($('j_size').value);
    job.total = Calc.round2(Calc.num($('j_total').value));
    job.paid = Calc.round2(Calc.num($('j_paid').value));
    job.costs = editCosts.filter((c) => c.concept || c.amount).map((c) => ({ concept: c.concept, amount: Calc.round2(c.amount) }));
    job.savedAt = todayISO();
    compute(job);
    Storage.saveJob(job);
    App.closeModal('jobEditModal');
    render();
    App.toast(I18n.t('saved'));
  }

  function deleteEdit() {
    if (!editId) return;
    if (!confirm(I18n.t('confirm_del_job'))) return;
    const job = Storage.getJobs().find((j) => j.id === editId);
    Storage.deleteJob(editId);
    // unlink the quote so it can be confirmed again later
    if (job && job.quoteId) {
      const q = Storage.getQuote(job.quoteId);
      if (q) { q.jobId = null; if (q.status === 'confirmada') q.status = 'aceptada'; Storage.saveQuote(q); }
      if (global.Quotes) Quotes.renderList();
    }
    editId = null;
    App.closeModal('jobEditModal');
    render();
    App.toast(I18n.t('saved'));
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
    $('j_total').addEventListener('input', recomputeDialog);
    $('j_paid').addEventListener('input', recomputeDialog);
    $('jobAddCostBtn').addEventListener('click', () => { editCosts.push({ concept: '', amount: 0 }); renderCosts(); recomputeDialog(); });
    $('jobSaveBtn').addEventListener('click', saveEdit);
    $('jobDeleteBtn').addEventListener('click', deleteEdit);
    document.querySelectorAll('[data-close-job]').forEach((el) =>
      el.addEventListener('click', () => App.closeModal('jobEditModal')));

    st.month = Filters.currentMonth();    // default to the current month
    const search = $('finSearch');
    if (search) {
      search.placeholder = I18n.t('search_ph');
      search.addEventListener('input', () => { st.query = search.value; render(); });
    }
    const sel = $('finMonth');
    if (sel) sel.addEventListener('change', () => { st.month = sel.value; render(); });
    const wk = $('finWeekBtn');
    if (wk) wk.addEventListener('click', () => {
      st.week = !st.week; wk.classList.toggle('is-active', st.week); render();
    });
    document.addEventListener('i18n:changed', () => {
      if (search) search.placeholder = I18n.t('search_ph');
      render();
    });
    render();
  }

  global.Finance = { init, render, confirmFromQuote };
})(window);
