import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'

import { isInit, isResult } from '../dist/protocol.mjs'
import { forwardLines } from '../dist/turn.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '..', 'fixtures', 'error-org-disabled.ndjson'), 'utf-8')

/** Drive the production line splitter with a chosen chunking. */
async function splitInto(chunks) {
  const lines = []
  await forwardLines(Readable.from(chunks), line => lines.push(line))
  return lines
}

const events = () =>
  fixture.split('\n').filter(line => line.trim()).map(line => JSON.parse(line))

test('splits a recorded stream into its lines', async () => {
  const lines = await splitInto([fixture])
  assert.equal(lines.length, 5)
  assert.ok(lines.every(line => JSON.parse(line)))
})

test('reassembles events split across chunk boundaries', async () => {
  // exec/spawn hand over arbitrary chunks; splitting mid-line must not drop or
  // corrupt an event.
  const mid = Math.floor(fixture.length / 2)
  const chunked = await splitInto([fixture.slice(0, mid), fixture.slice(mid)])
  assert.deepEqual(chunked, await splitInto([fixture]))
})

test('byte-at-a-time delivery yields the same lines', async () => {
  assert.deepEqual(await splitInto([...fixture]), await splitInto([fixture]))
})

test('a final line with no trailing newline is not dropped', async () => {
  const lines = await splitInto(['{"type":"a"}\n{"type":"b"}'])
  assert.deepEqual(lines, ['{"type":"a"}', '{"type":"b"}'])
})

test('carriage returns are stripped', async () => {
  assert.deepEqual(await splitInto(['{"type":"a"}\r\n']), ['{"type":"a"}'])
})

test('system/init is not the first event', () => {
  // A SessionStart hook emits system/hook_started ahead of init, so a parser
  // that reads events[0] as init reads the wrong object.
  const all = events()
  assert.equal(all[0].type, 'system')
  assert.equal(all[0].subtype, 'hook_started')
  assert.equal(all.findIndex(isInit), 1)
})

test('result is not the last event', () => {
  // system/hook_response arrives after result, so end-of-stream must be process
  // exit, never the result message.
  const all = events()
  const resultIndex = all.findIndex(isResult)
  assert.ok(resultIndex >= 0)
  assert.ok(resultIndex < all.length - 1, 'events follow the result message')
})

test('an API failure is delivered as a successful-looking result message', () => {
  // The CLI exits 0 and reports the API error inside the stream, so is_error
  // has to be checked explicitly.
  const result = events().find(isResult)
  assert.equal(result.subtype, 'success')
  assert.equal(result.is_error, true)
  assert.equal(result.api_error_status, 400)
  assert.match(result.result, /organization has been disabled/)
})

test('this recorded build reports no capabilities array', () => {
  // Claude Code 2.1.150 predates the capabilities field (v2.1.205+), which is
  // why feature detection needs a version fallback.
  const init = events().find(isInit)
  assert.equal(init.capabilities, undefined)
  assert.equal(typeof init.model, 'string')
  assert.equal(typeof init.permissionMode, 'string')
  assert.ok(Array.isArray(init.tools))
})
