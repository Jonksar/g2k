import { describe, it, expect } from 'vitest'
import { localDate } from '../src/date.js'

describe('localDate', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(localDate(new Date('2026-06-03T12:00:00Z'), 'UTC')).toBe('2026-06-03')
  })
  it('uses the local timezone, not UTC, for the calendar date', () => {
    // 03:30 UTC on Jun 4 is still Jun 3 in New York (UTC-4 in June)
    expect(localDate(new Date('2026-06-04T03:30:00Z'), 'America/New_York')).toBe('2026-06-03')
  })
})
