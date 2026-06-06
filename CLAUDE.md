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

This is a **Next.js 16 App Router** project with **React 19**. Next.js 16 has breaking changes from prior versions — read `node_modules/next/dist/docs/` before using any Next.js API.

**UI stack:**
- **Tailwind CSS v4** — configured via `@tailwindcss/postcss`, no `tailwind.config.js`; all theme tokens are CSS variables defined in `app/globals.css` using `@theme inline`.
- **shadcn** (v4, not the older CLI) — components live in `components/ui/`, utilities in `lib/utils.ts`. Add new components with `npx shadcn add <component>`.
- **Radix UI** — imported from the unified `radix-ui` package (e.g. `import { Slot } from "radix-ui"`), not individual `@radix-ui/*` packages.
- **class-variance-authority (cva)** — used for variant-based component styling.

**Key conventions:**
- Path alias `@/` maps to the project root (configured in `tsconfig.json`).
- Dark mode uses the `.dark` class strategy (`@custom-variant dark (&:is(.dark *))`).
- All design tokens (colors, radius, etc.) are OKLCH-based CSS variables — do not use hardcoded hex/rgb values.
