/**
 * Client-side mirror of Provider.prepare_first_comment (backend apps/channels/providers/base.py):
 * with "links in first comment", every URL leaves the post text, the link card is dropped and the
 * URLs (plus the post link) are appended to the first comment after the user's own comment text.
 */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export interface FirstCommentSplit {
  /** Text actually posted (links removed when moved). */
  text: string;
  /** Link card URL still attached to the post ('' when moved). */
  link: string;
  /** Final first comment ('' when none). */
  comment: string;
  /** Whether links were moved. */
  moved: boolean;
}

export function splitFirstComment(
  text: string,
  link: string,
  firstComment: string | null | undefined,
  moveLinks: boolean,
): FirstCommentSplit {
  let comment = (firstComment ?? '').trim();
  if (!moveLinks) return { text, link, comment, moved: false };
  const urls: string[] = [];
  for (const m of text.matchAll(URL_RE)) urls.push(m[0].replace(/[.,;:!?)]+$/, ''));
  if (link) urls.push(link);
  const unique = [...new Set(urls)];
  if (!unique.length) return { text, link, comment, moved: false };
  let out = text;
  for (const u of unique) out = out.split(u).join('');
  // Drop punctuation left standing alone where a link was ("see https://x." → "see").
  out = out.replace(/[ \t]+[.,;!?]+(?=\s|$)/g, '');
  out = out
    .split('\n')
    .map((line) => line.split(/\s+/).filter(Boolean).join(' '))
    .join('\n')
    .trim();
  while (out.includes('\n\n\n')) out = out.replace(/\n\n\n/g, '\n\n');
  comment = [comment, ...unique].filter(Boolean).join('\n');
  return { text: out, link: '', comment, moved: true };
}
