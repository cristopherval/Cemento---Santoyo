/* Quotes — list of saved quotes (cotizaciones).
   Each quote can be edited (reloaded into the calculator), turned into an
   invoice, or confirmed into Finance. Status: pendiente → aceptada → confirmada. */
(function (global) {
  const $ = (id) => document.getElementById(id);

  const STATUS_KEY = {
    pendiente: 'status_pending',
    aceptada: 'status_accepted',
    confirmada: 'status_confirmed'
  };

  function renderList() {
    const wrap = $('quotesList');
    if (!wrap) return;
    const list = Storage.getQuotes();
    if (!list.length) { wrap.innerHTML = `<p class="muted">${I18n.t('quotes_empty')}</p>`; return; }

    wrap.innerHTML = list.map((q) => {
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
    }).join('');

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
    document.addEventListener('i18n:changed', renderList);
    renderList();
  }

  global.Quotes = { init, renderList };
})(window);
