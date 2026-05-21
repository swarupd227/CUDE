-- Classification feedback — closes the loop when a steward rejects or overrides
-- an AI-proposed classification. Captures the correction with a mandatory reason
-- so it can (a) feed back into the policy engine and (b) be audited.

CREATE TABLE IF NOT EXISTS classification_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  queue_id TEXT,
  proposed_tier TEXT,                 -- what the AI proposed
  corrected_tier TEXT,                -- what the steward set instead
  reason_code TEXT NOT NULL,          -- structured reason (see REASON_CODES in api)
  justification TEXT,                 -- free-text explanation (required by API)
  reviewer TEXT,                      -- who made the correction
  signals JSONB DEFAULT '[]',         -- the signals that drove the original (mis)classification
  applied_to_policy BOOLEAN DEFAULT false,  -- has this correction been folded into rules?
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clf_feedback_asset ON classification_feedback(asset_id);
CREATE INDEX IF NOT EXISTS idx_clf_feedback_reason ON classification_feedback(reason_code);

-- Ground-truth labels — the basis for measuring classifier accuracy.
-- A reviewer-confirmed label is the "correct answer" we score predictions against.
-- Every rejection/override with a corrected tier seeds one of these automatically.
CREATE TABLE IF NOT EXISTS classification_ground_truth (
  asset_id UUID PRIMARY KEY,
  true_tier TEXT NOT NULL,
  predicted_tier TEXT,                    -- what the AI proposed at review time
  source TEXT DEFAULT 'steward_review',   -- steward_review | manual_label | imported
  labeled_by TEXT,
  labeled_at TIMESTAMPTZ DEFAULT now()
);

-- IMAGE entity type for the ontology (image ingestion via Claude Vision).
-- Idempotent — safe to run on every startup.
INSERT INTO ontology_domains (domain_code, label, description, color, initials, icon, priority) VALUES
  ('IMAGE', 'Image', 'Images, scans, diagrams, screenshots — text extracted via Claude Vision OCR', '#0891b2', 'I', '🖼️', 56)
ON CONFLICT (domain_code) DO NOTHING;
