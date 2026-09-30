/**
 * The body format written by the rich-text toolbar (reviews, devlogs) — a tiny,
 * safe markdown subset. Stored as plain text server-side, parsed here into a
 * node tree that templates render without innerHTML.
 *
 *   **bold**   *italic*   __underline__   [label](https://url)
 *   ||hidden text||            inline spoiler, "▨ spoiler hidden" until clicked
 *   ||act 3 ending::hidden||   same, with a visible topic ("▨ spoiler hidden — act 3 ending")
 *   - item                     bullet line
 *   > quote                    quote line
 */

export type RichInline =
  | { kind: 'text'; text: string }
  | { kind: 'bold' | 'italic' | 'underline'; children: RichInline[] }
  | { kind: 'link'; href: string; children: RichInline[] }
  | { kind: 'spoiler'; id: number; label: string; children: RichInline[] };

export type RichBlock =
  | { kind: 'paragraph'; children: RichInline[] }
  | { kind: 'bullets'; items: RichInline[][] }
  | { kind: 'quote'; children: RichInline[] };

const INLINE_RULES: { re: RegExp; build: (m: RegExpExecArray, parse: (s: string) => RichInline[]) => RichInline }[] = [
  {
    re: /\|\|(?:([^|:]{1,60})::)?([\s\S]+?)\|\|/,
    build: (m, parse) => ({ kind: 'spoiler', id: 0, label: (m[1] ?? '').trim(), children: parse(m[2]) }),
  },
  { re: /\*\*([\s\S]+?)\*\*/, build: (m, parse) => ({ kind: 'bold', children: parse(m[1]) }) },
  { re: /__([\s\S]+?)__/, build: (m, parse) => ({ kind: 'underline', children: parse(m[1]) }) },
  { re: /\*([^*\n]+?)\*/, build: (m, parse) => ({ kind: 'italic', children: parse(m[1]) }) },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    build: (m, parse) => ({ kind: 'link', href: m[2], children: parse(m[1]) }),
  },
];

function parseInline(source: string): RichInline[] {
  const out: RichInline[] = [];
  let rest = source;
  while (rest.length) {
    let best: { index: number; length: number; node: RichInline } | null = null;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, length: m[0].length, node: rule.build(m, parseInline) };
      }
    }
    if (!best) {
      out.push({ kind: 'text', text: rest });
      break;
    }
    if (best.index > 0) {
      out.push({ kind: 'text', text: rest.slice(0, best.index) });
    }
    out.push(best.node);
    rest = rest.slice(best.index + best.length);
  }
  return out;
}

/** Parses a body into blocks; spoiler ids are numbered in document order. */
export function parseRichText(source: string | null | undefined): RichBlock[] {
  const blocks: RichBlock[] = [];
  const paragraphs = (source ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const para of paragraphs) {
    const lines = para.split('\n');
    let buffer: string[] = [];
    const flush = () => {
      if (buffer.length) {
        blocks.push({ kind: 'paragraph', children: parseInline(buffer.join('\n')) });
        buffer = [];
      }
    };
    for (const line of lines) {
      if (/^\s*[-•]\s+/.test(line)) {
        flush();
        const item = parseInline(line.replace(/^\s*[-•]\s+/, ''));
        const last = blocks[blocks.length - 1];
        if (last?.kind === 'bullets') {
          last.items.push(item);
        } else {
          blocks.push({ kind: 'bullets', items: [item] });
        }
      } else if (/^\s*>\s?/.test(line)) {
        flush();
        blocks.push({ kind: 'quote', children: parseInline(line.replace(/^\s*>\s?/, '')) });
      } else if (line.trim().length) {
        buffer.push(line);
      }
    }
    flush();
  }

  let spoilerId = 0;
  const number = (nodes: RichInline[]) => {
    for (const n of nodes) {
      if (n.kind === 'spoiler') {
        n.id = spoilerId++;
      }
      if ('children' in n) {
        number(n.children);
      }
    }
  };
  for (const b of blocks) {
    if (b.kind === 'bullets') {
      b.items.forEach(number);
    } else {
      number(b.children);
    }
  }
  return blocks;
}

/** True when the body contains at least one ||spoiler||. */
export function hasSpoilers(source: string | null | undefined): boolean {
  return /\|\|[\s\S]+?\|\|/.test(source ?? '');
}

/** Formatting stripped, spoilers masked — for previews, meta descriptions, truncation. */
export function richTextToPlain(source: string | null | undefined): string {
  return (source ?? '')
    .replace(/\|\|(?:[^|:]{1,60}::)?[\s\S]+?\|\|/g, '▨ spoiler')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/^\s*[-•>]\s?/gm, '');
}
