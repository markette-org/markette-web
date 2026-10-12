/* Types mirroring the Markette REST API (backend apps, serializers.py). */

export type Id = number;
export type Role = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface User {
  id: Id;
  email: string;
  name: string;
  timezone: string;
  is_superadmin?: boolean;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
  organization_name?: string;
  workspace_name?: string;
  timezone?: string;
  invitation?: string;
}

export interface RegisterResponse extends AuthTokens {
  user: User;
}

export interface Workspace {
  id: Id;
  name: string;
  slug: string;
  timezone: string;
  min_gap_minutes: number;
  ai_enabled: boolean;
  /** Server-wide AI switch (settings.AI_ENABLED). */
  ai_available?: boolean;
  /** UTM tags and short links on social posts. */
  link_tracking?: LinkTracking;
  role: Role | null;
  organization?: Id;
  organization_name?: string;
  organization_slug?: string;
  organization_role?: OrgRole | null;
  is_archived?: boolean;
  archived_at?: string | null;
  created_at: string;
}

export interface LinkTracking {
  utm?: boolean;
  utm_medium?: string;
  short_links?: boolean;
  /** The workspace's own sites; empty = only the post's link. */
  domains?: string[];
}

/* --- Organizations ---------------------------------------------------------- */

export type OrgRole = 'owner' | 'admin' | 'member';

export interface OrgUsage {
  workspaces: number;
  channels: number;
  members: number;
  ai_tokens_this_month: number;
}

export interface Organization {
  id: Id;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | string;
  role: OrgRole | null;
  max_workspaces: number | null;
  max_channels: number | null;
  max_members: number | null;
  ai_monthly_tokens: number | null;
  workspace_count: number;
  usage: OrgUsage | null;
  created_at?: string;
}

export interface OrgMember {
  id: Id;
  user: User;
  role: OrgRole;
  workspaces: { id: Id; name: string; slug: string; role: Role }[];
  created_at?: string;
}

export interface Membership {
  id: Id;
  user: User;
  role: Role;
  created_at: string;
}

export interface Invitation {
  id: Id;
  email: string;
  role: Role;
  org_role?: OrgRole | null;
  workspace?: Id | null;
  workspace_name?: string | null;
  token: string;
  accepted_at: string | null;
  created_at: string;
}

/* --- Teams ------------------------------------------------------------------ */

export type TeamRole = 'member' | 'reviewer';

export interface TeamMember {
  id: Id;
  user_id: Id;
  email: string;
  name: string;
  role: TeamRole;
}

export interface Team {
  id: Id;
  name: string;
  description: string;
  color: string;
  requires_approval: boolean;
  channels: Id[];
  members: TeamMember[];
  my_role: TeamRole | null;
  created_at?: string;
}

export interface TeamRef {
  id: Id;
  name: string;
  color: string;
}

/* --- Providers & channels --------------------------------------------------- */

export type ProviderKey =
  | 'x'
  | 'bluesky'
  | 'mastodon'
  | 'linkedin'
  | 'facebook'
  | 'instagram'
  | 'telegram'
  | 'whatsapp'
  | 'wechat'
  | 'qq'
  | 'threads'
  | 'reddit'
  | 'youtube'
  | 'discord'
  | 'slack'
  | 'ghost'
  | 'brevo'
  | 'listmonk'
  | 'webhook'
  | 'wordpress'
  | 'drupal'
  | 'medium'
  | 'devto'
  | 'hugo';

/** 'newsletter' = email lists (Brevo, Listmonk); the webhook integration reports 'social'. */
export type ProviderKind = 'social' | 'blog' | 'newsletter';

export type CountMode = 'chars' | 'graphemes' | 'x' | 'mastodon';

export interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'textarea' | 'select' | 'checkbox';
  required: boolean;
  help: string;
  default: unknown;
  choices: string[] | null;
}

export interface Provider {
  key: ProviderKey | string;
  label: string;
  configured: boolean;
  kind: ProviderKind;
  auth: 'oauth2' | 'credentials';
  instance_url: boolean;
  max_chars: number | null;
  count_mode: CountMode;
  max_media: number;
  requires_media: boolean;
  supports_video: boolean;
  supports_title: boolean;
  supports_alt_text: boolean;
  has_metrics: boolean;
  metric_names: string[];
  /** LinkedIn, Facebook, Instagram: a first comment can be posted under the publication. */
  supports_first_comment?: boolean;
  first_comment_max?: number | null;
  /** X, Bluesky, Mastodon, Threads: long text can go out as a thread. */
  supports_threads?: boolean;
  credential_fields: CredentialField[];
}

