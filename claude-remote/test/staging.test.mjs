import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readRequest } from '../dist/turn.mjs'

/**
 * The prompt reaches the sidecar through `ctx.storage`, which the host writes
 * to `$DINOTTY_PLUGIN_DATA_DIR/<key>.json`. Only the key travels in argv,
 * because spawn args ride in a WebSocket URL query string.
 */

function withDataDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'claude-remote-'))
  const previous = process.env.DINOTTY_PLUGIN_DATA_DIR
  process.env.DINOTTY_PLUGIN_DATA_DIR = dir
  try {
    return fn(dir)
  } finally {
    if (previous === undefined) delete process.env.DINOTTY_PLUGIN_DATA_DIR
    else process.env.DINOTTY_PLUGIN_DATA_DIR = previous
  }
}

test('reads a staged request', () => {
  withDataDir(dir => {
    writeFileSync(join(dir, 'turn-1.json'), JSON.stringify({
      prompt: 'hello',
      permissionMode: 'acceptEdits',
      resumeSessionId: 'abc',
    }))
    const request = readRequest('turn-1')
    assert.equal(request.prompt, 'hello')
    assert.equal(request.permissionMode, 'acceptEdits')
    assert.equal(request.resumeSessionId, 'abc')
  })
})

test('deletes the staged file after reading it', () => {
  // The prompt is user content; it should not outlive the read.
  withDataDir(dir => {
    const file = join(dir, 'turn-2.json')
    writeFileSync(file, JSON.stringify({ prompt: 'secret' }))
    readRequest('turn-2')
    assert.equal(existsSync(file), false)
  })
})

test('deletes the staged file even when it is malformed', () => {
  withDataDir(dir => {
    const file = join(dir, 'turn-3.json')
    writeFileSync(file, 'not json')
    const result = readRequest('turn-3')
    assert.ok('error' in result)
    assert.equal(existsSync(file), false)
  })
})

test('a multi-line prompt survives the round trip', () => {
  // This is the reason the prompt does not travel in argv: newlines and quotes
  // would have to survive a URL query string and, on Windows, cmd.exe.
  const prompt = 'line one\nline "two"\\ & three\n\n结束'
  withDataDir(dir => {
    writeFileSync(join(dir, 'turn-4.json'), JSON.stringify({ prompt }))
    const request = readRequest('turn-4')
    assert.equal(request.prompt, prompt)
  })
})

test('rejects a key that escapes the data directory', () => {
  withDataDir(dir => {
    const outside = join(dir, '..', 'escaped.json')
    writeFileSync(outside, JSON.stringify({ prompt: 'nope' }))
    for (const key of ['../escaped', '..\\escaped', '..', '.', 'sub/dir', 'sub\\dir', '']) {
      const result = readRequest(key)
      assert.ok('error' in result, `expected ${JSON.stringify(key)} to be rejected`)
    }
    // The out-of-tree file must still be there — nothing tried to read it.
    assert.equal(existsSync(outside), true)
    assert.match(readFileSync(outside, 'utf-8'), /nope/)
  })
})

test('reports a request with no prompt instead of running an empty turn', () => {
  withDataDir(dir => {
    writeFileSync(join(dir, 'turn-5.json'), JSON.stringify({ permissionMode: 'auto' }))
    const result = readRequest('turn-5')
    assert.ok('error' in result)
    assert.match(result.error, /no prompt/)
  })
})

test('reports a missing data directory rather than throwing', () => {
  const previous = process.env.DINOTTY_PLUGIN_DATA_DIR
  delete process.env.DINOTTY_PLUGIN_DATA_DIR
  try {
    const result = readRequest('turn-6')
    assert.ok('error' in result)
    assert.match(result.error, /DINOTTY_PLUGIN_DATA_DIR/)
  } finally {
    if (previous !== undefined) process.env.DINOTTY_PLUGIN_DATA_DIR = previous
  }
})

test('reports a missing staged file rather than throwing', () => {
  withDataDir(() => {
    const result = readRequest('never-staged')
    assert.ok('error' in result)
    assert.match(result.error, /cannot read staged turn/)
  })
})
