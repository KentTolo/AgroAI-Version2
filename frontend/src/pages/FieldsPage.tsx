import { Activity, Layers, Map, MapPin, Plus, Sprout } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FieldForm } from '@/components/FieldForm'
import { FieldMap } from '@/components/FieldMap'
import { toMapPoints } from '@/lib/map'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { formatNumber, formatRelative } from '@/lib/format'
import { useCreateField, useFields } from '@/lib/queries'
import type { Field } from '@/lib/types'

function FieldCard({ field }: { field: Field }) {
  const reading = field.latest_reading
  return (
    <Link
      to={`/app/fields/${field.id}`}
      className="group block rounded-xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold group-hover:text-brand">{field.name}</h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-fg-subtle">
            {field.area_hectares !== null && <span>{formatNumber(field.area_hectares, 2)} ha</span>}
            {field.soil_type && <span>{field.soil_type}</span>}
            {field.latitude === null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> Not mapped
              </span>
            )}
          </p>
        </div>
        {field.active_cycle_count > 0 && (
          <Badge tone="brand">
            <Sprout className="size-3" aria-hidden />
            {field.active_cycle_count} growing
          </Badge>
        )}
      </div>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        {reading ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-fg-muted">
            <span className="tabular-nums">
              {formatNumber(reading.temperature)}°C · pH {formatNumber(reading.ph)} · N {formatNumber(reading.nitrogen, 0)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
              <Activity className="size-3.5" aria-hidden />
              {formatRelative(reading.recorded_at)}
            </span>
          </div>
        ) : (
          <span className="text-fg-subtle">No readings yet</span>
        )}
      </div>
    </Link>
  )
}

export default function FieldsPage() {
  const fields = useFields()
  const create = useCreateField()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const dialogOpen = params.get('new') === '1'

  const closeDialog = () => {
    create.reset()
    setParams({}, { replace: true })
  }

  const items = fields.data?.items ?? []
  const points = toMapPoints(items)

  return (
    <>
      <PageHeader
        title="Fields"
        description="Each field keeps its own sensor history, crop plantings and recommendations."
        actions={
          <Button icon={<Plus />} onClick={() => setParams({ new: '1' })}>
            Add field
          </Button>
        }
      />

      {fields.isPending ? (
        <LoadingBlock label="Loading fields" />
      ) : fields.isError ? (
        <Alert tone="danger" title="Could not load fields">{fields.error.message}</Alert>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers />}
            title="No fields yet"
            description="Add a field to start recording conditions and planning what to grow."
            action={<Button icon={<Plus />} onClick={() => setParams({ new: '1' })}>Add your first field</Button>}
          />
        </Card>
      ) : (
        <>
          {points.length > 0 && (
            <Card className="mb-6">
              <CardBody>
                <FieldMap points={points} className="h-64" onSelect={(id) => navigate(`/app/fields/${id}`)} />
              </CardBody>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((field) => (
              <FieldCard key={field.id} field={field} />
            ))}
          </div>
        </>
      )}

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title="Add a field"
        description="Only the name is required. Location lets you see the field on the map."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" form="create-field" loading={create.isPending} icon={<Map />}>
              Save field
            </Button>
          </>
        }
      >
        {create.error && (
          <Alert tone="danger" className="mb-4">
            {create.error.message}
          </Alert>
        )}
        <FieldForm
          id="create-field"
          onSubmit={(values) =>
            create.mutate(values, {
              onSuccess: (field) => {
                setParams({}, { replace: true })
                navigate(`/app/fields/${field.id}`)
              },
            })
          }
        />
      </Dialog>
    </>
  )
}
