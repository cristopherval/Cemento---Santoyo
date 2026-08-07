/* App — navigation, settings, theme, toasts. Wires the modules together. */
(function (global) {
  // Anti-clickjacking: never allow the app to run inside someone else's iframe.
  try {
    if (window.top !== window.self) { window.top.location = window.self.location; }
  } catch (e) { document.documentElement.style.display = 'none'; }

  const $ = (id) => document.getElementById(id);
  let settings = { lang: 'es', theme: 'dark' };
  let toastTimer = null;

  /* ---------- Views ---------- */
  function showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('view--active', v.id === viewId));
    document.querySelectorAll('.bottomnav__btn').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.view === viewId));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (viewId === 'view-storage' && window.Vault) Vault.refresh();
  }

  /* ---------- Settings ---------- */
  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    I18n.set(settings.lang);
    syncToggles();
  }
  function syncToggles() {
    document.querySelectorAll('#langToggle button').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.lang === settings.lang));
    document.querySelectorAll('#themeToggle button').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.theme === settings.theme));
  }
  function setLang(lang) { settings.lang = lang; Storage.saveSettings(settings); applySettings(); }
  function setTheme(theme) { settings.theme = theme; Storage.saveSettings(settings); applySettings(); }

  /* ---------- Drawer & modal ---------- */
  function openDrawer() { $('settingsDrawer').hidden = false; }
  function closeDrawer() { $('settingsDrawer').hidden = true; }
  function openModal(id) { $(id).hidden = false; document.body.classList.add('modal-open'); }
  function closeModal(id) { $(id).hidden = true; document.body.classList.remove('modal-open'); }

  /* ---------- Toast ---------- */
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('is-show'); setTimeout(() => (t.hidden = true), 250); }, 2200);
  }

  /* ---------- Themed confirm dialog (replaces the native confirm/prompt) ----------
     Usage:  const ok = await App.confirm({ title, message, confirmText, cancelText,
                                            requirePhrase, phraseHint });
     Returns a Promise<boolean>. If requirePhrase is set, the OK button stays
     disabled until the user types that exact phrase (used by "Borrar historial"). */
  let confirmResolver = null;
  function askConfirm(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      // if another confirm is somehow open, resolve it as cancelled first
      if (confirmResolver) { const r = confirmResolver; confirmResolver = null; r(false); }
      confirmResolver = resolve;

      const titleEl = $('confirmTitle');
      titleEl.textContent = opts.title || '';
      titleEl.hidden = !opts.title;
      $('confirmMsg').textContent = opts.message || '';

      const ok = $('confirmOk');
      ok.textContent = opts.confirmText || I18n.t('delete');
      $('confirmCancel').textContent = opts.cancelText || I18n.t('cancel');

      const phrase = opts.requirePhrase || '';
      const wrap = $('confirmPhraseWrap');
      const input = $('confirmPhrase');
      wrap.hidden = !phrase;
      $('confirmPhraseHint').textContent = phrase ? (opts.phraseHint || '') : '';
      input.value = '';
      input.placeholder = phrase || '';
      ok.disabled = !!phrase;                       // must type the phrase to enable
      input.oninput = phrase
        ? () => { ok.disabled = input.value.trim().toUpperCase() !== phrase.toUpperCase(); }
        : null;

      $('confirmDialog').hidden = false;
      document.body.classList.add('modal-open');
      setTimeout(() => (phrase ? input : ok).focus(), 30);
    });
  }
  function closeConfirm(result) {
    $('confirmDialog').hidden = true;
    document.body.classList.remove('modal-open');
    const r = confirmResolver; confirmResolver = null;
    if (r) r(result);
  }

  /* ---------- Wire events ---------- */
  function bind() {
    document.querySelectorAll('.bottomnav__btn').forEach((b) =>
      b.addEventListener('click', () => showView(b.dataset.view)));

    $('settingsBtn').addEventListener('click', openDrawer);
    document.querySelectorAll('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeDrawer));
    document.querySelectorAll('[data-close-modal]').forEach((el) =>
      el.addEventListener('click', () => closeModal('invoiceModal')));

    document.querySelectorAll('#langToggle button').forEach((b) =>
      b.addEventListener('click', () => setLang(b.dataset.lang)));
    document.querySelectorAll('#themeToggle button').forEach((b) =>
      b.addEventListener('click', () => setTheme(b.dataset.theme)));

    // themed confirm dialog buttons
    $('confirmOk').addEventListener('click', () => closeConfirm(true));
    document.querySelectorAll('[data-confirm-cancel]').forEach((el) =>
      el.addEventListener('click', () => closeConfirm(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('confirmDialog').hidden) closeConfirm(false);
    });

    $('backToCalcBtn').addEventListener('click', () => showView('view-quotes'));

    const syncBtn = $('syncNowBtn');
    if (syncBtn) {
      async function doSync() {
        if (!window.Cloud || !Cloud.isEnabled()) { toast(I18n.t('sign_need_online')); return; }
        if (!Cloud.isOnline()) { toast(I18n.t('sync_offline')); return; }
        syncBtn.disabled = true;
        toast(I18n.t('sync_busy'));
        try { await Cloud.syncNow(); toast(I18n.t('sync_ok')); }
        catch (e) { toast(I18n.t('sync_offline')); }
        finally { syncBtn.disabled = false; }
      }
      // single tap = sync data · triple-click = force-update the app code
      let clicks = 0, clickTimer = null;
      syncBtn.addEventListener('click', () => {
        clicks++;
        clearTimeout(clickTimer);
        if (clicks >= 3) { clicks = 0; forceUpdate(); return; }
        clickTimer = setTimeout(() => { clicks = 0; doSync(); }, 500);
      });
    }

    $('exportBackupBtn').addEventListener('click', exportBackup);
    $('importBackupBtn').addEventListener('click', () => $('importBackupInput').click());
    $('importBackupInput').addEventListener('change', importBackup);

    bindKeyboardNav();
  }

  /* ---------- Force-update the app code (clear caches + reload latest) ---------- */
  async function forceUpdate() {
    if (!await askConfirm({ message: I18n.t('confirm_update'), confirmText: I18n.t('sync_now') })) return;
    toast(I18n.t('updating'));
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {}
    location.reload();
  }

  /* ---------- Backup (export / import a JSON file) ---------- */
  function exportBackup() {
    const data = Storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const name = 'santoyo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(I18n.t('backup_done'));
  }

  function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';            // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (_) { toast(I18n.t('restore_error')); return; }
      if (!obj || obj.app !== 'santoyo') { toast(I18n.t('restore_error')); return; }
      if (!await askConfirm({ message: I18n.t('confirm_restore'), confirmText: I18n.t('import_backup') })) return;
      if (!Storage.importAll(obj)) { toast(I18n.t('restore_error')); return; }
      refreshAll();
      // push the restored data up to the cloud (if signed in)
      if (window.Cloud && Cloud.isEnabled()) {
        Storage.getQuotes().forEach((r) => Cloud.onLocalChange('quotes', 'upsert', r.id, r));
        Storage.getJobs().forEach((r) => Cloud.onLocalChange('jobs', 'upsert', r.id, r));
        Storage.getHistory().forEach((r) => Cloud.onLocalChange('invoices', 'upsert', r.id, r));
        const sig = Storage.getCeoSignature();
        if (sig) Cloud.onLocalChange('kv', 'upsert', 'ceoSignature', { value: sig });
        Cloud.flushQueue();
      }
      toast(I18n.t('restore_done'));
    };
    reader.readAsText(file);
  }

  /* Hide the bottom nav while the soft keyboard is open (a text field is focused),
     so it doesn't float to the middle of the screen on mobile. */
  function bindKeyboardNav() {
    const nav = document.querySelector('.bottomnav');
    if (!nav) return;
    // Only text-entry fields open the on-screen keyboard. Selects/date/file pickers
    // use native overlays (no keyboard), so they must NOT hide the bottom nav.
    const TEXT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number', 'password'];
    const isField = (el) => {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') return TEXT_TYPES.indexOf((el.type || 'text').toLowerCase()) >= 0;
      return false;
    };
    document.addEventListener('focusin', (e) => { if (isField(e.target)) nav.classList.add('bottomnav--hidden'); });
    document.addEventListener('focusout', () => {
      setTimeout(() => { if (!isField(document.activeElement)) nav.classList.remove('bottomnav--hidden'); }, 120);
    });
  }

  /* ---------- Service worker ---------- */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  function refreshAll() {
    if (window.Quotes) Quotes.renderList();
    if (window.Finance) Finance.render();
    if (window.Invoice) { Invoice.renderHistory(); Invoice.refreshOpen(); }
  }

  function init() {
    // Guest signing mode: a customer opened a ?sign=<id>&t=<token> link.
    // Show only the signing screen — no login, no app, no sync.
    const params = new URLSearchParams(location.search);
    const signId = params.get('sign');
    const signToken = params.get('t');
    if (signId && signToken && window.Cloud && Cloud.hasConfig()) {
      settings = Storage.getSettings();
      settings.lang = 'en';       // the customer-facing signing page is always English
      applySettings();
      Cloud.initGuest();
      Invoice.startGuestSigning(signId, signToken);
      return;
    }

    settings = Storage.getSettings();
    bind();
    Quote.init();
    Invoice.init();
    Quotes.init();
    Finance.init();
    if (window.Vault) Vault.init();
    applySettings();
    registerSW();
    if (window.Cloud) Cloud.start();
  }

  global.App = {
    init, showView, openModal, closeModal, toast, refreshAll,
    confirm: askConfirm,
    refreshHistory: () => Invoice.renderHistory()
  };

  document.addEventListener('DOMContentLoaded', init);
})(window);