export type ChannelStatus = 'active' | 'needs_reauth' | 'disabled';

export interface Channel {
  id: Id;
  provider: ProviderKey | string;
  provider_label: string;
  external_id?: string;
  name: string;
  handle: string;
  avatar_url: string;
  profile_url: string;
  base_url: string;
  config: Record<string, unknown>;
  status: ChannelStatus;
  last_error: string;
  followers_count: number | null;
  color: string;
  token_expires_at: string | null;
  created_at?: string;
  teams?: TeamRef[];
  /** True when the current user's posts to this channel need a reviewer's approval. */
  approval_required?: boolean;
  /** Workspaces this channel is marked relevant for (only those the user can open are named). */
  workspaces?: WorkspaceRef[];
  /** Number of workspaces the channel is relevant for (including ones not listed). */
  shared_count?: number;
  /** Relevant for the current workspace: listed first and highlighted. Every org channel is usable. */
  relevant?: boolean;
  /** Platform-side setup details: WhatsApp {webhook_url, verify_token, subscribers}; QQ {webhook_url}; else null. */
  setup?: ChannelSetup | null;
}

export interface ChannelSetup {
  /** WhatsApp / QQ: callback to configure on the platform. */
  webhook_url?: string;
  /** Webhook integration: destination URL, signing secret (null for non-admins) and header names. */
  url?: string;
  signing_secret?: string | null;
  signature_header?: string;
  timestamp_header?: string;
  verify_token?: string;
  /** Opted-in WhatsApp subscribers. */
  subscribers?: number;
}

export interface Subscriber {
  id: Id;
  /** Phone number in international format. */
  address: string;
  name: string;
  source: 'keyword' | 'import' | 'manual';
  opted_in_at: string | null;
  opted_out_at: string | null;
}

export interface SubscriberImportResult {
  added: number;
  invalid: string[];
}

export interface WorkspaceRef {
  id: Id;
  name: string;
  slug: string;
}

export interface ConnectStartResponse {
  request_id: string;
  authorize_url?: string;
  channels?: Channel[];
  candidates?: Candidate[];
}

export interface Candidate {
  external_id: string;
  name: string;
  handle: string;
  avatar_url: string;
  profile_url: string;
  provider: string;
  followers_count: number | null;
}

export interface ConnectionRequest {
  request_id: string;
  provider: string;
  error: string;
  completed: boolean;
  expired: boolean;
  candidates: Candidate[];
}

/* --- Media, campaigns, slots ------------------------------------------------ */

export interface MediaAsset {
  id: Id;
  url: string;
  original_name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  created_at?: string;
}

export interface Campaign {
  id: Id;
  name: string;
  brief: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string;
  color: string;
  post_count?: number;
  created_at?: string;
}

export interface Slot {
  id: Id;
  channel: Id | null;
  team?: Id | null;
  weekday: number; // 0 = Monday
  time: string; // HH:MM:SS
  active: boolean;
}

/* --- Posts ------------------------------------------------------------------ */

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'unconfirmed' | 'failed';
export type TargetStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'publishing'
  | 'published'
  // The network may have published it but its answer was lost: a person checks.
  | 'unconfirmed'
  | 'failed'
  | 'cancelled';
export type ScheduleMode = 'now' | 'exact' | 'queue' | 'best_time';

export interface Metrics {
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  clicks?: number | null;
  engagements?: number | null;
  engagement_rate?: number | null;
  [key: string]: number | null | undefined;
}

