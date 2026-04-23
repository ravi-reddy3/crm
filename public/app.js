const state = {
  crm: null,
  route: getRouteFromPath(window.location.pathname),
  search: '',
  statusFilter: 'all',
  spreadsheetModule: null
};

const metricGrid = document.getElementById('metricGrid');
const viewRoot = document.getElementById('viewRoot');
const toast = document.getElementById('toast');
const heroDate = document.getElementById('heroDate');
const pageEyebrow = document.getElementById('pageEyebrow');
const pageTitle = document.getElementById('pageTitle');
const pageDescription = document.getElementById('pageDescription');
const navList = document.querySelector('.nav-list');

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const routeMeta = {
  home: {
    path: '/',
    eyebrow: 'Admissions Hub',
    title: 'Manage students, track enrollments, and coordinate batches.',
    description: 'Keep your counselor workflows visible and your student pipeline organized.'
  },
  inquiries: {
    path: '/inquiries',
    eyebrow: 'Prospective Students',
    title: 'Track inquiries, filter the list, and import spreadsheets.',
    description: 'Upload an Excel file to add student leads quickly, and keep demo status organized.'
  },
  enrollments: {
    path: '/enrollments',
    eyebrow: 'Active Batches',
    title: 'Move students through the enrollment pipeline.',
    description: 'Review fee collection, update progress, and create new batch opportunities.'
  },
  tasks: {
    path: '/tasks',
    eyebrow: 'Execution',
    title: 'Keep counselor follow-ups visible with a task queue.',
    description: 'Track call completion, add new work items, and review recent team activity.'
  }
};

const stageLabels = {
  'inquiry': 'New Inquiry',
  'demo': 'Attended Demo',
  'payment-pending': 'Payment Pending',
  'enrolled': 'Enrolled',
  'dropped': 'Dropped'
};

function getRouteFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/' || normalized === '/index.html') return 'home';
  if (normalized === '/inquiries') return 'inquiries';
  if (normalized === '/enrollments') return 'enrollments';
  if (normalized === '/tasks') return 'tasks';
  return 'home';
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = `toast visible ${isError ? 'error' : ''}`;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return ['new', 'contacted', 'attended-demo', 'enrolled'].includes(normalized) ? normalized : 'new';
}

