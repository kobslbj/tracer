-- Operational timeline for coordination memory

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb;
