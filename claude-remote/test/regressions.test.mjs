import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { createTurnReducer } from '../dist/reduce.mjs'
import { resolvePermissionMode } from '../dist/turn.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(here, '..', 'dist', 'cli')

/**
 * Regressions found by a code review of this branch. Each test pins a bug that
 * shipped and was verified by hand before being fixed.
 */

test('a turn that ends on its own is not reported as interrupted', () => {
  // Releasing the stop handler closes the readline interface, which fires
  // 'close' exactly as a real stdin loss would. Every clean turn was ending
  // with a "Interrupted." line in its snapshot.
  const reducer = createTurnReducer('turn-1', 'hi')
  reducer.finish(0)
  const messages = reducer.snapshot().messages
  assert.equal(messages.some(m => /Interrupted|Stopped/.test(m.text)), false)
})

test('a Windows stop says the turn may be unfinished', () => {
  // interruptTurn returns 'killed' on Windows because there is no SIGINT. The
  // reducer used to hardcode "Interrupted.", which claimed a clean end that
  // did not happen.
  const reducer = createTurnReducer('turn-1', 'hi')
  reducer.apply({ type: 'sidecar', event: 'stopping', reason: 'shutdown', outcome: 'killed' })
  const last = reducer.snapshot().messages.at(-1)
  assert.match(last.text, /killed/)
  assert.match(last.text, /unfinished/)
})

test('a POSIX stop reports a clean interrupt', () => {
  const reducer = createTurnReducer('turn-1', 'hi')
  reducer.apply({ type: 'sidecar', event: 'stopping', reason: 'shutdown', outcome: 'interrupted' })
  assert.equal(reducer.snapshot().messages.at(-1).text, 'Interrupted.')
})

test('per-call approval forces a permission mode that falls through', () => {
  // Permission modes are evaluated before the prompt tool, so with acceptEdits
  // the edits were auto-approved and the pane was never asked — the toggle was
  // silently doing nothing.
  assert.equal(resolvePermissionMode('acceptEdits', true), 'default')
  assert.equal(resolvePermissionMode('auto', true), 'default')
  assert.equal(resolvePermissionMode(undefined, true), 'default')
  // Without per-call approval the user's choice stands.
  assert.equal(resolvePermissionMode('acceptEdits', false), 'acceptEdits')
  assert.equal(resolvePermissionMode(undefined, false), undefined)
})

test('the permission server answers other requests while an approval is pending', async () => {
  // The read loop used to await the approval, so the server went deaf for up to
  // ten minutes and could not even answer a ping.
  const dir = mkdtempSync(join(tmpdir(), 'claude-remote-mcp-'))
  const server = spawn(process.execPath, [CLI, 'mcp-permission', 'turn-1'], {
    env: { ...process.env, DINOTTY_PLUGIN_DATA_DIR: dir },
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const replies = new Map()
  let buffer = ''
  server.stdout.setEncoding('utf-8')
  server.stdout.on('data', chunk => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) {
        const message = JSON.parse(line)
        replies.set(message.id, message)
      }
    }
  })

  const waitFor = async (id, timeoutMs = 4000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (replies.has(id)) return replies.get(id)
      await new Promise(r => setTimeout(r, 25))
    }
    throw new Error(`no reply to request ${id} within ${timeoutMs}ms`)
  }

  try {
    // Start an approval nobody will answer yet.
    server.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'approve', arguments: { tool_name: 'Bash', input: {}, tool_use_id: 'toolu_1' } },
    }) + '\n')

    // With the approval outstanding, the server must still be listening.
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) + '\n')
    const pong = await waitFor(2)
    assert.deepEqual(pong.result, {})
    assert.equal(replies.has(1), false, 'the approval is still pending')

    // Now answer it, and the original call completes.
    writeFileSync(
      join(dir, 'turn-1-decision.json'),
      JSON.stringify({ id: 'toolu_1', behavior: 'allow' }),
    )
    const approval = await waitFor(1)
    const payload = JSON.parse(approval.result.content[0].text)
    assert.equal(payload.behavior, 'allow')
  } finally {
    server.stdin.end()
    server.kill()
  }
})

test('the pane does not promise settings the plugin does not have', () => {
  // plugin.json declares no settings, and a plugin cannot set the sidecar's
  // environment, so "set the path in plugin settings" was an instruction the
  // user could not follow.
  const ui = readFileSync(join(here, '..', 'src', 'ui.ts'), 'utf-8')
  assert.equal(/set the path in plugin settings/.test(ui), false)
  assert.match(ui, /CLAUDE_REMOTE_CLAUDE_BIN/)
})
