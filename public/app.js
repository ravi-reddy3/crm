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

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric'
});

const routeMeta = {
  home: {
    path: '/',
    eyebrow: 'Starter CRM',
    title: 'Manage contacts, track deals, and stay on top of follow-ups.',
    description: 'Use dedicated pages for your leads, pipeline, and task queue while keeping your overall CRM picture visible from home.'
  },
  leads: {
    path: '/leads',
    eyebrow: 'Contacts',
    title: 'Track leads, filter the list, and import spreadsheets in one place.',
    description: 'Upload an Excel file to add leads quickly, then keep ownership, stages, and follow-ups organized from the leads page.'
  },
  pipeline: {
    path: '/pipeline',
    eyebrow: 'Revenue',
    title: 'Move deals through the pipeline from a dedicated board view.',
    description: 'Review every stage, update progress directly from the board, and create new opportunities without leaving the pipeline page.'
  },
  tasks: {
    path: '/tasks',
    eyebrow: 'Execution',
    title: 'Keep follow-ups visible with a focused task and activity page.',
    description: 'Track task completion, add new work items, and review recent team activity from a single workflow view.'
  }
};

const stageLabels = {
  discovery: 'Discovery',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  'closed-won': 'Closed Won',
  'closed-lost': 'Closed Lost'
};

function getRouteFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (normalized === '/' || normalized === '/index.html') {
    return 'home';
  }

  if (normalized === '/leads') {
    return 'leads';
  }

  if (normalized === '/pipeline') {
    return 'pipeline';
  }

  if (normalized === '/tasks') {
    return 'tasks';
  }

  return 'home';
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.className = `toast visible ${isError ? 'error' : ''}`;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.className = 'toast';
  }, 2600);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return 'No date';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return ['new', 'contacted', 'qualified', 'proposal', 'customer'].includes(normalized) ? normalized : 'new';
}