export interface TargetOptions {
  // blogs
  status?: 'publish' | 'draft';
  excerpt?: string;
  slug?: string;
  categories?: string[];
  tags?: string[];
  canonical_url?: string;
  /** dev.to */
  series?: string;
  // mastodon
  visibility?: 'public' | 'unlisted' | 'private' | 'direct';
  spoiler_text?: string;
  language?: string;
  // bluesky
  langs?: string[];
  // threads (X, Bluesky, Mastodon, Threads): split long text into replies
  thread?: boolean;
  /** default true: "i/n" at the end of each post */
  thread_numbering?: boolean;
  // first comment (LinkedIn, Facebook, Instagram)
  first_comment?: string;
  /** undefined = channel default (config.links_in_first_comment) */
  links_in_first_comment?: boolean;
  // youtube
  privacy?: 'public' | 'unlisted' | 'private';
  made_for_kids?: boolean;
  category_id?: string;
  // discord
  forum_thread?: boolean;
  // reddit (image posts are automatic when media is attached)
  post_type?: 'self' | 'link';
  flair_id?: string;
  flair_text?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  send_replies?: boolean;
  // ghost ('' = web only; absent = channel default)
  newsletter?: string;
  email_segment?: 'all' | 'status:free' | 'status:-free';
  // newsletters (brevo, listmonk)
  preheader?: string;
  // wechat: per-post override of channel.config.mode
  wechat_mode?: 'push' | 'publish';
  // telegram
  silent?: boolean;
  pin?: boolean;
  disable_link_preview?: boolean;
  protect_content?: boolean;
  [key: string]: unknown;
}

export interface Target {
  id: Id;
  channel: Id;
  channel_detail: Channel;
  body: string;
  title: string;
  media_ids: Id[] | null;
  options: TargetOptions;
  status: TargetStatus;
  scheduled_at: string | null;
  schedule_reason: string;
  attempts: number;
  next_attempt_at: string | null;
  published_at: string | null;
  external_id?: string;
  external_url: string;
  last_error: string;
  metrics: Metrics;
  /** Clicks on its short links. */
  link_clicks?: number;
  metrics_updated_at: string | null;
  /** Provider extras, e.g. first_comment_id once the first comment is posted. */
  extra?: { first_comment_id?: string; [key: string]: unknown };
  /** The publication this one waits for and links to ({url} in the text). */
  follows: Id | null;
  follows_detail: FollowedTarget | null;
  follow_mode: FollowMode;
  /** minutes after the followed publication (delay mode; also the earliest time for the others) */
  follow_delay: number;
  /** scheduled, waiting for the followed publication */
  waiting: boolean;
}

export type FollowMode = 'delay' | 'queue' | 'best_time';

export interface FollowedTarget {
  id: Id;
  post_id: Id;
  post_title: string;
  channel: Id;
  channel_name: string;
  provider: string;
  status: TargetStatus;
  external_url: string;
}

export interface Post {
  id: Id;
  title: string;
  body: string;
  link: string;
  tags: string[];
  campaign: Id | null;
  notes: string;
  status: PostStatus;
  schedule_mode: ScheduleMode;
  window_start: string | null;
  window_end: string | null;
  media: MediaAsset[];
  targets: Target[];
  author_name: string;
  approval_status?: ApprovalStatus;
  submitted_by_name?: string | null;
  submitted_at?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  needs_approval?: boolean;
  can_review?: boolean;
  /** Publications on channels this user cannot see (kept untouched on save). */
  hidden_targets?: number;
  created_at: string;
  updated_at: string;
}

export type ApprovalStatus = '' | 'pending' | 'approved' | 'changes_requested';

export interface PostReview {
  id: Id;
  action: 'submitted' | 'approved' | 'changes_requested' | 'reset';
  comment: string;
  /** display name or email */
  user: string | null;
  created_at: string;
}

export interface ApprovalOutcome {
  scheduled: boolean;
  detail?: unknown;
}

export interface ApprovedPost extends Post {
  approval_outcome: ApprovalOutcome;
}

export interface TargetWrite {
  channel: Id;
  body?: string;
  title?: string;
  media_ids?: Id[] | null;
  options?: TargetOptions;
  /** a publication of another post (target id) */
  follows?: Id | null;
  /** another channel of this same post */
  follows_channel?: Id | null;
  follow_mode?: FollowMode;
  follow_delay?: number;
}

export interface PostWrite {
  title?: string;
  body?: string;
  link?: string;
  tags?: string[];
  campaign?: Id | null;
  notes?: string;
  media_ids?: Id[];
  targets?: TargetWrite[];
}

export interface SchedulePayload {
  mode: ScheduleMode;
  at?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  /** keys: "<target id>" or "channel:<channel id>" → ISO datetime */
  per_target?: Record<string, string>;
  /** Note for reviewers when the post needs approval. */
  comment?: string;
}

/** {<target id>: [problems]} */
export type ValidationProblems = Record<string, string[]>;

