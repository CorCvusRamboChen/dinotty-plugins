/**
 * Claude Code version gates, and the comparison behind them.
 *
 * Deliberately free of Node imports: the pane bundle needs these constants to
 * explain why a control is disabled, and pulling them from the sidecar module
 * would drag `node:child_process` and friends into the browser build.
 */

/** `--output-format stream-json` and `--resume` both predate this comfortably. */
export const MIN_CLAUDE_VERSION = '2.0.0'

/** First version with `--permission-prompt-tool`, which per-call approval needs. */
export const PER_CALL_APPROVAL_SINCE = '2.1.199'

/**
 * First version that puts a `capabilities` array in `system/init`.
 *
 * Below this, feature detection has to fall back to comparing version strings —
 * which is exactly what this module exists for.
 */
export const CAPABILITIES_SINCE = '2.1.205'

/** Numeric-segment comparison. Returns <0, 0, or >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
