/** Turns database errors into plain English for users (UX #6). Log the raw error server-side. */
export interface DbErrorLike {
  code?: string
  message?: string
}

const MESSAGES: Record<string, string> = {
  '42501': "You don't have permission to do that.",
  '23505': 'That already exists.',
  '23503': 'That refers to something that no longer exists.',
  '23514': "Some of that information isn't allowed. Check it and try again.",
  '22P02': "Some of that information isn't in the right format.",
  PGRST116: "We couldn't find that.",
  PGRST301: 'Please sign in again.',
}

export function plainDbError(error: DbErrorLike | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.'
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!
  if (error.message && /row-level security/i.test(error.message)) return MESSAGES['42501']!
  return 'Something went wrong. Please try again.'
}
