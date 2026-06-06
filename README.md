# Traceer

**Autonomous customs operations for brokers.** Describe a shipment in plain English and a pipeline of AI agents classifies the HTS code, prices the duty, screens compliance, and drafts a CBP entry — grounded in a vector knowledge base and persisted live to Postgres.

Built for the **InsForge Hackathon** (_Build Something Interesting_ track).

---

## What it does

A licensed customs broker normally hand-classifies every shipment: look up the Harmonized Tariff Schedule (HTS) code, apply duty rates and Section 301 / USMCA / GSP rules, screen for compliance flags, and assemble the CBP entry paperwork. Traceer automates that workflow with a multi-agent pipeline.

1. **Describe a shipment** — e.g. _"2000 cotton knit t-shirts from Bangladesh, CIF $12,000, arriving JFK"._
2. **Watch the agents run** — a live pipeline classifies, prices, screens, and drafts.
3. **Review & approve** — the AI-drafted entry persists to InsForge Postgres and streams onto a realtime dashboard.

## Multi-agent pipeline

The pipeline is a real DAG of independent server-side agents, not a single prompt. Each agent is its own API route with its own system prompt and responsibility:

```
            ┌─────────────────────────┐
  shipment →│  Classification Agent   │  HTS code via pgvector RAG + LLM
  text      └────────────┬────────────┘
                         │ htsCode, origin, value…
              ┌──────────┴──────────┐
              ▼ (parallel)          ▼
   ┌───────────────────┐  ┌──────────────────────┐
   │    Duty Agent     │  │   Compliance Agent    │
   │ Section 301/USMCA │  │ CBP CATAIR · ECCN ·   │
   │ ad valorem calc   │  │ FDA/DOT · risk level  │
   └─────────┬─────────┘  └───────────┬───────────┘
             └──────────┬─────────────┘
                        ▼
              ┌───────────────────┐
              │    Draft Agent    │  assembles CBP entry draft
              └───────────────────┘
```

- **Classification → (Duty ‖ Compliance) → Draft.** Duty and Compliance run concurrently via `Promise.all` once the HTS code is known.
- Each agent streams progress logs back to the UI; failures mark that agent as errored instead of hanging.

| Agent | Route | Responsibility |
|-------|-------|----------------|
| Classification | `app/api/agents/classify` | Embeds the query, runs pgvector similarity search over the HTS knowledge base, and classifies with an LLM (RAG). |
| Duty | `app/api/agents/duty` | Computes effective duty rate (base + Section 301 / USMCA / GSP) and estimated liability. |
| Compliance | `app/api/agents/compliance` | Risk level, required CBP documents, and regulatory flags (CATAIR, ECCN, FDA/DOT, UFLPA). |
| Draft | `app/api/agents/draft` | Assembles the structured CBP entry draft for broker review. |

## Powered by InsForge

Traceer runs on **one sponsor platform end-to-end** — database, vector store, realtime, and the model gateway are all InsForge.

| Capability | How Traceer uses it |
|------------|---------------------|
| **Postgres** | `entries` table is the system of record for every customs entry. |
| **Vector (pgvector)** | `hts_knowledge` stores HTS records embedded to 1536-dim vectors; the `match_hts` RPC does cosine similarity search behind an HNSW index to ground classification (RAG). |
| **Realtime** | A Postgres trigger (`notify_entry_change`) broadcasts on the `entries` channel; the dashboard subscribes and updates live. |
| **Model Gateway** | All LLM + embedding calls run through InsForge's managed OpenRouter gateway (key provisioned via `npx @insforge/cli ai setup`). See `lib/ai.ts`. |
| **CLI** | Schema, RPCs, indexes, and seed data are all applied via `@insforge/cli` migrations. |

## Tech stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** + **shadcn** + **Radix UI** — Linear-inspired dark UI
- **framer-motion** for the agent pipeline beams and transitions
- **InsForge** (`@insforge/sdk`) — Postgres, pgvector, realtime, model gateway

## Project layout

```
app/
  intake/            # shipment input + live agent pipeline
  dashboard/         # realtime entries table + status lifecycle
  api/agents/        # classify · duty · compliance · draft (the 4 agents)
  api/seed-embeddings/   # one-off: backfill embeddings for new HTS rows
lib/
  ai.ts              # InsForge Model Gateway client (chat + embeddings)
  insforge.ts        # InsForge SDK client
  insforge-db.ts     # entries CRUD + row mapping
  store.tsx          # app state (reducer + realtime bootstrap)
migrations/          # InsForge CLI migrations (schema, match_hts RPC, HNSW, seed data)
```

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure environment

This project is linked to an InsForge backend. Create `.env.local`:

```bash
NEXT_PUBLIC_INSFORGE_URL=https://<your-app>.us-east.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=<anon-key>     # npx @insforge/cli secrets get ANON_KEY
INSFORGE_API_KEY=<admin-key>                 # server-only, for seed-embeddings
OPENROUTER_API_KEY=sk-or-v1-...              # npx @insforge/cli ai setup
```

Optional model overrides: `OPENROUTER_CHAT_MODEL`, `OPENROUTER_EMBEDDING_MODEL`.

### 3. Apply migrations & seed the knowledge base

```bash
npx @insforge/cli db migrations up --all      # schema, match_hts RPC, HNSW index, HTS seed rows
curl -X POST http://localhost:3000/api/seed-embeddings   # backfill embeddings (only rows missing one)
```

### 4. Run

```bash
npm run dev    # http://localhost:3000
```

## Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # ESLint
```

## Notes & limitations

- The dashboard entry **status lifecycle** (`Review → Filing → Cleared`) is advanced on a timer to simulate downstream customs processing. In production these transitions would be driven by CBP ACE/EDI events.
- HTS knowledge base ships with representative records (electronics, textiles, machinery, metals, plastics, ceramics, food) curated from USITC HTS, Census Schedule B, and CBP CROSS. It is a seed set, not the full schedule.
- AI output is for demonstration and is not customs advice.
