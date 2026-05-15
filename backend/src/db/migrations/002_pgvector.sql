-- CUDE Enterprise Platform — Phase 3: pgvector Embeddings
-- Migration 002: Enable vector extension and add embedding column

CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to assets table (1536 dimensions — compatible with OpenAI ada-002)
ALTER TABLE assets ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_assets_embedding ON assets USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
