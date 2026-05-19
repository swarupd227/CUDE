// Neo4j Knowledge Graph service — persistent asset relationship graph
// Falls back gracefully if Neo4j is not available

let driver = null;
let available = false;
const neo4j = require('neo4j-driver');

// Convert JS number to Neo4j integer (required for LIMIT, depth, etc.)
const neoInt = (n) => neo4j.int(parseInt(n) || 0);

async function init() {
  try {
    const url = process.env.NEO4J_URL || 'bolt://localhost:7687';
    const password = process.env.NEO4J_PASSWORD || 'cude_graph_pass';
    driver = neo4j.driver(url, neo4j.auth.basic('neo4j', password));
    await driver.verifyConnectivity();

    // Create constraints
    const session = driver.session();
    try {
      await session.run('CREATE CONSTRAINT asset_id IF NOT EXISTS FOR (a:Asset) REQUIRE a.id IS UNIQUE');
      await session.run('CREATE CONSTRAINT project_code IF NOT EXISTS FOR (p:Project) REQUIRE p.code IS UNIQUE');
    } catch (_) {} // Constraints may already exist
    finally { await session.close(); }

    available = true;
    return true;
  } catch (e) {
    available = false;
    return false;
  }
}

async function upsertAssetNode(asset) {
  if (!available) return;
  const session = driver.session();
  try {
    await session.run(
      `MERGE (a:Asset {id: $id})
       SET a.fileName = $fileName, a.domain = $domain, a.classification = $classification,
           a.zone = $zone, a.projectCode = $projectCode, a.format = $format,
           a.confidence = $confidence, a.updatedAt = datetime()`,
      {
        id: asset.id, fileName: asset.file_name, domain: asset.content_domain,
        classification: asset.data_classification, zone: asset.classification_zone,
        projectCode: asset.project_code || '', format: asset.asset_type || asset.asset_format || '',
        confidence: asset.classification_confidence || 0,
      }
    );

    // Create project node and link
    if (asset.project_code) {
      await session.run(
        `MERGE (p:Project {code: $code})
         WITH p
         MATCH (a:Asset {id: $assetId})
         MERGE (a)-[:BELONGS_TO]->(p)`,
        { code: asset.project_code, assetId: asset.id }
      );
    }
  } catch (e) {
    console.error('Neo4j upsert error:', e.message);
  } finally { await session.close(); }
}

async function createRelationship(sourceId, targetId, relType, confidence, evidence) {
  if (!available) return;
  const session = driver.session();
  try {
    // Sanitize relationship type (Neo4j doesn't allow special chars)
    const safeType = relType.replace(/[^A-Z_]/g, '');
    await session.run(
      `MATCH (s:Asset {id: $sourceId}), (t:Asset {id: $targetId})
       MERGE (s)-[r:${safeType}]->(t)
       SET r.confidence = $confidence, r.evidence = $evidence, r.createdAt = datetime()`,
      { sourceId, targetId, confidence: confidence || 0.5, evidence: evidence || '' }
    );
  } catch (e) {
    console.error('Neo4j relationship error:', e.message);
  } finally { await session.close(); }
}

async function autoCreateProjectEdges(asset) {
  if (!available || !asset.project_code) return;
  const session = driver.session();
  try {
    // Create SAME_PROJECT edges to other assets in the same project (different domain = more interesting)
    await session.run(
      `MATCH (a:Asset {id: $id}), (b:Asset {projectCode: $projectCode})
       WHERE a.id <> b.id AND a.domain <> b.domain
       MERGE (a)-[r:SAME_PROJECT]->(b)
       SET r.confidence = 0.8, r.createdAt = datetime()`,
      { id: asset.id, projectCode: asset.project_code }
    );
  } catch (_) {} finally { await session.close(); }
}

