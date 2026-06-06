-- HNSW cosine index for fast vector similarity search at scale
CREATE INDEX IF NOT EXISTS hts_knowledge_embedding_hnsw
ON public.hts_knowledge
USING hnsw (embedding vector_cosine_ops);
