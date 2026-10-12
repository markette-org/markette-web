import { CountMode } from '../../core/models';

/** Same URL pattern the backend uses (apps/channels/providers/text.py). */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

let segmenter: Intl.Segmenter | null | undefined;
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    } catch {
      segmenter = null;
    }
  }
  return segmenter;
}

/** Extended grapheme clusters (what Bluesky counts). */
export function countGraphemes(text: string): number {
  const seg = getSegmenter();
  if (seg) {
    let n = 0;
    for (const _ of seg.segment(text)) n++;
    return n;
  }
  return Array.from(text).length;
}

function xWeight(chunk: string): number {
  let w = 0;
  for (const ch of chunk) {
    const cp = ch.codePointAt(0) ?? 0;
    const light =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    w += light ? 1 : 2;
  }
  return w;
}

/** X weighted length: URLs weigh 23, CJK and emoji 2, everything else 1. */
export function countX(text: string): number {
  let length = 0;
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    length += xWeight(text.slice(last, start)) + 23;
    last = start + m[0].length;
  }
  return length + xWeight(text.slice(last));
}

/** Mastodon: every URL counts as 23 characters. */
export function countMastodon(text: string): number {
  return countCodepoints(text.replace(URL_RE, 'x'.repeat(23)));
}

/** Python len(): code points, not UTF-16 units. */
export function countCodepoints(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

export function measure(text: string, mode: CountMode = 'chars'): number {
  switch (mode) {
    case 'graphemes':
      return countGraphemes(text);
    case 'x':
      return countX(text);
    case 'mastodon':
      return countMastodon(text);
    default:
      return countCodepoints(text);
  }
}

const SEPARATOR_RE = /^[ \t]*---+[ \t]*$/m;

/**
 * Mirrors the backend's split_thread: posts of at most `limit`, broken at `---` lines, else by
 * paragraph, sentence, then word; numbered "i/n" when there is more than one.
 */
export function splitThread(text: string, limit: number, mode: CountMode = 'chars', numbering = true): string[] {
  const reserve = numbering ? '\n\n99/99'.length : 0;
  const budget = Math.max(limit - reserve, 20);
  const fits = (s: string) => measure(s, mode) <= budget;
  const pack = (pieces: string[], joiner: string): string[] => {
    const out: string[] = [];
    let cur = '';
    for (const piece of pieces) {
      const cand = cur ? `${cur}${joiner}${piece}` : piece;
      if (fits(cand)) {
        cur = cand;
        continue;
      }
      if (cur) out.push(cur);
      cur = '';
      if (fits(piece)) cur = piece;
      else out.push(...chunks(piece));
    }
    if (cur) out.push(cur);
    return out;
  };
  const chunks = (block: string): string[] => {
    const sentences = block.split(/(?<=[.!?…])\s+/).filter(Boolean);
    if (sentences.length > 1) return pack(sentences, ' ');
    const words = block.split(' ');
    if (words.length > 1) return pack(words, ' ');
    const cut: string[] = [];
    let rest = block;
    while (rest) {
      let n = rest.length;
      while (n > 1 && !fits(rest.slice(0, n))) n--;
      cut.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    return cut;
  };
  let posts: string[];
  if (SEPARATOR_RE.test(text)) {
    posts = [];
    for (const raw of text.split(new RegExp(SEPARATOR_RE.source, 'gm'))) {
      const block = raw.trim();
      if (block) posts.push(...(fits(block) ? [block] : pack(block.split(/\n\s*\n/), '\n\n')));
    }
  } else if (measure(text, mode) <= limit) {
    return [text];
  } else {
    posts = pack(
      text
        .trim()
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
      '\n\n',
    );
  }
  if (numbering && posts.length > 1) posts = posts.map((p, i) => `${p}\n\n${i + 1}/${posts.length}`);
  return posts;
}
