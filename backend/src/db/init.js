// Database initialization — run migrations and seed default data on first startup
const path = require('path');
const { testConnection, runMigration, query } = require('./pool');

async function initDatabase() {
  console.log('🗄️  Connecting to PostgreSQL...');
  const conn = await testConnection();
  if (!conn.connected) {
    console.error('❌  PostgreSQL connection failed:', conn.error);
    console.log('   Falling back to in-memory mode. Set USE_DATABASE=false to suppress this warning.\n');
    return false;
  }
  console.log('✅  PostgreSQL connected at', conn.timestamp);

  // Run extensions first (must be separate statements)
  try {
    await query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await query('CREATE EXTENSION IF NOT EXISTS "vector"');
  } catch (e) {
    console.log('⚠️  Extension creation skipped:', e.message);
  }

  // Run migrations
  console.log('📋  Running database migrations...');
  const migrationPath = path.join(__dirname, 'migrations', '001_foundation.sql');
  try {
    await runMigration(migrationPath);
    // Phase 3: pgvector embeddings
    const migration002 = path.join(__dirname, 'migrations', '002_pgvector.sql');
    try { await runMigration(migration002); } catch (_) {}
    // Connector templates
    const migration003 = path.join(__dirname, 'migrations', '003_connector_templates.sql');
    try { await runMigration(migration003); } catch (_) {}
    // Business glossary
    const migration004 = path.join(__dirname, 'migrations', '004_business_glossary.sql');
    try { await runMigration(migration004); } catch (_) {}
    // Ontology schema
    const migration005 = path.join(__dirname, 'migrations', '005_ontology_schema.sql');
    try { await runMigration(migration005); } catch (_) {}
    console.log('✅  Migrations complete.');
  } catch (e) {
    console.error('⚠️  Migration warning:', e.message);
  }

  // Seed default policy rules if none exist
  const ruleCount = await query('SELECT COUNT(*) as count FROM policy_rules WHERE project_id IS NULL');
  if (parseInt(ruleCount.rows[0].count) === 0) {
    console.log('🌱  Seeding default policy rules...');
    const defaultRules = [
      { code:'R-01', tier:'TRADE_SECRET', signals:['die_cost_data','yield_data','process_node_params'], desc:'Die cost, yield, or process parameters detected', priority:5 },
      { code:'R-02', tier:'TRADE_SECRET', signals:['unreleased_ip_core','mask_shop_delivery'], desc:'Unreleased IP core or mask shop data', priority:5 },
      { code:'R-14', tier:'RESTRICTED', signals:['tapeout_schedule','customer_nda'], desc:'Tapeout schedule + customer NDA reference', priority:10 },
      { code:'R-15', tier:'RESTRICTED', signals:['competitive_teardown','unreleased_device'], desc:'Competitor teardown of unreleased device', priority:10 },
      { code:'R-16', tier:'RESTRICTED', signals:['financial_projection','customer_nda'], desc:'Financial projections under NDA', priority:10 },
      { code:'R-17', tier:'RESTRICTED', signals:['tapeout_schedule'], desc:'Tapeout or tape-in schedule reference', priority:15 },
      { code:'R-18', tier:'RESTRICTED', signals:['customer_design_win'], desc:'Named customer design win', priority:15 },
      { code:'R-22', tier:'RESTRICTED', signals:['embedded_circuit','customer_nda'], desc:'Embedded circuit + customer NDA reference', priority:15 },
      { code:'R-30', tier:'CONFIDENTIAL', signals:['product_roadmap'], desc:'Product roadmap content', priority:20 },
      { code:'R-31', tier:'CONFIDENTIAL', signals:['internal_pricing'], desc:'Internal pricing or cost data', priority:20 },
      { code:'R-32', tier:'CONFIDENTIAL', signals:['personnel_info'], desc:'Personnel or HR information', priority:25 },
      { code:'R-40', tier:'INTERNAL', signals:['internal_procedure'], desc:'Internal procedure or process document', priority:30 },
      { code:'R-50', tier:'PUBLIC', signals:['public_datasheet','press_release'], desc:'Published public content', priority:40 },
    ];
    for (const r of defaultRules) {
      try {
        await query(
          `INSERT INTO policy_rules (project_id, rule_code, description, signals, recommended_tier, priority)
           VALUES (NULL, $1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          [r.code, r.desc, r.signals, r.tier, r.priority]
        );
      } catch (_) {}
    }
    console.log('✅  Default policy rules seeded.');
  }

  // Seed AdventureWorks MySQL connector template if none exists
  try {
    const templateCount = await query("SELECT COUNT(*) as count FROM connector_templates WHERE type = 'mysql'");
    if (parseInt(templateCount.rows[0].count) === 0) {
      console.log('🌱  Seeding AdventureWorks MySQL connector template...');
      await query(
        `INSERT INTO connector_templates (id, type, name, category, icon, description, config, auth_type, supported_domains, is_builtin, created_at, updated_at)
         VALUES (gen_random_uuid(), 'mysql', 'AdventureWorks (Demo MySQL)', 'Database', '🗄️',
                 'Pre-configured MySQL connector for the AdventureWorks DW demo database running in Docker. Contains sales, products, customers, and territory data.',
                 $1, 'CREDENTIALS', ARRAY['STRUCTURED_DATA'], true, NOW(), NOW())`,
        [JSON.stringify({
          host: 'mysql',
          port: 3306,
          user: 'cude',
          password: 'cude_demo_pass',
          database: 'adventureworks'
        })]
      );
      console.log('✅  AdventureWorks connector template seeded.');
    }
  } catch (e) {
    console.log('⚠️  Connector template seeding skipped:', e.message);
  }

  return true;
}

module.exports = { initDatabase };
