import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Logo } from '@/components/Logo'
import { Topography } from '@/components/Topography'
import { ButtonLink } from '@/components/ui/Button'
import { formatPercent } from '@/lib/format'
import { useModelInfo } from '@/lib/queries'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

/** A small, static preview assembled from the app's own visual language. */
function ProductPreview() {
  const spark = [12, 14, 13, 17, 16, 19, 18, 21, 20, 23, 22, 24]
  const max = Math.max(...spark)
  const min = Math.min(...spark)
  const line = spark
    .map((v, i) => `${(i / (spark.length - 1)) * 100},${36 - ((v - min) / (max - min)) * 30}`)
    .join(' ')

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-ink p-6 text-ink-fg sm:p-8" aria-hidden>
      <Topography className="absolute inset-0 size-full text-highlight" />
      <div className="relative grid gap-4">
        <div className="rounded-2xl bg-surface p-5 text-fg shadow-pop">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">Best match · North plot</p>
            <span className="rounded-full bg-highlight px-2 py-0.5 text-[11px] font-bold text-highlight-fg">
              High confidence
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-medium">Maize</p>
          <div className="mt-4 space-y-2.5">
            {[
              ['Maize', 78],
              ['Kidney beans', 14],
              ['Chickpea', 5],
            ].map(([name, pct], i) => (
              <div key={name} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-fg-muted">{name}</span>
                <span className="h-1.5 flex-1 rounded-full bg-surface-muted">
                  <span
                    className={i === 0 ? 'block h-full rounded-full bg-ink' : 'block h-full rounded-full bg-line-strong'}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-8 text-right tabular-nums text-fg-muted">{pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-surface p-4 text-fg">
            <p className="text-xs text-fg-subtle">Soil temperature</p>
            <p className="mt-1 font-display text-2xl font-medium">21.4°</p>
            <svg viewBox="0 0 100 40" className="mt-2 h-10 w-full" preserveAspectRatio="none">
              <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="rounded-2xl bg-highlight p-4 text-highlight-fg">
            <p className="text-xs font-semibold opacity-70">Day 46 of 120</p>
            <p className="mt-1 font-display text-2xl font-medium">Vegetative</p>
            <div className="mt-4 flex gap-1">
              {[1, 1, 0.5, 0, 0].map((v, i) => (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full bg-highlight-fg"
                  style={{ opacity: v === 1 ? 0.9 : v === 0.5 ? 0.5 : 0.15 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const CAPABILITIES = [
  {
    kicker: '01 · Recommend',
    title: 'Ranked crops, honest confidence',
    body: 'A Random Forest model weighs seven soil and climate factors against 22 crops and tells you how sure it is, including when your conditions are unusual.',
  },
  {
    kicker: '02 · Advise',
    title: 'Know exactly what to fix',
    body: 'Choose a crop and every factor is checked against its optimal range, with a plain-language action for anything that falls short.',
  },
  {
    kicker: '03 · Monitor',
    title: 'Fields, readings, trends',
    body: 'Map each plot, log soil tests or stream sensor data, and follow any measurement over weeks and seasons.',
  },
  {
    kicker: '04 · Track',
    title: 'Sowing to harvest',
    body: 'Follow every planting through its growth stages, with guidance for where it is now and the expected harvest date.',
  },
]

export function LandingPage() {
  useDocumentTitle('')
  const { user } = useAuth()
  const model = useModelInfo()
  const accuracy = model.data?.metrics.test?.accuracy
  const startHref = user ? '/app' : '/register'

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink to="/app">Open AgroAI</ButtonLink>
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
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-fg-muted">
              <span className="size-1.5 rounded-full bg-brand" />
              Decision support for Lesotho's smallholder farms
            </p>
            <h1 className="mt-6 font-display text-5xl leading-[1.02] font-medium tracking-tight sm:text-6xl lg:text-7xl">
              Know what your land is{' '}
              <span className="relative whitespace-nowrap italic">
                ready to grow
                <svg
                  viewBox="0 0 300 18"
                  className="absolute -bottom-2 left-0 h-3 w-full text-highlight"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path d="M2 12C70 3 160 3 298 9" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              .
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-fg-muted">
              Enter a soil test and local weather. AgroAI ranks the crops that suit your field,
              shows what to correct first, and follows each planting to harvest.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink to={startHref} size="lg" icon={<ArrowRight />}>
                {user ? 'Go to your farm' : 'Start for free'}
              </ButtonLink>
              <a href="#how" className="inline-flex h-12 items-center px-3 text-sm font-semibold text-fg-muted hover:text-fg">
                See how it works
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
              {['No hardware needed', 'Works on any phone', 'Your data stays yours'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-brand" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <ProductPreview />
        </section>

        <section className="border-y border-line bg-surface">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-line px-4 sm:px-6 md:grid-cols-4 md:divide-x">
            {[
              [accuracy ? formatPercent(accuracy, 1) : '99%', 'accuracy on held-out data'],
              ['22', 'crops profiled'],
              ['7', 'soil and climate factors'],
              ['2,200', 'observations learned from'],
            ].map(([value, label]) => (
              <div key={label} className="px-2 py-8 md:px-8">
                <dd className="font-display text-4xl font-medium tracking-tight sm:text-5xl">{value}</dd>
                <dt className="mt-2 text-sm text-fg-muted">{label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand">One workflow, four tools</p>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">
              From soil test to harvest, in one place.
            </h2>
          </div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="bg-surface p-8 sm:p-10">
                <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{c.kicker}</p>
                <h3 className="mt-4 font-display text-2xl font-medium">{c.title}</h3>
                <p className="mt-3 leading-relaxed text-fg-muted">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-highlight px-8 py-14 text-highlight-fg sm:px-14">
            <Topography className="absolute inset-0 size-full text-highlight-fg opacity-25" seed={7} />
            <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
                  Plan your next season tonight.
                </h2>
                <p className="mt-4 text-lg opacity-80">
                  Advice is a starting point, not a verdict. Confirm big decisions with your local
                  extension officer.
                </p>
              </div>
              <Link
                to={startHref}
                className="inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-full bg-ink px-7 font-semibold text-ink-fg hover:opacity-90 md:self-auto"
              >
                {user ? 'Open AgroAI' : 'Create your account'} <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p className="max-w-md sm:text-right">
            Started as a final-year project at the National University of Lesotho. Map data ©
            OpenStreetMap contributors.
          </p>
        </div>
      </footer>
    </div>
  )
}
