import { BatchFieldError, isQRTemplate, qrPayload, renderText, validate } from './fields';
import type { BatchFieldFailure } from './fields';

function failureOf(fn: () => unknown): BatchFieldFailure {
  try {
    fn();
  } catch (error) {
    if (error instanceof BatchFieldError) return error.failure;
    throw error;
  }
  throw new Error('expected a BatchFieldError');
}

describe('BatchGenerationTests (BatchField semantics)', () => {
  it('testSequenceNumberZeroPaddingFollowsTokenWidth', () => {
    const columns = new Set(['name']);
    expect(renderText('{seq:0004}|{name}', { name: 'علي' }, 7, columns)).toBe('0007|علي');
    expect(renderText('{seq:2}', {}, 42, new Set())).toBe('42');
    // Overflowing the pad width keeps the full number (never truncated).
    expect(renderText('{seq:3}', {}, 1234, new Set())).toBe('1234');
  });

  it('testQRPayloadResolvesEmbeddedFieldsAndSequence', () => {
    expect(qrPayload('{qr:{name}|{seq:5}}', { name: 'هدى' }, 9)).toBe('هدى|00009');
  });

  it('testUnknownColumnRefusedNotSilentlyBlanked', () => {
    expect(failureOf(() => validate('{namo}', new Set(['name'])))).toEqual({
      kind: 'unknownColumn',
      name: 'namo',
    });
  });

  it('testUnclosedBraceRefused', () => {
    expect(failureOf(() => validate('{name', new Set(['name']))).kind).toBe('invalidTemplate');
  });

  it('testMalformedSequenceAndQRFieldsAreRejectedBeforeRendering', () => {
    expect(() => {
      validate('{qr:{name}|{seq:4}}', new Set(['name']));
    }).not.toThrow();
    expect(() => {
      validate('{seq:0}', new Set());
    }).toThrow(BatchFieldError);
    expect(() => {
      validate('{qr:{missing}}', new Set(['name']));
    }).toThrow(BatchFieldError);
    expect(() => {
      validate('name}', new Set(['name']));
    }).toThrow(BatchFieldError);
  });
});

// Extra cases with no Swift test: they pin error reasons and limits the port must keep.
describe('fields extras (no Swift test)', () => {
  it('non-QR templates have no payload; QR detection needs prefix and suffix', () => {
    expect(qrPayload('{name}', { name: 'x' }, 1)).toBeNull();
    expect(isQRTemplate('{qr:abc}')).toBe(true);
    expect(isQRTemplate('{qr:abc')).toBe(false);
    expect(isQRTemplate('x{qr:abc}')).toBe(false);
  });

  it('rejects pad widths above 12 and non-ASCII digits, accepts 12', () => {
    expect(renderText('{seq:12}', {}, 5, new Set())).toBe('000000000005');
    expect(failureOf(() => validate('{seq:13}', new Set()))).toEqual({
      kind: 'invalidTemplate',
      reason: 'bad {seq:13}',
    });
    expect(failureOf(() => validate('{seq:٣}', new Set())).kind).toBe('invalidTemplate');
    expect(failureOf(() => validate('{seq:}', new Set())).kind).toBe('invalidTemplate');
  });

  it('rejects nested qr and nested braces with the Swift reasons', () => {
    expect(failureOf(() => validate('a{qr:x}', new Set()))).toEqual({
      kind: 'invalidTemplate',
      reason: 'nested {qr:…}',
    });
    expect(failureOf(() => validate('{{a}', new Set(['a'])))).toEqual({
      kind: 'invalidTemplate',
      reason: 'empty or nested token',
    });
    expect(failureOf(() => validate('{}', new Set()))).toEqual({
      kind: 'invalidTemplate',
      reason: 'empty or nested token',
    });
  });

  it('does not resolve inherited object keys as columns', () => {
    expect(failureOf(() => validate('{constructor}', new Set(['name'])))).toEqual({
      kind: 'unknownColumn',
      name: 'constructor',
    });
  });
});
