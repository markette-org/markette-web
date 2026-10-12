import { Channel, FollowMode, Id, Provider, TargetOptions, TargetStatus } from '../../core/models';
import { FirstCommentSplit } from '../../shared/utils/first-comment';

export interface ChannelDraft {
  body: string;
  title: string;
  options: TargetOptions;
  /** Wait for another publication and link to it. */
  follow?: FollowDraft | null;
}

/** Exactly one of channel (same post) or target (another post) is set. */
export interface FollowDraft {
  channel: Id | null;
  target: Id | null;
  mode: FollowMode;
  /** minutes */
  delay: number;
}

/** A publication of another post that can be followed. */
export interface FollowCandidate {
  id: Id;
  postId: Id;
  label: string;
  channelName: string;
  provider: string;
  status: TargetStatus;
  title: string;
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
  /** Posts in the thread (1 = not a thread). */
  threadParts: number;
  problems: string[];
  /** existing target on this post, if any */
  targetId: Id | null;
  targetStatus: TargetStatus | null;
  locked: boolean; // published / in flight: cannot be edited
  customized: boolean;
  /** Reddit: effective post type and the URL a link post points to. */
  reddit: { kind: 'self' | 'link' | 'image'; link: string } | null;
  /** Waits for this publication (label for display). */
  follow: { label: string; mode: FollowMode; delay: number } | null;
  /** Providers with a first comment: what goes in the post vs. the comment. */
  firstComment: (FirstCommentSplit & { count: number; max: number | null; channelDefault: boolean; override: boolean | undefined }) | null;
}

export type ScheduleChoice = 'draft' | 'keep' | 'now' | 'exact' | 'queue' | 'best_time' | 'suggest';

export const LOCKED_STATES: TargetStatus[] = ['published', 'publishing', 'queued'];
