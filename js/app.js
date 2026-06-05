/* App — navigation, settings, theme, toasts. Wires the modules together. */
(function (global) {
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
      if (confirm(I18n.t('confirm_clear'))) { Storage.clearHistory(); Invoice.renderHistory(); toast(I18n.t('saved')); }
    });

    $('toInvoiceBtn').addEventListener('click', () => {
      Invoice.startNew(Quote.getState());
      showView('view-invoice');
    });
    $('backToCalcBtn').addEventListener('click', () => showView('view-calc'));
  }

  /* ---------- Service worker ---------- */
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      });
    }
  }

  function init() {
    settings = Storage.getSettings();
    bind();
    Quote.init();
    Invoice.init();
    Accounting.init();
    applySettings();
    registerSW();
  }

  global.App = {
    init, showView, openModal, closeModal, toast,
    refreshHistory: () => Invoice.renderHistory()
  };

  document.addEventListener('DOMContentLoaded', init);
})(window);