export interface CalendarItem {
  id: Id; // target id
  post_id: Id;
  post_title: string;
  excerpt: string;
  channel: Id;
  channel_name: string;
  provider: string;
  avatar_url: string;
  status: TargetStatus;
  scheduled_at: string | null;
  published_at: string | null;
  external_url: string;
  schedule_reason: string;
  campaign: Id | null;
  thumbnail: string | null;
  metrics: Metrics;
}

/* --- Analytics -------------------------------------------------------------- */

export interface MetricTotals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  /** Clicks on Markette short links (people only, link previews excluded). */
  link_clicks: number;
  posts: number;
  engagements: number;
}

export interface ChannelAnalytics {
  channel: Id;
  name: string;
  provider: string;
  posts: number;
  engagements: number;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  link_clicks: number;
  avg_engagement_rate: number | null;
}

export interface DailyPoint {
  date: string;
  posts: number;
  engagements: number;
  impressions: number;
}

export interface TopPost {
  target: Id;
  post: Id;
  title: string;
  channel: string;
  provider: string;
  url: string;
  published_at: string;
  metrics: Metrics;
  link_clicks: number;
}

export interface AnalyticsOverview {
  from: string;
  to: string;
  totals: MetricTotals;
  scheduled: number;
  failed_last_7d: number;
  channels: ChannelAnalytics[];
  daily: DailyPoint[];
  top_posts: TopPost[];
}

export interface MetricPoint {
  captured_at: string;
  age_hours: number;
  impressions?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  clicks?: number | null;
  engagements?: number | null;
  engagement_rate?: number | null;
}

export interface TargetAnalytics {
  target: Id;
  channel: string;
  metrics: Metrics;
  series: MetricPoint[];
}

export interface AudienceSeries {
  channel: Id;
  name: string;
  points: { date: string; followers: number }[];
}

/* --- Insights --------------------------------------------------------------- */

export interface TopSlot {
  weekday: number;
  hour: number;
  score: number;
}

export interface ChannelBestTimes {
  channel: Id;
  name: string;
  provider: string;
  scores: number[][]; // 7 x 24, Monday first, workspace-local hours
  counts: number[][];
  sample_size: number;
  computed_at: string | null;
  top: TopSlot[];
  source: 'prior' | 'blended' | 'data';
}

export interface BestTimesResponse {
  timezone: string;
  ai_enabled: boolean;
  channels: ChannelBestTimes[];
}

export interface Suggestion {
  channel: Id;
  scheduled_at: string;
  rationale: string;
  source: 'ai' | 'engine';
}

export interface SuggestResponse {
  summary: string;
  suggestions: Suggestion[];
}

export interface SuggestPayload {
  channels: Id[];
  post?: Id;
  body?: string;
  title?: string;
  window_start?: string | null;
  window_end?: string | null;
  campaign?: Id | null;
  use_ai?: boolean;
}

export interface PlanPublication {
  channel: Id;
  scheduled_at: string;
  body: string;
  title: string;
}

export interface PlanPost {
  angle: string;
  publications: PlanPublication[];
}

export interface PlanResponse {
  strategy: string;
  posts: PlanPost[];
}

export interface PlanPayload {
  channels: Id[];
  brief: string;
  start: string;
  end: string;
  posts_per_week: number;
  language?: string;
  campaign?: Id | null;
}

export interface AdaptVariant {
  channel: Id;
  body: string;
  title: string;
  notes: string;
  length: number;
  over_limit: boolean;
}

export interface AdaptResponse {
  variants: AdaptVariant[];
}

/* --- Platform (superadmin) ---------------------------------------------------- */

export interface PlatformOverview {
  organizations: { total: number; suspended: number; new_7d: number };
  workspaces: number;
  users: { total: number; active_7d: number; new_7d: number };
  channels: { total: number; needs_reauth: number; by_provider: Record<string, number> };
  publishing: {
    published_24h: number;
    published_7d: number;
    failed_24h: number;
    scheduled: number;
    daily: { date: string; published: number }[];
  };
  ai_this_month: { requests: number; input_tokens: number; output_tokens: number; cost_usd: number };
}

export interface PlatformHealth {
  status: 'ok' | 'degraded' | 'paused';
  publishing_paused?: boolean;
  overdue_targets: number;
  oldest_overdue_seconds: number;
  stuck_in_flight: number;
  last_published_at: string | null;
  reauth_by_provider: Record<string, number>;
  failures_by_provider: Record<string, number>;
  recent_failures: {
    target: Id;
    organization: string;
    workspace: string;
    channel: string;
    provider: string;
    error: string;
    attempts: number;
    at: string;
  }[];
}

