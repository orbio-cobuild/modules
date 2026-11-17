/** RSS 2.0 for the mind feed, so people can follow the agent in a reader. */
import type { FeedRun } from './data'
import { formatUsd } from './format'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export function buildRss(runs: FeedRun[], opts: { title: string; description: string; siteUrl: string; feedPath?: string }): string {
  const site = opts.siteUrl.replace(/\/+$/, '')
  const items = runs.map((r) => {
    const title = r.error ? 'A run had a problem' : (r.decision?.summary ?? r.action?.summary ?? 'Run')
    const body = [r.error ?? r.reasoning ?? '', r.action?.summary ? `Action: ${r.action.summary}` : '', `Cost: ${formatUsd(r.totalCostMicro)}${r.costEstimated ? ' (estimate)' : ''}`]
      .filter(Boolean)
      .join('\n\n')
    return [
      '<item>',
      `<title>${esc(title)}</title>`,
      `<link>${esc(`${site}${opts.feedPath ?? '/agent'}#run-${r.id}`)}</link>`,
      `<guid isPermaLink="false">${esc(r.id)}</guid>`,
      `<pubDate>${new Date(r.startedAt).toUTCString()}</pubDate>`,
      `<description>${esc(body)}</description>`,
      '</item>',
    ].join('')
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>${esc(opts.title)}</title>`,
    `<link>${esc(`${site}${opts.feedPath ?? '/agent'}`)}</link>`,
    `<description>${esc(opts.description)}</description>`,
    ...items,
    '</channel></rss>',
  ].join('\n')
}
