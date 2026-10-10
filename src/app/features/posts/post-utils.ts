import { Post, Target } from '../../core/models';
import { formatInTz } from '../../shared/utils/dates';

export interface PostTotals {
  engagements: number;
  impressions: number;
  hasMetrics: boolean;
}

/** Sums the latest metrics of every publication of a post. */
export function postTotals(p: Post): PostTotals {
  let engagements = 0;
  let impressions = 0;
  let hasMetrics = false;
  for (const t of p.targets) {
    const m = t.metrics || {};
    if (typeof m.engagements === 'number') {
      engagements += m.engagements;
      hasMetrics = true;
    }
    if (typeof m.impressions === 'number') {
      impressions += m.impressions;
      hasMetrics = true;
    }
  }
  return { engagements, impressions, hasMetrics };
}

export function targetTooltip(t: Target, tz: string): string {
  const name = t.channel_detail?.name ?? 'Channel';
  const lines = [`${name} · ${t.status}`];
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
  if (t.status === 'published' && t.published_at) lines.push(`Published ${formatInTz(t.published_at, tz, opts)}`);
  else if (t.scheduled_at) lines.push(`Scheduled ${formatInTz(t.scheduled_at, tz, opts)}`);
  if (t.last_error) lines.push(`Error: ${t.last_error}`);
  return lines.join('\n');
}

export const TARGET_CHIP: Record<string, string> = {
  draft: '',
  scheduled: 'accent',
  queued: 'info',
  publishing: 'info',
  published: 'success',
  failed: 'danger',
  cancelled: 'outline',
};
