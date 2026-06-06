-- RPC: semantic similarity search on hts_knowledge
CREATE OR REPLACE FUNCTION public.match_hts(
  query_embedding vector(1536),
  match_count      int DEFAULT 3
)
RETURNS TABLE (
  id          int,
  hts_code    text,
  description text,
  chapter     text,
  duty_rate   numeric,
  notes       text,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    h.id,
    h.hts_code,
    h.description,
    h.chapter,
    h.duty_rate,
    h.notes,
    1 - (h.embedding <=> query_embedding) AS similarity
  FROM public.hts_knowledge h
  WHERE h.embedding IS NOT NULL
  ORDER BY h.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RLS: allow anon to call the function
GRANT EXECUTE ON FUNCTION public.match_hts(vector, int) TO anon;
