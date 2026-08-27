/**
 * Sidecar-side turn runner.
 *
 * The prompt is NOT passed as an argument. `ctx.exec.spawn` puts its args in a
 * WebSocket URL query string, so a long or multi-line prompt would hit URL
 * length limits and encoding edge cases. Instead the pane stages the request
 * with `ctx.storage.set()`, which the host writes to
 * `$DINOTTY_PLUGIN_DATA_DIR/<key>.json`, and passes only the key.
 *
 * stdout is a verbatim passthrough of Claude Code's NDJSON, so `protocol.ts`
 * and the recorded fixtures describe exactly what the pane receives. Anything
 * this process has to say about itself is prefixed with `type: "sidecar"`.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import type { ChildProcess } from 'node:child_process'

import { locateClaude, spawnTurn, interruptTurn, type SpawnOptions } from './claude'

export interface TurnRequest extends SpawnOptions {
  prompt: string
}

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
 * (the host died, or the WebSocket dropped) has to count as a stop too,
 * otherwise the claude child outlives its supervisor.
 *
 * Either way we interrupt rather than kill: SIGINT ends the turn cleanly, while
 * a hard kill leaves it unfinished in the session transcript.
 */
function installStopHandlers(child: ChildProcess, stdinLease: boolean): () => void {
  // Without a lease the host gives us no stdin, and a closed stdin would
  // otherwise read as an immediate stop and kill the turn the moment it starts.
  if (!stdinLease) return () => { /* nothing wired */ }

  let stopped = false
  const stop = (reason: string) => {
    if (stopped) return
    stopped = true
    const outcome = interruptTurn(child)
    emit({ type: 'sidecar', event: 'stopping', reason, outcome })
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

export async function runTurn(key: string, stdinLease: boolean): Promise<number> {
  const request = readRequest(key)
  if ('error' in request) {
    emit({ type: 'sidecar', event: 'error', error: request.error })
    return 1
  }

  const located = await locateClaude()
  if (!located) {
    emit({ type: 'sidecar', event: 'error', error: 'claude executable not found' })
    return 1
  }

  const child = spawnTurn(located.bin, request.prompt, request)
  emit({
    type: 'sidecar',
    event: 'started',
    bin: located.bin,
    pid: child.pid ?? null,
    resumed: Boolean(request.resumeSessionId),
  })

  const releaseStopHandlers = installStopHandlers(child, stdinLease)

  const stdoutDone = child.stdout
    ? forwardLines(child.stdout, line => process.stdout.write(line + '\n'))
    : Promise.resolve()
  const stderrDone = child.stderr
    ? forwardLines(child.stderr, line => emit({ type: 'sidecar', event: 'stderr', data: line }))
    : Promise.resolve()

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.on('error', e => {
      emit({ type: 'sidecar', event: 'error', error: e.message })
      resolve({ code: 1, signal: null })
    })
    child.on('close', (code, signal) => resolve({ code, signal }))
  })

  // Drain whatever is still buffered before announcing the exit, so the pane
  // never sees `exit` ahead of the events that preceded it.
  await Promise.all([stdoutDone, stderrDone])
  releaseStopHandlers()

  emit({ type: 'sidecar', event: 'exit', code: exit.code, signal: exit.signal })
  return exit.code ?? 0
}
