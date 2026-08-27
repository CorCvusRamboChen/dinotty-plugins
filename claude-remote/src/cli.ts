/**
 * Sidecar entry point.
 *
 * dinotty's `exec.run` / `exec.spawn` can only launch the binary this plugin
 * declares in `bin` — there is no arbitrary-command channel — so everything
 * that has to touch the local machine lives behind these subcommands.
 *
 * Output contract: one JSON object per line on stdout. Diagnostics go to
 * stderr, which the host drains into a bounded buffer.
 */

import { probeClaude } from './claude'
import { runTurn } from './turn'
import { runPermissionServer } from './mcp-permission'
import { listSessions } from './sessions'
import { listPeers, readTranscript, transcriptPath } from './peers'

const SUBCOMMANDS = ['probe', 'turn', 'sessions', 'peers', 'mirror', 'mcp-permission', 'help'] as const

function emit(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + '\n')
}

async function cmdProbe(): Promise<number> {
  const probe = await probeClaude()
  emit({ type: 'probe', ...probe })
  // A missing or too-old claude is a reportable state, not a crash: the pane
  // renders it as an error panel. Exit 0 so `exec.run` gives us the payload.
  return 0
}

function cmdHelp(): number {
  emit({ type: 'help', subcommands: SUBCOMMANDS })
  return 0
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2)
  let code: number
  switch (subcommand) {
    case 'probe':
      code = await cmdProbe()
      break
    case 'sessions': {
      // The pane cannot read the transcript store itself: plugin JS has no
      // filesystem reach beyond ctx.workspace, and this lives under ~/.claude.
      const cwd = rest[0]
      if (!cwd) {
        emit({ type: 'error', error: 'usage: sessions <cwd>' })
        code = 1
        break
      }
      emit({ type: 'sessions', sessions: listSessions(cwd) })
      code = 0
      break
    }
    case 'peers': {
      // Live sessions on this machine, read from their own registration files.
      emit({ type: 'peers', peers: listPeers() })
      code = 0
      break
    }
    case 'mirror': {
      // One read of another session's transcript from a byte offset. The pane
      // polls this; keeping it a single shot means no process to supervise.
      const [cwd, sessionId, offsetArg] = rest
      if (!cwd || !sessionId) {
        emit({ type: 'error', error: 'usage: mirror <cwd> <session-id> [offset]' })
        code = 1
        break
      }
      const offset = Number.parseInt(offsetArg ?? '0', 10) || 0
      emit({ type: 'mirror', ...readTranscript(transcriptPath(cwd, sessionId), offset) })
      code = 0
      break
    }
    case 'turn': {
      const key = rest[0]
      if (!key) {
        emit({ type: 'error', error: 'usage: turn <staged-request-key> [--stdin-lease] [--persist]' })
        code = 1
        break
      }
      code = await runTurn(key, {
        stdinLease: rest.includes('--stdin-lease'),
        persist: rest.includes('--persist'),
      })
      break
    }
    case 'mcp-permission': {
      // Spawned by `claude`, not by dinotty: this speaks MCP over stdio and
      // relays each permission prompt to the pane.
      const turnId = rest[0]
      if (!turnId) {
        emit({ type: 'error', error: 'usage: mcp-permission <turn-id>' })
        code = 1
        break
      }
      code = await runPermissionServer(turnId)
      break
    }
    case 'help':
    case undefined:
      code = cmdHelp()
      break
    default:
      emit({ type: 'error', error: `unknown subcommand: ${subcommand}`, subcommands: SUBCOMMANDS })
      code = 1
  }
  process.exitCode = code
}

main().catch((e: unknown) => {
  emit({ type: 'error', error: e instanceof Error ? e.message : String(e) })
  process.exitCode = 1
})
