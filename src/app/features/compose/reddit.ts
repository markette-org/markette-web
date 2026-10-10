import { Channel, MediaAsset, RedditRequirements, TargetOptions } from '../../core/models';
import { countCodepoints } from '../../shared/utils/text-count';

/** Mirrors apps/channels/providers/reddit.py (post type, link, first comment, requirement checks). */
export const REDDIT_TITLE_MAX = 300;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export type RedditKind = 'self' | 'link' | 'image';

export function redditKind(media: MediaAsset[], opts: TargetOptions, link: string): RedditKind {
  if (media.length) return 'image';
  const k = opts.post_type || (link ? 'link' : 'self');
  return k === 'link' || k === 'self' ? k : 'self';
}

/** Default post type when no option is stored. */
export function redditDefaultKind(link: string): 'self' | 'link' {
  return link ? 'link' : 'self';
}

/** The URL a link post points to: the post link, else the first URL in the text. */
export function redditLink(link: string, text: string): string {
  if (link) return link;
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[.,;:!?)]+$/, '') : '';
}

/** Link posts have no body: the text (minus the URL when it came from the text) moves to the first comment. */
export function redditLinkComment(text: string, link: string, comment: string): { link: string; comment: string } {
  const url = redditLink(link, text);
  const body = (!link && url ? text.split(url).join('') : text).trim();
  return { link: url, comment: [body, comment].filter(Boolean).join('\n\n') };
}

export function subredditLabel(channel: Channel): string {
  const cfg = channel.config ?? {};
  const sr = (cfg['subreddit'] as string) || channel.external_id || '';
  return `r/${sr}`;
}

export function isRedditProfile(channel: Channel): boolean {
  return (channel.external_id ?? '').startsWith('u_');
}

export function redditRequirements(channel: Channel): RedditRequirements {
  return ((channel.config ?? {})['requirements'] as RedditRequirements | undefined) ?? {};
}

export function redditRules(channel: Channel): string[] {
  const r = (channel.config ?? {})['rules'];
  return Array.isArray(r) ? r.map((x) => String(x)) : [];
}

