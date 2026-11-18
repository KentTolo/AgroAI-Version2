const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** Parse an ISO date (YYYY-MM-DD) as a local calendar date, not UTC midnight. */
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number]
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export const formatDate = (value: string) => dateFormat.format(parseDate(value))
export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value))
export const formatShortDate = (value: string | number) => shortDate.format(new Date(value))

export function formatRelative(value: string, now: Date = new Date()): string {
  const seconds = (new Date(value).getTime() - now.getTime()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return value.toLocaleString(undefined, { maximumFractionDigits })
}

export const formatPercent = (fraction: number, digits = 0) =>
  `${(fraction * 100).toFixed(digits)}%`

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function pluralise(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`
}

export function durationLabel(crop: { days_to_harvest: number }): string {
  if (crop.days_to_harvest >= 365) {
    const years = crop.days_to_harvest / 365
    return `First harvest in ~${formatNumber(years, years < 2 ? 1 : 0)} years`
  }
  return `Harvest in ~${crop.days_to_harvest} days`
}
