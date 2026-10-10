import { Channel, Id, Provider, TargetOptions, TargetStatus } from '../../core/models';
import { FirstCommentSplit } from '../../shared/utils/first-comment';

export interface ChannelDraft {
  body: string;
  title: string;
  options: TargetOptions;
}

export interface ChannelState {
  channel: Channel;
  provider: Provider | undefined;
  isBlog: boolean;
  /** Email newsletter provider (Brevo, Listmonk): title = subject. */
  isNewsletter: boolean;
  /** This channel needs a title (blogs, newsletters, YouTube, Discord forum threads). */
  needsTitle: boolean;
  /** Discord: posting as a new forum thread. */
  forumThread: boolean;
  /** Ghost: also emailed to members (effective newsletter set, not a draft). */
  emailed: boolean;
  body: string; // effective
  title: string; // effective
  count: number;
  max: number | null;
  problems: string[];
  /** existing target on this post, if any */
  targetId: Id | null;
  targetStatus: TargetStatus | null;
  locked: boolean; // published / in flight: cannot be edited
  customized: boolean;
  /** Reddit: effective post type and the URL a link post points to. */
  reddit: { kind: 'self' | 'link' | 'image'; link: string } | null;
  /** Providers with a first comment: what goes in the post vs. the comment. */
  firstComment: (FirstCommentSplit & { count: number; max: number | null; channelDefault: boolean; override: boolean | undefined }) | null;
}

export type ScheduleChoice = 'draft' | 'keep' | 'now' | 'exact' | 'queue' | 'best_time' | 'suggest';

export const LOCKED_STATES: TargetStatus[] = ['published', 'publishing', 'queued'];
