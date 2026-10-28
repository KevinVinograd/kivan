import { format } from 'date-fns'

/**
 * Serialize a `Date` to the `yyyy-MM-dd` string the API and the UI both speak — reading the
 * LOCAL calendar, which is the only calendar the user has.
 *
 * The thing this exists to prevent is `date.toISOString().slice(0, 10)`, which is the obvious
 * way to write it and is wrong everywhere west of Greenwich. `toISOString()` converts to UTC
 * first, so in UTC-3 the local instant "30 June, 23:59" serializes as **2026-07-01** — the first
 * of the NEXT month. Every consumer downstream then reasons about a day that never happened.
 *
 * It is a nasty bug to catch because it is invisible where CI runs: a UTC machine gets the right
 * answer from the wrong code, forever. Any test that pins this behaviour has to pin the timezone
 * too (`TZ=America/Argentina/Buenos_Aires`), or it cannot fail.
 *
 * Use this for a calendar DATE (a due date, a month end, an export stamp). A UTC timestamp is a
 * different thing and `toISOString()` is right for it — that is why the guard bans the `.slice`
 * that turns a timestamp into a date, not `toISOString()` itself.
 */
export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** Today's calendar date, in the user's timezone. */
export function todayIso(): string {
  return toIsoDate(new Date())
}

/**
 * Read the calendar DAY out of a value the API serialized from a `DateTime` column that
 * means a day, not an instant — `Receivable.collectedAt`, `Payment.paymentDate`. Their DTOs
 * stringify with `toISOString()` while the `@db.Date` columns (`dueDate`, `expectedDate`,
 * `period`) arrive as `yyyy-MM-dd` already.
 *
 * One column, two kinds of value, and they must be read differently:
 *
 *  - **A day the operator picked.** The dialog sends `'2026-08-18'`, zod coerces it, and it
 *    lands as exactly `2026-08-18T00:00:00.000Z`. The day is the UTC one; converting to local
 *    would walk it back to the 17th in UTC-3.
 *  - **A moment the server stamped**, when a caller omitted the date (`collectedAt: Date = new
 *    Date()` in `billing.repo.ts`, same in `payments.repo.ts`) — true of every row written
 *    before those callers started sending one. A collection registered at 22:00 local is
 *    `2026-08-19T01:00:00.000Z`, and the day the operator lived is the LOCAL one, the 18th.
 *
 * Exact UTC midnight is what separates them, so that is the test. Reading everything as UTC
 * (a bare `.slice(0, 10)`) reports tomorrow for anything registered after 21:00 in UTC-3;
 * reading everything as local walks every picked date back a day. Both are wrong half the time.
 *
 * A date-only string passes through untouched.
 */
export function apiDateToCalendarDay(iso: string): string {
  if (!iso.includes('T')) return iso.slice(0, 10)
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return iso.slice(0, 10)
  // A picked date: midnight UTC carries no time information to localize. Read the UTC day
  // off the INSTANT rather than slicing the string — an offset form such as
  // '2026-08-17T21:00:00.000-03:00' is also exactly UTC midnight, and its leading date is
  // the 17th while the day this branch means is the 18th.
  if (instant.getTime() % 86_400_000 === 0) return instant.toISOString().slice(0, 10)
  return toIsoDate(instant)
}

/** True when a value is a calendar day ('yyyy-MM-dd') rather than a recorded instant.
 *  Derived from the value itself: after `apiDateToCalendarDay` a day is exactly that shape,
 *  so nothing downstream has to be told which it is holding. Carrying the answer as a flag
 *  instead means every producer has to remember to set it, and the ones that forget take the
 *  wrong render path with no type error. */
export function isCalendarDay(iso: string): boolean {
  return !iso.includes('T')
}

/**
 * True when a calendar date is later than today. Settlement dialogs reject one: a cobro or a
 * pago records money that HAS moved, so a date in the future is always a mistyped year, and
 * it propagates — into the cuenta corriente, the projection week, and any figure that reads
 * "settled by" a date. Shared so the fields that capture a settlement cannot drift into
 * different rules.
 */
export function isFutureIso(iso: string): boolean {
  // Compared as a calendar DAY. A raw string compare reports any full-ISO value as future,
  // because '2026-08-18T09:00:00Z' sorts above '2026-08-18' once the shared prefix runs out
  // — so a caller handing this a `collectedAt` straight off a DTO would be told today is
  // tomorrow, and get a permanently disabled submit.
  return iso !== '' && apiDateToCalendarDay(iso) > todayIso()
}
