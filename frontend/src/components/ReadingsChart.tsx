import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDateTime, formatNumber, formatShortDate } from '@/lib/format'
import { PARAMETERS, PARAMETER_BY_KEY } from '@/lib/parameters'
import type { ParameterKey, Reading } from '@/lib/types'

/** One parameter at a time keeps the y-axis in real units and the chart readable. */
export function ReadingsChart({ readings }: { readings: Reading[] }) {
  const [metric, setMetric] = useState<ParameterKey>('temperature')
  const meta = PARAMETER_BY_KEY[metric]

  const data = useMemo(
    () =>
      [...readings]
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
        .map((r) => ({ t: new Date(r.recorded_at).getTime(), value: r[metric] })),
    [readings, metric],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Measurement">
        {PARAMETERS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={metric === p.key}
            onClick={() => setMetric(p.key)}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              metric === p.key
                ? 'border-fg bg-fg text-bg'
                : 'border-line text-fg-muted hover:bg-surface-muted',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="h-64" role="img" aria-label={`${meta.label} over time`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => formatShortDate(t)}
              tick={{ fontSize: 12, fill: 'var(--fg-subtle)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--fg-subtle)' }}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(t) => formatDateTime(new Date(Number(t)).toISOString())}
              formatter={(v) => [`${formatNumber(Number(v), 2)} ${meta.unit}`.trim(), meta.label]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={meta.color}
              strokeWidth={2}
              dot={data.length < 40 ? { r: 2.5, fill: meta.color } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
