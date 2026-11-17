// ui-kit sections (D225): ready-made, tested page sections. The site builder picks sections and fills
// them with the project's copy instead of writing layout from scratch. All are server components.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { BentoGrid, DotPattern, Glow, GradientText, GridPattern, Marquee } from './effects'
import { CopyButton, NumberTicker } from './interactive'
import { Accordion, Avatar, Pill, Section, Stat, Surface } from './primitives'
import { ArtSculpture, HeroBackdrop, HeroObjects, VisualObjects, hasFeatureArt, usesDither } from './art'

export interface Action {
  label: string
  href: string
}

function Actions({ primary, secondary, center }: { primary?: Action; secondary?: Action; center?: boolean }) {
  if (!primary && !secondary) return null
  const external = (h: string) => /^https?:\/\//.test(h)
  const cls = 'inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold transition'
  return (
    <div className={cn('mt-8 flex flex-wrap gap-3', center && 'justify-center')}>
      {primary && (
        <Link href={primary.href} {...(external(primary.href) ? { target: '_blank', rel: 'noreferrer' } : {})} className={cn(cls, 'ui-btn ui-btn-primary bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90')}>
          {primary.label}
        </Link>
      )}
      {secondary && (
        <Link href={secondary.href} {...(external(secondary.href) ? { target: '_blank', rel: 'noreferrer' } : {})} className={cn(cls, 'ui-btn ui-btn-secondary ui-surface text-[var(--fg)] hover:opacity-90')}>
          {secondary.label}
        </Link>
      )}
    </div>
  )
}

/**
 * The project's hero picture (D266), when it has one: drawn behind the hero, faded into the page
 * background by the theme's CSS. Renders nothing visible on projects without a picture.
 */
export function HeroArt() {
  return <div aria-hidden className="ui-hero-art" />
}

/**
 * Big centred headline. `backdrop` picks the background effect; `art={false}` hides the hero picture
 * and the project's 3D art (D296: the objects beside the headline and the dither background).
 */
export function HeroCentered({ badge, title, highlight, subtitle, primary, secondary, backdrop = 'glow', art = true, children }: { badge?: string; title: string; highlight?: string; subtitle: string; primary?: Action; secondary?: Action; backdrop?: 'glow' | 'grid' | 'dots' | 'none'; art?: boolean; children?: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden">
      {art && (usesDither() ? <HeroBackdrop /> : <HeroArt />)}
      {art && <HeroObjects />}
      {backdrop === 'glow' && <Glow />}
      {backdrop === 'grid' && <GridPattern />}
      {backdrop === 'dots' && <DotPattern />}
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pb-24 sm:pt-28">
        {badge && <Pill tone="accent" className="mb-6">{badge}</Pill>}
        <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          {title} {highlight && <GradientText>{highlight}</GradientText>}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[var(--muted-fg)]">{subtitle}</p>
        <Actions primary={primary} secondary={secondary} center />
        {children && <div className="mt-14">{children}</div>}
      </div>
    </section>
  )
}

/** Headline on the left, a visual (screenshot, card, live widget) on the right. */
export function HeroSplit({ badge, title, subtitle, primary, secondary, visual, points, art = true }: { badge?: string; title: string; subtitle: string; primary?: Action; secondary?: Action; visual: ReactNode; points?: string[]; art?: boolean }) {
  return (
    <section className="relative isolate overflow-hidden">
      {art && (usesDither() ? <HeroBackdrop /> : <HeroArt />)}
      {art && <HeroObjects wide />}
      <Glow className="opacity-40" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-2">
        <div>
          {badge && <Pill tone="accent" className="mb-5">{badge}</Pill>}
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-[var(--muted-fg)]">{subtitle}</p>
          {points && (
            <ul className="mt-6 space-y-2 text-sm">
              {points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  {p}
                </li>
              ))}
            </ul>
          )}
          <Actions primary={primary} secondary={secondary} />
        </div>
        <div className="relative">
          {visual}
          {art && <VisualObjects />}
        </div>
      </div>
    </section>
  )
}

/** A row of names or logos that scrolls. Use only real partners or the chains and tools you use. */
export function LogoStrip({ label, items }: { label?: string; items: { name: string; logo?: ReactNode }[] }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {label && <p className="mb-6 text-center text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-fg)]">{label}</p>}
      <Marquee>
        {items.map((it) => (
          <span key={it.name} className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold text-[var(--muted-fg)]">
            {it.logo}
            {it.name}
          </span>
        ))}
      </Marquee>
    </div>
  )
}

