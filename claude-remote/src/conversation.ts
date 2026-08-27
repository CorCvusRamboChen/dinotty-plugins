import type { PluginContext } from '../../plugin-api/index'
import type { Message, TurnSnapshot } from './reduce'
import type { ApprovalRequest } from './mcp-permission'
import type { SessionSummary } from './sessions'

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

export type { Message, TurnSnapshot, ApprovalRequest, SessionSummary }

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
  /** Tools the current session exposes, from system/init. */
  tools: string[]
  /** Tools pre-approved for this pane, passed as --allowedTools. */
  allowedTools: string[]
  /** Ask the pane about every tool call instead of relying on the mode. */
  perCallApproval: boolean
  /** Set while Claude is waiting on an Allow / Deny from this pane. */
  pendingApproval: ApprovalRequest | null
  /** True when this pane attached to a turn it did not start. */
  reattached: boolean
  /** Sessions on this machine that can be picked up, newest first. */
  sessions: SessionSummary[]
  sessionsLoading: boolean
  /** Whether the session picker is open in this pane. */
  pickerOpen: boolean
  /** Set when the session was adopted rather than started here. */
  attachedTitle: string | null
}

export interface Conversation {
  state: ConversationState
  send(prompt: string): Promise<void>
  interrupt(): Promise<void>
  decide(behavior: 'allow' | 'deny'): Promise<void>
  refreshSessions(): Promise<void>
  attachSession(session: SessionSummary): Promise<void>
  setAllowedTools(tools: string[]): void
  setPerCallApproval(enabled: boolean): void
  reset(): void
  restore(): Promise<void>
  dispose(): void
}

interface PersistedSession {
  sessionId?: string
  model?: string
  history?: Message[]
  allowedTools?: string[]
  perCallApproval?: boolean
  attachedTitle?: string
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
    tools: [],
    allowedTools: [],
    perCallApproval: false,
    pendingApproval: null,
    reattached: false,
    sessions: [],
    sessionsLoading: false,
    pickerOpen: false,
    attachedTitle: null,
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
    if (snapshot.tools?.length) state.tools = snapshot.tools
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
    state.pendingApproval = null
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

      // The permission server writes to its own file, because the snapshot is
      // rewritten wholesale by the turn runner and two writers would race.
      try {
        state.pendingApproval = (await ctx.storage.get<ApprovalRequest>(`${turnId}-ask`)) ?? null
      } catch {
        state.pendingApproval = null
      }
      if (state.pendingApproval) lastSeenAt = Date.now()

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
    if (saved.allowedTools) state.allowedTools = saved.allowedTools
    if (saved.perCallApproval !== undefined) state.perCallApproval = saved.perCallApproval
    if (saved.attachedTitle) state.attachedTitle = saved.attachedTitle

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
        allowedTools: state.allowedTools.length ? state.allowedTools : undefined,
        perCallApproval: state.perCallApproval,
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

  /**
   * Answer the pending permission prompt.
   *
   * The MCP permission server is blocking on this file; it deletes the decision
   * once it reads it. Nothing else needs to happen — the turn resumes on its
   * own and the next poll shows the result.
   */
  async function decide(behavior: 'allow' | 'deny'): Promise<void> {
    const pending = state.pendingApproval
    if (!pending || !activeTurnId) return
    try {
      await ctx.storage.set(`${activeTurnId}-decision`, {
        id: pending.id,
        behavior,
        message: behavior === 'deny' ? 'Denied from the Claude Remote pane' : undefined,
      })
      // Clear locally so the buttons cannot be double-submitted while the
      // server picks the decision up.
      state.pendingApproval = null
    } catch (e) {
      onError(`could not record the decision: ${describe(e)}`)
    }
  }

  function setAllowedTools(tools: string[]): void {
    state.allowedTools = tools
    void saveSession({ allowedTools: tools })
  }

  function setPerCallApproval(enabled: boolean): void {
    state.perCallApproval = enabled
    void saveSession({ perCallApproval: enabled })
  }

  /**
   * List the sessions already on this machine.
   *
   * The pane cannot read `~/.claude/projects` itself, so this goes through the
   * sidecar like everything else that touches the filesystem.
   */
  async function refreshSessions(): Promise<void> {
    if (state.sessionsLoading) return
    state.sessionsLoading = true
    try {
      const cwd = ctx.terminal.activeCwd()
      if (!cwd) {
        onError('no working directory yet — open a terminal tab first')
        state.sessions = []
        return
      }
      const res = await ctx.exec.run(['sessions', cwd], { timeout: 20_000 })
      if (res.code !== 0) {
        onError(res.stderr.trim() || `sidecar exited with code ${res.code}`)
        return
      }
      for (const line of res.stdout.split('\n')) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed?.type === 'sessions') { state.sessions = parsed.sessions; return }
          if (parsed?.type === 'error') { onError(String(parsed.error)); return }
        } catch { /* not our line */ }
      }
    } catch (e) {
      onError(describe(e))
    } finally {
      state.sessionsLoading = false
    }
  }

  /**
   * Continue an existing session in this pane.
   *
   * Only the id is adopted: the transcript stays where Claude keeps it, and the
   * next send passes `--resume`, so the full history comes back into context
   * without this pane having to reproduce it.
   */
  async function attachSession(session: SessionSummary): Promise<void> {
    if (state.sending) return
    state.sessionId = session.id
    state.attachedTitle = session.title
    state.pickerOpen = false
    state.history = []
    state.live = []
    state.lastCostUsd = null
    state.history.push({
      role: 'system',
      text: `Continuing "${session.title}" (${session.id.slice(0, 8)}). Earlier messages stay in Claude's own transcript; they are not reprinted here.`,
    })
    await saveSession({
      sessionId: session.id,
      attachedTitle: session.title,
      history: state.history,
    })
  }

  function reset(): void {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    activeTurnId = null
    state.history = []
    state.live = []
    state.sending = false
    state.reattached = false
    state.pendingApproval = null
    state.sessionId = null
    state.model = null
    state.lastCostUsd = null
    state.attachedTitle = null
    void ctx.storage.delete(sessionKey).catch(() => { /* nothing stored yet */ })
  }

  function dispose(): void {
    disposed = true
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    // Deliberately does NOT stop the turn: surviving an unmount is the point.
  }

  return {
    state, send, interrupt, decide, setAllowedTools, setPerCallApproval,
    refreshSessions, attachSession, reset, restore, dispose,
  }
}

function emptySnapshot(turnId: string): TurnSnapshot {
  return {
    turnId,
    status: 'failed',
    sessionId: null,
    model: null,
    messages: [],
    tools: [],
    costUsd: null,
    updatedAt: Date.now(),
  }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
