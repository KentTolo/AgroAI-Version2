import { ChevronLeft, ChevronRight, History, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { confidenceLabel } from '@/lib/labels'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { formatDateTime, formatPercent } from '@/lib/format'
import { useDeleteRecommendation, useFields, useRecommendations } from '@/lib/queries'

const PAGE_SIZE = 15

export default function HistoryPage() {
  const [offset, setOffset] = useState(0)
  const recs = useRecommendations({ limit: PAGE_SIZE, offset })
  const fields = useFields()
  const remove = useDeleteRecommendation()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const fieldName = (id: string | null) => fields.data?.items.find((f) => f.id === id)?.name
  const total = recs.data?.total ?? 0

  return (
    <>
      <PageHeader
        title="History"
        description="Every recommendation you've requested, with the conditions and model version used."
      />

      {recs.isPending ? (
        <LoadingBlock label="Loading history" />
      ) : recs.isError ? (
        <Alert tone="danger">{recs.error.message}</Alert>
      ) : total === 0 ? (
        <Card>
          <EmptyState
            icon={<History />}
            title="No recommendations yet"
            description="Results you request are saved here so you can compare seasons."
            action={<ButtonLink to="/app/recommend">Get a recommendation</ButtonLink>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs text-fg-subtle uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Date</th>
                  <th scope="col" className="px-5 py-3 font-medium">Field</th>
                  <th scope="col" className="px-5 py-3 font-medium">Top crop</th>
                  <th scope="col" className="px-5 py-3 font-medium">Alternatives</th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recs.data.items.map((rec) => {
                  const [top, ...rest] = rec.predictions
                  return (
                    <tr key={rec.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-3 whitespace-nowrap text-fg-muted">
                        <Link to={`/app/recommend?id=${rec.id}`} className="hover:text-brand hover:underline">
                          {formatDateTime(rec.created_at)}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-fg-muted">{fieldName(rec.field_id) ?? '—'}</td>
                      <td className="px-5 py-3">
                        {top && (
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{top.name}</span>
                            <Badge tone={confidenceLabel(top.probability).tone}>{formatPercent(top.probability)}</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-fg-subtle">
                        {rest.slice(0, 2).map((p) => p.name).join(', ') || '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDelete(rec.id)}
                          className="rounded-md p-1.5 text-fg-subtle hover:bg-danger-soft hover:text-danger"
                          aria-label="Delete recommendation"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-fg-subtle">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<ChevronLeft />}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() =>
          pendingDelete &&
          remove.mutate(pendingDelete, {
            onSuccess: () => {
              setPendingDelete(null)
              if (recs.data && recs.data.items.length === 1 && offset > 0) setOffset(offset - PAGE_SIZE)
            },
          })
        }
        loading={remove.isPending}
        title="Delete this recommendation?"
        description="It will be removed from your history permanently."
        confirmLabel="Delete"
      />
    </>
  )
}