async function getProjectGraph(projectCode, limit = 500, activeAssetIds = null) {
  if (!available) return null;
  const session = driver.session();
  try {
    // Query for nodes matching project (if specified) OR all if no project
    // Cross-check with activeAssetIds set (from PostgreSQL) to filter stale nodes
    const nodesQuery = projectCode
      ? `MATCH (a:Asset {projectCode: $projectCode}) RETURN a LIMIT $limit`
      : `MATCH (a:Asset) RETURN a LIMIT $limit`;
    const nodesResult = await session.run(nodesQuery, { projectCode, limit: neoInt(limit) });

    const nodesMap = {};
    for (const record of nodesResult.records) {
      const a = record.get('a').properties;
      // Skip stale nodes if we have an active asset list
      if (activeAssetIds && !activeAssetIds.has(a.id)) continue;
      nodesMap[a.id] = { id: a.id, label: a.fileName?.length > 28 ? a.fileName.substring(0,25)+'...' : a.fileName, full_name: a.fileName, domain: a.domain, classification: a.classification, zone: a.zone, confidence: a.confidence, project: a.projectCode };
    }

    // Now get edges between those nodes (semantic only)
    const nodeIds = Object.keys(nodesMap);
    const edges = [];
    if (nodeIds.length > 0) {
      const edgesResult = await session.run(
        `MATCH (a:Asset)-[r]->(b:Asset)
         WHERE a.id IN $nodeIds AND b.id IN $nodeIds
         AND NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO']
         RETURN a.id as source, b.id as target, type(r) as relType, r.confidence as confidence`,
        { nodeIds }
      );
      for (const record of edgesResult.records) {
        edges.push({
          source: record.get('source'), target: record.get('target'),
          relationship: record.get('relType'), confidence: record.get('confidence'),
        });
      }
    }

    return { nodes: Object.values(nodesMap), edges };
  } catch (e) {
    console.error('Neo4j project graph error:', e.message);
    return null;
  } finally { await session.close(); }
}

