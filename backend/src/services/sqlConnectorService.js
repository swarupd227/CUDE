// SQL Database Connector Service — schema discovery, query execution, data quality metrics
// Supports MySQL (primary), extensible to PostgreSQL and SQL Server

let mysql;
try {
  mysql = require('mysql2/promise');
} catch (e) {
  console.log('⚠️  mysql2 not installed — SQL connector features disabled. Install with: npm install mysql2');
}

// Connection pool cache
const pools = {};

// Blocked SQL keywords for safety
const BLOCKED_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|EXEC|EXECUTE|GRANT|REVOKE|sp_|xp_)\b/i;
const MAX_ROWS = 10000;
const QUERY_TIMEOUT = 30000;

function isAvailable() { return !!mysql; }

async function getPool(config) {
  if (!mysql) throw new Error('MySQL driver not installed. Run: npm install mysql2');
  const key = `${config.host}:${config.port || 3306}:${config.database}`;
  if (pools[key]) return pools[key];

  const pool = mysql.createPool({
    host: config.host || 'localhost',
    port: config.port || 3306,
    user: config.user || 'cude',
    password: config.password || 'cude_demo_pass',
    database: config.database || 'adventureworks',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
  });

  pools[key] = pool;
  return pool;
}

// Test database connection
async function testConnection(config) {
  try {
    const pool = await getPool(config);
    const [rows] = await pool.query('SELECT 1 as connected');
    return { success: true, message: 'Connected successfully', database: config.database };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Discover full schema — tables, columns, PKs, FKs
async function discoverSchema(config) {
  const pool = await getPool(config);

  // Get all tables
  const [tables] = await pool.query(
    `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS, DATA_LENGTH, CREATE_TIME, UPDATE_TIME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [config.database]
  );

  // Get all columns
  const [columns] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH,
            IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [config.database]
  );

  // Get foreign keys
  const [fks] = await pool.query(
    `SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [config.database]
  );

  // Group columns by table
  const columnsByTable = {};
  columns.forEach(c => {
    if (!columnsByTable[c.TABLE_NAME]) columnsByTable[c.TABLE_NAME] = [];
    columnsByTable[c.TABLE_NAME].push({
      name: c.COLUMN_NAME,
      type: c.DATA_TYPE,
      maxLength: c.CHARACTER_MAXIMUM_LENGTH,
      nullable: c.IS_NULLABLE === 'YES',
      isPrimaryKey: c.COLUMN_KEY === 'PRI',
      isForeignKey: c.COLUMN_KEY === 'MUL',
      defaultValue: c.COLUMN_DEFAULT,
      position: c.ORDINAL_POSITION,
    });
  });

  // Group FKs by table
  const fksByTable = {};
  fks.forEach(fk => {
    if (!fksByTable[fk.TABLE_NAME]) fksByTable[fk.TABLE_NAME] = [];
    fksByTable[fk.TABLE_NAME].push({
      constraint: fk.CONSTRAINT_NAME,
      column: fk.COLUMN_NAME,
      referencedTable: fk.REFERENCED_TABLE_NAME,
      referencedColumn: fk.REFERENCED_COLUMN_NAME,
    });
  });

  // Build table objects
  const schema = tables.map(t => ({
    name: t.TABLE_NAME,
    type: t.TABLE_NAME.startsWith('Fact') ? 'fact' : t.TABLE_NAME.startsWith('Dim') ? 'dimension' : 'table',
    rowCount: t.TABLE_ROWS || 0,
    sizeBytes: t.DATA_LENGTH || 0,
    createdAt: t.CREATE_TIME,
    updatedAt: t.UPDATE_TIME,
    columns: columnsByTable[t.TABLE_NAME] || [],
    foreignKeys: fksByTable[t.TABLE_NAME] || [],
    columnCount: (columnsByTable[t.TABLE_NAME] || []).length,
    pkColumns: (columnsByTable[t.TABLE_NAME] || []).filter(c => c.isPrimaryKey).map(c => c.name),
    fkCount: (fksByTable[t.TABLE_NAME] || []).length,
  }));

  return {
    database: config.database,
    host: config.host,
    tableCount: schema.length,
    totalColumns: columns.length,
    totalForeignKeys: fks.length,
    tables: schema,
  };
}

// Compute data quality metrics for a table
async function computeDataQuality(config, tableName) {
  const pool = await getPool(config);

  try {
    // Row count
    const [countResult] = await pool.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
    const rowCount = countResult[0].cnt;

    // Null analysis per column
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [config.database, tableName]
    );

    let totalCols = cols.length;
    let nonNullCols = 0;

    if (rowCount > 0 && totalCols > 0) {
      // Sample first 10 columns for null check (performance)
      const checkCols = cols.slice(0, 10).map(c => c.COLUMN_NAME);
      const nullChecks = checkCols.map(c => `SUM(CASE WHEN \`${c}\` IS NULL THEN 1 ELSE 0 END) as \`null_${c}\``);
      const [nullResult] = await pool.query(`SELECT ${nullChecks.join(',')} FROM \`${tableName}\``);
      const nullCounts = nullResult[0];
      nonNullCols = checkCols.filter(c => (nullCounts[`null_${c}`] || 0) === 0).length;
    }

    const completeness = totalCols > 0 ? Math.round((nonNullCols / Math.min(totalCols, 10)) * 100) : 0;

    return {
      tableName,
      rowCount,
      columnCount: totalCols,
      completeness,
      uniqueness: 95, // Simplified — would need DISTINCT count per column
      freshness: 85,  // Simplified — would need actual update timestamps
    };
  } catch (e) {
    return { tableName, rowCount: 0, error: e.message };
  }
}

// Get sample rows from a table
async function getSampleData(config, tableName, limit = 20) {
  const pool = await getPool(config);
  // Safety: whitelist table name
  const [tables] = await pool.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [config.database, tableName]
  );
  if (tables.length === 0) throw new Error(`Table not found: ${tableName}`);

  const [rows] = await pool.query(`SELECT * FROM \`${tableName}\` LIMIT ?`, [limit]);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { tableName, columns, rows, rowCount: rows.length };
}

// Execute a read-only SQL query with safety checks
async function executeQuery(config, sql) {
  // Safety: block dangerous keywords
  if (BLOCKED_KEYWORDS.test(sql)) {
    throw new Error('Query blocked: only SELECT and WITH (CTE) statements are allowed.');
  }

  // Ensure LIMIT exists
  if (!/\bLIMIT\b/i.test(sql)) {
    sql = sql.replace(/;?\s*$/, ` LIMIT ${MAX_ROWS}`);
  }

  const pool = await getPool(config);
  const startTime = Date.now();

  try {
    const [rows, fields] = await pool.query({ sql, timeout: QUERY_TIMEOUT });
    const timingMs = Date.now() - startTime;
    const columns = fields ? fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);

    return {
      columns,
      rows: rows.slice(0, MAX_ROWS),
      rowCount: rows.length,
      truncated: rows.length >= MAX_ROWS,
      timingMs,
    };
  } catch (e) {
    throw new Error(`Query execution failed: ${e.message}`);
  }
}

// List available databases on a server
async function listDatabases(config) {
  const pool = await getPool({ ...config, database: 'information_schema' });
  const [rows] = await pool.query(
    `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
     WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
     ORDER BY SCHEMA_NAME`
  );
  return rows.map(r => r.SCHEMA_NAME);
}

module.exports = {
  isAvailable,
  testConnection,
  discoverSchema,
  computeDataQuality,
  getSampleData,
  executeQuery,
  listDatabases,
};
