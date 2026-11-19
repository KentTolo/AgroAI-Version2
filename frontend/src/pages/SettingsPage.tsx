import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Alert } from '@/components/ui/Feedback'
import { FormField, Input } from '@/components/ui/Form'
import { PageHeader } from '@/components/ui/Page'
import { WhatsAppCard } from '@/components/WhatsAppCard'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { keys, useModelInfo } from '@/lib/queries'

function ProfileCard() {
  const { user } = useAuth()
  const client = useQueryClient()
  const [name, setName] = useState(user?.full_name ?? '')
  const update = useMutation({
    mutationFn: api.updateMe,
    onSuccess: (updated) => client.setQueryData(keys.me, updated),
  })

  return (
    <Card>
      <CardHeader title="Profile" description={user ? `Member since ${formatDate(user.created_at)}` : undefined} />
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) update.mutate({ full_name: name.trim() })
          }}
        >
          {update.isSuccess && <Alert tone="success">Profile saved.</Alert>}
          {update.error && <Alert tone="danger">{update.error.message}</Alert>}
          <FormField label="Full name">
            {({ id }) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <FormField label="Email" hint="Your email is used to sign in and can't be changed here.">
            {({ id, describedBy }) => <Input id={id} value={user?.email ?? ''} disabled aria-describedby={describedBy} />}
          </FormField>
          <Button type="submit" loading={update.isPending} disabled={!name.trim() || name.trim() === user?.full_name}>
            Save profile
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(72)
      .refine((v) => !/^\d+$/.test(v) && !/^[a-zA-Z]+$/.test(v), 'Mix letters with numbers or symbols'),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type PasswordValues = z.infer<typeof passwordSchema>

function PasswordCard() {
  const change = useMutation({ mutationFn: api.changePassword })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) })

  return (
    <Card>
      <CardHeader title="Password" />
      <CardBody>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(({ current_password, new_password }) =>
            change.mutate({ current_password, new_password }, { onSuccess: () => reset() }),
          )}
        >
          {change.isSuccess && <Alert tone="success">Password changed.</Alert>}
          {change.error && <Alert tone="danger">{change.error.message}</Alert>}
          <FormField label="Current password" error={errors.current_password?.message}>
            {({ id, invalid }) => (
              <Input id={id} type="password" autoComplete="current-password" invalid={invalid} {...register('current_password')} />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="New password" error={errors.new_password?.message}>
              {({ id, invalid }) => (
                <Input id={id} type="password" autoComplete="new-password" invalid={invalid} {...register('new_password')} />
              )}
            </FormField>
            <FormField label="Confirm new password" error={errors.confirm?.message}>
              {({ id, invalid }) => (
                <Input id={id} type="password" autoComplete="new-password" invalid={invalid} {...register('confirm')} />
              )}
            </FormField>
          </div>
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function DangerZone() {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const remove = useMutation({ mutationFn: api.deleteMe, onSuccess: logout })
  return (
    <Card className="border-danger/40">
      <CardHeader
        title="Delete account"
        description="Permanently delete your account, fields, readings, plantings and history."
      />
      <CardBody>
        {remove.error && <Alert tone="danger" className="mb-4">{remove.error.message}</Alert>}
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
        <ConfirmDialog
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => remove.mutate()}
          loading={remove.isPending}
          title="Delete your account?"
          description="This cannot be undone. All of your data will be removed immediately."
          confirmLabel="Delete account"
        />
      </CardBody>
    </Card>
  )
}

function AboutModel() {
  const model = useModelInfo()
  if (!model.data) return null
  const test = model.data.metrics.test
  return (
    <Card>
      <CardHeader title="About the model" />
      <CardBody>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-fg-subtle">Version</dt>
            <dd className="font-mono text-xs break-all">{model.data.version}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Algorithm</dt>
            <dd>{model.data.algorithm.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Trained</dt>
            <dd>{formatDate(model.data.trained_at)}</dd>
          </div>
          {test?.accuracy !== undefined && (
            <div>
              <dt className="text-fg-subtle">Held-out accuracy</dt>
              <dd>{(test.accuracy * 100).toFixed(1)}%</dd>
            </div>
          )}
        </dl>
      </CardBody>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, WhatsApp alerts and account." />
      <div className="grid max-w-3xl gap-6">
        <ProfileCard />
        <WhatsAppCard />
        <PasswordCard />
        <AboutModel />
        <DangerZone />
      </div>
    </>
  )
}
