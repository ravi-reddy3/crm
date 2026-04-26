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

        // Insert into the students table
        await pool.query(
            `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, name, course, email, phone, 'new', 'Meta Ads', 'Unassigned', 0, today]
        );

        // NEW: Automatically drop Meta Leads straight into the Kanban Board!
        await pool.query(
            `INSERT INTO enrollments (id, student_name, course_name, counselor, stage, fee_collected, batch_start_date) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [createId('enr'), name, course, 'Unassigned', 'new', 0, today]
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

app.post('/api/students', requireAuth, async (req, res) => {
  const b = req.body;
  const owner = req.user.role === 'counselor' ? req.user.username : (b.counselor || 'Unassigned');
  try {
    const studentId = createId('stu');
    const status = b.status || 'new';
    
    // 1. Insert into Tracker
    await pool.query(
      `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, background, notes, education_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [studentId, b.name, b.course_of_interest, b.email, b.phone, status, b.source, owner, currency(b.expected_fee), formatToday(), b.background, b.notes, b.education_level || '']
    );

    // 2. NEW: Instantly sync to the Kanban Pipeline Board!
    await pool.query(
      `INSERT INTO enrollments (id, student_name, course_name, counselor, stage, fee_collected, batch_start_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [createId('enr'), b.name, b.course_of_interest, owner, status, 0, formatToday()]
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
        
        // NEW: Updated query to save education_level from the spreadsheet
        await pool.query(
          `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, background, notes, education_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [createId('stu'), s.name, s.course_of_interest, s.email, s.phone, s.status || 'new', s.source, owner, currency(s.expected_fee), formatToday(), s.background, s.notes, s.education_level || '']
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
    // 1. Insert into the Kanban Pipeline Board
    // Defaults to 'enrolled' if stage isn't provided
    const currentStage = b.stage || 'enrolled'; 
    
    await pool.query(
      `INSERT INTO enrollments (id, student_name, course_name, counselor, stage, fee_collected, batch_start_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [createId('enr'), b.student_name, b.course_name, owner, currentStage, currency(b.fee_collected), b.batch_start_date || formatToday()]
    );

    // 2. Reverse-sync into Student Tracker (Now capturing education!)
    await pool.query(
      `INSERT INTO students (id, name, course_of_interest, email, phone, status, source, counselor, expected_fee, last_contact, education_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [createId('stu'), b.student_name, b.course_name, b.email || '', b.phone || '', currentStage, 'Manual Enrollment', owner, currency(b.fee_collected), formatToday(), b.education_level || '']
    );

    await logActivity('enrollment', `${b.student_name} was enrolled`, `Managed by ${owner}`);
    
    res.json({ message: 'Saved' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
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

// ==========================================
// 1. UPDATED ADD NOTE ROUTE (Fixes #1 and #3)
// ==========================================
app.post('/api/add-note', requireAuth, async (req, res) => {
    const { student_id, comment } = req.body;
    const author = req.user.username; // FEATURE 1: Grabs the actual logged-in user!

    try {
        // Fetch the student's current notes array
        const studentRes = await pool.query('SELECT notes, name FROM students WHERE id = $1', [student_id]);
        if (studentRes.rows.length === 0) return res.status(404).json({ error: 'Student not found' });

        const student = studentRes.rows[0];
        let notesArray = [];
        if (student.notes) {
            try { notesArray = JSON.parse(student.notes); } catch (e) { notesArray = []; }
        }

        // Create the new note object and add it to the history
        const newNote = {
            id: createId('not'),
            author: author,
            text: comment,
            date: new Date().toISOString()
        };
        notesArray.push(newNote);

        // Save the updated JSON array back to the student's database row
        await pool.query('UPDATE students SET notes = $1, last_contact = NOW() WHERE id = $2', [JSON.stringify(notesArray), student_id]);

        // Log it to the global activity feed with the real user's name
        await pool.query(
            `INSERT INTO activities (id, type, title, detail, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [createId('act'), 'note', `Note by ${author} for ${student.name}`, comment]
        );

        res.json({ message: 'Note saved successfully' });
    } catch (error) {
        console.error('Error saving note:', error);
        res.status(500).json({ error: 'Error saving note' });
    }
});

// ==========================================
// 2. NEW EDIT NOTE ROUTE (Fixes #2)
// ==========================================
app.patch('/api/edit-note', requireAuth, async (req, res) => {
    const { student_id, note_id, new_text } = req.body;
    try {
        const studentRes = await pool.query('SELECT notes FROM students WHERE id = $1', [student_id]);
        if (studentRes.rows.length === 0) return res.status(404).json({ error: 'Student not found' });

        // Parse the notes, find the specific one, and update the text
        let notesArray = JSON.parse(studentRes.rows[0].notes || '[]');
        const noteIndex = notesArray.findIndex(n => n.id === note_id);

        if (noteIndex !== -1) {
            notesArray[noteIndex].text = new_text;
            notesArray[noteIndex].edited_at = new Date().toISOString(); 
            
            // Save it back to the database
            await pool.query('UPDATE students SET notes = $1 WHERE id = $2', [JSON.stringify(notesArray), student_id]);
            res.json({ message: 'Note updated successfully' });
        } else {
            res.status(404).json({ error: 'Note not found' });
        }
    } catch (error) {
        console.error('Error editing note:', error);
        res.status(500).json({ error: 'Error editing note' });
    }
});

app.patch('/api/students/:id', requireAuth, async (req, res) => {
  const { status, counselor } = req.body;
  try {
      if (status) {
        await pool.query(`UPDATE students SET status = $1, last_contact = NOW() WHERE id = $2`, [status, req.params.id]);
        
        const studentRes = await pool.query(`SELECT name, course_of_interest, counselor FROM students WHERE id = $1`, [req.params.id]);
        const s = studentRes.rows[0];

        const checkEnr = await pool.query(`SELECT id FROM enrollments WHERE student_name = $1 AND course_name = $2`, [s.name, s.course_of_interest]);

        if (checkEnr.rows.length > 0) {
            await pool.query(`UPDATE enrollments SET stage = $1 WHERE id = $2`, [status, checkEnr.rows[0].id]);
        } else {
            // NEW: No matter what the stage is, if they aren't on the board, put them on it!
            await pool.query(
                `INSERT INTO enrollments (id, student_name, course_name, counselor, stage, fee_collected, batch_start_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [createId('enr'), s.name, s.course_of_interest, s.counselor, status, 0, new Date().toISOString().slice(0,10)]
            );
        }
      } else if (counselor) {
        await pool.query(`UPDATE students SET counselor = $1 WHERE id = $2`, [counselor, req.params.id]);
        const studentRes = await pool.query(`SELECT name FROM students WHERE id = $1`, [req.params.id]);
        await pool.query(`UPDATE enrollments SET counselor = $1 WHERE student_name = $2`, [counselor, studentRes.rows[0].name]);
      }
      res.json({ message: 'Updated and Synced' });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ADMIN ONLY: DELETE STUDENT
// ==========================================
app.delete('/api/students/:id', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        // Delete the student from the database
        await pool.query('DELETE FROM students WHERE id = $1', [req.params.id]);
        
        // Optional: Also clean up their enrollments so they don't leave ghost data on the KanBan board
        await pool.query('DELETE FROM enrollments WHERE id NOT IN (SELECT id FROM students)');

        res.json({ message: 'Student deleted successfully.' });
    } catch (err) {
        console.error('Error deleting student:', err);
        res.status(500).json({ error: 'Failed to delete student.' });
    }
});

// ==========================================
// ADMIN ONLY: DELETE TASKS & ACTIVITIES
// ==========================================
app.delete('/api/tasks/:id', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
        res.json({ message: 'Task deleted successfully.' });
    } catch (err) {
        console.error('Error deleting task:', err);
        res.status(500).json({ error: 'Failed to delete task.' });
    }
});

app.delete('/api/activities/:id', requireAuth, requireRole(['admin']), async (req, res) => {
    try {
        await pool.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
        res.json({ message: 'Activity deleted successfully.' });
    } catch (err) {
        console.error('Error deleting activity:', err);
        res.status(500).json({ error: 'Failed to delete activity.' });
    }
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