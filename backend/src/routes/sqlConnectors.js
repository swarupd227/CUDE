// SQL Database Connector Routes — structured data discovery, schema browsing, NLQ-to-SQL
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const sqlService = require('../services/sqlConnectorService');

// Default demo connection (Docker MySQL with AdventureWorks)
const DEMO_CONFIG = {
  host: process.env.MYSQL_HOST || 'mysql',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'cude',
  password: process.env.MYSQL_PASSWORD || 'cude_demo_pass',
  database: process.env.MYSQL_DATABASE || 'adventureworks',
};

// Get connection config from request or use demo
function getConfig(body) {
  if (body.host) {
    return {
      host: body.host,
      port: body.port || 3306,
      user: body.user || body.username,
      password: body.password,
      database: body.database,
    };
  }
  return { ...DEMO_CONFIG, database: body.database || DEMO_CONFIG.database };
}

// ── Test Connection ─────────────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  try {
    const config = getConfig(req.body);
    const result = await sqlService.testConnection(config);
    res.json(result);
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ── List Databases ──────────────────────────────────────────────────────────
router.get('/databases', async (req, res) => {
  try {
    const config = getConfig(req.query);
    const databases = await sqlService.listDatabases(config);
    res.json({ databases });
  } catch (e) {
    res.json({ databases: [], error: e.message });
  }
});

