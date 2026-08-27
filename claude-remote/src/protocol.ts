/**
 * Event envelope for `claude -p --output-format stream-json --verbose`.
 *
 * Shapes here were captured from a real run (see `fixtures/`), not inferred from
 * docs. Three things that run counter to the obvious assumptions:
 *
 *  1. `system/init` is NOT guaranteed to be the first line. A `SessionStart`
 *     hook emits `system/hook_started` ahead of it.
 *  2. `result` is NOT the last line. `system/hook_response` arrives after it.
 *     Treat process exit as end-of-stream, never `result`.
 *  3. `capabilities` is absent before Claude Code v2.1.205, so feature
 *     detection has to fall back to `claude_code_version`.
 */

export type StreamEvent =
  | SystemInitEvent
  | SystemGenericEvent
  | AssistantEvent
  | UserEvent
  | ResultEvent
  | StreamDeltaEvent
  | UnknownEvent

export interface SystemInitEvent {
  type: 'system'
  subtype: 'init'
  session_id: string
  uuid: string
  model: string
  cwd: string
  permissionMode: string
  tools: string[]
  slash_commands?: string[]
  skills?: unknown[]
  agents?: unknown[]
  mcp_servers?: Array<{ name: string; status: string }>
  apiKeySource?: string
  claude_code_version?: string
  /** Present from v2.1.205 only. Absent means "fall back to version compare". */
  capabilities?: string[]
}

export interface SystemGenericEvent {
  type: 'system'
  subtype: string
  session_id?: string
  uuid?: string
  [key: string]: unknown
}

export interface AssistantEvent {
  type: 'assistant'
  message?: { content?: Array<{ type: string; text?: string; [k: string]: unknown }> }
  parent_tool_use_id?: string | null
  session_id?: string
}

export interface UserEvent {
  type: 'user'
  message?: { content?: unknown }
  parent_tool_use_id?: string | null
  session_id?: string
}

export interface StreamDeltaEvent {
  type: 'stream_event'
  event?: { delta?: { type?: string; text?: string } }
  session_id?: string
}

export interface ResultEvent {
  type: 'result'
  subtype: string
  is_error: boolean
  /** Set when the failure came back from the API rather than the CLI. */
  api_error_status?: number
  result?: string
  session_id: string
  total_cost_usd?: number
  num_turns?: number
  usage?: Record<string, unknown>
}

export interface UnknownEvent {
  type: string
  [key: string]: unknown
}

/** A parsed line, or a parse failure we chose not to throw on. */
export type ParsedLine =
  | { ok: true; event: StreamEvent }
  | { ok: false; raw: string; error: string }

/**
 * Incremental NDJSON reader. `exec.spawn` hands us arbitrary chunks, so lines
 * split across chunk boundaries; anything that assumes chunk == line drops
 * events under load.
 */
export class NdjsonReader {
  private buffer = ''

  push(chunk: string): ParsedLine[] {
    this.buffer += chunk
    const out: ParsedLine[] = []
    let index: number
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '')
      this.buffer = this.buffer.slice(index + 1)
      if (line.trim()) out.push(parseLine(line))
    }
    return out
  }

  /** Call on process exit: the last line may have no trailing newline. */
  flush(): ParsedLine[] {
    const line = this.buffer.replace(/\r$/, '')
    this.buffer = ''
    return line.trim() ? [parseLine(line)] : []
  }
}

function parseLine(line: string): ParsedLine {
  try {
    return { ok: true, event: JSON.parse(line) as StreamEvent }
  } catch (e) {
    // A non-JSON line is usually a CLI warning on stderr-turned-stdout. Surface
    // it rather than crashing the pane.
    return { ok: false, raw: line, error: e instanceof Error ? e.message : String(e) }
  }
}

export function isInit(e: StreamEvent): e is SystemInitEvent {
  return e.type === 'system' && (e as SystemGenericEvent).subtype === 'init'
}

export function isResult(e: StreamEvent): e is ResultEvent {
  return e.type === 'result'
}

/** Text deltas, for incremental rendering with `--include-partial-messages`. */
export function textDelta(e: StreamEvent): string | null {
  if (e.type !== 'stream_event') return null
  const delta = (e as StreamDeltaEvent).event?.delta
  return delta?.type === 'text_delta' && typeof delta.text === 'string' ? delta.text : null
}

/** Assembled assistant text, for runs without partial messages. */
export function assistantText(e: StreamEvent): string | null {
  if (e.type !== 'assistant') return null
  const parts = (e as AssistantEvent).message?.content
  if (!Array.isArray(parts)) return null
  const text = parts
    .filter(p => p?.type === 'text' && typeof p.text === 'string')
    .map(p => p.text as string)
    .join('')
  return text || null
}