function sanitizeNumeric(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function metricCardsForRoute() {
  if (!state.crm) {
    return [];
  }

  const dashboard = state.crm.dashboard;
  const openTasks = state.crm.tasks.filter((task) => !task.completed).length;
  const overdueTasks = state.crm.tasks.filter((task) => !task.completed && new Date(task.dueDate) < new Date()).length;

  if (state.route === 'leads') {
    return [
      { label: 'Total Leads', value: dashboard.totalContacts, detail: 'Tracked contacts in the workspace' },
      { label: 'New Leads', value: dashboard.leadsByStatus.find((item) => item.status === 'new')?.count || 0, detail: 'Fresh records ready for outreach' },
      { label: 'Qualified', value: dashboard.leadsByStatus.find((item) => item.status === 'qualified')?.count || 0, detail: 'Ready for sales follow-up' },
      { label: 'Customers', value: dashboard.leadsByStatus.find((item) => item.status === 'customer')?.count || 0, detail: 'Converted accounts on record' }
    ];
  }

  if (state.route === 'pipeline') {
    return [
      { label: 'Active Deals', value: dashboard.activeDeals, detail: `${dashboard.conversionRate}% conversion rate` },
      { label: 'Pipeline Value', value: formatMoney(dashboard.pipelineValue), detail: 'Open revenue in play' },
      { label: 'Won Deals', value: dashboard.wonDeals, detail: 'Closed revenue this cycle' },
      { label: 'Tracked Accounts', value: dashboard.totalContacts, detail: 'Leads supporting the funnel' }
    ];
  }

  if (state.route === 'tasks') {
    return [
      { label: 'Task Completion', value: `${dashboard.taskCompletionRate}%`, detail: 'Completed follow-ups across the team' },
      { label: 'Open Tasks', value: openTasks, detail: 'Still in progress' },
      { label: 'Overdue Tasks', value: overdueTasks, detail: 'Need attention first' },
      { label: 'Recent Activity', value: state.crm.activities.length, detail: 'Latest CRM updates shown below' }
    ];
  }

  return [
    { label: 'Contacts', value: dashboard.totalContacts, detail: 'Tracked accounts in your workspace' },
    { label: 'Active Deals', value: dashboard.activeDeals, detail: `${dashboard.conversionRate}% conversion rate` },
    { label: 'Pipeline Value', value: formatMoney(dashboard.pipelineValue), detail: `${dashboard.wonDeals} won deal${dashboard.wonDeals === 1 ? '' : 's'}` },
    { label: 'Task Completion', value: `${dashboard.taskCompletionRate}%`, detail: 'Completed follow-ups across the team' }
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

function getFilteredLeads() {
  if (!state.crm) {
    return [];
  }

  return state.crm.leads.filter((lead) => {
    const matchesStatus = state.statusFilter === 'all' || lead.status === state.statusFilter;
    const haystack = `${lead.name} ${lead.company} ${lead.owner} ${lead.email} ${lead.source}`.toLowerCase();
    const matchesSearch = haystack.includes(state.search.toLowerCase());
    return matchesStatus && matchesSearch;
  });
}

function renderLeadsTable() {
  const leads = getFilteredLeads();

  if (!leads.length) {
    return `
      <div class="empty-panel">No leads match the current filters.</div>
    `;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contact</th>
            <th>Stage</th>
            <th>Value</th>
            <th>Owner</th>
            <th>Last Contact</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map((lead) => `
            <tr>
              <td>
                <div class="lead-primary">
                  <strong>${escapeHtml(lead.name)}</strong>
                  <span>${escapeHtml(lead.company)}</span>
                  <small>${escapeHtml(lead.email || lead.phone || 'No direct contact yet')}</small>
                </div>
              </td>
              <td>
                <select class="inline-select" data-lead-id="${escapeHtml(lead.id)}">
                  ${['new', 'contacted', 'qualified', 'proposal', 'customer'].map((status) => `
                    <option value="${status}" ${lead.status === status ? 'selected' : ''}>${status}</option>
                  `).join('')}
                </select>
              </td>
              <td>${escapeHtml(formatMoney(lead.estimatedValue))}</td>
              <td>${escapeHtml(lead.owner)}</td>
              <td>${escapeHtml(formatDate(lead.lastContact))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDealsBoard() {
  if (!state.crm) {
    return '';
  }

  const stages = ['discovery', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

  return stages.map((stage) => {
    const deals = state.crm.deals.filter((deal) => deal.stage === stage);

    return `
      <section class="pipeline-column">
        <div class="pipeline-head">
          <h4>${escapeHtml(stageLabels[stage])}</h4>
          <span>${deals.length}</span>
        </div>
        <div class="pipeline-list">
          ${deals.length ? deals.map((deal) => `
            <article class="deal-card">
              <div class="deal-topline">
                <strong>${escapeHtml(deal.title)}</strong>
                <span>${escapeHtml(formatMoney(deal.value))}</span>
              </div>
              <p>${escapeHtml(deal.company)}</p>
              <div class="deal-meta">
                <span>${escapeHtml(deal.owner)}</span>
                <span>${escapeHtml(deal.health)}</span>
              </div>
              <div class="deal-footer">
                <small>Close ${escapeHtml(formatDate(deal.expectedClose))}</small>
                <select class="inline-select deal-select" data-deal-id="${escapeHtml(deal.id)}">
                  ${Object.entries(stageLabels).map(([value, label]) => `
                    <option value="${value}" ${deal.stage === value ? 'selected' : ''}>${label}</option>
                  `).join('')}
                </select>
              </div>
            </article>
          `).join('') : '<div class="empty-panel">No deals in this stage.</div>'}
        </div>
      </section>
    `;
  }).join('');
}

function renderTasksList() {
  if (!state.crm?.tasks.length) {
    return '<div class="empty-panel">No tasks yet.</div>';
  }

  return state.crm.tasks.map((task) => `
    <label class="task-item ${task.completed ? 'done' : ''}">
      <input type="checkbox" data-task-id="${escapeHtml(task.id)}" ${task.completed ? 'checked' : ''}>
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <p>${escapeHtml(task.owner)} • ${escapeHtml(task.priority)} priority • due ${escapeHtml(formatDate(task.dueDate))}</p>
      </div>
    </label>
  `).join('');
}

function renderActivityFeed() {
  if (!state.crm?.activities.length) {
    return '<div class="empty-panel">No activity yet.</div>';
  }

  return state.crm.activities.map((activity) => `
    <article class="activity-item">
      <span class="activity-type">${escapeHtml(activity.type)}</span>
      <strong>${escapeHtml(activity.title)}</strong>
      <p>${escapeHtml(activity.detail)}</p>
      <small>${escapeHtml(new Date(activity.createdAt).toLocaleString())}</small>
    </article>
  `).join('');
}

function renderHomeView() {
  const recentDeals = state.crm.deals.slice(0, 3);

  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card section-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Overview</p>
              <h3>Workspace snapshot</h3>
            </div>
          </div>
          <div class="summary-grid">
            ${state.crm.dashboard.leadsByStatus.map((entry) => `
              <article class="summary-card">
                <span>${escapeHtml(entry.status)}</span>
                <strong>${escapeHtml(entry.count)}</strong>
              </article>
            `).join('')}
          </div>
          <div class="home-actions">
            <button type="button" data-navigate="leads">Open Leads</button>
            <button type="button" data-navigate="pipeline">Open Pipeline</button>
            <button type="button" data-navigate="tasks">Open Tasks</button>
          </div>
        </section>

        <section class="card section-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Deals</p>
              <h3>Upcoming closes</h3>
            </div>
          </div>
          <div class="compact-list">
            ${recentDeals.map((deal) => `
              <article class="compact-item">
                <div>
                  <strong>${escapeHtml(deal.title)}</strong>
                  <p>${escapeHtml(deal.company)} • ${escapeHtml(stageLabels[deal.stage])}</p>
                </div>
                <span>${escapeHtml(formatMoney(deal.value))}</span>
              </article>
            `).join('')}
          </div>
        </section>
      </div>

      <div class="right-stack">
        <section class="card section-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Activity</p>
              <h3>Recent updates</h3>
            </div>
          </div>
          <div class="activity-feed">${renderActivityFeed()}</div>
        </section>
      </div>
    </section>
  `;
}

function renderLeadsView() {
  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card section-card" id="leads">
          <div class="section-head">
            <div>
              <p class="eyebrow">Contacts</p>
              <h3>Lead tracker</h3>
            </div>
            <div class="section-controls">
              <input id="leadSearch" type="search" placeholder="Search name, company, owner" value="${escapeHtml(state.search)}">
              <select id="leadStatusFilter">
                <option value="all" ${state.statusFilter === 'all' ? 'selected' : ''}>All stages</option>
                <option value="new" ${state.statusFilter === 'new' ? 'selected' : ''}>New</option>
                <option value="contacted" ${state.statusFilter === 'contacted' ? 'selected' : ''}>Contacted</option>
                <option value="qualified" ${state.statusFilter === 'qualified' ? 'selected' : ''}>Qualified</option>
                <option value="proposal" ${state.statusFilter === 'proposal' ? 'selected' : ''}>Proposal</option>
                <option value="customer" ${state.statusFilter === 'customer' ? 'selected' : ''}>Customer</option>
              </select>
            </div>
          </div>
          ${renderLeadsTable()}
        </section>
      </div>

      <div class="right-stack">
        <section class="card section-card forms-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Import</p>
              <h3>Upload lead spreadsheet</h3>
            </div>
            <p class="muted-copy">Accepted: .xlsx, .xls, or .csv.</p>
          </div>
          <form id="leadImportForm" class="mini-form import-form">
            <p class="muted-copy">Use columns like Name, Company, Email, Phone, Status, Owner, Value, Source, Tags, and Notes.</p>
            <input id="leadImportFile" name="file" type="file" accept=".xlsx,.xls,.csv" required>
            <button type="submit">Import Leads</button>
          </form>
        </section>

        <section class="card section-card forms-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Quick Capture</p>
              <h3>Add new lead</h3>
            </div>
          </div>
          <form id="leadForm" class="mini-form">
            <input name="name" placeholder="Contact name" required>
            <input name="company" placeholder="Company" required>
            <input name="email" type="email" placeholder="Email">
            <input name="phone" placeholder="Phone">
            <div class="field-row">
              <select name="status">
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="customer">Customer</option>
              </select>
              <input name="estimatedValue" type="number" min="0" step="1000" placeholder="Value">
            </div>
            <div class="field-row">
              <input name="owner" placeholder="Owner">
              <input name="source" placeholder="Source">
            </div>
            <input name="tags" placeholder="Tags, comma separated">
            <textarea name="notes" rows="3" placeholder="Notes"></textarea>
            <button type="submit">Add Lead</button>
          </form>
        </section>
      </div>
    </section>
  `;
}

function renderPipelineView() {
  return `
    <section class="content-grid">
      <div class="left-stack">
        <section class="card section-card" id="pipeline">
          <div class="section-head">
            <div>
              <p class="eyebrow">Revenue</p>
              <h3>Pipeline board</h3>
            </div>
            <p class="muted-copy">Update deal stages directly from the board.</p>
          </div>
          <div class="pipeline-board">${renderDealsBoard()}</div>
        </section>
      </div>

      <div class="right-stack">
        <section class="card section-card forms-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Quick Capture</p>
              <h3>Create new deal</h3>
            </div>
          </div>
          <form id="dealForm" class="mini-form">
            <input name="title" placeholder="Deal title" required>
            <input name="company" placeholder="Company" required>
            <div class="field-row">
              <input name="owner" placeholder="Owner">
              <input name="value" type="number" min="0" step="1000" placeholder="Deal value">
            </div>
            <div class="field-row">
              <select name="stage">
                <option value="discovery">Discovery</option>
                <option value="proposal">Proposal</option>
                <option value="negotiation">Negotiation</option>
                <option value="closed-won">Closed Won</option>
                <option value="closed-lost">Closed Lost</option>
              </select>
              <input name="health" placeholder="Health">
            </div>
            <input name="expectedClose" type="date">
            <button type="submit">Create Deal</button>
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
        <section class="card split-card" id="tasks">
          <div class="section-card inner-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Execution</p>
                <h3>Tasks</h3>
              </div>
            </div>
            <div class="task-list">${renderTasksList()}</div>
          </div>

          <div class="section-card inner-card">
            <div class="section-head">
              <div>
                <p class="eyebrow">Activity</p>
                <h3>Recent updates</h3>
              </div>
            </div>
            <div class="activity-feed">${renderActivityFeed()}</div>
          </div>
        </section>
      </div>

      <div class="right-stack">
        <section class="card section-card forms-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Quick Capture</p>
              <h3>Add task</h3>
            </div>
          </div>
          <form id="taskForm" class="mini-form">
            <input name="title" placeholder="Task title" required>
            <div class="field-row">
              <input name="owner" placeholder="Owner">
              <input name="dueDate" type="date">
            </div>
            <select name="priority">
              <option value="High">High priority</option>
              <option value="Medium">Medium priority</option>
              <option value="Low">Low priority</option>
            </select>
            <button type="submit">Add Task</button>
          </form>
        </section>
      </div>
    </section>
  `;
}

function renderView() {
  if (!state.crm) {
    viewRoot.innerHTML = '<section class="card section-card"><div class="empty-panel">Loading CRM data...</div></section>';
    return;
  }

  if (state.route === 'leads') {
    viewRoot.innerHTML = renderLeadsView();
    return;
  }

  if (state.route === 'pipeline') {
    viewRoot.innerHTML = renderPipelineView();
    return;
  }

  if (state.route === 'tasks') {
    viewRoot.innerHTML = renderTasksView();
    return;
  }

  viewRoot.innerHTML = renderHomeView();
}

function updatePageMeta() {
  const meta = routeMeta[state.route];
  pageEyebrow.textContent = meta.eyebrow;
  pageTitle.textContent = meta.title;
  pageDescription.textContent = meta.description;

  navList.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === state.route);
  });
}

function renderApp() {
  updatePageMeta();
  renderMetrics();
  renderView();
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

async function loadCRM() {
  try {
    state.crm = await request('/api/crm');
    renderApp();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function submitForm(event, path) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());

  try {
    state.crm = await request(path, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    renderApp();
    showToast('Saved successfully.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updateLeadStatus(id, status) {
  try {
    state.crm = await request(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    renderApp();
    showToast('Lead updated.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updateDealStage(id, stage) {
  try {
    state.crm = await request(`/api/deals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ stage })
    });
    renderApp();
    showToast('Deal moved.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function updateTaskState(id, completed) {
  try {
    state.crm = await request(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed })
    });
    renderApp();
    showToast(completed ? 'Task completed.' : 'Task reopened.');
  } catch (error) {
    showToast(error.message, true);
  }
}

