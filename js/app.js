/* DRP Manager — single-page front end (no build step). Same structure as UNITY. */
(function () {
  'use strict';

  const API = window.DrpAPI;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const COLORS = ['#00ffff', '#ffff00', '#e5173f', '#3ddc84', '#ff9f40', '#b48cff', '#ff6fd8', '#7fb7ff', '#c0ff6f'];
  const ATT_CYCLE = ['P', 'A', 'L', ''];

  const state = { role: null, cfg: null, charts: [], seq: 0, program: 'DRP1' };
  const isAdmin = () => state.role === 'admin';
  // Admins and faculty see every student's records; only admins edit.
  const seesAll = () => state.role === 'admin' || state.role === 'faculty';

  // ---------- page cache (stale-while-revalidate) ----------
  // Pages open instantly from memory (and, after a reload, from this browser's storage); a
  // background request refreshes them and the page redraws only if the data changed. Any write
  // on the server changes the data version, which empties the cache. Signing out clears it.
  const cache = new Map();
  const FRESH_MS = 30000;
  const PAGES_KEY = 'drp.pages';
  const strip = (k, v) => (k === 'generatedAt' ? undefined : v);
  let persistTimer = null;
  const cacheSet = (key, data) => { cache.set(key, { data, at: Date.now() }); schedulePersist(); };
  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      try { localStorage.setItem(PAGES_KEY, JSON.stringify({ user: state.username, items: [...cache] })); }
      catch (e) { try { localStorage.removeItem(PAGES_KEY); } catch (e2) {} }   // storage full: skip
    }, 400);
  }
  function restorePages() {
    try {
      const saved = JSON.parse(localStorage.getItem(PAGES_KEY) || 'null');
      if (saved && saved.user === state.username) saved.items.forEach(([k, v]) => cache.set(k, { data: v.data, at: 0 }));   // at 0 = refresh in background
    } catch (e) {}
  }
  function clearPages() { cache.clear(); try { localStorage.removeItem(PAGES_KEY); } catch (e) {} }
  /** Someone changed data on the server: keep showing the saved pages, but refresh each one in the
   * background when it is opened (and the common ones right away), instead of a blank "Loading…". */
  function stalePages() { cache.forEach((v) => { v.at = 0; }); setTimeout(prefetch, 50); }
  API.onVersionChange(() => stalePages());
  const pageKey = (action, params) => action + '@' + (state.batch || '') + JSON.stringify(params);

  /** Loads the pages people open most, in ONE request, right after sign-in. */
  async function prefetch() {
    if (!state.cfg) return;
    const p = state.program, m = defaultMonth(), ms = batchMonths();
    const i = ms.findIndex((x) => x.key === m.key), pm = ms[Math.max(0, i - 1)] || m;
    const want = [
      ['dashboard', { program: p }],
      ['sessions', { program: p, year: m.year, month: m.monthNo }],
      ['attendance', { program: p, year: m.year, month: m.monthNo }],
      ['syllabus', { program: p }],
      ['exams', { program: p }],
      ['tasks', { program: p, kind: 'ClassTest' }],
      ['tasks', { program: p, kind: 'Assignment' }],
      ['calendar', { program: p }],
      ['monthlyReport', { program: p, year: pm.year, month: pm.monthNo }],
      ...(isAdmin() ? [['reportLog', { program: p }]] : []),
      ...(seesAll() ? [['faculty', { program: p }]] : [['reportCard', { studentId: state.cfg.me.studentId }]])
    ].filter(([a, prm]) => { const h = cache.get(pageKey(a, prm)); return !h || Date.now() - h.at > FRESH_MS; });
    if (!want.length) return;
    try {
      const yr = state.batch;
      const res = await API.call('batch', { batch: yr, calls: want.map(([action, params]) => ({ action, params: { ...params, batch: yr } })) });
      if (yr !== state.batch) return;   // the year was switched meanwhile: don't store under the wrong year
      res.forEach((r, k) => { if (r.ok) cacheSet(pageKey(want[k][0], want[k][1]), r.data); });
    } catch (e) { /* prefetch is best-effort */ }
  }
  async function cachedLoad(action, params, rerender) {
    const key = pageKey(action, params);
    const hit = cache.get(key);
    const seq = state.seq;
    if (hit) {
      if (Date.now() - hit.at > FRESH_MS) {
        API.call(action, params).then((data) => {
          const changed = JSON.stringify(data, strip) !== JSON.stringify(hit.data, strip);
          cacheSet(key, data);
          if (changed && seq === state.seq) rerender();
        }).catch(() => {});
      }
      return hit.data;
    }
    loading();
    const data = await guarded(() => API.call(action, params));
    if (data !== undefined) cacheSet(key, data);
    return seq === state.seq ? data : undefined;
  }
  async function write(action, params) {
    const data = await guarded(() => API.call(action, params));
    clearPages();
    setTimeout(prefetch, 300);   // reload the common pages in the background after a change
    return data;
  }
  function saveCfg() {
    try { localStorage.setItem('drp.cfg', JSON.stringify({ role: state.role, username: state.username, cfg: state.cfg })); } catch (e) {}
  }

  // ---------- helpers ----------
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast'; }, isError ? 6000 : 3000);
  }
  function confirmBox(title, text, okLabel = 'OK') {
    const d = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel;
    return new Promise((resolve) => {
      const done = (v) => { d.close(); resolve(v); };
      $('#confirm-ok').onclick = () => done(true);
      $('#confirm-cancel').onclick = () => done(false);
      d.oncancel = () => resolve(false);
      d.showModal();
    });
  }
  /** Modal form. onSave(form) returns true to close; onDelete optional. */
  function formDialog({ title, body, okLabel = 'Save', onSave, onDelete, deleteLabel = 'Delete' }) {
    const d = $('#form-dialog'), f = $('#form-dialog-form');
    $('#form-dialog-title').textContent = title;
    $('#form-dialog-body').innerHTML = body;
    $('#form-dialog-ok').textContent = okLabel;
    const del = $('#form-dialog-delete');
    del.hidden = !onDelete; del.textContent = deleteLabel;
    const busy = (b) => $$('#form-dialog .actions button').forEach((x) => { x.disabled = b; });
    f.onsubmit = async (e) => {
      e.preventDefault();
      busy(true);
      try { if (await onSave(f)) d.close(); } catch (err) { /* toast already shown */ } finally { busy(false); }
    };
    del.onclick = async () => {
      busy(true);
      try { if (await onDelete()) d.close(); } catch (err) {} finally { busy(false); }
    };
    $('#form-dialog-cancel').onclick = () => d.close();
    d.showModal();
    return f;
  }
  const minToHM = (m) => { m = Math.round(Number(m) || 0); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const parseDs = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { if (!s) return ''; const d = parseDs(s); return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const fmtShort = (s) => { if (!s) return ''; const d = parseDs(s); return isNaN(d) ? s : `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const fmtTime = (hm) => {
    if (!hm) return '';
    let [h, m] = hm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  };
  const todayDs = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const pct = (v) => (v == null ? '—' : `${v}%`);
  const stars = (n, max = 5) => { n = Math.round(Number(n) || 0); return `<span class="stars" aria-label="${n} of ${max} stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, max - n))}</span></span>`; };

  /** Batch months [{year, monthNo, key, label}] and the current/nearest one. */
  /** Academic years from the server: [{ id, start, end, current, months }]. */
  const years = () => state.cfg.years || [];
  const year = () => years().find((y) => y.id === state.batch) || years().find((y) => y.current) || { id: state.cfg.settings.batch, start: state.cfg.settings.batchStart, end: state.cfg.settings.batchEnd, months: state.cfg.months || [] };
  const batchMonths = () => year().months || [];
  /**
   * Chooses the academic year to show: the current year by default (also on every new visit);
   * a year picked in the year selector lasts until the browser is closed.
   */
  function initYear() {
    let pick = null;
    try { pick = sessionStorage.getItem('drp.year'); } catch (e) {}
    const ok = (id) => years().some((y) => y.id === id);
    state.batch = ok(pick) ? pick : (state.cfg.currentYear || (years()[0] || {}).id || '');
    API.setExtra({ batch: state.batch });
  }
  function selectYear(id) {
    if (!years().some((y) => y.id === id) || id === state.batch) return;
    state.batch = id;
    try { sessionStorage.setItem('drp.year', id); } catch (e) {}
    API.setExtra({ batch: id });
    renderBadge();
    route();
    setTimeout(prefetch, 50);
  }
  /** "Academic year [2025-2026 ▾]" picker (plain text when there is only one year). */
  function yearPicker(id) {
    const list = years();
    if (list.length < 2) return `<div class="field"><label>Academic year</label><div class="year-chip">${esc(year().id || '—')}</div></div>`;
    return `<div class="field"><label for="${id}">Academic year</label><select id="${id}" class="year-select">${list.slice().reverse().map((y) =>
      `<option value="${esc(y.id)}" ${y.id === state.batch ? 'selected' : ''}>${esc(y.id)}${y.current ? ' (current)' : ''}</option>`).join('')}</select></div>`;
  }
  /** Read-only year shown on the Dashboard and Calendar; the year is chosen only in Settings. */
  function yearLabel() { return `<div class="field"><label>Academic year</label><div class="year-chip" title="Change it in Settings › Academic year">${esc(year().id || '—')}</div></div>`; }
  function wireYearPicker(id) { const el = $('#' + id); if (el) el.onchange = () => selectYear(el.value); }
  function defaultMonth() {
    const t = new Date(), key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const ms = batchMonths();
    return ms.find((m) => m.key === key) || (ms.length && key > ms[ms.length - 1].key ? ms[ms.length - 1] : ms[0]) || { year: t.getFullYear(), monthNo: t.getMonth() + 1, key };
  }
  function monthPicker(id, year, monthNo) {
    const ms = batchMonths();
    const key = `${year}-${String(monthNo).padStart(2, '0')}`;
    const opts = ms.map((m) => `<option value="${m.year}/${m.monthNo}" ${m.key === key ? 'selected' : ''}>${MONTHS[m.monthNo - 1]} ${m.year}</option>`);
    if (!ms.some((m) => m.key === key)) opts.unshift(`<option selected value="${year}/${monthNo}">${MONTHS[monthNo - 1]} ${year}</option>`);
    const i = ms.findIndex((m) => m.key === key);
    return `<div class="field"><label for="${id}">Month</label>
      <div style="display:flex;gap:6px">
        <button class="btn small" type="button" data-step="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Previous month">‹</button>
        <select id="${id}">${opts.join('')}</select>
        <button class="btn small" type="button" data-step="1" ${i < 0 || i >= ms.length - 1 ? 'disabled' : ''} aria-label="Next month">›</button>
      </div></div>`;
  }
  function wireMonthPicker(id, base) {
    const sel = $('#' + id);
    sel.onchange = () => { location.hash = `${base}/${sel.value}`; };
    $$(`[data-step]`, sel.parentNode).forEach((b) => b.addEventListener('click', () => {
      const i = sel.selectedIndex + Number(b.dataset.step);
      if (i >= 0 && i < sel.options.length) { sel.selectedIndex = i; sel.onchange(); }
    }));
  }
  const topicLabel = (code) => { const t = state.cfg.topics.find((x) => x.code === code); return t ? `(${t.code}) ${t.name}` : code; };
  /** Curriculum of the selected academic year (yearly scheme up to 2025-26, semesters from 2026-27). */
  const curriculum = () => year().curriculum || 'DRP-YEARLY';
  const isSemester = () => curriculum() !== 'DRP-YEARLY';
  const curPapers = () => state.cfg.papers.filter((p) => p.program === state.program && (p.curriculum || 'DRP-YEARLY') === curriculum());
  const curTopics = () => state.cfg.topics.filter((t) => (t.curriculum || 'DRP-YEARLY') === curriculum() || ['EXM', 'CLT', 'SEM', 'PAP', 'ONL'].includes(t.code));
  const topicOptions = (sel) => {
    const byPaper = {};
    curTopics().forEach((t) => { (byPaper[t.paper || 'Other'] = byPaper[t.paper || 'Other'] || []).push(t); });
    const order = curPapers().map((p) => p.code);
    const paperTitle = (c) => { const p = state.cfg.papers.find((x) => x.code === c); return p ? (isSemester() ? `${p.short} — ${p.title}` : `${p.code} — ${p.short || p.title}`) : c; };
    const keys = Object.keys(byPaper).sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
    if (sel && !curTopics().some((t) => t.code === sel)) { const t = state.cfg.topics.find((x) => x.code === sel); (byPaper[(t && t.paper) || 'Other'] = byPaper[(t && t.paper) || 'Other'] || []).push(t || { code: sel, name: sel }); if (!keys.includes((t && t.paper) || 'Other')) keys.push((t && t.paper) || 'Other'); }
    return '<option value="">— none —</option>' + keys.map((p) => `<optgroup label="${esc(paperTitle(p))}">${
      byPaper[p].map((t) => `<option value="${esc(t.code)}" ${t.code === sel ? 'selected' : ''}>(${esc(t.code)}) ${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  };
  const students = () => (state.cfg.students[state.program] || []).filter((s) => !s.batch || s.batch === state.batch);

  function destroyCharts() { state.charts.forEach((c) => c.destroy()); state.charts = []; }
  function chart(canvas, config) {
    if (!window.Chart || !canvas) return;
    Chart.defaults.color = '#a9c7cd';
    Chart.defaults.borderColor = 'rgba(31,107,122,.5)';
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    config.plugins = (config.plugins || []).concat(barLabels);
    state.charts.push(new Chart(canvas, config));
  }
  /**
   * Numbers on the bars, like the data labels in the legacy Google Sheets charts.
   * mode 'top': value above each bar. mode 'stack': each part's value inside it (when it fits)
   * and the stack's total above it.
   */
  const barLabels = {
    id: 'barLabels',
    afterDatasetsDraw(c, args, opts) {
      if (!opts || !opts.mode) return;
      const g = c.ctx, fmtV = opts.format || String;
      g.save();
      g.font = `bold 12px ${getComputedStyle(document.body).fontFamily}`;
      g.textAlign = 'center'; g.fillStyle = '#ffffff';
      if (opts.mode === 'stack') {
        const n = c.data.labels.length, totals = new Array(n).fill(0), tops = new Array(n).fill(Infinity), xs = [];
        c.data.datasets.forEach((ds, di) => {
          if (!c.isDatasetVisible(di)) return;
          c.getDatasetMeta(di).data.forEach((el, i) => {
            const v = Number(ds.data[i]) || 0;
            totals[i] += v; xs[i] = el.x;
            const { y, base, width } = el.getProps(['y', 'base', 'width'], true);
            tops[i] = Math.min(tops[i], y);
            if (!v) return;
            g.textBaseline = 'middle';
            if (Math.abs(base - y) >= 15) {           // fits inside the part
              g.textAlign = 'center'; g.fillStyle = '#ffffff';
              g.fillText(fmtV(v), el.x, (y + base) / 2);
            } else {                                  // thin part: number beside the column, in white (red on navy is hard to read)
              const tx = el.x + (width || 30) / 2 + 5, ty = (y + base) / 2;
              g.textAlign = 'left';
              g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = 'rgba(14,45,74,.95)'; g.strokeText(fmtV(v), tx, ty);
              g.fillStyle = '#ffffff'; g.fillText(fmtV(v), tx, ty);
            }
            g.textAlign = 'center'; g.fillStyle = '#ffffff';
          });
        });
        g.textBaseline = 'bottom';
        totals.forEach((t, i) => { if (xs[i] != null && tops[i] !== Infinity) g.fillText(fmtV(t), xs[i], tops[i] - 3); });
      } else {
        const horizontal = c.options.indexAxis === 'y';
        c.data.datasets.forEach((ds, di) => {
          if (!c.isDatasetVisible(di)) return;
          const isLine = (ds.type || c.config.type) === 'line';
          c.getDatasetMeta(di).data.forEach((el, i) => {
            const v = ds.data[i];
            if (v == null) return;
            const t = fmtV(v);
            if (horizontal) {                       // value just past the end of the bar
              g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = opts.color || '#ffffff';
              g.fillText(t, el.x + 5, el.y);
            } else if (isLine) {                    // value above the point, in the line's colour, with a dark outline
              g.textAlign = 'center'; g.textBaseline = 'bottom';
              g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = 'rgba(8,42,49,.95)'; g.strokeText(t, el.x, el.y - 6);
              g.fillStyle = ds.borderColor || '#ffffff'; g.fillText(t, el.x, el.y - 6);
            } else if (opts.inside && Math.abs(el.base - el.y) >= 18) {   // in the middle of a tall bar
              // Shrink the font until the number fits inside the column's width (7–11 px).
              const fam = getComputedStyle(document.body).fontFamily, room = (el.width || 30) - 4;
              let size = 11;
              g.font = `bold ${size}px ${fam}`;
              while (size > 7 && g.measureText(t).width > room) { size -= 0.5; g.font = `bold ${size}px ${fam}`; }
              g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = opts.insideColor || '#00262c';
              g.fillText(t, el.x, (el.y + el.base) / 2);
              g.font = `bold 12px ${fam}`;
            } else {                                // above the bar
              g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = opts.color || '#ffffff';
              g.fillText(t, el.x, el.y - 3);
            }
          });
        });
      }
      g.restore();
    }
  };
  const sheetScales = (stacked) => ({
    x: { stacked, ticks: { color: '#ffffff', font: { weight: 'bold' }, autoSkip: false, maxRotation: 50 }, grid: { display: false } },
    y: { stacked, beginAtZero: true, ticks: { color: '#c9d7e3' }, grid: { color: 'rgba(255,255,255,.12)' } }
  });
  /**
   * Attendance chart in the colours of the legacy sheet's "Attendance" chart (navy; Present
   * green, Absent red, Leave amber). One stacked column per student: Present + Absent (+ Leave),
   * so the column height is the total days marked; the total is written on top.
   */
  const ATT_COLORS = { P: '#34A853', A: '#FF0000', L: '#FF9900' };
  function attendanceChart(canvas, rows) {
    const withLeave = rows.some((r) => r.L);
    const ds = [
      { label: 'Present', data: rows.map((r) => r.P), backgroundColor: ATT_COLORS.P },
      { label: 'Absent', data: rows.map((r) => r.A), backgroundColor: ATT_COLORS.A },
      ...(withLeave ? [{ label: 'Leave', data: rows.map((r) => r.L), backgroundColor: ATT_COLORS.L }] : [])
    ];
    chart(canvas, {
      type: 'bar',
      data: { labels: rows.map((r) => (r.pct != null ? [r.name, r.pct + '%'] : r.name)), datasets: ds.map((d) => ({ ...d, maxBarThickness: 54 })) },
      options: {
        maintainAspectRatio: false, layout: { padding: { top: 22 } }, scales: sheetScales(true),
        plugins: { legend: { position: 'bottom', labels: { color: '#ffffff', boxWidth: 12 } }, barLabels: { mode: 'stack' },
          tooltip: { callbacks: { title: (it) => `${rows[it[0].dataIndex].name}: ${rows[it[0].dataIndex].total} days marked` } } }
      }
    });
  }
  /** Faculty hours, like the legacy "Faculty - Hours" chart (navy, blue columns, hours on top). */
  function facultyChart(canvas, list) {
    chart(canvas, {
      type: 'bar',
      data: { labels: list.map((f) => f.name), datasets: [{ label: 'Hours', data: list.map((f) => Math.round(f.minutes / 6) / 10), backgroundColor: '#3D85C6', maxBarThickness: 46 }] },
      options: {
        maintainAspectRatio: false, layout: { padding: { top: 22 } }, scales: sheetScales(false),
        plugins: { legend: { display: false }, barLabels: { mode: 'top' },
          tooltip: { callbacks: { label: (it) => `${minToHM(list[it.dataIndex].minutes)} h on ${list[it.dataIndex].days} day(s)` } } }
      }
    });
  }
  function setMain(html) { destroyCharts(); $('#main').innerHTML = html; }
  function loading() { setMain('<div class="loading">Loading…</div>'); }
  async function guarded(fn) {
    try { return await fn(); } catch (e) {
      if (e.auth) { logout(); toast(e.message, true); return; }
      toast(e.message, true);
      throw e;
    }
  }

  // ---------- auth ----------
  async function login(username, password, remember) {
    const data = await API.call('login', { username, password, remember });
    API.setToken(data.token, remember);
    applySession(data);
    startApp();
  }
  function applySession(data) {
    state.role = data.role; state.username = data.username; state.cfg = data.config;
    saveCfg();
    const st = data.config.settings || {};
    window.DrpPrefs.setDefaults(st.defaultFont, st.defaultWidth);
    initYear();
  }
  function logout() {
    API.setToken('', false);
    clearPages();
    try { localStorage.removeItem('drp.cfg'); } catch (e) {}
    state.role = null; state.username = '';
    $('#login-key').value = '';
    history.replaceState(null, '', '#/dashboard');
    showLogin();
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn'), err = $('#login-error');
    btn.disabled = true; btn.textContent = 'Signing in…'; err.hidden = true;
    try { await login($('#login-user').value.trim(), $('#login-key').value, $('#login-remember').checked); $('#login-key').value = ''; }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  $('#logout-btn').addEventListener('click', logout);

  function showLogin() {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
    setTimeout(() => $('#login-user').focus(), 0);
  }
  function renderBadge() {
    const me = state.cfg.me || {};
    $('#role-badge').textContent = (isAdmin() ? `${state.username} · admin` : `${me.name || state.username} · ${state.role === 'faculty' ? 'faculty' : 'student'}`) + (state.batch ? ` · ${state.batch}` : '');
    $('#role-badge').title = 'Academic year shown: ' + (state.batch || '') + '. Change it in Settings.';
  }
  /** "updated 25 Nov 2026, 18:42 (dd9313c)" — stamped on every website publish (js/build.js). */
  function buildLabel() {
    const b = window.DRP_BUILD || {};
    if (!b.time) return 'website: development copy';
    const d = new Date(b.time);
    const when = isNaN(d) ? b.time : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `updated ${when} (${b.sha})`;
  }
  function renderFooter() {
    // One version for the whole app (website js/version.js = server APP.VERSION). Details on hover.
    const r = state.cfg.release || {}, v = window.DRP_VERSION || r.version || '';
    const tip = `${buildLabel()}${r.version && r.version !== v ? ` · server still on v${r.version}` : ''}`;
    $('#app-footer').innerHTML = `<span title="${esc(tip)}">${esc(state.cfg.settings.title)} v${esc(v)}</span> · ${esc(state.cfg.settings.department)}`;
  }
  function startApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    document.body.classList.toggle('is-admin', isAdmin());
    document.body.classList.toggle('sees-all', seesAll());
    renderBadge();
    if (state.cfg.settings.department) $('#dept-line').textContent = state.cfg.settings.department;
    renderFooter();
    if (!cache.size) restorePages();
    route();
    setTimeout(prefetch, 50);
  }
  async function refreshConfig() {
    const data = await guarded(() => API.call('bootstrap'));
    if (data) { state.cfg = data; saveCfg(); }
  }

  // ---------- router ----------
  const VIEWS = {
    dashboard: viewDashboard, log: viewLog, attendance: viewAttendance, syllabus: viewSyllabus, exams: viewExams,
    tests: (...a) => viewTasks('ClassTest', ...a), assignments: (...a) => viewTasks('Assignment', ...a),
    calendar: viewCalendar, reports: viewReports, faculty: viewFaculty, settings: viewSettings, help: viewHelp
  };
  function route() {
    if (!state.role) return;
    const [, name = 'dashboard', ...args] = (location.hash || '#/dashboard').split('/');
    const view = VIEWS[name] || viewDashboard;
    if (name === 'faculty' && !seesAll()) { location.replace('#/dashboard'); return; }
    state.seq++;
    $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
    document.body.className = document.body.className.replace(/\bview-\S+/g, '').trim() + ' view-' + (VIEWS[name] ? name : 'dashboard');
    Promise.resolve(view(...args.map(decodeURIComponent))).catch((e) => { console.error('View ' + name + ' failed:', e); });
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeprint', () => $$('details.exam-sect').forEach((det) => { det.open = true; }));

  // ---------- Dashboard ----------
  async function viewDashboard() {
    const d = await cachedLoad('dashboard', { program: state.program }, viewDashboard);
    if (!d) return;
    const s = state.cfg.settings, me = state.cfg.me;
    const att = d.attendance;
    // Faculty only (activities such as Seminar or Exam are left out, as in the legacy "Faculty - Hours" chart).
    const facList = (d.faculty || []).filter((f) => f.type !== 'Activity');
    const avg = att.length ? Math.round(10 * att.reduce((a, x) => a + (x.pct || 0), 0) / att.filter((x) => x.pct != null).length || 0) / 10 : null;
    const papers = curPapers();
    // Yearly scheme: "1 PHYSICS", "2 MATHS", ... (paper number first, as in the legacy Monthly_Report), in paper order.
    const paperRows = papers.slice().sort((a, b) => a.no - b.no).map((p) => ({ label: isSemester() ? (p.short || p.code) : `${p.no ? p.no + ' ' : ''}${p.short || p.code}`, minutes: d.paperMinutes[p.code] || 0 }));
    // Hours outside the papers (project work, training, exams, ...): listed under the chart, not as a bar.
    const other = d.otherMinutes || Object.fromEntries(['Other', 'Unassigned'].filter((k) => d.paperMinutes[k]).map((k) => [k === 'Unassigned' ? 'No topic' : k, d.paperMinutes[k]]));
    // Activities (seminar, paper presentation, project work, training, exams, ...) follow the papers as their own
    // bars, in a fixed order, each only when it has hours; drawn in grey to set them apart from the papers.
    const ACT_ORDER = ['Seminar', 'Paper presentation', 'Project work', 'Training', 'Exams', 'Class tests', 'Online classes'];
    const actRank = (k) => (k === 'No topic' ? 100 : ACT_ORDER.indexOf(k) >= 0 ? ACT_ORDER.indexOf(k) : 50);
    Object.keys(other).filter((k) => other[k] > 0)
      .sort((a, b) => actRank(a) - actRank(b) || a.localeCompare(b))
      .forEach((k) => paperRows.push({ label: k.toUpperCase(), minutes: other[k], activity: true }));
    setMain(`
      <div class="toolbar">
        <div><h1>${esc(state.program)} dashboard</h1><div class="sub">${esc(s.welcome)}</div></div>
        <div style="flex:1"></div>${yearLabel()}
      </div>
      <div class="grid kpis">
        <div class="kpi"><div class="label">Class days</div><div class="value">${fmt(d.totals.days)}</div><div class="hint">${fmtDate(year().start)} – ${fmtDate(year().end)}</div></div>
        <div class="kpi"><div class="label">Teaching hours</div><div class="value">${minToHM(d.totals.minutes)}</div><div class="hint">hours:minutes · target ${fmt(d.targets.theory)} theory</div></div>
        <div class="kpi"><div class="label">Sessions logged</div><div class="value">${fmt(d.totals.sessions)}</div></div>
        <div class="kpi"><div class="label">Syllabus topics taught</div><div class="value">${fmt(d.topicsCovered)}<small style="font-size:16px;color:var(--muted)"> / ${fmt(d.topicsTotal)}</small></div></div>
        <div class="kpi"><div class="label">${seesAll() ? 'Average attendance' : 'My attendance'}</div><div class="value">${pct(seesAll() ? avg : (att[0] ? att[0].pct : null))}</div>
          <div class="hint">${seesAll() ? `${att.length} students` : (att[0] ? `${att[0].P} present of ${att[0].total} days marked` : 'No record yet')}</div></div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="panel"><div class="chart-head"><h2>Teaching hours per month</h2>${totalBadge(`<b>${minToHM(d.totals.minutes)}</b> h · <b>${d.totals.days}</b> class days`, 'Total for the academic year')}</div><div class="chart-box"><canvas id="c-hours"></canvas></div></div>
        <div class="panel"><div class="chart-head"><h2>Hours by paper and activity</h2>${totalBadge(`<b>${minToHM(paperRows.reduce((a, r) => a + r.minutes, 0))}</b> h`, 'Total of all papers and activities')}</div><div class="chart-box" style="height:${Math.max(300, 26 * paperRows.length + 60)}px"><canvas id="c-papers"></canvas></div></div>
      </div>
      <div class="grid two">
        <div class="panel chart-sheet"><h2>Attendance</h2>
          ${att.length ? '<div class="chart-box"><canvas id="c-att" aria-label="Attendance per student: present and absent days stacked"></canvas></div>' : '<div class="empty">No students yet.</div>'}
        </div>
        <div class="panel chart-sheet"><div class="chart-head"><h2 style="text-align:left">Faculty - Hours</h2>${totalBadge(`<b>${minToHM(facList.reduce((a, f) => a + f.minutes, 0))}</b> h`, 'Total of all faculty members (a class taken by two counts for each)')}</div>
          ${facList.length ? '<div class="chart-box"><canvas id="c-fac" aria-label="Teaching hours per faculty member"></canvas></div>' : '<div class="empty">No classes logged yet.</div>'}
        </div>
      </div>
      <div class="panel chart-sheet"><div class="chart-head"><h2 style="text-align:left">${esc(state.program)}: Working Days vs Productive Days</h2>${workTotals(d)}</div>
        <div class="chart-box"><canvas id="c-work" aria-label="Working days (attendance taken) and productive days (classes held) per month"></canvas></div>
        <p class="note" style="color:#c9d7e3;margin:8px 0 0">Working days: days attendance was taken. Productive days: days with at least one class (with times) logged.</p>
      </div>
      ${seesAll() && d.checks ? checksPanel(d) : ''}`);
    {
      // Like the legacy Home chart: one pair of columns per month of the batch, numbers on top.
      const ms = d.months;
      chart($('#c-work'), {
        type: 'bar',
        data: { labels: ms.map((m) => m.label.slice(0, 3).toUpperCase() + " '" + m.label.slice(-2)), datasets: [
          { label: 'Working days', data: ms.map((m) => m.workingDays || 0), backgroundColor: '#3D85C6', maxBarThickness: 34 },
          { label: 'Productive days', data: ms.map((m) => m.days), backgroundColor: '#EA4335', maxBarThickness: 34 }
        ] },
        options: {
          maintainAspectRatio: false, layout: { padding: { top: 22 } }, scales: sheetScales(false),
          plugins: { legend: { position: 'bottom', labels: { color: '#ffffff', boxWidth: 12 } }, barLabels: { mode: 'top' },
            tooltip: { callbacks: { title: (it) => ms[it[0].dataIndex].label } } }
        }
      });
    }
    { const cp = $('details.checks-panel'); if (cp) cp.addEventListener('toggle', () => { state.checksOpen = cp.open; }); }
    if (att.length) attendanceChart($('#c-att'), att);
    if (facList.length) facultyChart($('#c-fac'), facList);
    const has = d.months.map((m) => m.minutes > 0 || m.days > 0);
    chart($('#c-hours'), {
      type: 'bar',
      data: { labels: d.months.map((m) => m.label), datasets: [
        { label: 'Hours', data: d.months.map((m, i) => (has[i] ? Math.round(m.minutes / 6) / 10 : null)), backgroundColor: '#00ffff', borderRadius: 3, yAxisID: 'y' },
        { label: 'Class days', type: 'line', data: d.months.map((m, i) => (has[i] ? m.days : null)), borderColor: '#ffff00', backgroundColor: '#ffff00', tension: .3, pointRadius: 3, yAxisID: 'y1' }
      ] },
      options: { maintainAspectRatio: false, layout: { padding: { top: 20 } },
        scales: { y: { beginAtZero: true, grace: '10%', title: { display: true, text: 'hours' } }, y1: { beginAtZero: true, grace: '15%', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'days' } } },
        // Hours inside the top of each column, class days above the yellow points.
        plugins: { legend: { position: 'bottom' }, barLabels: { mode: 'top', inside: true } } }
    });
    chart($('#c-papers'), {
      type: 'bar',
      data: { labels: paperRows.map((p) => p.label), datasets: [{ label: 'Hours', data: paperRows.map((p) => Math.round(p.minutes / 6) / 10), backgroundColor: paperRows.map((p, i) => (p.activity ? '#8fa3b3' : COLORS[i % COLORS.length])), borderRadius: 3 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, layout: { padding: { right: 36 } }, scales: { x: { beginAtZero: true, grace: '8%' } },
        plugins: { legend: { display: false }, barLabels: { mode: 'top' } } }
    });
  }

  /** Total shown in the top-right corner of a chart. */
  function totalBadge(html, title) { return `<div class="chart-total" title="${esc(title || '')}">Total ${html}</div>`; }
  /** Top-right of the Working vs Productive chart: the year's totals and productive days as % of working days. */
  function workTotals(d) {
    const w = d.months.reduce((a, m) => a + (m.workingDays || 0), 0), p = d.months.reduce((a, m) => a + (m.days || 0), 0);
    const pctTxt = w ? `${Math.round(1000 * p / w) / 10}%` : '—';
    return `<div class="work-totals"><span><i style="background:#3D85C6"></i>Working days <b>${w}</b></span>
      <span><i style="background:#EA4335"></i>Productive days <b>${p}</b></span><span class="pct" title="Productive days as a share of working days">${pctTxt}</span></div>`;
  }
  /**
   * Checks and balances: do the totals agree, and which days or classes are missing something?
   * Each check shows ✓ or ⚠ with a count; open it for the dates, each linked to that month's class log.
   */
  function checksPanel(d) {
    const c = d.checks, hm = (m) => minToHM(m);
    const dayLink = (x) => { const [y, mo] = x.date.split('-'); return `<a href="#/log/${y}/${Number(mo)}">${fmtDate(x.date)}</a>`; };
    const itemRow = (x) => `<li>${dayLink(x)}${x.slot ? ` · session ${String(x.slot).padStart(2, '0')}` : ''}${x.what ? ` · ${esc(x.what)}` : ''}${x.minutes ? ` · ${hm(x.minutes)} h` : ''}</li>`;
    const check = (ok, title, detail, list, hint) => `<details class="check ${ok ? 'ok' : 'warn'}"><summary><span class="mark">${ok ? '✓' : '⚠'}</span> ${title}<span class="sect-hint">${detail}</span></summary>
      <div class="sect-body">${hint ? `<p class="note">${hint}</p>` : ''}${list && list.items.length ? `<ul class="check-list">${list.items.map(itemRow).join('')}</ul>${list.count > list.items.length ? `<p class="note">… and ${list.count - list.items.length} more.</p>` : ''}` : (ok ? '<p class="note">Nothing to fix.</p>' : '')}</div></details>`;
    const hrs = c.hours, same = hrs.months === hrs.papersAndActivities;
    const facMin = (d.faculty || []).reduce((a, f) => a + f.minutes, 0);
    // The whole panel is collapsed; its heading says how many checks need attention.
    const warnCount = [!same, c.orphanAttendance && c.orphanAttendance.count, c.workingNoClass.count, c.classNoAttendance.count,
      c.untimed.count, c.noTopic.count, c.noFaculty.count].filter(Boolean).length;
    const status = warnCount ? `<span class="chk-status warn">⚠ ${warnCount} to look at</span>` : '<span class="chk-status ok">✓ all fine</span>';
    return `<details class="panel checks-panel" ${state.checksOpen ? 'open' : ''}><summary><span class="more-arrow">▶</span> Checks and balances ${status}</summary>
      <p class="note" style="margin-top:8px">Every class hour should appear in every total, and every working day should have its classes logged. Open a line to see the dates; click a date to fix it in the class log.</p>
      ${check(same, same ? 'Hours agree' : 'Hours don’t agree', same ? `${hm(hrs.months)} h in "Teaching hours per month" = ${hm(hrs.papersAndActivities)} h in "Hours by paper and activity"` : `${hm(hrs.months)} h per month ≠ ${hm(hrs.papersAndActivities)} h by paper and activity`, c.outsideYear,
        same ? `Faculty hours (${hm(facMin)} h) are not compared: a class taught by two faculty members counts in full for each, and activities without a faculty member are not in that chart.` : 'The difference is classes dated outside this academic year’s months (listed below). Move them to the right date or year.')}
      ${check(!c.workingNoClass.count, 'Working days without a class logged', c.workingNoClass.count ? `${c.workingNoClass.count} day(s): attendance taken, no class (with times) in the log` : 'every working day has classes', c.workingNoClass, 'Students were present but no class or activity is logged, so these hours are missing from every total. Log what was done (class, training, project work, exam, library, …).')}
      ${c.orphanAttendance ? check(!c.orphanAttendance.count, 'Attendance linked to a student', c.orphanAttendance.count ? `${c.orphanAttendance.count} mark(s) belong to no student` : 'every attendance mark belongs to a student', c.orphanAttendance, 'These marks use a student ID that is not in Settings › Students (for example after an ID was changed). Saving Settings › Students links them again when the ID differs only by the year in front.') : ''}
      ${check(!c.classNoAttendance.count, 'Class days without attendance', c.classNoAttendance.count ? `${c.classNoAttendance.count} day(s): classes logged, attendance not taken` : 'attendance taken on every class day', c.classNoAttendance, 'Classes were held but attendance was not marked.')}
      ${check(!c.untimed.count, 'Classes without times', c.untimed.count ? `${c.untimed.count} class(es) count 0 hours` : 'every class has a start and end time', c.untimed, 'Without a start and end time a class adds no hours to any total. Add the times.')}
      ${check(!c.noTopic.count, 'Classes without a topic', c.noTopic.count ? `${c.noTopic.count} class(es)` : 'every class has a topic or activity', c.noTopic, 'Choose the topic, unit or activity, so the hours go to the right paper or activity.')}
      ${check(!c.noFaculty.count, 'Classes without a faculty member or activity', c.noFaculty.count ? `${c.noFaculty.count} class(es)` : 'every class has a faculty member or activity', c.noFaculty, 'Choose who took the class (or the activity, e.g. Seminar, Library), so the Faculty hours are complete.')}
    </details>`;
  }

  // ---------- Class log ----------
  async function viewLog(year, monthNo) {
    const dm = defaultMonth();
    year = Number(year) || dm.year; monthNo = Number(monthNo) || dm.monthNo;
    const d = await cachedLoad('sessions', { program: state.program, year, month: monthNo }, () => viewLog(year, monthNo));
    if (!d) return;
    const bySlot = {};
    d.sessions.forEach((s) => { bySlot[s.date + '|' + s.slot] = s; });
    const slots = state.cfg.slots || 7;
    // Columns shown: the sessions used this month (at least 3 for an admin), plus any the admin added
    // with "+ Add session" (up to the 7 hours of the Weekly Time Table).
    const usedSlots = Math.max(2, ...d.sessions.map((s) => s.slot), isAdmin() ? 3 : 1);
    const showSlots = Math.min(slots, Math.max(usedSlots, state.logSlots || 0));
    const addBtn = isAdmin() && showSlots < slots
      ? `<th class="add-ses no-print"><button class="btn small" type="button" id="log-more" title="Show one more session column (up to ${slots} a day)">+ Add session</button></th>` : '';
    const today = todayDs();
    const cell = (day, k) => {
      const s = bySlot[day.date + '|' + k];
      const cls = ['ses', isAdmin() ? 'editable' : '', day.holiday ? 'hol' : (day.dow === 0 ? 'off' : '')].join(' ');
      if (!s) return `<td class="${cls}" data-date="${day.date}" data-slot="${k}">${isAdmin() ? '<span class="empty-slot">+</span>' : ''}</td>`;
      return `<td class="${cls}" data-date="${day.date}" data-slot="${k}" data-id="${esc(s.id)}">
        ${s.start || s.end ? `<div class="t">${fmtTime(s.start)}–${fmtTime(s.end)}${s.minutes ? ` · ${minToHM(s.minutes)}` : ''}</div>` : ''}
        <div class="tp">${s.kind && s.kind !== 'Lecture' ? `<span class="tag kind-${esc(s.kind.toLowerCase())}">${esc(s.kind)}</span> ` : ''}${esc(s.topicCode ? `(${s.topicCode}) ${s.topic}` : s.topic)}</div>
        ${s.faculty.length ? `<div class="fc">${esc(s.faculty.map((f) => f.name).join(', '))}</div>` : ''}
        ${s.remarks ? `<div class="note">${esc(s.remarks)}</div>` : ''}</td>`;
    };
    setMain(`
      <div class="toolbar">
        <div><h1>Class log</h1><div class="sub">${esc(state.program)} · ${MONTHS[d.monthNo - 1]} ${d.year}: <b>${d.totals.days}</b> class days, <b>${minToHM(d.totals.minutes)}</b> hours${isAdmin() ? ' · click a cell to add or edit a session' : ''}</div></div>
        <div style="flex:1"></div>
        ${monthPicker('log-month', d.year, d.monthNo)}
        <button class="btn" type="button" onclick="window.print()">Print</button>
      </div>
      <div class="table-wrap"><table class="log-grid">
        <thead><tr><th style="width:90px">Date</th>${Array.from({ length: showSlots }, (_, i) => `<th>Session ${String(i + 1).padStart(2, '0')}</th>`).join('')}${addBtn}</tr></thead>
        <tbody>${d.days.map((day) => `<tr>
          <td class="date ${day.holiday ? 'hol' : (day.dow === 0 ? 'off' : '')} ${day.date === today ? 'today' : ''}">${fmtShort(day.date)}${day.holiday ? `<div class="note">${esc(day.holiday.name)}</div>` : ''}</td>
          ${Array.from({ length: showSlots }, (_, i) => cell(day, i + 1)).join('')}${addBtn ? '<td class="add-ses no-print"></td>' : ''}</tr>`).join('')}
          <tr class="total"><td>Total</td><td colspan="${showSlots + (addBtn ? 1 : 0)}">${d.totals.days} days · ${minToHM(d.totals.minutes)} hours · ${d.totals.sessions} sessions</td></tr>
        </tbody>
      </table></div>
      `);
    wireMonthPicker('log-month', '#/log');
    if (!isAdmin()) return;
    const more = $('#log-more');
    if (more) more.onclick = (e) => { e.preventDefault(); state.logSlots = showSlots + 1; viewLog(year, monthNo); };
    $$('.log-grid td.ses.editable').forEach((td) => td.addEventListener('click', () => {
      const s = td.dataset.id ? d.sessions.find((x) => x.id === td.dataset.id) : null;
      // A new session starts when the day's previous session ended (sessions can be longer or shorter than an hour).
      const k = Number(td.dataset.slot);
      const prev = d.sessions.filter((x) => x.date === td.dataset.date && x.slot < k && x.end).sort((a, b) => b.slot - a.slot)[0];
      editSession(s || { date: td.dataset.date, slot: k, start: prev ? prev.end : '' }, () => viewLog(year, monthNo));
    }));
  }

  function editSession(s, done) {
    const fac = state.cfg.faculty;
    const chosen = new Set((s.faculty || []).map((f) => f.abbr));
    const body = `
      <p class="note">${fmtDate(s.date)} · Session ${String(s.slot).padStart(2, '0')}</p>
      <div class="form-grid">
        <div class="field"><label for="s-start">Start time</label><input id="s-start" name="start" type="time" step="300" value="${esc(s.start || '')}"></div>
        <div class="field"><label for="s-end">End time</label><input id="s-end" name="end" type="time" step="300" value="${esc(s.end || '')}"></div>
        <div class="field"><label for="s-slot">Session</label><select id="s-slot" name="slot">${Array.from({ length: state.cfg.slots }, (_, i) => `<option ${i + 1 === s.slot ? 'selected' : ''} value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></div>
        <div class="field"><label for="s-date">Date</label><input id="s-date" name="date" type="date" value="${esc(s.date)}"></div>
      </div>
      <div class="form-grid" style="margin-top:12px;grid-template-columns:${isSemester() ? '170px 1fr' : '1fr'}">
        ${isSemester() ? `<div class="field"><label for="s-kind">Type of class</label><select id="s-kind" name="kind">${(state.cfg.sessionKinds || ['Lecture', 'Tutorial', 'Practical', 'Exam', 'Other']).map((k) => `<option ${k === (s.kind || 'Lecture') ? 'selected' : ''}>${k}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="s-topic">${isSemester() ? 'Unit / experiment' : 'Topic'}</label><select id="s-topic" name="topicCode">${topicOptions(s.topicCode || '')}</select></div>
      </div>
      <div class="field" style="margin-top:12px"><label>Faculty / activity (choose one or more)</label>
        <div class="check-list">${fac.map((f) => `<label><input type="checkbox" name="fac" value="${esc(f.abbr)}" ${chosen.has(f.abbr) ? 'checked' : ''}> (${esc(f.abbr)}) ${esc(f.name)}</label>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><label for="s-remarks">Remarks (optional)</label><input id="s-remarks" name="remarks" maxlength="500" value="${esc(s.remarks || '')}"></div>`;
    formDialog({
      title: s.id ? 'Edit session' : 'Add session', body,
      onSave: async (f) => {
        const session = {
          id: s.id, program: state.program, date: f.date.value, slot: Number(f.slot.value), start: f.start.value, end: f.end.value,
          topicCode: f.topicCode.value, topic: s.topicCode ? '' : (s.topic || ''), faculty: $$('input[name=fac]:checked', f).map((x) => x.value), remarks: f.remarks.value,
          kind: f.kind ? f.kind.value : (s.kind || '')
        };
        const res = await write('saveSession', { session });
        if (res) { toast('Session saved.'); done(); return true; }
      },
      onDelete: s.id ? async () => {
        if (!(await confirmBox('Delete session', `Delete session ${s.slot} on ${fmtDate(s.date)}?`, 'Delete'))) return false;
        await write('deleteSession', { id: s.id });
        toast('Session deleted.'); done(); return true;
      } : null
    });
  }

  // ---------- Attendance ----------
  async function viewAttendance(year, monthNo) {
    const dm = defaultMonth();
    year = Number(year) || dm.year; monthNo = Number(monthNo) || dm.monthNo;
    const d = await cachedLoad('attendance', { program: state.program, year, month: monthNo }, () => viewAttendance(year, monthNo));
    if (!d) return;
    const pending = new Map();   // "date|studentId" -> status
    const today = todayDs();
    setMain(`
      <div class="toolbar">
        <div><h1>Attendance</h1><div class="sub">${esc(state.program)} · ${MONTHS[d.monthNo - 1]} ${d.year} · P present, A absent, L leave${isAdmin() ? ' · click a cell to change it, then Save' : ''}</div></div>
        <div style="flex:1"></div>
        ${monthPicker('att-month', d.year, d.monthNo)}
        ${isAdmin() ? `<button class="btn" type="button" id="att-fill">Mark class days present</button>
          <button class="btn primary" type="button" id="att-save" disabled>Save</button>` : ''}
        <button class="btn" type="button" onclick="window.print()">Print</button>
      </div>
      <div class="table-wrap"><table class="att-grid">
        <colgroup><col class="c-name">${d.days.map(() => '<col>').join('')}<col class="c-n"><col class="c-n"><col class="c-n"><col class="c-pct"><col class="c-pct"></colgroup>
        <thead><tr><th>Student</th>${d.days.map((x) => `<th class="day ${x.holiday ? 'hol' : (x.dow === 0 ? 'off' : '')}" title="${esc(x.holiday ? x.holiday.name : '')}">${parseDs(x.date).getDate()}<br>${DOW[x.dow].slice(0, 2)}</th>`).join('')}
          <th class="num">P</th><th class="num">A</th><th class="num">L</th><th class="num" title="This month">Month</th><th class="num" title="Whole batch so far">Overall</th></tr></thead>
        <tbody>${d.students.map((s) => `<tr data-sid="${esc(s.id)}"><td class="tech">${esc(s.name)}</td>
          ${d.days.map((x) => { const v = s.marks[x.date] || ''; return `<td class="mark m-${v} ${isAdmin() ? 'editable' : ''} ${x.holiday ? 'hol' : (x.dow === 0 ? 'off' : '')} ${x.date === today ? 'today' : ''}" data-date="${x.date}" title="${fmtDate(x.date)}${x.classDay ? ' · class day' : ''}">${v}</td>`; }).join('')}
          <td class="num">${s.month.P}</td><td class="num">${s.month.A}</td><td class="num">${s.month.L}</td><td class="num">${pct(s.month.pct)}</td><td class="num grand">${pct(s.overall.pct)}</td></tr>`).join('') || `<tr><td colspan="${d.days.length + 6}" class="empty">No students.</td></tr>`}
        </tbody>
      </table></div>
      <p class="note">Shaded columns: Sundays and RCC holidays. Days with a logged class are marked “class day” in the tooltip.</p>
      ${d.students.length ? `<div class="panel chart-sheet" style="margin-top:16px"><h2>Attendance — ${MONTHS[d.monthNo - 1]} ${d.year}</h2><div class="chart-box"><canvas id="c-att-month" aria-label="Attendance this month per student"></canvas></div></div>` : ''}`);
    wireMonthPicker('att-month', '#/attendance');
    if (d.students.length) attendanceChart($('#c-att-month'), d.students.map((s) => ({ name: s.name, ...s.month })));
    if (!isAdmin()) return;
    const saveBtn = $('#att-save');
    const setCell = (td, v) => {
      const sid = td.parentNode.dataset.sid, key = td.dataset.date + '|' + sid;
      const orig = (d.students.find((s) => s.id === sid).marks[td.dataset.date]) || '';
      td.textContent = v; td.className = td.className.replace(/\bm-\w*\b/, '') + ` m-${v}`;
      if (v === orig) { pending.delete(key); td.classList.remove('changed'); } else { pending.set(key, v); td.classList.add('changed'); }
      saveBtn.disabled = !pending.size; saveBtn.textContent = pending.size ? `Save (${pending.size})` : 'Save';
    };
    $$('.att-grid td.mark.editable').forEach((td) => td.addEventListener('click', () => {
      const cur = td.textContent.trim();
      setCell(td, ATT_CYCLE[(ATT_CYCLE.indexOf(cur) + 1) % ATT_CYCLE.length]);
    }));
    $('#att-fill').onclick = () => {
      const classDays = new Set(d.days.filter((x) => x.classDay).map((x) => x.date));
      if (!classDays.size) return toast('No classes are logged this month yet.', true);
      $$('.att-grid td.mark.editable').forEach((td) => { if (classDays.has(td.dataset.date) && !td.textContent.trim()) setCell(td, 'P'); });
    };
    saveBtn.onclick = async () => {
      const changes = [...pending].map(([k, status]) => { const [date, studentId] = k.split('|'); return { date, studentId, status }; });
      saveBtn.disabled = true;
      try {
        const res = await write('saveAttendance', { program: state.program, changes });
        if (res) { toast(`Saved ${res.saved} change(s).`); viewAttendance(year, monthNo); }
      } catch (e) { saveBtn.disabled = false; }
    };
  }

  // ---------- Syllabus ----------
  async function viewSyllabus(filter) {
    const d = await cachedLoad('syllabus', { program: state.program }, () => viewSyllabus(filter));
    if (!d) return;
    if (d.curriculum && d.curriculum !== 'DRP-YEARLY') return viewSemesterSyllabus(d, filter);
    const q = String(filter || '').toLowerCase();
    const groups = d.papers.map((p) => ({ p, topics: d.topics.filter((t) => t.paper === p.code) }));
    const other = d.topics.filter((t) => !d.papers.some((p) => p.code === t.paper) && t.minutes);
    if (other.length) groups.push({ p: { code: 'Other', title: 'Other activities', short: 'OTHER' }, topics: other });
    const match = (t) => !q || (t.code + ' ' + t.name + ' ' + t.lines.join(' ')).toLowerCase().includes(q);
    const total = d.topics.reduce((a, t) => a + t.minutes, 0);
    setMain(`
      <div class="toolbar">
        <div><h1>Syllabus</h1><div class="sub">${esc(state.program)} · ${d.topics.filter((t) => t.minutes && d.papers.some((p) => p.code === t.paper)).length} of ${d.topics.filter((t) => d.papers.some((p) => p.code === t.paper)).length} topics taught · ${minToHM(total)} hours logged · course hours: theory ${fmt(d.hours.theory)}, practical ${fmt(d.hours.practical)}, project ${fmt(d.hours.project)}</div></div>
        <div style="flex:1"></div>
        <div class="field" style="min-width:260px"><label for="syl-q">Search topics</label><input id="syl-q" type="search" value="${esc(filter || '')}" placeholder="e.g. IMRT, dosimetry, TRS 398"></div>
      </div>
      ${groups.map(({ p, topics }) => {
        const shown = topics.filter(match);
        if (q && !shown.length) return '';
        const mins = topics.reduce((a, t) => a + t.minutes, 0);
        return `<details class="sect" ${q ? 'open' : ''}><summary>${esc(p.code)} — ${esc(p.title)}<span class="sect-hint">${topics.filter((t) => t.minutes).length}/${topics.length} topics · ${minToHM(mins)} h</span></summary>
          <div class="sect-body">${shown.map((t) => {
            const maxMin = Math.max(...topics.map((x) => x.minutes), 1);
            return `<details class="topic" ${q && t.lines.some((l) => l.toLowerCase().includes(q)) ? 'open' : ''}><summary>
              <span class="tag code">${esc(t.code)}</span><b>${esc(t.name)}</b>
              <span class="bar" title="${minToHM(t.minutes)} h"><div style="width:${Math.round(100 * t.minutes / maxMin)}%"></div></span>
              <span class="note">${t.sessions ? `${t.sessions} session${t.sessions === 1 ? '' : 's'} · ${minToHM(t.minutes)} h · last ${fmtDate(t.last)}` : 'not taught yet'}</span></summary>
              ${t.lines.length ? `<ul>${t.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
              ${t.faculty.length ? `<p class="note" style="margin:4px 0 0 22px">Taught by: ${esc(t.faculty.map((a) => (state.cfg.faculty.find((f) => f.abbr === a) || { name: a }).name).join(', '))}</p>` : ''}
            </details>`;
          }).join('') || '<p class="note">No topics.</p>'}</div></details>`;
      }).join('') || '<div class="empty">No syllabus yet. An admin can import it in Settings › Import.</div>'}`);
    const inp = $('#syl-q');
    let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { history.replaceState(null, '', '#/syllabus/' + encodeURIComponent(inp.value)); viewSyllabus(inp.value).then(() => { const i = $('#syl-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); };
  }

  /**
   * Semester curriculum: Semester → course (type, credits, marks, planned vs taught lecture /
   * tutorial / practical hours, official figure) → units with planned and taught hours and the
   * syllabus text; practical experiments with the date last done.
   */
  function viewSemesterSyllabus(d, filter) {
    const q = String(filter || '').toLowerCase();
    const h = (m) => Math.round((m || 0) / 6) / 10;            // minutes → hours (1 decimal)
    const pctBar = (done, plan) => { const p = plan ? Math.min(100, Math.round(100 * done / plan)) : 0; return `<span class="bar" title="${p}%"><div style="width:${p}%;${p >= 100 ? 'background:var(--ok)' : ''}"></div></span>`; };
    const cell = (done, plan) => plan ? `<b class="${done >= plan ? 'ok-num' : ''}">${fmt(h(done))}</b><span class="note"> / ${fmt(plan)} h</span>` : (done ? `<b>${fmt(h(done))}</b> h` : '<span class="zero">—</span>');
    const match = (t) => !q || (t.code + ' ' + t.name + ' ' + t.lines.join(' ')).toLowerCase().includes(q);
    const sems = [...new Set(d.papers.map((p) => p.semester || 0))].sort();
    const course = (p) => {
      const units = d.topics.filter((t) => t.paper === p.code && t.active !== false);
      const shown = units.filter(match);
      if (q && !shown.length && !(p.code + ' ' + p.title).toLowerCase().includes(q)) return '';
      const tk = p.taught || {}, lec = tk.Lecture || 0, tut = tk.Tutorial || 0, pr = tk.Practical || 0;
      const planned = (p.lectures + p.tutorials) * 60 || p.practicals * 60, done = (p.practicals ? pr : lec + tut);
      return `<details class="sect" ${q ? 'open' : ''}><summary><span class="tag code">${esc(p.short || p.code)}</span>${esc(p.title)}
          <span class="sect-hint">${pctBar(done, planned)} ${fmt(h(done))} / ${fmt(planned / 60)} h</span></summary>
        <div class="sect-body">
          <div class="table-wrap" style="margin-bottom:10px"><table class="fit"><thead><tr><th>Type</th><th>Credits</th><th>Marks (internal + external)</th><th>Lectures</th><th>Tutorials</th><th>Practical</th><th>Official (curriculum)</th></tr></thead>
            <tbody><tr><td>${esc(p.type)}</td><td class="num">${p.credits}</td><td class="num">${p.internal} + ${p.external || '—'}</td>
              <td class="num">${cell(lec, p.lectures)}</td><td class="num">${cell(tut, p.tutorials)}</td><td class="num">${cell(pr, p.practicals)}</td><td class="num">${esc(p.official)} h</td></tr></tbody></table></div>
          ${p.notes ? `<p class="note">Teaching sessions (lectures+tutorials before Internal-1 / Internal-2 / Model): ${esc(p.notes)}</p>` : ''}
          ${shown.map((t) => `<details class="topic" ${q && t.lines.some((l) => l.toLowerCase().includes(q)) ? 'open' : ''}><summary>
              <span class="tag code">${esc(t.code)}</span><b>${esc(t.name)}</b>
              ${t.planLectures || t.planTutorials ? `${pctBar(t.minutes, (t.planLectures + t.planTutorials) * 60)}<span class="note">${fmt(h((t.byKind || {}).Lecture))}/${t.planLectures} L · ${fmt(h((t.byKind || {}).Tutorial))}/${t.planTutorials} T</span>` : ''}
              <span class="note">${t.sessions ? `${t.sessions} session${t.sessions === 1 ? '' : 's'} · ${minToHM(t.minutes)} h · last ${fmtDate(t.last)}` : (t.kind === 'Experiment' ? 'not done yet' : 'not taught yet')}</span></summary>
              ${t.lines.length ? `<p style="margin:6px 0 4px 22px;color:var(--muted)">${t.lines.map(esc).join('<br>')}</p>` : ''}
              ${t.faculty.length ? `<p class="note" style="margin:4px 0 0 22px">Taught by: ${esc(t.faculty.map((a) => (state.cfg.faculty.find((f) => f.abbr === a) || { name: a }).name).join(', '))}</p>` : ''}
            </details>`).join('') || (units.length ? '' : '<p class="note">No units listed for this course.</p>')}
        </div></details>`;
    };
    const semTotals = (sem) => {
      const ps = d.papers.filter((p) => (p.semester || 0) === sem && ['Core', 'Elective', 'Lab'].includes(p.type));
      return { credits: ps.reduce((a, p) => a + p.credits, 0), hours: ps.reduce((a, p) => a + p.lectures + p.tutorials + p.practicals, 0),
        done: ps.reduce((a, p) => a + Object.values(p.taught || {}).reduce((x, y) => x + y, 0), 0) };
    };
    setMain(`
      <div class="toolbar">
        <div><h1>Syllabus</h1><div class="sub">${esc(d.curriculumLabel)} · academic year ${esc(year().id)} · planned hours from RCC's class schedule; the curriculum's official hours are shown for reference</div></div>
        <div style="flex:1"></div>
        <div class="field" style="min-width:260px"><label for="syl-q">Search units</label><input id="syl-q" type="search" value="${esc(filter || '')}" placeholder="e.g. Monte Carlo, IMRT, Python"></div>
      </div>
      ${sems.map((sem) => { const t = semTotals(sem); const body = d.papers.filter((p) => (p.semester || 0) === sem).map(course).join('');
        // Each semester is collapsed until opened (open while searching; stays open once opened).
        const open = filter || (state.semOpen && state.semOpen.has(sem));
        return body ? `<details class="sect sem-sect" data-sem="${sem}" ${open ? 'open' : ''}><summary>Semester ${sem === 1 ? 'I' : sem === 2 ? 'II' : sem}<span class="sect-hint">${t.credits} credits · ${fmt(h(t.done))} of ${fmt(t.hours)} planned hours taught</span></summary><div class="sect-body">${body}</div></details>` : ''; }).join('')
        || '<div class="empty">No courses for this academic year’s curriculum.</div>'}`);
    state.semOpen = state.semOpen || new Set();
    $$('details.sem-sect').forEach((det) => det.addEventListener('toggle', () => {
      if (filter) return;
      const k = Number(det.dataset.sem);
      if (det.open) state.semOpen.add(k); else state.semOpen.delete(k);
    }));
    const inp = $('#syl-q');
    let tm; inp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { history.replaceState(null, '', '#/syllabus/' + encodeURIComponent(inp.value)); viewSyllabus(inp.value).then(() => { const i = $('#syl-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); };
  }

  // ---------- Exams ----------
  async function viewExams() {
    const d = await cachedLoad('exams', { program: state.program }, viewExams);
    if (!d) return;
    const series = [...new Set(d.exams.map((e) => e.series))];
    const scoreCell = (e, sid) => {
      const s = e.scores[sid];
      return s && s.score !== '' ? `<td class="num">${fmt(s.score)}<span class="note"> (${Math.round(100 * s.score / (e.maxMarks || 100))}%)</span></td>` : '<td class="num zero">—</td>';
    };
    setMain(`
      <div class="toolbar">
        <div><h1>Internal exams</h1><div class="sub">${esc(state.program)} · ${d.exams.length} paper sitting(s)${isAdmin() ? ' · click a row to enter marks' : ''}</div></div>
        <div style="flex:1"></div>
        ${isAdmin() ? '<button class="btn primary" type="button" id="ex-add">Add exam paper</button>' : ''}
      </div>
      ${series.map((sr) => {
        const rows = d.exams.filter((e) => e.series === sr);
        // Collapsed until opened; an exam opened by the user stays open while they enter marks.
        const dates = rows.map((e) => e.date).filter(Boolean).sort();
        const span = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`) : 'dates not set';
        return `<details class="sect exam-sect" data-series="${esc(sr)}" ${state.examOpen && state.examOpen.has(sr) ? 'open' : ''}><summary>${esc(sr)}<span class="sect-hint">${rows.length} paper(s) · ${span}</span></summary><div class="sect-body"><div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Paper</th><th>Title</th><th class="num">Max</th>${d.students.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}${isAdmin() ? '<th></th>' : ''}</tr></thead>
          <tbody>${rows.map((e) => `<tr class="${isAdmin() ? 'clickable' : ''}" data-id="${esc(e.id)}"><td>${fmtDate(e.date)}</td><td>${esc(e.paper)}</td><td class="wrap">${esc(e.title)}</td><td class="num">${e.maxMarks}</td>
            ${d.students.map((s) => scoreCell(e, s.id)).join('')}${isAdmin() ? '<td><button class="btn small" type="button" data-edit>Edit</button></td>' : ''}</tr>`).join('')}
            <tr class="total"><td colspan="3">Total</td><td class="num">${rows.reduce((a, e) => a + e.maxMarks, 0)}</td>${d.students.map((s) => {
              const got = rows.filter((e) => e.scores[s.id] && e.scores[s.id].score !== '');
              const sum = got.reduce((a, e) => a + Number(e.scores[s.id].score), 0), max = got.reduce((a, e) => a + e.maxMarks, 0);
              return `<td class="num">${got.length ? `${fmt(sum)} (${Math.round(100 * sum / max)}%)` : '—'}</td>`;
            }).join('')}${isAdmin() ? '<td></td>' : ''}</tr></tbody></table></div></div></details>`;
      }).join('') || '<div class="empty">No exams scheduled yet.</div>'}`);
    state.examOpen = state.examOpen || new Set();
    $$('details.exam-sect').forEach((det) => det.addEventListener('toggle', () => {
      if (det.open) state.examOpen.add(det.dataset.series); else state.examOpen.delete(det.dataset.series);
    }));
    if (!isAdmin()) return;
    $('#ex-add').onclick = () => editExam({ series: series[series.length - 1] || 'Internal 1', maxMarks: 100 });
    $$('tr.clickable').forEach((tr) => tr.addEventListener('click', (ev) => {
      const e = d.exams.find((x) => x.id === tr.dataset.id);
      if (ev.target.closest('[data-edit]')) editExam(e); else editScores('Exam', e, d.students, e.maxMarks, viewExams);
    }));
  }
  function editExam(e) {
    const papers = curPapers();
    formDialog({
      title: e.id ? 'Edit exam paper' : 'Add exam paper',
      body: `<div class="form-grid">
        <div class="field"><label for="x-series">Exam</label><input id="x-series" name="series" value="${esc(e.series || '')}" placeholder="Internal 1" required></div>
        <div class="field"><label for="x-date">Date</label><input id="x-date" name="date" type="date" value="${esc(e.date || '')}"></div>
        <div class="field"><label for="x-paper">Paper</label><select id="x-paper" name="paper"><option value="">—</option>${papers.map((p) => `<option ${p.code === e.paper ? 'selected' : ''} value="${esc(p.code)}">${esc(p.code)} — ${esc(p.title)}</option>`).join('')}</select></div>
        <div class="field"><label for="x-max">Maximum marks</label><input id="x-max" name="maxMarks" type="number" min="1" value="${esc(e.maxMarks || 100)}"></div>
      </div>
      <div class="field" style="margin-top:12px"><label for="x-title">Title (defaults to the paper title)</label><input id="x-title" name="title" value="${esc(e.title || '')}"></div>`,
      onSave: async (f) => {
        const res = await write('saveExam', { exam: { id: e.id, program: state.program, series: f.series.value, date: f.date.value, paper: f.paper.value, title: f.title.value, maxMarks: Number(f.maxMarks.value) } });
        if (res) { toast('Exam saved.'); viewExams(); return true; }
      },
      onDelete: e.id ? async () => {
        if (!(await confirmBox('Delete exam paper', `Delete ${e.series} · ${e.paper} and all its marks?`, 'Delete'))) return false;
        await write('deleteExam', { id: e.id }); toast('Deleted.'); viewExams(); return true;
      } : null
    });
  }
  function editScores(refType, ref, studs, max, done, asStars) {
    formDialog({
      title: asStars ? 'Star rating' : 'Enter marks',
      body: `<p class="note">${esc(ref.series ? `${ref.series} · ${ref.paper} ${ref.title}` : ref.title)}${asStars ? '' : ` · out of ${max}`}</p>
        <div class="table-wrap"><table class="edit"><thead><tr><th>Student</th><th>${asStars ? 'Stars (1–5)' : 'Marks'}</th><th>Remarks</th></tr></thead><tbody>
        ${studs.map((s) => { const v = ref.scores[s.id] || {}; return `<tr><td class="tech">${esc(s.name)}</td>
          <td><input name="score-${esc(s.id)}" type="number" min="0" max="${max}" step="${asStars ? 1 : 0.5}" value="${esc(v.score ?? '')}" aria-label="${asStars ? 'Stars' : 'Marks'} for ${esc(s.name)}"></td>
          <td><input name="rem-${esc(s.id)}" maxlength="300" value="${esc(v.remarks || '')}" aria-label="Remarks for ${esc(s.name)}"></td></tr>`; }).join('')}
        </tbody></table></div><p class="note">Leave a box empty to clear that mark.</p>`,
      onSave: async (f) => {
        const scores = {};
        studs.forEach((s) => { scores[s.id] = { score: f['score-' + s.id].value, remarks: f['rem-' + s.id].value }; });
        const res = await write('saveScores', { refType, refId: ref.id, scores });
        if (res) { toast('Saved.'); done(); return true; }
      }
    });
  }

  // ---------- Class tests & assignments ----------
  async function viewTasks(kind) {
    const isAsg = kind === 'Assignment';
    const rerender = () => viewTasks(kind);
    const d = await cachedLoad('tasks', { program: state.program, kind }, rerender);
    if (!d) return;
    setMain(`
      <div class="toolbar">
        <div><h1>${isAsg ? 'Assignments' : 'Class tests'}</h1><div class="sub">${esc(state.program)} · ${d.tasks.length} item(s)${isAsg ? ' · rated 1–5 stars' : ''}${isAdmin() ? ` · click a row to enter ${isAsg ? 'ratings' : 'marks'}` : ''}</div></div>
        <div style="flex:1"></div>
        ${isAdmin() ? `<button class="btn primary" type="button" id="t-add">Add ${isAsg ? 'assignment' : 'class test'}</button>` : ''}
      </div>
      <div class="table-wrap"><table class="fit">
        <thead><tr><th style="width:50px">#</th><th style="width:100px">Date</th>${isAsg ? '<th style="width:100px">Due</th>' : ''}<th style="width:180px">Subject</th><th>Topic / question</th>${isAsg ? '' : '<th class="num" style="width:50px">Max</th>'}
          ${d.students.map((s) => `<th class="num" style="width:${isAsg ? 110 : 80}px">${esc(s.name)}</th>`).join('')}${isAdmin() ? '<th style="width:60px"></th>' : ''}</tr></thead>
        <tbody>${d.tasks.map((t) => `<tr class="${isAdmin() ? 'clickable' : ''}" data-id="${esc(t.id)}"><td>${esc(t.no)}</td><td>${fmtDate(t.date)}</td>${isAsg ? `<td>${fmtDate(t.dueDate)}</td>` : ''}
          <td class="wrap">${esc(t.topicCode ? `(${t.topicCode}) ${t.topic}` : '')}</td><td class="wrap">${esc(t.title)}${t.details ? `<div class="note" style="white-space:pre-line">${esc(t.details)}</div>` : ''}</td>${isAsg ? '' : `<td class="num">${t.maxMarks}</td>`}
          ${d.students.map((s) => { const v = t.scores[s.id]; return `<td class="num">${v && v.score !== '' ? (isAsg ? stars(v.score) : fmt(v.score)) : '<span class="zero">—</span>'}</td>`; }).join('')}
          ${isAdmin() ? '<td><button class="btn small" type="button" data-edit>Edit</button></td>' : ''}</tr>`).join('') || `<tr><td colspan="${7 + d.students.length}" class="empty">Nothing yet.</td></tr>`}</tbody>
      </table></div>`);
    if (!isAdmin()) return;
    $('#t-add').onclick = () => editTask({ kind, date: todayDs(), maxMarks: isAsg ? 5 : 10 }, rerender);
    $$('tr.clickable').forEach((tr) => tr.addEventListener('click', (ev) => {
      const t = d.tasks.find((x) => x.id === tr.dataset.id);
      if (ev.target.closest('[data-edit]')) editTask(t, rerender); else editScores('Task', t, d.students, t.maxMarks, rerender, isAsg);
    }));
  }
  function editTask(t, done) {
    const isAsg = t.kind === 'Assignment';
    formDialog({
      title: (t.id ? 'Edit ' : 'Add ') + (isAsg ? 'assignment' : 'class test'),
      body: `<div class="form-grid">
        <div class="field"><label for="k-no">No.</label><input id="k-no" name="no" value="${esc(t.no || '')}" placeholder="e.g. 3-1"></div>
        <div class="field"><label for="k-date">Date given</label><input id="k-date" name="date" type="date" value="${esc(t.date || '')}"></div>
        ${isAsg ? `<div class="field"><label for="k-due">Due date</label><input id="k-due" name="dueDate" type="date" value="${esc(t.dueDate || '')}"></div>`
          : `<div class="field"><label for="k-max">Maximum marks</label><input id="k-max" name="maxMarks" type="number" min="1" value="${esc(t.maxMarks || 10)}"></div>`}
      </div>
      <div class="field" style="margin-top:12px"><label for="k-topic">Subject (syllabus topic)</label><select id="k-topic" name="topicCode">${topicOptions(t.topicCode || '')}</select></div>
      <div class="field" style="margin-top:12px"><label for="k-title">Topic / question</label><textarea id="k-title" name="title" rows="2" required>${esc(t.title || '')}</textarea></div>
      <div class="field" style="margin-top:12px"><label for="k-details">Details (optional)</label><textarea id="k-details" name="details" rows="3">${esc(t.details || '')}</textarea></div>`,
      onSave: async (f) => {
        const task = { id: t.id, program: state.program, kind: t.kind, no: f.no.value, date: f.date.value, dueDate: isAsg ? f.dueDate.value : '',
          maxMarks: isAsg ? 5 : Number(f.maxMarks.value), topicCode: f.topicCode.value, title: f.title.value, details: f.details.value };
        const res = await write('saveTask', { task });
        if (res) { toast('Saved.'); done(); return true; }
      },
      onDelete: t.id ? async () => {
        if (!(await confirmBox('Delete', 'Delete this item and all its marks?', 'Delete'))) return false;
        await write('deleteTask', { id: t.id }); toast('Deleted.'); done(); return true;
      } : null
    });
  }

  // ---------- Calendar ----------
  async function viewCalendar() {
    const d = await cachedLoad('calendar', { program: state.program }, viewCalendar);
    if (!d) return;
    setMain(`
      <div class="toolbar no-print"><div><h1>Academic calendar</h1><div class="sub">${esc(state.program)} · academic year ${esc(year().id)} · hover a date for details${isAdmin() ? ' · edit this year’s holidays and events below the calendar' : ''}</div></div>
        <div style="flex:1"></div>${yearLabel()}<button class="btn primary" type="button" id="cal-share" title="Save the calendar as a picture, or share it straight to WhatsApp from a phone">Share / save as image</button><button class="btn" type="button" onclick="window.DrpCalendar.print()" title="Prints on one A3 page, in the same colours">Print / save as PDF (A3)</button></div>
      ${window.DrpCalendar.render(d, { today: todayDs() })}
      ${isAdmin() ? `<div class="no-print" style="margin-top:18px">
        <details class="sect" id="cal-hol"><summary>This year’s RCC holidays<span class="sect-hint">${d.holidays.filter((h) => h.date >= year().start && h.date <= year().end).length} in ${esc(year().id)}</span></summary><div class="sect-body"></div></details>
        <details class="sect" id="cal-ev"><summary>This year’s academic events<span class="sect-hint">${d.events.length} in the key</span></summary><div class="sect-body"></div></details>
      </div>` : ''}`);
    $('#cal-share').onclick = async (e) => {
      const btn = e.currentTarget, label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Preparing image…';
      try {
        const how = await window.DrpCalendar.shareImage($('.acal'), `DRP-Academic-Calendar-${year().id}.png`, `DRP academic calendar ${year().id}`);
        if (how === 'downloaded') toast('Calendar saved as an image (PNG). Attach it in WhatsApp.');
      } catch (err) { toast(err.message || 'Could not create the image.', true); }
      finally { btn.disabled = false; btn.textContent = label; }
    };
    if (!isAdmin()) return;
    const reload = () => { viewCalendar(); };
    const loadMaster = () => guarded(() => API.call('masterData'));
    $('#cal-hol').addEventListener('toggle', async (e) => {
      const det = e.currentTarget; if (!det.open || det.dataset.ready) return; det.dataset.ready = 1;
      const box = $('.sect-body', det); box.innerHTML = '<div class="loading">Loading…</div>';
      const m = await loadMaster(); if (!m) return;
      const y = year();
      const rows = (m.Holidays || []).filter((h) => h.Date >= y.start && h.Date <= y.end).sort((a, b) => a.Date.localeCompare(b.Date));
      renderTable('Holidays', rows, box, { scope: 'year', title: 'Holidays',
        hint: `RCC holidays from ${fmtDate(y.start)} to ${fmtDate(y.end)}, as in this year’s RCC holiday calendar. Closed = red, Compensatory = orange on the calendar. Saving replaces only the holidays in these dates (holidays are shared by every academic year that covers the same dates).`,
        onSaved: reload });
    });
    $('#cal-ev').addEventListener('toggle', async (e) => {
      const det = e.currentTarget; if (!det.open || det.dataset.ready) return; det.dataset.ready = 1;
      const box = $('.sect-body', det); box.innerHTML = '<div class="loading">Loading…</div>';
      const m = await loadMaster(); if (!m) return;
      const rows = (m.Events || []).filter((r) => (r.Batch || '') === state.batch).sort((a, b) => Number(a.No) - Number(b.No));
      const prev = years()[years().findIndex((y) => y.id === state.batch) - 1];
      box.innerHTML = `${!rows.length && prev ? `<div class="warn-box">No academic events for ${esc(state.batch)} yet. <button class="btn small" type="button" id="ev-copy">Copy ${esc(prev.id)}’s events, moved forward one year</button> then adjust the dates below.</div>` : ''}<div id="ev-table"></div>`;
      renderTable('Events', rows, $('#ev-table'), { scope: 'year', title: 'Academic events',
        cols: TABLES.Events.cols.filter((c) => c[0] !== 'Batch'),
        hint: `Numbered key of the ${state.batch} calendar. Dates = optional list (yyyy-mm-dd, comma separated) that replaces Start–End, e.g. exam days only. Saving changes only ${state.batch}.`,
        onSaved: reload });
      const cp = $('#ev-copy');
      if (cp) cp.onclick = async () => { cp.disabled = true; try { const r = await write('copyEvents', {}); if (r) { toast('Copied. Adjust the dates for this year.'); reload(); } } catch (err) { cp.disabled = false; } };
    });
  }

  // ---------- Reports ----------
  async function viewReports(tab = 'monthly', a, b) {
    const tabs = [['monthly', 'Monthly report'], ['card', seesAll() ? 'Student report card' : 'My report card'], ...(isAdmin() ? [['log', 'Reports sent']] : [])];
    const head = `<div class="toolbar no-print" style="gap:6px">${tabs.map(([k, l]) => `<a class="btn ${k === tab ? 'primary' : ''}" href="#/reports/${k}">${l}</a>`).join('')}</div>`;
    if (tab === 'card') return reportCard(head, a);
    if (tab === 'log' && isAdmin()) return reportLog(head);
    return monthlyReport(head, a, b);
  }
  async function monthlyReport(head, year, monthNo) {
    const dm = defaultMonth();
    // Reports are usually prepared for the previous month.
    if (!year) { const i = batchMonths().findIndex((m) => m.key === dm.key); const pm = batchMonths()[Math.max(0, i - 1)] || dm; year = pm.year; monthNo = pm.monthNo; }
    year = Number(year); monthNo = Number(monthNo);
    const d = await cachedLoad('monthlyReport', { program: state.program, year, month: monthNo }, () => monthlyReport(head, year, monthNo));
    if (!d) return;
    const s = state.cfg.settings;
    setMain(`${head}
      <div class="toolbar no-print"><div style="flex:1"></div>${monthPicker('mr-month', d.year, d.monthNo)}<button class="btn" type="button" onclick="window.print()">Print / save as PDF</button></div>
      <div class="report-head"><div class="dept">${esc(s.department)}</div><h2>Monthly Report — ${esc(d.program)}</h2><div>${esc(d.label)} · Academic year ${esc(state.batch || '')}</div>
        ${d.log ? `<div class="note">${esc(d.log.fileName)}${d.log.sent ? ` · sent${d.log.sentOn ? ' on ' + fmtDate(d.log.sentOn) : ''}` : ' · not yet sent'}</div>` : ''}</div>
      <div class="grid kpis print-block">
        <div class="kpi"><div class="label">Total days</div><div class="value">${d.totals.days}</div></div>
        <div class="kpi"><div class="label">Total hours</div><div class="value">${minToHM(d.totals.minutes)}</div></div>
        <div class="kpi"><div class="label">Sessions</div><div class="value">${d.totals.sessions}</div></div>
        <div class="kpi"><div class="label">Holidays</div><div class="value">${d.holidays.length}</div><div class="hint">${d.holidays.map((h) => esc(h.name)).join(', ')}</div></div>
      </div>
      <div class="panel print-block" style="margin-top:16px"><h2>Attendance</h2><div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Student</th><th class="num">T</th><th class="num">P</th><th class="num">A</th><th class="num">L</th><th class="num">%</th></tr></thead>
        <tbody>${d.attendance.map((x, i) => `<tr><td>${i + 1}</td><td class="tech">${esc(x.name)}</td><td class="num">${x.total}</td><td class="num">${x.P}</td><td class="num">${x.A}</td><td class="num">${x.L}</td><td class="num grand">${pct(x.pct)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid two">
        <div class="panel print-block"><h2>Topics covered</h2><div class="table-wrap"><table class="fit">
          <thead><tr><th>Topic</th><th class="num" style="width:70px">Sessions</th><th class="num" style="width:70px">Hours</th></tr></thead>
          <tbody>${d.topics.map((t) => `<tr><td class="wrap">${esc(t.code ? `(${t.code}) ${t.name}` : t.name)}</td><td class="num">${t.sessions}</td><td class="num">${minToHM(t.minutes)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No classes.</td></tr>'}</tbody></table></div></div>
        <div class="panel print-block"><h2>Faculty / activity</h2><div class="table-wrap"><table class="fit">
          <thead><tr><th>Name</th><th class="num" style="width:60px">Days</th><th class="num" style="width:70px">Hours</th></tr></thead>
          <tbody>${d.faculty.map((f) => `<tr><td class="wrap">${esc(f.name)}${f.type === 'Activity' ? ' <span class="tag">activity</span>' : ''}</td><td class="num">${f.days}</td><td class="num">${minToHM(f.minutes)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">—</td></tr>'}</tbody></table></div></div>
      </div>
      <div class="panel"><h2>Class log</h2><div class="table-wrap"><table class="fit">
        <thead><tr><th style="width:105px">Date</th><th style="width:40px">#</th><th style="width:140px">Time</th><th>Topic</th><th>Faculty / activity</th><th class="num" style="width:55px">Hrs</th></tr></thead>
        <tbody>${d.sessions.map((x) => `<tr><td>${fmtShort(x.date)}</td><td>${x.slot}</td><td>${x.start ? `${fmtTime(x.start)}–${fmtTime(x.end)}` : ''}</td><td class="wrap">${esc(x.topicCode ? `(${x.topicCode}) ${x.topic}` : x.topic)}</td><td class="wrap">${esc(x.faculty.map((f) => f.name).join(', '))}</td><td class="num">${minToHM(x.minutes)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No classes logged.</td></tr>'}
          <tr class="total"><td colspan="5">Total</td><td class="num">${minToHM(d.totals.minutes)}</td></tr></tbody></table></div></div>
      <div class="foot">Generated by DRP Manager on ${new Date(d.generatedAt).toLocaleString('en-GB')}</div>`);
    wireMonthPicker('mr-month', '#/reports/monthly');
  }
  async function reportCard(head, studentId) {
    const list = students();
    if (!seesAll()) studentId = state.cfg.me.studentId;
    if (!studentId) studentId = list[0] && list[0].id;
    if (!studentId) { setMain(head + '<div class="empty">No students yet.</div>'); return; }
    const d = await cachedLoad('reportCard', { studentId }, () => reportCard(head, studentId));
    if (!d) return;
    const st = d.student, s = state.cfg.settings;
    const series = [...new Set(d.exams.map((e) => e.series))];
    setMain(`${head}
      <div class="toolbar no-print"><div style="flex:1"></div>
        ${seesAll() ? `<div class="field"><label for="rc-st">Student</label><select id="rc-st">${list.map((x) => `<option value="${esc(x.id)}" ${x.id === studentId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
        <button class="btn" type="button" onclick="window.print()">Print / save as PDF</button></div>
      <div class="report-head"><div class="dept">${esc(s.department)}</div><h2>Report card — ${esc(st.name)}</h2><div>${esc(st.program)} · Batch ${esc(st.batch)}</div></div>
      <div class="grid kpis print-block">
        <div class="kpi"><div class="label">Attendance</div><div class="value">${pct(d.attendance.overall.pct)}</div><div class="hint">${d.attendance.overall.P} present · ${d.attendance.overall.A} absent · ${d.attendance.overall.L} leave</div></div>
        <div class="kpi"><div class="label">Days marked</div><div class="value">${d.attendance.overall.total}</div></div>
        <div class="kpi"><div class="label">Exam papers marked</div><div class="value">${d.exams.filter((e) => e.score != null).length}</div><div class="hint">of ${d.exams.length}</div></div>
        <div class="kpi"><div class="label">Assignments rated</div><div class="value">${d.assignments.filter((t) => t.score != null).length}</div><div class="hint">of ${d.assignments.length}</div></div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="panel print-block"><h2>Personal details</h2><table class="info"><tbody>
          <tr><td class="code">Name</td><td>${esc(st.name)}</td></tr><tr><td class="code">E-mail</td><td>${esc(st.email)}</td></tr>
          <tr><td class="code">Phone</td><td>${esc(st.phone)}</td></tr><tr><td class="code">Guardian</td><td>${esc(st.guardian)}</td></tr>
          <tr><td class="code">Address</td><td>${esc(st.address)}</td></tr></tbody></table></div>
        <div class="panel print-block"><h2>Attendance by month</h2><div class="table-wrap"><table>
          <thead><tr><th>Month</th><th class="num">T</th><th class="num">P</th><th class="num">A</th><th class="num">L</th><th class="num">%</th></tr></thead>
          <tbody>${d.attendance.months.map((m) => `<tr><td>${esc(m.label)}</td><td class="num">${m.total}</td><td class="num">${m.P}</td><td class="num">${m.A}</td><td class="num">${m.L}</td><td class="num">${pct(m.pct)}</td></tr>`).join('')}
            <tr class="total"><td>Total</td><td class="num">${d.attendance.overall.total}</td><td class="num">${d.attendance.overall.P}</td><td class="num">${d.attendance.overall.A}</td><td class="num">${d.attendance.overall.L}</td><td class="num">${pct(d.attendance.overall.pct)}</td></tr></tbody></table></div></div>
      </div>
      ${series.map((sr) => { const rows = d.exams.filter((e) => e.series === sr); const got = rows.filter((e) => e.score != null);
        return `<div class="panel print-block"><h2>${esc(sr)}</h2><div class="table-wrap"><table class="fit">
        <thead><tr><th style="width:105px">Date</th><th style="width:80px">Paper</th><th>Title</th><th class="num" style="width:70px">Marks</th><th class="num" style="width:55px">Out of</th><th class="num" style="width:55px">%</th><th>Remarks</th></tr></thead>
        <tbody>${rows.map((e) => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.paper)}</td><td class="wrap">${esc(e.title)}</td><td class="num">${e.score == null ? '—' : fmt(e.score)}</td><td class="num">${e.maxMarks}</td><td class="num">${e.score == null ? '—' : Math.round(100 * e.score / e.maxMarks) + '%'}</td><td class="wrap">${esc(e.remarks)}</td></tr>`).join('')}
        ${got.length ? `<tr class="total"><td colspan="3">Total</td><td class="num">${fmt(got.reduce((a, e) => a + e.score, 0))}</td><td class="num">${got.reduce((a, e) => a + e.maxMarks, 0)}</td><td class="num">${Math.round(100 * got.reduce((a, e) => a + e.score, 0) / got.reduce((a, e) => a + e.maxMarks, 0))}%</td><td></td></tr>` : ''}</tbody></table></div></div>`; }).join('')}
      <div class="grid two">
        <div class="panel print-block"><h2>Class tests</h2><div class="table-wrap"><table class="fit"><thead><tr><th style="width:105px">Date</th><th>Topic</th><th class="num" style="width:80px">Marks</th></tr></thead>
          <tbody>${d.classTests.map((t) => `<tr><td>${fmtDate(t.date)}</td><td class="wrap">${esc(t.title)}</td><td class="num">${t.score == null ? '—' : `${fmt(t.score)} / ${t.maxMarks}`}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">None yet.</td></tr>'}</tbody></table></div></div>
        <div class="panel print-block"><h2>Assignments</h2><div class="table-wrap"><table class="fit"><thead><tr><th style="width:105px">Due</th><th>Topic</th><th style="width:100px">Rating</th></tr></thead>
          <tbody>${d.assignments.map((t) => `<tr><td>${fmtDate(t.dueDate || t.date)}</td><td class="wrap">${esc(t.title)}</td><td>${t.score == null ? '—' : stars(t.score)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">None yet.</td></tr>'}</tbody></table></div></div>
      </div>
      <div class="foot">Generated by DRP Manager on ${new Date(d.generatedAt).toLocaleString('en-GB')}</div>`);
    const sel = $('#rc-st');
    if (sel) sel.onchange = () => { location.hash = '#/reports/card/' + encodeURIComponent(sel.value); };
  }
  async function reportLog(head) {
    const rows = await cachedLoad('reportLog', { program: state.program }, () => reportLog(head));
    if (!rows) return;
    const cur = defaultMonth().key;
    setMain(`${head}
      <h1>Monthly reports sent</h1><div class="sub">Tick a month once its report has been sent. The file name follows the usual naming convention.</div>
      <div class="table-wrap"><table class="fit"><thead><tr><th style="width:150px">Month</th><th>File name</th><th style="width:90px">Sent?</th><th style="width:150px">Sent on</th><th style="width:110px"></th></tr></thead>
        <tbody>${rows.map((r) => { const k = `${r.year}-${String(r.monthNo).padStart(2, '0')}`; return `<tr>
          <td>${esc(r.label)}</td><td class="wrap">${esc(r.fileName)}</td>
          <td><span class="pill ${r.sent ? 'ok' : (k < cur ? 'miss' : '')}">${r.sent ? 'YES' : 'NO'}</span></td>
          <td>${r.sentOn ? fmtDate(r.sentOn) : ''}</td>
          <td><button class="btn small" type="button" data-y="${r.year}" data-m="${r.monthNo}" data-sent="${r.sent ? 0 : 1}">${r.sent ? 'Mark not sent' : 'Mark sent'}</button></td></tr>`; }).join('')}</tbody></table></div>`);
    $$('[data-sent]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await write('setReportSent', { program: state.program, year: Number(b.dataset.y), monthNo: Number(b.dataset.m), sent: b.dataset.sent === '1' }); reportLog(head); }
      catch (e) { b.disabled = false; }
    }));
  }

  // ---------- Faculty (admin) ----------
  async function viewFaculty(abbr) {
    const d = await cachedLoad('faculty', { program: state.program }, () => viewFaculty(abbr));
    if (!d) return;
    const sel = abbr ? d.faculty.find((f) => f.abbr === abbr) : null;
    if (sel) {
      setMain(`
        <div class="toolbar"><div><h1>${esc(sel.name)}</h1><div class="sub">${esc(sel.type)} · ${esc(sel.abbr)} · ${sel.days} lecture days · ${minToHM(sel.minutes)} hours</div></div>
          <div style="flex:1"></div><a class="btn" href="#/faculty">All faculty</a><button class="btn" type="button" onclick="window.print()">Print</button></div>
        <div class="grid two">
          <div class="panel print-block"><h2>Hours by month</h2><div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">Hours</th></tr></thead>
            <tbody>${d.months.map((m, i) => `<tr><td>${esc(m.label)}</td><td class="num ${sel.months[i] ? '' : 'zero'}">${minToHM(sel.months[i])}</td></tr>`).join('')}</tbody></table></div></div>
          <div class="panel print-block"><h2>Topics</h2><div class="table-wrap"><table class="fit"><thead><tr><th>Topic</th><th class="num" style="width:70px">Hours</th></tr></thead>
            <tbody>${sel.topics.map((t) => `<tr><td class="wrap">(${esc(t.code)}) ${esc(t.name)}</td><td class="num">${minToHM(t.minutes)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">—</td></tr>'}</tbody></table></div></div>
        </div>
        <div class="panel"><h2>Lectures</h2><div class="table-wrap"><table class="fit"><thead><tr><th style="width:40px">#</th><th style="width:120px">Date</th><th class="num" style="width:60px">Hrs</th><th>Topic</th></tr></thead>
          <tbody>${sel.lectures.map((l, i) => `<tr><td>${i + 1}</td><td>${fmtDate(l.date)}</td><td class="num">${minToHM(l.minutes)}</td><td class="wrap">${esc(l.topic)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No lectures logged.</td></tr>'}</tbody></table></div></div>`);
      return;
    }
    setMain(`
      <div class="toolbar"><div><h1>Faculty &amp; activities</h1><div class="sub">${esc(state.program)} · lecture days and hours per month (click a name for details)</div></div>
        <div style="flex:1"></div><button class="btn" type="button" onclick="window.print()">Print</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Type</th><th class="num">Days</th><th class="num">Hours</th>${d.months.map((m) => `<th class="num">${esc(m.label)}</th>`).join('')}</tr></thead>
        <tbody>${d.faculty.filter((f) => f.active || f.minutes).map((f) => `<tr class="clickable" data-abbr="${esc(f.abbr)}"><td class="tech">${esc(f.name)}</td><td>${esc(f.type)}</td><td class="num">${f.days}</td><td class="num grand">${minToHM(f.minutes)}</td>
          ${f.months.map((m) => `<td class="num ${m ? '' : 'zero'}">${m ? minToHM(m) : '–'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    $$('tr[data-abbr]').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/faculty/' + encodeURIComponent(tr.dataset.abbr); }));
  }

  // ---------- Settings ----------
  const TABLES = {
    Batches: { title: 'Academic years', hint: 'One row per academic year (batch), e.g. 2026-2027 with its first and last month. The current year is chosen from today’s date; tick Current only to decide between two overlapping years.', cols: [
      ['ID', 'Academic year', 120], ['Start', 'Starts', 150, 'date'], ['End', 'Ends', 150, 'date'], ['Curriculum', 'Curriculum', 200, 'curriculum'], ['Current', 'Current', 70, 'bool'], ['Notes', 'Notes', 240]] },
    Students: { title: 'Students', hint: 'DRP1 and DRP2 students of every academic year. The ID links a student to their sign-in account; the academic year decides where they appear.', cols: [
      ['ID', 'ID', 90], ['Program', 'Programme', 90, ['DRP1', 'DRP2']], ['Name', 'Name', 180], ['Batch', 'Academic year', 120, 'year'], ['Email', 'E-mail', 200], ['Phone', 'Phone', 120], ['Guardian', 'Guardian', 140], ['Address', 'Address', 200], ['Order', 'Order', 60], ['Active', 'Active', 60, 'bool']] },
    Faculty: { title: 'Faculty / activities', hint: 'Activities (Seminar, Paper Presentation, Online Learning, Exam) are listed with faculty so they can be chosen for a session.', cols: [
      ['Code', 'Code', 70], ['Abbr', 'Abbr.', 70], ['Name', 'Name', 200], ['Type', 'Type', 100, ['Faculty', 'Activity']], ['Email', 'E-mail', 200], ['Phone', 'Phone', 120], ['Order', 'Order', 60], ['Active', 'Active', 60, 'bool']] },
    Papers: { title: 'Papers / courses', hint: 'Papers (yearly scheme) and courses (semester scheme from 2026-27). Curriculum decides which academic years use them. Hours = RCC’s plan; Official = the curriculum’s figure.', cols: [
      ['Curriculum', 'Curriculum', 150, 'curriculum'], ['Program', 'Programme', 80, ['DRP1', 'DRP2']], ['No', 'No.', 50], ['Code', 'Code', 90], ['Title', 'Title', 300], ['Short', 'Short name', 120],
      ['Semester', 'Sem.', 50], ['Type', 'Type', 100, ['', 'Core', 'Elective', 'Lab', 'Training', 'Seminar']], ['Lectures', 'Lect. h', 60], ['Tutorials', 'Tut. h', 60], ['Practicals', 'Pract. h', 60],
      ['Credits', 'Credits', 60], ['Internal', 'Int.', 50], ['External', 'Ext.', 50], ['Official', 'Official', 70], ['Active', 'Active', 60, 'bool'], ['Notes', 'Notes', 200]] },
    Topics: { title: 'Syllabus topics / units', hint: 'Topic codes as used in the class log (e.g. THE01 in the yearly scheme, S1-C1-U1 for a unit and S1-L1-E01 for an experiment in the semester scheme).', cols: [
      ['Curriculum', 'Curriculum', 150, 'curriculum'], ['Code', 'Code', 90], ['Name', 'Name', 300], ['PaperCode', 'Paper / course', 100], ['Subject', 'Subject', 110], ['Kind', 'Kind', 100, ['', 'Unit', 'Experiment']],
      ['Lectures', 'Lect. h', 60], ['Tutorials', 'Tut. h', 60], ['Order', 'Order', 60], ['Active', 'Active', 60, 'bool']] },
    Events: { title: 'Academic calendar events', hint: 'Numbered key of the academic calendar. Dates = optional list (yyyy-mm-dd, comma separated) that replaces Start–End, e.g. exam days only. Colour as #RRGGBB.', cols: [
      ['Batch', 'Academic year', 110, 'year'], ['Program', 'Programme', 80, ['DRP1', 'DRP2']], ['No', 'No.', 50], ['Title', 'Event', 300], ['Start', 'Start', 150, 'date'], ['End', 'End', 150, 'date'], ['Dates', 'Only these dates (optional)', 220], ['Color', 'Colour', 90, 'color'], ['SkipSundays', 'Skip Sundays', 70, 'bool']] },
    Holidays: { title: 'Holidays', hint: 'RCC closed and compensatory holidays (shaded in the class log, attendance and calendar).', cols: [
      ['Date', 'Date', 150, 'date'], ['Name', 'Holiday', 280], ['Type', 'Type', 140, ['Closed', 'Compensatory']]] },
    Settings: { title: 'Application settings', hint: 'General settings. Academic years are set under Academic years.', cols: [['Key', 'Key', 200], ['Value', 'Value', 420]] }
  };

  async function viewSettings() {
    const me = state.cfg.me;
    if (!isAdmin()) {
      setMain(`<h1>Settings</h1>${yearPanel()}<div id="display-box">${displayPanel()}</div>${accountPanel()}`);
      wireYearPicker('set-year');
      wireAccount(); wireDisplay();
      return;
    }
    const d = await cachedLoad('masterData', {}, viewSettings);
    if (!d) return;
    const users = await guarded(() => API.call('users'));
    if (!users) return;
    setMain(`<h1>Settings</h1>
      ${yearPanel()}
      <div id="display-box">${displayPanel()}</div>
      <details class="sect" id="imp-sect"><summary>Import previous records<span class="sect-hint">read-only · every academic year</span></summary><div class="sect-body">
        <p>Copies each academic year's records from the previous version of DRP Manager: students, faculty, syllabus,
        class log, attendance, holidays, exams, class tests, assignments and the report-sent log. The previous records are only read, never changed.
        Re-importing a year never creates duplicates and never touches other years; anything entered or edited in DRP Manager is kept.</p>
        <div id="imp-years"><div class="loading">Loading…</div></div>
        <pre id="imp-out" class="note" style="white-space:pre-wrap" hidden></pre>
      </div></details>
      <details class="sect"><summary>Database<span class="sect-hint">storage used · reload</span></summary><div class="sect-body">
        <div id="storage-box"><div class="loading">Loading…</div></div>
        <p>DRP Manager keeps a fast copy of the database. Changes made in DRP Manager show at once; changes made directly in the
        database show within 6 hours, or straight away after pressing this button.</p>
        <button class="btn" type="button" id="reload-data">Reload data from the database</button>
        <button class="btn" type="button" id="trim-data" title="Removes empty rows and columns; records are never touched">Trim empty rows and columns</button></div></details>
      <details class="sect"><summary>Users<span class="sect-hint">${users.length} account(s)</span></summary><div class="sect-body" id="users-body"></div></details>
      ${Object.keys(TABLES).map((t) => `<details class="sect" data-table="${t}"><summary>${esc(TABLES[t].title)}<span class="sect-hint">${(d[t] || []).length} row(s)</span></summary><div class="sect-body"></div></details>`).join('')}
      ${accountPanel()}`);
    wireAccount(); wireDisplay(); wireYearPicker('set-year');
    renderTable('Batches', (d.Batches || []).slice().sort((a, b) => String(b.ID).localeCompare(String(a.ID))), $('#years-table'), { onSaved: async () => { await refreshConfig(); initYear(); viewSettings(); } });
    renderUsers(users);
    $$('details[data-table]').forEach((det) => det.addEventListener('toggle', () => { if (det.open && !det.dataset.ready) { det.dataset.ready = 1; renderTable(det.dataset.table, d[det.dataset.table] || [], $('.sect-body', det)); } }));
    wireImport();
    $('#trim-data').onclick = async () => {
      if (!(await confirmBox('Trim empty rows and columns', 'Remove the empty columns after each table’s last field and the empty rows after its last record (50 spare rows are kept; more are added automatically when needed)? Records are not touched.', 'Trim'))) return;
      const r = await write('compactStorage', {});
      if (r) { toast(`Trimmed: ${fmt(r.before)} → ${fmt(r.after)} cells (${fmt(r.before - r.after)} freed).`); loadStorage(); }
    };
    const dbSect = $('#storage-box').closest('details');
    dbSect.addEventListener('toggle', () => { if (dbSect.open) loadStorage(); });
    $('#reload-data').onclick = async () => { if ((await write('refreshData', {})) !== undefined) { toast('Data reloaded from the database.'); await refreshConfig(); } };
  }
  /**
   * Settings › Database: storage used. The database holds at most 10 million cells; every table counts
   * its full grid (rows × columns), including empty rows kept ready for new records.
   */
  async function loadStorage() {
    const box = $('#storage-box');
    if (!box) return;
    let st;
    try { st = await API.call('storage'); } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
    const pct = st.pct, level = pct >= 90 ? 'bad' : pct >= 70 ? 'mid' : 'good';
    box.innerHTML = `<div class="storage-head"><b>Storage used:</b> ${fmt(st.used)} of ${fmt(st.limit)} cells <span class="storage-pct ${level}">${pct}%</span></div>
      <div class="storage-bar"><i class="${level}" style="width:${Math.min(100, Math.max(pct, 0.5))}%"></i></div>
      <p class="note">${pct >= 90 ? 'Nearly full: ask the developer to archive old years.' : pct >= 70 ? 'More than 70% used: plan to archive old years.' : 'Plenty of room.'} Each table counts its full size, including empty rows kept ready for new records.</p>
      <details class="more"><summary><span class="more-arrow">▶</span> Show storage by table <span class="note">(${st.tabs.length} tables · click to open)</span></summary><div class="table-wrap"><table class="fit"><thead><tr><th>Table</th><th class="num">Records</th><th class="num">Cells</th><th class="num">Share</th></tr></thead>
        <tbody>${st.tabs.slice().sort((a, b) => b.cells - a.cells).map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${fmt(t.rows)}</td><td class="num">${fmt(t.cells)}</td><td class="num">${st.used ? Math.round(1000 * t.cells / st.used) / 10 : 0}%</td></tr>`).join('')}</tbody></table></div></details>`;
  }
  /** Settings › Import: one row per academic year, Import / Import all, with step-by-step progress. */
  function wireImport() {
    const det = $('#imp-sect'), box = $('#imp-years'), out = $('#imp-out');
    const steps = [['master', 'Students, faculty, syllabus, holidays, report log'], ['sessions', 'Class log'], ['attendance', 'Attendance'], ['assessments', 'Exams, class tests, assignments']];
    const line = (k, v) => `    ${k}: ${typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', ') : v}`;
    let list = [], busy = false;
    const draw = () => {
      box.innerHTML = `<div class="table-wrap"><table class="fit"><thead><tr><th style="width:120px">Academic year</th><th>Source ID</th><th style="width:190px">Last imported</th><th style="width:110px"></th></tr></thead>
        <tbody>${list.map((y, i) => `<tr><td class="tech">${esc(y.year)}</td>
          <td><input data-sheet="${i}" value="${esc(y.sheetId)}" aria-label="Source ID for ${esc(y.year)}" placeholder="source ID"></td>
          <td>${y.lastImport ? esc(new Date(y.lastImport).toLocaleString('en-GB')) : '<span class="note">never</span>'}</td>
          <td><button class="btn small" type="button" data-imp="${i}">Import</button></td></tr>`).join('')}</tbody></table></div>
        <div class="actions"><button class="btn primary" type="button" id="imp-all">Import all years</button></div>`;
      $$('[data-imp]', box).forEach((b) => b.addEventListener('click', () => run([Number(b.dataset.imp)])));
      $('#imp-all').onclick = () => run(list.map((_, i) => i).filter((i) => list[i].sheetId || $(`[data-sheet="${i}"]`, box).value.trim()));
    };
    const load = async () => { const r = await guarded(() => API.call('legacyYears')); if (r) { list = r; draw(); } };
    det.addEventListener('toggle', () => { if (det.open && !list.length) load(); });
    async function run(idx) {
      if (busy || !idx.length) return;
      const names = idx.map((i) => list[i].year).join(', ');
      if (!(await confirmBox('Import previous records', `Import ${names}? Each year takes up to a minute.`, 'Import'))) return;
      busy = true; out.hidden = false;
      $$('button', box).forEach((b) => { b.disabled = true; });
      const log = [];
      try {
        for (const i of idx) {
          const y = list[i], sheet = $(`[data-sheet="${i}"]`, box).value.trim();
          log.push(`${y.year}`);
          for (let k = 0; k < steps.length; k++) {
            const [step, label] = steps[k];
            out.textContent = log.concat(`  Step ${k + 1}/${steps.length}: ${label}…`).join('\n');
            let res;
            try { res = await write('importLegacy', { year: y.year, sourceId: sheet || undefined, step }); }
            catch (e) { log.push(`  Step ${k + 1}/${steps.length}: ${label} — FAILED: ${e.message}`); out.textContent = log.join('\n'); return; }
            if (!res) return;
            log.push(`  Step ${k + 1}/${steps.length}: ${label} — done`);
            Object.entries(res).filter(([key]) => !['notes', 'step', 'academicYear', 'source'].includes(key)).forEach(([key, v]) => log.push(line(key, v)));
            (res.notes || []).forEach((n) => log.push('    Note: ' + n));
            out.textContent = log.join('\n');
          }
        }
        toast('Import finished.');
        await refreshConfig();
        initYear();
        renderBadge();
        await load();
      } finally { busy = false; $$('button', box).forEach((b) => { b.disabled = false; }); }
    }
  }
  function renderUsers(users) {
    const body = $('#users-body');
    const studs = Object.values(state.cfg.students).flat();
    const nameOf = (id) => (studs.find((s) => s.id === id) || {}).name || id;
    const facs = (state.cfg.faculty || []).filter((f) => f.type !== 'Activity');
    const facName = (a) => (facs.find((f) => f.abbr === a) || {}).name || a;
    body.innerHTML = `<div class="table-wrap"><table><thead><tr><th>User name</th><th>Role</th><th>Student / faculty member</th><th>Active</th><th>Last sign-in</th><th></th></tr></thead>
      <tbody>${users.map((u) => `<tr><td class="tech">${esc(u.username)}</td><td>${esc(u.role)}</td><td>${esc(u.studentId ? nameOf(u.studentId) : u.facultyAbbr ? facName(u.facultyAbbr) : '')}</td><td>${u.active ? 'Yes' : 'No'}</td><td>${u.lastLogin ? new Date(u.lastLogin).toLocaleString('en-GB') : '—'}</td>
        <td><button class="btn small" type="button" data-user="${esc(u.username)}">Edit</button></td></tr>`).join('')}</tbody></table></div>
      <div class="actions"><button class="btn primary" type="button" id="user-add">Add user</button></div>
      <p class="note"><b>Students</b> see the shared ${esc(state.program)} class log, syllabus and calendar, and only their own attendance, marks and report card.
      <b>Faculty</b> see everything, including every student's attendance, marks and report card, and their own teaching hours, but cannot change anything.
      <b>Admins</b> see and edit everything.</p>`;
    const edit = (u) => formDialog({
      title: u ? `Edit ${u.username}` : 'Add user',
      body: `<div class="form-grid">
        <div class="field"><label for="u-name">User name</label><input id="u-name" name="username" value="${esc(u ? u.username : '')}" autocapitalize="none" required></div>
        <div class="field"><label for="u-role">Role</label><select id="u-role" name="role"><option value="student" ${u && u.role === 'student' ? 'selected' : ''}>Student</option><option value="faculty" ${u && u.role === 'faculty' ? 'selected' : ''}>Faculty</option><option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Admin</option></select></div>
        <div class="field" data-for="student"><label for="u-st">Student</label><select id="u-st" name="studentId"><option value="">—</option>${studs.map((s) => `<option value="${esc(s.id)}" ${u && u.studentId === s.id ? 'selected' : ''}>${esc(s.name)} (${esc(s.id)}${s.batch ? ', ' + esc(s.batch) : ''})</option>`).join('')}</select></div>
        <div class="field" data-for="faculty"><label for="u-fac">Faculty member</label><select id="u-fac" name="facultyAbbr"><option value="">—</option>${facs.map((f) => `<option value="${esc(f.abbr)}" ${u && u.facultyAbbr === f.abbr ? 'selected' : ''}>${esc(f.name)} (${esc(f.abbr)})</option>`).join('')}</select></div>
        <div class="field"><label for="u-pw">${u ? 'New password (leave empty to keep)' : 'Password'}</label><input id="u-pw" name="password" type="password" autocomplete="new-password" ${u ? '' : 'required'}></div>
      </div>
      <label class="switch-row" style="margin-top:12px"><input type="checkbox" name="active" ${!u || u.active ? 'checked' : ''}> Active (can sign in)</label>`,
      onSave: async (f) => {
        const res = await write('saveUser', { user: { original: u ? u.username : undefined, username: f.username.value, role: f.role.value, studentId: f.studentId.value, facultyAbbr: f.facultyAbbr.value, password: f.password.value, active: f.active.checked } });
        if (!res) return;
        if (res.me) API.setToken(res.me.token, true);
        toast('User saved.'); renderUsers(res.users); return true;
      },
      onDelete: u && u.username !== state.username ? async () => {
        if (!(await confirmBox('Delete user', `Delete the account "${u.username}"?`, 'Delete'))) return false;
        const res = await write('deleteUser', { username: u.username });
        if (res) { toast('Deleted.'); renderUsers(res.users); return true; }
      } : null
    });
    const editUser = (u) => {
      const f = edit(u);
      // Show only the field that matters for the chosen role.
      const sync = () => $$('[data-for]', f).forEach((el) => { el.hidden = el.dataset.for !== f.role.value; });
      f.role.addEventListener('change', sync); sync();
    };
    $('#user-add').onclick = () => editUser(null);
    $$('[data-user]', body).forEach((b) => b.addEventListener('click', () => editUser(users.find((x) => x.username === b.dataset.user))));
  }
  /**
   * Editable table. opts.scope 'year' saves only the selected academic year's part (Calendar page);
   * opts.cols / opts.hint / opts.title override the table's defaults; opts.onSaved(res) after saving.
   */
  function renderTable(table, rows, box, opts = {}) {
    const spec = { ...TABLES[table], ...(opts.cols ? { cols: opts.cols } : {}), ...(opts.hint ? { hint: opts.hint } : {}), ...(opts.title ? { title: opts.title } : {}) };
    const input = (c, v, i) => {
      let [key, label, , type] = c;
      if (type === 'year') { type = years().map((y) => y.id); if (!v) v = state.batch; }
      // Empty = the yearly scheme (as the server reads it); only a row added now starts with the curriculum being viewed.
      if (type === 'curriculum') { type = Object.keys(state.cfg.curricula || { 'DRP-YEARLY': 1 }); if (!v) v = rows[i] && rows[i]._new ? curriculum() : 'DRP-YEARLY'; }
      const name = `${i}.${key}`, aria = `aria-label="${esc(label)} row ${i + 1}"`;
      if (Array.isArray(type)) return `<select name="${name}" ${aria}>${type.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}${v && !type.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>`;
      if (type === 'bool') return `<input type="checkbox" name="${name}" ${v === '' || v === true || String(v).toUpperCase() === 'TRUE' ? 'checked' : ''} ${aria} style="width:auto">`;
      if (type === 'date') return `<input type="date" name="${name}" value="${esc(v)}" ${aria}>`;
      if (type === 'color') return `<input type="color" name="${name}" value="${esc(/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888')}" ${aria} style="padding:2px;min-height:32px">`;
      return `<input name="${name}" value="${esc(v)}" ${aria}>`;
    };
    const draw = () => {
      box.innerHTML = `<p class="note">${esc(spec.hint)}</p>
        <div class="table-wrap"><table class="edit"><thead><tr>${spec.cols.map((c) => `<th style="min-width:${c[2]}px">${esc(c[1])}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr>${spec.cols.map((c) => `<td>${input(c, r[c[0]] ?? '', i)}</td>`).join('')}<td><button class="btn small danger" type="button" data-del="${i}" aria-label="Delete row ${i + 1}">✕</button></td></tr>`).join('')}</tbody></table></div>
        <div class="actions"><button class="btn" type="button" data-add>Add row</button><button class="btn primary" type="button" data-save>Save ${esc(spec.title.toLowerCase())}</button></div>`;
      $('[data-add]', box).onclick = () => { collect(); rows.push({ _new: true }); draw(); };
      $$('[data-del]', box).forEach((b) => b.addEventListener('click', () => { collect(); rows.splice(Number(b.dataset.del), 1); draw(); }));
      $('[data-save]', box).onclick = async () => {
        collect();
        const res = await write('saveConfig', { table, rows, scope: opts.scope });
        if (!res) return;
        toast(`${spec.title} saved.`);
        if (opts.onSaved) { opts.onSaved(res); return; }
        rows = res[table]; draw(); refreshConfig();
      };
    };
    const collect = () => {
      rows = rows.map((r, i) => {
        const o = { ...r };
        spec.cols.forEach(([k, , , type]) => {
          const el = box.querySelector(`[name="${i}.${k}"]`);
          if (el) o[k] = type === 'bool' ? el.checked : el.value;
        });
        return o;
      });
    };
    draw();
  }
  /** Settings › Academic year: which year is shown, and (admins) the list of years. */
  function yearPanel() {
    const y = year();
    return `<details class="sect"><summary>Academic year<span class="sect-hint">${esc(y.id || '')}${y.current ? ' · current' : ''}</span></summary><div class="sect-body">
      <div class="toolbar" style="margin-bottom:6px">${yearPicker('set-year')}
        <p class="note" style="margin:0;align-self:center">${fmtDate(y.start)} – ${fmtDate(y.end)}. Every page shows this academic year. The current year is shown by default each time DRP Manager is opened.</p></div>
      ${isAdmin() ? '<h3 style="margin-top:12px">Academic years</h3><div id="years-table"></div><p class="note">To start a new year: add a row (e.g. 2026-2027 with its first and last month), save, choose it above, then on the Calendar page copy last year’s events and enter that year’s RCC holidays. Add the new students under Students with that academic year.</p>' : ''}
    </div></details>`;
  }
  function accountPanel() {
    return `<details class="sect"><summary>My account<span class="sect-hint">${esc(state.username)}</span></summary><div class="sect-body">
      <form id="acct-form" class="form-grid" autocomplete="off">
        <div class="field"><label for="a-cur">Current password</label><input id="a-cur" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="a-user">New user name (optional)</label><input id="a-user" autocapitalize="none" placeholder="${esc(state.username)}"></div>
        <div class="field"><label for="a-new">New password (optional)</label><input id="a-new" type="password" autocomplete="new-password"></div>
        <div class="field" style="justify-content:end"><button class="btn primary" type="submit">Update account</button></div>
      </form></div></details>`;
  }
  function wireAccount() {
    $('#acct-form').onsubmit = async (e) => {
      e.preventDefault();
      const res = await write('updateMe', { currentPassword: $('#a-cur').value, newUsername: $('#a-user').value.trim() || undefined, newPassword: $('#a-new').value || undefined });
      if (res) { API.setToken(res.token, API.remembered()); state.username = res.username; saveCfg(); renderBadge(); toast('Account updated.'); e.target.reset(); }
    };
  }
  function displayPanel() {
    const P = window.DrpPrefs, f = P.getFont(), w = P.getWidth(), d = P.defaults();
    const name = { default: 'Default (Segoe UI)', courier: 'Courier New', comfortable: 'Comfortable', full: 'Full width' };
    const radio = (group, value, cur, label) => `<label class="choice"><input type="radio" name="${group}" value="${value}" ${value === cur ? 'checked' : ''}> ${label}</label>`;
    return `<details class="sect"><summary>Display<span class="sect-hint">font and page width</span></summary><div class="sect-body">
      <h3>Font</h3>
      <div class="choice-row">${radio('p-font', 'default', f, name.default)}${radio('p-font', 'courier', f, '<span style="font-family:\'Courier New\',Courier,monospace">Courier New</span>')}</div>
      <div class="font-preview ${f}" id="p-preview">Session 01 · 9:00 AM–10:30 AM · (THE01) Beam Therapy · Raghukumar P. · 1:30 h</div>
      <h3 style="margin-top:16px">Page width</h3>
      <div class="choice-row">${radio('p-width', 'comfortable', w, 'Comfortable (centred)')}${radio('p-width', 'full', w, 'Full width (more room for wide tables)')}</div>
      <p class="note" style="margin-top:12px">Your choice is saved on this device. ${P.hasOwnFont() || P.hasOwnWidth() ? '<a href="#" id="p-reset">Use the app default</a>' : 'You are using the app default'} (${name[d.font]}, ${name[d.width].toLowerCase()}).</p>
      ${isAdmin() ? `<div class="actions" style="margin-top:6px"><button class="btn" type="button" id="p-default">Make ${name[f]} + ${name[w].toLowerCase()} the default for everyone</button></div>` : ''}
    </div></details>`;
  }
  /** Re-draws only the Display panel after a change, without jumping to the top. */
  function redrawDisplay() {
    const y = window.scrollY, box = $('#display-box');
    if (box) { box.innerHTML = displayPanel(); const det = $('details', box); if (det) det.open = true; wireDisplay(); }
    window.scrollTo(0, y);
  }
  function wireDisplay() {
    const P = window.DrpPrefs;
    $$('input[name=p-font]').forEach((r) => r.addEventListener('change', () => { P.setFont(r.value); redrawDisplay(); }));
    $$('input[name=p-width]').forEach((r) => r.addEventListener('change', () => { P.setWidth(r.value); redrawDisplay(); }));
    const reset = $('#p-reset');
    if (reset) reset.onclick = (e) => { e.preventDefault(); P.setFont('app'); P.setWidth('app'); redrawDisplay(); };
    const def = $('#p-default');
    if (def) def.onclick = async () => {
      def.disabled = true;
      try {
        const res = await write('setAppDefaults', { font: P.getFont(), width: P.getWidth() });
        if (res) {
          state.cfg.settings.defaultFont = res.defaultFont; state.cfg.settings.defaultWidth = res.defaultWidth; saveCfg();
          P.setDefaults(res.defaultFont, res.defaultWidth);
          toast('Saved as the default for everyone. Anyone who picked their own font keeps it.');
          redrawDisplay();
        }
      } catch (e) { /* toast shown */ } finally { def.disabled = false; }
    };
  }

  // ---------- Help ----------
  function viewHelp() {
    setMain('<div id="help-root"></div>');
    window.DrpHelp.render($('#help-root'), { version: (state.cfg.release || {}).version, date: (state.cfg.release || {}).date });
  }

  // ---------- start ----------
  (async function boot() {
    $('#login-version').textContent = 'DRP Manager';
    if (!API.getToken()) return showLogin();
    try {
      const cached = JSON.parse(localStorage.getItem('drp.cfg') || 'null');
      if (cached && cached.cfg) { state.role = cached.role; state.username = cached.username; state.cfg = cached.cfg; initYear(); startApp(); }
    } catch (e) {}
    try {
      const data = await API.call('session');
      applySession(data);
      if ($('#app-view').hidden) startApp(); else { renderBadge(); renderFooter(); }
    } catch (e) {
      if (e.auth || !state.cfg) { logout(); if (!e.auth) toast(e.message, true); }
    }
  })();
})();
