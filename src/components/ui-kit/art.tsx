// The site's 3D art (D296): small cut-out sculptures made for this project (material and objects
// picked from its world by the brand step), served as transparent WebP. Decoration only: aria-hidden,
// no text in them, and every component renders nothing when the project has no art, so pages look
// exactly as before without it.
import site from '@/content/site.json'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DitherBackdrop } from './dither'

export interface ArtPiece {
  src: string
  w: number
  h: number
}
export interface SiteArt {
  backdrop: 'dither' | 'none'
  hero: ArtPiece[]
  features: ArtPiece[]
}

/** The project's art from site.json, or null. */
export function siteArt(): SiteArt | null {
  const art = (site.brand as unknown as { art?: SiteArt | null }).art
  return art && typeof art === 'object' ? art : null
}

/** Where each hero piece sits in its cluster (px) and how far its bob is offset. */
const SPOTS = [
  { x: 0, y: 10, delay: 0 },
  { x: 56, y: 150, delay: 1.6 },
]

function Cluster({ pieces, side, wide }: { pieces: ArtPiece[]; side: 'left' | 'right'; wide: boolean }) {
  if (!pieces.length) return null
  // Centred in the gutter beside the hero's content: (page − content) / 4 − half the cluster.
  const pos = wide ? (side === 'left' ? 'left-[calc((100%-72rem)/4-80px)]' : 'right-[calc((100%-72rem)/4-80px)]') : side === 'left' ? 'left-[calc((100%-56rem)/4-80px)]' : 'right-[calc((100%-56rem)/4-80px)]'
  return (
    <div aria-hidden className={cn('pointer-events-none absolute top-1/2 hidden h-[320px] w-[160px] -translate-y-1/2', wide ? 'min-[1536px]:block' : 'min-[1200px]:block', pos)}>
      {pieces.map((p, i) => {
        const s = SPOTS[i % SPOTS.length] ?? SPOTS[0]!
        return (
          <div key={p.src} className="ui-art-bob absolute w-[104px]" style={{ [side]: s.x, top: s.y, animationDelay: `-${s.delay + (side === 'right' ? 0.8 : 0)}s` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt="" width={p.w} height={p.h} loading="eager" decoding="async" className="ui-art-shadow block h-auto max-h-[150px] w-full object-contain" />
          </div>
        )
      })}
    </div>
  )
}

/**
 * The hero's 3D objects: two small clusters at the hero's left and right edges, gently bobbing (off
 * under reduced motion), shown only where the side gutters are wide enough not to crowd the headline.
 * Put it first inside a hero <section> that is 'relative isolate overflow-hidden'. `wide` for a
 * hero whose content is max-w-6xl (HeroSplit), else max-w-4xl.
 */
export function HeroObjects({ wide = false, art = siteArt() }: { wide?: boolean; art?: SiteArt | null }) {
  const pieces = art?.hero ?? []
  if (!pieces.length) return null
  // Pieces come as original, twin, original, twin: each side gets one of each, of different objects.
  const left = pieces.filter((_, i) => i % 4 === 0 || i % 4 === 3)
  const right = pieces.filter((_, i) => i % 4 === 1 || i % 4 === 2).reverse()
  return (
    <>
      <Cluster pieces={left} side="left" wide={wide} />
      <Cluster pieces={right} side="right" wide={wide} />
    </>
  )
}

/**
 * The split hero's 3D objects on laptop and tablet screens (D303; from 768 px since D319, because the
 * builder's preview pane is narrower than 1024 px and round 10 saw no hero art there): below 1536 px the side gutters
 * beside a max-w-6xl hero are too narrow for the clusters (they rendered 0×0 at 1440), so two pieces
 * sit on the corners of the hero's picture instead, smaller, still decoration only. Put it inside
 * the `relative` wrapper of the visual.
 */
export function VisualObjects({ art = siteArt() }: { art?: SiteArt | null }) {
  const pieces = art?.hero ?? []
  if (!pieces.length) return null
  const corners = [pieces[0], pieces[1] ?? pieces[0]].filter((p): p is ArtPiece => !!p)
  // Below lg the visual spans the page and the hero clips what pokes out, so the pieces sit further in (D319).
  const spots = ['-left-3 -top-10 lg:-left-12 lg:-top-12 xl:-left-16', '-bottom-10 -right-2 lg:-bottom-12 lg:-right-5 xl:-right-14']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden md:block min-[1536px]:hidden" data-hero-objects="visual">
      {corners.map((p, i) => (
        <div key={`${p.src}-${i}`} className={cn('ui-art-bob absolute w-16 xl:w-20', spots[i])} style={{ animationDelay: `-${i * 1.6}s` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt="" width={p.w} height={p.h} loading="eager" decoding="async" className="ui-art-shadow block h-auto max-h-[110px] w-full object-contain" />
        </div>
      ))}
    </div>
  )
}

/**
 * One step or feature sculpture (`index` into the project's feature art), or `fallback` (an icon, or
 * nothing) when there is no art for it.
 */
export function ArtSculpture({ index, fallback = null, className, art = siteArt() }: { index: number; fallback?: ReactNode; className?: string; art?: SiteArt | null }) {
  const p = art?.features?.[index]
  if (!p) return <>{fallback}</>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={p.src} alt="" aria-hidden width={p.w} height={p.h} loading="lazy" decoding="async" className={cn('ui-art-shadow block h-24 w-auto object-contain', className)} />
}

/** True when the project has a sculpture for every one of `count` items (so a row never mixes art and plain cards). */
export function hasFeatureArt(count: number, art = siteArt()): boolean {
  return !!art && count > 0 && (art.features?.length ?? 0) >= count
}

/** The animated dither background behind a hero, when the project's art direction chose it. */
export function HeroBackdrop({ art = siteArt() }: { art?: SiteArt | null }) {
  if (art?.backdrop !== 'dither') return null
  const p = site.brand.palette as { primary: string; bg: string }
  return (
    <div aria-hidden className="ui-hero-dither pointer-events-none absolute inset-0 -z-10">
      <DitherBackdrop bg={p.bg} wave={p.primary} className="h-full w-full" />
    </div>
  )
}

/** Whether the hero should draw the dither instead of the hero photo (the two would fight). */
export function usesDither(art = siteArt()): boolean {
  return art?.backdrop === 'dither'
}