function navigate(route) {
  const meta = routeMeta[route];
  if (!meta) {
    return;
  }

  state.route = route;
  window.history.pushState({}, '', meta.path);
  renderApp();
}

function pickField(row, aliases) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]);
  for (const alias of aliases) {
    const match = normalizedEntries.find(([key]) => key === alias);
    if (match && String(match[1] || '').trim()) {
      return String(match[1]).trim();
    }
  }

  return '';
}

function normalizeImportedLead(row) {
  const name = pickField(row, ['name', 'contact', 'contact name', 'full name', 'lead name']);
  const company = pickField(row, ['company', 'organization', 'organisation', 'account', 'account name', 'business']);

  if (!name || !company) {
    return null;
  }

  return {
    name,
    company,
    email: pickField(row, ['email', 'email address', 'mail']),
    phone: pickField(row, ['phone', 'phone number', 'mobile', 'contact number']),
    status: normalizeStatus(pickField(row, ['status', 'stage'])),
    source: pickField(row, ['source', 'lead source', 'channel']),
    owner: pickField(row, ['owner', 'assigned to', 'rep', 'sales rep']),
    estimatedValue: sanitizeNumeric(pickField(row, ['estimated value', 'value', 'deal value', 'amount'])),
    lastContact: pickField(row, ['last contact', 'last contacted', 'contacted on', 'date']),
    tags: pickField(row, ['tags', 'labels']),
    notes: pickField(row, ['notes', 'comment', 'comments', 'description'])
  };
}

