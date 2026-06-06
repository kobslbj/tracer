-- ─── Expand HTS knowledge base ───────────────────────────────────────────────
--
-- Initial batch of common HTS entries across electronics, textiles, machinery
-- and food. The `embedding` column is left NULL on purpose: after applying this
-- migration, run the seed step to generate vectors only for these new rows:
--
--   curl -X POST http://localhost:3000/api/seed-embeddings
--
-- Columns:
--   hts_code    – 6-digit subheading, format "XXXX.XX"
--   description – technical product description (used for embedding text)
--   chapter     – "Chapter NN – <title>"
--   duty_rate   – base duty rate as a number (e.g. 3.4 for 3.4%)
--   notes       – tariff/compliance notes (Section 301, USMCA, FDA, etc.)
--
-- `ON CONFLICT DO NOTHING` makes this safe to re-run.

INSERT INTO public.hts_knowledge (hts_code, description, chapter, duty_rate, notes) VALUES
  -- ── Electronics (Ch 84/85) ──────────────────────────────────────────────────
  ('8471.30', 'Portable automatic data processing machines, weighing not more than 10 kg (laptops, tablets)', 'Chapter 84 – Machinery', 0.0, 'Duty-free under HTS. Section 301 List applies to China origin. FCC declaration of conformity may be required.'),
  ('8517.13', 'Smartphones and other telephones for cellular networks', 'Chapter 85 – Electrical machinery', 0.0, 'Duty-free. FCC equipment authorization required. Section 301 tariffs on Chinese origin. Lithium battery (UN38.3) rules apply.'),
  ('8528.72', 'Reception apparatus for television, colour (TVs, monitors)', 'Chapter 85 – Electrical machinery', 5.0, 'FCC compliance and DOE energy-efficiency labeling required. Section 301 on China origin.'),
  ('8542.31', 'Electronic integrated circuits: processors and controllers', 'Chapter 85 – Electrical machinery', 0.0, 'Duty-free. Dual-use export controls (EAR) may apply. Country-of-origin scrutiny for advanced semiconductors.'),

  -- ── Textiles, Apparel & Footwear (Ch 62/63/64) ──────────────────────────────
  ('6203.42', 'Men''s or boys'' trousers and shorts, of cotton, not knitted', 'Chapter 62 – Non-knitted clothing', 16.6, 'Textile monitoring program. Fiber content certification required. Check USMCA/CAFTA yarn-forward rules of origin.'),
  ('6204.62', 'Women''s or girls'' trousers and shorts, of cotton, not knitted', 'Chapter 62 – Non-knitted clothing', 16.6, 'Textile monitoring. Country-of-origin declaration and fiber content labeling required.'),
  ('6302.21', 'Bed linen, printed, of cotton', 'Chapter 63 – Other made-up textiles', 6.7, 'Subject to textile agreements. Flammability and labeling standards may apply.'),
  ('6402.99', 'Other footwear with outer soles and uppers of rubber or plastics', 'Chapter 64 – Footwear', 20.0, 'High-duty chapter. Permanent country-of-origin marking required. Section 301 on China origin.'),

  -- ── Machinery & Vehicle Parts (Ch 84/87) ────────────────────────────────────
  ('8413.70', 'Centrifugal pumps for liquids', 'Chapter 84 – Machinery', 0.0, 'Duty-free. Standard industrial commodity, low scrutiny.'),
  ('8421.39', 'Filtering or purifying machinery and apparatus for gases', 'Chapter 84 – Machinery', 0.0, 'Duty-free. EPA may regulate emissions-control equipment.'),
  ('8481.80', 'Taps, cocks, valves and similar appliances for pipes, tanks or vats', 'Chapter 84 – Machinery', 2.0, 'Low duty. Section 301 tariffs apply to Chinese origin.'),
  ('8708.29', 'Other parts and accessories of motor vehicle bodies', 'Chapter 87 – Vehicles', 2.5, 'USMCA eligible — verify regional value content. Section 232 may apply to certain auto parts.'),

  -- ── Food & Beverages (Ch 09/18/20/21) ───────────────────────────────────────
  ('0901.21', 'Coffee, roasted, not decaffeinated', 'Chapter 09 – Coffee, tea, spices', 0.0, 'Duty-free. FDA prior notice required for food imports. FDA facility registration for shipper.'),
  ('1806.32', 'Chocolate and other cocoa preparations, in blocks or bars, not filled', 'Chapter 18 – Cocoa preparations', 5.0, 'FDA prior notice. Tariff-rate quota may apply for high dairy/sugar content.'),
  ('2009.89', 'Juice of any single fruit or vegetable, not elsewhere specified', 'Chapter 20 – Preparations of vegetables/fruit', 0.5, 'FDA prior notice. Brix level and nutrition labeling requirements apply.'),
  ('2106.90', 'Food preparations not elsewhere specified or included', 'Chapter 21 – Miscellaneous edible preparations', 6.4, 'FDA prior notice. Tariff-rate quota possible for dairy/sugar-containing blends.')
ON CONFLICT DO NOTHING;
