import { clsx } from 'clsx'
import { Cloud, CloudRain, CloudSun, MapPin, RefreshCw, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDate, formatNumber, formatShortDate, parseDate, todayIso } from '@/lib/format'
import { useClimate, useForecast, useSyncWeather, useWeatherHistory } from '@/lib/queries'
import type { DailyWeather, Field } from '@/lib/types'
import { Button } from './ui/Button'
import { Card, CardBody, CardHeader } from './ui/Card'
import { Alert, EmptyState } from './ui/Feedback'
import { LoadingBlock } from './ui/Spinner'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

const RANGES = [
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: '3 years', days: 365 * 3 },
] as const

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  fontSize: 12,
}
const axisTick = { fontSize: 12, fill: 'var(--fg-subtle)' }

function daysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function WeatherIcon({ day }: { day: DailyWeather }) {
  const cls = 'size-6'
  if (day.precipitation >= 5) return <CloudRain className={clsx(cls, 'text-info')} aria-label="Rain" />
  if (day.precipitation >= 1) return <Cloud className={clsx(cls, 'text-fg-subtle')} aria-label="Showers" />
  if ((day.humidity_mean ?? 0) >= 70) return <CloudSun className={clsx(cls, 'text-accent')} aria-label="Cloudy" />
  return <Sun className={clsx(cls, 'text-accent')} aria-label="Sunny" />
}

function Forecast({ fieldId }: { fieldId: string }) {
  const forecast = useForecast(fieldId)
  if (forecast.isPending) return <LoadingBlock label="Loading forecast" />
  if (forecast.isError) return <Alert tone="warning">Forecast unavailable: {forecast.error.message}</Alert>
  return (
    <ol className="grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="7-day forecast">
      {forecast.data.map((day, i) => (
        <li key={day.day} className={clsx('rounded-2xl p-3 text-center', i === 0 ? 'bg-highlight text-highlight-fg' : 'bg-surface-muted')}>
          <p className="text-xs font-semibold">{i === 0 ? 'Today' : weekday.format(parseDate(day.day))}</p>
          <div className="my-2 flex justify-center">
            <WeatherIcon day={day} />
          </div>
          <p className="text-sm font-semibold tabular-nums">
            {formatNumber(day.temperature_max ?? day.temperature_mean, 0)}°
            <span className="ml-1 font-normal opacity-60">{formatNumber(day.temperature_min ?? day.temperature_mean, 0)}°</span>
          </p>
          <p className={clsx('mt-0.5 text-xs tabular-nums', i === 0 ? 'opacity-70' : 'text-fg-subtle')}>
            {day.precipitation > 0 ? `${formatNumber(day.precipitation)} mm` : 'Dry'}
          </p>
        </li>
      ))}
    </ol>
  )
}

