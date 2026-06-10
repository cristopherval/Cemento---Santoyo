/* Invoice controller — free-text description, manual TOTAL & AMOUNT PAID,
   auto BALANCE DUE = total - paid. Always rendered in English.
   Each new invoice starts blank (customer fields, total, paid, customer signature).
   The CEO signature is remembered on the device until cleared. */
(function (global) {
  const $ = (id) => document.getElementById(id);
  let currentRecord = null;       // record being previewed
  let lastQuote = null;           // snapshot from calculator (for history reference)
  let linkedQuoteId = null;       // id of the quote this invoice belongs to
  let custPad = null;             // customer signature pad
  let ceoPad = null;              // CEO signature pad
  let signMode = 'digital';       // 'digital' = customer signs on screen | 'physical' = signs on paper

  /* ---------- Signature pad factory (finger / mouse) ---------- */
  function makeSignaturePad(canvasId, restoreDataUrl) {
    const canvas = $(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || 240, cssH = rect.height || 66;
    canvas.width = cssW * ratio;
    canvas.height = cssH * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#13203a';
    let drawing = false, last = null, dirty = false;

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return; e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() { drawing = false; }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);

    const pad = {
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
      isEmpty() { return !dirty; },
      toDataURL() { return dirty ? canvas.toDataURL('image/png') : ''; },
      restore(url) {
        if (!url) return;
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0, cssW, cssH); dirty = true; };
        img.src = url;
      }
    };
    if (restoreDataUrl) pad.restore(restoreDataUrl);
    return pad;
  }

  // build the pads after the modal is visible (so canvas has measurable size)
  function initPads(rec, mode) {
    custPad = mode === 'digital' ? makeSignaturePad('custSigCanvas', rec.customerSignature) : null;
    ceoPad = makeSignaturePad('ceoSigCanvas', rec.ceoSignature || Storage.getCeoSignature());
  }

  // save signatures into the record; remember the CEO one globally for next time
  function persistSignature() {
    if (!currentRecord) return;
    if (custPad) currentRecord.customerSignature = custPad.toDataURL();
    if (ceoPad) {
      const ceo = ceoPad.toDataURL();
      currentRecord.ceoSignature = ceo;
      if (ceo) Storage.saveCeoSignature(ceo);
    }
    Storage.saveRecord(currentRecord);
    App.refreshHistory();
  }

  /* ---------- Totals ---------- */
  function recompute() {
    const total = Calc.num($('inv_total_input').value);
    const paid = Calc.num($('inv_paid').value);
    const balance = total - paid;
    $('inv_balance').textContent = Calc.fmtMoney(balance);
    return { total, paid, balance };
  }

  /* ---------- Start a fresh, blank invoice ---------- */
  // total & amount paid stay EMPTY by request; customer fields & signature reset; CEO kept.
  function startNew(quote) {
    lastQuote = quote || null;
    linkedQuoteId = null;
    currentRecord = null;
    custPad = null;
    ['inv_name', 'inv_phone', 'inv_address', 'inv_email', 'inv_desc',
     'inv_total_input', 'inv_paid'].forEach((id) => { $(id).value = ''; });
    $('inv_date').value = todayISO();
    recompute();
  }

  /* ---------- Build an invoice from a saved quote ---------- */
  // Prefills customer + TOTAL (= Sq.Ft. price, editable). If the quote already
  // has an invoice, that invoice is reopened for preview/reprint instead.
  function fromQuote(quote) {
    linkedQuoteId = quote.id;
    const existing = quote.invoiceId
      ? Storage.getHistory().find((r) => r.id === quote.invoiceId) : null;
    if (existing) { loadRecord(existing); return; }

    currentRecord = null;
    custPad = null;
    lastQuote = quote.calc || null;
    const cust = quote.customer || {};
    $('inv_name').value = cust.name || '';
    $('inv_phone').value = cust.phone || '';
    $('inv_address').value = cust.address || '';
    $('inv_email').value = cust.email || '';
    $('inv_desc').value = quote.title || '';
    $('inv_total_input').value = quote.calc && quote.calc.sqftTotal ? quote.calc.sqftTotal : '';
    $('inv_paid').value = '';
    $('inv_date').value = todayISO();
    recompute();
    App.showView('view-invoice');
    window.scrollTo({ top: 0 });
  }

  // Link a saved invoice back to its quote and advance the quote status.
  function linkInvoiceToQuote(rec) {
    if (!linkedQuoteId) return;
    const q = Storage.getQuote(linkedQuoteId);
    if (!q) return;
    q.invoiceId = rec.id;
    if (q.status === 'pendiente') q.status = 'aceptada';
    Storage.saveQuote(q);
    if (global.Quotes) Quotes.renderList();
  }

  /* ---------- Build a record from the form ---------- */
  function buildRecord(number) {
    const t = recompute();
    return {
      id: currentRecord ? currentRecord.id : 'inv_' + makeId(),
      number: currentRecord ? currentRecord.number : number,
      date: $('inv_date').value || todayISO(),
      customer: {
        name: $('inv_name').value, phone: $('inv_phone').value,
        address: $('inv_address').value, email: $('inv_email').value
      },
      description: $('inv_desc').value,
      total: Calc.round2(t.total),
      paid: Calc.round2(t.paid),
      balance: Calc.round2(t.balance),
      customerSignature: currentRecord ? currentRecord.customerSignature : '',
      ceoSignature: currentRecord ? currentRecord.ceoSignature : Storage.getCeoSignature(),
      signMode: signMode,
      quote: lastQuote,
      quoteId: linkedQuoteId,
      savedAt: todayISO()
    };
  }

  /* ---------- Render the printable invoice sheet (English, matches original) ---------- */
  function renderSheet(rec, mode) {
    const c = AppData.COMPANY;
    const notes = AppData.INVOICE_NOTES.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
    // customer signature: interactive canvas (digital) or blank line (physical / on paper)
    const custSpot = mode === 'digital'
      ? `<canvas id="custSigCanvas" class="isheet__sigpad"></canvas>`
      : ``;

    $('invoiceSheet').innerHTML = `
      <div class="isheet">
        <img src="assets/logo.png" class="isheet__wm" alt="" />

        <div class="isheet__titlewrap">
          <div class="isheet__title">${c.name}</div>
          <div class="isheet__title isheet__title--reflect" aria-hidden="true">${c.name}</div>
        </div>
        <div class="isheet__invoice-label">INVOICE</div>

        <div class="isheet__head">
          <div class="isheet__company">
            <strong>CEO: ${c.ceo}</strong>
            <span>Phone Number: ${c.phone}</span>
            <a class="isheet__link" href="mailto:${c.email}">${c.email}</a>
            <span>Facebook : ${c.facebook}</span>
            <span>Website: ${c.website}</span>
            <span>Adress : ${c.address}</span>
            <span class="gap"></span>
            <span>Service to : ${escapeHtml(rec.customer.name || '')}</span>
            <span>Phone: ${escapeHtml(rec.customer.phone || '')}</span>
            <span>Adress: ${escapeHtml(rec.customer.address || '')}</span>
            <span>Email Adress: ${escapeHtml(rec.customer.email || '')}</span>
          </div>
          <div class="isheet__numbers">
            <div class="row"><span class="lbl">INVOICE #</span><span class="val">${rec.number}</span></div>
            <div class="row"><span class="lbl">INVOICE DATE</span><span class="val">${fmtDate(rec.date)}</span></div>
          </div>
        </div>

        <table class="isheet__table">
          <thead><tr><th>Description</th><th colspan="2">Amount</th></tr></thead>
          <tbody>
            <tr>
              <td class="isheet__desc" rowspan="4">${escapeHtml(rec.description || '')}</td>
              <td class="isheet__notes" colspan="2"><ul>${notes}</ul></td>
            </tr>
            <tr><td class="isheet__sumlbl">TOTAL</td><td class="num">${Calc.fmtMoney(rec.total)}</td></tr>
            <tr><td class="isheet__sumlbl">AMOUNT PAID</td><td class="num">${Calc.fmtMoney(rec.paid)}</td></tr>
            <tr><td class="isheet__sumlbl">BALANCE DUE $</td><td class="num">${Calc.fmtMoney(rec.balance)}</td></tr>
          </tbody>
        </table>

        <div class="isheet__signs">
          <div class="isheet__sign">
            <div class="sigspot">${custSpot}</div>
            <span class="line"></span>
            <small>Customer Signature</small>
          </div>
          <div class="isheet__sign">
            <div class="sigspot">
              <canvas id="ceoSigCanvas" class="isheet__sigpad"></canvas>
            </div>
            <span class="line"></span>
            <small class="strong">${c.ceo}</small>
            <small>CEO</small>
            <small>Date ${fmtDate(rec.date)}</small>
          </div>
        </div>
      </div>`;
  }

  /* ---------- Signature-choice dialog before showing the invoice ---------- */
  function requestPreview() { App.openModal('signChoiceModal'); }

  async function doPreview(mode) {
    signMode = mode;
    const number = currentRecord ? currentRecord.number
      : (window.Cloud ? await Cloud.nextInvoiceNumber() : Storage.nextInvoiceNumber());
    currentRecord = buildRecord(number);
    Storage.saveRecord(currentRecord);
    linkInvoiceToQuote(currentRecord);
    renderSheet(currentRecord, mode);
    App.openModal('invoiceModal');
    initPads(currentRecord, mode);
    configureSigbar(mode);
    App.refreshHistory();
    App.toast(I18n.t('saved'));
  }

  function configureSigbar(mode) {
    const hint = document.querySelector('.modal__sigbar > span');
    if (hint) hint.textContent = I18n.t(mode === 'physical' ? 'sign_hint_physical' : 'sign_hint_digital');
    const clearCust = $('clearCustBtn');
    if (clearCust) clearCust.style.display = mode === 'physical' ? 'none' : '';
  }

  function loadRecord(rec) {
    currentRecord = rec;
    lastQuote = rec.quote || null;
    linkedQuoteId = rec.quoteId || linkedQuoteId;
    signMode = rec.signMode || 'digital';
    $('inv_name').value = rec.customer.name || '';
    $('inv_phone').value = rec.customer.phone || '';
    $('inv_address').value = rec.customer.address || '';
    $('inv_email').value = rec.customer.email || '';
    $('inv_desc').value = rec.description || '';
    $('inv_total_input').value = rec.total || '';
    $('inv_paid').value = rec.paid || '';
    $('inv_date').value = rec.date || todayISO();
    recompute();
    renderSheet(rec, signMode);
    App.showView('view-invoice');
    App.openModal('invoiceModal');
    initPads(rec, signMode);
    configureSigbar(signMode);
  }

  /* ---------- Export ---------- */
  async function renderCanvas() {
    const node = $('invoiceSheet').querySelector('.isheet');
    // Force the full desktop width so the export keeps letter proportions even on
    // mobile (where the on-screen sheet reflows narrow). Signatures are fixed-size
    // (240px) so they aren't affected. Restored right after capture.
    const prevW = node.style.width, prevMax = node.style.maxWidth;
    node.style.width = '660px';
    node.style.maxWidth = 'none';
    try {
      return await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 1024 });
    } finally {
      node.style.width = prevW;
      node.style.maxWidth = prevMax;
    }
  }

  // Open the native share sheet for a file (on mobile it offers Print, WhatsApp,
  // Save, etc.). If the Web Share API can't share files (desktop), open it in a
  // new tab so the user can print/save manually — we never auto-download.
  async function shareFile(blob, name, type) {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Image → share
  async function doImage() {
    persistSignature();
    App.toast(I18n.t('generating'));
    try {
      const canvas = await renderCanvas();
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      await shareFile(blob, `invoice-${currentRecord.number}.png`, 'image/png');
    } catch (e) { if (e && e.name === 'AbortError') return; App.toast('Error: ' + e.message); }
  }

  // PDF → share (the share sheet includes Print / AirPrint / Save to Files)
  async function doPdf() {
    persistSignature();
    App.toast(I18n.t('generating'));
    try {
      const canvas = await renderCanvas();
      const img = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pw / canvas.width, ph / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(img, 'PNG', (pw - w) / 2, 20, w, h);
      const blob = pdf.output('blob');
      await shareFile(blob, `invoice-${currentRecord.number}.pdf`, 'application/pdf');
    } catch (e) { if (e && e.name === 'AbortError') return; App.toast('Error: ' + e.message); }
  }

  /* ---------- History ---------- */
  function renderHistory() {
    const wrap = $('historyList');
    if (!wrap) return; // invoices are now reached from their quote
    const list = Storage.getHistory();
    if (!list.length) { wrap.innerHTML = `<p class="muted">${I18n.t('empty_history')}</p>`; return; }
    wrap.innerHTML = list.map((r) => `
      <div class="histitem">
        <div class="histitem__info">
          <strong>#${r.number}</strong>
          <span>${escapeHtml(r.customer.name || '—')}</span>
          <small>${fmtDate(r.date)} · ${Calc.fmtMoney(r.total)}</small>
        </div>
        <div class="histitem__actions">
          <button class="btn btn--sm btn--ghost" data-open="${r.id}">${I18n.t('open')}</button>
          <button class="btn btn--sm btn--danger" data-del="${r.id}">${I18n.t('delete')}</button>
        </div>
      </div>`).join('');
    wrap.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => {
      const rec = Storage.getHistory().find((r) => r.id === b.dataset.open);
      if (rec) loadRecord(rec);
    }));
    wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      Storage.deleteRecord(b.dataset.del); renderHistory();
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
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init() {
    $('inv_date').value = todayISO();
    $('inv_total_input').addEventListener('input', recompute);
    $('inv_paid').addEventListener('input', recompute);
    $('previewInvoiceBtn').addEventListener('click', requestPreview);
    $('imageInvoiceBtn').addEventListener('click', doImage);
    $('pdfInvoiceBtn').addEventListener('click', doPdf);

    const newBtn = $('newInvoiceBtn');
    if (newBtn) newBtn.addEventListener('click', () => { startNew(null); App.toast(I18n.t('new_invoice')); });

    // signature-choice dialog
    $('choiceDigital').addEventListener('click', () => { App.closeModal('signChoiceModal'); doPreview('digital'); });
    $('choicePhysical').addEventListener('click', () => { App.closeModal('signChoiceModal'); doPreview('physical'); });
    document.querySelectorAll('[data-close-choice]').forEach((el) =>
      el.addEventListener('click', () => App.closeModal('signChoiceModal')));

    const clearCust = $('clearCustBtn');
    if (clearCust) clearCust.addEventListener('click', () => { if (custPad) { custPad.clear(); persistSignature(); } });
    const clearCeo = $('clearCeoBtn');
    if (clearCeo) clearCeo.addEventListener('click', () => { if (ceoPad) { ceoPad.clear(); persistSignature(); } });

    document.addEventListener('i18n:changed', renderHistory);
    renderHistory();
    recompute();
  }

  global.Invoice = { init, startNew, fromQuote, renderHistory };
})(window);
