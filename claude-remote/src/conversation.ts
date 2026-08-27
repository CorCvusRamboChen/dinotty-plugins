import type { PluginContext, SpawnHandle } from '../../plugin-api/index'
import {
  NdjsonReader,
  isInit,
  isResult,
  textDelta,
  assistantText,
  type StreamEvent,
} from './protocol'

/**
 * Browser-side conversation state for one pane.
 *
 * One instance per pane. The pane never talks to Claude directly — it stages a
 * request through `ctx.storage`, spawns the sidecar, and consumes the NDJSON it
 * forwards.
 */

export type Role = 'user' | 'assistant' | 'error' | 'system'

export interface Message {
  role: Role
  text: string
  /** Set while the assistant message is still streaming. */
  streaming?: boolean
}

export interface ConversationState {
  messages: Message[]
  draft: string
  sending: boolean
  sessionId: string | null
  model: string | null
  lastCostUsd: number | null
  permissionMode: string
}

export interface Conversation {
  state: ConversationState
  send(prompt: string): Promise<void>
  interrupt(): Promise<void>
  reset(): void
  restore(): Promise<void>
}

/**
 * `crypto.randomUUID()` is undefined on insecure origins, and reaching dinotty
 * from a phone means plain `http://<lan-ip>:8999`. This is only a storage key
 * and a process-matching token, so a counter plus a timestamp is enough.
 */
let turnCounter = 0
function nextTurnId(): string {
  turnCounter += 1
  const random = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return `turn-${Date.now().toString(36)}-${turnCounter}-${random}`
}

const DEFAULT_PERMISSION_MODE = 'acceptEdits'

