// Column-level lineage service
// - Ingests dbt-style project descriptors (either real manifest.json or our
//   internal sampleLineageProjects.js format) into asset_columns + column_lineage.
// - Provides upstream/downstream traversal with depth control.
// - Provides impact analysis (everything reachable downstream from a column).

const { query: dbQuery } = require('../db/pool');

// ── Ingestion ──────────────────────────────────────────────────────────────

// Ingest one model: create/find its asset, upsert columns, upsert lineage edges.
async function ingestModel(model, project, modelByName) {
  // Asset: one row per model. Use the model's full identifier as a stable key.
  const fileName = `${project.database}.${model.schema}.${model.name}`;
  const fullPath = `dbt://${project.project_name}/${model.unique_id}`;

  // Upsert asset using full_path (partial unique index for source_connector='dbt')
  const assetUpsert = await dbQuery(
    `INSERT INTO assets (file_name, full_path, content_domain, asset_format, lifecycle_state,
                         source_connector, domain_metadata, ai_enriched)
     VALUES ($1, $2, $3, 'TABLE', 'CLASSIFIED', 'dbt', $4, true)
     ON CONFLICT (full_path) WHERE source_connector = 'dbt' DO UPDATE
       SET file_name = $1, content_domain = $3, domain_metadata = $4, updated_at = now()
     RETURNING id`,
    [
      fileName, fullPath, model.domain || 'STRUCTURED_DATA',
      JSON.stringify({
        dbt_unique_id: model.unique_id,
        dbt_layer: model.layer,          // source / staging / mart
        dbt_schema: model.schema,
        dbt_project: project.project_name,
        dbt_description: model.description || '',
        industry: project.industry || null,
      }),
    ]
  );
  const assetId = assetUpsert.rows[0].id;

  // Upsert columns
  const columnIds = {};
  for (const col of model.columns) {
    const upsert = await dbQuery(
      `INSERT INTO asset_columns
         (asset_id, column_name, data_type, ordinal_position, is_primary_key,
          is_pii, pii_type, classification, description, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'dbt')
       ON CONFLICT (asset_id, column_name) DO UPDATE
         SET data_type = EXCLUDED.data_type,
             ordinal_position = EXCLUDED.ordinal_position,
             is_primary_key = EXCLUDED.is_primary_key,
             is_pii = EXCLUDED.is_pii,
             pii_type = EXCLUDED.pii_type,
             classification = EXCLUDED.classification,
             description = EXCLUDED.description,
             updated_at = now()
       RETURNING id`,
      [
        assetId, col.name, col.type || null, col.ordinal || null,
        !!col.is_pk, !!col.is_pii, col.pii_type || null,
        col.classification || null, col.description || '',
      ]
    );
    columnIds[col.name] = upsert.rows[0].id;
  }

  return { assetId, columnIds, model };
}

// Apply column_lineage edges within a model (now that all upstream models are ingested).
async function applyColumnLineage(modelResult, ingestedByModelName) {
  const { columnIds, model } = modelResult;
  if (!model.column_lineage || !model.column_lineage.length) return 0;

  let added = 0;
  for (const edge of model.column_lineage) {
    // edge.from = "upstream_model.column", edge.to = "downstream_column"
    const [upstreamModelName, upstreamColumn] = edge.from.split('.');
    const upstream = ingestedByModelName[upstreamModelName];
    if (!upstream) continue;
    const upstreamColId = upstream.columnIds[upstreamColumn];
    const downstreamColId = columnIds[edge.to];
    if (!upstreamColId || !downstreamColId) continue;

    try {
      await dbQuery(
        `INSERT INTO column_lineage
           (upstream_column_id, downstream_column_id, transformation_type,
            transformation_sql, confidence, source)
         VALUES ($1, $2, $3, $4, $5, 'dbt_manifest')
         ON CONFLICT (upstream_column_id, downstream_column_id) DO UPDATE
           SET transformation_type = EXCLUDED.transformation_type,
               transformation_sql = EXCLUDED.transformation_sql`,
        [
          upstreamColId, downstreamColId,
          edge.transform || 'direct',
          edge.sql || null,
          edge.confidence || 1.00,
        ]
      );
      added++;
    } catch (_) {}
  }
  return added;
}

