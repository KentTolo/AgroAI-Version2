import { CloudSun } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { formatDate, formatNumber } from '@/lib/format'
import { useClimate, useDevices, useSensorSummary, useSyncWeather } from '@/lib/queries'
import type { Climate, Field, GrowingConditions } from '@/lib/types'
import { Button } from './ui/Button'
import { FormField, Select } from './ui/Form'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Source = 'entered' | 'sensor7' | 'recent30' | 'recent90' | 'season'

export interface ClimateChoice {
  patch: Partial<GrowingConditions>
  basis: string
}

function choose(climate: Climate, source: Source): ClimateChoice | null {
  if (source === 'season') {
    const s = climate.season
    if (!s) return null
    return {
      patch: { temperature: s.temperature, rainfall: s.rainfall, ...(s.humidity !== null && { humidity: s.humidity }) },
      basis: `${s.label} climate from ${s.years} years of weather history (Open-Meteo)`,
    }
  }
  const label = source === 'recent30' ? 'Last 30 days' : 'Last 90 days'
  const r = climate.recent.find((w) => w.label === label)
  if (!r) return null
  return {
    patch: { temperature: r.temperature, rainfall: r.rainfall, ...(r.humidity !== null && { humidity: r.humidity }) },
    basis: `${label} of weather, ${formatDate(r.start)} to ${formatDate(r.end)} (Open-Meteo)`,
  }
}

/**
 * Lets the user take temperature, humidity and rainfall from a field's weather history instead of
 * typing them. Soil values are left untouched.
 */
export function ClimateSource({
  field,
  onChange,
}: {
  field: Field
  onChange: (choice: ClimateChoice | null) => void
}) {
  const [source, setSource] = useState<Source>('entered')
  const [startMonth, setStartMonth] = useState(() => ((new Date().getMonth() + 1) % 12) + 1)
  const [months, setMonths] = useState(4)
  const usesWeather = source !== 'entered' && source !== 'sensor7'
  const climate = useClimate(field.id, source === 'season' ? { start: startMonth, months } : undefined, usesWeather)
  const sync = useSyncWeather(field.id)
  const devices = useDevices(field.id)
  const hasSensors = (devices.data?.length ?? 0) > 0
  const sensors = useSensorSummary(field.id, 7, source === 'sensor7')

  const sensorChoice: ClimateChoice | null =
    source === 'sensor7' && sensors.data && sensors.data.readings > 0 && sensors.data.air_temperature !== null
      ? {
          patch: {
            temperature: sensors.data.air_temperature,
            ...(sensors.data.air_humidity !== null && { humidity: sensors.data.air_humidity }),
          },
          basis: `Field sensor averages over the last 7 days (${sensors.data.readings} readings); rainfall as entered`,
        }
      : null
  const choice = source === 'sensor7' ? sensorChoice : usesWeather && climate.data ? choose(climate.data, source) : null
  // Notify the parent only when the resulting climate actually changes.
  const choiceKey = choice ? JSON.stringify(choice) : 'none'
  const notify = useEffectEvent(() => onChange(choice))
  useEffect(() => notify(), [choiceKey])

  const noHistory = usesWeather && climate.data && climate.data.coverage.days === 0

  return (
    <div className="rounded-2xl border border-line bg-surface-muted/50 p-4">
      <FormField
        label={
          <span className="inline-flex items-center gap-1.5">
            <CloudSun className="size-4 text-fg-subtle" aria-hidden /> Climate source
          </span>
        }
      >
        {({ id }) => (
          <Select id={id} value={source} onChange={(e) => setSource(e.target.value as Source)}>
            <option value="entered">Values below (reading or typed)</option>
            {hasSensors && <option value="sensor7">Field sensor: last 7 days</option>}
            <option value="recent30">Weather: last 30 days</option>
            <option value="recent90">Weather: last 90 days</option>
            <option value="season">Weather: typical climate for a season</option>
          </Select>
        )}
      </FormField>

      {source === 'season' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <FormField label="Planting month">
            {({ id }) => (
              <Select id={id} value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Season length">
            {({ id }) => (
              <Select id={id} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} months
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
      )}

      {source === 'sensor7' && (
        <p className="mt-3 text-sm text-fg-muted">
          {sensors.isPending
            ? 'Loading sensor readings…'
            : sensorChoice
              ? `${formatNumber(sensorChoice.patch.temperature ?? 0)}°C${
                  sensorChoice.patch.humidity !== undefined ? ` · ${formatNumber(sensorChoice.patch.humidity, 0)}%` : ''
                } from your station filled in below. Rainfall and soil values are unchanged.`
              : 'No air temperature readings from this field in the last 7 days.'}
        </p>
      )}

      {usesWeather && (
        <div className="mt-3 text-sm">
          {climate.isPending ? (
            <p className="text-fg-subtle">Loading climate…</p>
          ) : noHistory ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-fg-muted">No weather history stored for this field yet.</p>
              <Button size="sm" variant="secondary" loading={sync.isPending} onClick={() => sync.mutate(3)}>
                Fetch history
              </Button>
            </div>
          ) : choice ? (
            <p className="text-fg-muted">
              <span className="font-semibold text-fg">
                {formatNumber(choice.patch.temperature ?? 0)}°C
                {choice.patch.humidity !== undefined && ` · ${formatNumber(choice.patch.humidity, 0)}%`} ·{' '}
                {formatNumber(choice.patch.rainfall ?? 0, 0)} mm/month
              </span>{' '}
              filled in below. Soil values are unchanged.
            </p>
          ) : (
            <p className="text-warning">Not enough weather history for this choice yet.</p>
          )}
          {sync.error && <p className="mt-1 text-danger">{sync.error.message}</p>}
        </div>
      )}
    </div>
  )
}
