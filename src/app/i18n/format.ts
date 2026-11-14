import type { Message, MessageParam, MessageParams } from '@/domain/messages';

type Lookup = (key: string) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

function paramText(param: MessageParam, lookup: Lookup): string {
  if (typeof param === 'object') return formatMessage(param, lookup);
  return String(param);
}

/** Fills `{name}` placeholders; a param may itself be a Message, resolved with the same lookup. */
export function interpolate(template: string, params: MessageParams | undefined, lookup: Lookup) {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : paramText(value, lookup);
  });
}

export function formatMessage(message: Message, lookup: Lookup): string {
  return interpolate(lookup(message.key), message.params, lookup);
}
