import { buildLayout } from '@/domain/layout/engine';
import { defaultProjectSettings } from '@/domain/models/projectSettings';
import { cards, makeProject } from '@/domain/testFixtures';
import type { RasterJob } from './canvasOps';
import { CANVAS_PIXEL_BUDGET } from './placement';
import { exportPagesPng } from './exportPages';

const jobs = vi.hoisted(() => [] as RasterJob[]);
vi.mock('./render', () => ({
  renderRaster: (job: RasterJob) => {
    jobs.push(job);
    return Promise.resolve({ blob: new Blob(['png']), pixelWidth: 1, pixelHeight: 1, dpi: job.dpi, reduced: false });
  },
}));

const deps = { loadBlob: () => Promise.resolve(new Blob(['image'])) };

beforeEach(() => {
  jobs.length = 0;
});

describe('exportPagesPng (canvas mocked: the drawing itself is browser-only)', () => {
  it('renders front then back per sheet at the requested dpi when it fits', async () => {
    const project = makeProject('unifiedOnly', cards(12, 'unified'));
    const layout = buildLayout(project);
    const result = await exportPagesPng(project, layout, deps, 300);
    expect(result.pages).toHaveLength(4);
    expect(result.dpi).toBe(300);
    expect(result.warning).toBeUndefined();
    expect(jobs.map((j) => j.ops.filter((o) => o.kind === 'image').length)).toEqual([8, 8, 4, 4]);
    expect(Object.keys(jobs[0]?.sources ?? {})).toEqual(['f.jpg']);
  });

  it('lowers the dpi with a warning instead of exceeding the canvas budget', async () => {
    const project = makeProject('unifiedOnly', cards(1, 'unified'), defaultProjectSettings());
    const layout = buildLayout(project);
    const result = await exportPagesPng(project, layout, deps, 600);
    expect(result.dpi).toBeLessThan(600);
    const px = ((layout.pageSize.width * result.dpi) / 72) * ((layout.pageSize.height * result.dpi) / 72);
    expect(px).toBeLessThanOrEqual(CANVAS_PIXEL_BUDGET);
    expect(result.warning?.key).toBe('export.dpiReduced');
    expect(result.warning?.params.requested).toBe(600);
  });
});
