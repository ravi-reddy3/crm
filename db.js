import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',         // Replace with your Postgres username
  host: 'localhost',
  database: 'unicus_cms',
  password: 'unicus96',     // Replace with your Postgres password
  port: 5432,
});

export default pool;