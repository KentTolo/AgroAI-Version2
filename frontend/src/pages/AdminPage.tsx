import { useQuery } from '@tanstack/react-query'
import { Activity, Cpu, Map, Sparkles, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/auth/useAuth'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Alert, Badge } from '@/components/ui/Feedback'
import { PageHeader, StatCard } from '@/components/ui/Page'
import { LoadingBlock } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatDate, formatDateTime, formatPercent, formatRelative, formatShortDate, parseDate } from '@/lib/format'
import { NotFoundPage } from './ErrorPages'

export default function AdminPage() {
  const { user } = useAuth()
  const isAdmin = Boolean(user?.is_admin)
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: api.adminOverview, enabled: isAdmin, refetchInterval: 60_000 })
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: api.adminUsers, enabled: isAdmin, refetchInterval: 60_000 })

  if (!isAdmin) return <NotFoundPage inline />

  return (
    <>
      <PageHeader title="Admin" description="Live usage across the whole AgroAI system. Updates every minute." />
      {overview.isPending ? (
        <LoadingBlock label="Loading overview" />
      ) : overview.isError ? (
        <Alert tone="danger">{overview.error.message}</Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Users" value={overview.data.users} icon={<Users />} hint={`${overview.data.users_active_7d} signed in this week`} />
            <StatCard label="Fields" value={overview.data.fields} icon={<Map />} hint={`${overview.data.mapped_fields} with weather feed`} />
            <StatCard label="Sensor stations" value={overview.data.devices} icon={<Cpu />} hint={`${overview.data.devices_online} online · ${overview.data.telemetry_24h} readings today`} />
            <StatCard label="Recommendations" value={overview.data.recommendations} icon={<Sparkles />} hint={`${overview.data.active_cycles} crops growing · ${overview.data.soil_readings} soil readings`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader title="Sign-ups" description="Last 30 days" />
              <CardBody>
                <div className="h-48" role="img" aria-label="Sign-ups per day over the last 30 days">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.data.signups.map((d) => ({ t: parseDate(d.day).getTime(), count: d.count }))} margin={{ top: 4, right: 0, bottom: 0, left: -24 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="t" tickFormatter={(t: number) => formatShortDate(t)} tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }}
                        labelFormatter={(t) => formatShortDate(Number(t))}
                        formatter={(v) => [v, 'Sign-ups']}
                      />
                      <Bar dataKey="count" fill="var(--brand)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
            <Card className="lg:col-span-3">
              <CardHeader title="Latest recommendations" />
              <CardBody className="pt-3">
                {overview.data.recent_recommendations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-fg-subtle">None yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {overview.data.recent_recommendations.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {r.crop} <span className="font-normal text-fg-subtle">· {formatPercent(r.probability)}</span>
                          </p>
                          <p className="truncate text-xs text-fg-subtle">
                            {r.user_email}
                            {r.field_name && ` · ${r.field_name}`}
                            {r.climate_basis && ' · weather climate'}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-fg-subtle">{formatRelative(r.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Users" description={users.data ? `${users.data.length} registered` : undefined} />
        <CardBody className="p-0 pt-4">
          {users.isPending ? (
            <LoadingBlock />
          ) : users.isError ? (
            <Alert tone="danger" className="m-5">{users.error.message}</Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-y border-line bg-surface-muted text-xs text-fg-subtle uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">User</th>
                    <th scope="col" className="px-5 py-3 font-medium">Joined</th>
                    <th scope="col" className="px-5 py-3 font-medium">Last sign-in</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Fields</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Soil readings</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Stations</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Recs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {u.full_name} {u.is_admin && <Badge tone="brand" className="ml-1">Admin</Badge>}
                        </p>
                        <p className="text-xs text-fg-subtle">{u.email}</p>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-fg-muted">{formatDate(u.created_at.slice(0, 10))}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-fg-muted" title={u.last_login_at ? formatDateTime(u.last_login_at) : undefined}>
                        {u.last_login_at ? formatRelative(u.last_login_at) : 'Never'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{u.fields}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{u.soil_readings}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{u.devices}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{u.recommendations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-fg-subtle">
        <Activity className="size-3.5" aria-hidden />
        Admins are the accounts whose email is listed in the server's AGROAI_ADMIN_EMAILS setting.
      </p>
    </>
  )
}