export interface PlatformAiUsage {
  month: string;
  pricing: { input_per_mtok: number; output_per_mtok: number; model: string };
  organizations: {
    organization: Id;
    name: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    quota: number | null;
    cost_usd: number;
  }[];
  by_kind: { kind: string; requests: number; cost_usd: number; input_tokens?: number; output_tokens?: number }[];
}

export interface PlatformOrganization {
  id: Id;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | string;
  max_workspaces: number | null;
  max_channels: number | null;
  max_members: number | null;
  ai_monthly_tokens: number | null;
  notes: string;
  usage: OrgUsage;
  owners: string[];
  owner_email?: string;
  created_at: string;
}

export interface PlatformOrganizationDetail extends PlatformOrganization {
  workspaces: {
    id: Id;
    name: string;
    slug: string;
    timezone: string;
    archived_at: string | null;
    channels: number;
    members: number;
    created_at: string;
  }[];
  members: { id: Id; user_id: Id; email: string; name: string; role: OrgRole; is_active: boolean }[];
  invitations: { id: Id; email: string; org_role: OrgRole | null; role: Role; token: string; created_at: string }[];
}

export interface PlatformUser {
  id: Id;
  email: string;
  name: string;
  is_active: boolean;
  is_superadmin: boolean;
  date_joined: string;
  last_login: string | null;
  organizations: {
    id: Id;
    name: string;
    role: OrgRole | null;
    workspaces: { id: Id; name: string; role: Role }[];
  }[];
}

/* --- Platform settings ---------------------------------------------------------- */

export type AnnouncementLevel = 'info' | 'warning' | 'critical';

/** GET /api/platform/public/ (no auth). */
export interface PublicInfo {
  instance_name: string;
  support_email: string;
  announcement: string;
  announcement_level: AnnouncementLevel;
  signups_open: boolean;
  org_creation_open?: boolean;
  signup_domains: string[];
}

export type OverrideValue = string | number | boolean | null;

export interface OverrideInfo {
  value: OverrideValue;
  effective: OverrideValue;
  source: 'database' | 'environment';
}

export interface SecretInfo {
  set: boolean;
  source: 'database' | 'environment' | null;
}

export interface PlatformSettings {
  /** OAuth redirect URIs exactly as the backend sends them (built from PUBLIC_API_URL). */
  callback_urls?: Record<string, string>;
  ai_efforts?: string[];
  instance_name: string;
  support_email: string;
  announcement: string;
  announcement_level: AnnouncementLevel;
  signups_open: boolean;
  org_creation_open: boolean;
  signup_domains: string;
  publishing_paused: boolean;
  default_max_workspaces: number | null;
  default_max_channels: number | null;
  default_max_members: number | null;
  default_ai_monthly_tokens: number | null;
  overrides: Record<string, OverrideInfo>;
  secrets: Record<string, SecretInfo>;
  updated_at: string | null;
  updated_by: string | null;
  ai_providers?: string[];
  ai_output_modes?: string[];
  /** Endpoint to register in Stripe → Developers → Webhooks. */
  stripe_webhook_url?: string;
}

export type PlatformSettingsPatch = Partial<
  Omit<PlatformSettings, 'overrides' | 'secrets' | 'updated_at' | 'updated_by' | 'ai_providers' | 'ai_efforts' | 'ai_output_modes' | 'callback_urls' | 'stripe_webhook_url'>
> & {
  overrides?: Record<string, OverrideValue | ''>;
  secrets?: Record<string, string | null>;
};

export interface TestAiResult {
  ok: boolean;
  detail: string;
  model?: string;
  /** Up to 50 model ids the provider offers, when the configured one is not available. */
  models?: string[];
}

export interface OrgCreateResponse {
  organization: Organization;
  workspace: Workspace;
}

/* --- Billing -------------------------------------------------------------------- */

export interface Plan {
  id: Id;
  name: string;
  slug: string;
  description: string;
  price_label: string;
  max_workspaces: number | null;
  max_channels: number | null;
  max_members: number | null;
  /** null = unlimited AI tokens */
  ai_monthly_tokens: number | null;
  purchasable: boolean;
}

