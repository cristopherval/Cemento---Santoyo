/* Filters — shared search / month / week logic for the Quotes and Finance lists.
   State per list: { query, month, week }
     · month: 'all' = every record, or a 'YYYY-MM' key (defaults to current month)
     · week:  true = group the visible records by week (Sunday–Saturday) */
(function (global) {
  const MONTHS = {
    es: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    en: ['January','February','March','April','May','June','July','August','September','October','November','December']
  };
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const months = () => MONTHS[I18n.lang] || MONTHS.es;

  function currentMonth() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthKey(dateStr) { return (dateStr || '').slice(0, 7); }
  // default filter: current month if it has records, otherwise show all
  function defaultMonth(items, getDate) {
    const cur = currentMonth();
    return (items || []).some((i) => monthKey(getDate(i)) === cur) ? cur : 'all';
  }
  function monthLabel(key) {
    const [y, m] = key.split('-');
    return months()[(+m || 1) - 1] ? months()[(+m || 1) - 1] + ' ' + y : key;
  }

  // start of the week (Sunday) for a YYYY-MM-DD date
  function weekStart(dateStr) {
    const p = (dateStr || '').split('-').map(Number);
    const dt = new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1);
    dt.setDate(dt.getDate() - dt.getDay());
    return dt;
  }
  function weekKey(dateStr) {
    const dt = weekStart(dateStr);
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }
  function weekLabel(dateStr) {
    const s = weekStart(dateStr);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    const mo = (d) => (months()[d.getMonth()] || '').slice(0, 3);
    return mo(s) + ' ' + s.getDate() + ' – ' + mo(e) + ' ' + e.getDate() + ', ' + e.getFullYear();
  }

  // <option> list: "All months", "This month", then every month that has records
  function monthOptionsHTML(items, getDate) {
    const cur = currentMonth();
    const set = new Set(items.map((i) => monthKey(getDate(i))).filter(Boolean));
    set.add(cur);
    const keys = [...set].sort().reverse();
    return `<option value="all">${I18n.t('all_months')}</option>` +
      keys.map((k) => `<option value="${k}">${k === cur ? I18n.t('this_month') : monthLabel(k)}</option>`).join('');
  }

  function apply(items, getDate, getText, st) {
    let out = items;
    if (st.month && st.month !== 'all') out = out.filter((i) => monthKey(getDate(i)) === st.month);
    const q = (st.query || '').trim().toLowerCase();
    if (q) out = out.filter((i) => (getText(i) || '').toLowerCase().indexOf(q) >= 0);
    return out;
  }

  function groupByWeek(items, getDate) {
    const map = {};
    items.forEach((i) => {
      const k = weekKey(getDate(i));
      (map[k] = map[k] || { key: k, label: weekLabel(getDate(i)), items: [] }).items.push(i);
    });
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }

  global.Filters = { currentMonth, defaultMonth, monthKey, monthLabel, weekKey, weekLabel, monthOptionsHTML, apply, groupByWeek };
})(window);
