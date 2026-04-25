import 'dotenv/config';

import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3010;
const JWT_SECRET = 'unicus_super_secret_key_2026';

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules')));

// --- HELPERS ---
function createId(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 10)}`; }
function currency(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function formatToday() { return new Date().toISOString().slice(0, 10); }
async function logActivity(type, title, detail) {
  await pool.query(`INSERT INTO activities (id, type, title, detail, created_at) VALUES ($1, $2, $3, $4, NOW())`, [createId('activity'), type, title, detail]);
}

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token.' });
    req.user = decoded; 
    next();
  });
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden.' });
    next();
  };
};

// --- AUTH ROUTES ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.cookie('jwt', token, { httpOnly: true, secure: false, maxAge: 8 * 60 * 60 * 1000 });
    res.json({ message: 'Logged in', user: { username: user.username, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logout', (req, res) => { res.clearCookie('jwt'); res.json({ message: 'Logged out' }); });
app.get('/api/me', requireAuth, (req, res) => { res.json({ user: req.user }); });

// --- PERMISSIONS ROUTES ---
app.get('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role FROM users');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4)', [createId('usr'), username, hash, role]);
    res.json({ message: 'User created' });
  } catch (err) { res.status(500).json({ error: 'Username might already exist.' }); }
});

// --- ADD THIS TO YOUR PERMISSIONS ROUTES IN server.js ---

app.delete('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    // Prevent the admin from accidentally deleting their own account
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// --- FETCH STAFF FOR DROPDOWNS ---
app.get('/api/staff', requireAuth, async (req, res) => {
  try {
    // Returns usernames so we can populate the dropdowns
    const result = await pool.query('SELECT username, role FROM users');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FETCH PAGINATED ACTIVITIES ---
app.get('/api/activities', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 6; // Limit to 6 per page as requested
  const offset = (page - 1) * limit;

  try {
    const [activitiesRes, countRes] = await Promise.all([
      pool.query('SELECT * FROM activities ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
      pool.query('SELECT COUNT(*) FROM activities')
    ]);

    res.json({
      activities: activitiesRes.rows,
      activitiesTotal: parseInt(countRes.rows[0].count),
      activityPage: page
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- META ADS WEBHOOK CONFIG ---
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN; // You will enter this in the Meta dashboard
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN; 

// 1. Webhook Verification (Meta hits this when you click "Verify and Save")
app.get('/webhook/meta', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === META_VERIFY_TOKEN) {
        console.log("✅ Meta Webhook Verified Successfully!");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("❌ Meta Webhook Verification Failed");
        res.sendStatus(403);
    }
});

// 2. Receive Lead Ping from Meta (Meta hits this when a user submits a form)
app.post('/webhook/meta', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        // Meta expects a fast 200 OK response, so acknowledge immediately
        res.status(200).send('EVENT_RECEIVED');

        // Iterate over the entries (there may be multiple if batched)
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                if (change.field === 'leadgen') {
                    const leadId = change.value.leadgen_id;
                    console.log(`\n🔔 Webhook triggered! New Lead ID: ${leadId}`);
                    await processMetaLead(leadId);
                }
            }
        }
    } else {
        res.sendStatus(404);
    }
});

// 3. Fetch Lead Details and Save to PostgreSQL
async function processMetaLead(leadId) {
    try {
        console.log("🔍 Checking Token:", META_PAGE_ACCESS_TOKEN ? "Token exists!" : "Token is UNDEFINED!");

        // Call Meta Graph API (v25.0) for the actual form data using your Permanent Token
        const response = await axios.get(`https://graph.facebook.com/v25.0/${leadId}?access_token=${META_PAGE_ACCESS_TOKEN}`);
        const leadData = response.data.field_data;

        console.log("leadData:\n", JSON.stringify(leadData, null, 2));
        
        // Helper function to extract specific fields from Meta's array format
        const getField = (name) => leadData.find(f => f.name === name)?.values[0] || '';

        // Map Meta fields to your CRM schema
        const name = getField('full_name') || getField('first_name') || 'Unknown Lead';
        const email = getField('email');
        const phone = getField('phone_number');
        
        // If your Meta form has a custom question, map it here. Otherwise, use a default.
        const course = getField('course_of_interest') || 'Meta Ads Inquiry'; 

        const id = `stu-${Math.random().toString(36).slice(2, 10)}`;
        const today = new Date().toISOString().slice(0, 10);

        console.log(`📝 Processing Lead: ${name} (${email})`);

        // Insert into the students table
        await pool.query(
            `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, name, course, email, phone, 'new', 'Meta Ads', 'Unassigned', 0, today]
        );

        // Log the activity so it shows up on your CRM dashboard
        await pool.query(
            `INSERT INTO activities (id, type, title, detail, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [`act-${Math.random().toString(36).slice(2, 10)}`, 'student', `Meta Lead captured: ${name}`, `Auto-imported from Facebook.`]
        );

        console.log(`✅ Lead successfully saved to database!`);

    } catch (error) {
        console.error('❌ Error processing Meta lead:', error.response?.data || error.message);
    }
}


