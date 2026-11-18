// Business dates come from the database as 'YYYY-MM-DD' strings in the gym's
// timezone. Format them without converting through Date to avoid UTC shifts.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const SALON_TZ = 'Asia/Kolkata';

/** '2027-02-14' → '14 Feb 2027' */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** ISO timestamp → '5 Nov 2026, 7:42 pm' in the salon's timezone. */
export function formatDateTime(iso: string | null | undefined, timeZone = SALON_TZ): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone = SALON_TZ): string {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** Today's date in the salon's timezone as 'YYYY-MM-DD' (display/defaults only; the server decides). */
export function todayInSalon(timeZone = SALON_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...(from.split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(to.split('-').map(Number) as [number, number, number]));
  return Math.round((b - a) / 86_400_000) + 0;
}

/** Minutes since midnight of an instant, in the salon's timezone. */
export function minutesOfDay(iso: string | Date, timeZone = SALON_TZ): number {
  const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0), m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** Calendar date ('YYYY-MM-DD') of an instant in the salon's timezone. */
export function dateOf(iso: string | Date, timeZone = SALON_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

/** Local date + 'HH:MM' in the salon's timezone → Date (UTC instant). */
export function zoned(date: string, time: string, timeZone = SALON_TZ): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(guess).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

/** '14:30' → '2:30 pm' */
export function time12(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

/** '2026-11-18' → 'Wed, 18 Nov' (or with custom options) */
export function formatDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
