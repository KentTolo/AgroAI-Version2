import {
  ArrowRight,
  ClipboardCheck,
  LineChart,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Sprout,
} from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Logo } from '@/components/Logo'
import { ButtonLink } from '@/components/ui/Button'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { formatPercent } from '@/lib/format'
import { useModelInfo } from '@/lib/queries'

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Crop recommendations',
    body: 'A machine learning model ranks 22 crops for your soil nutrients, pH and climate, and tells you how confident it is.',
  },
  {
    icon: ClipboardCheck,
    title: 'Agronomic advice',
    body: 'Already know what you want to grow? See exactly which conditions fall short and what to do about each one.',
  },
  {
    icon: LineChart,
    title: 'Field monitoring',
    body: 'Record or stream sensor readings for every field and follow nitrogen, moisture and temperature over time.',
  },
  {
    icon: Sprout,
    title: 'Crop tracking',
    body: 'Follow each planting from germination to harvest, with stage-by-stage guidance and an expected harvest date.',
  },
]

const STEPS = [
  { title: 'Map your fields', body: 'Add each plot with its location, size and soil type.' },
  { title: 'Measure conditions', body: 'Enter a soil test and weather readings, or connect sensors.' },
  { title: 'Plant with confidence', body: 'Get ranked crops, fix the gaps, and track the season.' },
]

export function LandingPage() {
  useDocumentTitle('')
  const { user } = useAuth()
  const model = useModelInfo()
  const accuracy = model.data?.metrics.test?.accuracy

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink to="/app">Open dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register">Get started</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-16">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-soft-fg">
              <MapPinned className="size-3.5" aria-hidden />
              Built for smallholder farmers in Lesotho
            </span>
            <h1 className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
              Grow the right crop for your soil and season.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-fg-muted">
              AgroAI turns a soil test and local weather into clear planting decisions: which crops
              suit your field, what needs fixing first, and when to expect a harvest.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to={user ? '/app' : '/register'} size="lg" icon={<ArrowRight />}>
                {user ? 'Go to your dashboard' : 'Create a free account'}
              </ButtonLink>
              <ButtonLink to="/login" size="lg" variant="secondary">
                Sign in
              </ButtonLink>
            </div>
          </div>

          <div className="relative">
            <img
              src="/landscape.jpg"
              alt="Farmland and hills in Lesotho"
              className="aspect-[4/3] w-full rounded-2xl object-cover shadow-pop lg:aspect-[5/6]"
            />
            <div className="absolute right-4 -bottom-6 left-4 rounded-xl border border-line bg-surface p-4 shadow-pop sm:right-auto sm:-left-6 sm:w-72">
              <p className="text-xs font-medium text-fg-subtle">Recommended for North plot</p>
              <p className="mt-1 text-lg font-semibold">Maize</p>
              <div className="mt-3 space-y-2" aria-hidden>
                {[
                  ['Maize', 78],
                  ['Kidney beans', 14],
                  ['Chickpea', 5],
                ].map(([name, pct]) => (
                  <div key={name}>
                    <div className="mb-1 flex justify-between text-xs text-fg-muted">
                      <span>{name}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Facts */}
        <section className="border-y border-line bg-surface-muted">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
            {[
              [accuracy ? formatPercent(accuracy, 1) : '99%', 'held-out test accuracy'],
              ['22', 'crops in the library'],
              ['7', 'soil and climate factors'],
              ['2,200', 'field observations trained on'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="text-3xl font-semibold tracking-tight">{value}</dd>
                <dd className="mt-1 text-sm text-fg-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight">
            Everything you need from soil test to harvest
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-line p-6">
                <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand-soft-fg">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-fg-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-surface-muted">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-brand-fg">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-col gap-6 rounded-2xl bg-brand px-8 py-10 text-brand-fg md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="flex items-center gap-2 text-2xl font-semibold">
                <ShieldCheck className="size-6" aria-hidden /> Honest about what it knows
              </h2>
              <p className="mt-2 opacity-90">
                Every recommendation shows the model's confidence and warns you when your conditions
                are outside anything it was trained on. Advice is a starting point; confirm big
                decisions with your local extension officer.
              </p>
            </div>
            <Link
              to={user ? '/app' : '/register'}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-surface px-6 font-medium text-fg hover:bg-surface-muted"
            >
              Start planning <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p>
            Originally developed at the National University of Lesotho, Department of Mathematics
            and Computer Science.
          </p>
        </div>
      </footer>
    </div>
  )
}
