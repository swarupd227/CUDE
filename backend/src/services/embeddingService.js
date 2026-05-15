// Embedding service — compute and query semantic vector embeddings
// Uses OpenAI text-embedding-3-small when API key is set, else lightweight keyword vectors
// Stored in PostgreSQL via pgvector extension for cosine similarity search

let available = false;

// Fixed vocabulary for local keyword-vector computation (no API needed)
// 200 domain-relevant terms — padded to 1536 dims with zeros
const VOCABULARY = [
  // Classification/governance terms
  'confidential','restricted','internal','public','trade','secret','classified','sensitive',
  'governance','compliance','audit','policy','retention','legal','hold','itar','ear','eccn',
  'export','control','regulation','gdpr','ccpa','pii','privacy',
  // Semiconductor/EDA terms
  'circuit','design','schematic','layout','netlist','gdsii','oasis','verilog','spice','sdc',
  'tapeout','silicon','wafer','die','yield','process','node','nm','ip','core','block',
  'rtl','synthesis','floorplan','placement','routing','timing','constraint','clock',
  // Document terms
  'report','specification','datasheet','roadmap','presentation','spreadsheet','meeting',
  'recording','transcript','summary','analysis','review','proposal','contract','agreement',
  // Business terms
  'customer','revenue','cost','price','margin','forecast','budget','financial','nda',
  'competitive','product','launch','milestone','schedule','deadline','project',
  // Technical terms
  'performance','test','measurement','oscilloscope','signal','frequency','power','voltage',
  'protocol','interface','driver','firmware','software','hardware','component','module',
  // People/org terms
  'engineer','manager','director','team','department','division','company','organization',
  // Action terms
  'approved','rejected','escalated','pending','reviewed','classified','discovered','parsed',
  'enriched','analyzed','scanned','uploaded','modified','created','deleted','archived',
];

function computeLocalEmbedding(text) {
  if (!text || text.length < 5) return null;
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const wordSet = new Set(words);
  const wordFreq = {};
  for (const w of words) wordFreq[w] = (wordFreq[w] || 0) + 1;

  // Build a 1536-dim vector: first 200 dims are vocabulary TF, rest are zero-padded
  const vector = new Array(1536).fill(0);
  const maxFreq = Math.max(1, ...Object.values(wordFreq));

  for (let i = 0; i < VOCABULARY.length; i++) {
    if (wordFreq[VOCABULARY[i]]) {
      vector[i] = wordFreq[VOCABULARY[i]] / maxFreq; // Normalized TF
    }
  }

  // Add some n-gram features in dims 200-400 for more discrimination
  for (let i = 0; i < words.length - 1 && i < 200; i++) {
    const bigram = words[i] + '_' + words[i+1];
    const hash = Math.abs(bigram.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)) % 200;
    vector[200 + hash] = Math.min(1, (vector[200 + hash] || 0) + 0.3);
  }

  // Normalize to unit vector for cosine similarity
  const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (magnitude === 0) return null;
  return vector.map(v => parseFloat((v / magnitude).toFixed(6)));
}

async function computeOpenAIEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.substring(0, 8000) }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data?.[0]?.embedding || null;
  } catch { return null; }
}

async function init() {
  try {
    const { query } = require('../db/pool');
    // Check if pgvector extension and embedding column exist
    await query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    const colCheck = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'embedding'");
    if (colCheck.rows.length > 0) {
      available = true;
      return true;
    }
  } catch { }
  available = false;
  return false;
}

async function embedAsset(assetId, text) {
  if (!available || !text || text.length < 10) return false;
  try {
    // Try OpenAI first, fall back to local
    let embedding = await computeOpenAIEmbedding(text);
    if (!embedding) embedding = computeLocalEmbedding(text);
    if (!embedding) return false;

    const { query } = require('../db/pool');
    const vectorStr = `[${embedding.join(',')}]`;
    await query('UPDATE assets SET embedding = $1::vector WHERE id = $2', [vectorStr, assetId]);
    return true;
  } catch (e) {
    console.error('Embedding error:', e.message);
    return false;
  }
}

async function findSimilar(assetId, limit = 10) {
  if (!available) return [];
  try {
    const { query } = require('../db/pool');
    const result = await query(`
      SELECT a.id, a.file_name, a.content_domain, a.data_classification, a.classification_zone,
             a.project_code, a.quality_score, a.file_size_bytes,
             1 - (a.embedding <=> (SELECT embedding FROM assets WHERE id = $1)) AS similarity
      FROM assets a
      WHERE a.id != $1 AND a.embedding IS NOT NULL
        AND (SELECT embedding FROM assets WHERE id = $1) IS NOT NULL
      ORDER BY a.embedding <=> (SELECT embedding FROM assets WHERE id = $1)
      LIMIT $2
    `, [assetId, limit]);
    return result.rows.map(r => ({
      ...r,
      similarity_score: parseFloat(parseFloat(r.similarity).toFixed(4)),
      file_size_mb: r.file_size_bytes ? parseFloat((r.file_size_bytes / 1024 / 1024).toFixed(3)) : 0,
    }));
  } catch { return []; }
}

function isAvailable() { return available; }

module.exports = { init, embedAsset, findSimilar, isAvailable, computeLocalEmbedding };
