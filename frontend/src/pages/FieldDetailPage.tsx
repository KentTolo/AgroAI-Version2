import {
  Activity,
  ChevronLeft,
  FlaskConical,
  Pencil,
  Plus,
  Sparkles,
  Sprout,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ConditionsForm } from '@/components/ConditionsForm'
import { CycleCard } from '@/components/CycleCard'
import { FieldForm } from '@/components/FieldForm'
import { FieldMap } from '@/components/FieldMap'
import { toMapPoints } from '@/lib/map'
import { ReadingsChart } from '@/components/ReadingsChart'
import { ConditionTiles } from '@/components/Results'
import { confidenceLabel } from '@/lib/labels'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { ApiError } from '@/lib/api'
import { formatDateTime, formatNumber, formatPercent, formatRelative, todayIso } from '@/lib/format'
import { pickConditions } from '@/lib/parameters'
import {
  useAddReading,
  useClearReadings,
  useCrops,
  useCycles,
  useDeleteField,
  useField,
  useReadings,
  useRecommend,
  useRecommendations,
  useSimulateReadings,
  useStartCycle,
  useUpdateField,
} from '@/lib/queries'
import type { Field } from '@/lib/types'
import { NotFoundPage } from './ErrorPages'

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All', days: null },
] as const

function sinceIso(days: number | null): string | undefined {
  if (days === null) return undefined
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function ReadingsSection({ field }: { field: Field }) {
  const [range, setRange] = useState<number | null>(30)
  // Round to the hour so the query key is stable between renders.
  const since = useMemo(() => {
    const iso = sinceIso(range)
    return iso ? `${iso.slice(0, 13)}:00:00Z` : undefined
  }, [range])
  const readings = useReadings(field.id, since)
  const [addOpen, setAddOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const add = useAddReading(field.id)
  const simulate = useSimulateReadings(field.id)
  const clear = useClearReadings(field.id)

  const items = readings.data?.items ?? []

  return (
    <Card>
      <CardHeader
        title="Conditions over time"
        description={
          field.latest_reading
            ? `Last reading ${formatRelative(field.latest_reading.recorded_at)}`
            : 'No readings recorded yet'
        }
        action={
          <>
            <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => setAddOpen(true)}>
              Add reading
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Wand2 />}
              loading={simulate.isPending}
              onClick={() => simulate.mutate(30)}
              title="Generate 30 days of synthetic sensor data"
            >
              Simulate sensors
            </Button>
          </>
        }
      />
      <CardBody>
        {simulate.error && <Alert tone="danger" className="mb-4">{simulate.error.message}</Alert>}
        {field.latest_reading ? (
          <>
            <ConditionTiles conditions={pickConditions(field.latest_reading)} />
            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Time range">
                {RANGES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setRange(r.days)}
                    aria-pressed={range === r.days}
                    className={
                      range === r.days
                        ? 'rounded-md bg-surface-muted px-3 py-1 text-xs font-medium text-fg'
                        : 'rounded-md px-3 py-1 text-xs text-fg-subtle hover:text-fg'
                    }
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                className="text-xs text-fg-subtle hover:text-danger"
              >
                Clear all readings
              </button>
            </div>
            {readings.isPending ? (
              <LoadingBlock label="Loading readings" />
            ) : items.length === 0 ? (
              <p className="py-12 text-center text-sm text-fg-subtle">No readings in this period.</p>
            ) : (
              <ReadingsChart readings={items} />
            )}
          </>
        ) : (
          <EmptyState
            icon={<Activity />}
            title="No conditions recorded"
            description="Enter a soil test and weather reading, or simulate a month of sensor data to explore the app."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={<Plus />} onClick={() => setAddOpen(true)}>
                  Add reading
                </Button>
                <Button variant="secondary" icon={<Wand2 />} loading={simulate.isPending} onClick={() => simulate.mutate(30)}>
                  Simulate 30 days
                </Button>
              </div>
            }
          />
        )}
      </CardBody>

      <Dialog
        open={addOpen}
        onClose={() => {
          add.reset()
          setAddOpen(false)
        }}
        title="Add a reading"
        description="Use values from a soil test and local weather records."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-reading" loading={add.isPending}>
              Save reading
            </Button>
          </>
        }
      >
        {add.error && <Alert tone="danger" className="mb-4">{add.error.message}</Alert>}
        <ConditionsForm
          id="add-reading"
          defaultValues={field.latest_reading ? pickConditions(field.latest_reading) : undefined}
          onSubmit={(values) => add.mutate(values, { onSuccess: () => setAddOpen(false) })}
        />
      </Dialog>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => setClearOpen(false) })}
        loading={clear.isPending}
        title="Clear all readings?"
        description={`Every sensor reading for ${field.name} will be permanently deleted.`}
        confirmLabel="Clear readings"
      />
    </Card>
  )
}

