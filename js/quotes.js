/* Quotes — list of saved quotes (cotizaciones).
   Each quote can be edited (reloaded into the calculator), turned into an
   invoice, or confirmed into Finance. Status: pendiente → aceptada → confirmada.
   List is filterable by search text, month (default: current) and week grouping. */
(function (global) {
  const $ = (id) => document.getElementById(id);

  const STATUS_KEY = {
    pendiente: 'status_pending',
    aceptada: 'status_accepted',
    confirmada: 'status_confirmed'
  };

  const st = { query: '', month: 'all', week: false };

  const getDate = (q) => q.date;
  function getText(q) {
    const cu = q.customer || {};
    return [q.title, cu.name, cu.phone, cu.address, cu.email].filter(Boolean).join(' ');
  }

  function itemHTML(q) {
    const c = q.calc || {};
    const statusKey = STATUS_KEY[q.status] || 'status_pending';
    const confirmed = q.status === 'confirmada';
    const invLabel = q.invoiceId ? I18n.t('view_invoice') : I18n.t('create_invoice');
    return `
      <div class="histitem histitem--quote">
        <div class="histitem__info">
          <span class="badge badge--${q.status || 'pendiente'}">${I18n.t(statusKey)}</span>
          <strong>${escapeHtml(q.title || q.customer && q.customer.name || '—')}</strong>
          <span>${escapeHtml(q.customer && q.customer.name || '')}</span>
          <small>${fmtDate(q.date)} · ${I18n.t('job_size')}: ${Calc.fmtNum(c.area || 0)} Sq.Ft.</small>
          <small>${I18n.t('charged')}: ${Calc.fmtMoney(c.sqftTotal || 0)} · ${I18n.t('proj_profit')}: ${Calc.fmtMoney(c.profit || 0)}</small>
        </div>
        <div class="histitem__actions histitem__actions--wrap">
          <button class="btn btn--sm btn--ghost" data-edit="${q.id}">${I18n.t('edit')}</button>
          <button class="btn btn--sm btn--ghost" data-invoice="${q.id}">${invLabel}</button>
          <button class="btn btn--sm ${confirmed ? 'btn--ghost' : 'btn--primary'}" data-confirm="${q.id}" ${confirmed ? 'disabled' : ''}>${I18n.t('confirm_finance')}</button>
          <button class="btn btn--sm btn--danger" data-del="${q.id}">${I18n.t('delete')}</button>
        </div>
      </div>`;
  }

  function renderList() {
    const wrap = $('quotesList');
    if (!wrap) return;
    const all = Storage.getQuotes();

    const sel = $('quoteMonth');
    if (sel) {
      sel.innerHTML = Filters.monthOptionsHTML(all, getDate);
      sel.value = st.month;
      if (sel.value !== st.month) { st.month = 'all'; sel.value = 'all'; }
    }

    if (!all.length) { wrap.innerHTML = `<p class="muted">${I18n.t('quotes_empty')}</p>`; return; }
    const list = Filters.apply(all, getDate, getText, st);
    if (!list.length) { wrap.innerHTML = `<p class="muted">${I18n.t('no_results')}</p>`; return; }

    if (st.week) {
      wrap.innerHTML = Filters.groupByWeek(list, getDate).map((g) =>
        `<div class="weekgroup"><div class="weekgroup__head">${g.label}</div>${g.items.map(itemHTML).join('')}</div>`).join('');
    } else {
      wrap.innerHTML = list.map(itemHTML).join('');
    }
    bindActions(wrap);
  }

  function bindActions(wrap) {
    wrap.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const rec = Storage.getQuote(b.dataset.edit);
      if (rec) Quote.loadQuote(rec);
    }));
    wrap.querySelectorAll('[data-invoice]').forEach((b) => b.addEventListener('click', () => {
      const rec = Storage.getQuote(b.dataset.invoice);
      if (rec) Invoice.fromQuote(rec);
    }));
    wrap.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', () => {
      const rec = Storage.getQuote(b.dataset.confirm);
      if (rec) Finance.confirmFromQuote(rec);
    }));
    wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (confirm(I18n.t('confirm_del_quote'))) { Storage.deleteQuote(b.dataset.del); renderList(); }
    }));
  }

  /* ---------- helpers ---------- */
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!d) return iso;
    return `${+m}/${+d}/${y}`;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init() {
    st.month = Filters.currentMonth();
    const search = $('quoteSearch');
    if (search) {
      search.placeholder = I18n.t('search_ph');
      search.addEventListener('input', () => { st.query = search.value; renderList(); });
    }
    const sel = $('quoteMonth');
    if (sel) sel.addEventListener('change', () => { st.month = sel.value; renderList(); });
    const wk = $('quoteWeekBtn');
    if (wk) wk.addEventListener('click', () => {
      st.week = !st.week; wk.classList.toggle('is-active', st.week); renderList();
    });
    document.addEventListener('i18n:changed', () => {
      if (search) search.placeholder = I18n.t('search_ph');
      renderList();
    });
    renderList();
  }

  global.Quotes = { init, renderList };
})(window);
