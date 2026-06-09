-- Rename resolved state: broker_approved → ready_to_submit

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_status_check;

UPDATE public.entries SET status = 'ready_to_submit' WHERE status = 'broker_approved';

ALTER TABLE public.entries
  ADD CONSTRAINT entries_status_check
  CHECK (status IN ('needs_attention','waiting_on_docs','ready_for_review','ready_to_submit'));