// Ingest an entire project (in dependency order so lineage edges resolve).
async function ingestProject(project) {
  const ingestedByModelName = {};
  const ingestedByUniqueId = {};

  // Topological-ish: sources first, then staging, then marts.
  const layerOrder = { source: 0, staging: 1, intermediate: 2, mart: 3 };
  const sorted = [...project.models].sort(
    (a, b) => (layerOrder[a.layer] ?? 50) - (layerOrder[b.layer] ?? 50)
  );

  let assetsAdded = 0, columnsAdded = 0, lineageAdded = 0;
  for (const model of sorted) {
    const result = await ingestModel(model, project, ingestedByModelName);
    ingestedByModelName[model.name] = result;
    ingestedByUniqueId[model.unique_id] = result;
    assetsAdded++;
    columnsAdded += Object.keys(result.columnIds).length;
  }

  // Now that all models exist, wire up column_lineage edges.
  for (const uniqueId of Object.keys(ingestedByUniqueId)) {
    const result = ingestedByUniqueId[uniqueId];
    lineageAdded += await applyColumnLineage(result, ingestedByModelName);
  }

  return {
    project: project.project_name,
    industry: project.industry,
    counts: { assets: assetsAdded, columns: columnsAdded, lineage_edges: lineageAdded },
  };
}

// Ingest a real dbt manifest.json (best-effort — uses depends_on for asset-level
// and column.lineage if present in newer dbt versions).
async function ingestDbtManifest(manifest, projectName = 'dbt_project') {
  // Convert manifest.nodes into our internal project format
  const nodes = manifest.nodes || {};
  const sources = manifest.sources || {};
  const allNodes = { ...sources, ...nodes };

  const models = Object.entries(allNodes).map(([uniqueId, node]) => {
    const isSource = node.resource_type === 'source';
    const layer = isSource ? 'source'
                  : node.path?.includes('/staging/') ? 'staging'
                  : node.path?.includes('/marts/') ? 'mart'
                  : 'intermediate';
    const columns = Object.entries(node.columns || {}).map(([name, c]) => ({
      name,
      type: c.data_type || null,
      description: c.description || '',
      is_pii: !!(c.meta?.pii),
      pii_type: c.meta?.pii_type || null,
      classification: c.meta?.classification || null,
    }));

    return {
      unique_id: uniqueId,
      name: node.name || node.alias || uniqueId.split('.').pop(),
      schema: node.schema || 'public',
      layer,
      description: node.description || '',
      domain: 'STRUCTURED_DATA',
      columns,
      depends_on: node.depends_on?.nodes || [],
      column_lineage: [], // newer dbt versions may include this; for simplicity ignored here
    };
  });

  return ingestProject({
    project_name: projectName,
    description: manifest.metadata?.project_name || projectName,
    industry: null,
    database: manifest.metadata?.adapter_type === 'snowflake' ? 'WAREHOUSE' : 'DB',
    models,
  });
}

// ── Query helpers ──────────────────────────────────────────────────────────

async function getColumnsForAsset(assetId) {
  const r = await dbQuery(
    `SELECT * FROM asset_columns WHERE asset_id = $1 ORDER BY ordinal_position NULLS LAST, column_name`,
    [assetId]
  );
  return r.rows;
}

async function getUpstreamLineage(columnId, depth = 3) {
  // Recursive CTE to walk upstream up to `depth` hops.
  const r = await dbQuery(
    `WITH RECURSIVE upstream AS (
       SELECT cl.upstream_column_id, cl.downstream_column_id,
              cl.transformation_type, cl.transformation_sql, cl.confidence,
              1 AS hop
       FROM column_lineage cl
       WHERE cl.downstream_column_id = $1
       UNION ALL
       SELECT cl.upstream_column_id, cl.downstream_column_id,
              cl.transformation_type, cl.transformation_sql, cl.confidence,
              u.hop + 1
       FROM column_lineage cl
       JOIN upstream u ON cl.downstream_column_id = u.upstream_column_id
       WHERE u.hop < $2
     )
     SELECT u.*,
            uc.column_name AS upstream_column, uc.data_type AS upstream_type,
            ua.id AS upstream_asset_id, ua.file_name AS upstream_asset,
            ua.domain_metadata->>'dbt_layer' AS upstream_layer,
            dc.column_name AS downstream_column,
            da.id AS downstream_asset_id, da.file_name AS downstream_asset
     FROM upstream u
     JOIN asset_columns uc ON u.upstream_column_id = uc.id
     JOIN assets ua ON uc.asset_id = ua.id
     JOIN asset_columns dc ON u.downstream_column_id = dc.id
     JOIN assets da ON dc.asset_id = da.id
     ORDER BY u.hop, ua.file_name`,
    [columnId, depth]
  );
  return r.rows;
}