async function loadSpreadsheetModule() {
  if (!state.spreadsheetModule) {
    state.spreadsheetModule = await import('/vendor/xlsx/xlsx.mjs');
  }

  return state.spreadsheetModule;
}

async function importLeadsFromFile(file) {
  const XLSX = await loadSpreadsheetModule();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('The uploaded file does not contain any sheets.');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: '',
    raw: false
  });

  const leads = rows.map(normalizeImportedLead).filter(Boolean);

  if (!leads.length) {
    throw new Error('No valid leads were found. Include at least Name and Company columns.');
  }

  state.crm = await request('/api/leads/import', {
    method: 'POST',
    body: JSON.stringify({ leads })
  });

  state.search = '';
  state.statusFilter = 'all';
  renderApp();
  showToast(`${leads.length} lead${leads.length === 1 ? '' : 's'} imported.`);
}

navList.addEventListener('click', (event) => {
  const link = event.target.closest('[data-route]');
  if (!link) {
    return;
  }

  event.preventDefault();
  navigate(link.dataset.route);
});

window.addEventListener('popstate', () => {
  state.route = getRouteFromPath(window.location.pathname);
  renderApp();
});

viewRoot.addEventListener('click', (event) => {
  const button = event.target.closest('[data-navigate]');
  if (!button) {
    return;
  }

  navigate(button.dataset.navigate);
});

