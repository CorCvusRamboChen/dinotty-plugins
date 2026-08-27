import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  permissionPayload,
  awaitDecision,
  mcpConfigDocument,
  PERMISSION_TOOL_ID,
} from '../dist/mcp-permission.mjs'
import { compareVersions, PER_CALL_APPROVAL_SINCE } from '../dist/versions.mjs'

function dataDir() {
  return mkdtempSync(join(tmpdir(), 'claude-remote-perm-'))
}

test('an allow always carries updatedInput', () => {
  // Before Claude Code v2.1.207 an allow without updatedInput was rejected as a
  // validation error, which reads to the user as a mysterious denial.
  const payload = JSON.parse(permissionPayload({ id: '1', behavior: 'allow' }, { command: 'ls' }))
  assert.equal(payload.behavior, 'allow')
  assert.deepEqual(payload.updatedInput, { command: 'ls' })
})

test('an edited input overrides the original', () => {
  const payload = JSON.parse(permissionPayload(
    { id: '1', behavior: 'allow', updatedInput: { command: 'ls -la' } },
    { command: 'ls' },
  ))
  assert.deepEqual(payload.updatedInput, { command: 'ls -la' })
})

test('a deny always carries a message Claude can read', () => {
  const payload = JSON.parse(permissionPayload({ id: '1', behavior: 'deny' }, {}))
  assert.equal(payload.behavior, 'deny')
  assert.ok(payload.message.length > 0)
  assert.equal(payload.updatedInput, undefined)
})

test('publishes the request and resolves with the pane’s answer', async () => {
  const dir = dataDir()
  const request = { id: 'toolu_1', toolName: 'Bash', input: { command: 'ls' }, askedAt: 0 }

  const pending = awaitDecision(dir, 'turn-1', request, { pollMs: 10, timeoutMs: 5000 })

  // Stand in for the pane: wait for the ask, then answer it.
  await new Promise(resolve => setTimeout(resolve, 40))
  const ask = JSON.parse(readFileSync(join(dir, 'turn-1-ask.json'), 'utf-8'))
  assert.equal(ask.toolName, 'Bash')
  assert.deepEqual(ask.input, { command: 'ls' })
  writeFileSync(join(dir, 'turn-1-decision.json'), JSON.stringify({ id: 'toolu_1', behavior: 'allow' }))

  const decision = await pending
  assert.equal(decision.behavior, 'allow')
  assert.equal(existsSync(join(dir, 'turn-1-ask.json')), false, 'ask file is cleaned up')
  assert.equal(existsSync(join(dir, 'turn-1-decision.json')), false, 'decision is consumed')
})

test('a stale decision from an earlier prompt does not answer this one', async () => {
  // Two prompts in one turn share the channel; without clearing it, the second
  // would be answered instantly by the first one's leftover file.
  const dir = dataDir()
  writeFileSync(join(dir, 'turn-1-decision.json'), JSON.stringify({ id: 'old', behavior: 'allow' }))

  const decision = await awaitDecision(
    dir,
    'turn-1',
    { id: 'new', toolName: 'Bash', input: {}, askedAt: 0 },
    { pollMs: 10, timeoutMs: 120 },
  )
  assert.equal(decision.behavior, 'deny')
  assert.match(decision.message, /in time/)
})

test('a decision for a different call is ignored', async () => {
  const dir = dataDir()
  const pending = awaitDecision(
    dir,
    'turn-1',
    { id: 'toolu_2', toolName: 'Bash', input: {}, askedAt: 0 },
    { pollMs: 10, timeoutMs: 200 },
  )
  writeFileSync(join(dir, 'turn-1-decision.json'), JSON.stringify({ id: 'toolu_1', behavior: 'allow' }))
  const decision = await pending
  assert.equal(decision.behavior, 'deny')
})

test('an unanswered prompt denies rather than hanging the turn', async () => {
  // Claude blocks on this MCP call; never returning would wedge the session.
  const dir = dataDir()
  const decision = await awaitDecision(
    dir,
    'turn-1',
    { id: 'toolu_1', toolName: 'Bash', input: {}, askedAt: 0 },
    { pollMs: 10, timeoutMs: 100 },
  )
  assert.equal(decision.behavior, 'deny')
  assert.equal(existsSync(join(dir, 'turn-1-ask.json')), false, 'ask file is cleaned up on timeout')
})

test('the MCP config names the same server as the prompt-tool id', () => {
  // A mismatch here is silent: Claude just never routes prompts to us.
  const config = JSON.parse(mcpConfigDocument('turn-1', '/data'))
  const [serverName] = Object.keys(config.mcpServers)
  assert.equal(PERMISSION_TOOL_ID, `mcp__${serverName}__approve`)
  assert.deepEqual(config.mcpServers[serverName].env, { DINOTTY_PLUGIN_DATA_DIR: '/data' })
  assert.ok(config.mcpServers[serverName].args.includes('turn-1'))
})

test('the per-call approval gate matches the documented version', () => {
  assert.ok(compareVersions('2.1.150', PER_CALL_APPROVAL_SINCE) < 0, '2.1.150 is too old')
  assert.ok(compareVersions('2.1.199', PER_CALL_APPROVAL_SINCE) >= 0, '2.1.199 is the floor')
  assert.ok(compareVersions('2.2.0', PER_CALL_APPROVAL_SINCE) > 0)
  // Segment-wise, not lexicographic: "2.1.99" must not beat "2.1.199".
  assert.ok(compareVersions('2.1.99', PER_CALL_APPROVAL_SINCE) < 0)
})
