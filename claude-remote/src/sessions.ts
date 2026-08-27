/**
 * Listing the Claude Code sessions already on this machine.
 *
 * This is what makes a handoff possible: a session started anywhere — the CLI,
 * Claude Desktop, an earlier pane — can be picked up here and continued with
 * `--resume`, carrying its whole history.
 *
 * Claude Code stores one JSONL file per session under
 * `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. The encoding replaces
 * every character that is not `[a-zA-Z0-9]` with `-`, so
 * `C:\Users\me\OneDrive\文档\contribute` becomes
 * `C--Users-me-OneDrive----contribute` (the colon, the separators and each CJK
 * character are one dash apiece).
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface SessionSummary {
  id: string
  /** The session's own title when it has one, else its opening prompt. */
  title: string
  /** Epoch millis of the last write — the sort key that matters. */
  updatedAt: number
  sizeBytes: number
  cwd: string | null
  gitBranch: string | null
  /** Claude Code version that wrote the session, when recorded. */
  version: string | null
}

/** Mirrors Claude Code's own project-directory encoding. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function projectsRoot(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

/**
 * Only the head of each file is read.
 *
 * A long session is megabytes; the title, cwd and branch are all in the first
 * few entries, and the modification time already answers "how recent". Reading
 * whole transcripts to build a list would make the picker crawl.
 */
const HEAD_BYTES = 128 * 1024
const TITLE_MAX = 100

function readHead(file: string, bytes: number): string {
  const handle = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    const read = fs.readSync(handle, buffer, 0, bytes, 0)
    return buffer.subarray(0, read).toString('utf-8')
  } finally {
    fs.closeSync(handle)
  }
}

/** First readable text of a user entry, whether content is a string or blocks. */
function userText(entry: any): string | null {
  const content = entry?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const text = content
      .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
      .map((part: any) => part.text)
      .join('')
    return text || null
  }
  return null
}

function condense(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX)}…` : flat
}

function summarise(file: string, id: string): SessionSummary | null {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }

  let customTitle: string | null = null
  let firstPrompt: string | null = null
  let cwd: string | null = null
  let gitBranch: string | null = null
  let version: string | null = null

  try {
    for (const line of readHead(file, HEAD_BYTES).split('\n')) {
      if (!line.trim()) continue
      let entry: any
      try {
        entry = JSON.parse(line)
      } catch {
        // The head cuts the last line mid-way; that one is simply skipped.
        continue
      }
      if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
        customTitle = entry.customTitle
      }
      if (!cwd && typeof entry.cwd === 'string') cwd = entry.cwd
      if (!gitBranch && typeof entry.gitBranch === 'string') gitBranch = entry.gitBranch
      if (!version && typeof entry.version === 'string') version = entry.version
      if (!firstPrompt && entry.type === 'user') {
        const text = userText(entry)
        if (text) firstPrompt = text
      }
    }
  } catch {
    // An unreadable transcript still deserves a row: the id alone is resumable.
  }

  return {
    id,
    title: condense(customTitle || firstPrompt || '(untitled session)'),
    updatedAt: stat.mtimeMs,
    sizeBytes: stat.size,
    cwd,
    gitBranch,
    version,
  }
}

/**
 * Sessions for one working directory, newest first.
 *
 * Scoped to the project rather than the whole machine on purpose: before Claude
 * Code v2.1.223, `--resume` only finds a session id inside the current project
 * directory, so offering sessions from elsewhere would list rows that cannot be
 * resumed from here.
 */
export function listSessions(cwd: string): SessionSummary[] {
  const dir = path.join(projectsRoot(), encodeProjectDir(cwd))
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter(name => name.endsWith('.jsonl'))
    .map(name => summarise(path.join(dir, name), name.slice(0, -'.jsonl'.length)))
    .filter((s): s is SessionSummary => s !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
