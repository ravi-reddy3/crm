let currentUser = null;
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const navPermissions = document.getElementById('navPermissions');

const state = {
  crm: null, 
  staff: [], 
  route: getRouteFromPath(window.location.pathname), 
  search: '', 
  statusFilter: 'all', 
  spreadsheetModule: null,
  // Add these two lines:
  sortKey: 'last_contact', 
  sortOrder: 'desc'
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

// Inside renderActivityFeed() in app.js
function renderActivityFeed() {
  if (!state.crm?.activities.length) return '<div class="empty-panel">No activity yet.</div>';
  
  const feedHtml = state.crm.activities.map((a) => `
    <article class="activity-item">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
        <span class="activity-type" style="margin-bottom: 0;">${escapeHtml(a.type)}</span>
        
        ${currentUser.role === 'admin' ? 
          `<button type="button" onclick="deleteActivity('${escapeHtml(a.id)}')" style="background: transparent; color: #ef4444; padding: 0 4px; font-size: 1.1rem; box-shadow: none;" title="Delete Activity">✕</button>` 
          : ''}
      </div>
      <strong>${escapeHtml(a.title)}</strong>
      <p>${escapeHtml(a.detail)}</p>
      <small>${escapeHtml(new Date(a.created_at).toLocaleString())}</small>
    </article>
  `).join('');

  const totalPages = Math.ceil(state.crm.activitiesTotal / 6) || 1;
  const currentPage = state.crm.activityPage || 1;

  // NEW: Added 'btn-activity-page' class to these specific buttons
  const paginationHtml = `
    <div class="pagination">
      <button type="button" class="btn-page btn-activity-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Prev</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button type="button" class="btn-page btn-activity-page" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
    </div>
  `;

  return feedHtml + paginationHtml;
}

function renderHomeView() {
  return `<section class="content-grid"><div class="left-stack"><section class="card section-card"><div class="section-head"><h3>Admissions Snapshot</h3></div><div class="summary-grid">${state.crm.dashboard.leadsByStatus.map(e => `<article class="summary-card"><span>${escapeHtml(e.status.replace('-', ' '))}</span><strong>${escapeHtml(e.count)}</strong></article>`).join('')}</div></section></div><div class="right-stack"><section class="card section-card"><div class="section-head"><h3>Recent Updates</h3></div><div class="activity-feed">${renderActivityFeed()}</div></section></div></section>`;
}

// 1. Core API Request Logic
async function loadCRM() { 
  try { 
    const searchQuery = encodeURIComponent(state.search || '');
    const url = `/api/crm?page=${state.studentsPage || 1}&sortKey=${state.sortKey}&sortOrder=${state.sortOrder}&search=${searchQuery}&statusFilter=${state.statusFilter}`;
    
    state.crm = await request(url); 
    state.staff = await request('/api/staff');
    renderApp(); 
  } catch (err) { showToast(err.message, true); } 
}

// 2. Global Handlers for Sorting and Filtering
window.setSort = function(key) {
  if (state.sortKey === key) {
    state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = key;
    state.sortOrder = 'asc';
  }
  state.studentsPage = 1; 
  loadCRM(); 
};

window.setStageFilter = function(stage) {
  state.statusFilter = stage;
  state.studentsPage = 1; 
  loadCRM();
};

window.changeStudentPage = async function (newPage) {
  state.studentsPage = newPage;
  await loadCRM();
};

function renderStudentsView() {
  const students = state.crm.students || [];
  const totalRecords = state.crm.studentsTotal || 0;
  const currentPage = state.crm.studentsPage || 1;
  const totalPages = Math.ceil(totalRecords / 10) || 1;

  const sortIcon = (key) => state.sortKey === key ? (state.sortOrder === 'asc' ? ' 🔼' : ' 🔽') : '';

  const rows = students.map(s => {
    let notesArr = [];
    try { if (s.notes) notesArr = JSON.parse(s.notes); } catch(e) { notesArr = []; }
    const callCount = notesArr.length;

    return `
    <div class="table-row" style="display: flex; align-items: center; padding: 16px 0; border-top: 1px solid var(--line); gap: 15px;">
      
      <div style="flex: 2.5; min-width: 220px;">
        <strong style="display: block; font-size: 1.1rem; color: var(--text);">${escapeHtml(s.name)}</strong>
        
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0;">
          <span style="color: var(--accent); font-size: 0.75rem; font-weight: bold; background: rgba(74, 222, 128, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(74, 222, 128, 0.2);">
            📚 ${escapeHtml(s.course_of_interest || 'General')}
          </span>
          ${s.education_level ? `
          <span style="color: var(--gold); font-size: 0.75rem; font-weight: bold; background: rgba(251, 191, 36, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(251, 191, 36, 0.2);">
            🎓 ${escapeHtml(s.education_level)}
          </span>` : ''}
          <span style="color: #60a5fa; font-size: 0.75rem; font-weight: bold; background: rgba(96, 165, 250, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(96, 165, 250, 0.2);">
            📞 Calls: ${callCount}
          </span>
        </div>

        <span style="display: block; color: var(--teal); font-size: 0.8rem; margin-top: 2px;">${escapeHtml(s.email || 'No email')}</span>
        <span style="display: block; color: var(--muted); font-size: 0.8rem;">${escapeHtml(s.phone || 'No phone')}</span>
      </div>

      <!-- Stage Column (Slightly narrower flex value) -->
      <div style="flex: 1.5;">
        <select class="inline-select student-select" data-id="${escapeHtml(s.id)}" style="background: var(--bg-accent); border-radius: 10px; width: 100%;">
          ${Object.entries(stageLabels).map(([val, lbl]) => `<option value="${val}" ${s.status === val ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
      </div>

      <!-- Counselor Column -->
      <div style="flex: 1;">
        <select class="inline-select counselor-select" data-id="${escapeHtml(s.id)}" style="background: var(--bg-accent); border-radius: 10px; width: 100%; border: 1px solid var(--line-strong); color: var(--text);">
          <option value="Unassigned" ${!s.counselor || s.counselor === 'Unassigned' ? 'selected' : ''}>Unassigned</option>
          ${state.staff.map(staff => `<option value="${escapeHtml(staff.username)}" ${s.counselor === staff.username ? 'selected' : ''}>${escapeHtml(staff.username)}</option>`).join('')}
        </select>
      </div>

      <!-- NEW: Date Added Column -->
      <div style="flex: 1; color: var(--text); font-size: 0.85rem;">
        ${escapeHtml(formatDate(s.created_at))}
      </div>

      <!-- Last Contact Column -->
      <div style="flex: 1; color: var(--muted); font-size: 0.85rem;">
        ${escapeHtml(formatDate(s.last_contact))}
      </div>

      <div style="flex: 2; display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
        <button onclick="openNoteModal('${escapeHtml(s.id)}', '${escapeHtml(s.name)}')" class="btn-small" style="background: var(--paper-strong); padding: 6px 10px;">💬 +Note</button>
        <button onclick="openHistoryModal('${escapeHtml(s.id)}')" class="btn-small" style="background: var(--paper-strong); padding: 6px 10px;">📜 History</button>
        ${currentUser.role === 'admin' ? `
          <button onclick="deleteStudent('${escapeHtml(s.id)}')" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 6px 10px; border-radius: 8px; cursor: pointer;" title="Delete Student">🗑️</button>
        ` : ''}
      </div>
    </div>
  `}).join('');

  const paginationHtml = `
    <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center; padding-top: 15px; border-top: 1px solid var(--line);">
      <button class="btn-page" onclick="changeStudentPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Previous</button>
      <span style="color: var(--muted); font-size: 0.85rem;">Page ${currentPage} of ${totalPages} (${totalRecords} total)</span>
      <button class="btn-page" onclick="changeStudentPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
    </div>
  `;

  return `
    <section class="card section-card">
      <div class="section-head" style="margin-bottom: 24px;">
        <h3 style="font-size: 1.8rem;">Student Tracker</h3>
        <div class="action-bar">
          <select onchange="setStageFilter(this.value)" style="background: var(--bg-accent); border-radius: 10px; padding: 10.5px; width: auto; cursor: pointer; border: 1px solid var(--line-strong);">
            <option value="all" ${state.statusFilter === 'all' ? 'selected' : ''}>All Stages</option>
            ${Object.entries(stageLabels).map(([val, lbl]) => `<option value="${val}" ${state.statusFilter === val ? 'selected' : ''}>${lbl}</option>`).join('')}
          </select>
          <input id="studentSearch" type="search" placeholder="Search..." value="${escapeHtml(state.search)}" style="background: var(--bg-accent); width: 240px; border-radius: 10px; padding: 10px;">
          <button onclick="document.getElementById('addStudentModal').style.display='flex'" style="background: var(--accent); color: #000; font-weight: bold;">+ Add Inquiry</button>
        </div>
      </div>

      <!-- Updated Header layout to match the rows -->
      <div class="table-header" style="display: flex; padding-bottom: 12px; color: var(--muted); font-size: 0.75rem; font-weight: bold; text-transform: uppercase; gap: 15px;">
        <div style="flex: 2.5; cursor: pointer;" onclick="setSort('name')">Student Info ${sortIcon('name')}</div>
        <div style="flex: 1.5; cursor: pointer;" onclick="setSort('status')">Stage ${sortIcon('status')}</div>
        <div style="flex: 1; cursor: pointer;" onclick="setSort('counselor')">Counselor ${sortIcon('counselor')}</div>
        <div style="flex: 1; cursor: pointer; color: var(--text);" onclick="setSort('created_at')">Added ${sortIcon('created_at')}</div>
        <div style="flex: 1; cursor: pointer;" onclick="setSort('last_contact')">Contacted ${sortIcon('last_contact')}</div>
        <div style="flex: 2; text-align: right;">Actions</div>
      </div>

      <div class="rows-container">
        ${rows || '<div class="empty-panel">No students found matching your filters.</div>'}
      </div>

      ${paginationHtml}
    </section>

    <!-- Modal Form -->
    <div id="addStudentModal" class="modal-overlay" style="display: none;">
      <div class="modal-content card forms-card">
        <div class="section-head">
          <h3>Add New Inquiry</h3>
          <button type="button" class="btn-close" onclick="document.getElementById('addStudentModal').style.display='none'">✕</button>
        </div>
        <form id="studentForm" class="mini-form">
          <input name="name" placeholder="Full Name" required>
          <input name="course_of_interest" placeholder="Course Name" required>
          <input name="email" type="email" placeholder="Email Address">
          <input name="phone" type="tel" placeholder="Phone Number">
          <input name="education_level" placeholder="Education (e.g. B.Tech)">
          <button type="submit">Save Inquiry</button>
        </form>
      </div>
    </div>
  `;
}

// 4. Safely debounced search handler
let searchTimeout;
viewRoot.addEventListener('input', (e) => { 
  if (e.target.id === 'studentSearch') { 
    state.search = e.target.value; 
    
    clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(async () => {
      state.studentsPage = 1; 
      await loadCRM(); 
      
      const searchBox = document.getElementById('studentSearch');
      if (searchBox) {
        searchBox.focus();
        const length = searchBox.value.length;
        searchBox.setSelectionRange(length, length);
      }
    }, 400);
  } 
});

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
                <a href="javascript:void(0)" onclick="openPipelineDetails('${escapeHtml(e.student_name)}')" 
                   style="color: var(--accent); text-decoration: none; font-weight: bold; font-size: 0.95rem; display: block; margin-bottom: 3px;">
                   ${escapeHtml(e.student_name)}
                </a>
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
        <input name="email" type="email" placeholder="Email Address">
        <input name="phone" type="tel" placeholder="Mobile Number">
        <select name="education_level">
          <option value="">Select Education Level (Optional)</option>
          <option value="High School">High School</option>
          <option value="Undergraduate">Undergraduate</option>
          <option value="Postgraduate">Postgraduate</option>
          <option value="Working Professional">Working Professional</option>
        </select>
        ${counselorInput}
        <select name="stage" required>
          ${Object.entries(stageLabels).map(([val, lbl]) => `<option value="${val}" ${val === 'enrolled' ? 'selected' : ''}>${lbl}</option>`).join('')}
        </select>
        <input name="fee_collected" type="number" placeholder="Fee Collected">
        <button type="submit">Track Enrollment</button>
      </form>
    </div>
  </div>
  `;
}

function renderTasksView() {
  const list = state.crm.tasks.length ? state.crm.tasks.map(t => `
    <div class="task-item ${t.completed ? 'done' : ''}" style="display: flex; justify-content: space-between; align-items: center; padding: 14px;">
      
      <label style="display: flex; gap: 14px; align-items: flex-start; flex-grow: 1; cursor: pointer; margin: 0;">
        <input type="checkbox" data-task-id="${escapeHtml(t.id)}" ${t.completed ? 'checked' : ''} style="width: auto; flex-shrink: 0; margin-top: 3px; cursor: pointer;">
        <div>
          <strong style="display: block; margin-bottom: 4px; color: var(--text);">${escapeHtml(t.title)}</strong>
          <p style="margin: 0; color: var(--muted); font-size: 0.85rem;">${escapeHtml(t.owner)} • due ${escapeHtml(formatDate(t.due_date))}</p>
        </div>
      </label>
      
      ${currentUser.role === 'admin' ? 
        `<button type="button" onclick="deleteTask('${escapeHtml(t.id)}')" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; flex-shrink: 0; margin-left: 10px;">Delete</button>` 
        : ''}
    </div>
  `).join('') : '<div class="empty-panel">No tasks.</div>';
  
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

navList.addEventListener('click', (e) => {
  const link = e.target.closest('[data-route]');
  if (link) { e.preventDefault(); state.route = link.dataset.route; window.history.pushState({}, '', link.href); renderApp(); }
});

window.addEventListener('popstate', () => { state.route = getRouteFromPath(window.location.pathname); renderApp(); });

// viewRoot.addEventListener('input', (e) => { if (e.target.id === 'studentSearch') { state.search = e.target.value; renderView(); } });

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
  // if (e.target.id === 'noteForm') await submitDataForm(e, '/api/add-note'); 
  
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
          name: getF(['name', 'student name']), 
          course_of_interest: getF(['course']), 
          email: getF(['email']),
          phone: getF(['phone', 'mobile']), 
          counselor: getF(['counselor', 'owner']),
          
          // NEW: Tell the CRM to look for these column headers in Excel!
          education_level: getF(['education level', 'education', 'degree']) 
        };
      }).filter(s => s.name && s.course_of_interest);
      
      await request('/api/students/import', { method: 'POST', body: JSON.stringify({ students }) });
      e.target.reset(); await loadCRM(); showToast(`${students.length} imported.`);
    } catch (err) { showToast('Import failed. Ensure Name and Course columns exist.', true); }
  }
});

heroDate.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
checkAuth();

viewRoot.addEventListener('click', async (e) => {
  // FIXED: Only target the specific activity buttons, not the student ones
  const actPageBtn = e.target.closest('.btn-activity-page');
  if (actPageBtn && !actPageBtn.disabled) {
    const newPage = parseInt(actPageBtn.dataset.page);
    try {
      const data = await request(`/api/activities?page=${newPage}`);
      state.crm.activities = data.activities;
      state.crm.activitiesTotal = data.activitiesTotal;
      state.crm.activityPage = data.activityPage;
      renderApp(); 
    } catch (err) { showToast(err.message, true); }
  }

  // --- DELETE LOGIC ---
  const deleteBtn = e.target.closest('.user-delete-btn');
  if (deleteBtn) {
    if (!confirm('Are you sure you want to permanently delete this staff account?')) return;
    try {
      await request(`/api/users/${deleteBtn.dataset.id}`, { method: 'DELETE' });
      showToast('Staff account deleted.');
      await loadCRM();
    } catch (err) {
      showToast(err.message, true);
    }
  }
});

// ==========================================
// NEW FRONTEND LOGIC FOR VIEWING & EDITING NOTES
// ==========================================

// 1. The Bridge Function
window.openPipelineDetails = function(studentName) {
  // We search the master student list by name
  const student = state.crm.students.find(s => s.name === studentName);
  
  if (student) {
    window.openHistoryModal(student.id);
  } else {
    // Helpful for debugging if names don't match exactly
    console.error("Lookup failed for name:", studentName);
    showToast("Profile not found. Ensure the name matches the tracker exactly.", true);
  }
};

// 2. The Updated Modal Logic
// UPDATED: Now includes authorship check for the Edit button
window.openHistoryModal = function(studentId) {
    const student = state.crm.students.find(s => s.id === studentId);
    const titleEl = document.getElementById('historyModalTitle');
    const contentDiv = document.getElementById('historyContent');

    if (!student || !titleEl || !contentDiv) return;

    titleEl.innerText = 'Student Profile: ' + escapeHtml(student.name);

    let notesArr = [];
    try { if (student.notes) notesArr = JSON.parse(student.notes); } catch(e) {}

    const contactHeader = `
      <div style="background: var(--paper-strong); padding: 16px; border-radius: 12px; border: 1px solid var(--line-strong); margin-bottom: 10px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
          <div><span style="color: var(--muted);">Email:</span> <br> ${escapeHtml(student.email || 'N/A')}</div>
          <div><span style="color: var(--muted);">Phone:</span> <br> ${escapeHtml(student.phone || 'N/A')}</div>
          <div><span style="color: var(--muted);">Education:</span> <br> ${escapeHtml(student.education_level || 'N/A')}</div>
          <div><span style="color: var(--muted);">Total Calls:</span> <br> <strong style="color: var(--gold);">${notesArr.length}</strong></div>
        </div>
      </div>
      <h4 style="font-size: 1rem; margin: 15px 0 10px;">Conversation History</h4>
    `;

    if (notesArr.length === 0) {
        contentDiv.innerHTML = contactHeader + '<div class="empty-panel">No notes recorded.</div>';
    } else {
        contentDiv.innerHTML = contactHeader + notesArr.slice().reverse().map(n => {
            // AUTH CHECK: Only the person who wrote the note can edit it
            const isAuthor = n.author === currentUser.username;

            return `
            <div class="activity-item" style="border: 1px solid var(--line); padding: 14px; border-radius: 12px; background: var(--bg); margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: var(--accent);">👤 ${escapeHtml(n.author)}</strong>
                    <small style="color: var(--muted);">${new Date(n.date).toLocaleString()}</small>
                </div>
                
                <p id="view-note-${n.id}" style="margin: 0; font-size: 0.95rem; line-height: 1.5;">${escapeHtml(n.text)}</p>
                <textarea id="edit-note-${n.id}" style="display:none; width: 100%; margin-bottom: 8px; background: var(--paper-strong); color: white; border: 1px solid var(--accent);" rows="3">${escapeHtml(n.text)}</textarea>
                
                <div style="margin-top: 12px; text-align: right;">
                    ${isAuthor ? `
                        <button id="btn-edit-${n.id}" onclick="toggleEditNote('${n.id}')" class="btn-small" style="background: transparent; color: var(--gold); border-color: var(--gold);">✏️ Edit</button>
                        <button id="btn-save-${n.id}" onclick="saveNoteEdit('${student.id}', '${n.id}')" class="btn-small" style="display:none; background: var(--accent-strong); color: #000;">💾 Save Changes</button>
                        <button id="btn-cancel-${n.id}" onclick="openHistoryModal('${student.id}')" class="btn-small" style="display:none; background: transparent; color: var(--muted); border-color: var(--line); margin-left: 5px;">Cancel</button>
                    ` : `<span style="color: var(--muted); font-size: 0.75rem;">Read-only (Owner: ${escapeHtml(n.author)})</span>`}
                </div>
            </div>
        `}).join('');
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

// ==========================================
// ADMIN LOGIC: DELETE TASKS & ACTIVITIES
// ==========================================
window.deleteTask = async function(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
        await request(`/api/tasks/${taskId}`, { method: 'DELETE' });
        showToast('Task deleted.');
        await loadCRM(); 
    } catch (err) {
        showToast(err.message, true);
    }
};

window.deleteActivity = async function(activityId) {
    if (!confirm('Are you sure you want to delete this activity log?')) return;

    try {
        await request(`/api/activities/${activityId}`, { method: 'DELETE' });
        showToast('Activity deleted.');
        await loadCRM(); 
    } catch (err) {
        showToast(err.message, true);
    }
};

// Add this to app.js to handle the globally-located note form
document.getElementById('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault(); // This stops the URL from changing and the page from reloading
  
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData);

  try {
    await request('/api/add-note', { 
      method: 'POST', 
      body: JSON.stringify(payload) 
    });
    
    e.target.reset(); 
    document.getElementById('noteModal').style.display = 'none'; // Close modal
    showToast('Note saved successfully');
    
    await loadCRM(); // Refresh data in background
    
    // If the history modal is also open, refresh it to show the new note
    if (document.getElementById('historyModal').style.display === 'flex') {
      openHistoryModal(payload.student_id);
    }
  } catch (err) {
    showToast(err.message, true);
  }
});