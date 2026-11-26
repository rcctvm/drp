/* DRP Manager — About and user manual (shared by the Help tab and help.html). */
(function () {
  const SECTIONS = [
    ['About', `
      <p><b>DRP Manager</b> runs the Diploma in Radiological Physics (DRP) course of the Division of Radiation Physics,
      Regional Cancer Centre, Thiruvananthapuram. It replaces the <i>DRP Manager</i> Google Sheet: the class log, attendance,
      syllabus coverage, internal exams, class tests, assignments, the academic calendar and the monthly report.</p>
      <p>Version <b id="about-version">—</b> · <span id="about-build">—</span>.</p>`],
    ['Who sees what', `
      <ul>
        <li><b>Admin</b>: sees and edits everything, manages users, students, faculty, syllabus and holidays, and runs the import.</li>
        <li><b>Student</b>: DRP1 activities are the same for every student, so all DRP1 students see the shared class log,
        syllabus, exam timetable, class tests, assignments and calendar. Attendance, marks, ratings and the report card show
        <b>only the signed-in student's own record</b>. This is enforced by the server, not just hidden in the page.</li>
      </ul>`],
    ['Dashboard', `<p>Class days and teaching hours for the batch, hours per month and per paper, how many syllabus topics have been taught,
      attendance, recent classes and upcoming holidays. Admins also see which monthly reports have not been marked as sent.</p>`],
    ['Class log', `<p>One row per day and up to five sessions per day. Each session has a start and end time, a topic (from 2026-27: a unit or a
      practical experiment) and one or more faculty members or activities. From 2026-27 each session also has a <b>type</b>: Lecture, Tutorial, Practical,
      Exam or Other, so the Syllabus page can compare taught hours with the plan. Hours are calculated from the times. Sundays and RCC holidays are shaded.</p>
      <p><b>Admins:</b> click an empty cell (+) to add a session, or a filled cell to edit or delete it. Only one session can use each slot on a day.</p>`],
    ['Attendance', `<p>P = present, A = absent, L = leave. Blank means not marked (no class, holiday). The percentage is present ÷ days marked.</p>
      <p><b>Admins:</b> click a cell to cycle P → A → L → blank, then press <b>Save</b>. <b>Mark class days present</b> fills P on every day that has a class logged and no mark yet.</p>`],
    ['Syllabus and curricula', `<p>Each academic year follows a curriculum. Up to 2025-26: the yearly scheme (Papers I–VIII with topics and sub-topics).
      From 2026-27: the <b>semester scheme</b> (NCAHP competency-based curriculum): Semester I and II courses (Core, Elective, Lab), Field Training
      and Seminar, each with credits, internal + external marks, planned lecture / tutorial / practical hours (RCC's class schedule) and units.</p>
      <p>The Syllabus page shows, per course and unit, the hours taught against the plan (lectures, tutorials and practicals counted separately),
      when it was last taught and by whom, and the unit's syllabus text. Practical experiments are listed under the Lab courses. Use the search box to find
      a unit. The curriculum's official hours are shown next to RCC's plan for reference.</p>`],
    ['Exams, class tests and assignments', `<p>Internal exams are grouped by series (Internal 1, 2, 3). Class tests are marked out of a maximum;
      assignments are rated 1–5 stars, as in the old sheet. Admins click a row to enter marks, or <b>Edit</b> to change the details.</p>`],
    ['Academic years', `<p>Everything in DRP Manager belongs to an academic year (e.g. 2025-2026): the class log, attendance, students,
      exams, class tests, assignments, the calendar's events and the monthly-report log. The <b>current</b> year is shown by default every time
      DRP Manager is opened; switch to another year with the <b>Academic year</b> selector on the Dashboard, the Calendar or in Settings
      (the year shown is also in the badge at the top right). Students always see their own year.</p>
      <p><b>Starting a new year (admin):</b> Settings › Academic year › add a row (e.g. 2026-2027, first and last month) and save; choose the
      new year; on the Calendar page open <i>This year's academic events</i> and click <i>Copy … events</i> (dates move forward one year), then
      adjust them; open <i>This year's RCC holidays</i> and enter the holidays from RCC's holiday calendar for that year; add the new students
      under Settings › Students with that academic year.</p>`],
    ['Calendar', `<p>The academic calendar of the selected year, in the format of the printed calendar: academic events in colour, RCC closed
      holidays in red and compensatory holidays in orange. Hover a date for details. <b>Print / save as PDF (A3)</b> prints it on one A3 page.</p>
      <p><b>Admins:</b> below the calendar, <i>This year's RCC holidays</i> and <i>This year's academic events</i> edit the calendar of the year shown.</p>`],
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
    const v = window.DRP_VERSION || (info && info.version);
    if (v) root.querySelector('#about-version').textContent = 'v' + v;
  }
  window.DrpHelp = { render };
})();