viewRoot.addEventListener('input', (event) => {
  if (event.target.id === 'leadSearch') {
    state.search = event.target.value;
    renderView();
  }
});

viewRoot.addEventListener('change', (event) => {
  if (event.target.id === 'leadStatusFilter') {
    state.statusFilter = event.target.value;
    renderView();
    return;
  }

  const leadSelect = event.target.closest('[data-lead-id]');
  if (leadSelect) {
    updateLeadStatus(leadSelect.dataset.leadId, leadSelect.value);
    return;
  }

  const dealSelect = event.target.closest('[data-deal-id]');
  if (dealSelect) {
    updateDealStage(dealSelect.dataset.dealId, dealSelect.value);
    return;
  }

  const taskCheckbox = event.target.closest('[data-task-id]');
  if (taskCheckbox) {
    updateTaskState(taskCheckbox.dataset.taskId, taskCheckbox.checked);
  }
});

viewRoot.addEventListener('submit', async (event) => {
  if (event.target.id === 'leadForm') {
    await submitForm(event, '/api/leads');
    return;
  }

  if (event.target.id === 'dealForm') {
    await submitForm(event, '/api/deals');
    return;
  }

  if (event.target.id === 'taskForm') {
    await submitForm(event, '/api/tasks');
    return;
  }

  if (event.target.id === 'leadImportForm') {
    event.preventDefault();
    const fileInput = event.target.querySelector('#leadImportFile');
    const file = fileInput?.files?.[0];

    if (!file) {
      showToast('Choose a file to import.', true);
      return;
    }

    try {
      await importLeadsFromFile(file);
      event.target.reset();
    } catch (error) {
      showToast(error.message, true);
    }
  }
});

heroDate.textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
});

renderApp();
loadCRM();
