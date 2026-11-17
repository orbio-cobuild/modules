// ui-kit primitives (D225): shadcn/ui-style building blocks without extra dependencies, so installs
// and uploads stay small. Colours come from the brand variables; surfaces follow the theme's
// card style (glass, solid or outline) through the `ui-surface` class.
import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TableHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** A page section with a consistent width, spacing and optional heading block. */
export function Section({ id, eyebrow, title, subtitle, align = 'center', className, children }: { id?: string; eyebrow?: string; title?: ReactNode; subtitle?: ReactNode; align?: 'center' | 'left'; className?: string; children?: ReactNode }) {
  return (
    <section id={id} className={cn('ui-section relative mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24', className)}>
      {(eyebrow || title || subtitle) && (
        <div className={cn('mb-10 max-w-2xl sm:mb-14', align === 'center' && 'mx-auto text-center')}>
          {eyebrow && <p className="ui-eyebrow mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{eyebrow}</p>}
          {title && <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>}
          {subtitle && <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--muted-fg)] sm:text-lg">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

/** A card that follows the theme's surface style. */
export function Surface({ className, interactive, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cn('ui-surface rounded-[var(--radius)] p-6', interactive && 'transition-transform duration-200 hover:-translate-y-0.5', className)} {...props} />
}

export function Pill({ className, tone = 'muted', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'muted' | 'primary' | 'accent' | 'success' | 'warning' }) {
  const tones = {
    muted: 'border-[var(--border)] bg-[var(--muted)] text-[var(--fg)]',
    primary: 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]',
    accent: 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  }
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />
}

export function Separator({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('border-0 border-t border-[var(--border)]', className)} {...props} />
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium', className)} {...props} />
}

const field = 'w-full rounded-[calc(var(--radius)*0.75)] border border-[var(--border)] bg-[var(--bg)] px-3.5 text-sm text-[var(--fg)] outline-none transition placeholder:text-[var(--muted-fg)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_35%,transparent)] disabled:opacity-50'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-11', className)} {...props} />
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'min-h-28 py-3', className)} {...props} />
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, 'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props}>
      {children}
    </select>
  )
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="ui-surface w-full overflow-x-auto rounded-[var(--radius)]">
      <table className={cn('w-full border-collapse text-left text-sm [&_td]:border-t [&_td]:border-[var(--border)] [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[var(--muted-fg)]', className)} {...props} />
    </div>
  )
}

export function Progress({ value, max = 100, label, className }: { value: number; max?: number; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex justify-between text-xs text-[var(--muted-fg)]">
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
        <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-[calc(var(--radius)*0.75)] bg-[var(--muted)]', className)} {...props} />
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} width={size} height={size} className={cn('rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-label={name} className={cn('grid shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_18%,var(--card))] font-semibold text-[var(--primary)]', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  )
}

/** A big number with a label, for stats strips and dashboards. */
export function Stat({ value, label, hint, className }: { value: ReactNode; label: string; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl" style={{ fontFamily: 'var(--font-heading)' }}>
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--muted-fg)]">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-[var(--muted-fg)] opacity-80">{hint}</div>}
    </div>
  )
}

/** Hover hint (CSS only). Keep the text short; it isn't shown on touch screens, so never hide essential info here. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  )
}

/** Questions and answers, open one at a time or several. No JavaScript needed. */
export function Accordion({ items, className }: { items: { q: string; a: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('ui-surface divide-y divide-[var(--border)] rounded-[var(--radius)]', className)}>
      {items.map((it) => (
        <details key={it.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
            {it.q}
            <span aria-hidden className="text-xl leading-none text-[var(--muted-fg)] transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="pt-3 text-sm leading-relaxed text-[var(--muted-fg)]">{it.a}</div>
        </details>
      ))}
    </div>
  )
}
