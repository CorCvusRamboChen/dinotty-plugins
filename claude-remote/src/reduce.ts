import {
  isInit,
  isResult,
  textDelta,
  assistantText,
  type StreamEvent,
} from './protocol'

/**
 * Reduces Claude Code's event stream into a renderable snapshot.
 *
 * This runs in the **sidecar**, not the pane. Two reasons:
 *
 *  - With `--include-partial-messages` a turn emits one event per token.
 *    Persisting the raw log and rewriting it on every event is quadratic;
 *    persisting the reduced state is flat.
 *  - The snapshot is what survives a disconnect, so it has to be complete on
 *    its own — including the user's prompt — for a second device (or the same
 *    pane after a reload) to render the turn without having watched it happen.
 */

export type Role = 'user' | 'assistant' | 'error' | 'system'

export interface Message {
  role: Role
  text: string
  /** True while this assistant message is still receiving tokens. */
  streaming?: boolean
}

export type TurnStatus = 'running' | 'done' | 'failed'

export interface TurnSnapshot {
  turnId: string
  status: TurnStatus
  sessionId: string | null
  model: string | null
  messages: Message[]
  /** Tools this session exposes, from system/init; drives the allowlist UI. */
  tools: string[]
  costUsd: number | null
  exitCode?: number | null
  /** Epoch millis of the last change, so a stalled turn is visible as stalled. */
  updatedAt: number
}

export interface TurnReducer {
  apply(event: StreamEvent): void
  finish(exitCode: number | null): void
  snapshot(): TurnSnapshot
  /** Bumped on every change; lets the writer skip no-op flushes. */
  readonly revision: number
}

export function createTurnReducer(turnId: string, prompt: string, now = Date.now): TurnReducer {
  const messages: Message[] = [{ role: 'user', text: prompt }]
  let sessionId: string | null = null
  let model: string | null = null
  let tools: string[] = []
  let costUsd: number | null = null
  let status: TurnStatus = 'running'
  let exitCode: number | null | undefined
  let revision = 0
  let updatedAt = now()

  function touch(): void {
    revision += 1
    updatedAt = now()
  }

  function currentAssistant(): Message {
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && last.streaming) return last
    const created: Message = { role: 'assistant', text: '', streaming: true }
    messages.push(created)
    return created
  }

  function settleStreaming(): void {
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') delete last.streaming
  }

  const reducer: TurnReducer = {
    get revision() { return revision },

    apply(event: StreamEvent): void {
      if (isInit(event)) {
        sessionId = event.session_id
        if (event.model) model = event.model
        if (Array.isArray(event.tools)) tools = event.tools
        touch()
        return
      }

      const delta = textDelta(event)
      if (delta) {
        currentAssistant().text += delta
        touch()
        return
      }

      const assembled = assistantText(event)
      if (assembled !== null) {
        // The assembled message is authoritative over accumulated deltas: with
        // --include-partial-messages both arrive, and only this one is final.
        currentAssistant().text = assembled
        touch()
        return
      }

      if (isResult(event)) {
        settleStreaming()
        if (typeof event.total_cost_usd === 'number') costUsd = event.total_cost_usd

        // The CLI exits 0 and reports API failures inside the stream, with
        // subtype "success" and is_error true, so this has to be explicit.
        if (event.is_error) {
          const detail = event.result || 'Claude Code reported an error'
          const suffix = event.api_error_status ? ` (HTTP ${event.api_error_status})` : ''
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant' && last.text === detail) {
            // Claude streams the failure as an assistant message first and then
            // repeats it in the result. Promote the one we already have instead
            // of showing the same text twice.
            messages[messages.length - 1] = { role: 'error', text: `${detail}${suffix}` }
          } else {
            messages.push({ role: 'error', text: `${detail}${suffix}` })
          }
        } else if (event.result && !lastAssistantHasText()) {
          messages.push({ role: 'assistant', text: event.result })
        }
        touch()
        return
      }

      if (event.type === 'sidecar') {
        const sidecar = event as { event?: string; error?: string; data?: string }
        if (sidecar.event === 'error') {
          messages.push({ role: 'error', text: sidecar.error ?? 'sidecar error' })
          touch()
        } else if (sidecar.event === 'stderr' && sidecar.data) {
          messages.push({ role: 'system', text: sidecar.data })
          touch()
        } else if (sidecar.event === 'stopping') {
          // Windows has no SIGINT, so the stop is a hard kill and the turn may
          // be left unfinished in the session. Report which one happened rather
          // than implying a clean interrupt everywhere.
          const outcome = (event as { outcome?: string }).outcome
          messages.push({
            role: 'system',
            text: outcome === 'killed'
              ? 'Stopped. Claude was killed rather than interrupted, so this turn may be left unfinished in the session.'
              : 'Interrupted.',
          })
          touch()
        }
      }
      // Unknown event types are ignored on purpose: new `system` subtypes show
      // up between Claude Code releases (a live run produced `system/status`).
    },

    finish(code: number | null): void {
      settleStreaming()
      exitCode = code
      status = code === 0 ? 'done' : 'failed'
      // The stream usually explains the failure better than the exit code does,
      // so only fall back to the code when nothing else was reported.
      if (code !== 0 && !messages.some(m => m.role === 'error')) {
        messages.push({ role: 'error', text: `Claude Code exited with code ${code}` })
      }
      touch()
    },

    snapshot(): TurnSnapshot {
      return {
        turnId,
        status,
        sessionId,
        model,
        tools: [...tools],
        costUsd,
        exitCode,
        updatedAt,
        // Deep enough: messages are flat records, and the consumer only reads.
        messages: messages.map(m => ({ ...m })),
      }
    },
  }

  function lastAssistantHasText(): boolean {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return Boolean(messages[i].text)
    }
    return false
  }

  return reducer
}