export function createConversation(
  ctx: PluginContext,
  paneKey: string,
  onError: (message: string) => void,
): Conversation {
  const state = ctx.reactive<ConversationState>({
    messages: [],
    draft: '',
    sending: false,
    sessionId: null,
    model: null,
    lastCostUsd: null,
    permissionMode: DEFAULT_PERMISSION_MODE,
  }) as ConversationState

  // Keyed by pane so two panes are two conversations, and so a reopened pane
  // resumes where it left off. Storage keys may not contain path separators.
  const sessionKey = `session-${paneKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`

  let activeTurnId: string | null = null
  let activeHandle: SpawnHandle | null = null

  async function restore(): Promise<void> {
    try {
      const saved = await ctx.storage.get<{ sessionId?: string; model?: string }>(sessionKey)
      if (saved?.sessionId) {
        state.sessionId = saved.sessionId
        state.model = saved.model ?? null
        state.messages.push({
          role: 'system',
          text: `Resuming session ${saved.sessionId.slice(0, 8)}…`,
        })
      }
    } catch {
      // A missing key is the normal first-run case.
    }
  }

  async function persistSession(): Promise<void> {
    if (!state.sessionId) return
    try {
      await ctx.storage.set(sessionKey, { sessionId: state.sessionId, model: state.model })
    } catch (e) {
      onError(`could not persist session id: ${describe(e)}`)
    }
  }

  function currentAssistant(): Message {
    const last = state.messages[state.messages.length - 1]
    if (last?.role === 'assistant' && last.streaming) return last
    const created: Message = { role: 'assistant', text: '', streaming: true }
    state.messages.push(created)
    return created
  }

  function dispatch(event: StreamEvent): void {
    if (isInit(event)) {
      // Claude assigns the session id; resuming reuses the same one.
      state.sessionId = event.session_id
      state.model = event.model ?? state.model
      void persistSession()
      return
    }

    const delta = textDelta(event)
    if (delta) {
      currentAssistant().text += delta
      return
    }

    const assembled = assistantText(event)
    if (assembled !== null) {
      // The complete message is authoritative over accumulated deltas: with
      // --include-partial-messages both arrive, and only this one is final.
      currentAssistant().text = assembled
      return
    }

    if (isResult(event)) {
      const streaming = state.messages[state.messages.length - 1]
      if (streaming?.role === 'assistant') streaming.streaming = false
      state.lastCostUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null

      // The CLI exits 0 and reports API failures inside the stream, with
      // subtype "success" and is_error true, so this has to be explicit.
      if (event.is_error) {
        const detail = event.result || 'Claude Code reported an error'
        const status = event.api_error_status ? ` (HTTP ${event.api_error_status})` : ''
        state.messages.push({ role: 'error', text: `${detail}${status}` })
        return
      }
      // No assistant text arrived (a tool-only turn, say) but the result has it.
      if (event.result && !streaming?.text) {
        state.messages.push({ role: 'assistant', text: event.result })
      }
      return
    }

    if (event.type === 'sidecar') {
      const sidecar = event as { event?: string; error?: string; data?: string }
      if (sidecar.event === 'error') {
        state.messages.push({ role: 'error', text: sidecar.error ?? 'sidecar error' })
      } else if (sidecar.event === 'stderr' && sidecar.data) {
        // Claude writes startup warnings here; surface them without derailing.
        state.messages.push({ role: 'system', text: sidecar.data })
      } else if (sidecar.event === 'stopping') {
        state.messages.push({ role: 'system', text: 'Interrupted.' })
      }
    }
  }

  async function drain(stream: ReadableStream<string>, onChunk: (chunk: string) => void) {
    const reader = stream.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) onChunk(value)
      }
    } finally {
      reader.releaseLock()
    }
  }

  async function send(prompt: string): Promise<void> {
    const trimmed = prompt.trim()
    if (!trimmed || state.sending) return

    state.messages.push({ role: 'user', text: trimmed })
    state.draft = ''
    state.sending = true

    const turnId = nextTurnId()
    activeTurnId = turnId

    const reader = new NdjsonReader()
    const consume = (chunk: string) => {
      for (const parsed of reader.push(chunk)) {
        if (parsed.ok) dispatch(parsed.event)
        else onError(`unparseable line from sidecar: ${parsed.raw.slice(0, 200)}`)
      }
    }

    try {
      // The prompt travels through storage, not argv: spawn args are carried in
      // a WebSocket URL query string.
      await ctx.storage.set(turnId, {
        prompt: trimmed,
        cwd: ctx.terminal.activeCwd() ?? undefined,
        resumeSessionId: state.sessionId ?? undefined,
        permissionMode: state.permissionMode,
        partialMessages: true,
      })

      // --stdin-lease matches bin.lifecycle.stdinLease in the manifest: it tells
      // the sidecar that a closed stdin means "stop", not "never had one".
      const handle = ctx.exec.spawn(['turn', turnId, '--stdin-lease'])
      activeHandle = handle

      await Promise.all([
        drain(handle.stdout, consume),
        drain(handle.stderr, chunk => onError(chunk.trim())),
      ])

      for (const parsed of reader.flush()) {
        if (parsed.ok) dispatch(parsed.event)
      }
    } catch (e) {
      state.messages.push({ role: 'error', text: describe(e) })
    } finally {
      const last = state.messages[state.messages.length - 1]
      if (last?.role === 'assistant') last.streaming = false
      state.sending = false
      activeHandle = null
      activeTurnId = null
      // Best effort: the sidecar deletes the staged file itself, so this only
      // matters when the spawn never happened.
      try { await ctx.storage.delete(turnId) } catch { /* already gone */ }
    }
  }

  /**
   * End the running turn without abandoning it.
   *
   * `SpawnHandle.kill()` closes the WebSocket, and the host reacts to that by
   * hard-killing the sidecar — which would leave the turn unfinished in the
   * session. The graceful path is `process.stop(pid)`: that triggers the stdin
   * lease, the sidecar receives the shutdown line, and it SIGINTs Claude so the
   * turn ends properly. The turn id is in the process args, which is how the
   * right pid is found.
   */
  async function interrupt(): Promise<void> {
    if (!state.sending) return
    const turnId = activeTurnId
    try {
      if (turnId) {
        const processes = await ctx.process.list()
        const match = processes.find(p => p.state === 'running' && p.args.includes(turnId))
        if (match) {
          await ctx.process.stop(match.pid)
          return
        }
      }
      // Nothing to stop gracefully; fall back to tearing the stream down.
      activeHandle?.kill()
      state.messages.push({
        role: 'system',
        text: 'Interrupted abruptly — this turn may be left unfinished in the session.',
      })
    } catch (e) {
      onError(`interrupt failed: ${describe(e)}`)
    }
  }

  function reset(): void {
    state.messages.splice(0, state.messages.length)
    state.sessionId = null
    state.model = null
    state.lastCostUsd = null
    void ctx.storage.delete(sessionKey).catch(() => { /* nothing stored yet */ })
  }

  return { state, send, interrupt, reset, restore }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