/** Client-side copy of RedditProvider.validate + check_requirements (beyond the generic checks). */
export function redditProblems(
  channel: Channel,
  title: string,
  body: string,
  opts: TargetOptions,
  media: MediaAsset[],
  link: string,
): string[] {
  const problems: string[] = [];
  const cfg = channel.config ?? {};
  const kind = redditKind(media, opts, link);
  if (countCodepoints(title) > REDDIT_TITLE_MAX) problems.push(`Reddit titles are limited to ${REDDIT_TITLE_MAX} characters.`);
  const allowed = (cfg['submission_type'] as string) || 'any';
  const url = redditLink(link, body);
  if (kind === 'link' && !url) problems.push('A link post needs a link.');
  if (kind === 'link' && allowed === 'self') problems.push('This subreddit only accepts text posts.');
  if (kind === 'self' && allowed === 'link') problems.push('This subreddit only accepts link posts.');

  const req = redditRequirements(channel);
  const sr = subredditLabel(channel);
  const text = kind !== 'link' ? body : '';
  const lowTitle = title.toLowerCase();
  const lowBody = text.toLowerCase();
  const tlen = countCodepoints(title);
  const blen = countCodepoints(text);
  if (req.is_flair_required && !(opts.flair_id || cfg['flair_id'])) problems.push(`${sr} requires a post flair.`);
  if (title && tlen < (req.title_text_min_length ?? 0)) problems.push(`${sr} needs titles of at least ${req.title_text_min_length} characters.`);
  if (req.title_text_max_length && tlen > req.title_text_max_length) problems.push(`${sr} limits titles to ${req.title_text_max_length} characters.`);
  const needT = req.title_required_strings ?? [];
  if (needT.length && !needT.some((x) => lowTitle.includes(x.toLowerCase()))) problems.push(`${sr} titles must contain one of: ${needT.join(', ')}.`);
  const badT = (req.title_blacklisted_strings ?? []).filter((x) => lowTitle.includes(x.toLowerCase()));
  if (badT.length) problems.push(`${sr} does not allow these words in titles: ${badT.join(', ')}.`);
  for (const pattern of req.title_regexes ?? []) {
    try {
      if (title && !new RegExp(pattern).test(title)) problems.push(`${sr} titles must match the pattern ${pattern}.`);
    } catch {
      /* Python-only syntax: skip like the backend skips invalid patterns */
    }
  }
  if (kind === 'self') {
    const policy = req.body_restriction_policy;
    if (policy === 'required' && !text.trim()) problems.push(`${sr} requires text in the post body.`);
    if (policy === 'notAllowed' && text.trim()) problems.push(`${sr} does not allow text in the post body.`);
    if (text && blen < (req.body_text_min_length ?? 0)) problems.push(`${sr} needs a body of at least ${req.body_text_min_length} characters.`);
    if (req.body_text_max_length && blen > req.body_text_max_length) problems.push(`${sr} limits the body to ${req.body_text_max_length} characters.`);
    const needB = req.body_required_strings ?? [];
    if (needB.length && !needB.some((x) => lowBody.includes(x.toLowerCase()))) problems.push(`${sr} posts must contain one of: ${needB.join(', ')}.`);
    const badB = (req.body_blacklisted_strings ?? []).filter((x) => lowBody.includes(x.toLowerCase()));
    if (badB.length) problems.push(`${sr} does not allow these words: ${badB.join(', ')}.`);
  }
  if (kind === 'link' && url) {
    let host = '';
    try {
      host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      host = '';
    }
    const listed = (domains: string[]) => domains.some((d) => host === d || host.endsWith('.' + d));
    if (req.link_restriction_policy === 'whitelist' && !listed(req.domain_whitelist ?? []))
      problems.push(`${sr} only accepts links to: ${(req.domain_whitelist ?? []).join(', ')}.`);
    if (req.link_restriction_policy === 'blacklist' && listed(req.domain_blacklist ?? [])) problems.push(`${sr} does not accept links to ${host}.`);
  }
  return problems;
}

/** Human summary of a subreddit's post requirements. */
export function requirementsSummary(req: RedditRequirements): string[] {
  const out: string[] = [];
  if (req.is_flair_required) out.push('A post flair is required.');
  if (req.title_required_strings?.length) out.push(`Titles must contain one of: ${req.title_required_strings.join(', ')}.`);
  if (req.title_blacklisted_strings?.length) out.push(`Words not allowed in titles: ${req.title_blacklisted_strings.join(', ')}.`);
  if (req.title_text_min_length || req.title_text_max_length)
    out.push(`Title length: ${req.title_text_min_length ?? 0}–${req.title_text_max_length ?? REDDIT_TITLE_MAX} characters.`);
  if (req.title_regexes?.length) out.push(`Titles must match: ${req.title_regexes.join(' · ')}.`);
  if (req.body_restriction_policy === 'required') out.push('Text posts need a body.');
  if (req.body_restriction_policy === 'notAllowed') out.push('No text allowed in the post body.');
  if (req.body_text_min_length || req.body_text_max_length)
    out.push(`Body length: ${req.body_text_min_length ?? 0}–${req.body_text_max_length ?? '∞'} characters.`);
  if (req.body_required_strings?.length) out.push(`Posts must contain one of: ${req.body_required_strings.join(', ')}.`);
  if (req.body_blacklisted_strings?.length) out.push(`Words not allowed: ${req.body_blacklisted_strings.join(', ')}.`);
  if (req.link_restriction_policy === 'whitelist' && req.domain_whitelist?.length) out.push(`Links only to: ${req.domain_whitelist.join(', ')}.`);
  if (req.link_restriction_policy === 'blacklist' && req.domain_blacklist?.length) out.push(`No links to: ${req.domain_blacklist.join(', ')}.`);
  return out;
}
