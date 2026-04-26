let currentUser = null;
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const navPermissions = document.getElementById('navPermissions');

const state = {
  crm: null, staff: [], route: getRouteFromPath(window.location.pathname), search: '', statusFilter: 'all', spreadsheetModule: null
};

const metricGrid = document.getElementById('metricGrid');
const viewRoot = document.getElementById('viewRoot');
const toast = document.getElementById('toast');
const heroDate = document.getElementById('heroDate');
const pageEyebrow = document.getElementById('pageEyebrow');
const pageTitle = document.getElementById('pageTitle');
const pageDescription = document.getElementById('pageDescription');
const navList = document.querySelector('.nav-list');

const moneyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const routeMeta = {
  home: { path: '/', eyebrow: 'Admissions Hub', title: 'Manage students, track enrollments, and coordinate batches.', description: 'Keep your workflows visible.' },
  inquiries: { path: '/inquiries', eyebrow: 'Prospective Students', title: 'Track inquiries, filter the list, and import spreadsheets.', description: 'Upload Excel files to add student leads quickly.' },
  enrollments: { path: '/enrollments', eyebrow: 'Active Batches', title: 'Move students through the enrollment pipeline.', description: 'Review fee collection, update progress, and create batches.' },
  tasks: { path: '/tasks', eyebrow: 'Execution', title: 'Keep counselor follow-ups visible with a task queue.', description: 'Track task completion and review recent team activity.' },
  permissions: { path: '/permissions', eyebrow: 'Admin Control', title: 'Manage Staff Access and Roles', description: 'Create accounts to restrict data access.' }
};

const stageLabels = { 
  'new': 'New Inquiry', 
  'contacted': 'Contacted', 
  'demo': 'Attended Demo', 
  'payment-pending': 'Payment Pending', 
  'enrolled': 'Enrolled', 
  'dropped': 'Dropped' 
};

function getRouteFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === '/inquiries') return 'inquiries';
  if (normalized === '/enrollments') return 'enrollments';
  if (normalized === '/tasks') return 'tasks';
  if (normalized === '/permissions') return 'permissions';
  return 'home';
}

function showToast(message, isError = false) {
  toast.textContent = message; toast.className = `toast visible ${isError ? 'error' : ''}`;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => { toast.className = 'toast'; }, 2600);
}

function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function formatMoney(value) { return moneyFormatter.format(Number(value || 0)); }
function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
}

async function request(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// --- AUTH LOGIC ---
async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('Not logged in');
    const data = await res.json();
    currentUser = data.user;
    
    document.getElementById('currentUserLabel').textContent = `${currentUser.username} (${currentUser.role})`;
    navPermissions.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    
    loginView.style.display = 'none'; appView.style.display = 'grid';
    loadCRM(); 
  } catch (err) { loginView.style.display = 'block'; appView.style.display = 'none'; }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await request('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); await checkAuth(); } 
  catch (err) { showToast(err.message, true); }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' }); window.location.reload();
});

// --- RENDER LOGIC ---
function renderMetrics() {
  if (!state.crm) { metricGrid.innerHTML = ''; return; }
  const d = state.crm.dashboard;
  const cards = [
    { label: 'Total Inquiries', value: d.totalContacts, detail: 'Prospects tracked' },
    { label: 'Active Funnel', value: d.activeDeals, detail: `${d.conversionRate}% conversion rate` },
    { label: 'Expected Fees', value: formatMoney(d.pipelineValue), detail: `${d.wonDeals} enrolled` },
    { label: 'Open Tasks', value: state.crm.tasks.filter(t => !t.completed).length, detail: 'Follow-ups pending' }
  ];
  metricGrid.innerHTML = cards.map(c => `<article class="metric-card card"><p>${escapeHtml(c.label)}</p><strong>${escapeHtml(c.value)}</strong><span>${escapeHtml(c.detail)}</span></article>`).join('');
}

