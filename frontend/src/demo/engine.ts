/**
 * Browser ports of the backend's prediction, advisory, growth and simulation logic.
 * The rules and wording come from knowledge.json, exported from the Python services,
 * so both implementations stay in step. See backend/app/ml/export.py.
 */

import type {
  Advisory,
  CycleProgress,
  GrowingConditions,
  ParameterAssessment,
  ParameterKey,
  Severity,
  Verdict,
} from '@/lib/types'

/* ---------- Data files ---------- */

export interface ForestModel {
  version: string
  algorithm: string
  trained_at: string
  features: ParameterKey[]
  classes: string[]
  dataset: Record<string, unknown>
  metrics: Record<string, unknown>
  trees: number[][]
}

interface ParameterDef {
  key: ParameterKey
  label: string
  unit: string
  min_value: number
  max_value: number
  tolerance: number
}

export interface CropDef {
  slug: string
  name: string
  category: string
  lifecycle: 'annual' | 'perennial'
  days_to_harvest: number
  description: string
  profile: Record<ParameterKey, Record<'min' | 'max' | 'mean' | 'p10' | 'p25' | 'median' | 'p75' | 'p90', number>>
}

interface StageTemplate {
  name: string
  start: number
  end: number
  guidance: string
}

interface SeriesSpec {
  baseline_low: number
  baseline_high: number
  volatility: number
  reversion: number
}

export interface Knowledge {
  parameters: ParameterDef[]
  dataset_bounds: Record<ParameterKey, { min: number; max: number }>
  crops: CropDef[]
  advice: Record<ParameterKey, Record<'increase' | 'decrease', Record<Exclude<Severity, 'optimal'>, string>>>
  severity_scores: Record<Severity, number>
  verdict_text: Record<Verdict, string>
  stage_templates: Record<'annual' | 'perennial', StageTemplate[]>
  simulator: Record<ParameterKey, SeriesSpec>
}

/* ---------- Model ---------- */

/** Index just past the subtree starting at `i` in a pre-order encoded tree. */
function skipSubtree(tree: number[], i: number): number {
  let pending = 1
  while (pending > 0) {
    if ((tree[i] ?? -1) < 0) {
      i += 1
      pending -= 1
    } else {
      i += 2
      pending += 1
    }
  }
  return i
}

/** Class probabilities (vote shares), in `model.classes` order. */
export function predictProba(model: Pick<ForestModel, 'trees' | 'classes'>, row: number[]): number[] {
  const votes = new Array<number>(model.classes.length).fill(0)
  for (const tree of model.trees) {
    let i = 0
    while ((tree[i] ?? -1) >= 0) {
      const feature = tree[i] as number
      const threshold = tree[i + 1] as number
      i = (row[feature] as number) <= threshold ? i + 2 : skipSubtree(tree, i + 2)
    }
    const leaf = -(tree[i] as number) - 1
    votes[leaf] = (votes[leaf] ?? 0) + 1
  }
  return votes.map((v) => v / model.trees.length)
}

export function rankCrops(model: ForestModel, conditions: GrowingConditions) {
  const row = model.features.map((f) => conditions[f])
  return predictProba(model, row)
    .map((probability, i) => ({ crop: model.classes[i] as string, probability }))
    .sort((a, b) => b.probability - a.probability)
}

/* ---------- Helpers ---------- */

