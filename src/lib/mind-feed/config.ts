/** mind-feed config, written by the platform to src/config/modules/mind-feed.json. */
import { z } from 'zod'

export const mindFeedConfigSchema = z.object({
  /** Which agent's runs to show (agent-loop `agent`). */
  agent: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/).default('main'),
  title: z.string().min(1).max(80).default('Mind feed'),
  description: z.string().max(300).default('Every decision this agent makes, with its reasoning and what it cost.'),
  pageSize: z.number().int().min(5).max(50).default(20),
  /** Live updates through Supabase Realtime; polling is the fallback either way. */
  realtime: z.boolean().default(true),
  pollSeconds: z.number().int().min(10).max(600).default(30),
  showInputs: z.boolean().default(true),
  showCosts: z.boolean().default(true),
  /** Days of history used for the average daily spend. */
  statsWindowDays: z.number().int().min(1).max(30).default(7),
  /** An optional treasury figure the owner sets by hand (micro-USD). Runway = treasury / average daily spend. */
  treasury: z
    .object({
      micro: z.string().regex(/^\d{1,18}$/).optional(),
      label: z.string().min(1).max(40).default('Treasury'),
      note: z.string().max(120).optional(),
    })
    .default({ label: 'Treasury' }),
})

export type MindFeedConfig = z.infer<typeof mindFeedConfigSchema>
