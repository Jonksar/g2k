/**
 * Calendar date as YYYY-MM-DD in the given timezone (system local by default).
 * Uses the UTC date previously, which filed late-evening meetings under the wrong day.
 * `en-CA` locale formats as YYYY-MM-DD.
 */
export function localDate(date: Date = new Date(), timeZone?: string): string {
  return date.toLocaleDateString('en-CA', timeZone ? { timeZone } : undefined)
}
