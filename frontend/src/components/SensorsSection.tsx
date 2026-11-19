import { clsx } from 'clsx'
import { Check, Copy, Cpu, KeyRound, Plus, Radio, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { apiBaseUrl, DEMO_MODE } from '@/lib/api'
import { formatDateTime, formatNumber, formatRelative, formatShortDate } from '@/lib/format'
import { useDeleteDevice, useDevices, useRegisterDevice, useRotateDeviceKey, useTelemetry } from '@/lib/queries'
import type { Device, DeviceWithKey, Field, Telemetry } from '@/lib/types'
import { Button } from './ui/Button'
import { Card, CardBody, CardHeader } from './ui/Card'
import { ConfirmDialog, Dialog } from './ui/Dialog'
import { Alert, Badge, EmptyState } from './ui/Feedback'
import { FormField, Input } from './ui/Form'
import { LoadingBlock } from './ui/Spinner'

const GUIDE_URL = 'https://github.com/KentTolo/AgroAI-Version2/blob/main/docs/hardware/README.md'
/** The firmware reports every 15 minutes; allow some slack before calling a station offline. */
const ONLINE_WINDOW_MS = 45 * 60_000

const METRICS = [
  { key: 'air_temperature', label: 'Air temp', unit: '°C', color: 'var(--accent)' },
  { key: 'air_humidity', label: 'Humidity', unit: '%', color: 'var(--info)' },
  { key: 'soil_moisture', label: 'Soil moisture', unit: '%', color: 'var(--brand)' },
  { key: 'soil_temperature', label: 'Soil temp', unit: '°C', color: '#a16207' },
  { key: 'battery_voltage', label: 'Battery', unit: 'V', color: 'var(--fg-muted)' },
] as const
type MetricKey = (typeof METRICS)[number]['key']

/** Start of the 7-day chart window, rounded to the hour so the query key stays stable. */
function sevenDaysAgo() {
  return new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 13) + ':00:00Z'
}

function status(device: Device) {
  if (!device.last_seen_at) return { label: 'Waiting for first reading', tone: 'neutral' as const }
  const online = Date.now() - new Date(device.last_seen_at).getTime() < ONLINE_WINDOW_MS
  return online
    ? { label: 'Online', tone: 'success' as const }
    : { label: `Last seen ${formatRelative(device.last_seen_at)}`, tone: 'warning' as const }
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-ink p-4 pr-12 text-xs leading-relaxed text-ink-fg">{text}</pre>
      <button
        type="button"
        aria-label="Copy"
        className="absolute top-2 right-2 rounded-lg p-2 text-ink-fg/70 hover:bg-white/10 hover:text-ink-fg"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  )
}

function KeyReveal({ device }: { device: DeviceWithKey }) {
  const config = `// Paste into firmware/agroai_station/config.h
#define AGROAI_API_URL    "${apiBaseUrl()}/telemetry"
#define AGROAI_DEVICE_KEY "${device.api_key}"`
  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Copy this key now">
        It is shown only once. If you lose it, use “New key” on the station to issue another.
      </Alert>
      <CopyBlock text={config} />
      <p className="text-sm text-fg-muted">
        Follow the{' '}
        <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="font-semibold text-fg underline">
          sensor station guide
        </a>{' '}
        to build and flash the station. Readings appear here within 15 minutes of switching it on.
      </p>
    </div>
  )
}

