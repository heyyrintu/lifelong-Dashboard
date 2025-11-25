const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'lifelong_dashboard',
    password: 'postgres',
    port: 5432,
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    const res = await client.query('SELECT NOW()');
    console.log('Current time:', res.rows[0].now);
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }
}

testConnection();
