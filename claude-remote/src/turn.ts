/**
 * Sidecar-side turn runner.
 *
 * The prompt is NOT passed as an argument. `ctx.exec.spawn` puts its args in a
 * WebSocket URL query string, so a long or multi-line prompt would hit URL
 * length limits and encoding edge cases. Instead the pane stages the request
 * with `ctx.storage.set()`, which the host writes to
 * `$DINOTTY_PLUGIN_DATA_DIR/<key>.json`, and passes only the key.
 *
 * Output does not go back over a socket either. A managed process's stdout is
 * drained into a bounded host-side buffer that no plugin API can read, so the
 * turn writes its own reduced state to `<turnId>-log.json` in that same
 * directory, where the pane picks it up with `ctx.storage.get()`. That file is
 * what lets a turn survive the browser going away.
 *
 * stdout stays a verbatim passthrough of Claude Code's NDJSON so the sidecar is
 * still debuggable by hand.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import type { ChildProcess } from 'node:child_process'

import { locateClaude, spawnTurn, interruptTurn, type SpawnOptions } from './claude'
import { createTurnReducer, type TurnReducer } from './reduce'
import { mcpConfigDocument, PERMISSION_TOOL_ID } from './mcp-permission'
import type { StreamEvent } from './protocol'

export interface TurnRequest extends SpawnOptions {
  prompt: string
  /** Route each unapproved tool call to the pane instead of a permission mode. */
  perCallApproval?: boolean
}

/**
 * Point Claude at this plugin's own MCP permission server.
 *
 * Returns the extra argv, or null when the request did not ask for it. The
 * config file lives beside the turn's other state and is cleaned up with it.
 */
function perCallApprovalArgs(turnId: string, dataDir: string): string[] | null {
  if (!dataDir) return null
  const configPath = path.join(dataDir, `${turnId}-mcp.json`)
  try {
    fs.writeFileSync(configPath, mcpConfigDocument(turnId, dataDir), 'utf-8')
  } catch {
    return null
  }
  // Deliberately not --strict-mcp-config: that would drop the user's own MCP
  // servers for the turn, which is not ours to decide.
  return ['--mcp-config', configPath, '--permission-prompt-tool', PERMISSION_TOOL_ID]
}

/** Snapshots are rewritten in place, so flushing on every token would thrash. */
const FLUSH_INTERVAL_MS = 150

function emit(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + '\n')
}

/** Storage keys are a single path segment; refuse anything that escapes. */
function isSafeKey(key: string): boolean {
  return Boolean(key) && !key.includes('/') && !key.includes('\\') && key !== '.' && key !== '..'
}

export function readRequest(key: string): TurnRequest | { error: string } {
  const dataDir = process.env.DINOTTY_PLUGIN_DATA_DIR
  if (!dataDir) return { error: 'DINOTTY_PLUGIN_DATA_DIR is not set' }
  if (!isSafeKey(key)) return { error: `unsafe turn key: ${key}` }

  const file = path.join(dataDir, `${key}.json`)
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (e) {
    return { error: `cannot read staged turn ${key}: ${e instanceof Error ? e.message : e}` }
  } finally {
    // The prompt is user content; don't leave it on disk past this read.
    try { fs.unlinkSync(file) } catch { /* already gone */ }
  }

  try {
    const parsed = JSON.parse(raw) as TurnRequest
    if (typeof parsed?.prompt !== 'string' || !parsed.prompt) {
      return { error: 'staged turn has no prompt' }
    }
    return parsed
  } catch (e) {
    return { error: `staged turn is not valid JSON: ${e instanceof Error ? e.message : e}` }
  }
}

/**
 * Persists the reduced turn where `ctx.storage.get()` can read it.
 *
 * The write is staged through a temp file and renamed, because a reader that
 * catches a half-written file gets a 500 "corrupt data" from the host rather
 * than a retryable empty result. The temp name ends in `.tmp`, which the host's
 * key listing ignores.
 */
export function createSnapshotWriter(turnId: string, dataDir: string) {
  const target = path.join(dataDir, `${turnId}-log.json`)
  const staging = `${target}.tmp`
  let lastRevision = -1
  let timer: NodeJS.Timeout | null = null

  function writeNow(reducer: TurnReducer): void {
    if (reducer.revision === lastRevision) return
    lastRevision = reducer.revision
    try {
      fs.writeFileSync(staging, JSON.stringify(reducer.snapshot()), 'utf-8')
      fs.renameSync(staging, target)
    } catch (e) {
      emit({ type: 'sidecar', event: 'error', error: `snapshot write failed: ${describe(e)}` })
    }
  }

  return {
    /** Coalescing flush: at most one write per interval while tokens stream. */
    schedule(reducer: TurnReducer): void {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        writeNow(reducer)
      }, FLUSH_INTERVAL_MS)
      timer.unref?.()
    },
    flush(reducer: TurnReducer): void {
      if (timer) { clearTimeout(timer); timer = null }
      writeNow(reducer)
    },
  }
}

/** Split a byte stream into lines without dropping a partial trailing line. */
function forwardLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise(resolve => {
    let buffer = ''
    stream.setEncoding('utf-8')
    stream.on('data', (chunk: string) => {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (line) onLine(line)
      }
    })
    stream.on('end', () => {
      const tail = buffer.replace(/\r$/, '')
      if (tail) onLine(tail)
      resolve()
    })
    stream.on('error', () => resolve())
  })
}

