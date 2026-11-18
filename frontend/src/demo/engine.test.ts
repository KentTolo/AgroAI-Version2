import { describe, expect, it } from 'vitest'
import type { GrowingConditions } from '@/lib/types'
import { addDays, assess, computeProgress, generateSeries, predictProba, roundHalfEven, type CropDef, type Knowledge } from './engine'

// Two hand-built trees over features [x0, x1] and classes [a, b, c].
//   tree 1: x0 <= 5 ? (x1 <= 2 ? a : b) : c
//   tree 2: x1 <= 10 ? a : c
const forest = {
  classes: ['a', 'b', 'c'],
  trees: [
    [0, 5, 1, 2, -1, -2, -3],
    [1, 10, -1, -3],
  ],
}

describe('predictProba', () => {
  it('walks the pre-order encoding and averages votes', () => {
    expect(predictProba(forest, [1, 1])).toEqual([1, 0, 0])
    expect(predictProba(forest, [1, 3])).toEqual([0.5, 0.5, 0])
    expect(predictProba(forest, [9, 20])).toEqual([0, 0, 1])
    expect(predictProba(forest, [5, 10])).toEqual([0.5, 0.5, 0]) // thresholds are inclusive
  })
})

it('rounds halves to even like Python', () => {
  expect([roundHalfEven(40.5), roundHalfEven(41.5), roundHalfEven(2.4), roundHalfEven(2.6)]).toEqual([40, 42, 2, 3])
})

const params = ['nitrogen', 'phosphorus', 'potassium', 'temperature', 'humidity', 'ph', 'rainfall'] as const
const profile = Object.fromEntries(
  params.map((k) => [k, { min: 0, max: 100, mean: 50, p10: 40, p25: 45, median: 50, p75: 55, p90: 60 }]),
) as CropDef['profile']
const maize: CropDef = { slug: 'maize', name: 'Maize', category: 'cereal', lifecycle: 'annual', days_to_harvest: 100, description: '', profile }
const advice = { increase: { slight: 'up a bit', moderate: 'up more', significant: 'up a lot' }, decrease: { slight: 'down a bit', moderate: 'down more', significant: 'down a lot' } }
const knowledge = {
  parameters: params.map((key) => ({ key, label: key.toUpperCase(), unit: 'u', min_value: 0, max_value: 1000, tolerance: 1 })),
  dataset_bounds: Object.fromEntries(params.map((k) => [k, { min: 0, max: 100 }])),
  crops: [maize],
  advice: Object.fromEntries(params.map((k) => [k, advice])),
  severity_scores: { optimal: 100, slight: 75, moderate: 45, significant: 10 },
  verdict_text: {
    well_suited: '{name} is well suited.',
    suitable_with_adjustments: '{name} needs adjustments.',
    marginal: '{name} is marginal.',
    not_recommended: '{name} is not recommended.',
  },
  stage_templates: {
    annual: [
      { name: 'Germination', start: 0, end: 0.1, guidance: 'g' },
      { name: 'Vegetative', start: 0.1, end: 0.45, guidance: 'v' },
      { name: 'Flowering', start: 0.45, end: 0.65, guidance: 'f' },
      { name: 'Development', start: 0.65, end: 0.9, guidance: 'd' },
      { name: 'Harvest', start: 0.9, end: 1, guidance: 'h' },
    ],
    perennial: [],
  },
  simulator: Object.fromEntries(params.map((k) => [k, { baseline_low: 10, baseline_high: 20, volatility: 1, reversion: 0.3 }])),
} as unknown as Knowledge

const typical = Object.fromEntries(params.map((k) => [k, 50])) as GrowingConditions

describe('assess', () => {
  it('scores typical conditions as well suited', () => {
    const result = assess(knowledge, maize, typical, 0.8)
    expect(result.score).toBe(100)
    expect(result.verdict).toBe('well_suited')
    expect(result.summary).toBe('Maize is well suited.')
  })

  it('grades deviations by a quarter of the optimal band', () => {
    // Band 40–60, scale 5: 63 is slight (decrease), 28 is significant (increase).
    const result = assess(knowledge, maize, { ...typical, ph: 63, nitrogen: 28 }, null)
    const ph = result.parameters.find((p) => p.parameter === 'ph')
    const n = result.parameters.find((p) => p.parameter === 'nitrogen')
    expect([ph?.severity, ph?.direction, ph?.advice]).toEqual(['slight', 'decrease', 'down a bit'])
    expect([n?.severity, n?.direction]).toEqual(['significant', 'increase'])
    expect(result.score).toBe(Math.round((100 * 5 + 75 + 10) / 7))
    expect(result.summary).toContain('The biggest gap is nitrogen.')
  })
})

it('computes growth progress like the API', () => {
  const planted = '2026-01-01'
  const harvest = addDays(planted, 100)
  const mid = computeProgress(knowledge, maize, planted, harvest, addDays(planted, 50))
  expect([mid.day, mid.percent, mid.days_remaining, mid.current_stage]).toEqual([50, 50, 50, 'Flowering'])
  const late = computeProgress(knowledge, maize, planted, harvest, addDays(planted, 150))
  expect(late.percent).toBe(100)
  expect(late.stages.at(-1)?.status).toBe('current')
})

it('generates reproducible, in-range sensor series', () => {
  const a = generateSeries(knowledge, { end: 0, count: 30, intervalMs: 1000, seed: 4 })
  const b = generateSeries(knowledge, { end: 0, count: 30, intervalMs: 1000, seed: 4 })
  expect(a).toEqual(b)
  expect(a.at(-1)?.recordedAt).toBe(0)
  expect(a.every((p) => Object.values(p.values).every((v) => v >= 0 && v <= 1000))).toBe(true)
})
