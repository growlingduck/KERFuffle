const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days from `date` to `now` in local time (1 = yesterday). Rounded, so DST's 23/25-hour days still count as one. */
export function calendarDaysBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
}

function capitalize(text: string, locale: string | undefined): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * "Last edited" in the register: "Today, 9:41 AM", "Yesterday, 4:12 PM",
 * "Oct 21" this year, "Oct 21, 2025" before that. Words, times and dates come
 * from Intl in the user's locale (undefined = the system locale). Days are
 * calendar days in local time, so 11:59 PM yesterday is "Yesterday" at 12:01 AM.
 */
export function formatEdited(iso: string | null, now: Date, locale?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const days = calendarDaysBetween(date, now);
  if (days === 0 || days === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-days, 'day');
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
    return `${capitalize(word, locale)}, ${time}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(date);
}