// Helper to generate a dropdown from the database
function renderStaffDropdown(fieldName, placeholder) {
  const options = state.staff.map(s => `<option value="${escapeHtml(s.username)}">${escapeHtml(s.username)} (${escapeHtml(s.role)})</option>`).join('');
  return `<select name="${fieldName}" required><option value="">${placeholder}</option>${options}</select>`;
}

function renderActivityFeed() {
  if (!state.crm?.activities.length) return '<div class="empty-panel">No activity yet.</div>';
  
  const feedHtml = state.crm.activities.map((a) => `<article class="activity-item"><span class="activity-type">${escapeHtml(a.type)}</span><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.detail)}</p><small>${escapeHtml(new Date(a.created_at).toLocaleString())}</small></article>`).join('');

  // Pagination Logic (6 items per page)
  const totalPages = Math.ceil(state.crm.activitiesTotal / 6) || 1;
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
  return `<section class="content-grid"><div class="left-stack"><section class="card section-card"><div class="section-head"><h3>Admissions Snapshot</h3></div><div class="summary-grid">${state.crm.dashboard.leadsByStatus.map(e => `<article class="summary-card"><span>${escapeHtml(e.status.replace('-', ' '))}</span><strong>${escapeHtml(e.count)}</strong></article>`).join('')}</div></section></div><div class="right-stack"><section class="card section-card"><div class="section-head"><h3>Recent Updates</h3></div><div class="activity-feed">${renderActivityFeed()}</div></section></div></section>`;
}

