import { zodResolver } from '@hookform/resolvers/zod'
import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { useAuth } from '@/auth/useAuth'
import { DEMO_MODE } from '@/lib/api'
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/demo/credentials'
import { Logo } from '@/components/Logo'
import { Topography } from '@/components/Topography'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { FormField, Input } from '@/components/ui/Form'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  useDocumentTitle(title)
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="self-start">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-4xl font-medium tracking-tight">{title}</h1>
          <p className="mt-3 text-sm text-fg-muted">{subtitle}</p>
          <div className="mt-10">{children}</div>
        </div>
      </div>
      <div className="relative m-3 hidden overflow-hidden rounded-[2rem] bg-ink text-ink-fg lg:block">
        <Topography className="absolute inset-0 size-full text-highlight" rings={16} seed={5} />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md font-display text-3xl leading-snug font-medium">
            Plant what your land is ready for, and know what it needs{' '}
            <span className="text-highlight italic">before you sow.</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-fg/75">
            {[
              'Crop rankings with an honest confidence level',
              'Step-by-step fixes for soil and climate gaps',
              'Every planting tracked from sowing to harvest',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid size-5 place-items-center rounded-full bg-highlight text-highlight-fg">
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginValues, setBusy?: (busy: boolean) => void) => {
    setError(null)
    setBusy?.(true)
    try {
      await login(values.email, values.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
      setBusy?.(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New to AgroAI?{' '}
          <Link to="/register" className="font-semibold text-fg underline decoration-highlight decoration-2 underline-offset-4 hover:decoration-fg">
            Create an account
          </Link>
        </>
      }
    >
      {DEMO_MODE && (
        <div className="mb-8 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Exploring the live demo?</p>
          <p className="mt-1 text-sm text-fg-muted">
            Sign in to a ready-made farm with fields, sensor history and plantings. Everything stays
            in this browser.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            loading={demoLoading}
            onClick={() => void onSubmit({ email: DEMO_EMAIL, password: DEMO_PASSWORD }, setDemoLoading)}
          >
            Use the demo account
          </Button>
        </div>
      )}
      <form onSubmit={handleSubmit((v) => onSubmit(v))} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Email" error={errors.email?.message}>
          {({ id, invalid }) => (
            <Input id={id} type="email" autoComplete="email" invalid={invalid} {...register('email')} />
          )}
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          {({ id, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              invalid={invalid}
              {...register('password')}
            />
          )}
        </FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}

const registerSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Enter your name').max(120),
    email: z.email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(72, 'Use at most 72 characters')
      .refine((v) => !/^\d+$/.test(v) && !/^[a-zA-Z]+$/.test(v), {
        message: 'Mix letters with numbers or symbols',
      }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const { register: createAccount } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  const onSubmit = async ({ full_name, email, password }: RegisterValues) => {
    setError(null)
    try {
      await createAccount({ full_name, email, password })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-fg underline decoration-highlight decoration-2 underline-offset-4 hover:decoration-fg">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Full name" error={errors.full_name?.message}>
          {({ id, invalid }) => (
            <Input id={id} autoComplete="name" invalid={invalid} {...register('full_name')} />
          )}
        </FormField>
        <FormField label="Email" error={errors.email?.message}>
          {({ id, invalid }) => (
            <Input id={id} type="email" autoComplete="email" invalid={invalid} {...register('email')} />
          )}
        </FormField>
        <FormField
          label="Password"
          hint="At least 8 characters, mixing letters with numbers or symbols."
          error={errors.password?.message}
        >
          {({ id, invalid, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              invalid={invalid}
              aria-describedby={describedBy}
              {...register('password')}
            />
          )}
        </FormField>
        <FormField label="Confirm password" error={errors.confirm?.message}>
          {({ id, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              invalid={invalid}
              {...register('confirm')}
            />
          )}
        </FormField>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