function sanitizeNumeric(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function metricCardsForRoute() {
  if (!state.crm) return [];
  const dashboard = state.crm.dashboard;
  const openTasks = state.crm.tasks.filter((task) => !task.completed).length;

  if (state.route === 'inquiries') {
    return [
      { label: 'Total Inquiries', value: dashboard.totalContacts, detail: 'Tracked prospects' },
      { label: 'New', value: dashboard.leadsByStatus.find((i) => i.status === 'new')?.count || 0, detail: 'Fresh leads' },
      { label: 'Attended Demo', value: dashboard.leadsByStatus.find((i) => i.status === 'attended-demo')?.count || 0, detail: 'Ready to convert' },
      { label: 'Enrolled', value: dashboard.leadsByStatus.find((i) => i.status === 'enrolled')?.count || 0, detail: 'Successfully admitted' }
    ];
  }

  if (state.route === 'enrollments') {
    return [
      { label: 'Active Pipeline', value: dashboard.activeDeals, detail: 'Students in funnel' },
      { label: 'Pending Fees', value: formatMoney(dashboard.pipelineValue), detail: 'Expected revenue' },
      { label: 'Completed Enrollments', value: dashboard.wonDeals, detail: 'Registered students' },
      { label: 'Conversion Rate', value: `${dashboard.conversionRate}%`, detail: 'Overall success' }
    ];
  }

  return [
    { label: 'Total Inquiries', value: dashboard.totalContacts, detail: 'Prospects tracked' },
    { label: 'Active Funnel', value: dashboard.activeDeals, detail: `${dashboard.conversionRate}% conversion rate` },
    { label: 'Expected Fees', value: formatMoney(dashboard.pipelineValue), detail: `${dashboard.wonDeals} enrolled` },
    { label: 'Follow-ups', value: openTasks, detail: 'Tasks pending' }
  ];
}

function renderMetrics() {
  if (!state.crm) {
    metricGrid.innerHTML = '';
    return;
  }
  metricGrid.innerHTML = metricCardsForRoute().map((card) => `
    <article class="metric-card card">
      <p>${escapeHtml(card.label)}</p>
      <strong>${escapeHtml(card.value)}</strong>
      <span>${escapeHtml(card.detail)}</span>
    </article>
  `).join('');
}

function renderStudentsTable() {
  const students = state.crm.students.filter((student) => {
    const matchesStatus = state.statusFilter === 'all' || student.status === state.statusFilter;
    const haystack = `${student.name} ${student.course_of_interest} ${student.counselor} ${student.email}`.toLowerCase();
    return matchesStatus && haystack.includes(state.search.toLowerCase());
  });

  if (!students.length) return `<div class="empty-panel">No students match current filters.</div>`;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Student</th>
            <th>Stage</th>
            <th>Expected Fee</th>
            <th>Counselor</th>
            <th>Last Contact</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student) => `
            <tr>
              <td>
                <div class="lead-primary">
                  <strong>${escapeHtml(student.name)}</strong>
                  <span>${escapeHtml(student.course_of_interest)}</span>
                  <small>${escapeHtml(student.email || student.phone || student.background || 'No details')}</small>
                </div>
              </td>
              <td>
                <select class="inline-select student-select" data-id="${escapeHtml(student.id)}">
                  ${['new', 'contacted', 'attended-demo', 'enrolled'].map((status) => `
                    <option value="${status}" ${student.status === status ? 'selected' : ''}>${status.replace('-', ' ')}</option>
                  `).join('')}
                </select>
              </td>
              <td>${escapeHtml(formatMoney(student.expected_fee))}</td>
              <td>${escapeHtml(student.counselor)}</td>
              <td>${escapeHtml(formatDate(student.last_contact))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEnrollmentsBoard() {
  if (!state.crm) return '';
  const stages = ['inquiry', 'demo', 'payment-pending', 'enrolled', 'dropped'];

  return stages.map((stage) => {
    const enrollments = state.crm.enrollments.filter((e) => e.stage === stage);
    return `
      <section class="pipeline-column">
        <div class="pipeline-head">
          <h4>${escapeHtml(stageLabels[stage])}</h4>
          <span>${enrollments.length}</span>
        </div>
        <div class="pipeline-list">
          ${enrollments.length ? enrollments.map((enrollment) => `
            <article class="deal-card">
              <div class="deal-topline">
                <strong>${escapeHtml(enrollment.student_name)}</strong>
                <span>${escapeHtml(formatMoney(enrollment.fee_collected))}</span>
              </div>
              <p>${escapeHtml(enrollment.course_name)}</p>
              <div class="deal-meta">
                <span>${escapeHtml(enrollment.counselor)}</span>
              </div>
              <div class="deal-footer">
                <small>Batch: ${escapeHtml(formatDate(enrollment.batch_start_date))}</small>
                <select class="inline-select enrollment-select" data-id="${escapeHtml(enrollment.id)}">
                  ${Object.entries(stageLabels).map(([value, label]) => `
                    <option value="${value}" ${enrollment.stage === value ? 'selected' : ''}>${label}</option>
                  `).join('')}
                </select>
              </div>
            </article>
          `).join('') : '<div class="empty-panel">No students.</div>'}
        </div>
      </section>
    `;
  }).join('');
}

function renderTasksList() {
  if (!state.crm?.tasks.length) return '<div class="empty-panel">No tasks yet.</div>';
  return state.crm.tasks.map((task) => `
    <label class="task-item ${task.completed ? 'done' : ''}">
      <input type="checkbox" data-task-id="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''}>
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <p>${escapeHtml(task.owner)} • due ${escapeHtml(formatDate(task.due_date))}</p>
      </div>
    </label>
  `).join('');
}

function renderActivityFeed() {
  if (!state.crm?.activities.length) return '<div class="empty-panel">No activity yet.</div>';
  
  const feedHtml = state.crm.activities.map((activity) => `
    <article class="activity-item">
      <span class="activity-type">${escapeHtml(activity.type)}</span>
      <strong>${escapeHtml(activity.title)}</strong>
      <p>${escapeHtml(activity.detail)}</p>
      <small>${escapeHtml(new Date(activity.created_at).toLocaleString())}</small>
    </article>
  `).join('');

  // Calculate pagination details
  const totalPages = Math.ceil(state.crm.activitiesTotal / 10) || 1;
  const currentPage = state.crm.activityPage || 1;

  const paginationHtml = `
    <div class="pagination">
      <button type="button" class="btn-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Prev</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button type="button" class="btn-page" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
    </div>
  `;

  return feedHtml + paginationHtml;
}

function renderHomeView() {
  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card section-card">
          <div class="section-head">
            <div><p class="eyebrow">Overview</p><h3>Admissions Snapshot</h3></div>
          </div>
          <div class="summary-grid">
            ${state.crm.dashboard.leadsByStatus.map((entry) => `
              <article class="summary-card">
                <span>${escapeHtml(entry.status.replace('-', ' '))}</span>
                <strong>${escapeHtml(entry.count)}</strong>
              </article>
            `).join('')}
          </div>
          <div class="home-actions">
            <button type="button" data-navigate="inquiries">Open Inquiries</button>
            <button type="button" data-navigate="enrollments">Open Pipeline</button>
          </div>
        </section>
      </div>
      <div class="right-stack">
        <section class="card section-card">
          <div class="section-head"><div><p class="eyebrow">Activity</p><h3>Recent updates</h3></div></div>
          <div class="activity-feed">${renderActivityFeed()}</div>
        </section>
      </div>
    </section>
  `;
}

