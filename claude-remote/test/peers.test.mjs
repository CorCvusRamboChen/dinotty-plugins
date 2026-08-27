import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readTranscript } from '../dist/peers.mjs'

/**
 * Following a live session means re-reading a file while it is still being
 * appended to. These pin the offset contract that makes that safe.
 */

function transcript(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'claude-remote-peers-'))
  const file = join(dir, 'session.jsonl')
  writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  return file
}

const user = text => ({ type: 'user', message: { role: 'user', content: text } })
const assistant = text => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text }] },
})

test('reads a conversation and reports where it stopped', () => {
  const file = transcript([user('hello'), assistant('hi there')])
  const read = readTranscript(file)
  assert.equal(read.continuous, true)
  assert.deepEqual(read.messages.map(m => m.role), ['user', 'assistant'])
  assert.equal(read.messages[1].text, 'hi there')
  assert.ok(read.offset > 0)
})

test('a second read from the offset returns only what was appended', () => {
  const file = transcript([user('one')])
  const first = readTranscript(file)
  assert.equal(first.messages.length, 1)

  appendFileSync(file, JSON.stringify(assistant('two')) + '\n')
  const second = readTranscript(file, first.offset)
  assert.equal(second.messages.length, 1, 'only the appended entry')
  assert.equal(second.messages[0].text, 'two')
  assert.ok(second.offset > first.offset)
})

test('a half-written trailing line is left for the next read', () => {
  // The writer appends while we read; parsing a partial line would drop the
  // entry entirely, because the offset would move past it.
  const file = transcript([user('complete')])
  const first = readTranscript(file)
  appendFileSync(file, '{"type":"assistant","message":{"content":[{"type":"te')

  const partial = readTranscript(file, first.offset)
  assert.equal(partial.messages.length, 0)
  assert.equal(partial.offset, first.offset, 'offset does not advance past a partial line')

  appendFileSync(file, 'xt","text":"finished"}]}}\n')
  const finished = readTranscript(file, partial.offset)
  assert.equal(finished.messages.length, 1)
  assert.equal(finished.messages[0].text, 'finished')
})

test('a replaced or truncated file is reported, not silently misread', () => {
  // /clear and compaction rewrite the transcript. Reading on from the old
  // offset would splice the middle of the new file into the view.
  const file = transcript([user('a'), assistant('b'), user('c')])
  const first = readTranscript(file)
  writeFileSync(file, JSON.stringify(user('fresh')) + '\n')

  const after = readTranscript(file, first.offset)
  assert.equal(after.continuous, false, 'caller is told to start over')
  assert.equal(after.offset, 0)
})

test('a missing transcript is not an error', () => {
  const read = readTranscript(join(tmpdir(), 'definitely-not-here.jsonl'))
  assert.equal(read.continuous, false)
  assert.deepEqual(read.messages, [])
})

test('no new bytes means no work and no movement', () => {
  const file = transcript([user('only')])
  const first = readTranscript(file)
  const again = readTranscript(file, first.offset)
  assert.equal(again.messages.length, 0)
  assert.equal(again.offset, first.offset)
  assert.equal(again.continuous, true)
})

test('subagent threads are left out of the mirror', () => {
  // A sidechain is a subagent's own conversation; interleaving it with the
  // main thread makes the mirror unreadable.
  const file = transcript([
    user('main'),
    { ...assistant('from a subagent'), isSidechain: true },
    assistant('main reply'),
  ])
  const read = readTranscript(file)
  assert.deepEqual(read.messages.map(m => m.text), ['main', 'main reply'])
})

test('tool calls are summarised rather than dumped', () => {
  // A tool_result can be a megabyte of file contents; a follow-along view wants
  // to know a tool ran, not to receive its payload.
  const file = transcript([{
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Checking.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } },
      ],
    },
  }])
  const read = readTranscript(file)
  assert.equal(read.messages[0].text, 'Checking.[Bash]')
})

test('entries with no readable text are skipped', () => {
  const file = transcript([
    { type: 'bridge-session', bridgeSessionId: 'cse_x' },
    { type: 'custom-title', customTitle: 'Whatever' },
    user(''),
    user('real'),
  ])
  const read = readTranscript(file)
  assert.deepEqual(read.messages.map(m => m.text), ['real'])
})
