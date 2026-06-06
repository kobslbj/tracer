-- ─── Expand HTS knowledge base (batch 2) ─────────────────────────────────────
--
-- Representative HTS records for the core product categories this MVP demos:
-- battery packs, computer parts, aluminum components, LED lamps, plastic
-- enclosures, steel fasteners, circuit boards, power adapters and ceramic parts.
--
-- Sources for manual curation: USITC Harmonized Tariff Schedule (hts.usitc.gov),
-- US Census Schedule B (uscensus.prod.3ceonline.com), and CBP CROSS rulings
-- (rulings.cbp.gov). These are representative seed records, not a full schedule.
--
-- Leave `embedding` NULL; after applying, run:
--   curl -X POST http://localhost:3000/api/seed-embeddings
--
-- `ON CONFLICT DO NOTHING` makes this safe to re-run.

INSERT INTO public.hts_knowledge (hts_code, description, chapter, duty_rate, notes) VALUES
  -- ── Batteries (companion to 8507.60) ────────────────────────────────────────
  ('8507.80', 'Other electric accumulators, including battery packs and modules', 'Chapter 85 – Electrical machinery', 3.4, 'UN38.3 transport test report required. Section 301 on China origin. Companion to lithium-ion 8507.60.'),

  -- ── Computer parts & circuit boards ─────────────────────────────────────────
  ('8473.30', 'Parts and accessories of automatic data processing machines (computer parts)', 'Chapter 84 – Machinery', 0.0, 'Duty-free base rate. Section 301 List applies to China origin. Covers chassis, heatsinks, internal assemblies.'),
  ('8534.00', 'Printed circuit boards (bare PCBs)', 'Chapter 85 – Electrical machinery', 0.0, 'Bare boards duty-free; populated boards classified by end-use function. Section 301 on China origin.'),

  -- ── Power adapters & LED lamps ──────────────────────────────────────────────
  ('8504.40', 'Static converters: power adapters, chargers and power supplies', 'Chapter 85 – Electrical machinery', 0.0, 'Duty-free base. UL/FCC safety and EMC certification expected. Section 301 on China origin.'),
  ('8539.50', 'Light-emitting diode (LED) lamps', 'Chapter 85 – Electrical machinery', 2.0, 'DOE energy conservation standards and FTC lighting labeling apply. Section 301 on China origin.'),

  -- ── Aluminum components ─────────────────────────────────────────────────────
  ('7616.99', 'Other articles of aluminum, not elsewhere specified', 'Chapter 76 – Aluminum', 2.5, 'Section 232 aluminum tariffs (10%) apply. AD/CVD orders cover aluminum extrusions from China.'),
  ('7604.21', 'Aluminum alloy hollow profiles (extrusions)', 'Chapter 76 – Aluminum', 0.0, 'Free base rate but Section 232 (10%) applies. AD/CVD orders on aluminum extrusions from multiple origins.'),

  -- ── Steel fasteners ─────────────────────────────────────────────────────────
  ('7318.15', 'Threaded screws and bolts of iron or steel', 'Chapter 73 – Articles of iron or steel', 8.5, 'Rate varies by subheading. Section 232 steel tariffs (25%) apply. AD/CVD on certain fasteners from China/Taiwan.'),

  -- ── Plastic enclosures ──────────────────────────────────────────────────────
  ('3926.90', 'Other articles of plastics (enclosures, housings, fittings)', 'Chapter 39 – Plastics', 5.3, 'Section 301 on China origin. Verify whether item is better classified by specific function elsewhere.'),

  -- ── Ceramic parts (companion to 6909.19) ────────────────────────────────────
  ('6914.90', 'Other ceramic articles, not elsewhere specified', 'Chapter 69 – Ceramic products', 5.6, 'Standard industrial ceramic component, low scrutiny. Companion to technical ceramics 6909.19.')
ON CONFLICT DO NOTHING;