/** Python's round(): halves go to the nearest even number. */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value)
  const diff = value - floor
  if (Math.abs(diff - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1
  return Math.round(value)
}

/** Python's "{:g}" for the magnitudes used here. */
const g = (n: number) => String(Number(n.toPrecision(6)))

/* ---------- Advisory ---------- */

function grade(deviation: number, scale: number): Severity {
  if (deviation <= 0) return 'optimal'
  if (deviation <= scale) return 'slight'
  if (deviation <= 2 * scale) return 'moderate'
  return 'significant'
}

export function assess(
  knowledge: Knowledge,
  crop: CropDef,
  conditions: GrowingConditions,
  modelProbability: number | null,
): Advisory {
  const parameters: ParameterAssessment[] = knowledge.parameters.map((param) => {
    const stats = crop.profile[param.key]
    const low = stats.p10
    const high = stats.p90
    const scale = Math.max((high - low) / 4, param.tolerance)
    const value = conditions[param.key]
    let deviation = 0
    let direction: 'increase' | 'decrease' | null = null
    if (value < low) {
      deviation = low - value
      direction = 'increase'
    } else if (value > high) {
      deviation = value - high
      direction = 'decrease'
    }
    const severity = grade(deviation, scale)
    return {
      parameter: param.key,
      label: param.label,
      unit: param.unit,
      value,
      optimal_min: low,
      optimal_max: high,
      typical: stats.median,
      severity,
      direction,
      advice: direction && severity !== 'optimal' ? knowledge.advice[param.key][direction][severity] : null,
    }
  })

  const scores = knowledge.severity_scores
  const score = roundHalfEven(parameters.reduce((sum, p) => sum + scores[p.severity], 0) / parameters.length)
  const significant = parameters.filter((p) => p.severity === 'significant').length
  const verdict: Verdict =
    score >= 90 && significant === 0
      ? 'well_suited'
      : score >= 70 && significant <= 1
        ? 'suitable_with_adjustments'
        : score >= 45
          ? 'marginal'
          : 'not_recommended'

  let summary = knowledge.verdict_text[verdict].replace('{name}', crop.name)
  const issues = parameters.filter((p) => p.severity !== 'optimal')
  if (issues.length > 0) {
    const worst = issues.reduce((a, b) => (scores[b.severity] < scores[a.severity] ? b : a))
    summary += ` The biggest gap is ${worst.label.toLowerCase()}.`
  }

  return {
    crop: crop.slug,
    crop_name: crop.name,
    score,
    verdict,
    summary,
    model_probability: modelProbability,
    parameters,
  }
}

export function outOfRangeWarnings(knowledge: Knowledge, conditions: GrowingConditions): string[] {
  return knowledge.parameters.flatMap((param) => {
    const bounds = knowledge.dataset_bounds[param.key]
    const value = conditions[param.key]
    if (value >= bounds.min && value <= bounds.max) return []
    return [
      `${param.label} of ${g(value)} ${param.unit} is outside the training data range ` +
        `(${g(bounds.min)} to ${g(bounds.max)} ${param.unit}); treat the result with caution.`,
    ]
  })
}

/* ---------- Growth ---------- */

const DAY = 86_400_000

export function parseIsoDate(value: string): number {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return isoDate(parseIsoDate(date) + days * DAY)
}

export function computeProgress(
  knowledge: Knowledge,
  crop: CropDef,
  plantedOn: string,
  expectedHarvestOn: string,
  today: string,
): CycleProgress {
  const totalDays = Math.max(Math.round((parseIsoDate(expectedHarvestOn) - parseIsoDate(plantedOn)) / DAY), 1)
  const day = Math.max(Math.round((parseIsoDate(today) - parseIsoDate(plantedOn)) / DAY), 0)
  const fraction = Math.min(day / totalDays, 1)
  const templates = knowledge.stage_templates[crop.lifecycle]
  let current: string | null = null

  const stages = templates.map((t, index) => {
    const isLast = index === templates.length - 1
    let status: 'completed' | 'current' | 'upcoming'
    if (fraction >= t.end && !isLast) status = 'completed'
    else if (fraction >= t.start) {
      status = 'current'
      current = t.name
    } else status = 'upcoming'
    return {
      name: t.name,
      guidance: t.guidance,
      start_day: roundHalfEven(t.start * totalDays),
      end_day: roundHalfEven(t.end * totalDays),
      status,
    }
  })

  return {
    day,
    total_days: totalDays,
    percent: Math.round(fraction * 1000) / 10,
    days_remaining: Math.max(totalDays - day, 0),
    current_stage: current ?? templates[0]?.name ?? '',
    stages,
  }
}

/* ---------- Simulator ---------- */

/** Small, fast, seedable PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function generateSeries(
  knowledge: Knowledge,
  options: { end: number; count: number; intervalMs: number; seed?: number },
): { recordedAt: number; values: GrowingConditions }[] {
  const random = rng(options.seed ?? Math.floor(Math.random() * 2 ** 31))
  const gauss = () => {
    const u = 1 - random()
    const v = random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const keys = knowledge.parameters.map((p) => p.key)
  const baselines = Object.fromEntries(
    keys.map((k) => {
      const spec = knowledge.simulator[k]
      return [k, spec.baseline_low + random() * (spec.baseline_high - spec.baseline_low)]
    }),
  ) as GrowingConditions
  const current = { ...baselines }
  const start = options.end - options.intervalMs * (options.count - 1)

  return Array.from({ length: options.count }, (_, step) => {
    const values = {} as GrowingConditions
    for (const param of knowledge.parameters) {
      const spec = knowledge.simulator[param.key]
      const drift = (baselines[param.key] - current[param.key]) * spec.reversion
      let next = current[param.key] + drift + gauss() * spec.volatility
      next = Math.min(Math.max(next, param.min_value), param.max_value)
      current[param.key] = next
      values[param.key] = Math.round(next * 100) / 100
    }
    return { recordedAt: start + options.intervalMs * step, values }
  })
}
