-- Ontology v2: class hierarchy, property schema, relationship constraints
-- Phase 2 of ontology redesign — adds Protégé-style semantic richness on top
-- of the flat domain/relationship tables introduced in 005_ontology_schema.sql.

-- ── Entity type hierarchy ────────────────────────────────────────────────────
ALTER TABLE ontology_domains
  ADD COLUMN IF NOT EXISTS parent_code TEXT,
  ADD COLUMN IF NOT EXISTS is_abstract BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ontology_domains_parent ON ontology_domains(parent_code);

-- ── Entity type properties (schema attributes) ───────────────────────────────
-- e.g. OFFICE_DOCUMENT has properties: title (text, required), author (text),
-- created_date (date), classification (enum: PUBLIC,INTERNAL,...).
CREATE TABLE IF NOT EXISTS ontology_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_code TEXT NOT NULL REFERENCES ontology_domains(domain_code) ON DELETE CASCADE,
  property_name TEXT NOT NULL,
  property_label TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'text',        -- text, number, date, boolean, enum, reference, url
  is_required BOOLEAN DEFAULT false,
  is_unique BOOLEAN DEFAULT false,
  default_value TEXT,
  enum_values TEXT[],                            -- for data_type='enum'
  reference_domain TEXT,                         -- for data_type='reference'
  description TEXT,
  display_order INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(domain_code, property_name)
);

CREATE INDEX IF NOT EXISTS idx_ontology_properties_domain ON ontology_properties(domain_code);

-- ── Relationship constraints (cardinality + inverse + hierarchy) ────────────
ALTER TABLE ontology_relationships
  ADD COLUMN IF NOT EXISTS cardinality TEXT DEFAULT 'N:M',  -- '1:1', '1:N', 'N:1', 'N:M'
  ADD COLUMN IF NOT EXISTS inverse_code TEXT,               -- e.g. DOCUMENTS_CIRCUIT <-> DOCUMENTED_BY
  ADD COLUMN IF NOT EXISTS parent_code TEXT;                -- sub-property hierarchy (rdfs:subPropertyOf)

CREATE INDEX IF NOT EXISTS idx_ontology_rels_parent ON ontology_relationships(parent_code);

-- ── Seed default cardinalities for known relationships ──────────────────────
UPDATE ontology_relationships SET cardinality = 'N:M' WHERE cardinality IS NULL;
UPDATE ontology_relationships SET cardinality = '1:N' WHERE relationship_code = 'DERIVED_FROM' AND cardinality = 'N:M';
UPDATE ontology_relationships SET cardinality = 'N:1' WHERE relationship_code = 'BELONGS_TO' AND cardinality = 'N:M';

-- ── Seed example properties for built-in entity types ───────────────────────
-- These give the demo something to show out-of-the-box.
INSERT INTO ontology_properties (domain_code, property_name, property_label, data_type, is_required, description, display_order) VALUES
  ('OFFICE_DOCUMENT', 'title',          'Title',          'text',    true,  'Document title', 10),
  ('OFFICE_DOCUMENT', 'author',         'Author',         'text',    false, 'Primary author', 20),
  ('OFFICE_DOCUMENT', 'created_date',   'Created Date',   'date',    false, 'Document creation date', 30),
  ('OFFICE_DOCUMENT', 'classification', 'Classification', 'enum',    false, 'Confidentiality classification', 40),
  ('PDF_DOCUMENT',    'title',          'Title',          'text',    true,  'Document title', 10),
  ('PDF_DOCUMENT',    'page_count',     'Page Count',     'number',  false, 'Number of pages', 20),
  ('PDF_DOCUMENT',    'created_date',   'Created Date',   'date',    false, 'Document creation date', 30),
  ('ELECTRONIC_CIRCUIT', 'design_name', 'Design Name',    'text',    true,  'Circuit / IP name', 10),
  ('ELECTRONIC_CIRCUIT', 'process_node','Process Node',   'text',    false, 'e.g. 7nm, 5nm', 20),
  ('ELECTRONIC_CIRCUIT', 'tapeout_date','Tapeout Date',   'date',    false, 'Scheduled or actual tapeout', 30),
  ('AUDIO',           'duration_sec',   'Duration (sec)', 'number',  false, 'Recording length in seconds', 10),
  ('AUDIO',           'recorded_date',  'Recorded Date',  'date',    false, 'When the recording was made', 20),
  ('VIDEO',           'duration_sec',   'Duration (sec)', 'number',  false, 'Video length in seconds', 10),
  ('VIDEO',           'resolution',     'Resolution',     'text',    false, 'e.g. 1080p, 4K', 20),
  ('STRUCTURED_DATA', 'row_count',      'Row Count',      'number',  false, 'Number of rows in the table', 10),
  ('STRUCTURED_DATA', 'database_name',  'Database',       'text',    false, 'Source database', 20)
ON CONFLICT (domain_code, property_name) DO NOTHING;

-- Seed classification enum values
UPDATE ontology_properties
  SET enum_values = ARRAY['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET']
  WHERE domain_code = 'OFFICE_DOCUMENT' AND property_name = 'classification';

-- ── Industry template tracking on projects ───────────────────────────────────
-- When a project is created with an industry, the matching ontology template
-- is auto-applied so the project's catalog scans/agents inherit the right schema.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS industry_template TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_industry ON projects(industry_template);
