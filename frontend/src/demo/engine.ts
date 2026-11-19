/**
 * Browser ports of the backend's prediction, advisory, growth and simulation logic.
 * The rules and wording come from knowledge.json, exported from the Python services,
 * so both implementations stay in step. See backend/app/ml/export.py.
 */

import type {
  Advisory,
  CropSuitability,
  CycleProgress,
  GrowingConditions,
  LesothoStatus,
  ParameterAssessment,
  ParameterKey,
  RecommendationScope,
  Severity,
  Verdict,
} from '@/lib/types'
import type { SoilData } from './soil'

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
  lesotho: LesothoStatus
  model_ranked: boolean
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
  soil: SoilData
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

/** Mirrors the API's recommendation scope: 'lesotho' keeps only crops grown in Lesotho. */
export function rankForScope(
  knowledge: Knowledge,
  model: ForestModel,
  conditions: GrowingConditions,
  scope: RecommendationScope,
  topK: number,
) {
  const all = rankCrops(model, conditions)
  const grown = new Set(knowledge.crops.filter((c) => c.lesotho !== 'unsuitable').map((c) => c.slug))
  const ranked = scope === 'lesotho' ? all.filter((s) => grown.has(s.crop)) : all
  return { ranked: ranked.slice(0, topK), overallBest: all[0]?.crop ?? '' }
}

/** Lesotho crops the model cannot rank, scored by the advisor, best first (as the API does). */
export function alsoConsider(knowledge: Knowledge, conditions: GrowingConditions): CropSuitability[] {
  return knowledge.crops
    .filter((c) => c.lesotho !== 'unsuitable' && !c.model_ranked)
    .map((c) => {
      const a = assess(knowledge, c, conditions, null)
      return { crop: c.slug, name: c.name, score: a.score, verdict: a.verdict }
    })
    .sort((a, b) => b.score - a.score)
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

/* ---------- Weather (mirrors backend/app/services/weather.py) ---------- */

export interface WeatherDay {
  day: string
  temperature_mean: number
  temperature_min: number | null
  temperature_max: number | null
  precipitation: number
  humidity_mean: number | null
  source: 'archive' | 'recent' | 'forecast'
}

const DAILY_VARIABLES = [
  'temperature_2m_mean',
  'temperature_2m_min',
  'temperature_2m_max',
  'precipitation_sum',
  'relative_humidity_2m_mean',
] as const
const ARCHIVE_LAG_DAYS = 6
const RAIN_PERIOD_DAYS = 30
const MIN_DAYS_FOR_MONTHLY_TOTAL = 25
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Daily = Partial<Record<(typeof DAILY_VARIABLES)[number], (number | null)[]>> & { time?: string[] }

export function parseDaily(payload: { daily?: Daily }, source: WeatherDay['source']): WeatherDay[] {
  const daily = payload.daily ?? {}
  const times = daily.time ?? []
  const at = (name: (typeof DAILY_VARIABLES)[number], i: number) => daily[name]?.[i] ?? null
  const out: WeatherDay[] = []
  times.forEach((day, i) => {
    const min = at('temperature_2m_min', i)
    const max = at('temperature_2m_max', i)
    let mean = at('temperature_2m_mean', i)
    if (mean === null && min !== null && max !== null) mean = (min + max) / 2
    if (mean === null) return
    out.push({
      day,
      temperature_mean: mean,
      temperature_min: min,
      temperature_max: max,
      precipitation: at('precipitation_sum', i) ?? 0,
      humidity_mean: at('relative_humidity_2m_mean', i),
      source,
    })
  })
  return out
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

async function openMeteo(url: string, params: Record<string, string | number>) {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), daily: DAILY_VARIABLES.join(','), timezone: 'auto' })
  let response: Response
  try {
    response = await fetch(`${url}?${query}`)
  } catch {
    throw new Error('The weather service could not be reached.')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { reason?: string }
    throw new Error(`The weather service returned an error (${response.status}). ${body.reason ?? ''}`.trim())
  }
  return (await response.json()) as { daily?: Daily }
}