// ── Discover Schema ─────────────────────────────────────────────────────────
router.post('/schema', async (req, res) => {
  try {
    const config = getConfig(req.body);
    const schema = await sqlService.discoverSchema(config);
    res.json(schema);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Scan — Discover tables and register as CUDE assets ──────────────────────
router.post('/scan', async (req, res) => {
  try {
    const config = getConfig(req.body);
    const projectId = req.body.project_id || null;
    const projectCode = req.body.project_code || 'SQL_SCAN';

    const schema = await sqlService.discoverSchema(config);
    const newAssets = [];

    const { inferContentSignals, evaluateClassification, computeConfidence, determineZone, loadProjectRules } = require('../services/policyEngine');

    for (const table of schema.tables) {
      // Compute data quality
      let quality = { completeness: 80, uniqueness: 95, freshness: 85 };
      try {
        quality = await sqlService.computeDataQuality(config, table.name);
      } catch (_) {}

      // Classify using policy engine — same as file connectors
      const signals = inferContentSignals(table.name, 'STRUCTURED_DATA', { domain_metadata: { columns: table.columns } });
      const projectRules = projectId ? await loadProjectRules(projectId) : [];
      const policy = evaluateClassification(signals, projectRules);
      const confResult = computeConfidence(signals, policy.matched_rules, {}, table.name);
      const conf = confResult.confidence;
      const zone = determineZone(conf, policy.recommended_tier);

      const asset = {
        id: uuidv4(),
        file_name: table.name,
        full_path: `mysql://${config.host}:${config.port}/${config.database}/${table.name}`,
        content_domain: 'STRUCTURED_DATA',
        asset_type: table.type === 'fact' ? 'FACT_TABLE' : table.type === 'dimension' ? 'DIMENSION_TABLE' : 'TABLE',
        project_id: projectId,
        project_code: projectCode,
        designer: config.user,
        file_size_mb: (table.sizeBytes || 0) / (1024 * 1024),
        data_classification: policy.recommended_tier,
        classification_confidence: conf,
        classification_zone: zone,
        lifecycle_state: 'CLASSIFIED',
        release_status: 'WIP',
        source_connector: 'mysql',
        created_at: table.createdAt || new Date().toISOString(),
        modified_at: table.updatedAt || new Date().toISOString(),
        discovered_at: new Date().toISOString(),
        vault_path: `${config.database}.${table.name}`,
        domain_metadata: {
          table_type: table.type,
          row_count: table.rowCount || quality.rowCount || 0,
          column_count: table.columnCount,
          pk_columns: table.pkColumns,
          fk_count: table.fkCount,
          foreign_keys: table.foreignKeys,
          columns: table.columns,
          data_quality: {
            completeness: quality.completeness,
            uniqueness: quality.uniqueness,
            freshness: quality.freshness,
          },
        },
        quality_score: (quality.completeness + quality.uniqueness + quality.freshness) / 300,
      };

      newAssets.push(asset);

      // Persist to PostgreSQL
      try {
        const assetRepo = require('../db/repositories/assetRepo');
        await assetRepo.create(asset);
      } catch (_) {}

      // Add to Neo4j
      try {
        const graphService = require('../services/graphService');
        if (graphService.isAvailable()) {
          await graphService.upsertAssetNode(asset);
        }
      } catch (_) {}
    }

    // Create FK relationships in Neo4j + PostgreSQL
    const { query: dbQuery } = require('../db/pool');
    for (const table of schema.tables) {
      for (const fk of (table.foreignKeys || [])) {
        const sourceAsset = newAssets.find(a => a.file_name === table.name);
        const targetAsset = newAssets.find(a => a.file_name === fk.referencedTable);
        if (sourceAsset && targetAsset) {
          try {
            const graphService = require('../services/graphService');
            if (graphService.isAvailable()) {
              await graphService.createRelationship(sourceAsset.id, targetAsset.id, 'FOREIGN_KEY', 1.0,
                `${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`);
            }
          } catch (_) {}
          try {
            await dbQuery(
              `INSERT INTO asset_relationships (id, source_asset_id, target_asset_id, relationship_type, confidence, evidence, project_id, created_at)
               VALUES (gen_random_uuid(), $1, $2, 'FOREIGN_KEY', 1.0, $3, $4, NOW()) ON CONFLICT DO NOTHING`,
              [sourceAsset.id, targetAsset.id,
               JSON.stringify({ column: fk.column, referenced_table: fk.referencedTable, referenced_column: fk.referencedColumn }),
               projectId]
            );
          } catch (_) {}
        }
      }
    }

    // Add to in-memory catalog
    try {
      const { catalog } = require('../data/seedData');
      newAssets.forEach(a => catalog.unshift(a));
    } catch (_) {}

    // Index in Elasticsearch + compute embeddings
    try {
      const searchService = require('../services/searchService');
      if (searchService.isAvailable()) {
        for (const a of newAssets) searchService.indexAsset(a).catch(() => {});
      }
    } catch (_) {}
    try {
      const embeddingService = require('../services/embeddingService');
      if (embeddingService.isAvailable()) {
        for (const a of newAssets) {
          const colNames = a.domain_metadata?.columns?.map(c => c.name).join(' ') || '';
          embeddingService.embedAsset(a.id, [a.file_name, 'STRUCTURED_DATA', a.project_code || '', colNames].join(' ')).catch(() => {});
        }
      }
    } catch (_) {}

    // Audit
    try {
      const auditRepo = require('../db/repositories/auditRepo');
      auditRepo.write({ actor_type:'SYSTEM', actor_id:'Pipeline Orchestrator', action:'connector.scanned',
        entity_type:'connector', entity_id:'mysql', after_state:{ database: config.database, tables: newAssets.length } }).catch(() => {});
    } catch (_) {}

    const domainSummary = { STRUCTURED_DATA: newAssets.length };
    res.json({
      scan_path: `mysql://${config.host}/${config.database}`,
      total_found: schema.tableCount,
      processed: newAssets.length,
      assets: newAssets,
      domain_summary: domainSummary,
      schema_summary: {
        tables: schema.tableCount,
        columns: schema.totalColumns,
        foreign_keys: schema.totalForeignKeys,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sample Data ─────────────────────────────────────────────────────────────
router.get('/sample/:table', async (req, res) => {
  try {
    const config = getConfig(req.query);
    const data = await sqlService.getSampleData(config, req.params.table, parseInt(req.query.limit) || 20);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Execute SQL Query (read-only) ───────────────────────────────────────────
router.post('/query', async (req, res) => {
  const { sql, database } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql is required' });

  try {
    const config = getConfig(req.body);
    const result = await sqlService.executeQuery(config, sql);

    // Audit log
    try {
      const auditRepo = require('../db/repositories/auditRepo');
      auditRepo.write({
        actor_type: 'USER', actor_id: req.user?.email || 'admin',
        action: 'sql.query_executed', entity_type: 'database', entity_id: config.database,
        after_state: { sql: sql.substring(0, 500), rows: result.rowCount, timing_ms: result.timingMs },
      }).catch(() => {});
    } catch (_) {}

    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── NLQ-to-SQL — Natural language to SQL translation ────────────────────────
router.post('/nlq', async (req, res) => {
  const { question, database } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  try {
    const config = getConfig(req.body);

    // Get schema context for Claude
    const schema = await sqlService.discoverSchema(config);
    const schemaContext = schema.tables.map(t => {
      const cols = t.columns.map(c => `${c.name} ${c.type}${c.isPrimaryKey ? ' PK' : ''}${c.isForeignKey ? ' FK' : ''}`).join(', ');
      const fks = t.foreignKeys.map(fk => `${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`).join('; ');
      return `${t.name} (${t.type}): [${cols}]${fks ? ` FK: ${fks}` : ''}`;
    }).join('\n');

    // Call Claude to generate SQL
    const { nlqToSql } = require('../services/claudeService');
    const result = await nlqToSql(question, schemaContext, config.database);

    // Execute the generated SQL
    if (result.sql) {
      try {
        const queryResult = await sqlService.executeQuery(config, result.sql);
        res.json({
          ...result,
          ...queryResult,
          question,
          database: config.database,
        });
      } catch (execErr) {
        res.json({ ...result, error: execErr.message, question });
      }
    } else {
      res.json({ ...result, question });
    }
  } catch (e) {
    res.status(500).json({ error: e.message, question });
  }
});

module.exports = router;
