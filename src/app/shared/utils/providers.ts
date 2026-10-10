import { ProviderKind } from '../../core/models';
/** Visual identity for each network (brand-coloured accents, short marks). */
export interface ProviderMeta {
  label: string;
  color: string;
  /** colour that reads on top of `color` */
  ink: string;
  mark: string;
  kind: ProviderKind;
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  x: { label: 'X', color: '#111111', ink: '#ffffff', mark: '𝕏', kind: 'social' },
  bluesky: { label: 'Bluesky', color: '#1185fe', ink: '#ffffff', mark: 'bsky', kind: 'social' },
  mastodon: { label: 'Mastodon', color: '#6364ff', ink: '#ffffff', mark: 'M', kind: 'social' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2', ink: '#ffffff', mark: 'in', kind: 'social' },
  facebook: { label: 'Facebook', color: '#1877f2', ink: '#ffffff', mark: 'f', kind: 'social' },
  instagram: { label: 'Instagram', color: '#e1306c', ink: '#ffffff', mark: 'ig', kind: 'social' },
  telegram: { label: 'Telegram', color: '#26a5e4', ink: '#ffffff', mark: 'tg', kind: 'social' },
  whatsapp: { label: 'WhatsApp', color: '#25D366', ink: '#ffffff', mark: 'wa', kind: 'social' },
  wechat: { label: 'WeChat', color: '#07C160', ink: '#ffffff', mark: '微', kind: 'blog' },
  qq: { label: 'QQ', color: '#12B7F5', ink: '#ffffff', mark: 'QQ', kind: 'social' },
  threads: { label: 'Threads', color: '#000000', ink: '#ffffff', mark: '@', kind: 'social' },
  youtube: { label: 'YouTube', color: '#FF0000', ink: '#ffffff', mark: '▶', kind: 'social' },
  discord: { label: 'Discord', color: '#5865F2', ink: '#ffffff', mark: 'dc', kind: 'social' },
  ghost: { label: 'Ghost', color: '#15171A', ink: '#ffffff', mark: 'gh', kind: 'blog' },
  brevo: { label: 'Brevo', color: '#0B996E', ink: '#ffffff', mark: 'br', kind: 'newsletter' },
  listmonk: { label: 'Listmonk', color: '#0055D4', ink: '#ffffff', mark: 'lm', kind: 'newsletter' },
  webhook: { label: 'Webhook', color: '#6B7280', ink: '#ffffff', mark: '↗', kind: 'social' },
  wordpress: { label: 'WordPress', color: '#21759b', ink: '#ffffff', mark: 'W', kind: 'blog' },
  drupal: { label: 'Drupal', color: '#0678be', ink: '#ffffff', mark: 'D', kind: 'blog' },
  medium: { label: 'Medium', color: '#000000', ink: '#ffffff', mark: 'M', kind: 'blog' },
  hugo: { label: 'Hugo', color: '#ff4088', ink: '#ffffff', mark: 'H', kind: 'blog' },
};

export function providerMeta(key: string | null | undefined): ProviderMeta {
  return (
    PROVIDER_META[key ?? ''] ?? {
      label: key ? key[0].toUpperCase() + key.slice(1) : 'Channel',
      color: '#7a7695',
      ink: '#ffffff',
      mark: (key ?? '?')[0]?.toUpperCase() ?? '?',
      kind: 'social',
    }
  );
}

/** Channel colour if set, else the network colour. */
export function channelColor(ch: { color?: string | null; provider: string } | null | undefined): string {
  if (!ch) return '#7a7695';
  return ch.color || providerMeta(ch.provider).color;
}

/** Same order as the backend registry (GET /api/providers/). */
export const PROVIDER_ORDER = [
  'x',
  'bluesky',
  'threads',
  'mastodon',
  'linkedin',
  'facebook',
  'instagram',
  'youtube',
  'telegram',
  'whatsapp',
  'wechat',
  'qq',
  'discord',
  'wordpress',
  'drupal',
  'medium',
  'ghost',
  'hugo',
  'brevo',
  'listmonk',
  'webhook',
];
