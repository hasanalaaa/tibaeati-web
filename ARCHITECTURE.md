# Architecture

Offline-first static PWA. No server. See `SPEC.md` and `docs/adr/0001-stack.md`.

## Layers (dependencies point down only)

```
src/app/        shell: entry, router, providers, PWA registration, i18n setup
src/features/   one folder per feature (ui + hooks); may import ui, services, domain, lib
src/ui/         design-system components and tokens; imports lib only
src/services/   I/O: storage (Dexie), pdf export, image pipeline, print/share, backup; imports domain, lib
src/domain/     pure logic and types: units, templates, models, layout engine, duplex math,
                preflight rules, calibration solver, verification math, CSV parser. No DOM, no I/O.
src/lib/        tiny generic helpers (no app knowledge)
```

Rules:

- `domain` imports nothing but `lib` and `zod` (schemas). It must run in Node (Vitest) with no DOM.
- `services` never import `features` or `ui`. `ui` never imports `features`, `services` or `domain`.
- Features do not import each other; shared code moves down a layer. Each feature exposes an `index.ts`.
- The only `app` module a feature may import is `@/app/i18n` (the `useT` hook).
- Persisted shapes live in `src/domain/models` with a zod schema and a `schemaVersion`; every stored
  record is parsed on read. Changing a persisted shape requires a migration in `src/services/storage`.
- All physical geometry is computed in integer micrometres in `domain`, converted to PDF points only
  at the export edge (`72 / 25.4`).
- User-visible strings come from `src/app/i18n` dictionaries (ar, en). No hard-coded UI text.
- No network calls. `fetch` to anything but same-origin static assets is a defect.

## Feature folders (planned)

home, library, editor, preview, printers, calibration, verification, photos, documents, batch,
onboarding, settings, backup.

## Tests

- `src/domain/**/*.test.ts`: golden tests ported from the Swift XCTest suite (numbers identical).
- `e2e/`: Playwright smoke (install shell, create project, export PDF).

## Deploy

`.github/workflows/deploy.yml`: lint, typecheck, test, build, publish `dist/` to GitHub Pages.
