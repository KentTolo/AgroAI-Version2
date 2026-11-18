import { describe, expect, it } from 'vitest'
import { durationLabel, formatRelative, parseDate, pluralise } from './format'
import { confidenceLabel } from './labels'

describe('parseDate', () => {
  it('treats YYYY-MM-DD as a local calendar date', () => {
    const d = parseDate('2026-03-05')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 5])
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-06-10T12:00:00Z')
  it('describes recent and past times', () => {
    expect(formatRelative('2026-06-10T11:59:50Z', now)).toBe('just now')
    expect(formatRelative('2026-06-10T09:00:00Z', now)).toMatch(/3 hours ago/)
    expect(formatRelative('2026-06-08T12:00:00Z', now)).toMatch(/2 days ago/)
  })
})

describe('durationLabel', () => {
  it('uses days for annuals and years for perennials', () => {
    expect(durationLabel({ days_to_harvest: 90 })).toBe('Harvest in ~90 days')
    expect(durationLabel({ days_to_harvest: 1095 })).toBe('First harvest in ~3 years')
  })
})

describe('confidenceLabel', () => {
  it('maps probabilities to honest wording', () => {
    expect(confidenceLabel(0.92).label).toBe('High confidence')
    expect(confidenceLabel(0.5).label).toBe('Moderate confidence')
    expect(confidenceLabel(0.2).tone).toBe('danger')
  })
})

it('pluralises counts', () => {
  expect(pluralise(1, 'field')).toBe('1 field')
  expect(pluralise(3, 'field')).toBe('3 fields')
})
