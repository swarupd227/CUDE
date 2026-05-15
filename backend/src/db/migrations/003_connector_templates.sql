-- CUDE Enterprise Platform — Connector Templates
-- Migration 003: Persistent connector template library

CREATE TABLE IF NOT EXISTS connector_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Custom',
  icon TEXT DEFAULT '🔌',
  description TEXT,
  config JSONB DEFAULT '{}',
  auth_type TEXT DEFAULT 'NONE',
  supported_domains TEXT[] DEFAULT '{}',
  setup_steps TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  is_builtin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connector_templates_type ON connector_templates(type);