function StartCycleDialog({ field, open, onClose }: { field: Field; open: boolean; onClose: () => void }) {
  const crops = useCrops()
  const start = useStartCycle(field.id)
  const [crop, setCrop] = useState('')
  const [planted, setPlanted] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const selected = crops.data?.find((c) => c.slug === crop)

  const close = () => {
    start.reset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Start a planting"
      description={`Track a crop on ${field.name} from sowing to harvest.`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            icon={<Sprout />}
            disabled={!crop}
            loading={start.isPending}
            onClick={() =>
              start.mutate(
                { crop, planted_on: planted, notes: notes.trim() || null },
                {
                  onSuccess: () => {
                    setCrop('')
                    setNotes('')
                    close()
                  },
                },
              )
            }
          >
            Start tracking
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {start.error && <Alert tone="danger">{start.error.message}</Alert>}
        <FormField label="Crop" hint={selected ? `Typically ready about ${selected.days_to_harvest} days after planting.` : undefined}>
          {({ id, describedBy }) => (
            <Select id={id} value={crop} aria-describedby={describedBy} onChange={(e) => setCrop(e.target.value)}>
              <option value="">Choose a crop…</option>
              {crops.data?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Planting date">
          {({ id }) => (
            <Input id={id} type="date" value={planted} max={todayIso()} onChange={(e) => setPlanted(e.target.value)} />
          )}
        </FormField>
        <FormField label="Notes" hint="Optional, e.g. variety or seed source">
          {({ id, describedBy }) => (
            <Textarea id={id} rows={2} aria-describedby={describedBy} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </FormField>
      </div>
    </Dialog>
  )
}

function CyclesSection({ field }: { field: Field }) {
  const cycles = useCycles({ field_id: field.id })
  const [open, setOpen] = useState(false)
  const items = cycles.data?.items ?? []
  const active = items.filter((c) => c.status === 'active')
  const past = items.filter((c) => c.status !== 'active')

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-medium">Plantings</h2>
        <Button size="sm" icon={<Sprout />} onClick={() => setOpen(true)}>
          Start planting
        </Button>
      </div>
      {cycles.isPending ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Sprout />}
            title="No plantings tracked"
            description="Start a planting to see growth stages, guidance and the expected harvest date."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {active.map((c) => (
                <CycleCard key={c.id} cycle={c} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-fg-subtle">Previous seasons</h3>
              <div className="grid gap-4 lg:grid-cols-3">
                {past.map((c) => (
                  <CycleCard key={c.id} cycle={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <StartCycleDialog field={field} open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

function FieldRecommendations({ field }: { field: Field }) {
  const recs = useRecommendations({ field_id: field.id, limit: 5 })
  const items = recs.data?.items ?? []
  return (
    <Card>
      <CardHeader title="Recommendations for this field" />
      <CardBody className="pt-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-subtle">
            {field.latest_reading
              ? 'Use “Recommend crops” to rank crops for the latest reading.'
              : 'Add a reading first, then ask for a recommendation.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((rec) => {
              const top = rec.predictions[0]
              return (
                <li key={rec.id}>
                  <Link
                    to={`/app/recommend?id=${rec.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:text-brand"
                  >
                    <span>
                      <span className="font-medium">{top?.name}</span>
                      <span className="ml-2 text-xs text-fg-subtle">{formatDateTime(rec.created_at)}</span>
                    </span>
                    {top && <Badge tone={confidenceLabel(top.probability).tone}>{formatPercent(top.probability)}</Badge>}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

export default function FieldDetailPage() {
  const { fieldId = '' } = useParams()
  const navigate = useNavigate()
  const field = useField(fieldId)
  const update = useUpdateField(fieldId)
  const remove = useDeleteField()
  const recommend = useRecommend()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (field.isPending) return <LoadingBlock label="Loading field" />
  if (field.isError) {
    if (field.error instanceof ApiError && field.error.status === 404) return <NotFoundPage inline />
    return <Alert tone="danger" title="Could not load this field">{field.error.message}</Alert>
  }

  const f = field.data
  const details = [
    f.area_hectares !== null && `${formatNumber(f.area_hectares, 2)} ha`,
    f.soil_type,
    f.latitude !== null && f.longitude !== null && `${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)}`,
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/app/fields" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" aria-hidden /> Fields
          </Link>
        }
        title={f.name}
        description={details.join(' · ') || 'No details yet'}
        actions={
          <>
            <Button variant="ghost" icon={<Pencil />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="ghost" icon={<Trash2 />} onClick={() => setDeleteOpen(true)} aria-label="Delete field" />
            <Button
              icon={<Sparkles />}
              disabled={!f.latest_reading}
              loading={recommend.isPending}
              title={f.latest_reading ? undefined : 'Add a reading first'}
              onClick={() =>
                recommend.mutate(
                  { field_id: f.id, top_k: 5 },
                  { onSuccess: (rec) => navigate(`/app/recommend?id=${rec.id}`) },
                )
              }
            >
              Recommend crops
            </Button>
          </>
        }
      />

      {recommend.error && <Alert tone="danger" className="mb-6">{recommend.error.message}</Alert>}
      {f.notes && (
        <p className="-mt-2 mb-6 flex gap-2 text-sm text-fg-muted">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          {f.notes}
        </p>
      )}

      <div className="space-y-8">
        <ReadingsSection field={f} />
        <CyclesSection field={f} />
        <div className="grid gap-6 lg:grid-cols-2">
          <FieldRecommendations field={f} />
          {f.latitude !== null && (
            <Card>
              <CardHeader title="Location" />
              <CardBody>
                <FieldMap points={toMapPoints([f])} className="h-56" />
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={editOpen}
        onClose={() => {
          update.reset()
          setEditOpen(false)
        }}
        title="Edit field"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-field" loading={update.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {update.error && <Alert tone="danger" className="mb-4">{update.error.message}</Alert>}
        <FieldForm
          id="edit-field"
          field={f}
          onSubmit={(values) => update.mutate(values, { onSuccess: () => setEditOpen(false) })}
        />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate(f.id, { onSuccess: () => navigate('/app/fields', { replace: true }) })}
        loading={remove.isPending}
        title={`Delete ${f.name}?`}
        description="This permanently deletes the field with all of its readings and plantings. Past recommendations stay in your history."
        confirmLabel="Delete field"
      />
    </>
  )
}
