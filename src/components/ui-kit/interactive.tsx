'use client'
// ui-kit interactive pieces (D225): tabs, dialog, copy button, number ticker, spotlight card.
// All respect prefers-reduced-motion.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Tabs({ tabs, className }: { tabs: { label: string; content: ReactNode }[]; className?: string }) {
  const [active, setActive] = useState(0)
  const id = useId()
  return (
    <div className={className}>
      <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] p-1">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            role="tab"
            id={`${id}-t${i}`}
            aria-selected={active === i}
            aria-controls={`${id}-p${i}`}
            onClick={() => setActive(i)}
            className={cn('h-9 rounded-full px-4 text-sm font-medium transition', active === i ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted-fg)] hover:text-[var(--fg)]')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={active !== i} className="pt-6">
          {t.content}
        </div>
      ))}
    </div>
  )
}

export function Dialog({ trigger, title, children, className }: { trigger: ReactNode; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  return (
    <>
      <span onClick={() => ref.current?.showModal()} className="contents">
        {trigger}
      </span>
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className={cn('ui-surface m-auto w-[min(92vw,28rem)] rounded-[var(--radius)] p-0 text-[var(--fg)] backdrop:bg-black/50 backdrop:backdrop-blur-sm', className)}
      >
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button onClick={() => ref.current?.close()} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted-fg)] hover:bg-[var(--muted)]">
              ×
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  )
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          // Clipboard blocked; nothing to do.
        }
      }}
      className={cn('inline-flex h-7 items-center rounded-md border border-[var(--border)] px-2 text-xs text-[var(--muted-fg)] transition hover:text-[var(--fg)]', className)}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

/** Counts up to `value` when scrolled into view. Shows the final number at once for reduced motion. */
export function NumberTicker({ value, decimals = 0, prefix = '', suffix = '', durationMs = 1200, className }: { value: number; decimals?: number; prefix?: string; suffix?: string; durationMs?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    let raf = 0
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / durationMs)
        setShown(value * (1 - Math.pow(1 - k, 3)))
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, durationMs])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      {shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}

/** A card with a soft light that follows the pointer. */
export function SpotlightCard({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r || !ref.current) return
        ref.current.style.setProperty('--x', `${e.clientX - r.left}px`)
        ref.current.style.setProperty('--y', `${e.clientY - r.top}px`)
      }}
      className={cn('ui-surface group relative overflow-hidden rounded-[var(--radius)] p-6', className)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(320px circle at var(--x) var(--y), color-mix(in srgb, var(--primary) 18%, transparent), transparent 70%)' }} />
      <div className="relative">{children}</div>
    </div>
  )
}