export interface PlansResponse {
  billing_enabled: boolean;
  plans: Plan[];
}

export type SubscriptionStatus = '' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused' | string;

export interface OrgBilling {
  billing_enabled: boolean;
  plan: Plan | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_billing_account: boolean;
  limits: { max_workspaces: number | null; max_channels: number | null; max_members: number | null; ai_monthly_tokens: number | null };
  usage: OrgUsage;
}

/** Superadmin view of a plan (GET/POST/PATCH /api/platform/plans/). */
export interface PlatformPlan {
  id: Id;
  name: string;
  slug: string;
  description: string;
  price_label: string;
  stripe_price_id: string;
  max_workspaces: number | null;
  max_channels: number | null;
  max_members: number | null;
  ai_monthly_tokens: number | null;
  is_public: boolean;
  active: boolean;
  sort: number;
  created_at?: string;
}

/* --- Personal API tokens ------------------------------------------------------------ */

export interface ApiToken {
  id: Id;
  name: string;
  /** Last characters of the token, for recognition. */
  hint: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface ApiTokenCreated extends ApiToken {
  /** Full mkt_… value — returned only once. */
  token: string;
}

/* --- SSO ----------------------------------------------------------------------- */

export interface SsoDomain {
  id: Id;
  domain: string;
  verified: boolean;
  verified_at: string | null;
  txt_name: string;
  txt_value: string;
}

export interface SsoConfig {
  configured: boolean;
  enabled: boolean;
  redirect_uri: string;
  login_url: string;
  issuer: string;
  client_id: string;
  client_secret_set: boolean;
  scopes: string;
  auto_provision: boolean;
  default_org_role: 'member' | 'admin';
  default_workspace: Id | null;
  default_workspace_role: Role;
  enforce: boolean;
  domains: SsoDomain[];
}

export type SsoConfigWrite = Partial<Omit<SsoConfig, 'configured' | 'redirect_uri' | 'login_url' | 'client_secret_set' | 'domains'>> & {
  /** '' clears the stored secret; absent keeps it */
  client_secret?: string;
};

export interface SsoDiscovery {
  sso: boolean;
  organization?: string;
  enforced?: boolean;
  start_url?: string;
}

export interface SsoExchange extends AuthTokens {
  user: User;
  next: string;
}

/* --- Reddit ------------------------------------------------------------------------ */

export interface RedditFlair {
  id: string;
  text: string;
  /** The poster may edit the flair text. */
  editable: boolean;
}

/** Subset of Reddit's post_requirements stored in channel.config.requirements. */
export interface RedditRequirements {
  is_flair_required?: boolean;
  title_required_strings?: string[];
  title_blacklisted_strings?: string[];
  title_text_min_length?: number | null;
  title_text_max_length?: number | null;
  title_regexes?: string[];
  body_restriction_policy?: 'required' | 'notAllowed' | 'none' | string;
  body_text_min_length?: number | null;
  body_text_max_length?: number | null;
  body_required_strings?: string[];
  body_blacklisted_strings?: string[];
  link_restriction_policy?: 'whitelist' | 'blacklist' | 'none' | string;
  domain_whitelist?: string[];
  domain_blacklist?: string[];
  guidelines_text?: string;
  [key: string]: unknown;
}

/* --- notifications ------------------------------------------------------------- */

export type NotificationKind = 'email' | 'telegram' | 'webhook';

export interface NotificationDestination {
  id: Id;
  kind: NotificationKind;
  name: string;
  events: string[];
  enabled: boolean;
  /** email: { to: string[] }; telegram: { chat_id, chat_title }; webhook: { url } */
  config: { to?: string[]; chat_id?: string | number; chat_title?: string; url?: string };
  has_bot_token: boolean;
  last_sent_at: string | null;
  last_error: string;
  failures: number;
  created_at: string;
  /** Only in the response that creates a webhook. */
  signing_secret?: string;
}

export interface NotificationCatalog {
  events: { value: string; label: string }[];
  default_events: string[];
  kinds: { value: NotificationKind; label: string }[];
  email_configured: boolean;
}

export interface NotificationDelivery {
  uid: string;
  event: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  response_status: number | null;
  error: string;
  created_at: string;
  sent_at: string | null;
  next_attempt_at: string | null;
}

export interface TelegramChats {
  bot: string;
  chats: { id: number; title: string; type: string }[];
}
