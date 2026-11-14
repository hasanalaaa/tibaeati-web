import { prefixGraphemes } from './format';

const FORBIDDEN = new Set([
  '/',
  '\\',
  ':',
  '?',
  '%',
  '*',
  '|',
  '"',
  '<',
  '>',
  String.fromCharCode(0),
]);

export function safeFileNameComponent(
  value: string,
  fallback = 'Tibaeati',
  maximumLength = 80,
): string {
  const collapsed = value
    .trim()
    .split('')
    .map((char) => (FORBIDDEN.has(char) ? '-' : char))
    .join('')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+|[. ]+$/g, '');
  return prefixGraphemes(collapsed === '' ? fallback : collapsed, maximumLength);
}
