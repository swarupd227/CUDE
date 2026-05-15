-- CUDE Enterprise Platform — Foundation Schema
-- Migration 001: Core tables for project-centric governance

-- Enable pgvector extension (for future Phase 3 embeddings)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  system_role TEXT DEFAULT 'USER' CHECK (system_role IN ('ADMIN','USER')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  notification_prefs JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sensitivity_ceiling TEXT DEFAULT 'TRADE_SECRET'
    CHECK (sensitivity_ceiling IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET')),
  owner_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','SUSPENDED')),
  settings JSONB DEFAULT '{"sla_supervised_hours":48,"sla_gated_hours":24,"auto_classify_enabled":true,"notification_config":{}}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Project Members ──────────────────────────────────────────────────────────
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('OWNER','STEWARD','AUDITOR','VIEWER')),
  assigned_domains TEXT[] DEFAULT '{}',
  invited_by UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- ── Connectors ───────────────────────────────────────────────────────────────
CREATE TABLE connectors (
  id TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Custom',
  icon TEXT DEFAULT '🔌',
  description TEXT,
  config JSONB DEFAULT '{}',
  auth_type TEXT DEFAULT 'NONE',
  supported_domains TEXT[] DEFAULT '{}',
  setup_steps TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'UNCONFIGURED',
  schedule_cron TEXT,
  last_scan_at TIMESTAMPTZ,
  files_discovered INT DEFAULT 0,
  files_classified INT DEFAULT 0,
  built_in BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Assets ───────────────────────────────────────────────────────────────────
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  connector_id TEXT REFERENCES connectors(id),
  file_name TEXT NOT NULL,
  full_path TEXT,
  content_domain TEXT NOT NULL,
  asset_format TEXT NOT NULL,
  file_size_bytes BIGINT,
  content_hash TEXT,
  lifecycle_state TEXT DEFAULT 'DISCOVERED'
    CHECK (lifecycle_state IN (
      'DISCOVERED','PARSING','PARSED','CLASSIFYING','CLASSIFIED',
      'PENDING_REVIEW','GATED','ESCALATED','APPROVED','PUBLISHED',
      'RECLASSIFICATION_TRIGGERED','SOURCE_DELETED'
    )),
  data_classification TEXT,
  classification_confidence NUMERIC(5,4),
  classification_zone TEXT,
  ip_ownership_tier TEXT DEFAULT 'FIRST_PARTY',
  release_status TEXT DEFAULT 'WIP',
  quality_score NUMERIC(5,4),
  ai_enriched BOOLEAN DEFAULT false,
  parser_used TEXT,
  parse_duration_ms INT,
  vault_path TEXT,
  source_connector TEXT,
  project_code TEXT,
  designer TEXT,

  -- JSONB flexible fields
  export_control JSONB DEFAULT '{}',
  pii_flag JSONB DEFAULT '{"contains_pii": false, "pii_types": []}',
  retention_policy JSONB DEFAULT '{}',
  domain_metadata JSONB DEFAULT '{}',
  raw_metadata JSONB DEFAULT '{}',
  agent_processing_log JSONB DEFAULT '[]',
  parse_steps JSONB DEFAULT '[]',
  ai_analysis JSONB,
  ai_enrichment JSONB,
  cross_reference_hints TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Versioning
  version INT DEFAULT 1,
  previous_version_id UUID REFERENCES assets(id),
  source_deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  discovered_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate ingestion of identical content from same source
  UNIQUE(project_id, connector_id, full_path, content_hash)
);

-- ── Classification Decisions (append-only) ───────────────────────────────────
CREATE TABLE classification_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id),
  decided_by_type TEXT CHECK (decided_by_type IN ('AGENT','HUMAN')),
  decided_by_id TEXT,
  tier TEXT NOT NULL,
  confidence NUMERIC(5,4),
  zone TEXT NOT NULL,
  signals_detected TEXT[] DEFAULT '{}',
  policy_rules_matched TEXT[] DEFAULT '{}',
  evidence JSONB DEFAULT '{}',
  rationale TEXT,
  superseded_by UUID REFERENCES classification_decisions(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Approval Queue ───────────────────────────────────────────────────────────
CREATE TABLE approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  classification_decision_id UUID REFERENCES classification_decisions(id),
  zone TEXT NOT NULL,
  priority TEXT DEFAULT 'MEDIUM',
  proposed_tier TEXT NOT NULL,
  current_tier TEXT,
  agent_reasoning JSONB DEFAULT '{}',
  assigned_to UUID REFERENCES users(id),
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','ESCALATED')),
  sla_deadline TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  override_tier TEXT,
  escalated_to UUID REFERENCES users(id),
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Policy Rules (project-scoped) ────────────────────────────────────────────
CREATE TABLE policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  rule_code TEXT NOT NULL,
  description TEXT NOT NULL,
  signals TEXT[] NOT NULL,
  recommended_tier TEXT NOT NULL,
  priority INT DEFAULT 50,
  enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, rule_code)
);

-- ── Agent Runs ───────────────────────────────────────────────────────────────
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  agent_type TEXT NOT NULL,
  trigger_type TEXT,
  trigger_id TEXT,
  status TEXT DEFAULT 'RUNNING',
  context_snapshot JSONB DEFAULT '{}',
  reasoning_trace JSONB DEFAULT '{}',
  tool_calls JSONB DEFAULT '[]',
  result JSONB DEFAULT '{}',
  confidence_output NUMERIC(5,4),
  duration_ms INT,
  model_used TEXT,
  token_count_input INT,
  token_count_output INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ── Audit Log (immutable, append-only) ───────────────────────────────────────
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  actor_type TEXT CHECK (actor_type IN ('USER','AGENT','SYSTEM','SCHEDULER')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  hmac_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Event Log ────────────────────────────────────────────────────────────────
CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  project_id UUID REFERENCES projects(id),
  asset_id UUID,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- ── Asset Relationships ──────────────────────────────────────────────────────
CREATE TABLE asset_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  source_asset_id UUID NOT NULL REFERENCES assets(id),
  target_asset_id UUID NOT NULL REFERENCES assets(id),
  relationship_type TEXT NOT NULL,
  confidence NUMERIC(5,4),
  discovered_by_agent_run_id UUID REFERENCES agent_runs(id),
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  evidence JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_asset_id, target_asset_id, relationship_type)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_assets_project ON assets(project_id);
CREATE INDEX idx_assets_domain ON assets(content_domain);
CREATE INDEX idx_assets_classification ON assets(data_classification);
CREATE INDEX idx_assets_zone ON assets(classification_zone);
CREATE INDEX idx_assets_lifecycle ON assets(lifecycle_state);
CREATE INDEX idx_assets_content_hash ON assets(content_hash);
CREATE INDEX idx_assets_project_domain ON assets(project_id, content_domain);
CREATE INDEX idx_approval_queue_status ON approval_queue(status);
CREATE INDEX idx_approval_queue_project ON approval_queue(project_id);
CREATE INDEX idx_audit_log_project ON audit_log(project_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_event_log_timestamp ON event_log(timestamp);
CREATE INDEX idx_classification_decisions_asset ON classification_decisions(asset_id);
CREATE INDEX idx_agent_runs_project ON agent_runs(project_id);
CREATE INDEX idx_connectors_project ON connectors(project_id);

-- ── Revoke UPDATE/DELETE on audit_log for application role ───────────────────
-- (Apply after creating an application-level DB user)
-- REVOKE UPDATE, DELETE ON audit_log FROM cude_app;