async function getAssetRelationships(assetId, depth = 2) {
  if (!available) return null;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH path = (a:Asset {id: $id})-[*1..${Math.min(depth, 4)}]-(b:Asset)
       WHERE NONE(r IN relationships(path) WHERE type(r) IN ['SAME_PROJECT', 'BELONGS_TO'])
       UNWIND relationships(path) as rel
       WITH startNode(rel) as s, endNode(rel) as t, type(rel) as relType, rel.confidence as conf
       RETURN DISTINCT s.id as sourceId, s.fileName as sourceName, s.domain as sourceDomain,
              t.id as targetId, t.fileName as targetName, t.domain as targetDomain,
              relType, conf
       LIMIT 50`,
      { id: assetId }
    );
    return result.records.map(r => ({
      source: { id: r.get('sourceId'), name: r.get('sourceName'), domain: r.get('sourceDomain') },
      target: { id: r.get('targetId'), name: r.get('targetName'), domain: r.get('targetDomain') },
      relationship: r.get('relType'), confidence: r.get('conf'),
    }));
  } catch { return null; } finally { await session.close(); }
}

// Upsert a :Concept node (glossary term) and link it to an asset
async function upsertConceptNode(term, category, definition) {
  if (!available) return;
  const session = driver.session();
  try {
    await session.run(
      `MERGE (c:Concept {name: $name})
       SET c.category = $category, c.definition = $definition, c.updatedAt = datetime()`,
      { name: term, category: category || 'General', definition: definition || '' }
    );
  } catch (e) {
    console.error('Neo4j concept upsert error:', e.message);
  } finally { await session.close(); }
}

async function linkAssetToConcept(assetId, conceptName) {
  if (!available) return;
  const session = driver.session();
  try {
    await session.run(
      `MATCH (a:Asset {id: $assetId}), (c:Concept {name: $conceptName})
       MERGE (a)-[r:TAGGED_WITH]->(c)
       SET r.createdAt = datetime()`,
      { assetId, conceptName }
    );
  } catch (e) {
    console.error('Neo4j concept link error:', e.message);
  } finally { await session.close(); }
}

// ── Enterprise Graph Queries ─────────────────────────────────────────────────
// IMPORTANT: All queries exclude structural edges (SAME_PROJECT, BELONGS_TO) which
// connect everything and produce meaningless results. Only semantic relationships count.
const STRUCTURAL_REL_TYPES = ['SAME_PROJECT', 'BELONGS_TO'];
const SEMANTIC_REL_FILTER = `AND NONE(r IN relationships(path) WHERE type(r) IN ['SAME_PROJECT', 'BELONGS_TO'])`;

function toNum(val) { return val?.toNumber?.() || val || 0; }

// Find shortest path between two assets (via semantic edges only)
async function findShortestPath(sourceId, targetId) {
  if (!available) return null;
  const session = driver.session();
  try {
    // shortestPath doesn't support WHERE on relationships, so use allShortestPaths + filter
    const result = await session.run(
      `MATCH (a:Asset {id: $sourceId}), (b:Asset {id: $targetId})
       MATCH p = allShortestPaths((a)-[*..8]-(b))
       WHERE NONE(r IN relationships(p) WHERE type(r) IN ['SAME_PROJECT', 'BELONGS_TO'])
       RETURN [n IN nodes(p) | {id: n.id, name: n.fileName, domain: n.domain, classification: n.classification}] as pathNodes,
              [r IN relationships(p) | {type: type(r), confidence: r.confidence}] as pathEdges,
              length(p) as distance
       ORDER BY distance ASC LIMIT 1`,
      { sourceId, targetId }
    );
    if (result.records.length === 0) return { found: false };
    const r = result.records[0];
    return { found: true, nodes: r.get('pathNodes'), edges: r.get('pathEdges'), distance: toNum(r.get('distance')) };
  } catch (e) {
    console.error('Neo4j shortest path error:', e.message);
    return null;
  } finally { await session.close(); }
}

// Dynamic neighborhood expansion — semantic edges only
async function getNeighbors(assetId, depth = 1, limit = 50) {
  if (!available) return null;
  const session = driver.session();
  try {
    const d = Math.min(depth, 4);
    const result = await session.run(
      `MATCH (center:Asset {id: $assetId})
       MATCH path = (center)-[*1..${d}]-(neighbor:Asset)
       WHERE neighbor.id <> $assetId
       AND NONE(r IN relationships(path) WHERE type(r) IN ['SAME_PROJECT', 'BELONGS_TO'])
       WITH DISTINCT neighbor, min(length(path)) as distance
       RETURN neighbor.id as id, neighbor.fileName as name, neighbor.domain as domain,
              neighbor.classification as classification, neighbor.zone as zone,
              neighbor.confidence as confidence, neighbor.projectCode as project, distance
       ORDER BY distance ASC, neighbor.fileName ASC
       LIMIT $limit`,
      { assetId, limit: neoInt(limit) }
    );
    return result.records.map(r => ({
      id: r.get('id'), name: r.get('name'), domain: r.get('domain'),
      classification: r.get('classification'), zone: r.get('zone'),
      confidence: r.get('confidence'), project: r.get('project'),
      distance: toNum(r.get('distance')),
    }));
  } catch (e) {
    console.error('Neo4j neighbors error:', e.message);
    return null;
  } finally { await session.close(); }
}

// Most connected assets — degree centrality (semantic edges only)
async function getMostConnectedAssets(limit = 10) {
  if (!available) return null;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Asset)-[r]-(b:Asset)
       WHERE NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO']
       WITH a, count(DISTINCT r) as degree, collect(DISTINCT type(r)) as relTypes
       WHERE degree > 0
       RETURN a.id as id, a.fileName as name, a.domain as domain,
              a.classification as classification, a.projectCode as project,
              degree, relTypes
       ORDER BY degree DESC
       LIMIT $limit`,
      { limit: neoInt(limit) }
    );
    return result.records.map(r => ({
      id: r.get('id'), name: r.get('name'), domain: r.get('domain'),
      classification: r.get('classification'), project: r.get('project'),
      degree: toNum(r.get('degree')),
      relationshipTypes: r.get('relTypes'),
    }));
  } catch (e) {
    console.error('Neo4j centrality error:', e.message);
    return null;
  } finally { await session.close(); }
}

