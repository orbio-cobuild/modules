/**
 * Default ApprovalRequester for the generated app: writes the draft to `agent_outbox` as pending.
 * Nothing is sent from here. The integration can swap in the notify module's requester, which shows
 * the draft to the owner and sends it after approval.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalRequester } from './types'

export function outboxApprovals(db: SupabaseClient): ApprovalRequester {
  return {
    async request(kind, _projectId, payload) {
      if (kind !== 'outbound') throw new Error('The agent can only ask for approval to send something out.')
      const p = (payload ?? {}) as { channel?: string; content?: string; agent?: string; runId?: string }
      if (!p.channel || !p.content) throw new Error('An outbound draft needs a channel and content.')
      const { data, error } = await db
        .from('agent_outbox')
        .insert({ agent: p.agent ?? 'main', run_id: p.runId ?? null, channel: p.channel, content: p.content, payload })
        .select('id')
        .single()
      if (error) throw new Error(`agent_outbox insert failed: ${error.message}`)
      return { approvalId: data.id as string }
    },
  }
}
