import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Check, Copy, MessageCircle, Unlink } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Alert, Badge } from '@/components/ui/Feedback'
import { api, DEMO_MODE } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { WhatsAppLinkCode } from '@/lib/types'

const KIND_LABELS: Record<string, string> = {
  stage: 'Growth stage',
  harvest_soon: 'Harvest soon',
  harvest_due: 'Harvest due',
  frost: 'Frost',
  heavy_rain: 'Heavy rain',
  station_silent: 'Station',
}

const COMMANDS: [string, string][] = [
  ['STATUS', 'your plantings and their stage'],
  ['SOIL 1 80 45 20 6.2', 'record a soil test (N, P, K, pH) for field 1'],
  ['PLANTED maize 1', 'start tracking a planting today'],
  ['HARVESTED 1 350', 'record planting 1 harvested, 350 kg'],
  ['RECOMMEND 1', 'best crops for field 1'],
  ['WEATHER 1', '3-day forecast'],
  ['HELP', 'all commands'],
]

export function WhatsAppCard() {
  const client = useQueryClient()
  const [code, setCode] = useState<WhatsAppLinkCode | null>(null)
  const status = useQuery({
    queryKey: ['whatsapp'],
    queryFn: api.whatsapp,
    enabled: !DEMO_MODE,
    // While a link code is waiting, check every few seconds whether it has been sent.
    refetchInterval: (query) => (code && !query.state.data?.linked_number ? 4000 : false),
  })
  const [copied, setCopied] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const refresh = () => client.invalidateQueries({ queryKey: ['whatsapp'] })

  const link = useMutation({ mutationFn: api.linkWhatsApp, onSuccess: (c) => setCode(c) })
  const alerts = useMutation({ mutationFn: api.updateWhatsApp, onSuccess: (s) => client.setQueryData(['whatsapp'], s) })
  const unlink = useMutation({
    mutationFn: api.unlinkWhatsApp,
    onSuccess: () => {
      setConfirmUnlink(false)
      setCode(null)
      return refresh()
    },
  })

  const header = (
    <CardHeader
      title="WhatsApp"
      description="Get growth-stage, harvest and frost alerts, and use AgroAI by chatting, without opening the website."
    />
  )

  if (DEMO_MODE) {
    return (
      <Card>
        {header}
        <CardBody>
          <p className="text-sm text-fg-muted">WhatsApp alerts work on the live system, not in this browser demo.</p>
        </CardBody>
      </Card>
    )
  }
  if (!status.data) {
    return (
      <Card>
        {header}
        <CardBody>
          {status.isError ? <Alert tone="danger">{status.error.message}</Alert> : <p className="text-sm text-fg-subtle">Loading…</p>}
        </CardBody>
      </Card>
    )
  }

  const s = status.data
  if (!s.enabled) {
    return (
      <Card>
        {header}
        <CardBody>
          <p className="text-sm text-fg-muted">
            WhatsApp is not set up on this AgroAI server yet. The administrator can follow the WhatsApp guide in the
            project's documentation.
          </p>
        </CardBody>
      </Card>
    )
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the code is visible to copy by hand */
    }
  }

  return (
    <Card>
      {header}
      <CardBody className="space-y-5">
        {s.linked_number ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge tone="success">
                  <Check className="size-3" aria-hidden /> Linked
                </Badge>
                <span className="font-medium tabular-nums">{s.linked_number}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={s.alerts ? <BellOff /> : <Bell />}
                  loading={alerts.isPending}
                  onClick={() => alerts.mutate({ alerts: !s.alerts })}
                >
                  {s.alerts ? 'Pause alerts' : 'Turn alerts on'}
                </Button>
                <Button size="sm" variant="ghost" icon={<Unlink />} onClick={() => setConfirmUnlink(true)}>
                  Unlink
                </Button>
              </div>
            </div>
            <p className="text-sm text-fg-muted">
              {s.alerts
                ? 'Alerts are on: one message a day at most, only when something new happens.'
                : 'Alerts are paused. You can still message the bot.'}{' '}
              Message <span className="font-medium text-fg tabular-nums">{s.bot_number ?? 'the AgroAI number'}</span> any time:
            </p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {COMMANDS.map(([cmd, what]) => (
                <li key={cmd}>
                  <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-semibold">{cmd}</code>{' '}
                  <span className="text-fg-muted">{what}</span>
                </li>
              ))}
            </ul>
          </>
        ) : code ? (
          <div className="space-y-3">
            <p className="text-sm">
              From the phone you want to link, send this message to{' '}
              <span className="font-medium tabular-nums">{code.bot_number ?? 'the AgroAI WhatsApp number'}</span>:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-surface-muted px-4 py-2 font-mono text-xl font-semibold tracking-widest">
                {code.message}
              </code>
              <Button size="sm" variant="ghost" icon={copied ? <Check /> : <Copy />} onClick={() => copy(code.message)}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {code.whatsapp_url && (
              <a
                href={code.whatsapp_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-semibold text-[#0b2e17] hover:brightness-95"
              >
                <MessageCircle className="size-4" aria-hidden /> Open WhatsApp with the message ready
              </a>
            )}
            <p className="text-xs text-fg-subtle">
              The code works once and expires at {formatDateTime(code.expires_at)}. This page updates as soon as
              it arrives (the first message can take a minute while the server wakes up).
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<MessageCircle />} loading={link.isPending} onClick={() => link.mutate()}>
              Link WhatsApp
            </Button>
            <span className="text-sm text-fg-muted">You will send a short code from your phone to prove it is yours.</span>
          </div>
        )}
        {link.error && <Alert tone="danger">{link.error.message}</Alert>}

        {s.recent.length > 0 && (
          <div className="border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold">Recent alerts</h3>
            <ul className="space-y-2">
              {s.recent.map((n) => (
                <li key={`${n.created_at}-${n.kind}-${n.message.slice(0, 20)}`} className="text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                    <Badge tone={n.status === 'sent' ? 'neutral' : 'danger'}>{KIND_LABELS[n.kind] ?? n.kind}</Badge>
                    {formatDateTime(n.created_at)}
                    {n.status === 'failed' && ' · not delivered, will retry'}
                  </div>
                  <p className="mt-0.5 text-fg-muted">{n.message.replace(/\*/g, '')}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink WhatsApp?"
        description="You will stop getting alerts and the bot will no longer recognise this number."
        confirmLabel="Unlink"
        loading={unlink.isPending}
        onClose={() => setConfirmUnlink(false)}
        onConfirm={() => unlink.mutate()}
      />
    </Card>
  )
}
