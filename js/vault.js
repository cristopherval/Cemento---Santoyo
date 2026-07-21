/* Vault — "Almacenamiento" tab: upload / list / open / delete PDFs (and images)
   stored in Supabase Storage. Online + signed-in only. */
(function (global) {
  const $ = (id) => document.getElementById(id);

  function setMsg(text) {
    const el = $('storageMsg');
    if (el) { el.textContent = text || ''; el.hidden = !text; }
  }
  function available() { return window.Cloud && Cloud.isEnabled() && Cloud.isOnline(); }

  async function refresh() {
    const wrap = $('filesList');
    if (!wrap) return;
    if (!window.Cloud || !Cloud.isEnabled()) { wrap.innerHTML = ''; setMsg(I18n.t('storage_need_cloud')); return; }
    if (!Cloud.isOnline()) { setMsg(I18n.t('storage_offline')); return; }
    setMsg('');
    let files;
    try { files = await Cloud.listFiles(); }
    catch (e) { setMsg('Error: ' + (e.message || e)); return; }
    if (!files.length) { wrap.innerHTML = `<p class="muted">${I18n.t('no_files')}</p>`; return; }
    wrap.innerHTML = files.map(fileHTML).join('');
    bind(wrap);
  }

  function fileHTML(f) {
    const size = f.metadata && f.metadata.size ? fmtSize(f.metadata.size) : '';
    const date = f.created_at ? fmtDate(f.created_at) : '';
    return `
      <div class="histitem">
        <div class="histitem__info">
          <strong>${escapeHtml(displayName(f.name))}</strong>
          <small>${date}${size ? ' · ' + size : ''}</small>
        </div>
        <div class="histitem__actions">
          <button class="btn btn--sm btn--ghost" data-open="${encodeURIComponent(f.name)}">${I18n.t('open')}</button>
          <button class="btn btn--sm btn--danger" data-del="${encodeURIComponent(f.name)}">${I18n.t('delete')}</button>
        </div>
      </div>`;
  }

  function bind(wrap) {
    wrap.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
      try { window.open(await Cloud.fileUrl(decodeURIComponent(b.dataset.open)), '_blank'); }
      catch (e) { App.toast('Error: ' + (e.message || e)); }
    }));
    wrap.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!await App.confirm({ title: I18n.t('delete'), message: I18n.t('confirm_del_file') })) return;
      try { await Cloud.deleteFile(decodeURIComponent(b.dataset.del)); refresh(); App.toast(I18n.t('saved')); }
      catch (e) { App.toast('Error: ' + (e.message || e)); }
    }));
  }

  async function upload(fileList) {
    if (!fileList || !fileList.length) return;
    if (!available()) { App.toast(I18n.t('storage_offline')); return; }
    App.toast(I18n.t('uploading'));
    let ok = 0;
    for (const file of fileList) {
      try { await Cloud.uploadFile(file); ok++; }
      catch (e) { App.toast('Error: ' + (e.message || e)); }
    }
    if (ok) App.toast(I18n.t('upload_done'));
    refresh();
  }

  /* helpers */
  function displayName(name) { return String(name).replace(/^\d+-/, ''); }
  function fmtSize(b) {
    b = +b || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function fmtDate(iso) {
    const d = (iso || '').slice(0, 10).split('-');
    return d.length === 3 ? `${+d[1]}/${+d[2]}/${d[0]}` : (iso || '');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init() {
    const btn = $('uploadFileBtn');
    const input = $('fileInput');
    if (btn && input) {
      btn.addEventListener('click', () => {
        if (!available()) { App.toast(I18n.t('storage_offline')); return; }
        input.click();
      });
      input.addEventListener('change', (e) => { upload(e.target.files); e.target.value = ''; });
    }
    document.addEventListener('i18n:changed', refresh);
  }

  global.Vault = { init, refresh };
})(window);
