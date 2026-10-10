import { HttpErrorResponse } from '@angular/common/http';

const FIELD_LABELS: Record<string, string> = {
  non_field_errors: '',
  detail: '',
  __all__: '',
};

function humanize(key: string): string {
  if (key in FIELD_LABELS) return FIELD_LABELS[key];
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function flatten(value: unknown, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [prefix ? `${prefix}: ${value}` : value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((v) => flatten(v, prefix));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
      const label = humanize(k);
      const next = prefix && label ? `${prefix} › ${label}` : prefix || label;
      return flatten(v, next);
    });
  }
  return [];
}

/** Turns any DRF-style error ({field:[msg]}, {detail}, [msg], text) into a readable message. */
export function formatError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    if (err.status === 403) {
      const kind = forbiddenKind(err);
      if (kind === 'archived') return 'This workspace is archived, so it is read-only. Restore it in Organization settings to make changes.';
      if (kind === 'suspended') return 'This organization is suspended. Contact support to reactivate it.';
    }
    const body = err.error;
    if (typeof body === 'string') {
      // HTML error pages from proxies or Django debug pages are not useful to users.
      if (body.trim().startsWith('<')) return `${err.status} ${err.statusText || 'Server error'}`;
      return body || fallback;
    }
    const lines = flatten(body);
    if (lines.length) return lines.join('\n');
    if (err.status >= 500) return 'The server had a problem handling this request.';
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  const lines = flatten(err);
  return lines.length ? lines.join('\n') : fallback;
}

/** Field errors as {field: "msg"} for inline display, plus a general message. */
export function fieldErrors(err: unknown): { fields: Record<string, string>; general: string } {
  const fields: Record<string, string> = {};
  let general = '';
  if (err instanceof HttpErrorResponse && err.error && typeof err.error === 'object' && !Array.isArray(err.error)) {
    for (const [k, v] of Object.entries(err.error as Record<string, unknown>)) {
      const msg = flatten(v).join(' ');
      if (k === 'detail' || k === 'non_field_errors') general = general ? `${general}\n${msg}` : msg;
      else fields[k] = msg;
    }
    return { fields, general };
  }
  return { fields, general: formatError(err) };
}

/** Classifies tenant-level 403 responses so pages can show a friendly state instead of a toast. */
export function forbiddenKind(err: unknown): 'suspended' | 'archived' | 'role' | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 403) return null;
  const detail = err.error && typeof err.error === 'object' ? String((err.error as { detail?: unknown }).detail ?? '') : '';
  if (/suspended/i.test(detail)) return 'suspended';
  if (/archived/i.test(detail)) return 'archived';
  return 'role';
}
