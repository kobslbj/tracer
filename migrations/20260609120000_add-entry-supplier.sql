-- Supplier identity for cross-shipment responsiveness intelligence
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS supplier TEXT;

-- Best-effort backfill: join document_sets via the stored packing-list storage key
UPDATE public.entries e
SET supplier = ds.supplier
FROM public.document_sets ds
WHERE e.supplier IS NULL
  AND ds.supplier IS NOT NULL
  AND e.uploaded_docs->>'packingListKey' = ds.packing_list_key;
