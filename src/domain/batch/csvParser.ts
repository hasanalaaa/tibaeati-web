/**
 * CSV with one detected delimiter, quoted fields and physical error line numbers
 * (port of BatchCSVParser.swift).
 */

export type BatchCSVFailure =
  | { readonly kind: 'inputTooLarge' }
  | { readonly kind: 'emptyFile' }
  | { readonly kind: 'inconsistentColumnCount'; readonly line: number }
  | { readonly kind: 'malformedCSV'; readonly line: number }
  | { readonly kind: 'duplicateColumnName' }
  | { readonly kind: 'undecodableUTF8' };

export class BatchCSVError extends Error {
  readonly failure: BatchCSVFailure;
  constructor(failure: BatchCSVFailure) {
    super(failure.kind);
    this.name = 'BatchCSVError';
    this.failure = failure;
  }
}

/** One CSV record keyed by header. Null-prototype so a header like "__proto__" is plain data. */
export type BatchRow = Readonly<Record<string, string>>;

export interface Table {
  readonly columns: readonly string[];
  readonly rows: readonly BatchRow[];
}

export const MAXIMUM_INPUT_BYTES = 2 * 1_024 * 1_024;

/** Swift `text.utf8.count` without allocating. Lone surrogates count as U+FFFD (3 bytes). */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

// Foundation CharacterSet.whitespaces: Unicode category Zs plus U+0009 (not newlines).
const WHITESPACE_EDGES =
  /^[\t\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+|[\t\u0020\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+$/g;

function trimWhitespaces(value: string): string {
  return value.replace(WHITESPACE_EDGES, '');
}

export function parse(input: string): Table {
  if (utf8Length(input) > MAXIMUM_INPUT_BYTES) throw new BatchCSVError({ kind: 'inputTooLarge' });
  const text = input.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  // Code points, not UTF-16 units, so astral characters stay whole.
  const chars = Array.from(text);

  let delimiter = ',';
  let quoted = false;
  for (const character of chars) {
    if (character === '"') quoted = !quoted;
    if (!quoted) {
      if (character === ',' || character === ';') {
        delimiter = character;
        break;
      }
      if (character === '\n') break;
    }
  }

  let header: string[] = [];
  const rows: BatchRow[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = (): void => {
    fields.push(field);
    try {
      if (fields.length === 1 && fields[0] === '') return;
      if (header.length === 0) {
        header = fields.map(trimWhitespaces);
        if (header.includes('')) {
          throw new BatchCSVError({ kind: 'inconsistentColumnCount', line: recordLine });
        }
        if (new Set(header).size !== header.length) {
          throw new BatchCSVError({ kind: 'duplicateColumnName' });
        }
      } else {
        if (fields.length === header.length + 1 && fields[fields.length - 1] === '') fields.pop();
        if (fields.length !== header.length) {
          throw new BatchCSVError({ kind: 'inconsistentColumnCount', line: recordLine });
        }
        const row: Record<string, string> = Object.create(null) as Record<string, string>;
        header.forEach((name, i) => {
          row[name] = fields[i] ?? '';
        });
        rows.push(row);
      }
    } finally {
      fields = [];
      field = '';
      closedQuote = false;
    }
  };

  let index = 0;
  while (index < chars.length) {
    const character = chars[index] ?? '';
    const next = index + 1;
    if (inQuotes) {
      if (character === '"') {
        if (next < chars.length && chars[next] === '"') {
          field += '"';
          index = next + 1;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
      } else {
        field += character;
      }
    } else if (character === delimiter) {
      fields.push(field);
      field = '';
      closedQuote = false;
    } else if (character === '\n') {
      endRecord();
      recordLine = line + 1;
    } else if (character === '"' && field === '' && !closedQuote) {
      inQuotes = true;
    } else {
      if (closedQuote || character === '"') throw new BatchCSVError({ kind: 'malformedCSV', line });
      field += character;
    }
    if (character === '\n') line += 1;
    index = next;
  }
  if (inQuotes) throw new BatchCSVError({ kind: 'malformedCSV', line: recordLine });
  if (fields.length > 0 || field !== '' || closedQuote) endRecord();
  if (header.length === 0 || rows.length === 0) throw new BatchCSVError({ kind: 'emptyFile' });
  return { columns: header, rows };
}

export function parseData(data: Uint8Array): Table {
  if (data.length > MAXIMUM_INPUT_BYTES) throw new BatchCSVError({ kind: 'inputTooLarge' });
  let text: string;
  try {
    // ignoreBOM keeps U+FEFF in the output so it is stripped explicitly below, as in Swift.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
  } catch {
    throw new BatchCSVError({ kind: 'undecodableUTF8' });
  }
  return parse(text.startsWith('\uFEFF') ? text.slice(1) : text);
}