function HistoryChart({ fieldId }: { fieldId: string }) {
  const [range, setRange] = useState<number>(365)
  const since = useMemo(() => daysAgo(range), [range])
  const history = useWeatherHistory(fieldId, since)

  // Long ranges are easier to read as weekly averages and totals.
  const data = useMemo(() => {
    const days = history.data ?? []
    if (range <= 90) {
      return days.map((d) => ({ t: parseDate(d.day).getTime(), temp: d.temperature_mean, rain: d.precipitation }))
    }
    const weeks: { t: number; temp: number; rain: number }[] = []
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7)
      weeks.push({
        t: parseDate(chunk[0]!.day).getTime(),
        temp: Math.round((chunk.reduce((s, d) => s + d.temperature_mean, 0) / chunk.length) * 10) / 10,
        rain: Math.round(chunk.reduce((s, d) => s + d.precipitation, 0) * 10) / 10,
      })
    }
    return weeks
  }, [history.data, range])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          History <span className="font-normal text-fg-subtle">· {range > 90 ? 'weekly' : 'daily'} temperature and rainfall</span>
        </p>
        <div className="inline-flex rounded-full border border-line p-0.5" role="group" aria-label="History range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={range === r.days}
              onClick={() => setRange(r.days)}
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-medium',
                range === r.days ? 'bg-fg text-bg' : 'text-fg-subtle hover:text-fg',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {history.isPending ? (
        <LoadingBlock label="Loading history" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-subtle">No history stored for this period yet.</p>
      ) : (
        <div className="h-64" role="img" aria-label="Temperature and rainfall history">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => formatShortDate(t)}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
                minTickGap={28}
              />
              <YAxis yAxisId="temp" tick={axisTick} tickLine={false} axisLine={false} width={40} unit="°" />
              <YAxis yAxisId="rain" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={44} unit="mm" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(t) => formatDate(new Date(Number(t)).toISOString().slice(0, 10))}
                formatter={(v, name) =>
                  name === 'temp' ? [`${formatNumber(Number(v))} °C`, 'Temperature'] : [`${formatNumber(Number(v))} mm`, 'Rainfall']
                }
              />
              <Bar yAxisId="rain" dataKey="rain" fill="var(--info)" opacity={0.45} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="temp" dataKey="temp" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function ClimateOverview({ fieldId }: { fieldId: string }) {
  const climate = useClimate(fieldId, undefined)
  if (climate.isPending) return <LoadingBlock label="Loading climate" />
  if (climate.isError) return <Alert tone="danger">{climate.error.message}</Alert>
  const { recent, normals, coverage } = climate.data
  const data = normals.map((n) => ({ month: MONTHS[n.month - 1], temp: n.temperature, rain: n.rainfall }))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div>
        <p className="mb-3 text-sm font-medium">Recent conditions</p>
        <dl className="space-y-2">
          {recent.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
              <dt className="text-fg-muted">{s.label}</dt>
              <dd className="flex gap-3 font-semibold tabular-nums">
                <span>{formatNumber(s.temperature)}°C</span>
                {s.humidity !== null && <span>{formatNumber(s.humidity, 0)}%</span>}
                <span title="Average monthly rainfall">{formatNumber(s.rainfall, 0)} mm/mo</span>
              </dd>
            </div>
          ))}
        </dl>
        {coverage.start && (
          <p className="mt-3 text-xs text-fg-subtle">
            {coverage.days.toLocaleString()} days stored, {formatDate(coverage.start)} to {formatDate(coverage.end ?? coverage.start)}.
          </p>
        )}
      </div>
      <div>
        <p className="mb-3 text-sm font-medium">
          Monthly averages <span className="font-normal text-fg-subtle">· across all stored years</span>
        </p>
        <div className="h-52" role="img" aria-label="Average temperature and rainfall by month">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval={0} />
              <YAxis yAxisId="temp" tick={axisTick} tickLine={false} axisLine={false} width={40} unit="°" />
              <YAxis yAxisId="rain" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={44} unit="mm" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) =>
                  name === 'temp' ? [`${formatNumber(Number(v))} °C`, 'Avg temperature'] : [`${formatNumber(Number(v))} mm`, 'Avg rainfall']
                }
              />
              <Bar yAxisId="rain" dataKey="rain" fill="var(--info)" opacity={0.45} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line yAxisId="temp" dataKey="temp" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export function WeatherSection({ field }: { field: Field }) {
  const mapped = field.latitude !== null && field.longitude !== null
  const climate = useClimate(field.id, undefined, mapped)
  const sync = useSyncWeather(field.id)
  const autoSynced = useRef(false)

  // Keep the history feed current: sync automatically when it is missing or more than a day old.
  const coverageEnd = climate.data?.coverage.end ?? null
  const stale = climate.isSuccess && (coverageEnd === null || coverageEnd < daysAgo(1))
  const { mutate, isPending } = sync
  useEffect(() => {
    if (mapped && stale && !autoSynced.current && !isPending) {
      autoSynced.current = true
      mutate(3)
    }
  }, [mapped, stale, isPending, mutate])

  if (!mapped) {
    return (
      <Card>
        <CardHeader title="Weather" />
        <EmptyState
          icon={<MapPin />}
          title="Add a location to get weather"
          description="Set this field's location (Edit, then click the map) to pull in its forecast and years of weather history."
        />
      </Card>
    )
  }

  const hasHistory = (climate.data?.coverage.days ?? 0) > 0

  return (
    <Card>
      <CardHeader
        title="Weather"
        description={
          coverageEnd ? `History up to ${coverageEnd === todayIso() ? 'today' : formatDate(coverageEnd)}` : 'Forecast and history for this location'
        }
        action={
          <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={sync.isPending} onClick={() => sync.mutate(3)}>
            {hasHistory ? 'Refresh' : 'Fetch history'}
          </Button>
        }
      />
      <CardBody className="space-y-8">
        {sync.error && <Alert tone="danger" title="Could not update weather history">{sync.error.message}</Alert>}
        <Forecast fieldId={field.id} />
        {hasHistory ? (
          <>
            <HistoryChart fieldId={field.id} />
            <ClimateOverview fieldId={field.id} />
          </>
        ) : (
          (sync.isPending || climate.isPending) && <LoadingBlock label="Downloading three years of weather history" />
        )}
        <p className="text-xs text-fg-subtle">
          Weather data by{' '}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">
            Open-Meteo.com
          </a>{' '}
          (CC BY 4.0): ERA5 reanalysis for history and the best available model for forecasts.
        </p>
      </CardBody>
    </Card>
  )
}
