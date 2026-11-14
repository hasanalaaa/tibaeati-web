#!/usr/bin/env node
// Browser verification of the export edge (not shipped; nothing under src imports this).
//
// Usage (playwright-core lives OUTSIDE the project so it never enters package.json):
//   mkdir -p /tmp/tibaeati-verify && (cd /tmp/tibaeati-verify && npm i playwright-core)
//   node scripts/verify-export.mjs /tmp/tibaeati-verify
//
// It bundles a tiny harness page with Vite (from this project's node_modules), serves it on
// 127.0.0.1, opens it in the installed Chrome (or Playwright's Chromium), and inside the page:
//   - draws 8 synthetic coloured photos on a canvas,
//   - exports an 8-card duplex A4 PDF at 600 dpi through the real worker/canvas pipeline,
//   - parses the PDF back with pdf-lib (page count, MediaBox, embedded image pixel sizes),
//   - exports PNG pages at 600 dpi (expects a lowered dpi + warning, never a crash),
//   - exports the calibration sheet (Arabic labels rasterised through textToPng).
// Prints a JSON report with timings and the peak canvas size, and exits non-zero on failure.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scratch = resolve(process.argv[2] ?? '/tmp/tibaeati-verify');
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const harnessDir = join(scratch, 'harness');
const outDir = join(scratch, 'dist');
mkdirSync(harnessDir, { recursive: true });

