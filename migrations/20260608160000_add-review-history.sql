-- Review history for delta continuity across re-uploads

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS review_history JSONB DEFAULT '[]'::jsonb;
