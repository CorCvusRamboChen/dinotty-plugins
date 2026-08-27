import test from 'node:test'
import assert from 'node:assert/strict'

import { encodeProjectDir } from '../dist/sessions.mjs'

/**
 * The project-directory encoding is reverse-engineered from a real store, not
 * documented. These cases are transcriptions of directory names observed under
 * ~/.claude/projects, so a wrong rule fails here rather than silently listing
 * no sessions.
 */

test('encodes a Windows path the way Claude Code does', () => {
  assert.equal(
    encodeProjectDir('C:\\Users\\12424\\OneDrive\\contribute'),
    'C--Users-12424-OneDrive-contribute',
  )
})

test('each non-alphanumeric character becomes exactly one dash', () => {
  // Observed: C:\Users\12424\OneDrive\文档\contribute
  //        -> C--Users-12424-OneDrive----contribute
  // The colon, three separators and both CJK characters are one dash apiece,
  // so a rule that collapsed runs of dashes would look for the wrong folder.
  assert.equal(
    encodeProjectDir('C:\\Users\\12424\\OneDrive\\\u6587\u6863\\contribute'),
    'C--Users-12424-OneDrive----contribute',
  )
})

test('a POSIX path encodes the same way', () => {
  assert.equal(encodeProjectDir('/home/me/src/app'), '-home-me-src-app')
})

test('dots and spaces are not special', () => {
  assert.equal(encodeProjectDir('/a b/c.d'), '-a-b-c-d')
})
