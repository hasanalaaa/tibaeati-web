# Tibaeati Web — SPEC

## Problem

Tibaeati (طباعتي) is an iOS SwiftUI print studio for Iraqi ID cards and documents. Without a paid
Apple developer account it expires every 7 days and cannot be given to other people. This project
re-creates it as an installable, offline-first PWA that runs on iPhone, iPad and Mac from one codebase.

Reference implementation (read-only, source of truth for behaviour and numbers):
`/Users/hasanalaaa/Documents/Tibaeati` (Swift). Its map: `.claude/codemap.md` there.

## Hard constraints (Never break)

- N1. No backend, no account, no analytics, no remote fonts/scripts/CDNs. Zero network requests at
  runtime except fetching the app's own static files. User data never leaves the device.
- N2. Physical measurements are exact. Card sizes are stored as integer micrometres. The engine never
  scales a card to fit a sheet. PDF geometry must match the Swift engine to < 0.001 mm.
- N3. Works fully offline after first load. Installable (Add to Home Screen / Add to Dock).
- N4. Arabic-first RTL UI with English as second language. Light and dark.
- N5. Data loss protection: autosave, backup/restore to a single file, persistent-storage request.

## Scope — Must (parity with iOS 3.0)

- M1. Home with six modes: Unified card (85.60 × 53.98 mm), Housing card (90 × 60 mm), Both,
  Personal photos (30 × 40 mm, ten on A4), Iraqi ePassport (125 × 88; open 125 × 176 / 176 × 125),
  Documents (driving licence 86 × 54, A4, A5, custom, native PDF pass-through).
- M2. Card editor: front/back images per card, import many, reorder, gesture image adjust
  (pan/zoom/rotate, grid, smart fit, undo/redo), per-project settings.
- M3. Layout engine: micrometre grid, A4 2×4 defaults, mixed-mode RTL flow, duplex back derived from
  the front rectangles, long/short edge flip, X/Y offset and X/Y scale corrections.
- M4. Preview: page thumbnails, page inspector, duplex overlay inspector (opacity + difference).
- M5. Preflight: measurement, layout feasibility, front/back match, completeness, effective DPI.
- M6. Export: PDF (exact page size, 1:1), PNG pages; share sheet; print.
- M7. Printers: built-in profiles (22), nickname, per-printer measured calibration override,
  calibration sheet PDF (2 pages, rulers, 100 × 150 mm frame), duplex calibration screen,
  auto-solving calibration wizard.
- M8. Verification: scan-diff-fix closed loop (scan printed sheet, measure error, propose correction).
- M9. Scan quality grading + enhancement of imported images; perspective crop.
- M10. Batch generation from CSV.
- M11. Document studio: images + PDF pages, rotate, reorder, optional crop, copies, paper, margins,
  gaps, border, single-page preview.
- M12. Projects library: autosave, save-now, previous-version restore, delete with confirm, search.
- M13. Onboarding, home dashboard (journal of prints/calibrations), settings (language, appearance,
  margins), optional app lock, privacy shield on app switch.

## Scope — Must (new, beyond iOS)

- X1. Full backup / restore of everything to one file; per-project export/import (move between devices).
- X2. Responsive desktop/tablet layouts; drag-and-drop and paste import; keyboard shortcuts on Mac.
- X3. Multiple saved printers, each with its own calibration; pick per print.
- X4. In-app update prompt when a new version is deployed; visible version number.
- X5. Storage usage screen with persistence status.

## Later

- Auto document edge detection, face auto-framing (need local ML model; manual tools ship first).
- Import of iOS app project files.

## Never

- Cloud sync, accounts, telemetry, ads, server-side anything.

## Non-functional

- First load < 1.5 MB gzipped app shell; heavy libs (pdf.js) lazy-loaded.
- Export of a full 8-card duplex A4 at 600 dpi must not crash iPhone Safari (bounded memory, tiles/JPEG).
- WCAG 2.2 AA; all controls reachable by keyboard; reduced motion respected.

## Known platform limits (accepted)

- No silent printing to a saved printer; printing goes through the OS print dialog / share sheet.
- Removing the home-screen icon deletes local data (mitigated by X1).
- Print accuracy on paper is verified at the end with the calibration sheet (user decision, 2026-11-14).

## Slices

S0 skeleton+deploy · S1 domain core · S2 storage+library · S3 editor · S4 preview+export+preflight ·
S5 printers+calibration · S6 personal photos · S7 documents+passport · S8 batch CSV ·
S9 scan quality+verification · S10 onboarding+dashboard+settings+lock+backup · S11 polish+launch.
