-- Importer identity for cross-shipment operational memory
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS importer TEXT;

-- Best-effort backfill: document_sets already stores importer per upload batch
UPDATE public.entries e
SET importer = ds.importer
FROM public.document_sets ds
WHERE e.importer IS NULL
  AND ds.importer IS NOT NULL
  AND e.uploaded_docs->>'packingListKey' = ds.packing_list_key;
