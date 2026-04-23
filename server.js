import { createServer } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3010);
const host = process.env.HOST || 'localhost';

const studentStatuses = ['new', 'contacted', 'attended-demo', 'enrolled'];
const enrollmentStages = ['inquiry', 'demo', 'payment-pending', 'enrolled', 'dropped'];

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

function buildDashboard(data) {
  const activeEnrollments = data.enrollments.filter((e) => e.stage !== 'dropped' && e.stage !== 'enrolled');
  const completedTasks = data.tasks.filter((task) => task.completed).length;
  const wonEnrollments = data.enrollments.filter((e) => e.stage === 'enrolled').length;
  const conversionBase = data.enrollments.length || 1;
  
  const studentsByStatus = studentStatuses.map((status) => ({
    status,
    count: data.students.filter((s) => s.status === status).length
  }));

  return {
    totalContacts: data.students.length,
    activeDeals: activeEnrollments.length,
    pipelineValue: activeEnrollments.reduce((sum, e) => sum + currency(e.fee_collected), 0),
    taskCompletionRate: Math.round((completedTasks / (data.tasks.length || 1)) * 100),
    wonDeals: wonEnrollments,
    conversionRate: Math.round((wonEnrollments / conversionBase) * 100),
    leadsByStatus: studentsByStatus
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
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON body')); }
    });
    request.on('error', reject);
  });
}

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

