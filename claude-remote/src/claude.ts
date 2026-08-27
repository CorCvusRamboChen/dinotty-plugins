/**
 * Locating and launching the user's own `claude` CLI.
 *
 * Runs inside the sidecar (Node), never in the browser bundle.
 *
 * Windows is a first-class target here. The npm global install produces BOTH
 * `claude` (a POSIX shell script, useless on Windows) and `claude.cmd`, and
 * `where.exe` prints both. CreateProcess cannot execute a `.cmd` directly, so a
 * batch-file target has to be routed through the command interpreter.
 */

import {
  spawn,
  execFile,
  type ChildProcess,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

import {
  compareVersions,
  CAPABILITIES_SINCE,
  MIN_CLAUDE_VERSION,
  PER_CALL_APPROVAL_SINCE,
} from './versions'

export { compareVersions, CAPABILITIES_SINCE, MIN_CLAUDE_VERSION, PER_CALL_APPROVAL_SINCE }

const execFileAsync = promisify(execFile)

const HOME = os.homedir()
const IS_WINDOWS = process.platform === 'win32'

export interface ClaudeLocation {
  /** Absolute path to the executable or batch wrapper. */
  bin: string
  /** How we found it, for the "why isn't it working" panel. */
  source: 'override' | 'path' | 'known-location'
}

export interface ClaudeProbe {
  found: boolean
  bin?: string
  source?: ClaudeLocation['source']
  version?: string
  /** false when the version is older than `MIN_CLAUDE_VERSION`. */
  versionOk?: boolean
  minVersion: string
  /** Whether this build reports `capabilities` in system/init (v2.1.205+). */
  reportsCapabilities?: boolean
  /** Whether this build can route permission prompts to an MCP tool. */
  supportsPerCallApproval?: boolean
  error?: string
}


/** Explicit override wins over everything; set from the plugin's settings UI. */
const OVERRIDE_ENV = 'CLAUDE_REMOTE_CLAUDE_BIN'

export async function locateClaude(): Promise<ClaudeLocation | null> {
  const override = process.env[OVERRIDE_ENV]
  if (override && isExecutableFile(override)) {
    return { bin: override, source: 'override' }
  }

  const fromPath = await lookupOnPath()
  if (fromPath) return { bin: fromPath, source: 'path' }

  for (const candidate of knownLocations()) {
    if (isExecutableFile(candidate)) return { bin: candidate, source: 'known-location' }
  }
  return null
}

async function lookupOnPath(): Promise<string | null> {
  const finder = IS_WINDOWS ? 'where.exe' : 'which'
  try {
    const { stdout } = await execFileAsync(finder, ['claude'], { timeout: 5000 })
    const hits = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    if (!hits.length) return null
    if (!IS_WINDOWS) return hits[0]
    // `where.exe` lists the extensionless POSIX shim first; it is not runnable
    // here. Prefer a real Windows entry point in PATHEXT priority order.
    const preferred = ['.cmd', '.bat', '.exe', '.ps1']
    for (const ext of preferred) {
      const hit = hits.find(h => h.toLowerCase().endsWith(ext))
      if (hit) return hit
    }
    return hits.find(h => path.extname(h)) ?? null
  } catch {
    return null
  }
}

function knownLocations(): string[] {
  const out: string[] = []
  if (IS_WINDOWS) {
    const appData = process.env.APPDATA
    if (appData) out.push(path.join(appData, 'npm', 'claude.cmd'))
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) out.push(path.join(localAppData, 'Programs', 'claude', 'claude.exe'))
  } else {
    out.push(path.join(HOME, '.claude', 'local', 'claude'))
    out.push('/usr/local/bin/claude')
    out.push('/opt/homebrew/bin/claude')
    // nvm: default alias first, then newest installed version.
    const nvmVersions = path.join(HOME, '.nvm', 'versions', 'node')
    const defaultAlias = path.join(HOME, '.nvm', 'alias', 'default')
    try {
      const version = fs.readFileSync(defaultAlias, 'utf-8').trim()
      if (version) out.push(path.join(nvmVersions, version, 'bin', 'claude'))
    } catch { /* no nvm default */ }
    try {
      for (const v of fs.readdirSync(nvmVersions).sort().reverse()) {
        out.push(path.join(nvmVersions, v, 'bin', 'claude'))
      }
    } catch { /* no nvm */ }
  }
  return out
}

function isExecutableFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

export async function probeClaude(): Promise<ClaudeProbe> {
  const located = await locateClaude()
  if (!located) {
    return { found: false, minVersion: MIN_CLAUDE_VERSION, error: 'claude executable not found' }
  }
  try {
    const { stdout } = await runClaude(located.bin, ['--version'], { timeout: 10_000 })
    // e.g. "2.1.150 (Claude Code)"
    const version = stdout.trim().split(/\s+/)[0] ?? ''
    return {
      found: true,
      bin: located.bin,
      source: located.source,
      version,
      versionOk: compareVersions(version, MIN_CLAUDE_VERSION) >= 0,
      reportsCapabilities: compareVersions(version, CAPABILITIES_SINCE) >= 0,
      supportsPerCallApproval: compareVersions(version, PER_CALL_APPROVAL_SINCE) >= 0,
      minVersion: MIN_CLAUDE_VERSION,
    }
  } catch (e) {
    return {
      found: true,
      bin: located.bin,
      source: located.source,
      minVersion: MIN_CLAUDE_VERSION,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

function runClaude(bin: string, args: string[], opts: { timeout: number }) {
  // windowsHide defaults to false, so without it every probe pops a console
  // window. dinotty sets CREATE_NO_WINDOW on the processes it starts, but that
  // does not reach the grandchildren we start ourselves.
  const options = { ...opts, windowsHide: true }
  if (IS_WINDOWS && isBatchFile(bin)) {
    const comspec = process.env.ComSpec || 'cmd.exe'
    return execFileAsync(comspec, ['/d', '/s', '/c', bin, ...args], options)
  }
  return execFileAsync(bin, args, options)
}

function isBatchFile(bin: string): boolean {
  const ext = path.extname(bin).toLowerCase()
  return ext === '.cmd' || ext === '.bat'
}

export interface SpawnOptions {
  cwd?: string
  /** Resume an existing session instead of starting a new one. */
  resumeSessionId?: string
  permissionMode?: string
  allowedTools?: string[]
  model?: string
  /** Emit `stream_event` text deltas for incremental rendering. */
  partialMessages?: boolean
  /** Extra argv appended verbatim; used for the permission-prompt wiring. */
  extraArgs?: string[]
}

/**
 * Start a streaming turn.
 *
 * The prompt goes in on **stdin**, never argv: it is untrusted user text, and
 * on Windows it would otherwise have to survive `cmd.exe` quoting. Verified
 * against Claude Code 2.1.150 — `claude -p` with no prompt argument reads the
 * prompt from stdin.
 */
export function spawnTurn(bin: string, prompt: string, opts: SpawnOptions = {}): ChildProcess {
  const args = ['-p', '--output-format', 'stream-json', '--verbose']
  if (opts.partialMessages) args.push('--include-partial-messages')
  if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId)
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode)
  if (opts.allowedTools?.length) args.push('--allowedTools', opts.allowedTools.join(','))
  if (opts.model) args.push('--model', opts.model)
  if (opts.extraArgs?.length) args.push(...opts.extraArgs)

  // windowsHide: without it a console window flashes on every single turn.
  const spawnOptions: SpawnOptionsWithoutStdio & { windowsHide: boolean } = {
    cwd: opts.cwd,
    windowsHide: true,
  }
  const child = IS_WINDOWS && isBatchFile(bin)
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', bin, ...args], spawnOptions)
    : spawn(bin, args, spawnOptions)

  child.stdin?.end(prompt)
  return child
}

/**
 * End the current turn. SIGINT finishes the turn; SIGTERM abandons it and exits
 * 143, leaving the turn unfinished in the session — so never use SIGTERM here.
 * Windows has no POSIX signals, so fall back to a hard kill and let the caller
 * mark the turn as abandoned.
 */
export function interruptTurn(child: ChildProcess): 'interrupted' | 'killed' {
  if (IS_WINDOWS) {
    child.kill()
    return 'killed'
  }
  child.kill('SIGINT')
  return 'interrupted'
}

