/* Storage — settings + history persisted in localStorage. */
(function (global) {
  const KEY_SETTINGS = 'santoyo.settings';
  const KEY_HISTORY = 'santoyo.history';
  const KEY_COUNTER = 'santoyo.invoiceCounter';
  const KEY_CEO_SIG = 'santoyo.ceoSignature';
  const KEY_JOBS = 'santoyo.jobs';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  const Storage = {
    getSettings() {
      return Object.assign({ lang: 'es', theme: 'dark' }, read(KEY_SETTINGS, {}));
    },
    saveSettings(s) { write(KEY_SETTINGS, s); },

    getHistory() { return read(KEY_HISTORY, []); },
    saveRecord(record) {
      const list = this.getHistory();
      const idx = list.findIndex((r) => r.id === record.id);
      if (idx >= 0) list[idx] = record; else list.unshift(record);
      write(KEY_HISTORY, list);
      return record;
    },
    deleteRecord(id) {
      write(KEY_HISTORY, this.getHistory().filter((r) => r.id !== id));
    },
    clearHistory() { write(KEY_HISTORY, []); },

    getCeoSignature() { return read(KEY_CEO_SIG, ''); },
    saveCeoSignature(dataUrl) { write(KEY_CEO_SIG, dataUrl || ''); },

    getJobs() { return read(KEY_JOBS, []); },
    saveJob(record) {
      const list = this.getJobs();
      const idx = list.findIndex((r) => r.id === record.id);
      if (idx >= 0) list[idx] = record; else list.unshift(record);
      write(KEY_JOBS, list);
      return record;
    },
    deleteJob(id) { write(KEY_JOBS, this.getJobs().filter((r) => r.id !== id)); },

    nextInvoiceNumber() {
      const n = (read(KEY_COUNTER, 1000) | 0) + 1;
      write(KEY_COUNTER, n);
      return n;
    },
    peekInvoiceNumber() { return (read(KEY_COUNTER, 1000) | 0) + 1; }
  };

  global.Storage = Storage;
})(window);
