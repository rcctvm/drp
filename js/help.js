/* DRP Manager — About and user manual (shared by the Help tab and help.html).
 * Keep this up to date with every change to the program. */
(function () {
  const SECTIONS = [
    ['About', `
      <p><b>DRP Manager</b> runs the Diploma in Radiological Physics (DRP) course of the Division of Radiation Physics,
      Regional Cancer Centre, Thiruvananthapuram. It replaces the previous version of DRP Manager: the class log, attendance,
      syllabus coverage, internal exams, class tests, assignments, the academic calendar and the monthly report.</p>
      <p>Version <b id="about-version">—</b> · <span id="about-build">—</span>.</p>`],
    ['Who sees what', `
      <ul>
        <li><b>Admin</b>: sees and edits everything: users, students, faculty, syllabus, holidays and the database tools.</li>
        <li><b>Faculty</b>: sees everything an admin sees, including every student's attendance, marks and report card, and their own
        teaching hours on the Faculty page, but cannot change anything. Each faculty account is linked to one faculty member.</li>
        <li><b>DRP1 student</b>: DRP1 activities are the same for every student, so all DRP1 students see the shared class log,
        syllabus, exam timetable, class tests, assignments and calendar. Attendance, marks, ratings and the report card show
        <b>only the signed-in student's own record</b>. This is enforced by the server, not just hidden in the page.</li>
        <li><b>DRP2 student</b>: sees and logs <b>only their own</b> activities (clinical training, internship), plus the common
        activities of their class; sees only their own attendance and report card.</li>
        <li><b>DRP2 class leader</b> (one per class, ticked in Settings › Students): also logs the class's common activities
        (seminars, paper presentations, …) and marks the attendance of the whole class.</li>
      </ul>`],
    ['DRP1 and DRP2', `<p>DRP1 is the first year (classes common to the whole batch); DRP2 is the second year (clinical training and
      internship), where <b>every student's activities are different</b>. A DRP2 year runs from November to December of the next year.</p>
      <ul><li><b>Admins and faculty</b>: switch with the <b>DRP1 | DRP2</b> buttons at the top. In DRP2, choose the student next to them;
      the Dashboard, Class log, Reports and Faculty pages then show that student. The Attendance page shows the whole class.
      Syllabus, Exams, Class tests and Assignments are DRP1 pages and are hidden in DRP2.</li>
      <li><b>DRP2 students</b> go straight to their own DRP2 pages. In the Class log they add and edit their own activities
      (click an empty cell). Activities marked <span class="tag class-tag">Class</span> are common to the whole class.</li>
      <li><b>The class leader</b> adds common activities (tick <i>Common activity of the whole class</i> in the session form) and
      marks the class attendance (P / A) on the Attendance page.</li>
      <li>On the DRP2 dashboard, <i>Hours by paper and activity</i> shows the clinical areas (e.g. Treatment Planning, Machine QA,
      Treatment Setup), then the activities.</li></ul>`],
    ['Dashboard', `<p>An overview of the academic year shown in the badge at the top right. Each chart shows its total for the year in its top-right corner.</p>
      <ul>
        <li><b>Teaching hours per month</b>: hours and class days per month.</li>
        <li><b>Hours by paper and activity</b>: the papers (numbered, e.g. <i>1 PHYSICS</i>; from 2026-27 the semester courses), then the activities
        outside the papers in grey: seminar, paper presentation, project work, training, exams, class tests.</li>
        <li><b>Attendance</b>: present and absent days per student, with the percentage under each name.</li>
        <li><b>Faculty - Hours</b>: teaching hours per faculty member. A class taken by two faculty members counts in full for each.</li>
        <li><b>Working Days vs Productive Days</b>: per month, days attendance was taken (working) and days with at least one timed class (productive);
        top right: the totals and productive days as a percentage of working days.</li>
        <li><b>Checks and balances</b> (admin, faculty): a collapsed panel that says <i>✓ all fine</i> or <i>⚠ N to look at</i>. Open it to see each check:
        hours per month agree with hours by paper and activity; working days without a class logged; class days without attendance; attendance that belongs to
        no student; classes without times, without a topic, or without a faculty member or activity. Open a check for the dates; click a date to fix it in the class log.</li>
      </ul>`],
    ['Class log', `<p>One row per day and up to seven sessions per day; a session can be any length. Each session has a start and end time, a topic (from 2026-27: a unit or a
      practical experiment) and one or more faculty members or activities. From 2026-27 each session also has a <b>type</b>: Lecture, Tutorial, Practical,
      Exam or Other, so the Syllabus page can compare taught hours with the plan. Hours are calculated from the times; a class without times counts 0 hours.
      Sundays and RCC holidays are shaded.</p>
      <p><b>Admins:</b> the session columns used that month are shown; press <b>+ Add session</b> (right of the last column) to show one more, up to 07.
      Click an empty cell (+) to add a session, or a filled cell to edit or delete it. A new session's start time is filled in with the end of the day's
      previous session. Only one session can use each slot on a day.</p>`],
    ['Attendance', `<p>The table for the month comes first, the month's chart below it. P = present, A = absent, as in the earlier attendance registers.
      Blank means not marked (no class, holiday). The percentage is present ÷ days marked; <i>Overall</i> is the whole academic year so far.</p>
      <p><b>Admins:</b> click a cell to cycle P → A → blank, then press <b>Save</b>. <b>Mark class days present</b> fills P on every day that has a
      class logged and no mark yet.</p>`],
    ['Syllabus and curricula', `<p>Each academic year follows a curriculum. Up to 2025-26: the yearly scheme (Papers I–VIII with topics and sub-topics).
      From 2026-27: the <b>semester scheme</b> (NCAHP competency-based curriculum): Semester I and II courses (Core, Elective, Lab), Field Training
      and Seminar, each with credits, internal + external marks, planned lecture / tutorial / practical hours (RCC's class schedule) and units.</p>
      <p>Each semester is a collapsed section showing its credits and the hours taught; click to open it. Per course and unit you see the hours taught
      against the plan (lectures, tutorials and practicals counted separately), when it was last taught and by whom, and the unit's syllabus text.
      Practical experiments are listed under the Lab courses. The search box opens every semester and shows the matching units.</p>`],
    ['Exams, class tests and assignments', `<p>Each exam (Internal-1, Internal-2, Model, …) is a collapsed section showing its number of papers and dates;
      click to open it. From 2026-27 the internal exams are marked out of 100 and the model exam out of 75. Class tests are marked out of a maximum;
      assignments are rated 1–5 stars. Admins click a row to enter marks, or <b>Edit</b> to change the details. Printing opens every exam.</p>`],
    ['Academic years', `<p>Everything in DRP Manager belongs to an academic year (e.g. 2025-2026): the class log, attendance, students,
      exams, class tests, assignments, the calendar's events and the monthly-report log. The <b>current</b> year is shown by default every time
      DRP Manager is opened; switch to another year in <b>Settings › Academic year</b> (the only place it is changed; the year
      shown is on the Dashboard, the Calendar and in the badge at the top right). Students always see their own year.</p>
      <p><b>Starting a new year (admin):</b> Settings › Academic year › add a row (e.g. 2027-2028, first and last month, curriculum) and save; the list
      shows the newest year first. Choose the new year; on the Calendar page open <i>This year's academic events</i> and click <i>Copy … events</i>
      (dates move forward one year), then adjust them; open <i>This year's RCC holidays</i> and enter the holidays from RCC's holiday list for that year;
      add the new students under Settings › Students with that academic year.</p>`],
    ['Calendar', `<p>The academic calendar of the selected year, in the format of the printed calendar: academic events in colour, RCC closed
      holidays in red and compensatory holidays in orange, and both years' holiday lists side by side. Hover a date for details.</p>
      <ul><li><b>Share / save as image</b>: on a phone, opens the share sheet (e.g. WhatsApp) with a picture of the calendar; on a computer, saves it as a PNG.</li>
      <li><b>Print / save as PDF (A3)</b>: prints everything on one A3 portrait page (also with Ctrl+P on the Calendar page).</li></ul>
      <p><b>Admins:</b> below the calendar, <i>This year's RCC holidays</i> and <i>This year's academic events</i> edit the calendar of the year shown.</p>`],
    ['Reports', `<ul><li><b>Monthly report</b>: total days and hours, attendance (T = days marked, P, A, %), topics covered, faculty hours and the full class log for the month. Print or save as PDF.</li>
      <li><b>Report card</b>: one student's details, attendance by month, exam marks, class tests and assignments (admins and faculty choose the student).</li>
      <li><b>Reports sent</b> (admin): tick each month once the monthly report has been sent.</li></ul>`],
    ['Faculty', `<p>Lecture days and hours by month, with the list of lectures and topics. Admins see every faculty member and activity; a faculty member sees their own.</p>`],
    ['Settings', `<ul><li><b>Academic year</b>: choose the year shown everywhere; admins also edit the list of academic years here.</li>
      <li><b>Display</b>: choose the font (Default or Courier New) and the page width (Comfortable, centred; or Full width for wide tables). The choice is kept on this device. Admins can make their choice the default for everyone.</li>
      <li><b>Import previous records</b> (admin): reads the records of the previous version of DRP Manager (never changes them) and copies them: DRP1 one academic year at a time, DRP2 one student at a time. Safe to run again. Anything entered or edited in DRP Manager is kept.</li>
      <li><b>Database</b> (admin): <i>Storage used</i> shows how much of the database's 10 million cells is used (green, amber from 70%, red from 90%), with <i>Show storage by table</i>.
      <i>Reload data from the database</i> shows at once any change made directly in the database (otherwise it appears within 6 hours).
      <i>Trim empty rows and columns</i> frees unused space; records are never touched.</li>
      <li><b>Users</b> (admin): add admin, faculty and student accounts. Each faculty account is linked to one faculty member, and each student account to one student.</li>
      <li><b>Students, Faculty, Papers, Topics, Holidays, Application settings</b> (admin): edit the lists. Changing a student's ID keeps their attendance, marks and account with them. Tick <i>Class leader</i> for one DRP2 student per class. In Students, filter by programme and academic year, sort by year, or <i>View all</i>; saving keeps the students that are filtered out.</li>
      <li><b>My account</b>: change your user name or password.</li></ul>`],
    ['Privacy', `<p>The website holds no data. Everything is stored in the DRP Manager database and served by the DRP Manager server after you sign in.
      Passwords are stored only as salted hashes. Five wrong passwords lock that user name for 15 minutes.</p>`]
  ];

  function render(root, info) {
    root.innerHTML = `<div style="max-width:960px;margin:0 auto;padding:18px 16px 60px">
      <div class="toolbar" style="align-items:center"><h1 style="margin:0">Help &amp; user manual</h1><div style="flex:1"></div>
        <button class="btn" type="button" data-help="open">Expand all</button><button class="btn" type="button" data-help="close">Collapse all</button></div>
      ${SECTIONS.map(([t, h]) => `<details class="sect help-sect"><summary>${t}</summary><div class="sect-body">${h}</div></details>`).join('')}
    </div>`;
    root.querySelectorAll('[data-help]').forEach((b) => b.addEventListener('click', () => {
      const open = b.dataset.help === 'open';
      root.querySelectorAll('details.help-sect').forEach((d) => { d.open = open; });
    }));
    const b = window.DRP_BUILD || {}, bEl = root.querySelector('#about-build');
    if (bEl) bEl.textContent = b.time ? `updated ${new Date(b.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (${b.sha})` : 'development copy';
    const v = window.DRP_VERSION || (info && info.version);
    if (v) root.querySelector('#about-version').textContent = 'v' + v;
  }
  window.DrpHelp = { render };
})();
