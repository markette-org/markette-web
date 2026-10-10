/*
 * Time-zone aware date helpers built on Intl only.
 *
 * Conventions:
 *  - Instants travel as ISO strings / Date objects (UTC under the hood).
 *  - Calendar days in the workspace zone are plain "YYYY-MM-DD" strings (Ymd).
 *  - Weekdays are Monday-first: 0 = Monday … 6 = Sunday (matches the API).
 */

export type Ymd = string;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Monday
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Wall-clock components of an instant in a time zone. */
export function zonedParts(value: Date | string | number, tz: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(toDate(value))) out[p.type] = p.value;
  return {
    year: +out['year'],
    month: +out['month'],
    day: +out['day'],
    hour: +out['hour'] % 24,
    minute: +out['minute'],
    second: +out['second'],
    weekday: WEEKDAYS[out['weekday']] ?? 0,
  };
}

/** Offset of `tz` from UTC at the given instant, in ms (positive east of Greenwich). */
export function tzOffsetMs(value: Date | number, tz: string): number {
  const d = toDate(value);
  const p = zonedParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` reads the given local time.
 * Handles DST: in a gap the time is pushed forward, in an overlap the earlier instant wins.
 */
export function zonedToUtc(year: number, month: number, day: number, hour = 0, minute = 0, tz = 'UTC'): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffsetMs(guess, tz);
  let t = guess - off1;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off1) {
    const t2 = guess - off2;
    // Prefer the candidate that maps back to the requested wall time.
    const p = zonedParts(t2, tz);
    t = p.hour === hour && p.minute === minute ? t2 : Math.max(t, t2);
  }
  return new Date(t);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** "YYYY-MM-DDTHH:mm" (datetime-local value) interpreted in `tz` → Date. */
export function parseLocalInput(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
}

/** Instant → "YYYY-MM-DDTHH:mm" wall time in `tz` (for datetime-local inputs). */
export function toLocalInput(value: Date | string | number, tz: string): string {
  const p = zonedParts(value, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Local datetime-local value → ISO string in UTC, or null. */
export function localInputToIso(value: string, tz: string): string | null {
  const d = parseLocalInput(value, tz);
  return d ? d.toISOString() : null;
}

/* --- Calendar days (Ymd) ------------------------------------------------------ */

export function ymd(year: number, month: number, day: number): Ymd {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseYmd(value: Ymd): { year: number; month: number; day: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** Calendar day of an instant in `tz`. */
export function ymdOf(value: Date | string | number, tz: string): Ymd {
  const p = zonedParts(value, tz);
  return ymd(p.year, p.month, p.day);
}

export function todayYmd(tz: string): Ymd {
  return ymdOf(new Date(), tz);
}

export function addDays(value: Ymd, n: number): Ymd {
  const { year, month, day } = parseYmd(value);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addMonths(value: Ymd, n: number): Ymd {
  const { year, month } = parseYmd(value);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** 0 = Monday. */
export function weekdayOf(value: Ymd): number {
  const { year, month, day } = parseYmd(value);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function startOfWeek(value: Ymd): Ymd {
  return addDays(value, -weekdayOf(value));
}

export function startOfMonth(value: Ymd): Ymd {
  const { year, month } = parseYmd(value);
  return ymd(year, month, 1);
}

export function daysBetween(a: Ymd, b: Ymd): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000,
  );
}

/** Midnight of a calendar day in `tz` as an instant. */
export function startOfDayUtc(value: Ymd, tz: string): Date {
  const { year, month, day } = parseYmd(value);
  return zonedToUtc(year, month, day, 0, 0, tz);
}

/** Instant for a wall-clock time on a calendar day in `tz`. */
export function atTime(value: Ymd, hour: number, minute: number, tz: string): Date {
  const { year, month, day } = parseYmd(value);
  return zonedToUtc(year, month, day, hour, minute, tz);
}

/** Minutes since local midnight of an instant in `tz`. */
export function minutesOfDay(value: Date | string, tz: string): number {
  const p = zonedParts(value, tz);
  return p.hour * 60 + p.minute;
}

/* --- Formatting -------------------------------------------------------------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatInTz(
  value: Date | string | number | null | undefined,
  tz: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  if (value === null || value === undefined || value === '') return '';
  const d = toDate(value);
  if (isNaN(d.getTime())) return '';
  return fmt(tz, opts).format(d);
}

export function formatTime(value: Date | string | null | undefined, tz: string): string {
  return formatInTz(value, tz, { hour: '2-digit', minute: '2-digit' });
}

export function formatDayLabel(value: Ymd, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const { year, month, day } = parseYmd(value);
  return fmt('UTC', opts).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatYmd(value: Ymd | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!value) return '';
  return formatDayLabel(value, opts);
}

export function formatHour(hour: number): string {
  return fmt('UTC', { hour: 'numeric' }).format(new Date(Date.UTC(2024, 0, 1, hour)));
}

/** Monday-first short weekday names in the user's locale. */
export function weekdayNames(style: 'short' | 'long' | 'narrow' = 'short'): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => fmt('UTC', { weekday: style }).format(new Date(Date.UTC(2024, 0, 1 + i, 12))));
}

/** "in 3 h", "2 days ago". */
export function relativeTime(value: Date | string | null | undefined, now = Date.now()): string {
  if (!value) return '';
  const diff = toDate(value).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86_400_000],
    ['month', 30 * 86_400_000],
    ['week', 7 * 86_400_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return diff >= 0 ? 'in a moment' : 'just now';
}

/** Short zone label, e.g. "CEST" or "GMT+2", for display next to times. */
export function tzAbbrev(tz: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

export function allTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.('timeZone') ?? [];
    return list.includes('UTC') ? list : ['UTC', ...list];
  } catch {
    return ['UTC'];
  }
}

/** YYYY-MM-DD for analytics ranges. */
export function isoDate(value: Ymd): string {
  return value;
}
