-- Partial unique index so dbt-imported assets can be upserted by full_path
-- (their natural key — "dbt://<project>/<unique_id>").
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_dbt_full_path
  ON assets(full_path) WHERE source_connector = 'dbt';

-- Column-Level Lineage — the #1 buyer requirement for Data Catalog platforms.
-- Stores logical schema (columns per asset) and lineage edges between columns.
-- Sources of lineage: dbt manifest.json, MySQL FK + view definitions,
-- Snowflake ACCESS_HISTORY, and SQL parsing.

-- ── Logical schema (columns per asset) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  column_name TEXT NOT NULL,
  data_type TEXT,
  ordinal_position INT,
  is_nullable BOOLEAN DEFAULT true,
  is_primary_key BOOLEAN DEFAULT false,
  is_pii BOOLEAN DEFAULT false,
  pii_type TEXT,                          -- e.g. EMAIL, SSN, NAME, PHONE
  classification TEXT,                    -- PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, TRADE_SECRET
  business_term TEXT,                     -- linked glossary term
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'manual',           -- dbt, mysql_introspection, snowflake_access_history, sql_parse, manual
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(asset_id, column_name)
);

CREATE INDEX IF NOT EXISTS idx_asset_columns_asset ON asset_columns(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_columns_pii ON asset_columns(is_pii) WHERE is_pii = true;
CREATE INDEX IF NOT EXISTS idx_asset_columns_classification ON asset_columns(classification);

-- ── Column-level lineage edges ───────────────────────────────────────────────
-- Each edge represents data flow from one column to another (e.g. SELECT a.amount AS gross_revenue)
CREATE TABLE IF NOT EXISTS column_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upstream_column_id UUID NOT NULL REFERENCES asset_columns(id) ON DELETE CASCADE,
  downstream_column_id UUID NOT NULL REFERENCES asset_columns(id) ON DELETE CASCADE,
  transformation_type TEXT DEFAULT 'direct',  -- direct, expression, aggregation, join, window, case
  transformation_sql TEXT,                    -- the actual SQL snippet (e.g. "SUM(amount)")
  confidence NUMERIC(3,2) DEFAULT 1.00,       -- 0.00..1.00
  source TEXT DEFAULT 'dbt_manifest',         -- dbt_manifest, mysql_view, snowflake_history, sql_parse, manual
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(upstream_column_id, downstream_column_id)
);

CREATE INDEX IF NOT EXISTS idx_column_lineage_upstream ON column_lineage(upstream_column_id);
CREATE INDEX IF NOT EXISTS idx_column_lineage_downstream ON column_lineage(downstream_column_id);

-- ── Helper view: column lineage with names denormalized for quick browsing ──
CREATE OR REPLACE VIEW v_column_lineage AS
SELECT
  cl.id, cl.transformation_type, cl.transformation_sql, cl.confidence, cl.source, cl.created_at,
  up.id           AS upstream_col_id,
  up.column_name  AS upstream_column,
  up.data_type    AS upstream_data_type,
  ua.id           AS upstream_asset_id,
  ua.file_name    AS upstream_asset_name,
  ua.content_domain AS upstream_domain,
  dn.id           AS downstream_col_id,
  dn.column_name  AS downstream_column,
  dn.data_type    AS downstream_data_type,
  da.id           AS downstream_asset_id,
  da.file_name    AS downstream_asset_name,
  da.content_domain AS downstream_domain
FROM column_lineage cl
JOIN asset_columns up ON cl.upstream_column_id = up.id
JOIN asset_columns dn ON cl.downstream_column_id = dn.id
JOIN assets ua ON up.asset_id = ua.id
JOIN assets da ON dn.asset_id = da.id;
