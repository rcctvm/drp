/* DRP Manager — About and user manual (shared by the Help tab and help.html). */
(function () {
  const SECTIONS = [
    ['About', `
      <p><b>DRP Manager</b> runs the Diploma in Radiological Physics (DRP) course of the Division of Radiation Physics,
      Regional Cancer Centre, Thiruvananthapuram. It replaces the <i>DRP Manager</i> Google Sheet: the class log, attendance,
      syllabus coverage, internal exams, class tests, assignments, the academic calendar and the monthly report.</p>
      <p>Server version <span id="about-version">—</span> · released <span id="about-date">—</span>.<br>
      Website <span id="about-build">—</span>.</p>
      <p class="note">The server version changes when the Apps Script code changes; the website stamp changes on every website update.</p>`],
    ['Who sees what', `
      <ul>
        <li><b>Admin</b>: sees and edits everything, manages users, students, faculty, syllabus and holidays, and runs the import.</li>
        <li><b>Student</b>: DRP1 activities are the same for every student, so all DRP1 students see the shared class log,
        syllabus, exam timetable, class tests, assignments and calendar. Attendance, marks, ratings and the report card show
        <b>only the signed-in student's own record</b>. This is enforced by the server, not just hidden in the page.</li>
      </ul>`],
    ['Dashboard', `<p>Class days and teaching hours for the batch, hours per month and per paper, how many syllabus topics have been taught,
      attendance, recent classes and upcoming holidays. Admins also see which monthly reports have not been marked as sent.</p>`],
    ['Class log', `<p>One row per day and up to five sessions per day, as in the old month sheets (OCT, NOV, …). Each session has a start and end time,
      a syllabus topic and one or more faculty members or activities (Seminar, Paper Presentation, Online Learning, Exam).
      Hours are calculated from the times. Sundays and RCC holidays are shaded.</p>
      <p><b>Admins:</b> click an empty cell (+) to add a session, or a filled cell to edit or delete it. Only one session can use each slot on a day.</p>`],
    ['Attendance', `<p>P = present, A = absent, L = leave. Blank means not marked (no class, holiday). The percentage is present ÷ days marked.</p>
      <p><b>Admins:</b> click a cell to cycle P → A → L → blank, then press <b>Save</b>. <b>Mark class days present</b> fills P on every day that has a class logged and no mark yet.</p>`],
    ['Syllabus', `<p>Papers I–VIII with their topics and sub-topics. For each topic you see the number of sessions, hours taught, the date last taught
      and who taught it. Use the search box to find a topic or sub-topic.</p>`],
    ['Exams, class tests and assignments', `<p>Internal exams are grouped by series (Internal 1, 2, 3). Class tests are marked out of a maximum;
      assignments are rated 1–5 stars, as in the old sheet. Admins click a row to enter marks, or <b>Edit</b> to change the details.</p>`],
    ['Calendar', `<p>Every month of the batch with class days, RCC holidays and exam / test / assignment dates. Hover a day for details.</p>`],
    ['Reports', `<ul><li><b>Monthly report</b>: total days and hours, attendance (T, P, A, L, %), topics covered, faculty hours and the full class log for the month. Print or save as PDF.</li>
      <li><b>Report card</b>: one student's details, attendance by month, exam marks, class tests and assignments.</li>
      <li><b>Reports sent</b> (admin): tick each month once the monthly report has been sent.</li></ul>`],
    ['Faculty (admin)', `<p>Lecture days and hours for every faculty member and activity, by month, with the list of lectures and topics, like the old F1…F20 tabs.</p>`],
    ['Settings', `<ul><li><b>Display</b>: choose the font (Default or Courier New) and the page width (Comfortable, centred; or Full width for wide tables). The choice is kept on this device. Admins can make their choice the default for everyone.</li>
      <li><b>Import from the legacy sheet</b> (admin): reads the old DRP Manager sheet (never changes it) and copies its data. Safe to run again. Anything entered or edited in DRP Manager is kept.</li>
      <li><b>Users</b> (admin): add admins and student accounts. Each student account is linked to one student.</li>
      <li><b>Students, Faculty, Papers, Topics, Holidays, Application settings</b> (admin): edit the lists. The batch start and end dates in Application settings decide which months are shown.</li>
      <li><b>My account</b>: change your user name or password.</li></ul>`],
    ['Privacy', `<p>The website holds no data. Everything is stored in the DRP Google Sheet and served by the DRP Apps Script server after you sign in.
      Passwords are stored only as salted hashes. Five wrong passwords lock that user name for 15 minutes.</p>`]
  ];

  function render(root, info) {
    root.innerHTML = `<div style="max-width:960px;margin:0 auto;padding:18px 16px 60px">
      <h1>Help &amp; user manual</h1>
      ${SECTIONS.map(([t, h], i) => `<details class="sect" ${i < 2 ? 'open' : ''}><summary>${t}</summary><div class="sect-body">${h}</div></details>`).join('')}
    </div>`;
    const b = window.DRP_BUILD || {}, bEl = root.querySelector('#about-build');
    if (bEl) bEl.textContent = b.time ? `updated ${new Date(b.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (${b.sha})` : 'development copy';
    if (info && info.version) {
      root.querySelector('#about-version').textContent = 'v' + info.version;
      const d = new Date(info.date + 'T00:00:00');
      root.querySelector('#about-date').textContent = isNaN(d) ? (info.date || '—') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  window.DrpHelp = { render };
})();
