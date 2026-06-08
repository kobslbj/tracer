-- Store links to uploaded Packing List / Commercial Invoice on each entry
ALTER TABLE public.entries ADD COLUMN uploaded_docs JSONB DEFAULT '{}'::jsonb;
