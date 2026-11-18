import { clsx } from 'clsx'
import { CalendarDays, Check, MoreHorizontal, Sprout, Trash2, Wheat, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { formatDate, formatNumber } from '@/lib/format'
import { useDeleteCycle, useUpdateCycle } from '@/lib/queries'
import type { CropCycle } from '@/lib/types'
import { Button } from './ui/Button'
import { ConfirmDialog, Dialog } from './ui/Dialog'
import { Alert, Badge, ProgressBar } from './ui/Feedback'
import { FormField, Input } from './ui/Form'
import { todayIso } from '@/lib/format'

const STATUS = {
  active: { label: 'Growing', tone: 'brand' },
  harvested: { label: 'Harvested', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
} as const

export function CycleStages({ cycle }: { cycle: CropCycle }) {
  if (!cycle.progress) return null
  return (
    <ol className="relative mt-4 space-y-4 border-l-2 border-line pl-5">
      {cycle.progress.stages.map((stage) => (
        <li key={stage.name} className="relative">
          <span
            className={clsx(
              'absolute top-0.5 -left-[27px] grid size-4 place-items-center rounded-full border-2',
              stage.status === 'completed' && 'border-brand bg-brand text-brand-fg',
              stage.status === 'current' && 'border-brand bg-surface',
              stage.status === 'upcoming' && 'border-line-strong bg-surface',
            )}
            aria-hidden
          >
            {stage.status === 'completed' && <Check className="size-2.5" strokeWidth={4} />}
            {stage.status === 'current' && <span className="size-1.5 rounded-full bg-brand" />}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p
              className={clsx(
                'text-sm font-medium',
                stage.status === 'upcoming' ? 'text-fg-subtle' : 'text-fg',
              )}
            >
              {stage.name}
              {stage.status === 'current' && (
                <Badge tone="brand" className="ml-2 align-middle">
                  Now
                </Badge>
              )}
            </p>
            <span className="text-xs text-fg-subtle tabular-nums">
              Day {stage.start_day}–{stage.end_day}
            </span>
          </div>
          {stage.status === 'current' && (
            <p className="mt-1 text-sm text-fg-muted">{stage.guidance}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

function HarvestDialog({ cycle, open, onClose }: { cycle: CropCycle; open: boolean; onClose: () => void }) {
  const update = useUpdateCycle()
  const [date, setDate] = useState(todayIso())
  const [yieldKg, setYieldKg] = useState('')

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Record ${cycle.crop_name.toLowerCase()} harvest`}
      description={`${cycle.field_name}, planted ${formatDate(cycle.planted_on)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: cycle.id,
                  status: 'harvested',
                  harvested_on: date,
                  yield_kg: yieldKg ? Number(yieldKg) : null,
                },
                { onSuccess: onClose },
              )
            }
          >
            Save harvest
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Harvest date">
          {({ id }) => (
            <Input
              id={id}
              type="date"
              value={date}
              min={cycle.planted_on}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Yield" suffix="kg" hint="Optional">
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="number"
              min={0}
              inputMode="decimal"
              value={yieldKg}
              aria-describedby={describedBy}
              onChange={(e) => setYieldKg(e.target.value)}
            />
          )}
        </FormField>
      </div>
      {update.error && (
        <Alert tone="danger" className="mt-4">
          {update.error.message}
        </Alert>
      )}
    </Dialog>
  )
}

export function CycleCard({ cycle, showField = false }: { cycle: CropCycle; showField?: boolean }) {
  const [harvestOpen, setHarvestOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const update = useUpdateCycle()
  const remove = useDeleteCycle()
  const status = STATUS[cycle.status]
  const progress = cycle.progress

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            {cycle.status === 'active' ? <Sprout className="size-5" /> : <Wheat className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-medium">{cycle.crop_name}</p>
            <p className="truncate text-sm text-fg-subtle">
              {showField ? (
                <Link to={`/app/fields/${cycle.field_id}`} className="hover:underline">
                  {cycle.field_name}
                </Link>
              ) : (
                `Planted ${formatDate(cycle.planted_on)}`
              )}
            </p>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <button
            type="button"
            className="rounded-md p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg"
            aria-label="Crop cycle actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="size-5" />
          </button>
          {menuOpen && (
            <div
              className="absolute top-8 right-0 z-10 w-48 rounded-lg border border-line bg-surface p-1 shadow-pop"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {cycle.status === 'active' && (
                <>
                  <MenuItem
                    icon={<Wheat />}
                    onClick={() => {
                      setMenuOpen(false)
                      setHarvestOpen(true)
                    }}
                  >
                    Record harvest
                  </MenuItem>
                  <MenuItem
                    icon={<XCircle />}
                    onClick={() => {
                      setMenuOpen(false)
                      update.mutate({ id: cycle.id, status: 'failed' })
                    }}
                  >
                    Mark as failed
                  </MenuItem>
                </>
              )}
              <MenuItem
                icon={<Trash2 />}
                danger
                onClick={() => {
                  setMenuOpen(false)
                  setDeleteOpen(true)
                }}
              >
                Delete
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {progress ? (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="font-medium">{progress.current_stage}</span>
            <span className="text-fg-subtle tabular-nums">
              Day {progress.day} of {progress.total_days}
            </span>
          </div>
          <ProgressBar value={progress.percent} label={`${cycle.crop_name} growth progress`} />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
            <CalendarDays className="size-3.5" aria-hidden />
            {progress.days_remaining > 0
              ? `Harvest expected ${formatDate(cycle.expected_harvest_on)} (${progress.days_remaining} days)`
              : `Harvest was due ${formatDate(cycle.expected_harvest_on)}`}
          </p>
          {!showField && <CycleStages cycle={cycle} />}
        </div>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">
          {cycle.status === 'harvested'
            ? `Harvested ${cycle.harvested_on ? formatDate(cycle.harvested_on) : ''}${
                cycle.yield_kg !== null ? ` · ${formatNumber(cycle.yield_kg)} kg` : ''
              }`
            : `Planted ${formatDate(cycle.planted_on)}`}
        </p>
      )}

      <HarvestDialog cycle={cycle} open={harvestOpen} onClose={() => setHarvestOpen(false)} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate(cycle.id, { onSuccess: () => setDeleteOpen(false) })}
        loading={remove.isPending}
        title="Delete crop cycle?"
        description={`This permanently removes the ${cycle.crop_name.toLowerCase()} planting record.`}
        confirmLabel="Delete"
      />
    </div>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-muted [&_svg]:size-4',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
