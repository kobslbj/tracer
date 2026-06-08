-- RLS for document_sets (demo: anon read/write, mirrors entries table)
ALTER TABLE public.document_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read document_sets"
ON public.document_sets FOR SELECT TO anon USING (true);

CREATE POLICY "anon insert document_sets"
ON public.document_sets FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon update document_sets"
ON public.document_sets FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Storage: allow anon upload/read on customs-docs bucket (POC, no auth)
CREATE POLICY "anon read customs-docs"
ON storage.objects FOR SELECT TO anon
USING (bucket = 'customs-docs');

CREATE POLICY "anon insert customs-docs"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket = 'customs-docs');

GRANT SELECT, INSERT ON storage.objects TO anon;
GRANT USAGE ON SCHEMA storage TO anon;
