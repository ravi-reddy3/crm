import { createServer } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const dataFile = path.join(__dirname, 'data', 'store.json');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || 'localhost';

const leadStatuses = ['new', 'contacted', 'qualified', 'proposal', 'customer'];
const dealStages = ['discovery', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];

const defaultData = {
  leads: [
    {
      id: 'lead-101',
      name: 'Ava Thompson',
      company: 'Northstar Retail',
      email: 'ava@northstarretail.com',
      phone: '+1 (415) 555-0189',
      status: 'qualified',
      source: 'Website',
      owner: 'Riya',
      estimatedValue: 48000,
      lastContact: '2026-04-20',
      tags: ['priority', 'enterprise'],
      notes: 'Asked for rollout plan and migration support.'
    },
    {
      id: 'lead-102',
      name: 'Marcus Chen',
      company: 'BluePeak Logistics',
      email: 'marcus@bluepeaklogistics.com',
      phone: '+1 (312) 555-0170',
      status: 'contacted',
      source: 'Referral',
      owner: 'Dev',
      estimatedValue: 18000,
      lastContact: '2026-04-18',
      tags: ['logistics'],
      notes: 'Interested in task automation and SLA reporting.'
    },
    {
      id: 'lead-103',
      name: 'Sofia Patel',
      company: 'Luma Health Studio',
      email: 'sofia@lumahealthstudio.com',
      phone: '+1 (646) 555-0192',
      status: 'proposal',
      source: 'LinkedIn',
      owner: 'Riya',
      estimatedValue: 32000,
      lastContact: '2026-04-21',
      tags: ['upsell'],
      notes: 'Needs contract review with legal before approval.'
    },
    {
      id: 'lead-104',
      name: 'Noah Rivera',
      company: 'Atlas Build Co.',
      email: 'noah@atlasbuild.co',
      phone: '+1 (206) 555-0138',
      status: 'new',
      source: 'Campaign',
      owner: 'Maya',
      estimatedValue: 22000,
      lastContact: '2026-04-22',
      tags: ['inbound'],
      notes: 'Fresh inbound from spring campaign.'
    },
    {
      id: 'lead-105',
      name: 'Emma Brooks',
      company: 'Horizon Advisory',
      email: 'emma@horizonadvisory.com',
      phone: '+1 (917) 555-0114',
      status: 'customer',
      source: 'Conference',
      owner: 'Maya',
      estimatedValue: 65000,
      lastContact: '2026-04-17',
      tags: ['customer', 'expansion'],
      notes: 'Existing customer evaluating a second workspace.'
    }
  ],
  deals: [
    {
      id: 'deal-201',
      title: 'Northstar Rollout',
      company: 'Northstar Retail',
      owner: 'Riya',
      stage: 'proposal',
      value: 48000,
      health: 'Strong',
      expectedClose: '2026-05-02'
    },
    {
      id: 'deal-202',
      title: 'BluePeak Workflow Suite',
      company: 'BluePeak Logistics',
      owner: 'Dev',
      stage: 'discovery',
      value: 18000,
      health: 'Warm',
      expectedClose: '2026-05-09'
    },
    {
      id: 'deal-203',
      title: 'Luma Expansion Plan',
      company: 'Luma Health Studio',
      owner: 'Riya',
      stage: 'negotiation',
      value: 32000,
      health: 'At Risk',
      expectedClose: '2026-04-30'
    },
    {
      id: 'deal-204',
      title: 'Horizon Advisory Renewals',
      company: 'Horizon Advisory',
      owner: 'Maya',
      stage: 'closed-won',
      value: 65000,
      health: 'Won',
      expectedClose: '2026-04-15'
    }
  ],
  tasks: [
    {
      id: 'task-301',
      title: 'Prepare Northstar pricing sheet',
      owner: 'Riya',
      dueDate: '2026-04-24',
      completed: false,
      priority: 'High'
    },
    {
      id: 'task-302',
      title: 'Send BluePeak discovery recap',
      owner: 'Dev',
      dueDate: '2026-04-23',
      completed: false,
      priority: 'Medium'
    },
    {
      id: 'task-303',
      title: 'Review Luma redlines',
      owner: 'Riya',
      dueDate: '2026-04-25',
      completed: false,
      priority: 'High'
    },
    {
      id: 'task-304',
      title: 'Check Atlas qualification notes',
      owner: 'Maya',
      dueDate: '2026-04-26',
      completed: true,
      priority: 'Low'
    }
  ],
  activities: [
    {
      id: 'activity-401',
      type: 'deal',
      title: 'Northstar Rollout moved to proposal',
      detail: 'Riya updated the deal after the stakeholder review.',
      createdAt: '2026-04-22T09:20:00.000Z'
    },
    {
      id: 'activity-402',
      type: 'lead',
      title: 'Atlas Build Co. added as a new inbound lead',
      detail: 'Lead source recorded from spring campaign form.',
      createdAt: '2026-04-22T08:05:00.000Z'
    },
    {
      id: 'activity-403',
      type: 'task',
      title: 'BluePeak discovery recap scheduled',
      detail: 'Task assigned to Dev for follow-up email.',
      createdAt: '2026-04-21T16:15:00.000Z'
    }
  ]
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function ensureDataFile() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(defaultData, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw);
}

