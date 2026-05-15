// PostgreSQL connection pool — single shared instance across the application
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://cude:cude_dev_pass@localhost:5432/cude';
    pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

// Run a single query
async function query(text, params) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Run multiple queries in a transaction
async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Test the connection
async function testConnection() {
  try {
    const result = await query('SELECT NOW() as now');
    return { connected: true, timestamp: result.rows[0].now };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

// Run migration SQL file — executes the entire file as one batch
async function runMigration(sqlPath) {
  const fs = require('fs');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await query(sql);
  } catch (e) {
    // If full batch fails (e.g. tables already exist), try statement by statement
    if (e.message.includes('already exists') || e.message.includes('duplicate')) {
      // Tables already created from a previous run — that's fine
      return;
    }
    // Try individual statements as fallback
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
    for (const stmt of statements) {
      try {
        await query(stmt);
      } catch (stmtErr) {
        if (!stmtErr.message.includes('already exists') && !stmtErr.message.includes('duplicate')) {
          console.error(`  Migration statement error: ${stmtErr.message.substring(0, 120)}`);
        }
      }
    }
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, transaction, testConnection, runMigration, close };
