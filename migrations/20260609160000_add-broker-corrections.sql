-- Broker correction loop: confirm/dismiss AI regulatory flags with reasons.
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS broker_corrections JSONB NOT NULL DEFAULT '[]';