/** Cards with an icon each. `art` shows the project's 3D sculptures instead of the icons (D296), when it has one for every card. */
export function FeatureGrid({ id, eyebrow, title, subtitle, features, columns = 3, art = false }: { id?: string; eyebrow?: string; title: string; subtitle?: string; features: { title: string; body: string; icon?: ReactNode }[]; columns?: 2 | 3 | 4; art?: boolean }) {
  const sculptures = art && hasFeatureArt(features.length)
  return (
    <Section id={id} eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <div className={cn('grid gap-4 sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3', columns === 4 && 'lg:grid-cols-4')}>
        {features.map((f, i) => (
          <Surface key={f.title} interactive>
            {sculptures ? <ArtSculpture index={i} className="mb-4 h-20" /> : f.icon && <div className="mb-4 grid h-10 w-10 place-items-center rounded-[calc(var(--radius)*0.75)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]">{f.icon}</div>}
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-fg)]">{f.body}</p>
          </Surface>
        ))}
      </div>
    </Section>
  )
}

export function FeatureBento(props: { id?: string; eyebrow?: string; title: string; subtitle?: string; items: Parameters<typeof BentoGrid>[0]['items'] }) {
  return (
    <Section id={props.id} eyebrow={props.eyebrow} title={props.title} subtitle={props.subtitle}>
      <BentoGrid items={props.items} />
    </Section>
  )
}

