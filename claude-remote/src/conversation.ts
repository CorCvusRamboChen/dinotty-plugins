import type { PluginContext } from '../../plugin-api/index'
import type { Message, TurnSnapshot } from './reduce'

/**
 * Browser-side conversation state for one pane.
 *
 * A turn runs as a **managed process**, not through `ctx.exec.spawn`. The spawn
 * WebSocket owns the child's lifetime — when that socket closes, the host kills
 * the process, regardless of `lifecycle.scope` — so a phone locking its screen
 * mid-turn would kill the turn. `ctx.process.start` is supervised independently
 * and survives.
 *
 * The cost is that a managed process's stdout is unreadable: it is drained into
 * a bounded host-side buffer with no API in front of it. So the sidecar writes
 * its reduced state to `<turnId>-log.json` and the pane polls it with
 * `ctx.storage.get()`. Polling is also what makes reconnecting work: picking a
 * turn back up is just resuming the poll, from any device.
 */

export type { Message, TurnSnapshot }

export interface ConversationState {
  /** Completed turns, oldest first. */
  history: Message[]
  /** The turn currently running, if any. */
  live: Message[]
  draft: string
  sending: boolean
  sessionId: string | null
  model: string | null
  lastCostUsd: number | null
  permissionMode: string
  /** True when this pane attached to a turn it did not start. */
  reattached: boolean
}

export interface Conversation {
  state: ConversationState
  send(prompt: string): Promise<void>
  interrupt(): Promise<void>
  reset(): void
  restore(): Promise<void>
  dispose(): void
}