function TelemetryChart({ readings }: { readings: Telemetry[] }) {
  const available = METRICS.filter((m) => readings.some((r) => r[m.key] !== null))
  const [metric, setMetric] = useState<MetricKey>(available[0]?.key ?? 'air_temperature')
  const meta = METRICS.find((m) => m.key === metric) ?? METRICS[0]
  const data = useMemo(
    () =>
      readings
        .filter((r) => r[metric] !== null)
        .map((r) => ({ t: new Date(r.recorded_at).getTime(), value: r[metric] }))
        .sort((a, b) => a.t - b.t),
    [readings, metric],
  )
  const span = data.length > 1 ? data[data.length - 1]!.t - data[0]!.t : 0
  const tick = (t: number) =>
    span < 4 * 86_400_000
      ? new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : formatShortDate(t)
  if (available.length === 0) return null
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Sensor measurement">
        {available.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={metric === m.key}
            onClick={() => setMetric(m.key)}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-medium',
              metric === m.key ? 'border-fg bg-fg text-bg' : 'border-line text-fg-muted hover:bg-surface-muted',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-56" role="img" aria-label={`${meta.label} over the last 7 days`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={tick}
              tick={{ fontSize: 12, fill: 'var(--fg-subtle)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              minTickGap={48}
            />
            <YAxis tick={{ fontSize: 12, fill: 'var(--fg-subtle)' }} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }}
              labelFormatter={(t) => formatDateTime(new Date(Number(t)).toISOString())}
              formatter={(v) => [`${formatNumber(Number(v), 1)} ${meta.unit}`, meta.label]}
            />
            <Line dataKey="value" stroke={meta.color} strokeWidth={2} dot={data.length < 60 ? { r: 2 } : false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function DeviceRow({ device, fieldId }: { device: Device; fieldId: string }) {
  const rotate = useRotateDeviceKey(fieldId)
  const remove = useDeleteDevice(fieldId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newKey, setNewKey] = useState<DeviceWithKey | null>(null)
  const s = status(device)
  const latest = device.latest

  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-surface-muted">
            <Cpu className="size-5 text-fg-muted" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">{device.name}</p>
            <p className="text-xs text-fg-subtle">
              Key {device.key_prefix}… · added {formatRelative(device.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge tone={s.tone}>
            <Radio className="size-3" aria-hidden /> {s.label}
          </Badge>
          <Button size="sm" variant="ghost" icon={<KeyRound />} loading={rotate.isPending} onClick={() => rotate.mutate(device.id, { onSuccess: setNewKey })}>
            New key
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Remove ${device.name}`} onClick={() => setConfirmDelete(true)} />
        </div>
      </div>
      {latest && (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {METRICS.map((m) =>
            latest[m.key] === null ? null : (
              <div key={m.key} className="rounded-xl bg-surface-muted px-3 py-2">
                <dt className="text-xs text-fg-subtle">{m.label}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatNumber(latest[m.key] as number, m.key === 'battery_voltage' ? 2 : 1)}
                  <span className="ml-0.5 text-xs font-normal text-fg-subtle">{m.unit}</span>
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
      <Dialog open={newKey !== null} onClose={() => setNewKey(null)} title={`New key for ${device.name}`} size="lg">
        {newKey && <KeyReveal device={newKey} />}
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate(device.id, { onSuccess: () => setConfirmDelete(false) })}
        loading={remove.isPending}
        title={`Remove ${device.name}?`}
        description="Its key stops working immediately and all of its readings are deleted."
        confirmLabel="Remove station"
      />
    </li>
  )
}

export function SensorsSection({ field }: { field: Field }) {
  const devices = useDevices(field.id)
  const [since] = useState(sevenDaysAgo)
  const hasDevices = (devices.data?.length ?? 0) > 0
  const telemetry = useTelemetry(field.id, since, hasDevices)
  const register = useRegisterDevice(field.id)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Home field station')
  const [created, setCreated] = useState<DeviceWithKey | null>(null)

  const close = () => {
    setOpen(false)
    setCreated(null)
    register.reset()
  }

  return (
    <Card>
      <CardHeader
        title="Field sensors"
        description="Live readings from sensor stations on this field"
        action={
          !DEMO_MODE && (
            <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setOpen(true)}>
              Add station
            </Button>
          )
        }
      />
      <CardBody className="space-y-6">
        {DEMO_MODE ? (
          <Alert tone="info">Sensor stations need the full AgroAI server, so they aren't available in this browser demo.</Alert>
        ) : devices.isPending ? (
          <LoadingBlock label="Loading sensors" />
        ) : !hasDevices ? (
          <EmptyState
            icon={<Cpu />}
            title="No sensor stations yet"
            description="A low-cost ESP32 station measures air temperature, humidity and soil moisture, and reports here every 15 minutes."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={<Plus />} onClick={() => setOpen(true)}>
                  Add station
                </Button>
                <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center px-3 text-sm font-semibold text-fg-muted hover:text-fg">
                  Build guide
                </a>
              </div>
            }
          />
        ) : (
          <>
            <ul className="space-y-3">
              {(devices.data ?? []).map((d) => (
                <DeviceRow key={d.id} device={d} fieldId={field.id} />
              ))}
            </ul>
            {telemetry.data && telemetry.data.length > 0 ? (
              <TelemetryChart readings={telemetry.data} />
            ) : (
              <p className="text-center text-sm text-fg-subtle">No readings in the last 7 days.</p>
            )}
          </>
        )}
      </CardBody>

      <Dialog open={open} onClose={close} title={created ? 'Station registered' : 'Add a sensor station'} size="lg">
        {created ? (
          <KeyReveal device={created} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) register.mutate(name.trim(), { onSuccess: setCreated })
            }}
          >
            {register.error && <Alert tone="danger">{register.error.message}</Alert>}
            <FormField label="Station name" hint="For example where it is placed: “North corner”.">
              {({ id, describedBy }) => (
                <Input id={id} value={name} maxLength={80} aria-describedby={describedBy} onChange={(e) => setName(e.target.value)} />
              )}
            </FormField>
            <Button type="submit" loading={register.isPending} disabled={!name.trim()}>
              Register and get key
            </Button>
          </form>
        )}
      </Dialog>
    </Card>
  )
}