// Find all paths between two assets (semantic only)
async function findAllPaths(sourceId, targetId, maxDepth = 4) {
  if (!available) return null;
  const session = driver.session();
  try {
    const d = Math.min(maxDepth, 6);
    const result = await session.run(
      `MATCH (a:Asset {id: $sourceId}), (b:Asset {id: $targetId})
       MATCH p = (a)-[*1..${d}]-(b)
       WHERE NONE(r IN relationships(p) WHERE type(r) IN ['SAME_PROJECT', 'BELONGS_TO'])
       WITH p, length(p) as distance
       ORDER BY distance ASC
       LIMIT 5
       RETURN [n IN nodes(p) | {id: n.id, name: n.fileName, domain: n.domain}] as nodes,
              [r IN relationships(p) | {type: type(r), conf: r.confidence}] as edges,
              distance`,
      { sourceId, targetId }
    );
    return result.records.map(r => ({
      nodes: r.get('nodes'), edges: r.get('edges'),
      distance: toNum(r.get('distance')),
    }));
  } catch (e) {
    console.error('Neo4j all paths error:', e.message);
    return null;
  } finally { await session.close(); }
}

// Graph statistics — shows both total and semantic-only counts
async function getGraphStatistics() {
  if (!available) return null;
  const session = driver.session();
  try {
    const stats = {};

    // Count nodes that exist in current catalog (cross-check with PostgreSQL)
    let activeAssetIds = null;
    try {
      const { query } = require('../db/pool');
      const pgResult = await query('SELECT id FROM assets');
      activeAssetIds = new Set(pgResult.rows.map(r => r.id));
    } catch (_) {}

    const nc = await session.run('MATCH (a:Asset) RETURN count(a) as c');
    const totalNeo4jNodes = toNum(nc.records[0]?.get('c'));

    // If we have PostgreSQL data, report active count; otherwise Neo4j total
    stats.nodeCount = activeAssetIds ? activeAssetIds.size : totalNeo4jNodes;
    if (activeAssetIds && totalNeo4jNodes > activeAssetIds.size) {
      stats.staleNodes = totalNeo4jNodes - activeAssetIds.size;
    }

    // Count only semantic edges (exclude SAME_PROJECT, BELONGS_TO)
    const ec = await session.run(
      `MATCH ()-[r]->() WHERE NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO'] RETURN count(r) as c`
    );
    stats.edgeCount = toNum(ec.records[0]?.get('c'));

    stats.density = stats.nodeCount > 1 ? parseFloat(((2 * stats.edgeCount) / (stats.nodeCount * (stats.nodeCount - 1))).toFixed(4)) : 0;
    stats.avgDegree = stats.nodeCount > 0 ? parseFloat(((2 * stats.edgeCount) / stats.nodeCount).toFixed(2)) : 0;

    // Orphans — assets with no SEMANTIC relationships
    const orphans = await session.run(
      `MATCH (a:Asset)
       OPTIONAL MATCH (a)-[r]-(:Asset)
       WHERE r IS NOT NULL AND NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO']
       WITH a, count(r) as semCount
       WHERE semCount = 0
       RETURN count(a) as c`
    );
    stats.orphanedNodes = toNum(orphans.records[0]?.get('c'));

    // Relationship type distribution (semantic only)
    const relDist = await session.run(
      `MATCH ()-[r]->() WHERE NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO']
       RETURN type(r) as t, count(r) as c ORDER BY c DESC`
    );
    stats.relationshipTypes = {};
    relDist.records.forEach(r => { stats.relationshipTypes[r.get('t')] = toNum(r.get('c')); });

    // Domain distribution
    const domDist = await session.run('MATCH (a:Asset) RETURN a.domain as d, count(a) as c ORDER BY c DESC');
    stats.domainDistribution = {};
    domDist.records.forEach(r => { if (r.get('d')) stats.domainDistribution[r.get('d')] = toNum(r.get('c')); });

    const concepts = await session.run('MATCH (c:Concept) RETURN count(c) as c');
    stats.conceptNodes = toNum(concepts.records[0]?.get('c'));

    return stats;
  } catch (e) {
    console.error('Neo4j stats error:', e.message);
    return null;
  } finally { await session.close(); }
}

