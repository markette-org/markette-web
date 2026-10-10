import { Campaign } from '../../core/models';
import { Ymd } from '../../shared/utils/dates';

export type CampaignPhase = 'upcoming' | 'running' | 'ended';

export function campaignPhase(c: Campaign, today: Ymd): CampaignPhase {
  if (today < c.starts_on) return 'upcoming';
  if (today > c.ends_on) return 'ended';
  return 'running';
}

export const PHASE_CHIP: Record<CampaignPhase, { cls: string; label: string }> = {
  upcoming: { cls: 'info', label: 'Upcoming' },
  running: { cls: 'success', label: 'Running' },
  ended: { cls: 'outline', label: 'Ended' },
};
