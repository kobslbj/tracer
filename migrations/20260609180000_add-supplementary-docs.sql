-- Broker-added supporting documents (AI may not have flagged these).
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS supplementary_docs JSONB NOT NULL DEFAULT '[]';