/**
 * Wire the host's stop protocol.
 *
 * With `bin.lifecycle.stdinLease`, a graceful stop arrives as a single
 * `{"type":"shutdown","deadlineMs":N}` line on stdin. Losing stdin entirely
 * (the host died) has to count as a stop too, otherwise the claude child
 * outlives its supervisor.
 *
 * Either way we interrupt rather than kill: SIGINT ends the turn cleanly, while
 * a hard kill leaves it unfinished in the session transcript.
 */
function installStopHandlers(
  child: ChildProcess,
  stdinLease: boolean,
  onStop: (reason: string, outcome: string) => void,
): () => void {
  // Without a lease the host gives us no stdin, and a closed stdin would
  // otherwise read as an immediate stop and kill the turn the moment it starts.
  if (!stdinLease) return () => { /* nothing wired */ }

  let stopped = false
  const stop = (reason: string) => {
    if (stopped) return
    stopped = true
    onStop(reason, interruptTurn(child))
  }

  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', line => {
    if (!line.trim()) return
    try {
      const msg = JSON.parse(line)
      if (msg?.type === 'shutdown' || msg?.type === 'interrupt') stop(msg.type)
    } catch {
      // The host only ever sends JSON control lines; ignore anything else.
    }
  })
  rl.on('close', () => stop('stdin-closed'))

  return () => rl.close()
}

export interface RunTurnOptions {
  stdinLease: boolean
  /** Write `<turnId>-log.json` so the pane can reconnect to a running turn. */
  persist: boolean
}

export async function runTurn(key: string, options: RunTurnOptions): Promise<number> {
  const dataDir = process.env.DINOTTY_PLUGIN_DATA_DIR ?? ''
  const persist = options.persist && Boolean(dataDir)
  const request = readRequest(key)

  if ('error' in request) {
    const failure = { type: 'sidecar', event: 'error', error: request.error }
    emit(failure)
    if (persist) {
      // Still leave a snapshot: a pane that only polls would otherwise wait
      // forever on a turn that never started.
      const reducer = createTurnReducer(key, '(prompt unavailable)')
      reducer.apply(failure as StreamEvent)
      reducer.finish(1)
      createSnapshotWriter(key, dataDir).flush(reducer)
    }
    return 1
  }

  const reducer = createTurnReducer(key, request.prompt)
  const writer = persist ? createSnapshotWriter(key, dataDir) : null
  const record = (event: StreamEvent) => {
    reducer.apply(event)
    writer?.schedule(reducer)
  }

  const located = await locateClaude()
  if (!located) {
    const failure = { type: 'sidecar', event: 'error', error: 'claude executable not found' }
    emit(failure)
    reducer.apply(failure as StreamEvent)
    reducer.finish(1)
    writer?.flush(reducer)
    return 1
  }

  const approvalArgs = request.perCallApproval
    ? perCallApprovalArgs(key, dataDir)
    : null
  if (request.perCallApproval && !approvalArgs) {
    const warning = {
      type: 'sidecar',
      event: 'stderr',
      data: 'Could not set up per-call approval; falling back to the permission mode.',
    }
    emit(warning)
    record(warning as StreamEvent)
  }

  const child = spawnTurn(located.bin, request.prompt, {
    ...request,
    extraArgs: approvalArgs ?? undefined,
  })
  emit({
    type: 'sidecar',
    event: 'started',
    bin: located.bin,
    pid: child.pid ?? null,
    resumed: Boolean(request.resumeSessionId),
  })
  // Publish immediately so a pane that reconnects between spawn and first token
  // sees a running turn rather than a missing one.
  writer?.flush(reducer)

  const releaseStopHandlers = installStopHandlers(child, options.stdinLease, (reason, outcome) => {
    const event = { type: 'sidecar', event: 'stopping', reason, outcome }
    emit(event)
    record(event as StreamEvent)
  })

  const stdoutDone = child.stdout
    ? forwardLines(child.stdout, line => {
        process.stdout.write(line + '\n')
        try {
          record(JSON.parse(line) as StreamEvent)
        } catch {
          // Claude occasionally writes a non-JSON warning line; the raw form is
          // already on stdout, and it is not worth failing the turn over.
        }
      })
    : Promise.resolve()

  const stderrDone = child.stderr
    ? forwardLines(child.stderr, line => {
        const event = { type: 'sidecar', event: 'stderr', data: line }
        emit(event)
        record(event as StreamEvent)
      })
    : Promise.resolve()

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.on('error', e => {
      const event = { type: 'sidecar', event: 'error', error: e.message }
      emit(event)
      record(event as StreamEvent)
      resolve({ code: 1, signal: null })
    })
    child.on('close', (code, signal) => resolve({ code, signal }))
  })

  // Drain whatever is still buffered before announcing the exit, so neither the
  // stream nor the snapshot shows `exit` ahead of the events that preceded it.
  await Promise.all([stdoutDone, stderrDone])
  releaseStopHandlers()

  reducer.finish(exit.code)
  writer?.flush(reducer)
  // The prompt file is already gone; clear the rest of the turn's scratch state.
  for (const suffix of ['-mcp.json', '-ask.json', '-decision.json']) {
    try { fs.unlinkSync(path.join(dataDir, `${key}${suffix}`)) } catch { /* not there */ }
  }
  emit({ type: 'sidecar', event: 'exit', code: exit.code, signal: exit.signal })
  return exit.code ?? 0
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
