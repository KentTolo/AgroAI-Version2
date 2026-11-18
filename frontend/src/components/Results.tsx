import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, Check } from 'lucide-react'
import { formatNumber, formatPercent } from '@/lib/format'
import { PARAMETERS } from '@/lib/parameters'
import { SEVERITY, VERDICTS } from '@/lib/labels'
import type { Advisory, CropPrediction, GrowingConditions, ParameterAssessment } from '@/lib/types'
import { Badge } from './ui/Feedback'

/* ---------- Ranked predictions ---------- */

export function PredictionList({ predictions }: { predictions: CropPrediction[] }) {
  return (
    <ol className="space-y-3">
      {predictions.map((p, index) => (
        <li key={p.crop}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-fg">
              <span className="mr-2 text-fg-subtle tabular-nums">{index + 1}.</span>
              {p.name}
            </span>
            <span className="text-fg-muted tabular-nums">{formatPercent(p.probability)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className={clsx('h-full rounded-full', index === 0 ? 'bg-brand' : 'bg-line-strong')}
              style={{ width: `${Math.max(p.probability * 100, 1)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

/* ---------- Advisory ---------- */


export function ScoreRing({ score, size = 112 }: { score: number; size?: number }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const color =
    score >= 85 ? 'var(--success)' : score >= 65 ? 'var(--info)' : score >= 45 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--surface-muted)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{score}</div>
          <div className="text-[11px] text-fg-subtle">of 100</div>
        </div>
      </div>
    </div>
  )
}

/** Where the measured value sits against the crop's optimal band. */
export function RangeBar({ assessment }: { assessment: ParameterAssessment }) {
  const { value, optimal_min: lo, optimal_max: hi } = assessment
  const span = Math.max(hi - lo, 1e-6)
  const min = Math.min(lo - span * 0.75, value)
  const max = Math.max(hi + span * 0.75, value)
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const tone = SEVERITY[assessment.severity].tone
  const markerColor = {
    success: 'var(--success)',
    info: 'var(--info)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    neutral: 'var(--fg-muted)',
    brand: 'var(--brand)',
  }[tone]

  return (
    <div className="relative h-2.5 rounded-full bg-surface-muted" aria-hidden>
      <div
        className="absolute inset-y-0 rounded-full bg-success-soft ring-1 ring-success/30"
        style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
      />
      <div
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow"
        style={{ left: `${pct(value)}%`, background: markerColor }}
      />
    </div>
  )
}

function ParameterRow({ p }: { p: ParameterAssessment }) {
  const severity = SEVERITY[p.severity]
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{p.label}</span>
        </div>
        <div className="mt-0.5 text-sm text-fg-muted tabular-nums">
          {formatNumber(p.value, 2)} {p.unit}
        </div>
        <Badge tone={severity.tone} className="mt-2">
          {p.severity === 'optimal' ? (
            <Check className="size-3" aria-hidden />
          ) : p.direction === 'increase' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )}
          {severity.label}
        </Badge>
      </div>
      <div className="min-w-0">
        <RangeBar assessment={p} />
        <div className="mt-1.5 flex justify-between text-xs text-fg-subtle tabular-nums">
          <span>
            Optimal {formatNumber(p.optimal_min)}–{formatNumber(p.optimal_max)} {p.unit}
          </span>
          <span>Typical {formatNumber(p.typical)}</span>
        </div>
        {p.advice && (
          <p className="mt-2 text-sm text-fg-muted">
            <span className="font-medium text-fg">
              {p.direction === 'increase' ? 'Raise it: ' : 'Lower it: '}
            </span>
            {p.advice}
          </p>
        )}
      </div>
    </li>
  )
}

export function AdvisoryResult({ advisory }: { advisory: Advisory }) {
  const verdict = VERDICTS[advisory.verdict]
  const ordered = [...advisory.parameters].sort(
    (a, b) =>
      Object.keys(SEVERITY).indexOf(b.severity) - Object.keys(SEVERITY).indexOf(a.severity),
  )
  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ScoreRing score={advisory.score} />
        <div className="min-w-0">
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
          <h3 className="mt-2 text-xl font-semibold">{advisory.crop_name}</h3>
          <p className="mt-1 text-sm text-fg-muted">{advisory.summary}</p>
          {advisory.model_probability !== null && (
            <p className="mt-2 text-xs text-fg-subtle">
              The ML model gives {advisory.crop_name.toLowerCase()} a{' '}
              {formatPercent(advisory.model_probability)} share among all 22 crops for these
              conditions.
            </p>
          )}
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {ordered.map((p) => (
          <ParameterRow key={p.parameter} p={p} />
        ))}
      </ul>
    </div>
  )
}

/* ---------- Conditions ---------- */

export function ConditionTiles({ conditions }: { conditions: GrowingConditions }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {PARAMETERS.map((p) => (
        <div key={p.key} className="rounded-lg bg-surface-muted px-3 py-2">
          <dt className="text-xs text-fg-subtle">{p.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums">
            {formatNumber(conditions[p.key])}
            {p.unit && <span className="ml-0.5 text-xs font-normal text-fg-subtle">{p.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
