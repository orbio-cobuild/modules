/** Escaping and templates. Template variables are escaped for the channel; template text is not. */

export type ParseMode = 'HTML' | 'MarkdownV2' | 'plain'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Telegram MarkdownV2 needs these escaped everywhere outside entities. */
export function escapeMarkdownV2(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)
}

export function escapeFor(mode: ParseMode, s: string): string {
  return mode === 'HTML' ? escapeHtml(s) : mode === 'MarkdownV2' ? escapeMarkdownV2(s) : s
}

/** Fills {{name}} placeholders. A missing variable is an error, so half-filled messages never go out. */
export function renderTemplate(body: string, vars: Record<string, string | number>, mode: ParseMode = 'plain'): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => {
    if (!(k in vars)) throw new Error(`The message template needs a value for "${k}".`)
    return escapeFor(mode, String(vars[k]))
  })
}

/** Plain text version of an HTML Telegram/email message (for email text bodies and the claims filter). */
export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
