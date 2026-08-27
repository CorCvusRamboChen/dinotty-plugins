import type { PluginContext } from '../../plugin-api/index'
import type { Message } from './reduce'
import type { PeerSession } from './peers'

/**
 * Browser-side state for watching another session's conversation live.
 *
 * This is read-only on purpose. It follows a transcript that Claude Desktop (or
 * a terminal `claude`) is writing, so a phone can watch the work happen without
 * that session having Remote Control on, without credentials, and without any
 * traffic leaving the machine. Sending into the watched session is a separate,
 * harder problem; this half needs none of it.
 *
 * The pane cannot read `~/.claude` itself, so both the peer list and the
 * transcript come through the sidecar.
 */

export interface MirrorState {
  /** Live sessions on this machine, refreshed on demand. */
  peers: PeerSession[]
  peersLoading: boolean
  /** The session currently being watched, if any. */
  watching: PeerSession | null
  messages: Message[]
  /** True while the follow loop is running. */
  following: boolean
  error: string | null
}

export interface Mirror {
  state: MirrorState
  refreshPeers(): Promise<void>
  watch(peer: PeerSession): Promise<void>
  stop(): void
  dispose(): void
}

const POLL_INTERVAL_MS = 1000
/** A live conversation can be long; keep the view bounded. */
const MAX_MESSAGES = 300

export function createMirror(ctx: PluginContext): Mirror {
  const state = ctx.reactive<MirrorState>({
    peers: [],
    peersLoading: false,
    watching: null,
    messages: [],
    following: false,
    error: null,
  }) as MirrorState

  let offset = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let generation = 0

  async function callSidecar(args: string[]): Promise<any | null> {
    const res = await ctx.exec.run(args, { timeout: 20_000 })
    if (res.code !== 0) {
      state.error = res.stderr.trim() || `sidecar exited with code ${res.code}`
      return null
    }
    for (const line of res.stdout.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed?.type === 'error') { state.error = String(parsed.error); return null }
        return parsed
      } catch { /* not our line */ }
    }
    return null
  }

  async function refreshPeers(): Promise<void> {
    if (state.peersLoading) return
    state.peersLoading = true
    state.error = null
    try {
      const parsed = await callSidecar(['peers'])
      if (parsed?.type === 'peers') {
        // Only sessions other than this pane's own turns are worth watching,
        // and a dead registration cannot be followed live.
        state.peers = (parsed.peers as PeerSession[]).filter(p => p.alive)
      }
    } catch (e) {
      state.error = describe(e)
    } finally {
      state.peersLoading = false
    }
  }

  function scheduleTick(mine: number): void {
    timer = setTimeout(() => { void tick(mine) }, POLL_INTERVAL_MS)
  }

  async function tick(mine: number): Promise<void> {
    if (disposed || mine !== generation || !state.watching) return
    try {
      const parsed = await callSidecar([
        'mirror', state.watching.cwd, state.watching.sessionId, String(offset),
      ])
      if (mine !== generation) return // A newer watch superseded this one.
      if (parsed?.type === 'mirror') {
        if (!parsed.continuous) {
          // The transcript was rewritten (/clear or compaction) or vanished;
          // start over rather than splicing the middle of a new file in.
          offset = 0
          state.messages = []
        } else {
          if (parsed.messages.length) {
            state.messages.push(...(parsed.messages as Message[]))
            if (state.messages.length > MAX_MESSAGES) {
              state.messages.splice(0, state.messages.length - MAX_MESSAGES)
            }
          }
          offset = parsed.offset
        }
      }
    } catch (e) {
      state.error = describe(e)
    } finally {
      if (!disposed && mine === generation && state.watching) scheduleTick(mine)
    }
  }

  async function watch(peer: PeerSession): Promise<void> {
    stop()
    state.watching = peer
    state.messages = []
    state.error = null
    state.following = true
    offset = 0
    const mine = ++generation
    await tick(mine)
  }

  function stop(): void {
    if (timer) { clearTimeout(timer); timer = null }
    generation++
    state.following = false
    state.watching = null
  }

  function dispose(): void {
    disposed = true
    if (timer) { clearTimeout(timer); timer = null }
  }

  return { state, refreshPeers, watch, stop, dispose }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
