import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { NdjsonReader, isInit, isResult } from '../dist/protocol.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(here, '..', 'fixtures', 'error-org-disabled.ndjson'), 'utf-8')

function readAll(chunks) {
  const reader = new NdjsonReader()
  const out = []
  for (const chunk of chunks) out.push(...reader.push(chunk))
  out.push(...reader.flush())
  return out
}

test('parses every line of a recorded stream', () => {
  const parsed = readAll([fixture])
  assert.equal(parsed.length, 5)
  assert.ok(parsed.every(p => p.ok), 'every line should parse')
})

test('reassembles events split across chunk boundaries', () => {
  // exec.spawn hands over arbitrary chunks; splitting mid-line must not drop or
  // corrupt an event.
  const mid = Math.floor(fixture.length / 2)
  const chunked = readAll([fixture.slice(0, mid), fixture.slice(mid)])
  const whole = readAll([fixture])
  assert.deepEqual(chunked, whole)
})

test('byte-at-a-time delivery yields the same events', () => {
  const bytes = readAll([...fixture])
  assert.equal(bytes.length, 5)
  assert.ok(bytes.every(p => p.ok))
})

test('system/init is not the first event', () => {
  // A SessionStart hook emits system/hook_started ahead of init, so a parser
  // that reads events[0] as init reads the wrong object.
  const events = readAll([fixture]).map(p => p.event)
  assert.equal(events[0].type, 'system')
  assert.equal(events[0].subtype, 'hook_started')
  const initIndex = events.findIndex(isInit)
  assert.equal(initIndex, 1)
})

test('result is not the last event', () => {
  // system/hook_response arrives after result, so end-of-stream must be process
  // exit, never the result message.
  const events = readAll([fixture]).map(p => p.event)
  const resultIndex = events.findIndex(isResult)
  assert.ok(resultIndex >= 0)
  assert.ok(resultIndex < events.length - 1, 'events follow the result message')
})

test('surfaces an API failure delivered as a successful result message', () => {
  // The CLI exits 0 and reports the API error inside the stream, so is_error
  // has to be checked explicitly.
  const events = readAll([fixture]).map(p => p.event)
  const result = events.find(isResult)
  assert.equal(result.subtype, 'success')
  assert.equal(result.is_error, true)
  assert.equal(result.api_error_status, 400)
  assert.match(result.result, /organization has been disabled/)
})

test('this recorded build reports no capabilities array', () => {
  // Claude Code 2.1.150 predates the capabilities field (v2.1.205+), which is
  // why feature detection needs a version fallback.
  const init = readAll([fixture]).map(p => p.event).find(isInit)
  assert.equal(init.capabilities, undefined)
  assert.equal(typeof init.model, 'string')
  assert.equal(typeof init.permissionMode, 'string')
  assert.ok(Array.isArray(init.tools))
})

test('a non-JSON line is reported, not thrown', () => {
  const parsed = readAll(['not json\n{"type":"result"}\n'])
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].ok, false)
  assert.equal(parsed[0].raw, 'not json')
  assert.equal(parsed[1].ok, true)
})
