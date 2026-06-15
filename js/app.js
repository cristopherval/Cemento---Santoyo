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

    $('clearDataBtn').addEventListener('click', () => {
      // Step 1: confirm
      if (!confirm(I18n.t('confirm_clear'))) return;
      // Step 2: require typing the exact phrase
      const phrase = I18n.t('delete_all_phrase');
      const typed = prompt(I18n.t('confirm_clear_type').replace('{phrase}', phrase));
      if (typed == null) return;                                   // cancelled
      if (typed.trim().toUpperCase() !== phrase.toUpperCase()) {   // wrong text
        toast(I18n.t('clear_cancelled'));
        return;
      }
      Storage.clearHistory(); Storage.clearQuotes(); Storage.clearJobs();
      if (window.Quotes) Quotes.renderList();
      if (window.Finance) Finance.render();
      Invoice.renderHistory();
      toast(I18n.t('saved'));
    });

    $('backToCalcBtn').addEventListener('click', () => showView('view-quotes'));

    const syncBtn = $('syncNowBtn');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
      if (!window.Cloud || !Cloud.isEnabled()) { toast(I18n.t('sign_need_online')); return; }
      if (!Cloud.isOnline()) { toast(I18n.t('sync_offline')); return; }
      syncBtn.disabled = true;
      toast(I18n.t('sync_busy'));
      try { await Cloud.syncNow(); toast(I18n.t('sync_ok')); }
      catch (e) { toast(I18n.t('sync_offline')); }
      finally { syncBtn.disabled = false; }
    });

    $('exportBackupBtn').addEventListener('click', exportBackup);
    $('importBackupBtn').addEventListener('click', () => $('importBackupInput').click());
    $('importBackupInput').addEventListener('change', importBackup);

    bindKeyboardNav();
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
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (_) { toast(I18n.t('restore_error')); return; }
      if (!obj || obj.app !== 'santoyo') { toast(I18n.t('restore_error')); return; }
      if (!confirm(I18n.t('confirm_restore'))) return;
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
    const isField = (el) => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
      && el.type !== 'button' && el.type !== 'submit' && el.type !== 'checkbox' && el.type !== 'radio';
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
    applySettings();
    registerSW();
    if (window.Cloud) Cloud.start();
  }

  global.App = {
    init, showView, openModal, closeModal, toast, refreshAll,
    refreshHistory: () => Invoice.renderHistory()
  };

  document.addEventListener('DOMContentLoaded', init);
})(window);
