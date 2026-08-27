/**
 * Discovering and following the other Claude Code sessions on this machine.
 *
 * Every live session registers itself in `~/.claude/sessions/<pid>.json`, which
 * carries its name, working directory, entry point, and inbox address. Reading
 * those files is cheaper than shelling out to `claude agents --json` and gives
 * more: the registration records whether a session came from the terminal or
 * from Claude Desktop, which is what a "which one is my main window" list needs.
 *
 * Liveness is checked against the pid rather than trusted from the file — a
 * session that crashed leaves its registration behind.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { encodeProjectDir } from './sessions'
import type { Message } from './reduce'

export interface PeerSession {
  pid: number
  sessionId: string
  /** The name other sessions address it by. */
  name: string
  cwd: string
  /** `interactive`, or whatever kind the session registered as. */
  kind: string
  /** `claude-desktop`, `cli`, … — how this session was started. */
  entrypoint: string | null
  startedAt: number
  version: string | null
  /** True when the process behind the registration is still running. */
  alive: boolean
  /** Cross-session messaging needs an inbox; without one it cannot be reached. */
  reachable: boolean
}

function sessionsDir(): string {
  return path.join(os.homedir(), '.claude', 'sessions')
}

/** A pid with no process behind it is a leftover registration. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    // EPERM means the process exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function listPeers(): PeerSession[] {
  let names: string[]
  try {
    names = fs.readdirSync(sessionsDir())
  } catch {
    return []
  }

  const peers: PeerSession[] = []
  for (const file of names) {
    if (!file.endsWith('.json')) continue
    let record: any
    try {
      record = JSON.parse(fs.readFileSync(path.join(sessionsDir(), file), 'utf-8'))
    } catch {
      continue
    }
    if (typeof record?.pid !== 'number' || typeof record?.sessionId !== 'string') continue
    peers.push({
      pid: record.pid,
      sessionId: record.sessionId,
      name: typeof record.name === 'string' ? record.name : record.sessionId.slice(0, 8),
      cwd: typeof record.cwd === 'string' ? record.cwd : '',
      kind: typeof record.kind === 'string' ? record.kind : 'unknown',
      entrypoint: typeof record.entrypoint === 'string' ? record.entrypoint : null,
      startedAt: typeof record.startedAt === 'number' ? record.startedAt : 0,
      version: typeof record.version === 'string' ? record.version : null,
      alive: isAlive(record.pid),
      reachable: typeof record.messagingSocketPath === 'string' && record.messagingSocketPath !== '',
    })
  }
  return peers.sort((a, b) => Number(b.alive) - Number(a.alive) || b.startedAt - a.startedAt)
}

/** Where Claude Code keeps a session's transcript. */
export function transcriptPath(cwd: string, sessionId: string): string {
  return path.join(os.homedir(), '.claude', 'projects', encodeProjectDir(cwd), `${sessionId}.jsonl`)
}

export interface TranscriptRead {
  messages: Message[]
  /** Byte offset to resume from; pass it back to read only what is new. */
  offset: number
  /** False when the file shrank or vanished — the caller should start over. */
  continuous: boolean
}

/**
 * Read a transcript from a byte offset.
 *
 * Mirroring a live session means re-reading a file that is still being written,
 * so this returns the offset it stopped at. A partial trailing line is left
 * unconsumed rather than parsed, because the writer may be mid-append.
 */
export function readTranscript(file: string, fromOffset = 0): TranscriptRead {
  let size: number
  try {
    size = fs.statSync(file).size
  } catch {
    return { messages: [], offset: 0, continuous: false }
  }

  // A smaller file than last time means it was replaced, not appended to.
  if (size < fromOffset) return { messages: [], offset: 0, continuous: false }
  if (size === fromOffset) return { messages: [], offset: fromOffset, continuous: true }

  const handle = fs.openSync(file, 'r')
  let chunk: string
  try {
    const buffer = Buffer.alloc(size - fromOffset)
    const read = fs.readSync(handle, buffer, 0, buffer.length, fromOffset)
    chunk = buffer.subarray(0, read).toString('utf-8')
  } finally {
    fs.closeSync(handle)
  }

  const lastNewline = chunk.lastIndexOf('\n')
  if (lastNewline === -1) {
    // Nothing complete yet; wait for the writer to finish the line.
    return { messages: [], offset: fromOffset, continuous: true }
  }
  const complete = chunk.slice(0, lastNewline)
  const consumed = fromOffset + Buffer.byteLength(complete, 'utf-8') + 1

  const messages: Message[] = []
  for (const line of complete.split('\n')) {
    if (!line.trim()) continue
    let entry: any
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const message = toMessage(entry)
    if (message) messages.push(message)
  }
  return { messages, offset: consumed, continuous: true }
}

/**
 * Turn a transcript entry into something renderable.
 *
 * The transcript carries far more than a conversation — hooks, queue
 * operations, bridge registrations, latches. Only the parts a reader would
 * recognise as the conversation are kept; everything else is skipped rather
 * than rendered as noise.
 */
function toMessage(entry: any): Message | null {
  if (entry?.isSidechain) return null // A subagent's own thread, not this one.

  if (entry?.type === 'user') {
    const text = flatten(entry?.message?.content)
    return text ? { role: 'user', text } : null
  }
  if (entry?.type === 'assistant') {
    const text = flatten(entry?.message?.content)
    return text ? { role: 'assistant', text } : null
  }
  return null
}

function flatten(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content as any[]) {
    if (part?.type === 'text' && typeof part.text === 'string') parts.push(part.text)
    // Tool traffic is summarised rather than dumped: a mirror is for following
    // along, and a full tool_result can be a megabyte of file contents.
    else if (part?.type === 'tool_use' && typeof part.name === 'string') parts.push(`[${part.name}]`)
  }
  return parts.join('').trim()
}
