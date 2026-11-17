/**
 * Server component: loads the feed (publishable key, public data only) and renders it with live updates.
 * Use it on any page: <MindFeed before={searchParams.before} />
 */
import { loadFeed } from '@/lib/mind-feed/server'
import { LiveRefresh } from './LiveRefresh'
import { MindFeedView } from './MindFeedView'

export async function MindFeed({ before, basePath = '/agent' }: { before?: string | null; basePath?: string }) {
  try {
    const data = await loadFeed({ before: before ?? null })
    return (
      <div className="space-y-3">
        <MindFeedView {...data} basePath={basePath} />
        {!before && <LiveRefresh agent={data.config.agent} realtime={data.config.realtime} pollSeconds={data.config.pollSeconds} />}
      </div>
    )
  } catch (err) {
    console.error('[mind-feed] load failed', err)
    return <p className="rounded-lg border p-6 text-muted-foreground">The feed couldn’t load right now. Please refresh in a minute.</p>
  }
}
