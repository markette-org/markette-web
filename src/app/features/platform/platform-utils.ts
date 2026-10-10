/** Number input → limit: blank = null (unlimited). */
export function parseLimit(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Math.floor(Number(s));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function limitToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** 3725 → "1 h 2 min". */
export function humanizeSeconds(total: number | null | undefined): string {
  const s = Math.max(0, Math.round(total ?? 0));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function fmtUsd(v: number | null | undefined): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: v && v < 1 ? 4 : 2 }).format(v ?? 0);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const LIMIT_FIELDS = [
  { key: 'max_workspaces', label: 'Workspaces' },
  { key: 'max_channels', label: 'Channels' },
  { key: 'max_members', label: 'Members' },
  { key: 'ai_monthly_tokens', label: 'AI tokens / month' },
] as const;

export type LimitKey = (typeof LIMIT_FIELDS)[number]['key'];