async function writeStore(data) {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(payload);
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function currency(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sortByDateDescending(items, key) {
  return [...items].sort((left, right) => new Date(right[key]).getTime() - new Date(left[key]).getTime());
}

function buildDashboard(data) {
  const openDeals = data.deals.filter((deal) => !deal.stage.startsWith('closed-'));
  const completedTasks = data.tasks.filter((task) => task.completed).length;
  const conversionBase = data.deals.length || 1;
  const wonDeals = data.deals.filter((deal) => deal.stage === 'closed-won').length;
  const leadsByStatus = leadStatuses.map((status) => ({
    status,
    count: data.leads.filter((lead) => lead.status === status).length
  }));

  return {
    totalContacts: data.leads.length,
    activeDeals: openDeals.length,
    pipelineValue: openDeals.reduce((sum, deal) => sum + currency(deal.value), 0),
    taskCompletionRate: Math.round((completedTasks / (data.tasks.length || 1)) * 100),
    wonDeals,
    conversionRate: Math.round((wonDeals / conversionBase) * 100),
    leadsByStatus
  };
}

function buildResponse(data) {
  return {
    dashboard: buildDashboard(data),
    leads: sortByDateDescending(data.leads, 'lastContact'),
    deals: sortByDateDescending(data.deals, 'expectedClose'),
    tasks: [...data.tasks].sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()),
    activities: sortByDateDescending(data.activities, 'createdAt').slice(0, 10)
  };
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });
}

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return formatToday();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? formatToday() : parsed.toISOString().slice(0, 10);
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sanitizeLeadPayload(body = {}) {
  return {
    id: createId('lead'),
    name: String(body.name || '').trim(),
    company: String(body.company || '').trim(),
    email: String(body.email || '').trim(),
    phone: String(body.phone || '').trim(),
    status: leadStatuses.includes(body.status) ? body.status : 'new',
    source: String(body.source || 'Manual').trim() || 'Manual',
    owner: String(body.owner || 'Unassigned').trim() || 'Unassigned',
    estimatedValue: currency(body.estimatedValue),
    lastContact: normalizeDate(body.lastContact),
    tags: normalizeTags(body.tags),
    notes: String(body.notes || '').trim()
  };
}