function renderStudentsView() {
  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card section-card">
          <div class="section-head">
            <div><p class="eyebrow">Inquiries</p><h3>Student Tracker</h3></div>
            <div class="section-controls">
              <input id="studentSearch" type="search" placeholder="Search name, course..." value="${escapeHtml(state.search)}">
              <select id="studentStatusFilter">
                <option value="all" ${state.statusFilter === 'all' ? 'selected' : ''}>All stages</option>
                <option value="new" ${state.statusFilter === 'new' ? 'selected' : ''}>New</option>
                <option value="contacted" ${state.statusFilter === 'contacted' ? 'selected' : ''}>Contacted</option>
                <option value="attended-demo" ${state.statusFilter === 'attended-demo' ? 'selected' : ''}>Attended Demo</option>
                <option value="enrolled" ${state.statusFilter === 'enrolled' ? 'selected' : ''}>Enrolled</option>
              </select>
            </div>
          </div>
          ${renderStudentsTable()}
        </section>
      </div>
      <div class="right-stack">
        <section class="card section-card forms-card">
          <div class="section-head">
            <div><p class="eyebrow">Import</p><h3>Upload Spreadsheet</h3></div>
          </div>
          <form id="importForm" class="mini-form import-form">
            <p class="muted-copy">Use columns like Name, Course, Email, Phone, Background, and Counselor.</p>
            <input id="importFile" name="file" type="file" accept=".xlsx,.xls,.csv" required>
            <button type="submit">Import Students</button>
          </form>
        </section>
        <section class="card section-card forms-card">
          <div class="section-head"><div><p class="eyebrow">Capture</p><h3>Add Manual Inquiry</h3></div></div>
          <form id="studentForm" class="mini-form">
            <input name="name" placeholder="Student name" required>
            <input name="course_of_interest" placeholder="Course (e.g., Data Science)" required>
            <div class="field-row"><input name="email" type="email" placeholder="Email"><input name="phone" placeholder="Phone"></div>
            <div class="field-row">
              <select name="status">
                <option value="new">New</option><option value="contacted">Contacted</option>
                <option value="attended-demo">Attended Demo</option><option value="enrolled">Enrolled</option>
              </select>
              <input name="expected_fee" type="number" placeholder="Expected Fee">
            </div>
            <input name="counselor" placeholder="Counselor">
            <textarea name="background" rows="2" placeholder="Background/Education"></textarea>
            <button type="submit">Add Student</button>
          </form>
        </section>
      </div>
    </section>
  `;
}

function renderEnrollmentsView() {
  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card section-card">
          <div class="section-head">
            <div><p class="eyebrow">Revenue</p><h3>Enrollment Board</h3></div>
          </div>
          <div class="pipeline-board">${renderEnrollmentsBoard()}</div>
        </section>
      </div>
      <div class="right-stack">
        <section class="card section-card forms-card">
          <div class="section-head"><div><p class="eyebrow">Add</p><h3>Create Pipeline Entry</h3></div></div>
          <form id="enrollmentForm" class="mini-form">
            <input name="student_name" placeholder="Student name" required>
            <input name="course_name" placeholder="Course" required>
            <div class="field-row"><input name="counselor" placeholder="Counselor"><input name="fee_collected" type="number" placeholder="Fee"></div>
            <select name="stage">
              <option value="inquiry">Inquiry</option><option value="demo">Attended Demo</option>
              <option value="payment-pending">Payment Pending</option><option value="enrolled">Enrolled</option>
            </select>
            <button type="submit">Track Enrollment</button>
          </form>
        </section>
      </div>
    </section>
  `;
}

