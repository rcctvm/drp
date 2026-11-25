/* Academic calendar drawn in the format and colours of "DRP Manager - Calendar.pdf"
 * (ToolBox): navy title bar with the RCC logo, four months per row (steel-blue month bar, black
 * weekday row, blue Sunday column, white day cells), dates coloured by academic event, closed
 * holidays red and compensatory holidays orange, a numbered key, and the HOLIDAYS tables. */
(function () {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HOL_COLOR = { Closed: '#FF0000', Compensatory: '#FF9900' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const short = (s) => { const d = parse(s); return `${d.getDate()}-${MONTHS[d.getMonth()].slice(0, 3)}-${String(d.getFullYear()).slice(2)}`; };
  const minToHM = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
  /** Black or white text, whichever reads better on the background colour. */
  function ink(hex) {
    const h = String(hex).replace('#', '');
    if (h.length !== 6) return '#000';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000000' : '#ffffff';
  }

  function render(d, opts) {
    opts = opts || {};
    const today = opts.today || '';
    // Colour of each date: a holiday wins; otherwise the event covering the fewest days (so a
    // 10-day sessional shows on top of a month-long "submission" event).
    const paint = {};
    d.events.slice().sort((a, b) => b.dates.length - a.dates.length).forEach((e) => {
      e.dates.forEach((k) => { paint[k] = { color: e.color, label: `${e.no}) ${e.title}` }; });
    });
    const hol = {};
    d.holidays.forEach((h) => { hol[h.date] = h; paint[h.date] = { color: HOL_COLOR[h.type] || HOL_COLOR.Closed, label: `${h.name} (${h.type.toLowerCase()} holiday)`, hol: true }; });
    const other = {};
    (d.other || []).forEach((o) => { (other[o.date] = other[o.date] || []).push(`${o.kind}: ${o.title}`); });

    const month = (m) => {
      const first = new Date(m.year, m.monthNo - 1, 1), days = new Date(m.year, m.monthNo, 0).getDate();
      const cells = [];
      for (let i = 0; i < first.getDay(); i++) cells.push({ blank: true, dow: i });
      for (let dd = 1; dd <= days; dd++) cells.push({ day: dd, dow: (first.getDay() + dd - 1) % 7, key: `${m.key}-${pad(dd)}` });
      while (cells.length < 42) cells.push({ blank: true, dow: cells.length % 7 });
      const rows = [];
      for (let r = 0; r < 6; r++) {
        rows.push('<tr>' + cells.slice(r * 7, r * 7 + 7).map((c) => {
          const sun = c.dow === 0 ? ' sun' : '';
          if (c.blank) return `<td class="blank${sun}"></td>`;
          const p = paint[c.key], cls = d.classDays[c.key];
          const tip = [p ? p.label : '', cls ? `Class: ${cls.sessions} session(s), ${minToHM(cls.minutes)} h` : '', ...(other[c.key] || [])].filter(Boolean).join('\n');
          const style = p ? ` style="background:${p.color};--ink:${ink(p.color)}"` : '';
          return `<td class="d${sun}${p ? ' painted' : ''}${p && p.hol ? ' hday' : ''}${c.key === today ? ' today' : ''}"${style}${tip ? ` title="${esc(tip)}"` : ''}>${c.day}</td>`;
        }).join('') + '</tr>');
      }
      return `<table class="acal-month"><thead><tr><th colspan="7" class="mname">${MONTHS[m.monthNo - 1]} ${m.year}</th></tr>
        <tr class="wd">${DOW.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    };

    // Key: academic events in two columns, then the two holiday colours.
    const half = Math.ceil(d.events.length / 2);
    const keyRow = (e) => `<div class="krow"><i style="background:${esc(e.color)}"></i><span>${e.no}) ${esc(e.title)}${e.start ? `: ${esc(keyDates(e))}` : ''}</span></div>`;
    function keyDates(e) {
      const a = parse(e.start), z = parse(e.end || e.start);
      const mon = (x) => MONTHS[x.getMonth()].slice(0, 3);
      if (e.start === (e.end || e.start)) return `${pad(a.getDate())}${mon(a)}${a.getFullYear()}`;
      const wholeMonth = a.getDate() === 1 && z.getMonth() === a.getMonth() && z.getDate() === new Date(z.getFullYear(), z.getMonth() + 1, 0).getDate();
      if (wholeMonth) return `${mon(a)} ${a.getFullYear()}`;
      if (a.getMonth() === z.getMonth()) return `${pad(a.getDate())}-${pad(z.getDate())} ${mon(a)} ${a.getFullYear()}`;
      return `${pad(a.getDate())}${mon(a)}–${pad(z.getDate())}${mon(z)} ${z.getFullYear()}`;
    }

    // HOLIDAYS tables, one column per calendar year of the batch.
    const years = [...new Set(d.months.map((m) => m.year))];
    const holTable = (year, type) => {
      const list = d.holidays.filter((h) => h.date.startsWith(year + '-') && h.type === type);
      return `<tr class="hsect"><th colspan="4">${type === 'Closed' ? 'CLOSED HOLIDAYS' : 'COMPENSATORY HOLIDAYS'}</th></tr>
        <tr class="hhead"><th>#</th><th>Date</th><th>Day</th><th>HOLIDAY NAME</th></tr>
        ${list.map((h, i) => `<tr><td>${i + 1}</td><td>${short(h.date)}</td><td>${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parse(h.date).getDay()]}</td><td>${esc(h.name)}</td></tr>`).join('') || '<tr><td colspan="4" class="none">None entered</td></tr>'}`;
    };

    return `<div class="acal">
      <div class="acal-head">
        <div class="acal-logo"><img src="assets/logo.jpg" alt="RCC logo"><span>REGIONAL<br>CANCER<br>CENTRE</span></div>
        <h2>Tentative Academic Calendar : Dip RP&nbsp;&nbsp;${esc(d.admissionYear)}&nbsp;&nbsp;Admission</h2>
      </div>
      <div class="acal-grid">${d.months.map(month).join('')}</div>
      <div class="acal-key">
        <div>${d.events.slice(0, half).map(keyRow).join('')}</div>
        <div>${d.events.slice(half).map(keyRow).join('')}</div>
        <div><div class="krow"><i style="background:${HOL_COLOR.Closed}"></i><span>Closed Holidays</span></div>
          <div class="krow"><i style="background:${HOL_COLOR.Compensatory}"></i><span>Compensatory Holidays</span></div></div>
      </div>
      <div class="acal-holbar">H &nbsp; O &nbsp; L &nbsp; I &nbsp; D &nbsp; A &nbsp; Y &nbsp; S</div>
      <div class="acal-hols">${years.map((y) => `<table><thead><tr class="hyear"><th colspan="4">${y}</th></tr></thead>
        <tbody>${holTable(y, 'Closed')}${holTable(y, 'Compensatory')}</tbody></table>`).join('')}</div>
    </div>`;
  }

  window.DrpCalendar = { render };
})();
