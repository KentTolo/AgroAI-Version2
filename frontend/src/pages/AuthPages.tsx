import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { useAuth } from '@/auth/useAuth'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Feedback'
import { FormField, Input } from '@/components/ui/Form'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  useDocumentTitle(title)
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="self-start">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden lg:block">
        <img
          src="/landscape.jpg"
          alt="Green hills and farmland in Lesotho"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <blockquote className="absolute inset-x-10 bottom-10 text-white">
          <p className="max-w-md text-xl leading-snug font-medium">
            “Plant what your land is ready for, and know what it needs before you sow.”
          </p>
          <footer className="mt-3 text-sm text-white/75">AgroAI · built for smallholder farmers</footer>
        </blockquote>
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginValues) => {
    setError(null)
    try {
      await login(values.email, values.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New to AgroAI?{' '}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
          <Link to="/login" className="font-medium text-brand hover:underline">
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
