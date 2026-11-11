/* Traffic — santoyosconcrete.com stats (GA4 + Search Console + PageSpeed).
   Data comes from the website's Cloudflare function /api/traffic (repo
   Santoyo---Landing, functions/api/traffic.ts), which holds the Google key.
   This app sends its Supabase session token with `X-Panel: app`.
   The website's admin panel shows the same thing (TrafficPanel.tsx) — keep both in step.
   Anything coming from Google (search queries, page paths, cities) is escaped:
   search queries are typed by strangers. */
(function (global) {
  const $ = (id) => document.getElementById(id);
  const API = (global.SANTOYO_CONFIG && global.SANTOYO_CONFIG.TRAFFIC_API) ||
              'https://santoyosconcrete.com/api/traffic';

  const TXT = {
    es: {
      loading: 'Consultando a Google… la primera vez puede tardar hasta 30 segundos.',
      need_login: 'Inicia sesión para ver el tráfico.', offline: 'Sin internet.',
      site: 'Sitio', online: '● En línea', down: '● Caído', now: 'Ahora mismo', last30: 'últimos 30 min',
      today: 'Visitantes hoy', last_visit: 'Última visita', d_today: 'Hoy', d_yesterday: 'Ayer',
      d_ago: 'Hace {n} días', no_visits: 'Sin visitas',
      google: 'En Google (Search Console)', clicks: 'Clics', impressions: 'Impresiones', ctr: 'CTR',
      position: 'Posición media', impr_day: 'Impresiones por día', gsc_lag: 'Search Console publica con 2–3 días de retraso.',
      queries: 'Búsquedas con las que te encuentran', gpages: 'Páginas en Google', pos: 'Pos.', impr: 'Impr.',
      visits: 'Visitas (Google Analytics)', visitors: 'Visitantes', views: 'Páginas vistas', leads: 'Estimados enviados',
      calls: 'Clics en llamar', sms: 'Clics en SMS', engagement: 'Interacción', users_day: 'Visitantes por día',
      sources: 'De dónde llegan', pages: 'Páginas más vistas', devices: 'Dispositivo', cities: 'Ciudades',
      perf: 'Rendimiento (PageSpeed)', mobile: 'Celular', desktop: 'Computadora',
      perf_note: 'Nota de 0 a 100 (90+ es bueno). Se mide cada 12 h. Actualizado {t}.',
      no_data: 'Todavía sin datos.', max: 'máx.', new: 'nuevo'
    },
    en: {
      loading: 'Asking Google… the first time can take up to 30 seconds.',
      need_login: 'Sign in to see the traffic.', offline: 'No internet connection.',
      site: 'Site', online: '● Online', down: '● Down', now: 'Right now', last30: 'last 30 min',
      today: 'Visitors today', last_visit: 'Last visit', d_today: 'Today', d_yesterday: 'Yesterday',
      d_ago: '{n} days ago', no_visits: 'No visits',
      google: 'On Google (Search Console)', clicks: 'Clicks', impressions: 'Impressions', ctr: 'CTR',
      position: 'Avg. position', impr_day: 'Impressions per day', gsc_lag: 'Search Console data lags 2–3 days.',
      queries: 'Searches that find you', gpages: 'Pages on Google', pos: 'Pos.', impr: 'Impr.',
      visits: 'Visits (Google Analytics)', visitors: 'Visitors', views: 'Page views', leads: 'Estimates sent',
      calls: 'Call clicks', sms: 'SMS clicks', engagement: 'Engagement', users_day: 'Visitors per day',
      sources: 'Where they come from', pages: 'Top pages', devices: 'Device', cities: 'Cities',
      perf: 'Performance (PageSpeed)', mobile: 'Mobile', desktop: 'Desktop',
      perf_note: 'Score 0–100 (90+ is good). Measured every 12 h. Updated {t}.',
      no_data: 'No data yet.', max: 'max', new: 'new'
    }
  };
  const tx = (k, vars) => {
    let s = (TXT[I18n.lang] || TXT.es)[k] || k;
    Object.keys(vars || {}).forEach((v) => { s = s.replace('{' + v + '}', vars[v]); });
    return s;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const pct = (v) => ((Number(v) || 0) * 100).toFixed(1) + '%';
  const isErr = (x) => !!x && typeof x === 'object' && 'error' in x;
  const locale = () => (I18n.lang === 'en' ? 'en-US' : 'es');

  let days = 28;
  let data = null;
  let loading = false;
  let loadedAt = 0;

  function delta(act, prev, lowerIsBetter) {
    if (!prev && !act) return '';
    if (!prev) return `<span class="trf-delta up">${tx('new')}</span>`;
    const ch = (act - prev) / prev;
    if (Math.abs(ch) < 0.005) return '<span class="trf-delta">=</span>';
    const good = lowerIsBetter ? ch < 0 : ch > 0;
    return `<span class="trf-delta ${good ? 'up' : 'down'}">${ch > 0 ? '▲' : '▼'} ${Math.abs(ch * 100).toFixed(0)}%</span>`;
  }

  const tile = (title, value, extra, tone) =>
    `<div class="trf-tile${tone ? ' trf-tile--' + tone : ''}"><span class="trf-tile__t">${esc(title)}</span>` +
    `<strong class="trf-tile__v">${esc(value)}</strong>${extra || ''}</div>`;
  const sub = (s) => `<span class="trf-tile__s">${esc(s)}</span>`;
  // "14 oct – 10 nov 2026": the exact period a block's numbers cover.
  const range = (from, to) => {
    if (!from || !to) return '';
    const f = (iso, y) => new Date(iso + 'T12:00:00')
      .toLocaleDateString(locale(), Object.assign({ day: 'numeric', month: 'short' }, y ? { year: 'numeric' } : {}));
    return `<p class="trf-range">${esc(f(from) + ' – ' + f(to, true))}</p>`;
  };
  const errBox = (msg) => `<p class="trf-error">⚠ ${esc(msg)}</p>`;

  function bars(rows) {
    const max = Math.max(1, ...rows.map((r) => r.v));
    const w = 100 / rows.length;
    const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    const rects = rows.map((r, i) => {
      const h = (r.v / max) * 38;
      return `<rect x="${i * w + w * 0.15}" width="${w * 0.7}" y="${40 - h}" height="${h || 0.3}" rx="0.4">` +
             `<title>${esc(fmt(r.date) + ': ' + n(r.v))}</title></rect>`;
    }).join('');
    return `<div class="trf-chart"><svg viewBox="0 0 100 40" preserveAspectRatio="none">${rects}</svg>` +
      `<div class="trf-chart__cap"><span>${esc(fmt(rows[0].date))}</span><span>${tx('max')} ${n(max)}</span>` +
      `<span>${esc(fmt(rows[rows.length - 1].date))}</span></div></div>`;
  }

  // Bar widths go through el.style after insertion: the app's CSP (style-src 'self')
  // blocks inline style="" attributes in HTML.
  function list(title, rows) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    const body = rows.length
      ? '<ol>' + rows.map((r) => `<li><span class="trf-list__n" title="${esc(r.name)}">${esc(r.name)}</span>` +
          `<span class="trf-list__v">${n(r.value)}</span><span class="trf-list__b" data-w="${(r.value / max) * 100}"></span></li>`).join('') + '</ol>'
      : `<p class="muted">${tx('no_data')}</p>`;
    return `<div class="trf-list"><h4>${esc(title)}</h4>${body}</div>`;
  }

  function queryTable(title, rows) {
    const body = rows.length
      ? `<table class="trf-table"><thead><tr><th></th><th>${tx('clicks')}</th><th>${tx('impr')}</th><th>${tx('pos')}</th></tr></thead><tbody>` +
        rows.map((r) => `<tr><td title="${esc(r.name)}">${esc(r.name)}</td><td>${n(r.clicks)}</td><td>${n(r.impressions)}</td>` +
          `<td>${(Number(r.position) || 0).toFixed(1)}</td></tr>`).join('') + '</tbody></table>'
      : `<p class="muted">${tx('no_data')}</p>`;
    return `<div class="trf-list"><h4>${esc(title)}</h4>${body}</div>`;
  }

  function psiCard(title, p) {
    if (isErr(p)) return errBox(p.error);
    const tone = p.score >= 90 ? 'good' : p.score >= 50 ? 'mid' : 'bad';
    return `<div class="trf-psi"><span class="trf-score trf-score--${tone}">${n(p.score)}</span><div><strong>${esc(title)}</strong>` +
      `<dl><dt>LCP</dt><dd>${esc(p.lcp || '—')}</dd><dt>CLS</dt><dd>${esc(p.cls || '—')}</dd><dt>TBT</dt><dd>${esc(p.tbt || '—')}</dd></dl></div></div>`;
  }

  function lastVisit(daily) {
    for (let i = daily.length - 1; i >= 0; i--) {
      if (daily[i].users > 0) {
        const d = daily.length - 1 - i;
        return { text: d === 0 ? tx('d_today') : d === 1 ? tx('d_yesterday') : tx('d_ago', { n: d }), days: d };
      }
    }
    return { text: tx('no_visits'), days: daily.length };
  }

  function render() {
    const body = $('trafficBody');
    if (!body || !data) return;
    const ga = isErr(data.ga) ? null : data.ga;
    const gsc = isErr(data.gsc) ? null : data.gsc;
    const rt = isErr(data.realtime) ? null : data.realtime;
    const st = data.status;
    const lv = ga ? lastVisit(ga.daily) : null;
    let h = '';

    // 1. Is it working?
    h += '<div class="card"><div class="trf-grid">' +
      tile(tx('site'), st.online ? tx('online') : tx('down'),
           sub(st.online ? st.ms + ' ms' : (st.error || 'HTTP ' + st.httpStatus)), st.online ? 'ok' : 'bad') +
      tile(tx('now'), rt ? n(rt.activeUsers) : '—', sub(tx('last30'))) +
      tile(tx('today'), ga ? n(ga.daily[ga.daily.length - 1].users) : '—') +
      tile(tx('last_visit'), lv ? lv.text : '—', '', lv && lv.days >= 3 ? 'mid' : '') +
      '</div>' + (isErr(data.realtime) && ga ? errBox(data.realtime.error) : '') + '</div>';

    // 2. Google
    h += `<div class="card"><h2 class="card__title">${esc(tx('google'))}</h2>` +
      (gsc ? range(gsc.range.start, gsc.range.end) : '');
    if (isErr(data.gsc)) h += errBox(data.gsc.error);
    else if (gsc) {
      const t = gsc.totals, p = gsc.previous;
      h += '<div class="trf-grid">' +
        tile(tx('clicks'), n(t.clicks), delta(t.clicks, p.clicks)) +
        tile(tx('impressions'), n(t.impressions), delta(t.impressions, p.impressions)) +
        tile(tx('ctr'), pct(t.ctr), delta(t.ctr, p.ctr)) +
        tile(tx('position'), t.position ? t.position.toFixed(1) : '—', delta(t.position, p.position, true)) +
        '</div>' +
        `<p class="trf-sub">${esc(tx('impr_day'))}</p>` + bars(gsc.daily.map((d) => ({ date: d.date, v: d.impressions }))) +
        `<p class="trf-foot">${esc(tx('gsc_lag'))}</p>` +
        '<div class="trf-lists">' + queryTable(tx('queries'), gsc.queries) + queryTable(tx('gpages'), gsc.pages) + '</div>';
    }
    h += '</div>';

    // 3. Visits
    h += `<div class="card"><h2 class="card__title">${esc(tx('visits'))}</h2>` +
      (ga && ga.daily.length ? range(ga.daily[0].date, ga.daily[ga.daily.length - 1].date) : '');
    if (isErr(data.ga)) h += errBox(data.ga.error);
    else if (ga) {
      const t = ga.totals, p = ga.previous, c = ga.conversions || {}, pc = ga.previousConversions || {};
      h += '<div class="trf-grid">' +
        tile(tx('visitors'), n(t.users), delta(t.users, p.users)) +
        tile(tx('views'), n(t.views), delta(t.views, p.views)) +
        tile(tx('leads'), n(c.generate_lead), delta(c.generate_lead || 0, pc.generate_lead || 0)) +
        tile(tx('calls'), n(c.click_call), delta(c.click_call || 0, pc.click_call || 0)) +
        tile(tx('sms'), n(c.click_sms), delta(c.click_sms || 0, pc.click_sms || 0)) +
        tile(tx('engagement'), pct(t.engagementRate)) +
        '</div>' +
        `<p class="trf-sub">${esc(tx('users_day'))}</p>` + bars(ga.daily.map((d) => ({ date: d.date, v: d.users }))) +
        '<div class="trf-lists">' + list(tx('sources'), ga.sources) + list(tx('pages'), ga.pages) +
        list(tx('devices'), ga.devices) + list(tx('cities'), ga.cities) + '</div>';
    }
    h += '</div>';

    // 4. Performance
    const time = new Date(data.generatedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    h += `<div class="card"><h2 class="card__title">${esc(tx('perf'))}</h2><div class="trf-lists">` +
      psiCard(tx('mobile'), data.psi.mobile) + psiCard(tx('desktop'), data.psi.desktop) + '</div>' +
      `<p class="trf-foot">${esc(tx('perf_note', { t: time }))}</p></div>`;

    body.innerHTML = h;
    body.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  }

  function setBusy(on) {
    loading = on;
    const body = $('trafficBody');
    if (body) body.classList.toggle('is-loading', on && !!data);
    const r = $('trfRefresh'); if (r) r.disabled = on;
    document.querySelectorAll('#trfDays button').forEach((b) => { b.disabled = on; });
  }

  async function load() {
    if (loading) return;
    const body = $('trafficBody');
    if (!navigator.onLine) { body.innerHTML = `<div class="card">${errBox(tx('offline'))}</div>`; return; }
    const token = global.Cloud && Cloud.getAccessToken ? await Cloud.getAccessToken() : null;
    if (!token) { body.innerHTML = `<div class="card">${errBox(tx('need_login'))}</div>`; return; }
    if (!data) body.innerHTML = `<div class="card"><p class="muted">${esc(tx('loading'))}</p></div>`;
    setBusy(true);
    try {
      const res = await fetch(`${API}?days=${days}`, { headers: { Authorization: 'Bearer ' + token, 'X-Panel': 'app' } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error((json && json.error) || 'HTTP ' + res.status);
      data = json;
      loadedAt = Date.now();
      render();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (data) App.toast(msg); else body.innerHTML = `<div class="card">${errBox(msg)}</div>`;
    } finally {
      setBusy(false);
    }
  }

  // Opening the tab loads once; it reloads by itself only if the data is over 5 min old.
  function onShow() {
    if (!data || Date.now() - loadedAt > 5 * 60 * 1000) load();
  }

  function init() {
    const seg = $('trfDays');
    if (!seg) return;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-days]');
      if (!b || loading) return;
      days = +b.dataset.days;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
      data = null;
      load();
    });
    $('trfRefresh').addEventListener('click', load);
    document.addEventListener('i18n:changed', render);
  }

  document.addEventListener('DOMContentLoaded', init);
  global.Traffic = { onShow, load };
})(window);