// --- REPLACE EXISTING renderStudentsView IN app.js ---
function renderStudentsView() {
  // 1. Filter students based on search and status
  const students = state.crm.students.filter(s => (state.statusFilter === 'all' || s.status === state.statusFilter) && `${s.name} ${s.course_of_interest}`.toLowerCase().includes(state.search.toLowerCase()));
  
  const counselorInput = currentUser.role === 'counselor' ? '' : renderStaffDropdown('counselor', 'Assign to Counselor...');

  // 2. Generate the Table
  const table = `<div class="table-wrap">
    <table style="width: 100%;">
      <thead>
        <tr>
          <th style="width: 240px;">Student Info</th>
          <th>Stage</th>
          <th>Counselor</th>
          <th>Last Contact</th>
          <th style="text-align: right;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${students.map(s => {
          let notesArr = [];
          try { if (s.notes) notesArr = JSON.parse(s.notes); } catch(e) {}
          const callCount = notesArr.length;

          return `
          <tr>
            <td style="width: 240px; vertical-align: top;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-size: 1.05rem; color: var(--text);">${escapeHtml(s.name)}</strong>
                <span style="color:var(--teal); font-size: 0.8rem; line-height: 1.2;">${escapeHtml(s.email || 'No email')}</span>
                <span style="color:var(--muted); font-size: 0.8rem; line-height: 1.2;">${escapeHtml(s.phone || 'No phone')}</span>
                <strong style="margin-top: 6px; font-size: 0.85rem; color: var(--text);">${escapeHtml(s.course_of_interest)}</strong>
              </div>
            </td>
            
            <td style="vertical-align: top;">
              <select class="inline-select student-select" data-id="${escapeHtml(s.id)}">
                ${Object.entries(stageLabels).map(([val, lbl]) => `<option value="${val}" ${s.status === val ? 'selected' : ''}>${lbl}</option>`).join('')}
              </select>
            </td>
            
            <td style="vertical-align: top;">
              <select class="inline-select counselor-select" data-id="${escapeHtml(s.id)}">
                <option value="Unassigned" ${s.counselor === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
                ${state.staff.map(staff => `<option value="${escapeHtml(staff.username)}" ${s.counselor === staff.username ? 'selected' : ''}>${escapeHtml(staff.username)} (${escapeHtml(staff.role)})</option>`).join('')}
              </select>
            </td>
            
            <td style="vertical-align: top;">${escapeHtml(formatDate(s.last_contact))}</td>
            
            <td style="text-align: right; min-width: 170px; vertical-align: top;">
              <div style="margin-bottom: 8px; font-size: 0.75rem; color: var(--gold); font-weight: bold;">
                📞 Called: ${callCount} times
              </div>
              <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                  <button onclick="openNoteModal('${escapeHtml(s.id)}', '${escapeHtml(s.name)}')" class="btn-small">💬 +Note</button>
                  <button onclick="openHistoryModal('${escapeHtml(s.id)}')" class="btn-small" style="background: transparent; border-color: var(--line-strong);">📜 History</button>
                  ${currentUser.role === 'admin' ? 
                    `<button onclick="deleteStudent('${escapeHtml(s.id)}')" class="btn-small" style="background: transparent; border-color: #ef4444; color: #ef4444;">🗑️ Delete</button>` 
                    : ''}
              </div>
            </td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  </div>`;

  // 3. Generate the Modals
  const modals = `
    <div id="addStudentModal" class="modal-overlay" style="display: none;">
      <div class="modal-content card forms-card">
        <div class="section-head">
          <h3>Add Inquiry</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('addStudentModal').style.display='none'">✕</button>
        </div>
        <form id="studentForm" class="mini-form">
          <input name="name" placeholder="Student name" required>
          <input name="course_of_interest" placeholder="Course" required>
          <input name="email" placeholder="Email">
          <input name="phone" placeholder="Phone">
          <input name="expected_fee" type="number" placeholder="Expected Fee">
          ${counselorInput}
          <button type="submit">Add Student</button>
        </form>
      </div>
    </div>

    <div id="importModal" class="modal-overlay" style="display: none;">
      <div class="modal-content card forms-card">
        <div class="section-head">
          <h3>Import Spreadsheet</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('importModal').style.display='none'">✕</button>
        </div>
        <form id="importForm" class="mini-form">
          <input id="importFile" type="file" accept=".xlsx,.xls,.csv" required>
          <button type="submit">Import</button>
        </form>
      </div>
    </div>

    <div id="noteModal" class="modal-overlay" style="display: none;">
      <div class="modal-content card forms-card">
        <div class="section-head">
          <h3 id="noteModalTitle">Add Note</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('noteModal').style.display='none'">✕</button>
        </div>
        <form id="noteForm" class="mini-form">
          <input type="hidden" id="noteStudentId" name="student_id">
          <textarea name="comment" rows="4" placeholder="Type counselor note here..." required></textarea>
          <button type="submit">Save Note</button>
        </form>
      </div>
    </div>

    <div id="historyModal" class="modal-overlay" style="display: none;">
      <div class="modal-content card forms-card" style="max-height: 85vh; overflow-y: auto;">
        <div class="section-head">
          <h3 id="historyModalTitle">Call History</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('historyModal').style.display='none'">✕</button>
        </div>
        <div id="historyContent" style="display: flex; flex-direction: column; gap: 12px;">
          </div>
      </div>
    </div>
  `;

  // 4. THE MISSING RETURN STATEMENT! This prints the HTML to the screen.
  return `
    <section class="card section-card" style="grid-column: 1 / -1;">
      <div class="section-head" style="align-items: center;">
        <h3>Student Tracker</h3>
        <div class="action-bar">
          <input id="studentSearch" type="search" placeholder="Search..." value="${escapeHtml(state.search)}" style="max-width: 200px;">
          <button onclick="document.getElementById('addStudentModal').style.display='flex'">+ Add Inquiry</button>
          <button onclick="document.getElementById('importModal').style.display='flex'" style="background: var(--paper-strong); color: var(--text);">📁 Import</button>
        </div>
      </div>
      ${table}
    </section>
    ${modals}
  `;
}

// Attach the global open function so the inline buttons can find it
window.openNoteModal = function(studentId, studentName) {
  document.getElementById('noteStudentId').value = studentId;
  document.getElementById('noteModalTitle').innerText = 'Add Note for ' + escapeHtml(studentName);
  document.getElementById('noteModal').style.display = 'flex';
};

// --- REPLACE EXISTING renderEnrollmentsView IN app.js ---
function renderEnrollmentsView() {
  
  const board = Object.keys(stageLabels).map(stage => {
    const stageEnrollments = state.crm.enrollments.filter(e => e.stage === stage);
    
    return `
    <section class="pipeline-column" style="min-width: 250px; width: 250px; flex-shrink: 0; display: flex; flex-direction: column; max-height: calc(100vh - 380px);">
      
      <div class="pipeline-head" style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px; flex-shrink: 0;">
        <h4 style="font-size: 0.95rem; color: var(--text);">${escapeHtml(stageLabels[stage])}</h4>
        <span style="font-size: 0.75rem; color: var(--muted); background: var(--bg); padding: 2px 8px; border-radius: 12px; font-weight: bold;">
          ${stageEnrollments.length}
        </span>
      </div>
      
      <div class="pipeline-list scrollable-list" style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto; padding-right: 4px; flex-grow: 1;">
        ${stageEnrollments.map(e => `
          
          <article class="deal-card" style="padding: 10px; border-radius: 8px; background: var(--paper-strong); box-shadow: 0 2px 4px rgba(0,0,0,0.12);">
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div style="line-height: 1.2;">
                <strong style="font-size: 0.9rem; color: var(--text);">${escapeHtml(e.student_name)}</strong><br>
                <span style="font-size: 0.75rem; color: var(--muted);">${escapeHtml(e.course_name)}</span>
              </div>
              <span style="font-size: 0.7rem; color: var(--accent); font-weight: bold; background: rgba(74, 222, 128, 0.1); padding: 2px 4px; border-radius: 4px;">
                ${escapeHtml(formatMoney(e.fee_collected))}
              </span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 8px; gap: 6px;">
              <span style="font-size: 0.75rem; color: var(--teal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">👤 ${escapeHtml(e.counselor)}</span>
              <select class="inline-select enrollment-select" data-id="${escapeHtml(e.id)}" style="padding: 2px 4px; font-size: 0.7rem; height: auto; width: 105px; flex-shrink: 0; border-color: var(--line-strong);">
                ${Object.entries(stageLabels).map(([val, lbl]) => `<option value="${val}" ${e.stage === val ? 'selected' : ''}>${lbl}</option>`).join('')}
              </select>
            </div>
            
          </article>
        `).join('')}
      </div>
    </section>
  `}).join('');
  
  const counselorInput = currentUser.role === 'counselor' ? '' : renderStaffDropdown('counselor', 'Assign to Counselor...');

  // --- REPLACE THIS SECTION IN renderEnrollmentsView ---
  return `
  <section class="card section-card" style="grid-column: 1 / -1; padding-bottom: 10px; min-width: 0; width: 100%; overflow: hidden;">
    <div class="section-head" style="align-items: center; margin-bottom: 12px;">
      <h3>Pipeline Board</h3>
      <button onclick="document.getElementById('addEnrollmentModal').style.display='flex'">+ Add Enrollment</button>
    </div>
    
    <div class="pipeline-board scrollable-board" style="display: flex; overflow-x: auto; gap: 14px; padding-bottom: 8px; width: 100%;">
      ${board}
    </div>
  </section>

  <div id="addEnrollmentModal" class="modal-overlay" style="display: none;">
    <div class="modal-content card forms-card">
      <div class="section-head">
        <h3>Add Enrollment</h3>
        <button type="button" class="btn-close" onclick="document.getElementById('addEnrollmentModal').style.display='none'">✕</button>
      </div>
      <form id="enrollmentForm" class="mini-form">
        <input name="student_name" placeholder="Student name" required>
        <input name="course_name" placeholder="Course" required>
        ${counselorInput}
        <input name="fee_collected" type="number" placeholder="Fee Collected">
        <button type="submit">Track Enrollment</button>
      </form>
    </div>
  </div>
  `;
}

function renderTasksView() {
  const list = state.crm.tasks.length ? state.crm.tasks.map(t => `<label class="task-item ${t.completed ? 'done' : ''}"><input type="checkbox" data-task-id="${escapeHtml(t.id)}" ${t.completed ? 'checked' : ''}><div><strong>${escapeHtml(t.title)}</strong><p>${escapeHtml(t.owner)} • due ${escapeHtml(formatDate(t.due_date))}</p></div></label>`).join('') : '<div class="empty-panel">No tasks.</div>';
  
  // REQUIREMENT 3: Task assignment hidden for counselors
  const ownerInput = currentUser.role === 'counselor' ? '' : renderStaffDropdown('owner', 'Assign Task To...');

  return `<section class="content-grid"><div class="left-stack"><section class="card section-card"><div class="section-head"><h3>Tasks</h3></div><div class="task-list">${list}</div></section></div><div class="right-stack"><section class="card section-card forms-card"><div class="section-head"><h3>Add Task</h3></div><form id="taskForm" class="mini-form">
    <input name="title" placeholder="Call student regarding fee..." required>
    ${ownerInput}
    <input name="due_date" type="date" required title="Select Due Date">
    <button type="submit">Add Task</button>
  </form></section></div></section>`;
}

// --- REPLACE THIS FUNCTION IN app.js ---

async function renderPermissionsView() {
  if (currentUser.role !== 'admin') return '<div class="empty-panel">Access Denied</div>';
  const users = await request('/api/users');
  
  // Notice the new Action column and the Delete button below
  return `<section class="content-grid">
    <div class="left-stack">
      <section class="card section-card">
        <div class="section-head"><h3>Staff Accounts</h3></div>
        <table>
          <thead>
            <tr><th>Username</th><th>Role</th><th style="width: 80px;">Action</th></tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${escapeHtml(u.username)}</td>
                <td style="text-transform: capitalize;">${escapeHtml(u.role)}</td>
                <td>
                  ${u.username !== currentUser.username 
                    ? `<button type="button" class="user-delete-btn" data-id="${escapeHtml(u.id)}" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer;">Delete</button>` 
                    : '<span style="color: var(--muted); font-size: 0.85rem;">(You)</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    </div>
    <div class="right-stack">
      <section class="card section-card forms-card">
        <div class="section-head"><h3>Add Staff</h3></div>
        <form id="newUserForm" class="mini-form">
          <input name="username" placeholder="Username" required>
          <input name="password" type="password" placeholder="Password" required>
          <select name="role">
            <option value="counselor">Counselor</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit">Create User</button>
        </form>
      </section>
    </div>
  </section>`;
}

async function renderView() {
  if (!state.crm) return;
  if (state.route === 'inquiries') viewRoot.innerHTML = renderStudentsView();
  else if (state.route === 'enrollments') viewRoot.innerHTML = renderEnrollmentsView();
  else if (state.route === 'tasks') viewRoot.innerHTML = renderTasksView();
  else if (state.route === 'permissions') viewRoot.innerHTML = await renderPermissionsView();
  else viewRoot.innerHTML = renderHomeView();
}

function updatePageMeta() {
  const meta = routeMeta[state.route] || routeMeta.home;
  pageEyebrow.textContent = meta.eyebrow; pageTitle.textContent = meta.title; pageDescription.textContent = meta.description;
  navList.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === state.route));
}

function renderApp() { updatePageMeta(); renderMetrics(); renderView(); }

async function loadCRM() { 
  try { 
    state.crm = await request('/api/crm'); 
    state.staff = await request('/api/staff'); // Fetch the dropdown data
    renderApp(); 
  } catch (err) { showToast(err.message, true); } 
}

navList.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (link) { e.preventDefault(); state.route = link.dataset.route; window.history.pushState({}, '', link.href); renderApp(); }
});

window.addEventListener('popstate', () => { state.route = getRouteFromPath(window.location.pathname); renderApp(); });

viewRoot.addEventListener('input', (e) => { if (e.target.id === 'studentSearch') { state.search = e.target.value; renderView(); } });

// --- DATA ENTRY HANDLERS ---
async function submitDataForm(e, url) {
  e.preventDefault();
  try {
    await request(url, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
    e.target.reset(); await loadCRM(); showToast('Saved');
  } catch (err) { showToast(err.message, true); }
}

async function updateState(path, payload) {
  try { await request(path, { method: 'PATCH', body: JSON.stringify(payload) }); await loadCRM(); } 
  catch (err) { showToast(err.message, true); }
}

viewRoot.addEventListener('change', (e) => {
  if (e.target.classList.contains('student-select')) return updateState(`/api/students/${e.target.dataset.id}`, { status: e.target.value });
  // Add listener for counselor dropdown
  if (e.target.classList.contains('counselor-select')) return updateState(`/api/students/${e.target.dataset.id}`, { counselor: e.target.value });
  if (e.target.classList.contains('enrollment-select')) return updateState(`/api/enrollments/${e.target.dataset.id}`, { stage: e.target.value });
  if (e.target.closest('[data-task-id]')) return updateState(`/api/tasks/${e.target.dataset.taskId}`, { completed: e.target.checked });
});

viewRoot.addEventListener('submit', async (e) => {
  if (e.target.id === 'studentForm') await submitDataForm(e, '/api/students');
  if (e.target.id === 'enrollmentForm') await submitDataForm(e, '/api/enrollments');
  if (e.target.id === 'taskForm') await submitDataForm(e, '/api/tasks');
  if (e.target.id === 'newUserForm') await submitDataForm(e, '/api/users');
  // Add listener for Note form
  if (e.target.id === 'noteForm') await submitDataForm(e, '/api/add-note'); 
  
  if (e.target.id === 'importForm') {
      // ... keep your existing import file logic exactly the same ...
    e.preventDefault();
    const file = e.target.querySelector('#importFile')?.files?.[0];
    if (!file) return showToast('Choose a file.', true);
    if (!state.spreadsheetModule) state.spreadsheetModule = await import('/vendor/xlsx/xlsx.mjs');
    const XLSX = state.spreadsheetModule;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
      const students = rows.map(r => {
        const norm = Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v]);
        const getF = (aliases) => { const m = norm.find(([k]) => aliases.includes(k)); return m ? String(m[1]).trim() : ''; };
        return {
          name: getF(['name', 'student name']), course_of_interest: getF(['course']), email: getF(['email']),
          phone: getF(['phone', 'mobile']), counselor: getF(['counselor', 'owner'])
        };
      }).filter(s => s.name && s.course_of_interest);
      
      await request('/api/students/import', { method: 'POST', body: JSON.stringify({ students }) });
      e.target.reset(); await loadCRM(); showToast(`${students.length} imported.`);
    } catch (err) { showToast('Import failed. Ensure Name and Course columns exist.', true); }
  }
});

heroDate.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
checkAuth();

// --- UPDATE YOUR CLICK LISTENER IN app.js ---

viewRoot.addEventListener('click', async (e) => {
  // ... (Keep your existing pagination logic here) ...
  const pageBtn = e.target.closest('.btn-page');
  if (pageBtn && !pageBtn.disabled) {
    const newPage = parseInt(pageBtn.dataset.page);
    try {
      const data = await request(`/api/activities?page=${newPage}`);
      state.crm.activities = data.activities;
      state.crm.activitiesTotal = data.activitiesTotal;
      state.crm.activityPage = data.activityPage;
      renderApp(); 
    } catch (err) { showToast(err.message, true); }
  }

  // --- ADD THIS NEW DELETE LOGIC ---
  const deleteBtn = e.target.closest('.user-delete-btn');
  if (deleteBtn) {
    // Confirm before deleting
    if (!confirm('Are you sure you want to permanently delete this staff account?')) return;
    
    try {
      await request(`/api/users/${deleteBtn.dataset.id}`, { method: 'DELETE' });
      showToast('Staff account deleted.');
      // FIXED: Use loadCRM() instead of renderApp() so it fetches the fresh staff list!
      await loadCRM();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

// ==========================================
// NEW FRONTEND LOGIC FOR VIEWING & EDITING NOTES
// ==========================================

window.openHistoryModal = function(studentId) {
    const student = state.crm.students.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('historyModalTitle').innerText = 'Call History: ' + escapeHtml(student.name);
    const contentDiv = document.getElementById('historyContent');

    // Parse the saved notes
    let notesArr = [];
    try { if (student.notes) notesArr = JSON.parse(student.notes); } catch(e) {}

    if (notesArr.length === 0) {
        contentDiv.innerHTML = '<div class="empty-panel">No calls or notes added yet.</div>';
    } else {
        // Reverse the array so the newest notes show up at the top
        contentDiv.innerHTML = notesArr.slice().reverse().map(n => `
            <div class="activity-item" style="border: 1px solid var(--line); padding: 14px; border-radius: 12px; background: var(--bg);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: var(--accent);">👤 ${escapeHtml(n.author)}</strong>
                    <small style="color: var(--muted);">${new Date(n.date).toLocaleString()}</small>
                </div>
                
                <p id="view-note-${n.id}" style="margin: 0; font-size: 0.95rem; line-height: 1.5;">${escapeHtml(n.text)}</p>
                
                <textarea id="edit-note-${n.id}" style="display:none; width: 100%; margin-bottom: 8px;" rows="3">${escapeHtml(n.text)}</textarea>
                
                <div style="margin-top: 12px; text-align: right;">
                    <button id="btn-edit-${n.id}" onclick="toggleEditNote('${n.id}')" class="btn-small" style="background: transparent; color: var(--gold);">✏️ Edit Note</button>
                    <button id="btn-save-${n.id}" onclick="saveNoteEdit('${student.id}', '${n.id}')" class="btn-small" style="display:none; background: var(--accent-strong); color: #000;">💾 Save Changes</button>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('historyModal').style.display = 'flex';
};

// Swaps the plain text for a text box
window.toggleEditNote = function(noteId) {
    document.getElementById(`view-note-${noteId}`).style.display = 'none';
    document.getElementById(`btn-edit-${noteId}`).style.display = 'none';
    document.getElementById(`edit-note-${noteId}`).style.display = 'block';
    document.getElementById(`btn-save-${noteId}`).style.display = 'inline-block';
};

// Sends the edited text to the backend
window.saveNoteEdit = async function(studentId, noteId) {
    const newText = document.getElementById(`edit-note-${noteId}`).value;
    try {
        await request('/api/edit-note', {
            method: 'PATCH',
            body: JSON.stringify({ student_id: studentId, note_id: noteId, new_text: newText })
        });
        showToast('Note updated successfully!');
        await loadCRM(); // Refresh the data quietly in the background
        openHistoryModal(studentId); // Re-open the modal to show the updated list
    } catch (err) {
        showToast(err.message, true);
    }
};

// ==========================================
// ADMIN LOGIC: DELETE STUDENT
// ==========================================
window.deleteStudent = async function(studentId) {
    // 1. Force the admin to confirm (prevents accidental clicks)
    if (!confirm('⚠️ Are you sure you want to completely delete this student? This action cannot be undone.')) {
        return;
    }

    try {
        // 2. Fire the secure request to the backend
        await request(`/api/students/${studentId}`, { 
            method: 'DELETE' 
        });
        
        // 3. Show success message and refresh the table
        showToast('Student deleted successfully.');
        await loadCRM(); 
    } catch (err) {
        // If a counselor somehow triggers this, it will throw the 403 Forbidden error here
        showToast(err.message, true);
    }
};