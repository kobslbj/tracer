# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # run ESLint
```

No test runner is configured yet.

## Architecture

**Tracer** is an AI copilot for customs document review. Brokers submit shipments (upload documents or text description), a multi-agent pipeline classifies and validates them, and saved shipments appear in a **Shipment Review Queue** — a broker attention queue triaged by risk, missing docs, and agency flags. This is a pre-filing intelligence layer, not a CBP operating system.

This is a **Next.js 16 App Router** project with **React 19**. Next.js 16 has breaking changes from prior versions — read `node_modules/next/dist/docs/` before using any Next.js API.

### UI Stack

- **Tailwind CSS v4** — configured via `@tailwindcss/postcss`, no `tailwind.config.js`; all theme tokens are CSS variables defined in `app/globals.css` using `@theme inline`.
- **shadcn** (v4, not the older CLI) — components live in `components/ui/`, utilities in `lib/utils.ts`. Add new components with `npx shadcn add <component>`.
- **Radix UI** — imported from the unified `radix-ui` package (e.g. `import { Slot } from "radix-ui"`), not individual `@radix-ui/*` packages.
- **class-variance-authority (cva)** — used for variant-based component styling.

**Key conventions:**
- Path alias `@/` maps to the project root (configured in `tsconfig.json`).
- Dark mode uses the `.dark` class strategy (`@custom-variant dark (&:is(.dark *))`).
- All design tokens (colors, radius, etc.) are OKLCH-based CSS variables — do not use hardcoded hex/rgb values.

### Multi-Agent Pipeline

The core feature runs a DAG of four AI agents, each as its own API route under `app/api/agents/`:

1. **classify** — Embeds the shipment description, runs pgvector cosine similarity against `hts_knowledge` (RAG), and returns HTS code + shipment metadata.
2. **duty** — Takes HTS code + origin country + value and calculates base duty rate with Section 301/USMCA/GSP adjustments.
3. **compliance** — Screens for CBP restrictions, ECCN controls, hazmat flags; assigns risk level and required documents.
4. **draft** — Assembles all prior outputs into a complete `Entry` object, applying OCR overrides from uploaded documents if present.

Duty and compliance run in parallel (client fires both after classify completes). The `AgentStatus` type in `lib/types.ts` tracks phase per agent: `idle | running | complete | error`.

### Document Processing

`app/api/documents/` contains five routes that handle the upload-to-reconcile flow:

- **upload** → stores PDF/image in InsForge Storage bucket `customs-docs`, returns `{ url, key }`.
- **extract** → vision model reads the document and returns structured `ExtractedDoc` fields (importer, supplier, COO, quantity, value, incoterm, ports, etc.).
- **reconcile** → cross-validates two extracted documents using `lib/trade-reconcile.ts`. Key logic: normalizes quantities across units (BAG × per-unit kg → kg, MT → kg, LB → kg) before comparing, so "2880 bags" vs "72 MT" resolves cleanly. Also resolves COO by priority: explicit field > product text hint > port of loading.
- **persist** → saves document set metadata and reconciliation issues to `document_sets` table.
- **follow-up** → uses AI to generate a polite, professional supplier follow-up email for missing documents. Accepts `{ supplier, importer, product, missingItems }`, returns `{ email: string }`. Tone is deliberately gentle ("may be needed", "please confirm") — never legalistic.

OCR overrides are applied to the draft entry in `lib/entry-from-docs.ts` via `entryOverridesFromDocs()`.

### Database & Realtime

InsForge Postgres tables:
- **`entries`** — system of record for broker review inbox. Key columns: `hts_code`, `duty_rate`, `risk_level`, `status` (`needs_attention|waiting_on_docs|ready_for_review|ready_to_submit`), `review_snapshot` (JSONB with triage intelligence), `review_history` (JSONB array of past snapshots), `timeline` (JSONB array of coordination events), `uploaded_docs` (JSONB), `port_of_discharge`, `supplier` and `importer` (cross-shipment identity keys, denormalized from OCR at save time). Active inbox uses 3 primary queues; `ready_to_submit` is a resolved outcome (filter chip, not a queue tab). Tags are derived at runtime and can overlap.
- **`hts_knowledge`** — tariff data with `embedding vector(1536)` column; HNSW-indexed for fast cosine search. Queried via `match_hts` RPC.
- **`document_sets`** — OCR output + reconciliation issues per upload batch.

Realtime: a Postgres trigger on `entries` broadcasts to the `entries` channel. The dashboard subscribes and re-fetches on each broadcast. CRUD helpers live in `lib/insforge-db.ts`; the InsForge client is initialized in `lib/insforge.ts`.

Key DB helpers in `lib/insforge-db.ts`:
- `appendTimelineEvents()` — prepend new `ShipmentTimelineEvent[]` to an entry's timeline and persist.
- `saveEntryReviewUpdate()` — save a review update: archives current snapshot to `review_history`, writes new snapshot + timeline + status.
- `insertDocumentSet()` — persist extracted document set and reconciliation issues.

### State Management

`lib/store.tsx` is a React Context reducer (`StoreProvider` wraps the app in `app/layout.tsx`). It holds:
- `entries[]` — loaded from InsForge on mount
- `currentDraft` — the in-progress `Entry` being built by the pipeline
- `agentStatus` — per-agent phase
- `isProcessing` — pipeline running flag

Actions: `SET_AGENT_STATUS`, `SET_DRAFT`, `APPROVE_ENTRY`, `UPDATE_ENTRY`, `SET_ENTRIES`. Primary queue is set at save time via `lib/entry-triage.ts`; brokers mark shipments `ready_to_submit` from the detail modal.

### Triage & Queue Logic

`lib/entry-triage.ts` is the central hub for queue classification:
- `derivePrimaryStatus()` — single routing decision: `needs_attention > waiting_on_docs > ready_for_review`.
- `deriveTags()` — non-exclusive tags for filter chips (High Risk, Missing COO, FDA, etc.).
- `deriveAgencyFlags()` — regex-scan issues and required docs for FDA/APHIS/FCC/NCC/CBP flags.
- `buildReviewSnapshot()` — assembles a full `EntryReviewSnapshot` from an issue list.
- `sortEntriesForQueue()` — priority score: `blocking×10000 + missing×1000 + agency×100 + verification×10 + lowConf`.
- `deriveTriageRow()` — produces the dashboard table row object from an entry.
- `TAG_FILTER_CHIPS` / `RESOLUTION_FILTER_CHIPS` — UI filter configuration.

**Rule:** primary status is a single routing decision; tags are multi-value context hints. They complement each other.

### Review Snapshot & Delta

`EntryReviewSnapshot` (defined in `lib/types.ts`) is the triage intelligence JSONB stored on each entry:
- `filability` — `ready | review_recommended | blocking`
- `missingItems` — list of items that need resolution
- `agencyFlags` — detected agency touchpoints
- `suggestedActions` — next steps for the broker
- `issues` — full `ReconcileIssue[]` list
- `delta` — `ReviewDelta | null` (changes since last check)

`lib/review-delta.ts` computes deltas between two snapshots:
- `computeReviewDelta()` — compares old vs new snapshot, returns `{ resolved, stillPending, newlyDetected }`.
- Uses `issueTrackingKey()` for stable identity across re-checks.

### Shipment Timeline & Coordination

`lib/shipment-timeline.ts` manages the coordination memory layer:
- `createTimelineEvent()` — creates event with UUID + timestamp.
- `eventsForReviewSave()` — auto-generates events on save (document_uploaded / review_completed / issue_resolved).
- `deriveCoordinationState()` — derives waiting items, follow-up recommendations, promise expiry, and `coordinationLine` (e.g. "No response in 18h, consider escalating").
- `sortTimeline()` — newest-first ordering.
- `EVENT_TYPE_LABELS` — human-readable event type map.

Timeline events are persisted in the `timeline` JSONB column via `appendTimelineEvents()`.

### Supplier Responsiveness Context Layer

`lib/supplier-profile.ts` accumulates cross-shipment supplier behavior — all client-side pure functions over the store's `entries[]` (no stats table or route):
- `normalizeSupplierName()` — identity key (trim + collapse whitespace + lowercase); exact match, no fuzzy.
- `deriveSupplierProfile()` / `buildSupplierProfileIndex()` — per-supplier stats: shipment count, avg reply hours (followup→supplier_replied gaps), promise kept/broken/pending (promisedBy vs later issue_resolved/document_uploaded), follow-ups per shipment, common missing items, responsiveness grade (fast ≤24h / moderate ≤72h / slow).
- `deriveSupplierAwareCoordination()` — wraps `deriveCoordinationState()`, adjusting thresholds (slow/unreliable suppliers escalate at 1 follow-up/24h; fast suppliers prompt follow-up at 12h) and rewriting `coordinationLine` with supplier history. Returns plain `CoordinationState`, so `CoordinationPanel` needs no changes.

Supplier identity flows: `ExtractedDoc.supplier` → `entryOverridesFromDocs()` → draft route → `entries.supplier` column. `SupplierProfilePanel` renders the history in the entry modal; the dashboard passes a `supplierIndex` into `deriveTriageRow()` for supplier-aware coordination lines.

### Importer Operational Memory

`lib/importer-profile.ts` is the importer-side sibling of the supplier layer — operational context memory, **not a CRM** (no editable records, no CRUD UI, no stats table; pure client-side functions over `entries[]`):
- `deriveImporterProfile()` / `buildImporterProfileIndex()` — per-importer patterns: `missingDocPatterns` (counts the union of current snapshot + `reviewHistory` missing items so patterns survive resolution), `agencyPatterns` (flags seen in ≥2 shipments), `typicalSuppliers`, `commonProducts`, `suggestedUpfrontActions` ("Request COO from supplier upfront").
- `formatMissingPattern()` / `formatAgencyPattern()` — display lines, deliberately qualitative ("COO frequently missing in recent shipments", "FDA documentation commonly requested") — exact "N of last M" counts and "review applies" phrasing read as legal determinations.
- Shared identity key lives in `lib/party-identity.ts` (`normalizePartyName()`); `normalizeSupplierName` and `normalizeImporterName` are both aliases of it so supplier/importer keys stay byte-identical.

Importer identity flows: `ExtractedDoc.importer` → `entryOverridesFromDocs()` → `entries.importer` column. `ImporterProfilePanel` ("Historical coordination patterns") renders in the entry modal and at intake — when extraction recognizes a known importer, the panel appears above the review summary before the broker reviews (first-time importers render nothing at intake; `minShipmentsForHistory={1}` there vs default 2 in the modal, since the saved entry counts itself).

### AI Model Gateway

`lib/ai.ts` wraps OpenRouter calls. Key exports:
- `chatJSON()` / `chatComplete()` — text prompts returning JSON or string
- `chatVisionJSON()` / `chatVisionComplete()` — multimodal prompts (pass `documentPart()` helpers for PDF/image)
- `embed(text)` — returns 1536-dim vector for pgvector

Model is configurable via `OPENROUTER_CHAT_MODEL` env var (default: `anthropic/claude-sonnet-4-5`).

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
INSFORGE_API_KEY=          # admin key, used server-side only
OPENROUTER_API_KEY=
OPENROUTER_CHAT_MODEL=     # optional, defaults to claude-sonnet-4-5
OPENROUTER_EMBEDDING_MODEL= # optional, defaults to text-embedding-ada-002
```

### Pages

- `/` — redirects to `/intake`
- `/intake` — document upload (primary) or manual description. Runs the agent pipeline; builds a full `EntryReviewSnapshot` (with delta tracking on re-checks); **Save for broker review** persists entry + snapshot + timeline events.
- `/dashboard` — **Shipment Review Queue**: inbox triage with queue tabs (Needs Attention, Waiting on Documents, Ready for Review), non-exclusive tag filters with counts, view scope (Active / Ready to Submit), and workflow-first detail modal via `AttentionQueueTable`.

### Key Component Map

**Intake (`components/intake/`)**
- `ShipmentReviewSummary` — filability banner + missing items + resolution path + action buttons.
- `ReviewTrace` — step-by-step timeline of what the document check found.
- `ReviewDeltaPanel` — diff since last check (resolved / still pending / newly detected).
- `CitationList` — shows source citations below issue descriptions.
- `ConfidenceBadge` — high / medium / needs_review chip with optional provenance note.
- `ResolutionPathPanel` — numbered steps to move shipment toward filing.
- `ResolutionActionButton` — one-click: generates follow-up email via `/api/documents/follow-up`, copies email + checklist to clipboard, logs timeline event.
- `ReconcilePanel` — cross-document reconciliation results with issue list.

**Dashboard (`components/dashboard/`)**
- `AttentionQueueTable` — priority-sorted entry table with tags, status, new-entry fade animation.

**Shipment (`components/shipment/`)**
- `ShipmentTimeline` — coordination event timeline (newest first).
- `CoordinationPanel` — waiting items, last supplier reply, follow-up count, promise expiry warning.
- `LogSupplierReply` — form to record supplier reply + promised delivery date.
- `SupplierProfilePanel` — cross-shipment supplier history: grade badge, avg reply, promises kept/broken, common missing docs.
- `ImporterProfilePanel` — cross-shipment "Historical coordination patterns": recurring missing docs, agency flags, typical suppliers, common products, upfront-action hints. Mounted in entry modal and intake.

### Supporting Libraries

| File | Purpose |
|------|---------|
| `lib/citations.ts` | Issue citation extraction; suppress weak regulatory flags |
| `lib/entry-triage.ts` | Queue classification, priority scoring, tag derivation |
| `lib/issue-display.ts` | Issue tier (blocking/verification/informational), urgency score |
| `lib/resolution-actions.ts` | Follow-up email generation, checklist builder, COO request detection |
| `lib/review-delta.ts` | Compute diff between two review snapshots |
| `lib/shipment-review.ts` | Filability status, missing item extraction, checklist text |
| `lib/shipment-timeline.ts` | Timeline event creation, coordination state derivation |
| `lib/supplier-profile.ts` | Cross-shipment supplier stats, supplier-aware coordination wrapper |
| `lib/importer-profile.ts` | Cross-shipment importer patterns (missing docs, agencies, suppliers, products) |
| `lib/party-identity.ts` | Shared `normalizePartyName()` identity key for supplier + importer profiles |

### Database Migrations

Located in `migrations/`. Applied in order:
1. `20260608120000` — adds `review_snapshot JSONB`, migrates old status values to new queue model.
2. `20260608140000` — renames `broker_approved` → `ready_to_submit`.
3. `20260608160000` — adds `review_history JSONB DEFAULT '[]'` for snapshot history.
4. `20260608180000` — adds `timeline JSONB DEFAULT '[]'` for coordination memory.
5. `20260609120000` — adds `supplier TEXT` with best-effort backfill from `document_sets` via `packingListKey`.
6. `20260609190000` — adds `importer TEXT` with the same `document_sets` backfill.

## Current Work Status

_Updated by Claude Code as tasks progress._

- [x] CLAUDE.md updated to reflect current codebase state (2026-06-09)
