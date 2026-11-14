# ADR 0001 — Stack

Status: accepted (2026-11-14)

## Decision

| Concern          | Choice                                                                          | Why                                                                |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Build            | Vite + TypeScript (strict)                                                      | static output, fast, no server                                     |
| UI               | React 19                                                                        | largest ecosystem, agents know it well                             |
| Styling          | Tailwind CSS v4 + CSS variables tokens                                          | logical properties for RTL, tiny runtime                           |
| Routing          | wouter with hash location                                                       | GitHub Pages has no SPA fallback; hash routes need none            |
| PWA              | vite-plugin-pwa (Workbox, precache everything, prompt-to-update)                | offline + installable                                              |
| Storage          | IndexedDB via Dexie; image/PDF bytes as Blobs                                   | local only, large binary support on iOS Safari                     |
| Validation       | zod at storage and import boundaries                                            | persisted data is a contract                                       |
| PDF write        | pdf-lib                                                                         | exact geometry in points, embeds JPEG/PNG, copies vector PDF pages |
| PDF read/preview | pdfjs-dist, lazy-loaded                                                         | only needed in the document studio                                 |
| Archive          | fflate                                                                          | backup file (zip)                                                  |
| Image work       | Canvas / OffscreenCanvas in a Web Worker, own code                              | replaces Apple Vision; no ML dependency in v1                      |
| Tests            | Vitest (unit), Playwright (e2e smoke)                                           | golden tests ported from XCTest                                    |
| Lint/format      | ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier                     | guard rails from day one                                           |
| Host             | GitHub Pages via Actions, repo `hasanalaaa/tibaeati-web`, base `/tibaeati-web/` | free, static, HTTPS                                                |

Fonts: system stack only (SF Arabic on Apple devices). No web-font downloads.
Text inside PDFs (batch names etc.) is rasterised from canvas at print dpi because pdf-lib has no
Arabic shaping.

## Rejected

- Capacitor / React Native / native: still needs Apple signing, the problem being solved.
- Next.js: server features unused; static export adds nothing over Vite.
- OPFS for blobs: fine on new Safari, but Blobs in IndexedDB are simpler and equally durable.
- A state library: React state + repository modules are enough; add one only when two features need it.

## Costs

0. GitHub Pages on a free plan requires the repository to be public: the source code is public,
   user data is not involved.