async function getDownstreamLineage(columnId, depth = 3) {
  const r = await dbQuery(
    `WITH RECURSIVE downstream AS (
       SELECT cl.upstream_column_id, cl.downstream_column_id,
              cl.transformation_type, cl.transformation_sql, cl.confidence,
              1 AS hop
       FROM column_lineage cl
       WHERE cl.upstream_column_id = $1
       UNION ALL
       SELECT cl.upstream_column_id, cl.downstream_column_id,
              cl.transformation_type, cl.transformation_sql, cl.confidence,
              d.hop + 1
       FROM column_lineage cl
       JOIN downstream d ON cl.upstream_column_id = d.downstream_column_id
       WHERE d.hop < $2
     )
     SELECT d.*,
            uc.column_name AS upstream_column,
            ua.id AS upstream_asset_id, ua.file_name AS upstream_asset,
            dc.column_name AS downstream_column, dc.data_type AS downstream_type,
            da.id AS downstream_asset_id, da.file_name AS downstream_asset,
            da.domain_metadata->>'dbt_layer' AS downstream_layer
     FROM downstream d
     JOIN asset_columns uc ON d.upstream_column_id = uc.id
     JOIN assets ua ON uc.asset_id = ua.id
     JOIN asset_columns dc ON d.downstream_column_id = dc.id
     JOIN assets da ON dc.asset_id = da.id
     ORDER BY d.hop, da.file_name`,
    [columnId, depth]
  );
  return r.rows;
}

async function getImpactAnalysis(columnId) {
  // Everything downstream from this column, with summary stats.
  const downstream = await getDownstreamLineage(columnId, 10);
  const uniqueAssets = new Set(downstream.map(r => r.downstream_asset_id));
  const uniqueColumns = new Set(downstream.map(r => r.downstream_column_id));
  return {
    impacted_columns: uniqueColumns.size,
    impacted_assets: uniqueAssets.size,
    edges: downstream.length,
    max_depth: downstream.reduce((m, r) => Math.max(m, parseInt(r.hop)), 0),
    details: downstream,
  };
}

async function getStats() {
  const r = await dbQuery(`
    SELECT
      (SELECT COUNT(*) FROM asset_columns) AS columns,
      (SELECT COUNT(DISTINCT asset_id) FROM asset_columns) AS assets_with_columns,
      (SELECT COUNT(*) FROM column_lineage) AS lineage_edges,
      (SELECT COUNT(*) FROM asset_columns WHERE is_pii) AS pii_columns
  `);
  return {
    columns: parseInt(r.rows[0].columns) || 0,
    assets_with_columns: parseInt(r.rows[0].assets_with_columns) || 0,
    lineage_edges: parseInt(r.rows[0].lineage_edges) || 0,
    pii_columns: parseInt(r.rows[0].pii_columns) || 0,
  };
}

async function seedSamplesIfEmpty() {
  const stats = await getStats();
  if (stats.columns > 0) return { skipped: true, reason: `${stats.columns} columns already present` };

  const { SAMPLE_PROJECTS } = require('../data/sampleLineageProjects');
  const results = [];
  for (const project of SAMPLE_PROJECTS) {
    try { results.push(await ingestProject(project)); } catch (e) {
      console.log(`⚠️  Sample lineage seed (${project.project_name}) failed:`, e.message);
    }
  }
  return { seeded: true, projects: results };
}

async function listAssetsWithColumns() {
  const r = await dbQuery(`
    SELECT a.id, a.file_name, a.content_domain,
           a.domain_metadata->>'dbt_layer' AS layer,
           a.domain_metadata->>'dbt_project' AS project,
           a.domain_metadata->>'industry' AS industry,
           COUNT(c.id) AS column_count,
           SUM(CASE WHEN c.is_pii THEN 1 ELSE 0 END) AS pii_count
    FROM assets a
    JOIN asset_columns c ON c.asset_id = a.id
    GROUP BY a.id
    ORDER BY a.domain_metadata->>'dbt_project', a.domain_metadata->>'dbt_layer', a.file_name
  `);
  return r.rows;
}

module.exports = {
  ingestProject,
  ingestDbtManifest,
  getColumnsForAsset,
  getUpstreamLineage,
  getDownstreamLineage,
  getImpactAnalysis,
  getStats,
  seedSamplesIfEmpty,
  listAssetsWithColumns,
};