// Orphaned assets — those with no semantic relationships
async function getOrphanedAssets(limit = 50) {
  if (!available) return null;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:Asset)
       WHERE NOT EXISTS {
         MATCH (a)-[r]-(:Asset) WHERE NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO']
       }
       RETURN a.id as id, a.fileName as name, a.domain as domain,
              a.classification as classification, a.projectCode as project
       LIMIT $limit`,
      { limit: neoInt(limit) }
    );
    return result.records.map(r => ({
      id: r.get('id'), name: r.get('name'), domain: r.get('domain'),
      classification: r.get('classification'), project: r.get('project'),
    }));
  } catch (e) {
    // Fallback for older Neo4j versions without EXISTS subquery
    try {
      const session2 = driver.session();
      const result2 = await session2.run(
        `MATCH (a:Asset)
         OPTIONAL MATCH (a)-[r]-(:Asset)
         WHERE NOT type(r) IN ['SAME_PROJECT', 'BELONGS_TO']
         WITH a, count(r) as semRels
         WHERE semRels = 0
         RETURN a.id as id, a.fileName as name, a.domain as domain,
                a.classification as classification, a.projectCode as project
         LIMIT $limit`,
        { limit: neoInt(limit) }
      );
      const res = result2.records.map(r => ({
        id: r.get('id'), name: r.get('name'), domain: r.get('domain'),
        classification: r.get('classification'), project: r.get('project'),
      }));
      await session2.close();
      return res;
    } catch (e2) {
      console.error('Neo4j orphaned error:', e2.message);
      return null;
    }
  } finally { await session.close(); }
}

// Impact analysis — semantic edges only (not SAME_PROJECT/BELONGS_TO)
async function getImpactAnalysis(assetId, maxDepth = 3) {
  if (!available) return null;
  const session = driver.session();
  try {
    const d = Math.min(maxDepth, 4);
    const result = await session.run(
      `MATCH (source:Asset {id: $assetId})
       MATCH path = (source)-[*1..${d}]-(impacted:Asset)
       WHERE impacted.id <> $assetId
       AND NONE(r IN relationships(path) WHERE type(r) IN ['SAME_PROJECT', 'BELONGS_TO'])
       WITH DISTINCT impacted, min(length(path)) as distance,
            collect(DISTINCT type(last(relationships(path)))) as viaRelTypes
       RETURN impacted.id as id, impacted.fileName as name, impacted.domain as domain,
              impacted.classification as classification, impacted.zone as zone,
              distance, viaRelTypes
       ORDER BY distance ASC, impacted.fileName ASC
       LIMIT 30`,
      { assetId }
    );
    return result.records.map(r => ({
      id: r.get('id'), name: r.get('name'), domain: r.get('domain'),
      classification: r.get('classification'), zone: r.get('zone'),
      distance: toNum(r.get('distance')),
      viaRelationships: r.get('viaRelTypes'),
    }));
  } catch (e) {
    console.error('Neo4j impact error:', e.message);
    return null;
  } finally { await session.close(); }
}

// Rebuild Neo4j from PostgreSQL — used after reconciliation when Neo4j is empty
async function rebuildFromPostgres() {
  if (!available) return { added: 0 };
  const session = driver.session();
  try {
    const { query } = require('../db/pool');
    // Load all active assets
    const assetsResult = await query(
      `SELECT id, file_name, content_domain, data_classification, classification_zone,
              project_code, asset_format, classification_confidence
       FROM assets`
    );
    let nodesAdded = 0;
    for (const a of assetsResult.rows) {
      try {
        await session.run(
          `MERGE (n:Asset {id: $id})
           SET n.fileName = $fileName, n.domain = $domain, n.classification = $classification,
               n.zone = $zone, n.projectCode = $projectCode, n.format = $format,
               n.confidence = $confidence, n.updatedAt = datetime()`,
          {
            id: a.id, fileName: a.file_name, domain: a.content_domain,
            classification: a.data_classification, zone: a.classification_zone,
            projectCode: a.project_code || '', format: a.asset_format || '',
            confidence: parseFloat(a.classification_confidence) || 0,
          }
        );
        // Project edge
        if (a.project_code) {
          await session.run(
            `MERGE (p:Project {code: $code})
             WITH p
             MATCH (n:Asset {id: $assetId})
             MERGE (n)-[:BELONGS_TO]->(p)`,
            { code: a.project_code, assetId: a.id }
          );
        }
        nodesAdded++;
      } catch (_) {}
    }

    // Load all relationships
    const relsResult = await query(
      `SELECT source_asset_id, target_asset_id, relationship_type, confidence, evidence
       FROM asset_relationships`
    );
    let edgesAdded = 0;
    for (const r of relsResult.rows) {
      try {
        const safeType = (r.relationship_type || 'RELATED').replace(/[^A-Z_]/g, '');
        await session.run(
          `MATCH (s:Asset {id: $sourceId}), (t:Asset {id: $targetId})
           MERGE (s)-[rel:${safeType}]->(t)
           SET rel.confidence = $confidence, rel.evidence = $evidence`,
          {
            sourceId: r.source_asset_id, targetId: r.target_asset_id,
            confidence: parseFloat(r.confidence) || 0.5,
            evidence: typeof r.evidence === 'string' ? r.evidence : JSON.stringify(r.evidence || {}),
          }
        );
        edgesAdded++;
      } catch (_) {}
    }

    console.log(`🔧  Neo4j rebuild: ${nodesAdded} nodes + ${edgesAdded} relationships restored from PostgreSQL`);
    return { added: nodesAdded, edgesAdded };
  } catch (e) {
    console.error('Neo4j rebuild error:', e.message);
    return { added: 0, error: e.message };
  } finally { await session.close(); }
}

// Reconcile Neo4j with PostgreSQL — remove stale nodes that no longer exist in catalog
// Should be called on startup and after large operations
async function reconcileWithCatalog(activeAssetIds) {
  if (!available) return { removed: 0 };
  if (!activeAssetIds || activeAssetIds.size === 0) {
    console.log('⚠️  Skipping Neo4j reconciliation — no active assets provided');
    return { removed: 0 };
  }
  const session = driver.session();
  try {
    // Get all Neo4j Asset node IDs
    const result = await session.run('MATCH (a:Asset) RETURN a.id as id');
    const neo4jIds = result.records.map(r => r.get('id'));
    const staleIds = neo4jIds.filter(id => !activeAssetIds.has(id));

    if (staleIds.length === 0) {
      console.log(`✅  Neo4j is in sync with PostgreSQL (${neo4jIds.length} assets)`);
      return { removed: 0, total: neo4jIds.length };
    }

    // Delete stale nodes in batches of 100
    let removed = 0;
    for (let i = 0; i < staleIds.length; i += 100) {
      const batch = staleIds.slice(i, i + 100);
      await session.run('UNWIND $ids as id MATCH (a:Asset {id: id}) DETACH DELETE a', { ids: batch });
      removed += batch.length;
    }

    console.log(`🧹  Neo4j reconciliation: removed ${removed} stale nodes (kept ${neo4jIds.length - removed} active)`);
    return { removed, total: neo4jIds.length };
  } catch (e) {
    console.error('Neo4j reconciliation error:', e.message);
    return { removed: 0, error: e.message };
  } finally { await session.close(); }
}

// Delete an asset node and all its relationships from Neo4j
async function deleteAssetNode(assetId) {
  if (!available) return;
  const session = driver.session();
  try {
    await session.run('MATCH (a:Asset {id: $id}) DETACH DELETE a', { id: assetId });
  } catch (e) {
    console.error('Neo4j delete node error:', e.message);
  } finally { await session.close(); }
}

// Delete all asset nodes for a project
async function deleteProjectAssets(projectCode) {
  if (!available) return;
  const session = driver.session();
  try {
    await session.run('MATCH (a:Asset {projectCode: $code}) DETACH DELETE a', { code: projectCode });
  } catch (e) {
    console.error('Neo4j delete project assets error:', e.message);
  } finally { await session.close(); }
}

async function close() { if (driver) await driver.close(); }
function isAvailable() { return available; }

module.exports = {
  init, upsertAssetNode, createRelationship, autoCreateProjectEdges,
  getProjectGraph, getAssetRelationships, upsertConceptNode, linkAssetToConcept,
  findShortestPath, getNeighbors, getMostConnectedAssets, findAllPaths,
  getGraphStatistics, getOrphanedAssets, getImpactAnalysis,
  deleteAssetNode, deleteProjectAssets, reconcileWithCatalog, rebuildFromPostgres,
  close, isAvailable
};
