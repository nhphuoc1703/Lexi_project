// only for testing for now!!!

import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool ({
    user: 'postgres',
    host: 'localhost',
    database: 'lexi_db',
    password: 'vErYR@nd0m9a$$wOrD!',
    port: 5432
});

async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()'); // simple query
    console.log('✅ Connected successfully! Server time:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Connection failed:', err);
  } finally {
    await pool.end();
  }
}

testConnection();