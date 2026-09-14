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

  /* Session lifetime: the app stays signed in for 15 full days from the last
     login (no idle timeout — closing the app or leaving it open changes
     nothing). Once those 15 days pass, the session is closed and the password
     is required again. */
  const SESSION_MAX_MS = 15 * 24 * 60 * 60 * 1000;
  const LOGIN_AT_KEY = 'santoyo.auth.loginAt';
  const CREDS_KEY = 'santoyo.auth.creds';
  let expiryTimer = null;

  /* Remembered credentials: after a successful login they stay on THIS device
     so the 15-day re-login is just one tap on "Entrar". Base64 only keeps them
     from being readable at a glance — it is not encryption, and anyone with the
     unlocked device could recover them. A manual "Cerrar sesión" forgets them;
     the automatic 15-day expiry keeps them. */
  function saveCreds(email, password) {
    try { LS.set(CREDS_KEY, btoa(encodeURIComponent(JSON.stringify({ email, password })))); } catch (e) {}
  }
  function loadCreds() {
    try { return JSON.parse(decodeURIComponent(atob(LS.get(CREDS_KEY, '')))) || null; } catch (e) { return null; }
  }
  function clearCreds() { try { localStorage.removeItem(CREDS_KEY); } catch (e) {} }

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
  // Fill the login form with the credentials remembered on this device, so the
  // 15-day re-login needs nothing but the "Entrar" button.
  function fillRememberedCreds() {
    const creds = loadCreds();
    if (!creds) return;
    const em = $('authEmail'), pw = $('authPassword');
    if (em && !em.value) em.value = creds.email || '';
    if (pw && !pw.value) pw.value = creds.password || '';
  }

  function showGate() {
    const g = $('authGate');
    if (g) g.hidden = false;
    fillRememberedCreds();
  }
  function hideGate() { const g = $('authGate'); if (g) g.hidden = true; }

  async function signIn(email, password) {
    const err = $('authError'); if (err) err.textContent = '';
    const btn = $('authSubmit'); if (btn) btn.disabled = true;
    try {
      const mail = (email || '').trim(), pass = password || '';
      const { data, error } = await client.auth.signInWithPassword({ email: mail, password: pass });
      if (error) throw error;
      user = (data && data.user) || user;
      LS.set(LOGIN_AT_KEY, Date.now());   // start the 15-day window
      saveCreds(mail, pass);              // pre-fill the next login on this device
      hideGate();
      afterLogin();          // drive success directly; don't rely only on the auth event
    } catch (e) {
      console.error('[Cloud] signIn error:', e);
      if (err) err.textContent = (e && e.message) ? e.message : I18n.t('auth_error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // `forget` drops the remembered credentials: true when the user signs out on
  // purpose, false when the 15-day window simply ran out.
  async function signOut(forget) {
    if (!client) return;
    clearTimeout(expiryTimer);
    LS.set(LOGIN_AT_KEY, 0);
    if (forget) {
      clearCreds();
      const em = $('authEmail'), pw = $('authPassword');
      if (em) em.value = ''; if (pw) pw.value = '';
    }
    await client.auth.signOut();
    // keep local data, but force a fresh seed/login next time
    LS.set(SEED_KEY, false);
  }

  async function afterLogin() {
    showUserEmail();
    watchSessionExpiry();
    seedIfFirstRun();
    await pullAll();
    if (!booted) { booted = true; startListeners(); }
    flushQueue();
  }

  /* ---------- 15-day session window ---------- */
  // ms left before the session expires; <= 0 means it already did.
  function sessionMsLeft() {
    const at = Number(LS.get(LOGIN_AT_KEY, 0)) || 0;
    if (!at) return SESSION_MAX_MS;   // legacy session with no stamp: start the clock now
    return at + SESSION_MAX_MS - Date.now();
  }

  // Signs out if the 15 days are up. Returns true when the session expired.
  async function enforceSessionExpiry() {
    if (!ready()) return false;
    if (sessionMsLeft() > 0) return false;
    await signOut();
    const err = $('authError');
    if (err) err.textContent = I18n.t('auth_expired');
    return true;
  }

  // Re-arm a timer so a session that runs out while the app is open closes too.
  function watchSessionExpiry() {
    if (!LS.get(LOGIN_AT_KEY, 0)) LS.set(LOGIN_AT_KEY, Date.now());
    clearTimeout(expiryTimer);
    // setTimeout caps at ~24.8 days, so clamp and re-arm.
    const wait = Math.min(Math.max(sessionMsLeft(), 0), 6 * 60 * 60 * 1000);
    expiryTimer = setTimeout(async () => {
      if (!(await enforceSessionExpiry())) watchSessionExpiry();
    }, wait);
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
    // Timers don't fire while the device sleeps, so re-check the 15-day window
    // every time the app comes back to the foreground.
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      if (await enforceSessionExpiry()) return;
      if (navigator.onLine) { pullAll(); flushQueue(); }
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
    if (out) out.addEventListener('click', async () => {
      const ok = !global.App || !App.confirm
        ? confirm(I18n.t('confirm_sign_out'))
        : await App.confirm({ title: I18n.t('sign_out'), message: I18n.t('confirm_sign_out'), confirmText: I18n.t('sign_out') });
      if (ok) signOut(true);   // manual sign-out → also forget the credentials
    });
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

  /* ---------------- file storage (Supabase Storage) ---------------- */
  const BUCKET = 'invoices';
  async function uploadFile(file) {
    if (!ready()) throw new Error('offline');
    const safe = (file.name || 'file.pdf').replace(/[^\w.\-]+/g, '_');
    const path = Date.now() + '-' + safe;
    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      upsert: false, contentType: file.type || 'application/octet-stream'
    });
    if (error) throw error;
    return path;
  }
  async function listFiles() {
    if (!ready()) return [];
    const { data, error } = await client.storage.from(BUCKET)
      .list('', { limit: 500, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw error;
    return (data || []).filter((f) => f.id);   // skip folder placeholders
  }
  async function fileUrl(path) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
  async function deleteFile(path) {
    const { error } = await client.storage.from(BUCKET).remove([path]);
    if (error) throw error;
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
    // persistSession + autoRefreshToken keep the user signed in across app
    // restarts; our own 15-day window (LOGIN_AT_KEY) is what ends the session.
    client = global.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage: global.localStorage }
    });
    bindUI();
    // SIGNED_IN is handled directly in signIn(). Here we only restore an existing
    // session on load and react to sign-out. Deferred with setTimeout to avoid the
    // known supabase-js deadlock when calling the API inside this callback.
    client.auth.onAuthStateChange((event, session) => {
      user = (session && session.user) || null;
      setTimeout(async () => {
        if (event === 'INITIAL_SESSION') {
          // A stored session goes straight into the app — no login screen —
          // unless its 15 days are already up.
          if (user && sessionMsLeft() > 0) { hideGate(); afterLogin(); }
          else if (user) { await enforceSessionExpiry(); }
          else { showGate(); }
        } else if (event === 'SIGNED_OUT') {
          booted = false; clearTimeout(expiryTimer); showGate();
        }
        updateStatus();
      }, 0);
    });
  }

  global.Cloud = { start, signIn, signOut, onLocalChange, pullAll, flushQueue, syncNow, nextInvoiceNumber,
                   hasConfig, initGuest, getInvoiceForSigning, submitSignature, sendForSignature,
                   uploadFile, listFiles, fileUrl, deleteFile,
                   isEnabled: () => enabled, isOnline: () => ready() && navigator.onLine };
})(window);
