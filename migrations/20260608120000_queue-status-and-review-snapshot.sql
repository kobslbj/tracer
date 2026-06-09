-- Queue-centric status model + review intelligence snapshot

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS review_snapshot JSONB DEFAULT NULL;

-- Drop old status constraint and migrate values
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_status_check;

UPDATE public.entries SET status = 'broker_approved' WHERE status IN ('Cleared', 'Filing');
UPDATE public.entries SET status = 'needs_attention' WHERE status = 'Review';
UPDATE public.entries SET status = 'ready_for_review' WHERE status = 'Draft';

ALTER TABLE public.entries
  ADD CONSTRAINT entries_status_check
  CHECK (status IN ('needs_attention','waiting_on_docs','ready_for_review','broker_approved'));

ALTER TABLE public.entries ALTER COLUMN status SET DEFAULT 'ready_for_review';
