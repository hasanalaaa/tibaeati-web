import { BatchCSVError, MAXIMUM_INPUT_BYTES, parse, parseData } from './csvParser';
import type { BatchCSVFailure } from './csvParser';

function failureOf(fn: () => unknown): BatchCSVFailure {
  try {
    fn();
  } catch (error) {
    if (error instanceof BatchCSVError) return error.failure;
    throw error;
  }
  throw new Error('expected a BatchCSVError');
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('BatchGenerationTests (CSV parsing)', () => {
  it('testCommaCSVParsesColumnsAndRows', () => {
    const table = parse('name,id\nأحمد,0001\nسارة,0002\n');
    expect(table.columns).toEqual(['name', 'id']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.name).toBe('أحمد');
    expect(table.rows[1]?.id).toBe('0002');
  });

  it('testSemicolonSeparatorAutoAccepted', () => {
    const table = parse('name;id\nأحمد;0001\n');
    expect(table.columns).toEqual(['name', 'id']);
    expect(table.rows[0]?.id).toBe('0001');
  });

  it('testQuotedFieldsKeepSeparatorsAndNewlines', () => {
    const table = parse('name,note\n"عباس, الأكبر","سطر أول\nسطر ثانٍ"\n');
    expect(table.columns).toHaveLength(2);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.name).toBe('عباس, الأكبر');
    expect(table.rows[0]?.note?.includes('\n')).toBe(true);
  });

  it('testBOMIsStrippedFromWindowsExports', () => {
    const table = parseData(bytes('\uFEFFname,id\nأحمد,1\n'));
    expect(table.columns[0]).toBe('name');
    expect(table.rows[0]?.name).toBe('أحمد');
  });

  it('testRaggedLineRejectedWithPreciseLineNumber', () => {
    expect(failureOf(() => parse('name,id\nأحمد,1\nناقص\n'))).toEqual({
      kind: 'inconsistentColumnCount',
      line: 3,
    });
  });

  it('testDuplicateHeaderRejected', () => {
    expect(failureOf(() => parse('name,name\nأ,ب\n'))).toEqual({ kind: 'duplicateColumnName' });
  });

  it('testQuotedHeaderAndEscapedQuotesUseOnlyTheDetectedDelimiter', () => {
    const table = parse('"full,name",note\r\n"علي","said ""hello""; yes"\r\n');
    expect(table.columns).toEqual(['full,name', 'note']);
    expect(table.rows).toEqual([{ 'full,name': 'علي', note: 'said "hello"; yes' }]);
    expect(() => parse('name,note\nعلي,"unfinished')).toThrow(BatchCSVError);
  });
});

// Extra cases with no Swift test: they pin limits and error paths the port must keep.
describe('csvParser extras (no Swift test)', () => {
  it('rejects input over 2 MiB in bytes, accepts exactly 2 MiB', () => {
    const header = 'a\n';
    const atLimit = header + 'x'.repeat(MAXIMUM_INPUT_BYTES - header.length);
    expect(parse(atLimit).rows).toHaveLength(1);
    expect(failureOf(() => parse(atLimit + 'x'))).toEqual({ kind: 'inputTooLarge' });
    // 2 bytes per Arabic letter: byte length, not character count, is what counts.
    expect(failureOf(() => parse('ا'.repeat(MAXIMUM_INPUT_BYTES / 2 + 1)))).toEqual({
      kind: 'inputTooLarge',
    });
    expect(failureOf(() => parseData(new Uint8Array(MAXIMUM_INPUT_BYTES + 1)))).toEqual({
      kind: 'inputTooLarge',
    });
  });

  it('rejects invalid UTF-8 and header-only or blank input', () => {
    expect(failureOf(() => parseData(new Uint8Array([0x6e, 0xff, 0x0a])))).toEqual({
      kind: 'undecodableUTF8',
    });
    expect(failureOf(() => parse('name,id\n'))).toEqual({ kind: 'emptyFile' });
    expect(failureOf(() => parse(''))).toEqual({ kind: 'emptyFile' });
  });

  it('reports malformed quoting with the physical line', () => {
    expect(failureOf(() => parse('a,b\n"x"y,1\n'))).toEqual({ kind: 'malformedCSV', line: 2 });
    expect(failureOf(() => parse('a,b\n1,"open\nnever closed'))).toEqual({
      kind: 'malformedCSV',
      line: 2,
    });
  });

  it('tolerates one trailing delimiter and skips blank lines', () => {
    const table = parse('a,b\n1,2,\n\n3,4\n');
    expect(table.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('keeps a __proto__ header as plain data', () => {
    const table = parse('__proto__,b\n1,2\n');
    expect(Object.getPrototypeOf(table.rows[0])).toBeNull();
    expect(Object.entries(table.rows[0] ?? {})).toEqual([
      ['__proto__', '1'],
      ['b', '2'],
    ]);
  });
});
