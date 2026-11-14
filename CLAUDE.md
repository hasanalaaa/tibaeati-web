# Tibaeati Web — project facts

- Stack: Vite, React 19, TypeScript strict, Tailwind v4, Dexie, pdf-lib, vite-plugin-pwa, Vitest.
- Install: `npm ci` · Dev: `npm run dev` · Test: `npm test` · Lint: `npm run lint` ·
  Typecheck: `npm run typecheck` · Build: `npm run build` · All checks: `npm run check`
- Entry: `src/app/main.tsx`. Layers and import rules: `ARCHITECTURE.md`. Scope: `SPEC.md`.
- Swift reference app (read-only, behaviour and numbers come from it): `/Users/hasanalaaa/Documents/Tibaeati`
- Published contracts: IndexedDB schema and the backup file format (`src/domain/models`, zod schemas).
- Known traps: card sizes are locked integer micrometres, never scale a card; hash routing is
  intentional (GitHub Pages); system fonts only, never add a remote font or CDN.
- Never touch: nothing may add a network call, analytics, or a remote asset.
- UI language: Arabic first (RTL), English second. Code, comments and docs in English.
