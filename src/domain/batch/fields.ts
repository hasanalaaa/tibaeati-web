/**
 * Variable-data field resolution for batch generation (port of BatchField.swift).
 *
 * Template syntax (validated up-front, never guessed at render time):
 *   {name}, {id}, ...  value from the mapped CSV column
 *   {seq:0001}         zero-padded sequence number; the digit count in the token IS the pad width
 *   {qr:<payload>}     the whole overlay becomes a QR code whose payload may contain {column} refs
 * Unknown column references throw `unknownColumn`: a silent blank would print wrong cards.
 */

export type BatchFieldFailure =
  /** Template referenced `{x}` but no column named "x" exists. */
  | { readonly kind: 'unknownColumn'; readonly name: string }
  /** Structurally broken template (e.g. nested braces). */
  | { readonly kind: 'invalidTemplate'; readonly reason: string };

export class BatchFieldError extends Error {
  readonly failure: BatchFieldFailure;
  constructor(failure: BatchFieldFailure) {
    super(failure.kind);
    this.name = 'BatchFieldError';
    this.failure = failure;
  }
}

type Row = Readonly<Record<string, string>>;

const invalidTemplate = (reason: string): BatchFieldError =>
  new BatchFieldError({ kind: 'invalidTemplate', reason });

/** Swift String(sequenceNumber).leftPadded(toLength:): zero-pads |n|, never truncates. */
function leftPadded(sequenceNumber: number, length: number): string {
  const digits = String(Math.abs(sequenceNumber));
  return digits.length < length ? '0'.repeat(length - digits.length) + digits : digits;
}

/** Substitutes every non-qr token (columns and seq). Shared by text and QR-payload resolution. */
function substitutePlainTokens(raw: string, row: Row, sequenceNumber: number): string {
  let result = '';
  let remainder = raw;
  for (;;) {
    const open = remainder.indexOf('{');
    if (open === -1) break;
    if (remainder.slice(0, open).includes('}')) throw invalidTemplate("unexpected '}'");
    const close = remainder.indexOf('}', open);
    if (close === -1) throw invalidTemplate("unclosed '{'");
    result += remainder.slice(0, open);
    const inner = remainder.slice(open + 1, close);
    if (inner === '' || inner.includes('{')) throw invalidTemplate('empty or nested token');

    if (inner.startsWith('qr:')) {
      // Nested qr payloads are not supported (one QR per overlay).
      throw invalidTemplate('nested {qr:…}');
    } else if (inner.startsWith('seq:')) {
      const padRaw = inner.slice('seq:'.length);
      const pad = /^[0-9]+$/.test(padRaw) ? Number(padRaw) : Number.NaN;
      if (!(pad >= 1 && pad <= 12)) throw invalidTemplate(`bad {seq:${padRaw}}`);
      result += leftPadded(sequenceNumber, pad);
    } else {
      if (!Object.hasOwn(row, inner))
        throw new BatchFieldError({ kind: 'unknownColumn', name: inner });
      result += row[inner] ?? '';
    }
    remainder = remainder.slice(close + 1);
  }
  if (remainder.includes('}')) throw invalidTemplate("unexpected '}'");
  return result + remainder;
}

/** True when the template renders a QR code instead of plain text. */
export function isQRTemplate(raw: string): boolean {
  return raw.startsWith('{qr:') && raw.endsWith('}');
}

function innerPayload(raw: string): string {
  return isQRTemplate(raw) ? raw.slice(4, -1) : raw;
}

/** Validates a template against the available column names. */
export function validate(raw: string, columns: ReadonlySet<string>): void {
  const blankRow: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const column of columns) blankRow[column] = '';
  substitutePlainTokens(innerPayload(raw), blankRow, 1);
}

/** Extracts the QR payload of a `{qr:…}` template and resolves its inner references; null for non-QR templates. */
export function qrPayload(raw: string, row: Row, sequenceNumber: number): string | null {
  if (!isQRTemplate(raw)) return null;
  return substitutePlainTokens(raw.slice(4, -1), row, sequenceNumber);
}

/** Renders a text template: substitutes {columns} and {seq:NNNN}. */
export function renderText(
  raw: string,
  row: Row,
  sequenceNumber: number,
  columns: ReadonlySet<string>,
): string {
  validate(raw, columns);
  return substitutePlainTokens(raw, row, sequenceNumber);
}
