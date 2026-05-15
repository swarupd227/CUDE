// Elasticsearch search service — full-text search, faceted filtering, and indexing
// Falls back gracefully if Elasticsearch is not available

let client = null;
let available = false;
const INDEX = 'cude-assets';

async function getClient() {
  if (client) return client;
  try {
    const { Client } = require('@elastic/elasticsearch');
    client = new Client({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' });
    return client;
  } catch (e) {
    console.log('⚠️  @elastic/elasticsearch not installed — search disabled');
    return null;
  }
}

async function init() {
  const es = await getClient();
  if (!es) { available = false; return false; }
  try {
    await es.ping();
    // Create index with mapping if it doesn't exist
    const exists = await es.indices.exists({ index: INDEX });
    if (!exists) {
      await es.indices.create({
        index: INDEX,
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings: {
            properties: {
              file_name:          { type: 'text', fields: { keyword: { type: 'keyword' } } },
              full_path:          { type: 'text' },
              content_domain:     { type: 'keyword' },
              asset_format:       { type: 'keyword' },
              data_classification:{ type: 'keyword' },
              classification_zone:{ type: 'keyword' },
              project_id:         { type: 'keyword' },
              project_code:       { type: 'keyword' },
              designer:           { type: 'keyword' },
              lifecycle_state:    { type: 'keyword' },
              extracted_text:     { type: 'text', analyzer: 'standard' },
              ai_summary:         { type: 'text' },
              key_topics:         { type: 'keyword' },
              entities_text:      { type: 'text' },
              tags:               { type: 'keyword' },
              quality_score:      { type: 'float' },
              classification_confidence: { type: 'float' },
              file_size_bytes:    { type: 'long' },
              created_at:         { type: 'date' },
              updated_at:         { type: 'date' },
            }
          }
        }
      });
    }
    available = true;
    return true;
  } catch (e) {
    console.log('⚠️  Elasticsearch not reachable:', e.message);
    available = false;
    return false;
  }
}

// Index or update an asset document
async function indexAsset(asset) {
  if (!available) return;
  const es = await getClient();
  if (!es) return;
  try {
    // Extract searchable text from domain metadata
    const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
    const domMeta = (domKey && asset[`muas_${domKey}`]) || asset.domain_metadata || {};
    const extractedText = domMeta.text_preview || '';
    const aiSummary = asset.ai_analysis?.content_summary || '';
    const keyTopics = asset.ai_analysis?.key_topics || [];
    const entitiesText = Object.values(domMeta.entities || {}).flat().join(' ');

    await es.index({
      index: INDEX,
      id: asset.id,
      body: {
        file_name: asset.file_name,
        full_path: asset.full_path || asset.vault_path,
        content_domain: asset.content_domain,
        asset_format: asset.asset_type || asset.asset_format,
        data_classification: asset.data_classification,
        classification_zone: asset.classification_zone,
        project_id: asset.project_id,
        project_code: asset.project_code,
        designer: asset.designer,
        lifecycle_state: asset.lifecycle_state,
        extracted_text: extractedText,
        ai_summary: aiSummary,
        key_topics: keyTopics,
        entities_text: entitiesText,
        tags: asset.tags || [],
        quality_score: asset.quality_score,
        classification_confidence: asset.classification_confidence,
        file_size_bytes: asset.file_size_bytes || Math.round((asset.file_size_mb || 0) * 1024 * 1024),
        created_at: asset.created_at,
        updated_at: asset.updated_at,
      },
      refresh: 'wait_for',
    });
  } catch (e) {
    console.error('ES index error:', e.message);
  }
}

// Full-text search with faceted results
async function search(queryText, filters = {}, page = 1, limit = 20) {
  if (!available) return null;
  const es = await getClient();
  if (!es) return null;

  try {
    const must = [];
    const filterClauses = [];

    // Full-text search across all text fields
    if (queryText && queryText.trim()) {
      must.push({
        multi_match: {
          query: queryText,
          fields: ['file_name^3', 'extracted_text^2', 'ai_summary^2', 'entities_text', 'key_topics^2', 'full_path'],
          type: 'best_fields',
          fuzziness: 'AUTO',
        }
      });
    }

    // Filters
    if (filters.domain) filterClauses.push({ term: { content_domain: filters.domain } });
    if (filters.classification) filterClauses.push({ term: { data_classification: filters.classification } });
    if (filters.zone) filterClauses.push({ term: { classification_zone: filters.zone } });
    if (filters.project_id) filterClauses.push({ term: { project_id: filters.project_id } });
    if (filters.project_code) filterClauses.push({ term: { project_code: filters.project_code } });

    const result = await es.search({
      index: INDEX,
      body: {
        from: (page - 1) * limit,
        size: limit,
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter: filterClauses,
          }
        },
        highlight: {
          fields: {
            extracted_text: { fragment_size: 150, number_of_fragments: 2 },
            ai_summary: { fragment_size: 200, number_of_fragments: 1 },
            file_name: {},
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        aggs: {
          by_domain: { terms: { field: 'content_domain', size: 10 } },
          by_classification: { terms: { field: 'data_classification', size: 10 } },
          by_zone: { terms: { field: 'classification_zone', size: 10 } },
          by_topic: { terms: { field: 'key_topics', size: 20 } },
        },
      }
    });

    const hits = result.hits.hits.map(h => ({
      id: h._id,
      score: h._score,
      highlight: h.highlight || {},
      ...h._source,
    }));

    const facets = {};
    if (result.aggregations) {
      for (const [key, agg] of Object.entries(result.aggregations)) {
        facets[key] = agg.buckets.map(b => ({ value: b.key, count: b.doc_count }));
      }
    }

    return {
      hits,
      total: result.hits.total?.value || 0,
      page,
      pages: Math.ceil((result.hits.total?.value || 0) / limit),
      facets,
    };
  } catch (e) {
    console.error('ES search error:', e.message);
    return null;
  }
}

async function deleteAsset(id) {
  if (!available) return;
  const es = await getClient();
  try { await es.delete({ index: INDEX, id, refresh: 'wait_for' }); } catch (_) {}
}

function isAvailable() { return available; }

module.exports = { init, indexAsset, search, deleteAsset, isAvailable };
