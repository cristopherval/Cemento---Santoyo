/* Cloud — Supabase auth gate + offline-first sync engine.
   localStorage stays the local source of truth; this layer mirrors it to
   Supabase (shared workspace) and merges remote changes back in by
   last-write-wins on each record's `updatedAt`.
   If SANTOYO_CONFIG is empty the whole layer disables itself and the app
   runs 100% local (no gate, no sync). */
(function (global) {
  const $ = (id) => document.getElementById(id);

  // localStorage helpers (raw — bypass Storage so pulls don't re-enqueue)
  const LS = {
    get(k, f) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const Q_KEY = 'santoyo.sync.queue';
  const SEED_KEY = 'santoyo.sync.seeded';
  const KVMETA_KEY = 'santoyo.sync.kvmeta';

  // logical table -> localStorage key (list records)
  const TABLES = { quotes: 'santoyo.quotes', jobs: 'santoyo.jobs', invoices: 'santoyo.history' };

  let client = null;
  let enabled = false;
  let user = null;
  let pulling = false;
  let booted = false;
  let flushTimer = null;
  let idleTimer = null;
  const IDLE_MS = 60 * 60 * 1000;   // auto sign-out after 60 min of inactivity
  let idleBound = false;

  function cfg() { return global.SANTOYO_CONFIG || {}; }
  function ready() { return enabled && client && user; }
  function nowISO() { return new Date().toISOString(); }

  /* ---------------- outbound queue ---------------- */
  function getQueue() { return LS.get(Q_KEY, []); }
  function setQueue(q) { LS.set(Q_KEY, q); }

  function enqueue(table, payload) {
    const q = getQueue().filter((o) => !(o.table === table && o.payload.id === payload.id));
    q.push({ table, payload });
    setQueue(q);
  }

  // called by Storage after every local write/delete
  function onLocalChange(table, op, id, record) {
    if (!enabled) return; // local-only mode
    let payload;
    if (table === 'kv') {
      payload = { id, data: record || {}, updated_at: nowISO() };
      const meta = LS.get(KVMETA_KEY, {}); meta[id] = payload.updated_at; LS.set(KVMETA_KEY, meta);
    } else if (op === 'delete') {
      payload = { id, data: {}, deleted: true, updated_at: nowISO() };
    } else {
      payload = { id, data: record, deleted: false, updated_at: (record && record.updatedAt) || nowISO() };
    }
    enqueue(table, payload);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (!ready() || !navigator.onLine) { updateStatus(); return; }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushQueue, 400);
  }

  async function flushQueue() {
    if (!ready() || !navigator.onLine) { updateStatus(); return; }
    let q = getQueue();
    if (!q.length) { updateStatus('ok'); return; }
    updateStatus('busy');
    while (q.length) {
      const op = q[0];
      try {
        const { error } = await client.from(op.table).upsert(op.payload);
        if (error) throw error;
      } catch (e) {
        updateStatus(navigator.onLine ? 'ok' : 'offline');
        return; // keep the rest queued, retry on next trigger
      }
      q.shift(); setQueue(q);
    }
    updateStatus('ok');
  }

  /* ---------------- inbound pull + merge ---------------- */
  async function pullAll() {
    if (!ready() || pulling) return;
    pulling = true; updateStatus('busy');
    try {
      for (const table of Object.keys(TABLES)) {
        const { data: rows, error } = await client.from(table).select('*');
        if (error) throw error;
        mergeList(TABLES[table], rows || []);
      }
      await pullKv();
    } catch (e) {
      pulling = false; updateStatus(navigator.onLine ? 'ok' : 'offline'); return;
    }
    pulling = false;
    updateStatus('ok');
    if (global.App && App.refreshAll) App.refreshAll();
  }

  function mergeList(key, rows) {
    const map = {};
    LS.get(key, []).forEach((r) => { if (r && r.id) map[r.id] = r; });
    rows.forEach((row) => {
      const id = row.id;
      if (row.deleted) { delete map[id]; return; }
      const cur = map[id];
      const remoteTs = row.updated_at || (row.data && row.data.updatedAt) || '';
      const localTs = (cur && cur.updatedAt) || '';
      if (!cur || String(remoteTs) >= String(localTs)) {
        const rec = row.data || {};
        rec.id = id;
        if (!rec.updatedAt) rec.updatedAt = remoteTs;
        map[id] = rec;
      }
    });
    const merged = Object.values(map)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    LS.set(key, merged);
  }

  async function pullKv() {
    const { data: rows, error } = await client.from('kv').select('*');
    if (error) throw error;
    const meta = LS.get(KVMETA_KEY, {});
    (rows || []).forEach((row) => {
      if (row.id === 'ceoSignature') {
        const remoteTs = row.updated_at || '';
        if (String(meta.ceoSignature || '') <= String(remoteTs)) {
          LS.set('santoyo.ceoSignature', (row.data && row.data.value) || '');
          meta.ceoSignature = remoteTs;
        }
      }
    });
    LS.set(KVMETA_KEY, meta);
  }

  /* ---------------- first-run seed ---------------- */
  function seedIfFirstRun() {
    if (LS.get(SEED_KEY, false)) return;
    Object.keys(TABLES).forEach((table) => {
      LS.get(TABLES[table], []).forEach((rec) => {
        if (rec && rec.id) onLocalChange(table, 'upsert', rec.id, rec);
      });
    });
    const sig = Storage.getCeoSignature();
    if (sig) onLocalChange('kv', 'upsert', 'ceoSignature', { value: sig });
    LS.set(SEED_KEY, true);
  }

  /* ---------------- auth ---------------- */
  function showGate() { const g = $('authGate'); if (g) g.hidden = false; }
  function hideGate() { const g = $('authGate'); if (g) g.hidden = true; }

  async function signIn(email, password) {
    const err = $('authError'); if (err) err.textContent = '';
    const btn = $('authSubmit'); if (btn) btn.disabled = true;
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: (email || '').trim(), password: password || '' });
      if (error) throw error;
      user = (data && data.user) || user;
      hideGate();
      afterLogin();          // drive success directly; don't rely only on the auth event
    } catch (e) {
      console.error('[Cloud] signIn error:', e);
      if (err) err.textContent = (e && e.message) ? e.message : I18n.t('auth_error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function signOut() {
    if (!client) return;
    clearTimeout(idleTimer);
    await client.auth.signOut();
    // keep local data, but force a fresh seed/login next time
    LS.set(SEED_KEY, false);
  }

  async function afterLogin() {
    showUserEmail();
    startIdleWatch();
    seedIfFirstRun();
    await pullAll();
    if (!booted) { booted = true; startListeners(); }
    flushQueue();
  }

  /* ---------- idle auto sign-out ---------- */
  function resetIdle() {
    if (!ready()) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (ready()) signOut(); }, IDLE_MS);
  }
  function startIdleWatch() {
    if (!idleBound) {
      ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
        document.addEventListener(ev, resetIdle, { passive: true }));
      idleBound = true;
    }
    resetIdle();
  }

  function showUserEmail() {
    const el = $('authUserEmail');
    if (el) el.textContent = user ? user.email : '';
    const row = $('signedInRow');
    if (row) row.hidden = !user;
  }

  /* ---------------- status ---------------- */
  function updateStatus(state) {
    const el = $('syncStatus');
    if (!el) return;
    if (!enabled) { el.textContent = ''; return; }
    let s = state;
    if (!s) s = !navigator.onLine ? 'offline' : (getQueue().length ? 'busy' : 'ok');
    el.textContent = I18n.t(s === 'offline' ? 'sync_offline' : s === 'busy' ? 'sync_busy' : 'sync_ok');
    el.dataset.state = s;
  }

  /* ---------------- listeners ---------------- */
  function startListeners() {
    window.addEventListener('online', () => { updateStatus(); flushQueue(); pullAll(); });
    window.addEventListener('offline', () => updateStatus('offline'));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) { pullAll(); flushQueue(); }
    });
    setInterval(() => { if (navigator.onLine) { pullAll(); flushQueue(); } }, 45000);
  }

  function bindUI() {
    const form = $('authForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      signIn($('authEmail').value, $('authPassword').value);
    });
    const out = $('signOutBtn');
    if (out) out.addEventListener('click', signOut);
    document.addEventListener('i18n:changed', () => updateStatus());
  }

  /* ---------------- invoice numbering (atomic when online) ---------------- */
  async function nextInvoiceNumber() {
    if (ready() && navigator.onLine) {
      try {
        const { data, error } = await client.rpc('next_invoice_number');
        if (!error && data != null) return Number(data);
      } catch (e) {}
    }
    return Storage.nextInvoiceNumber();
  }

  // manual "sync everything now" — push pending changes, then pull latest
  async function syncNow() {
    if (!ready() || !navigator.onLine) { updateStatus(); return false; }
    await flushQueue();
    await pullAll();
    return true;
  }

  /* ---------------- remote signing ---------------- */
  function hasConfig() {
    const c = cfg();
    return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && global.supabase && global.supabase.createClient);
  }
  // create the client only (no auth gate / listeners) — used by guest signing
  function initGuest() {
    if (!hasConfig()) return false;
    const c = cfg();
    enabled = true;
    client = global.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
    return true;
  }
  async function getInvoiceForSigning(id, token) {
    if (!client) return null;
    const { data, error } = await client.rpc('get_invoice_for_signing', { p_id: id, p_token: token });
    if (error) throw error;
    return data || null;   // jsonb record or null
  }
  async function submitSignature(id, token, sig) {
    if (!client) throw new Error('offline');
    const { error } = await client.rpc('submit_signature', { p_id: id, p_token: token, p_sig: sig });
    if (error) throw error;
    return true;
  }
  // Push one invoice to Supabase right now (so a signing link works immediately).
  async function sendForSignature(rec) {
    if (!ready() || !navigator.onLine) return false;
    const payload = { id: rec.id, data: rec, deleted: false, updated_at: rec.updatedAt || nowISO() };
    const { error } = await client.from('invoices').upsert(payload);
    if (error) return false;
    return true;
  }

  /* ---------------- boot ---------------- */
  function start() {
    const c = cfg();
    if (!c.SUPABASE_URL || !c.SUPABASE_ANON_KEY) { enabled = false; hideGate(); return; }
    if (!global.supabase || !global.supabase.createClient) { enabled = false; hideGate(); return; }
    enabled = true;
    client = global.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
    bindUI();
    // SIGNED_IN is handled directly in signIn(). Here we only restore an existing
    // session on load and react to sign-out. Deferred with setTimeout to avoid the
    // known supabase-js deadlock when calling the API inside this callback.
    client.auth.onAuthStateChange((event, session) => {
      user = (session && session.user) || null;
      setTimeout(() => {
        if (event === 'INITIAL_SESSION') {
          if (user) { hideGate(); afterLogin(); } else { showGate(); }
        } else if (event === 'SIGNED_OUT') {
          booted = false; showGate();
        }
        updateStatus();
      }, 0);
    });
  }

  global.Cloud = { start, signIn, signOut, onLocalChange, pullAll, flushQueue, syncNow, nextInvoiceNumber,
                   hasConfig, initGuest, getInvoiceForSigning, submitSignature, sendForSignature,
                   isEnabled: () => enabled, isOnline: () => ready() && navigator.onLine };
})(window);
