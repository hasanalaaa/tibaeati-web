import { card, EPOCH, makeProject } from '../testFixtures';
import { CardEntrySchema } from './cardEntry';
import { PrintProjectSchema, projectImageFileNames } from './printProject';

describe('PrintProject schema', () => {
  it('round-trips through JSON unchanged', () => {
    const project = makeProject('mixed', [card('unified', 0), card('housing', 0, 'h.jpg', null)]);
    const reloaded = PrintProjectSchema.parse(JSON.parse(JSON.stringify(project)));
    expect(reloaded).toEqual(project);
    expect(reloaded.createdAt).toBe(EPOCH.toISOString());
    expect(projectImageFileNames(reloaded)).toEqual(['f.jpg', 'b.jpg', 'h.jpg']);
  });

  it('decodes missing card fields with Swift defaults and normalises placement', () => {
    const decoded = CardEntrySchema.parse({
      id: '6F9619FF-8B86-4D11-B42D-00C04FC964FF',
      order: -3,
      frontPlacement: { scale: 9, offsetX: -2 },
    });
    expect(decoded.kind).toBe('unified');
    expect(decoded.order).toBe(0);
    expect(decoded.frontPlacement).toEqual({ scale: 4, offsetX: -1.5, offsetY: 0 });
    expect(decoded.backPlacement).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('rejects a record from another schema version', () => {
    const project = { ...makeProject('unifiedOnly'), schemaVersion: 2 };
    expect(PrintProjectSchema.safeParse(project).success).toBe(false);
  });
});