// --- CRM DATA ROUTES ---
app.get('/api/crm', requireAuth, async (req, res) => {
  try {
    let studentQuery = 'SELECT * FROM students ORDER BY last_contact DESC';
    let enrollQuery = 'SELECT * FROM enrollments ORDER BY batch_start_date DESC';
    let taskQuery = 'SELECT * FROM tasks ORDER BY due_date ASC';
    let activityQuery = 'SELECT * FROM activities ORDER BY created_at DESC LIMIT 6 OFFSET 0';
    let activityCountQuery = 'SELECT COUNT(*) FROM activities';
    const params = [];

    if (req.user.role === 'counselor') {
      studentQuery = 'SELECT * FROM students WHERE counselor = $1 ORDER BY last_contact DESC';
      enrollQuery = 'SELECT * FROM enrollments WHERE counselor = $1 ORDER BY batch_start_date DESC';
      taskQuery = 'SELECT * FROM tasks WHERE owner = $1 ORDER BY due_date ASC';
      params.push(req.user.username);
    }

    const [studentsRes, enrollmentsRes, tasksRes, activitiesRes, activitiesCountRes] = await Promise.all([
      pool.query(studentQuery, params),
      pool.query(enrollQuery, params),
      pool.query(taskQuery, params),
      pool.query(activityQuery),
      pool.query(activityCountQuery)
    ]);

    const data = { 
      students: studentsRes.rows, 
      enrollments: enrollmentsRes.rows, 
      tasks: tasksRes.rows, 
      activities: activitiesRes.rows,
      activitiesTotal: parseInt(activitiesCountRes.rows[0].count),
      activityPage: 1
    };
    const activeEnrollments = data.enrollments.filter((e) => e.stage !== 'dropped' && e.stage !== 'enrolled');
    const wonEnrollments = data.enrollments.filter((e) => e.stage === 'enrolled').length;

    const dashboard = {
      totalContacts: data.students.length,
      activeDeals: activeEnrollments.length,
      pipelineValue: activeEnrollments.reduce((sum, e) => sum + Number(e.fee_collected || 0), 0),
      wonDeals: wonEnrollments,
      conversionRate: Math.round((wonEnrollments / (data.enrollments.length || 1)) * 100),
      leadsByStatus: ['new', 'contacted', 'attended-demo', 'enrolled'].map((status) => ({ status, count: data.students.filter((s) => s.status === status).length }))
    };

    res.json({ dashboard, ...data, currentUser: req.user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- CREATE & IMPORT ROUTES (RESTORED) ---
app.post('/api/students', requireAuth, async (req, res) => {
  const b = req.body;
  const owner = req.user.role === 'counselor' ? req.user.username : (b.counselor || 'Unassigned');
  try {
    await pool.query(
      `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, background, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [createId('stu'), b.name, b.course_of_interest, b.email, b.phone, b.status || 'new', b.source, owner, currency(b.expected_fee), formatToday(), b.background, b.notes]
    );
    await logActivity('student', `${b.name} added`, `Assigned to ${owner}`);
    res.json({ message: 'Saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/students/import', requireAuth, async (req, res) => {
  const students = req.body.students || [];
  try {
    let count = 0;
    for (const s of students) {
      if (s.name && s.course_of_interest) {
        const owner = req.user.role === 'counselor' ? req.user.username : (s.counselor || 'Unassigned');
        await pool.query(
          `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, background, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [createId('stu'), s.name, s.course_of_interest, s.email, s.phone, s.status || 'new', s.source, owner, currency(s.expected_fee), formatToday(), s.background, s.notes]
        );
        count++;
      }
    }
    await logActivity('student', `${count} imported`, 'Bulk import processed.');
    res.json({ message: 'Imported' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/enrollments', requireAuth, async (req, res) => {
  const b = req.body;
  const owner = req.user.role === 'counselor' ? req.user.username : (b.counselor || 'Unassigned');
  try {
    await pool.query(
      `INSERT INTO enrollments (id, student_name, course_name, counselor, stage, fee_collected, batch_start_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [createId('enr'), b.student_name, b.course_name, owner, b.stage || 'inquiry', currency(b.fee_collected), b.batch_start_date || formatToday()]
    );
    await logActivity('enrollment', `${b.student_name} pipeline added`, `Managed by ${owner}`);
    res.json({ message: 'Saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  const b = req.body;
  const owner = req.user.role === 'counselor' ? req.user.username : (b.owner || 'Unassigned');
  try {
    await pool.query(`INSERT INTO tasks (id, title, owner, due_date, priority) VALUES ($1, $2, $3, $4, $5)`,
      [createId('tsk'), b.title, owner, b.due_date || formatToday(), b.priority || 'Medium']);
    await logActivity('task', `Task created: ${b.title}`, `Assigned to ${owner}`);
    res.json({ message: 'Saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- UPDATE ROUTES (RESTORED) ---
app.patch('/api/students/:id', requireAuth, async (req, res) => {
  await pool.query(`UPDATE students SET status = $1, last_contact = NOW() WHERE id = $2`, [req.body.status, req.params.id]);
  res.json({ message: 'Updated' });
});
app.patch('/api/enrollments/:id', requireAuth, async (req, res) => {
  await pool.query(`UPDATE enrollments SET stage = $1 WHERE id = $2`, [req.body.stage, req.params.id]);
  res.json({ message: 'Updated' });
});
app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  await pool.query(`UPDATE tasks SET completed = $1 WHERE id = $2`, [req.body.completed, req.params.id]);
  res.json({ message: 'Updated' });
});

// --- FALLBACK ---
app.get(/.*/, (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => console.log(`Secure CRM running on port ${PORT}`));