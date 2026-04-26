import pool from './db.js';
import bcrypt from 'bcrypt';

async function seedDatabase() {
  console.log('Seeding database...');
  try {
    // 1. Ensure the users table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(50) PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL
      );
    `);

    // 2. Generate a real bcrypt hash for 'admin123'
    const hash = await bcrypt.hash('admin123', 10);

    // 3. Insert or update the admin user securely
    await pool.query(`
      INSERT INTO users (id, username, password_hash, role) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO UPDATE SET password_hash = $3
    `, ['usr-admin1', 'admin', hash, 'admin']);

    console.log('✅ Success! Admin user seeded.');
    console.log('👉 You can now run "node server.js" and log in with:');
    console.log('Username: admin');
    console.log('Password: admin123');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    process.exit(0);
  }
}

seedDatabase();