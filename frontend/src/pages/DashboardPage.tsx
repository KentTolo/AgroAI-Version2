import { Activity, ArrowRight, Map, Plus, Sparkles, Sprout } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { CycleCard } from '@/components/CycleCard'
import { FieldMap } from '@/components/FieldMap'
import { toMapPoints } from '@/lib/map'
import { confidenceLabel } from '@/lib/labels'
import { ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback'
import { PageHeader, StatCard } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { formatPercent, formatRelative } from '@/lib/format'
import { useDashboard, useFields } from '@/lib/queries'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const dashboard = useDashboard()
  const fields = useFields()

  const firstName = user?.full_name.split(' ')[0] ?? ''

  if (dashboard.isPending || fields.isPending) return <LoadingBlock label="Loading your farm" />
  if (dashboard.isError) return <Alert tone="danger" title="Could not load the dashboard">{dashboard.error.message}</Alert>
  if (fields.isError) return <Alert tone="danger" title="Could not load fields">{fields.error.message}</Alert>

  const data = dashboard.data
  const points = toMapPoints(fields.data.items)

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description="Here is what is happening across your fields."
        actions={
          <>
            <ButtonLink to="/app/fields?new=1" variant="secondary" icon={<Plus />}>
              Add field
            </ButtonLink>
            <ButtonLink to="/app/recommend" icon={<Sparkles />}>
              New recommendation
            </ButtonLink>
          </>
        }
      />

      {data.field_count === 0 ? (
        <Card>
          <EmptyState
            icon={<Map />}
            title="Start by adding your first field"
            description="Fields hold your soil and weather readings and the crops you plant, so recommendations and tracking can build on them."
            action={<ButtonLink to="/app/fields?new=1" icon={<Plus />}>Add a field</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Fields" value={data.field_count} icon={<Map />} />
            <StatCard label="Growing now" value={data.active_cycle_count} icon={<Sprout />} />
            <StatCard label="Recommendations" value={data.recommendation_count} icon={<Sparkles />} />
            <StatCard label="Sensor readings" value={data.reading_count.toLocaleString()} icon={<Activity />} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader
                title="Your fields"
                description={`${points.length} of ${data.field_count} mapped`}
                action={
                  <Link to="/app/fields" className="text-sm font-medium text-brand hover:underline">
                    View all
                  </Link>
                }
              />
              <CardBody>
                <FieldMap
                  points={points}
                  className="h-72"
                  onSelect={(id) => navigate(`/app/fields/${id}`)}
                />
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent recommendations"
                action={
                  <Link to="/app/history" className="text-sm font-medium text-brand hover:underline">
                    History
                  </Link>
                }
              />
              <CardBody className="pt-3">
                {data.recent_recommendations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-fg-subtle">
                    No recommendations yet.{' '}
                    <Link to="/app/recommend" className="text-brand hover:underline">
                      Get your first one
                    </Link>
                    .
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recent_recommendations.map((rec) => {
                      const top = rec.predictions[0]
                      const confidence = top ? confidenceLabel(top.probability) : null
                      return (
                        <li key={rec.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{top?.name ?? rec.recommended_crop}</p>
                            <p className="text-xs text-fg-subtle">{formatRelative(rec.created_at)}</p>
                          </div>
                          {top && confidence && (
                            <Badge tone={confidence.tone}>{formatPercent(top.probability)}</Badge>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-medium">Growing now</h2>
              {data.active_cycles.length > 0 && (
                <Link to="/app/fields" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                  Manage plantings <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
            {data.active_cycles.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Sprout />}
                  title="Nothing planted yet"
                  description="Open a field and start a crop cycle to follow it from sowing to harvest."
                />
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {data.active_cycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} showField />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