export async function fetchHistory(lat: number, lon: number, start: string, end: string, today: string): Promise<WeatherDay[]> {
  const archiveEnd = [end, addDays(today, -ARCHIVE_LAG_DAYS)].sort()[0] as string
  const records: WeatherDay[] = []
  if (start <= archiveEnd) {
    records.push(...parseDaily(await openMeteo(ARCHIVE_URL, { latitude: lat, longitude: lon, start_date: start, end_date: archiveEnd }), 'archive'))
  }
  const recentStart = [start, addDays(archiveEnd, 1)].sort()[1] as string
  if (recentStart <= end) {
    records.push(...parseDaily(await openMeteo(FORECAST_URL, { latitude: lat, longitude: lon, start_date: recentStart, end_date: end }), 'recent'))
  }
  const unique = new Map<string, WeatherDay>()
  for (const r of records) if (!unique.has(r.day)) unique.set(r.day, r)
  return [...unique.values()].sort((a, b) => a.day.localeCompare(b.day))
}

export async function fetchForecast(lat: number, lon: number, days: number): Promise<WeatherDay[]> {
  return parseDaily(await openMeteo(FORECAST_URL, { latitude: lat, longitude: lon, forecast_days: days }), 'forecast')
}

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const meanOrNull = (xs: (number | null)[]) => {
  const present = xs.filter((x): x is number => x !== null)
  return present.length ? round1(mean(present)) : null
}

export function summarise(days: WeatherDay[], label: string) {
  if (days.length === 0) return null
  const ordered = [...days].sort((a, b) => a.day.localeCompare(b.day))
  const total = ordered.reduce((s, d) => s + d.precipitation, 0)
  return {
    label,
    start: ordered[0]!.day,
    end: ordered[ordered.length - 1]!.day,
    days: ordered.length,
    temperature: round1(mean(ordered.map((d) => d.temperature_mean))),
    humidity: meanOrNull(ordered.map((d) => d.humidity_mean)),
    rainfall: round1((total / ordered.length) * RAIN_PERIOD_DAYS),
    total_rainfall: round1(total),
  }
}

export function recentSummaries(days: WeatherDay[], windows = [30, 90, 365]) {
  if (days.length === 0) return []
  const latest = days.reduce((m, d) => (d.day > m ? d.day : m), days[0]!.day)
  return windows.flatMap((w) => {
    const start = addDays(latest, -(w - 1))
    const subset = days.filter((d) => d.day >= start)
    const s = subset.length >= w * 0.8 ? summarise(subset, `Last ${w} days`) : null
    return s ? [s] : []
  })
}

export function monthlyNormals(days: WeatherDay[]) {
  const byMonth = new Map<number, WeatherDay[]>()
  const byYearMonth = new Map<string, WeatherDay[]>()
  for (const d of days) {
    const [y, m] = d.day.split('-').map(Number) as [number, number]
    byMonth.set(m, [...(byMonth.get(m) ?? []), d])
    const key = `${y}-${m}`
    byYearMonth.set(key, [...(byYearMonth.get(key) ?? []), d])
  }
  const normals = []
  for (let month = 1; month <= 12; month++) {
    const monthDays = byMonth.get(month)
    if (!monthDays) continue
    const groups = [...byYearMonth.entries()].filter(([k]) => Number(k.split('-')[1]) === month)
    const totals = groups.filter(([, g]) => g.length >= MIN_DAYS_FOR_MONTHLY_TOTAL).map(([, g]) => g.reduce((s, d) => s + d.precipitation, 0))
    normals.push({
      month,
      temperature: round1(mean(monthDays.map((d) => d.temperature_mean))),
      humidity: meanOrNull(monthDays.map((d) => d.humidity_mean)),
      rainfall: totals.length ? round1(mean(totals)) : null,
      years: groups.length,
    })
  }
  return normals
}

export function seasonClimate(normals: ReturnType<typeof monthlyNormals>, startMonth: number, months: number) {
  const wanted = Array.from({ length: months }, (_, i) => ((startMonth - 1 + i) % 12) + 1)
  const chosen = wanted.map((m) => normals.find((n) => n.month === m))
  if (chosen.some((n) => !n || n.rainfall === null)) return null
  const present = chosen as NonNullable<(typeof chosen)[number]>[]
  const first = MONTH_NAMES[wanted[0]! - 1]
  const last = MONTH_NAMES[wanted[wanted.length - 1]! - 1]
  return {
    label: months > 1 ? `Typical ${first}–${last}` : `Typical ${first}`,
    start_month: startMonth,
    months,
    temperature: round1(mean(present.map((n) => n.temperature))),
    humidity: meanOrNull(present.map((n) => n.humidity)),
    rainfall: round1(mean(present.map((n) => n.rainfall as number))),
    years: Math.min(...present.map((n) => n.years)),
  }
}