const harness = String.raw`
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { buildLayout } from '@/domain/layout/engine';
import { createCardEntry } from '@/domain/models/cardEntry';
import { createPrintProject } from '@/domain/models/printProject';
import { defaultProjectSettings } from '@/domain/models/projectSettings';
import { exportCalibrationSheetPdf, exportProjectPdf } from '@/services/pdf';
import { CANVAS_PIXEL_BUDGET, exportPagesPng, rasterStats } from '@/services/image';

async function syntheticPhoto(index) {
  const canvas = new OffscreenCanvas(2400, 1520);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'hsl(' + index * 45 + ', 80%, 50%)';
  ctx.fillRect(0, 0, 2400, 1520);
  ctx.fillStyle = '#fff';
  ctx.font = '200px sans-serif';
  ctx.fillText('Card ' + (index + 1), 300, 800);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
}

window.runVerify = async () => {
  const report = { checks: [], env: {
    worker: typeof Worker !== 'undefined', offscreen: typeof OffscreenCanvas !== 'undefined',
    userAgent: navigator.userAgent } };
  const check = (name, ok, detail) => report.checks.push({ name, ok: Boolean(ok), detail });
  const files = new Map();
  const cards = [];
  for (let i = 0; i < 8; i += 1) {
    files.set('c' + i + '.jpg', await syntheticPhoto(i));
    cards.push(createCardEntry({ kind: 'unified', order: i, frontImageFileName: 'c' + i + '.jpg', backImageFileName: 'c' + ((i + 1) % 8) + '.jpg' }));
  }
  const settings = { ...defaultProjectSettings(), exportDPI: 600, flipBackHorizontally: true };
  const project = createPrintProject({ name: 'Verify 600 dpi', mode: 'unifiedOnly', settings, cards }, new Date());
  const layout = buildLayout(project);
  const deps = { loadBlob: (name) => Promise.resolve(files.get(name)) };

  let t0 = performance.now();
  const pdfBlob = await exportProjectPdf(project, layout, deps);
  report.pdfMs = Math.round(performance.now() - t0);
  report.pdfBytes = pdfBlob.size;
  const doc = await PDFDocument.load(new Uint8Array(await pdfBlob.arrayBuffer()), { updateMetadata: false });
  const pages = doc.getPages();
  check('pdf has 2 pages (front + back)', pages.length === 2, pages.length);
  for (const page of pages) {
    const box = page.getMediaBox();
    check('A4 MediaBox', box.x === 0 && box.y === 0 && Math.abs(box.width - 595.2756) < 0.001 && Math.abs(box.height - 841.8898) < 0.001, box);
  }
  const images = [];
  doc.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
      images.push([obj.dict.get(PDFName.of('Width')).asNumber(), obj.dict.get(PDFName.of('Height')).asNumber()]);
    }
  });
  check('8 card images embedded once each (front/back reuse files)', images.length === 8, images.length);
  check('card images rendered at 600 dpi (2022 x 1275 px)', images.every(([w, h]) => w === 2022 && h === 1275), images[0]);
  check('producer metadata', doc.getProducer() === 'Tibaeati Web', doc.getProducer());

  t0 = performance.now();
  const png = await exportPagesPng(project, layout, deps, 600);
  report.pngMs = Math.round(performance.now() - t0);
  report.pngDpi = png.dpi;
  report.pngWarning = png.warning;
  check('png pages: 2 blobs', png.pages.length === 2, png.pages.length);
  check('png dpi lowered with warning (A4 @600 > budget)', png.dpi < 600 && png.warning?.key === 'export.dpiReduced', png.dpi);
  const bitmap = await createImageBitmap(png.pages[0]);
  check('png page within budget', bitmap.width * bitmap.height <= CANVAS_PIXEL_BUDGET, [bitmap.width, bitmap.height]);
  // A pixel inside the first front card, and one in the gutter, from the real raster.
  const probe = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  probe.drawImage(bitmap, 0, 0);
  const k = bitmap.width / layout.pageSize.width;
  const slot = layout.frontPages[0][0].rect;
  const inside = probe.getImageData(Math.floor((slot.x + 20) * k), Math.floor((slot.y + 20) * k), 1, 1).data;
  const gutter = probe.getImageData(Math.floor((slot.x - 8) * k), Math.floor((slot.y + slot.height / 2) * k), 1, 1).data;
  check('png: artwork inside the slot', !(inside[0] > 245 && inside[1] > 245 && inside[2] > 245), Array.from(inside));
  check('png: white gutter outside the slot', gutter[0] > 245 && gutter[1] > 245 && gutter[2] > 245, Array.from(gutter));
  bitmap.close();

  t0 = performance.now();
  const sheet = await exportCalibrationSheetPdf(settings, 'طابعة المكتب', {
    translate: (key) => ({ 'calibrationSheet.frontTitle': 'FRONT · الوجه', 'calibrationSheet.backTitle': 'BACK · الظهر' })[key] ?? 'اطبع بالحجم الفعلي 100%',
  });
  report.calibrationMs = Math.round(performance.now() - t0);
  const sheetDoc = await PDFDocument.load(new Uint8Array(await sheet.arrayBuffer()));
  check('calibration sheet: 2 pages', sheetDoc.getPageCount() === 2, sheetDoc.getPageCount());

  report.raster = rasterStats();
  check('peak canvas within budget', report.raster.peakCanvasPixels <= CANVAS_PIXEL_BUDGET, report.raster.peakCanvasPixels);
  report.ok = report.checks.every((c) => c.ok);
  return report;
};
document.body.dataset.ready = '1';
`;
writeFileSync(join(harnessDir, 'harness.js'), harness);
writeFileSync(
  join(harnessDir, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>verify</title><body><script type="module" src="./harness.js"></script></body>',
);

const requireProject = createRequire(join(projectRoot, 'package.json'));
const { build } = await import(requireProject.resolve('vite'));
await build({
  root: harnessDir,
  configFile: false,
  logLevel: 'warn',
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${join(projectRoot, 'src')}/` },
      { find: /^pdf-lib$/, replacement: join(projectRoot, 'node_modules/pdf-lib') },
    ],
  },
  worker: { format: 'es' },
  build: { outDir, emptyOutDir: true, target: 'es2022' },
});

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = join(outDir, decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/\/$/, '/index.html'));
  if (!path.startsWith(outDir) || !existsSync(path)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/`;

const requireScratch = createRequire(join(scratch, 'package.json'));
const { chromium, webkit } = requireScratch('playwright-core');
// VERIFY_BROWSER=webkit runs the same harness in Playwright's WebKit (closest to iOS Safari).
let browser;
if (process.env.VERIFY_BROWSER === 'webkit') {
  browser = await webkit.launch();
} else {
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch {
    browser = await chromium.launch();
  }
}
let exitCode = 1;
try {
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
  await page.goto(url);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached' });
  const report = await page.evaluate(() => window.runVerify());
  report.workerScriptLoaded = requests.some((r) => /render\.worker/.test(r));
  report.offOriginRequests = requests.filter((r) => !r.startsWith(url) && !r.startsWith('blob:'));
  report.ok = report.ok && report.offOriginRequests.length === 0;
  console.log(JSON.stringify(report, null, 2));
  exitCode = report.ok ? 0 : 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(exitCode);