interface PersistedSession {
  sessionId?: string
  model?: string
  history?: Message[]
  /** Set while a turn is in flight, so a reload can find it again. */
  activeTurnId?: string
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
const POLL_INTERVAL_MS = 250
/** A snapshot that stops advancing while no process owns it is a dead turn. */
const STALE_AFTER_MS = 15_000
/** Keep the transcript bounded; this is a live pane, not a history browser. */
const MAX_HISTORY_MESSAGES = 200

export function createConversation(
  ctx: PluginContext,
  paneKey: string,
  onError: (message: string) => void,
): Conversation {
  const state = ctx.reactive<ConversationState>({
    history: [],
    live: [],
    draft: '',
    sending: false,
    sessionId: null,
    model: null,
    lastCostUsd: null,
    permissionMode: DEFAULT_PERMISSION_MODE,
    reattached: false,
  }) as ConversationState

  // Keyed by pane so two panes are two conversations, and so a reopened pane
  // resumes where it left off. Storage keys may not contain path separators.
  const sessionKey = `session-${paneKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`

  let activeTurnId: string | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  async function loadSession(): Promise<PersistedSession | undefined> {
    try {
      return await ctx.storage.get<PersistedSession>(sessionKey)
    } catch {
      return undefined
    }
  }

  async function saveSession(patch: Partial<PersistedSession>): Promise<void> {
    try {
      const existing = (await loadSession()) ?? {}
      await ctx.storage.set(sessionKey, { ...existing, ...patch })
    } catch (e) {
      onError(`could not persist session: ${describe(e)}`)
    }
  }

  function absorbSnapshot(snapshot: TurnSnapshot): void {
    state.live = snapshot.messages
    if (snapshot.sessionId) state.sessionId = snapshot.sessionId
    if (snapshot.model) state.model = snapshot.model
    if (snapshot.costUsd !== null) state.lastCostUsd = snapshot.costUsd
  }

  async function finishTurn(snapshot: TurnSnapshot | null): Promise<void> {
    if (snapshot) {
      state.history.push(...snapshot.messages)
      if (state.history.length > MAX_HISTORY_MESSAGES) {
        state.history.splice(0, state.history.length - MAX_HISTORY_MESSAGES)
      }
    }
    state.live = []
    state.sending = false
    state.reattached = false
    const finishedTurnId = activeTurnId
    activeTurnId = null
    await saveSession({
      sessionId: state.sessionId ?? undefined,
      model: state.model ?? undefined,
      history: state.history,
      activeTurnId: undefined,
    })
    if (finishedTurnId) {
      try { await ctx.storage.delete(`${finishedTurnId}-log`) } catch { /* already gone */ }
    }
  }

  /**
   * Follow a turn by polling its snapshot. Safe to call for a turn this pane
   * started and for one it is picking up after a reconnect.
   */
  function follow(turnId: string): void {
    activeTurnId = turnId
    state.sending = true
    let lastSeenAt = Date.now()
    let lastUpdatedAt = -1

    const tick = async () => {
      if (disposed || activeTurnId !== turnId) return
      let snapshot: TurnSnapshot | undefined
      try {
        snapshot = await ctx.storage.get<TurnSnapshot>(`${turnId}-log`)
      } catch {
        // The sidecar may not have written the first snapshot yet.
        snapshot = undefined
      }

      if (snapshot) {
        if (snapshot.updatedAt !== lastUpdatedAt) {
          lastUpdatedAt = snapshot.updatedAt
          lastSeenAt = Date.now()
        }
        absorbSnapshot(snapshot)
        if (snapshot.status !== 'running') {
          await finishTurn(snapshot)
          return
        }
      }

      // A turn whose snapshot stops advancing has lost its process — the host
      // restarted, or the sidecar died before it could write a final state.
      // Without this the pane would spin on a turn that will never finish.
      if (Date.now() - lastSeenAt > STALE_AFTER_MS && !(await isTurnRunning(turnId))) {
        state.live = [
          ...(snapshot?.messages ?? []),
          { role: 'error', text: 'This turn stopped without finishing.' },
        ]
        await finishTurn({
          ...(snapshot ?? emptySnapshot(turnId)),
          status: 'failed',
          messages: state.live,
        })
        return
      }

      pollTimer = setTimeout(() => { void tick() }, POLL_INTERVAL_MS)
    }

    void tick()
  }

  async function isTurnRunning(turnId: string): Promise<boolean> {
    try {
      const processes = await ctx.process.list()
      return processes.some(p => p.state === 'running' && p.args.includes(turnId))
    } catch {
      // If we cannot tell, assume it is alive rather than killing a live turn.
      return true
    }
  }

  async function restore(): Promise<void> {
    const saved = await loadSession()
    if (!saved) return
    if (saved.sessionId) state.sessionId = saved.sessionId
    if (saved.model) state.model = saved.model
    if (saved.history?.length) state.history = saved.history

    // A turn was in flight when this pane last went away. If its process is
    // still running, or it left a finished snapshot we never consumed, pick it
    // up instead of losing the answer.
    if (saved.activeTurnId) {
      state.reattached = true
      follow(saved.activeTurnId)
    }
  }

  async function send(prompt: string): Promise<void> {
    const trimmed = prompt.trim()
    if (!trimmed || state.sending) return

    const turnId = nextTurnId()
    state.draft = ''
    state.live = [{ role: 'user', text: trimmed }]
    state.sending = true

    try {
      // The prompt travels through storage, not argv: process args are visible
      // in `process.list()` and spawn args ride in a URL query string.
      await ctx.storage.set(turnId, {
        prompt: trimmed,
        cwd: ctx.terminal.activeCwd() ?? undefined,
        resumeSessionId: state.sessionId ?? undefined,
        permissionMode: state.permissionMode,
        partialMessages: true,
      })
      // Recorded before the process starts: if the browser dies in between, the
      // pane can still find the turn and decide what happened to it.
      await saveSession({ activeTurnId: turnId })

      // --stdin-lease matches bin.lifecycle.stdinLease: it tells the sidecar
      // that a closed stdin means "stop", not "never had one". --persist makes
      // it write the snapshot this pane polls.
      await ctx.process.start(['turn', turnId, '--stdin-lease', '--persist'])

      follow(turnId)
    } catch (e) {
      state.live = [...state.live, { role: 'error', text: describe(e) }]
      state.sending = false
      await saveSession({ activeTurnId: undefined })
      try { await ctx.storage.delete(turnId) } catch { /* nothing staged */ }
    }
  }

  /**
   * End the running turn without abandoning it.
   *
   * `ctx.process.stop(pid)` triggers the stdin lease: the sidecar receives the
   * shutdown line and SIGINTs Claude, so the turn ends cleanly instead of being
   * left unfinished in the session transcript. The turn id is in the process
   * args, which is how the right pid is found.
   */
  async function interrupt(): Promise<void> {
    if (!state.sending || !activeTurnId) return
    try {
      const processes = await ctx.process.list()
      const match = processes.find(p => p.state === 'running' && p.args.includes(activeTurnId!))
      if (match) {
        await ctx.process.stop(match.pid)
        return // The snapshot will report the stop; the poll picks it up.
      }
      // Nothing is running: the turn already ended and the poll will settle it.
      onError('nothing to interrupt — the turn already ended')
    } catch (e) {
      onError(`interrupt failed: ${describe(e)}`)
    }
  }

  function reset(): void {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    activeTurnId = null
    state.history = []
    state.live = []
    state.sending = false
    state.reattached = false
    state.sessionId = null
    state.model = null
    state.lastCostUsd = null
    void ctx.storage.delete(sessionKey).catch(() => { /* nothing stored yet */ })
  }

  function dispose(): void {
    disposed = true
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    // Deliberately does NOT stop the turn: surviving an unmount is the point.
  }

  return { state, send, interrupt, reset, restore, dispose }
}

function emptySnapshot(turnId: string): TurnSnapshot {
  return {
    turnId,
    status: 'failed',
    sessionId: null,
    model: null,
    messages: [],
    costUsd: null,
    updatedAt: Date.now(),
  }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