/** Text and a visual, alternating sides row by row. */
export function FeatureRows({ id, rows }: { id?: string; rows: { eyebrow?: string; title: string; body: string; visual: ReactNode }[] }) {
  return (
    <Section id={id}>
      <div className="space-y-20">
        {rows.map((r, i) => (
          <div key={r.title} className="grid items-center gap-10 lg:grid-cols-2">
            <div className={cn(i % 2 === 1 && 'lg:order-2')}>
              {r.eyebrow && <p className="ui-eyebrow mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{r.eyebrow}</p>}
              <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{r.title}</h3>
              <p className="mt-4 leading-relaxed text-[var(--muted-fg)]">{r.body}</p>
            </div>
            <div>{r.visual}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Real numbers only (users, runs, volume you can show). Never price, returns or profit. */
export function StatsStrip({ stats }: { stats: { value: number; label: string; prefix?: string; suffix?: string; decimals?: number }[] }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <Surface className="grid grid-cols-2 gap-8 p-8 text-center md:grid-cols-4">
        {stats.map((s) => (
          <Stat key={s.label} value={<NumberTicker value={s.value} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} />} label={s.label} />
        ))}
      </Surface>
    </div>
  )
}

/** Numbered steps. When the project has 3D art (D296) for every step, each card shows its sculpture above the number; `art={false}` turns that off. */
export function Steps({ id, eyebrow, title, subtitle, steps, art = true }: { id?: string; eyebrow?: string; title: string; subtitle?: string; steps: { title: string; body: string }[]; art?: boolean }) {
  const sculptures = art && hasFeatureArt(steps.length)
  return (
    <Section id={id} eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Surface className="h-full">
              {sculptures && <ArtSculpture index={i} className="mb-5 h-24" />}
              <span className="font-mono text-sm text-[var(--accent)]">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-fg)]">{s.body}</p>
            </Surface>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function Faq({ id = 'faq', title = 'Questions', items }: { id?: string; title?: string; items: { q: string; a: string }[] }) {
  return (
    <Section id={id} title={title} className="max-w-3xl">
      <Accordion items={items} />
    </Section>
  )
}

/** A milestone timeline. `status` is honest: done, now or next. */
export function Roadmap({ id = 'roadmap', eyebrow, title = 'Roadmap', items }: { id?: string; eyebrow?: string; title?: string; items: { when: string; title: string; body: string; status: 'done' | 'now' | 'next' }[] }) {
  return (
    <Section id={id} eyebrow={eyebrow} title={title} className="max-w-3xl">
      <ol className="relative space-y-8 border-l border-[var(--border)] pl-8">
        {items.map((it) => (
          <li key={it.title} className="relative">
            <span aria-hidden className={cn('absolute -left-[41px] top-1 h-4 w-4 rounded-full border-2 border-[var(--bg)]', it.status === 'done' ? 'bg-[var(--primary)]' : it.status === 'now' ? 'bg-[var(--accent)] ring-4 ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]' : 'bg-[var(--muted)]')} />
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-fg)]">
              {it.when}
              <Pill tone={it.status === 'now' ? 'accent' : 'muted'}>{it.status === 'done' ? 'Done' : it.status === 'now' ? 'Now' : 'Next'}</Pill>
            </div>
            <h3 className="mt-1 font-semibold">{it.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted-fg)]">{it.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function Team({ id = 'team', title = 'Team', members }: { id?: string; title?: string; members: { name: string; role: string; avatar?: string; href?: string }[] }) {
  return (
    <Section id={id} title={title}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {members.map((m) => (
          <Surface key={m.name} className="flex items-center gap-4">
            <Avatar name={m.name} src={m.avatar} size={48} />
            <div>
              <div className="font-semibold">{m.href ? <a href={m.href} target="_blank" rel="noreferrer" className="hover:underline">{m.name}</a> : m.name}</div>
              <div className="text-sm text-[var(--muted-fg)]">{m.role}</div>
            </div>
          </Surface>
        ))}
      </div>
    </Section>
  )
}

export function Pricing({ id = 'pricing', title = 'Pricing', subtitle, plans }: { id?: string; title?: string; subtitle?: string; plans: { name: string; price: string; period?: string; features: string[]; action: Action; featured?: boolean }[] }) {
  return (
    <Section id={id} title={title} subtitle={subtitle}>
      <div className={cn('grid gap-4', plans.length >= 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2 md:max-w-3xl md:mx-auto')}>
        {plans.map((p) => (
          <Surface key={p.name} className={cn('flex flex-col', p.featured && 'ring-2 ring-[var(--primary)]')}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{p.name}</h3>
              {p.featured && <Pill tone="primary">Popular</Pill>}
            </div>
            <div className="mt-4 text-4xl font-semibold tracking-tight">
              {p.price}
              {p.period && <span className="text-base font-normal text-[var(--muted-fg)]"> / {p.period}</span>}
            </div>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-[var(--accent)]">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Actions primary={p.action} />
          </Surface>
        ))}
      </div>
    </Section>
  )
}

export function CtaBand({ id, title, subtitle, primary, secondary }: { id?: string; title: string; subtitle?: string; primary: Action; secondary?: Action }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-[var(--border)] px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 28%, var(--card)), color-mix(in srgb, var(--accent) 16%, var(--card)))' }} />
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {subtitle && <p className="mx-auto mt-4 max-w-xl text-[var(--muted-fg)]">{subtitle}</p>}
        <Actions primary={primary} secondary={secondary} center />
      </div>
    </section>
  )
}

/** Facts about the project's token. Facts only: never price predictions, returns or profit. */
export function TokenFacts({ id = 'token', title = 'Token', symbol, chain, address, explorerUrl, facts }: { id?: string; title?: string; symbol: string; chain: string; address?: string | null; explorerUrl?: string | null; facts: { label: string; value: string }[] }) {
  return (
    <Section id={id} title={title} className="max-w-4xl">
      <Surface>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-semibold">${symbol}</span>
          <Pill>{chain}</Pill>
        </div>
        {address && (
          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-sm text-[var(--muted-fg)]">
            <span className="break-all">{address}</span>
            <CopyButton value={address} />
            {explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noreferrer" className="text-xs underline-offset-4 hover:underline">
                View on explorer
              </a>
            )}
          </div>
        )}
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs uppercase tracking-wide text-[var(--muted-fg)]">{f.label}</dt>
              <dd className="mt-1 font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-[var(--muted-fg)]">Information only. Not financial advice or an offer to buy or sell.</p>
      </Surface>
    </Section>
  )
}

export function Community({ id = 'community', title = 'Join the community', subtitle, links }: { id?: string; title?: string; subtitle?: string; links: { label: string; href: string; description?: string; icon?: ReactNode }[] }) {
  return (
    <Section id={id} title={title} subtitle={subtitle}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="ui-surface flex items-center gap-4 rounded-[var(--radius)] p-5 transition hover:-translate-y-0.5">
            {l.icon && <span className="text-[var(--primary)]">{l.icon}</span>}
            <span>
              <span className="block font-semibold">{l.label}</span>
              {l.description && <span className="block text-sm text-[var(--muted-fg)]">{l.description}</span>}
            </span>
          </a>
        ))}
      </div>
    </Section>
  )
}
