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

const stageLabels = { 'inquiry': 'New Inquiry', 'demo': 'Attended Demo', 'payment-pending': 'Payment Pending', 'enrolled': 'Enrolled', 'dropped': 'Dropped' };

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

function renderStudentsView() {
  const students = state.crm.students.filter(s => (state.statusFilter === 'all' || s.status === state.statusFilter) && `${s.name} ${s.course_of_interest}`.toLowerCase().includes(state.search.toLowerCase()));
  const table = `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Stage</th><th>Counselor</th><th>Last Contact</th></tr></thead><tbody>${students.map(s => `<tr><td><strong>${escapeHtml(s.name)}</strong><br><small>${escapeHtml(s.course_of_interest)}</small></td><td><select class="inline-select student-select" data-id="${escapeHtml(s.id)}">${['new', 'contacted', 'attended-demo', 'enrolled'].map(status => `<option value="${status}" ${s.status === status ? 'selected' : ''}>${status.replace('-', ' ')}</option>`).join('')}</select></td><td>${escapeHtml(s.counselor)}</td><td>${escapeHtml(formatDate(s.last_contact))}</td></tr>`).join('')}</tbody></table></div>`;
  
  // Conditionally render the counselor dropdown (Counselors auto-assign to themselves)
  const counselorInput = currentUser.role === 'counselor' ? '' : renderStaffDropdown('counselor', 'Assign to Counselor...');

  return `<section class="content-grid"><div class="left-stack"><section class="card section-card"><div class="section-head"><h3>Student Tracker</h3><input id="studentSearch" type="search" placeholder="Search..." value="${escapeHtml(state.search)}"></div>${table}</section></div><div class="right-stack"><section class="card section-card forms-card"><div class="section-head"><h3>Import Spreadsheet</h3></div><form id="importForm" class="mini-form"><input id="importFile" type="file" accept=".xlsx,.xls,.csv" required><button type="submit">Import</button></form></section><section class="card section-card forms-card"><div class="section-head"><h3>Add Inquiry</h3></div><form id="studentForm" class="mini-form"><input name="name" placeholder="Student name" required><input name="course_of_interest" placeholder="Course" required><input name="email" placeholder="Email"><input name="phone" placeholder="Phone"><input name="expected_fee" type="number" placeholder="Expected Fee">${counselorInput}<button type="submit">Add Student</button></form></section></div></section>`;
}

function renderEnrollmentsView() {
  const board = ['inquiry', 'demo', 'payment-pending', 'enrolled', 'dropped'].map(stage => `<section class="pipeline-column"><div class="pipeline-head"><h4>${escapeHtml(stageLabels[stage])}</h4></div><div class="pipeline-list">${state.crm.enrollments.filter(e => e.stage === stage).map(e => `<article class="deal-card"><div class="deal-topline"><strong>${escapeHtml(e.student_name)}</strong><span>${escapeHtml(formatMoney(e.fee_collected))}</span></div><p>${escapeHtml(e.course_name)}</p><div class="deal-meta"><span>${escapeHtml(e.counselor)}</span></div><div class="deal-footer"><select class="inline-select enrollment-select" data-id="${escapeHtml(e.id)}">${Object.entries(stageLabels).map(([val, lbl]) => `<option value="${val}" ${e.stage === val ? 'selected' : ''}>${lbl}</option>`).join('')}</select></div></article>`).join('')}</div></section>`).join('');
  
  const counselorInput = currentUser.role === 'counselor' ? '' : renderStaffDropdown('counselor', 'Assign to Counselor...');

  return `<section class="content-grid"><div class="left-stack"><section class="card section-card"><div class="pipeline-board">${board}</div></section></div><div class="right-stack"><section class="card section-card forms-card"><div class="section-head"><h3>Add Enrollment</h3></div><form id="enrollmentForm" class="mini-form"><input name="student_name" placeholder="Student name" required><input name="course_name" placeholder="Course" required>${counselorInput}<input name="fee_collected" type="number" placeholder="Fee Collected"><button type="submit">Track Enrollment</button></form></section></div></section>`;
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
  if (e.target.classList.contains('enrollment-select')) return updateState(`/api/enrollments/${e.target.dataset.id}`, { stage: e.target.value });
  if (e.target.closest('[data-task-id]')) return updateState(`/api/tasks/${e.target.dataset.taskId}`, { completed: e.target.checked });
});

viewRoot.addEventListener('submit', async (e) => {
  if (e.target.id === 'studentForm') await submitDataForm(e, '/api/students');
  if (e.target.id === 'enrollmentForm') await submitDataForm(e, '/api/enrollments');
  if (e.target.id === 'taskForm') await submitDataForm(e, '/api/tasks');
  if (e.target.id === 'newUserForm') await submitDataForm(e, '/api/users');
  
  if (e.target.id === 'importForm') {
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