function renderTasksView() {
  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card split-card">
          <div class="section-card inner-card">
            <div class="section-head"><div><p class="eyebrow">Execution</p><h3>Tasks</h3></div></div>
            <div class="task-list">${renderTasksList()}</div>
          </div>
          <div class="section-card inner-card">
            <div class="section-head"><div><p class="eyebrow">Activity</p><h3>Recent updates</h3></div></div>
            <div class="activity-feed">${renderActivityFeed()}</div>
          </div>
        </section>
      </div>
      <div class="right-stack">
        <section class="card section-card forms-card">
          <div class="section-head"><div><p class="eyebrow">Capture</p><h3>Add follow-up</h3></div></div>
          <form id="taskForm" class="mini-form">
            <input name="title" placeholder="Call student regarding fee..." required>
            <div class="field-row"><input name="owner" placeholder="Counselor"><input name="due_date" type="date"></div>
            <button type="submit">Add Task</button>
          </form>
        </section>
      </div>
    </section>
  `;
}

function renderView() {
  if (!state.crm) { viewRoot.innerHTML = '<section class="card section-card"><div class="empty-panel">Loading...</div></section>'; return; }
  if (state.route === 'inquiries') return viewRoot.innerHTML = renderStudentsView();
  if (state.route === 'enrollments') return viewRoot.innerHTML = renderEnrollmentsView();
  if (state.route === 'tasks') return viewRoot.innerHTML = renderTasksView();
  viewRoot.innerHTML = renderHomeView();
}

function updatePageMeta() {
  const meta = routeMeta[state.route];
  pageEyebrow.textContent = meta.eyebrow; pageTitle.textContent = meta.title; pageDescription.textContent = meta.description;
  navList.querySelectorAll('[data-route]').forEach((link) => { link.classList.toggle('active', link.dataset.route === state.route); });
}

function renderApp() { updatePageMeta(); renderMetrics(); renderView(); }

async function request(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadCRM() {
  try { state.crm = await request('/api/crm'); renderApp(); } 
  catch (err) { showToast(err.message, true); }
}

async function submitForm(event, path) {
  event.preventDefault();
  try {
    state.crm = await request(path, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    event.target.reset(); renderApp(); showToast('Saved successfully.');
  } catch (err) { showToast(err.message, true); }
}

async function updateState(path, payload) {
  try { state.crm = await request(path, { method: 'PATCH', body: JSON.stringify(payload) }); renderApp(); } 
  catch (err) { showToast(err.message, true); }
}

function navigate(route) {
  if (!routeMeta[route]) return;
  state.route = route; window.history.pushState({}, '', routeMeta[route].path); renderApp();
}

function pickField(row, aliases) {
  const norm = Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]);
  for (const alias of aliases) {
    const match = norm.find(([k]) => k === alias);
    if (match && String(match[1] || '').trim()) return String(match[1]).trim();
  }
  return '';
}

async function importStudentsFromFile(file) {
  if (!state.spreadsheetModule) state.spreadsheetModule = await import('/vendor/xlsx/xlsx.mjs');
  const XLSX = state.spreadsheetModule;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  if (!workbook.SheetNames[0]) throw new Error('No sheets found.');
  
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
  const students = rows.map(row => {
    const name = pickField(row, ['name', 'student name', 'full name', 'lead name']);
    const course_of_interest = pickField(row, ['course', 'course of interest', 'program', 'interested in']);
    if (!name || !course_of_interest) return null;
    return {
      name, course_of_interest,
      email: pickField(row, ['email', 'mail']),
      phone: pickField(row, ['phone', 'mobile', 'whatsapp']),
      status: normalizeStatus(pickField(row, ['status', 'stage'])),
      source: pickField(row, ['source', 'campaign']),
      counselor: pickField(row, ['counselor', 'assigned to', 'owner']),
      expected_fee: sanitizeNumeric(pickField(row, ['fee', 'expected fee', 'amount'])),
      background: pickField(row, ['background', 'education', 'profession']),
      notes: pickField(row, ['notes', 'comments', 'remarks'])
    };
  }).filter(Boolean);

  if (!students.length) throw new Error('No valid records found. Include Name and Course columns.');
  state.crm = await request('/api/students/import', { method: 'POST', body: JSON.stringify({ students }) });
  state.search = ''; state.statusFilter = 'all'; renderApp(); showToast(`${students.length} imported.`);
}

viewRoot.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-navigate]');
  if (btn) navigate(btn.dataset.navigate);

  // NEW: Handle activity pagination clicks
  const pageBtn = e.target.closest('.btn-page');
  if (pageBtn && !pageBtn.disabled) {
    const newPage = parseInt(pageBtn.dataset.page);
    try {
      // Fetch just the new activities
      const data = await request(`/api/activities?page=${newPage}`);
      // Update state and re-render
      state.crm.activities = data.activities;
      state.crm.activitiesTotal = data.activitiesTotal;
      state.crm.activityPage = data.activityPage;
      renderApp(); 
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

window.addEventListener('popstate', () => { state.route = getRouteFromPath(window.location.pathname); renderApp(); });
viewRoot.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-navigate]');
  if (btn) navigate(btn.dataset.navigate);
});

viewRoot.addEventListener('input', (e) => {
  if (e.target.id === 'studentSearch') { state.search = e.target.value; renderView(); }
});

viewRoot.addEventListener('change', (e) => {
  if (e.target.id === 'studentStatusFilter') { state.statusFilter = e.target.value; return renderView(); }
  if (e.target.classList.contains('student-select')) return updateState(`/api/students/${e.target.dataset.id}`, { status: e.target.value });
  if (e.target.classList.contains('enrollment-select')) return updateState(`/api/enrollments/${e.target.dataset.id}`, { stage: e.target.value });
  if (e.target.closest('[data-task-id]')) return updateState(`/api/tasks/${e.target.dataset.taskId}`, { completed: e.target.checked });
});

viewRoot.addEventListener('submit', async (e) => {
  if (e.target.id === 'studentForm') await submitForm(e, '/api/students');
  if (e.target.id === 'enrollmentForm') await submitForm(e, '/api/enrollments');
  if (e.target.id === 'taskForm') await submitForm(e, '/api/tasks');
  if (e.target.id === 'importForm') {
    e.preventDefault();
    const file = e.target.querySelector('#importFile')?.files?.[0];
    if (!file) return showToast('Choose a file.', true);
    try { await importStudentsFromFile(file); e.target.reset(); } catch (err) { showToast(err.message, true); }
  }
});

heroDate.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
loadCRM();