async function logActivity(type, title, detail) {
  await pool.query(
    `INSERT INTO activities (id, type, title, detail, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [createId('activity'), type, title, detail]
  );
}

async function getFullCRMState() {
  const [studentsRes, enrollmentsRes, tasksRes, activitiesRes, activitiesCountRes] = await Promise.all([
    pool.query('SELECT * FROM students ORDER BY last_contact DESC'),
    pool.query('SELECT * FROM enrollments ORDER BY batch_start_date DESC'),
    pool.query('SELECT * FROM tasks ORDER BY due_date ASC'),
    pool.query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 10 OFFSET 0'), // Limit 10
    pool.query('SELECT COUNT(*) FROM activities') // Get total count
  ]);

  const data = {
    students: studentsRes.rows,
    enrollments: enrollmentsRes.rows,
    tasks: tasksRes.rows,
    activities: activitiesRes.rows,
    activitiesTotal: parseInt(activitiesCountRes.rows[0].count),
    activityPage: 1
  };

  return {
    dashboard: buildDashboard(data),
    ...data
  };
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === 'GET' && url.pathname === '/api/crm') {
      sendJson(response, 200, await getFullCRMState());
      return;
    }

    // NEW: Fetch specific pages of activities
    if (request.method === 'GET' && url.pathname === '/api/activities') {
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = 10;
      const offset = (page - 1) * limit;

      const [activitiesRes, countRes] = await Promise.all([
        pool.query('SELECT * FROM activities ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
        pool.query('SELECT COUNT(*) FROM activities')
      ]);

      sendJson(response, 200, {
        activities: activitiesRes.rows,
        activitiesTotal: parseInt(countRes.rows[0].count),
        activityPage: page
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/students') {
      const body = await parseRequestBody(request);
      if (!body.name || !body.course_of_interest) {
        return sendJson(response, 400, { error: 'Name and course are required.' });
      }

      const id = createId('stu');
      await pool.query(
        `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, background, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, body.name, body.course_of_interest, body.email, body.phone, body.status || 'new', body.source || 'Manual', body.counselor || 'Unassigned', currency(body.expected_fee), formatToday(), body.background, body.notes]
      );

      await logActivity('student', `${body.name} added for ${body.course_of_interest}`, `${body.counselor || 'Unassigned'} is tracking this inquiry.`);
      sendJson(response, 201, await getFullCRMState());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/students/import') {
      const body = await parseRequestBody(request);
      const students = Array.isArray(body.students) ? body.students : [];
      
      let imported = 0;
      for (const s of students) {
        if (s.name && s.course_of_interest) {
          await pool.query(
            `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, background, notes) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [createId('stu'), s.name, s.course_of_interest, s.email, s.phone, s.status || 'new', s.source, s.counselor, currency(s.expected_fee), formatToday(), s.background, s.notes]
          );
          imported++;
        }
      }

      if (imported > 0) {
        await logActivity('student', `${imported} inquiries imported`, `Excel spreadsheet processed successfully.`);
      }
      sendJson(response, 201, await getFullCRMState());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/enrollments') {
      const body = await parseRequestBody(request);
      if (!body.student_name || !body.course_name) {
        return sendJson(response, 400, { error: 'Student name and course are required.' });
      }

      await pool.query(
        `INSERT INTO enrollments (id, student_name, course_name, counselor, stage, fee_collected, batch_start_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [createId('enr'), body.student_name, body.course_name, body.counselor || 'Unassigned', body.stage || 'inquiry', currency(body.fee_collected), body.batch_start_date || formatToday()]
      );

      await logActivity('enrollment', `${body.student_name} added to ${body.course_name} pipeline`, `Stage set to ${body.stage || 'inquiry'}.`);
      sendJson(response, 201, await getFullCRMState());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const body = await parseRequestBody(request);
      if (!body.title) return sendJson(response, 400, { error: 'Task title required.' });

      await pool.query(
        `INSERT INTO tasks (id, title, owner, due_date, priority) VALUES ($1, $2, $3, $4, $5)`,
        [createId('tsk'), body.title, body.owner || 'Unassigned', body.due_date || formatToday(), body.priority || 'Medium']
      );

      await logActivity('task', `Task created: ${body.title}`, `Assigned to ${body.owner || 'Unassigned'}.`);
      sendJson(response, 201, await getFullCRMState());
      return;
    }

    // PATCH Routes for inline updates
    const studentMatch = url.pathname.match(/^\/api\/students\/([^/]+)$/);
    if (request.method === 'PATCH' && studentMatch) {
      const body = await parseRequestBody(request);
      await pool.query(`UPDATE students SET status = $1, last_contact = NOW() WHERE id = $2`, [body.status, studentMatch[1]]);
      await logActivity('student', `Inquiry status updated`, `Moved to ${body.status}.`);
      sendJson(response, 200, await getFullCRMState());
      return;
    }

    const enrollmentMatch = url.pathname.match(/^\/api\/enrollments\/([^/]+)$/);
    if (request.method === 'PATCH' && enrollmentMatch) {
      const body = await parseRequestBody(request);
      await pool.query(`UPDATE enrollments SET stage = $1 WHERE id = $2`, [body.stage, enrollmentMatch[1]]);
      await logActivity('enrollment', `Enrollment stage updated`, `Moved to ${body.stage}.`);
      sendJson(response, 200, await getFullCRMState());
      return;
    }

    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (request.method === 'PATCH' && taskMatch) {
      const body = await parseRequestBody(request);
      await pool.query(`UPDATE tasks SET completed = $1 WHERE id = $2`, [body.completed, taskMatch[1]]);
      await logActivity('task', `Task marked ${body.completed ? 'complete' : 'active'}`, `State updated.`);
      sendJson(response, 200, await getFullCRMState());
      return;
    }

    sendJson(response, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;

  if (requestPath.startsWith('/vendor/xlsx/')) {
    const nodeModulesDir = path.join(__dirname, 'node_modules');
    const vendorPath = path.normalize(path.join(nodeModulesDir, requestPath.replace('/vendor/', '')));
    try {
      const data = await fs.readFile(vendorPath);
      response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(vendorPath).toLowerCase()] || 'application/octet-stream' });
      response.end(data);
      return;
    } catch {
      return sendText(response, 404, 'Not Found');
    }
  }

  const filePath = path.normalize(path.join(publicDir, requestPath));
  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
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
  if ((request.url || '').startsWith('/api/')) {
    await handleApi(request, response);
  } else {
    await serveStatic(request, response);
  }
});

server.listen(port, host, () => {
  console.log(`Unicus Admissions CRM running on http://${host}:${port}`);
});