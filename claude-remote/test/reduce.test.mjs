import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { createTurnReducer } from '../dist/reduce.mjs'

const here = dirname(fileURLToPath(import.meta.url))

function replayFixture(name, prompt = 'test prompt') {
  const raw = readFileSync(join(here, '..', 'fixtures', name), 'utf-8')
  const reducer = createTurnReducer('turn-1', prompt)
  for (const line of raw.split('\n')) {
    if (line.trim()) reducer.apply(JSON.parse(line))
  }
  return reducer
}

test('the prompt is in the snapshot, so another device can render the turn', () => {
  // The snapshot is the only thing that survives a disconnect; a reader that
  // never watched the turn happen still has to see what was asked.
  const reducer = createTurnReducer('turn-1', 'what does this repo do?')
  const snapshot = reducer.snapshot()
  assert.equal(snapshot.messages[0].role, 'user')
  assert.equal(snapshot.messages[0].text, 'what does this repo do?')
  assert.equal(snapshot.status, 'running')
})

test('accumulates text deltas into one assistant message', () => {
  const reducer = createTurnReducer('turn-1', 'hi')
  for (const text of ['Hel', 'lo', ' there']) {
    reducer.apply({ type: 'stream_event', event: { delta: { type: 'text_delta', text } } })
  }
  const messages = reducer.snapshot().messages
  assert.equal(messages.length, 2)
  assert.equal(messages[1].text, 'Hello there')
  assert.equal(messages[1].streaming, true)
})

test('the assembled assistant message overrides accumulated deltas', () => {
  // With --include-partial-messages both arrive; only the assembled one is
  // final, so a dropped delta must not corrupt the result.
  const reducer = createTurnReducer('turn-1', 'hi')
  reducer.apply({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'Hel' } } })
  reducer.apply({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello there' }] } })
  const messages = reducer.snapshot().messages
  assert.equal(messages.length, 2)
  assert.equal(messages[1].text, 'Hello there')
})

test('a failure is reported once, not as both an assistant message and an error', () => {
  // Claude streams the failure text as an assistant message and then repeats it
  // in the result; showing both reads as two separate problems.
  const reducer = replayFixture('error-org-disabled.ndjson')
  const messages = reducer.snapshot().messages
  const errors = messages.filter(m => m.role === 'error')
  assert.equal(errors.length, 1)
  assert.match(errors[0].text, /organization has been disabled/)
  assert.match(errors[0].text, /HTTP 400/)
  assert.equal(messages.filter(m => m.role === 'assistant').length, 0)
})

test('a non-zero exit is a failure even when the stream explained why', () => {
  const reducer = replayFixture('error-org-disabled.ndjson')
  reducer.finish(1)
  const snapshot = reducer.snapshot()
  assert.equal(snapshot.status, 'failed')
  assert.equal(snapshot.exitCode, 1)
  // The explanation from the stream is kept; no generic exit-code line is added.
  assert.equal(snapshot.messages.filter(m => m.role === 'error').length, 1)
})

test('a bare non-zero exit still produces something to show', () => {
  const reducer = createTurnReducer('turn-1', 'hi')
  reducer.finish(127)
  const messages = reducer.snapshot().messages
  assert.equal(reducer.snapshot().status, 'failed')
  assert.match(messages[messages.length - 1].text, /exited with code 127/)
})

test('a clean exit clears the streaming flag', () => {
  const reducer = createTurnReducer('turn-1', 'hi')
  reducer.apply({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'done' } } })
  reducer.finish(0)
  const snapshot = reducer.snapshot()
  assert.equal(snapshot.status, 'done')
  assert.equal(snapshot.messages[1].streaming, undefined)
})

test('picks up session id and model from system/init', () => {
  const reducer = replayFixture('error-org-disabled.ndjson')
  const snapshot = reducer.snapshot()
  assert.match(snapshot.sessionId, /^[0-9a-f-]{36}$/)
  assert.equal(typeof snapshot.model, 'string')
})

test('ignores unknown event types instead of failing the turn', () => {
  // New `system` subtypes appear between Claude Code releases; a live run
  // produced `system/status`, which no fixture contains.
  const reducer = createTurnReducer('turn-1', 'hi')
  const before = reducer.revision
  reducer.apply({ type: 'system', subtype: 'status', payload: { anything: true } })
  reducer.apply({ type: 'something_new_entirely' })
  assert.equal(reducer.revision, before)
  assert.equal(reducer.snapshot().messages.length, 1)
})

test('the revision only advances on real changes', () => {
  // The snapshot writer skips no-op flushes by watching this.
  const reducer = createTurnReducer('turn-1', 'hi')
  const before = reducer.revision
  reducer.apply({ type: 'stream_event', event: { delta: { type: 'input_json_delta' } } })
  assert.equal(reducer.revision, before)
  reducer.apply({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'x' } } })
  assert.ok(reducer.revision > before)
})

test('snapshots do not alias the reducer’s own messages', () => {
  const reducer = createTurnReducer('turn-1', 'hi')
  const first = reducer.snapshot()
  reducer.apply({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'x' } } })
  assert.equal(first.messages.length, 1, 'an earlier snapshot must not grow')
})
