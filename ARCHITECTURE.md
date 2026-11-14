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

## Persisted contracts

Everything below is a published contract: changing it needs a migration and an explicit decision.

IndexedDB database `tibaeati`, Dexie schema version 1 (`src/services/storage/db.ts`):

| Table | Key | Indexes | Value |
|---|---|---|---|
| `projects` | `id` (uuid) | `updatedAt`, `mode` | `PrintProject` JSON (`schemaVersion` 1), parsed with `PrintProjectSchema` on every read |
| `projectVersions` | `key` (auto) | `projectId` | `{ projectId, savedAt, record }`: the record overwritten by a save; the last 5 per project are kept |
| `blobs` | `fileName` | none | `{ fileName, blob, mimeType, byteLength, createdAt }`; names are `<uuid>.<jpg\|png\|webp\|heic\|pdf>` |
| `kv` | `key` | none | `printers`, `settings`, `journal` documents (`src/domain/models/printerState.ts`, `appSettings.ts`, `journal.ts`, each with `schemaVersion` 1). A value that fails to parse is copied to `<key>.corrupt` before the default is used |

- A project record that fails to parse is never deleted. The library lists it as quarantined (id, reason
  `corrupt` or `newerVersion`, parse error). `schemaVersion` is checked before parsing and routed through
  `src/services/storage/migrations.ts`; a newer version is refused, not downgraded.
- Blob limits come from the Swift app: images 80 MiB (`ImageImportService.swift:5`), PDFs 50 MiB
  (`DocumentFileStore.swift:8`). Empty files and any other type are rejected with a typed `DomainError`.
- Language and appearance stay in `localStorage` (`tibaeati.language`, appearance key).

Backup file (`src/services/storage/backup.ts`): a zip with `manifest.json`
`{ format: 'tibaeati-backup', version: 1, createdAt, appVersion, scope: 'all' | 'project' }`,
`projects.json` (array of project records), `kv.json` (array of `{ key, value }` for the three kv keys) and
`blobs/<fileName>`. Import accepts only these exact entry names, validates every record with zod and every
file name against the allow-list (no separators, `..` or absolute paths), and bounds the expanded size
(1.5 GiB, 20 000 entries). All validation happens before the first write; a failed import changes nothing.

## Feature folders (planned)

home, library, editor, preview, printers, calibration, verification, photos, documents, batch,
onboarding, settings, backup.

## Tests

- `src/domain/**/*.test.ts`: golden tests ported from the Swift XCTest suite (numbers identical).
- `e2e/`: Playwright smoke (install shell, create project, export PDF).

## Deploy

`.github/workflows/deploy.yml`: lint, typecheck, test, build, publish `dist/` to GitHub Pages.
