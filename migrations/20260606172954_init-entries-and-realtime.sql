-- Enable pgvector for HTS knowledge base
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Entries table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.entries (
  id            TEXT PRIMARY KEY,
  entry_no      TEXT NOT NULL,
  port          TEXT NOT NULL CHECK (port IN ('LAX','JFK','SEA')),
  product_name  TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  origin_country TEXT NOT NULL DEFAULT '',
  quantity      INTEGER NOT NULL DEFAULT 0,
  value_usd     NUMERIC(12,2) NOT NULL DEFAULT 0,
  incoterm      TEXT NOT NULL DEFAULT 'FOB',
  hts_code      TEXT NOT NULL,
  duty_rate     NUMERIC(6,3) NOT NULL DEFAULT 0,
  estimated_duty_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  risk_level    TEXT NOT NULL CHECK (risk_level IN ('Low','Medium','High')),
  review_required BOOLEAN NOT NULL DEFAULT false,
  review_reason TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('Draft','Review','Filing','Cleared')) DEFAULT 'Draft',
  required_docs TEXT[] NOT NULL DEFAULT '{}',
  explanation   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── HTS Knowledge Base (pgvector) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hts_knowledge (
  id          SERIAL PRIMARY KEY,
  hts_code    TEXT NOT NULL,
  description TEXT NOT NULL,
  chapter     TEXT NOT NULL,
  duty_rate   NUMERIC(6,3),
  notes       TEXT NOT NULL DEFAULT '',
  embedding   vector(1536)
);

INSERT INTO public.hts_knowledge (hts_code, description, chapter, duty_rate, notes) VALUES
  ('8507.60', 'Lithium-ion accumulators; electric accumulators including separators therefor', 'Chapter 85 – Electrical machinery', 3.4, 'Subject to Section 301 China tariffs. UN38.3 test report required for transport. CBP examines lithium-ion cells for thermal runaway compliance.'),
  ('6109.10', 'T-shirts, singlets, tank tops and similar garments, of cotton, knitted or crocheted', 'Chapter 61 – Knitted or crocheted clothing', 16.5, 'Textile monitoring program applies. Fiber content certification required. Check CAFTA/GSP eligibility by origin.'),
  ('6909.19', 'Other ceramic wares for laboratory, chemical or other technical uses', 'Chapter 69 – Ceramic products', 4.9, 'USMCA eligible for Mexico-origin goods. Standard industrial commodity, low scrutiny.')
ON CONFLICT DO NOTHING;

-- ─── Realtime: channel pattern for entries ────────────────────────────────────

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('entries', 'All customs entry updates', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

-- ─── Realtime: trigger on entries ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_entry_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM realtime.publish(
    'entries',
    'entry_updated',
    jsonb_build_object(
      'id',           NEW.id,
      'entry_no',     NEW.entry_no,
      'status',       NEW.status,
      'risk_level',   NEW.risk_level,
      'product_name', NEW.product_name,
      'updated_at',   NEW.updated_at
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER entries_realtime_trigger
AFTER INSERT OR UPDATE ON public.entries
FOR EACH ROW
EXECUTE FUNCTION public.notify_entry_change();

-- ─── RLS: public read/write for demo (no auth) ───────────────────────────────

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read entries"
ON public.entries FOR SELECT TO anon USING (true);

CREATE POLICY "anon insert entries"
ON public.entries FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon update entries"
ON public.entries FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ─── Seed initial entries ────────────────────────────────────────────────────

INSERT INTO public.entries (
  id, entry_no, port, product_name, description, origin_country,
  quantity, value_usd, incoterm, hts_code, duty_rate, estimated_duty_usd,
  risk_level, review_required, review_reason, status, required_docs, explanation,
  created_at, updated_at
) VALUES
(
  'ent-49281', 'ENT-49281', 'LAX', 'Lithium-ion Battery Cells',
  'Cylindrical lithium-ion battery cells, 18650 format, 3.7V, for EV applications',
  'China', 50000, 142500, 'FOB', '8507.60', 3.4, 4845,
  'High', true, 'Section 301 tariffs apply; lithium battery cells subject to CBP examination',
  'Review',
  ARRAY['Commercial Invoice','Packing List','Bill of Lading','MSDS/Safety Data Sheet','UN38.3 Test Report'],
  'Classified under HTS 8507.60 as lithium-ion accumulators. Subject to Section 301 China tariffs.',
  now() - interval '2 hours', now() - interval '2 hours'
),
(
  'ent-49284', 'ENT-49284', 'JFK', 'Cotton Knit Apparel',
  'Men''s cotton T-shirts, 100% knit cotton, various sizes, imported for retail',
  'Bangladesh', 12000, 36000, 'CIF', '6109.10', 16.5, 5940,
  'Medium', true, 'Textile quota monitoring; fiber content verification required',
  'Filing',
  ARRAY['Commercial Invoice','Packing List','Bill of Lading','Textile Declaration','Country of Origin Certificate'],
  'Classified under HTS 6109.10 as T-shirts of cotton, knitted.',
  now() - interval '5 hours', now() - interval '5 hours'
),
(
  'ent-49290', 'ENT-49290', 'SEA', 'Industrial Ceramics',
  'Refractory ceramic bricks and tiles for industrial kiln applications',
  'Mexico', 8000, 28400, 'DAP', '6909.19', 4.9, 1392,
  'Low', false, '', 'Cleared',
  ARRAY['Commercial Invoice','Packing List','Bill of Lading','USMCA Certificate of Origin'],
  'Classified under HTS 6909.19. Mexico-origin eligible for USMCA preferential treatment.',
  now() - interval '24 hours', now() - interval '24 hours'
)
ON CONFLICT (id) DO NOTHING;
