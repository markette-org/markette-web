const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat(undefined);

export function fmtNumber(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return opts.compact !== false && Math.abs(value) >= 10_000 ? compact.format(value) : plain.format(value);
}

/** engagement_rate is a ratio (0.034) → "3.4%". */
export function fmtPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const pct = value * 100;
  return `${pct.toFixed(digits)}%`;
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${plain.format(n)} ${n === 1 ? one : many}`;
}

/** Stable pseudo-random pick from a palette for things without a colour. */
export function hashColor(seed: string | number, palette = PALETTE): string {
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export const PALETTE = ['#4f2cf0', '#ff7a59', '#0f9d6b', '#1f6fd9', '#c2398f', '#e3a008', '#0aa2b5', '#7c3aed'];

export function initials(name: string | null | undefined): string {
  const parts = (name || '?').replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
