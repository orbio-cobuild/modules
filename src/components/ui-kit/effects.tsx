// ui-kit effects (D225), CSS only: marquee, grid and dot patterns, glow, bento grid, gradient text.
// Ideas adapted from Magic UI (MIT); written for the brand variables. Motion stops for reduced motion.
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Scrolling row (logos, partners, quotes). Content is repeated so the loop is seamless. */
export function Marquee({ children, speedSeconds = 30, reverse, className }: { children: ReactNode; speedSeconds?: number; reverse?: boolean; className?: string }) {
  return (
    <div className={cn('ui-marquee group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]', className)} style={{ '--marquee-duration': `${speedSeconds}s` } as CSSProperties}>
      {[0, 1].map((k) => (
        <div key={k} aria-hidden={k === 1} className={cn('ui-marquee-track flex shrink-0 items-center gap-12 pr-12 group-hover:[animation-play-state:paused]', reverse && '[animation-direction:reverse]')}>
          {children}
        </div>
      ))}
    </div>
  )
}

/** A faint grid behind a section. Put it first inside a `relative` parent. */
export function GridPattern({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]', className)}
      style={{ backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)', backgroundSize: `${size}px ${size}px` }}
    />
  )
}

export function DotPattern({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]', className)}
      style={{ backgroundImage: 'radial-gradient(var(--border) 1.2px, transparent 1.2px)', backgroundSize: `${size}px ${size}px` }}
    />
  )
}

/** Soft colour glow from the brand colours, behind a hero. */
export function Glow({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-60 blur-3xl', className)} style={{ background: 'radial-gradient(40% 50% at 30% 30%, color-mix(in srgb, var(--primary) 45%, transparent), transparent 70%), radial-gradient(35% 45% at 70% 20%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%)' }} />
  )
}

export function GradientText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('bg-clip-text text-transparent', className)} style={{ backgroundImage: 'linear-gradient(100deg, var(--fg) 20%, var(--primary) 60%, var(--accent))' }}>{children}</span>
}

/** Mixed-size feature tiles. Give an item `span` 2 to make it wide (desktop). */
export function BentoGrid({ items, className }: { items: { title: string; body: string; icon?: ReactNode; span?: 1 | 2; visual?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('grid auto-rows-[minmax(180px,auto)] gap-4 md:grid-cols-3', className)}>
      {items.map((it) => (
        <div key={it.title} className={cn('ui-surface flex flex-col justify-between gap-6 overflow-hidden rounded-[var(--radius)] p-6', it.span === 2 && 'md:col-span-2')}>
          {it.visual && <div className="-mx-6 -mt-6 border-b border-[var(--border)]">{it.visual}</div>}
          <div>
            {it.icon && <div className="mb-4 grid h-10 w-10 place-items-center rounded-[calc(var(--radius)*0.75)] bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]">{it.icon}</div>}
            <h3 className="text-lg font-semibold">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-fg)]">{it.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
