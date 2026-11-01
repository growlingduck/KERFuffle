import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, formatEdited } from '../src/lib/relativeDate';

/** Local wall-clock time, so the tests hold in any time zone. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (date: Date) => date.toISOString();

describe('formatEdited', () => {
  const now = at(2026, 10, 31, 15, 0);

  it('says Today with the time, Yesterday with the time, then the date', () => {
    expect(formatEdited(iso(at(2026, 10, 31, 9, 41)), now, 'en-US')).toBe('Today, 9:41 AM');
    expect(formatEdited(iso(at(2026, 10, 30, 16, 12)), now, 'en-US')).toBe('Yesterday, 4:12 PM');
    expect(formatEdited(iso(at(2026, 10, 21)), now, 'en-US')).toBe('Oct 21');
    expect(formatEdited(iso(at(2026, 1, 2)), now, 'en-US')).toBe('Jan 2');
  });

  it('adds the year for dates in an earlier year', () => {
    expect(formatEdited(iso(at(2025, 10, 21)), now, 'en-US')).toBe('Oct 21, 2025');
  });

  describe('around midnight', () => {
    it('one minute before midnight is still Today', () => {
      expect(formatEdited(iso(at(2026, 10, 31, 0, 1)), at(2026, 10, 31, 23, 59), 'en-US')).toBe('Today, 12:01 AM');
    });

    it('two minutes apart across midnight is Yesterday', () => {
      expect(formatEdited(iso(at(2026, 10, 30, 23, 59)), at(2026, 10, 31, 0, 1), 'en-US')).toBe('Yesterday, 11:59 PM');
    });

    it('just after midnight, the day before yesterday shows its date', () => {
      expect(formatEdited(iso(at(2026, 10, 29, 23, 59)), at(2026, 10, 31, 0, 0), 'en-US')).toBe('Oct 29');
    });
  });

  describe('around the new year', () => {
    it('New Year’s Eve seen on New Year’s Day is Yesterday', () => {
      expect(formatEdited(iso(at(2025, 12, 31, 23, 30)), at(2026, 1, 1, 0, 15), 'en-US')).toBe('Yesterday, 11:30 PM');
    });

    it('an older date from the previous year shows the year', () => {
      expect(formatEdited(iso(at(2025, 12, 30, 10, 0)), at(2026, 1, 1, 0, 15), 'en-US')).toBe('Dec 30, 2025');
    });

    it('a date earlier the same year has no year, even on Dec 31', () => {
      expect(formatEdited(iso(at(2026, 1, 1, 0, 5)), at(2026, 12, 31, 23, 55), 'en-US')).toBe('Jan 1');
    });
  });

  it('uses the given locale for the words, time and date', () => {
    // Hour padding is ICU's choice per locale, so the time comes from Intl too.
    const deTime = (d: Date) => new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: '2-digit' }).format(d);
    expect(formatEdited(iso(at(2026, 10, 31, 9, 41)), now, 'de-DE')).toBe(`Heute, ${deTime(at(2026, 10, 31, 9, 41))}`);
    expect(formatEdited(iso(at(2026, 10, 30, 16, 12)), now, 'de-DE')).toBe('Gestern, 16:12');
    expect(formatEdited(iso(at(2026, 10, 21)), now, 'de-DE')).toBe(new Intl.DateTimeFormat('de-DE', { month: 'short', day: 'numeric' }).format(at(2026, 10, 21)));
    expect(formatEdited(iso(at(2026, 10, 31, 16, 5)), now, 'en-GB')).toBe('Today, 16:05');
  });

  it('defaults to the system locale', () => {
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at(2026, 10, 31, 9, 41));
    expect(formatEdited(iso(at(2026, 10, 31, 9, 41)), now)).toContain(time);
  });

  it('is blank for a missing or unreadable timestamp', () => {
    expect(formatEdited(null, now)).toBe('');
    expect(formatEdited('not a date', now)).toBe('');
  });
});

describe('calendarDaysBetween', () => {
  it('counts calendar days, not 24-hour periods', () => {
    expect(calendarDaysBetween(at(2026, 10, 30, 23, 59), at(2026, 10, 31, 0, 1))).toBe(1);
    expect(calendarDaysBetween(at(2026, 10, 31, 0, 1), at(2026, 10, 31, 23, 59))).toBe(0);
    expect(calendarDaysBetween(at(2025, 12, 31), at(2026, 1, 1))).toBe(1);
  });

  it('counts a daylight-saving change as one day', () => {
    // US DST ends Nov 1, 2026 and starts Mar 8, 2026; harmless in zones without DST.
    expect(calendarDaysBetween(at(2026, 10, 31, 12), at(2026, 11, 1, 12))).toBe(1);
    expect(calendarDaysBetween(at(2026, 3, 7, 12), at(2026, 3, 8, 12))).toBe(1);
  });
});