function pushActivity(data, activity) {
  data.activities.unshift({
    id: createId('activity'),
    createdAt: new Date().toISOString(),
    ...activity
  });
  data.activities = data.activities.slice(0, 20);
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const store = await readStore();

  if (request.method === 'GET' && url.pathname === '/api/crm') {
    sendJson(response, 200, buildResponse(store));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/leads') {
    const body = await parseRequestBody(request);
    if (!body.name || !body.company) {
      sendJson(response, 400, { error: 'Name and company are required.' });
      return;
    }

    const lead = sanitizeLeadPayload({
      ...body,
      lastContact: formatToday()
    });

    store.leads.unshift(lead);
    pushActivity(store, {
      type: 'lead',
      title: `${lead.company} added as a ${lead.status} lead`,
      detail: `${lead.owner} now owns the account.`
    });

    await writeStore(store);
    sendJson(response, 201, buildResponse(store));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/leads/import') {
    const body = await parseRequestBody(request);
    const incomingLeads = Array.isArray(body.leads) ? body.leads : [];
    const importedLeads = incomingLeads
      .map((item) => sanitizeLeadPayload(item))
      .filter((lead) => lead.name && lead.company);

    if (!importedLeads.length) {
      sendJson(response, 400, { error: 'No valid leads were provided for import.' });
      return;
    }

    store.leads.unshift(...importedLeads);
    pushActivity(store, {
      type: 'lead',
      title: `${importedLeads.length} lead${importedLeads.length === 1 ? '' : 's'} imported`,
      detail: 'Spreadsheet records were added to the lead tracker.'
    });

    await writeStore(store);
    sendJson(response, 201, buildResponse(store));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/deals') {
    const body = await parseRequestBody(request);
    if (!body.title || !body.company) {
      sendJson(response, 400, { error: 'Deal title and company are required.' });
      return;
    }

    const deal = {
      id: createId('deal'),
      title: String(body.title).trim(),
      company: String(body.company).trim(),
      owner: String(body.owner || 'Unassigned').trim() || 'Unassigned',
      stage: dealStages.includes(body.stage) ? body.stage : 'discovery',
      value: currency(body.value),
      health: String(body.health || 'Warm').trim() || 'Warm',
      expectedClose: String(body.expectedClose || formatToday())
    };

    store.deals.unshift(deal);
    pushActivity(store, {
      type: 'deal',
      title: `${deal.title} created in ${deal.stage}`,
      detail: `${deal.company} added to the pipeline at $${deal.value.toLocaleString()}.`
    });

    await writeStore(store);
    sendJson(response, 201, buildResponse(store));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/tasks') {
    const body = await parseRequestBody(request);
    if (!body.title) {
      sendJson(response, 400, { error: 'Task title is required.' });
      return;
    }

    const task = {
      id: createId('task'),
      title: String(body.title).trim(),
      owner: String(body.owner || 'Unassigned').trim() || 'Unassigned',
      dueDate: String(body.dueDate || formatToday()),
      completed: false,
      priority: String(body.priority || 'Medium').trim() || 'Medium'
    };

    store.tasks.unshift(task);
    pushActivity(store, {
      type: 'task',
      title: `Task created: ${task.title}`,
      detail: `${task.owner} owns this ${task.priority.toLowerCase()} priority task.`
    });

    await writeStore(store);
    sendJson(response, 201, buildResponse(store));
    return;
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (request.method === 'PATCH' && leadMatch) {
    const body = await parseRequestBody(request);
    const lead = store.leads.find((item) => item.id === leadMatch[1]);

    if (!lead) {
      sendJson(response, 404, { error: 'Lead not found.' });
      return;
    }

    if (leadStatuses.includes(body.status)) {
      lead.status = body.status;
    }

    lead.lastContact = formatToday();
    pushActivity(store, {
      type: 'lead',
      title: `${lead.company} moved to ${lead.status}`,
      detail: `Lead status updated for ${lead.name}.`
    });

    await writeStore(store);
    sendJson(response, 200, buildResponse(store));
    return;
  }

  const dealMatch = url.pathname.match(/^\/api\/deals\/([^/]+)$/);
  if (request.method === 'PATCH' && dealMatch) {
    const body = await parseRequestBody(request);
    const deal = store.deals.find((item) => item.id === dealMatch[1]);

    if (!deal) {
      sendJson(response, 404, { error: 'Deal not found.' });
      return;
    }

    if (dealStages.includes(body.stage)) {
      deal.stage = body.stage;
    }

    pushActivity(store, {
      type: 'deal',
      title: `${deal.title} moved to ${deal.stage}`,
      detail: `${deal.company} is now tracked in the updated stage.`
    });

    await writeStore(store);
    sendJson(response, 200, buildResponse(store));
    return;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (request.method === 'PATCH' && taskMatch) {
    const body = await parseRequestBody(request);
    const task = store.tasks.find((item) => item.id === taskMatch[1]);

    if (!task) {
      sendJson(response, 404, { error: 'Task not found.' });
      return;
    }

    if (typeof body.completed === 'boolean') {
      task.completed = body.completed;
    }

    pushActivity(store, {
      type: 'task',
      title: `${task.title} marked ${task.completed ? 'complete' : 'active'}`,
      detail: `${task.owner} updated the task state.`
    });

    await writeStore(store);
    sendJson(response, 200, buildResponse(store));
    return;
  }

  sendJson(response, 404, { error: 'API route not found.' });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;

  if (requestPath.startsWith('/vendor/xlsx/')) {
    const vendorPath = path.normalize(path.join(nodeModulesDir, requestPath.replace('/vendor/', '')));

    if (!vendorPath.startsWith(nodeModulesDir)) {
      sendText(response, 403, 'Forbidden');
      return;
    }

    try {
      const data = await fs.readFile(vendorPath);
      const ext = path.extname(vendorPath).toLowerCase();
      response.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      response.end(data);
      return;
    } catch {
      sendText(response, 404, 'Not Found');
      return;
    }
  }

  const filePath = path.normalize(path.join(publicDir, requestPath));

  if (!filePath.startsWith(publicDir)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    response.end(data);
  } catch {
    if (requestPath !== '/index.html') {
      const fallback = await fs.readFile(path.join(publicDir, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(fallback);
      return;
    }

    sendText(response, 404, 'Not Found');
  }
}

const server = createServer(async (request, response) => {
  try {
    if ((request.url || '').startsWith('/api/')) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    sendJson(response, 500, { error: message });
  }
});

await ensureDataFile();

server.listen(port, host, () => {
  console.log(`CRM starter app running on http://${host}:${port}`);
});
