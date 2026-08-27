/**
 * A one-tool MCP server that turns Claude's permission prompts into a question
 * the pane can answer.
 *
 * Claude Code's `--permission-prompt-tool` names an MCP tool to consult when a
 * tool call reaches the prompt step. This process is that tool. It is spawned by
 * `claude`, not by dinotty, so it inherits the plugin's environment through the
 * turn sidecar and shares its data directory.
 *
 * The exchange is two files, both in that directory:
 *
 *   <turnId>-ask.json       written here, read by the pane
 *   <turnId>-decision.json  written by the pane, read here
 *
 * A separate file rather than the turn snapshot, because the snapshot is
 * rewritten wholesale by the turn runner and two writers would race.
 *
 * The MCP call blocks Claude until it returns, which is the point — but it
 * cannot block forever, so an unanswered prompt denies itself after a timeout
 * rather than hanging the turn.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

/** Claude's own MCP client will give up eventually; deny before it does. */
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 200

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_NAME = 'claude_remote'
const TOOL_NAME = 'approve'

/** `mcp__<server>__<tool>`, the value to pass to --permission-prompt-tool. */
export const PERMISSION_TOOL_ID = `mcp__${SERVER_NAME}__${TOOL_NAME}`

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: any
}

export interface ApprovalRequest {
  id: string
  toolName: string
  input: unknown
  askedAt: number
}

export interface ApprovalDecision {
  id: string
  behavior: 'allow' | 'deny'
  message?: string
  /** Present when the user edited the tool input before allowing. */
  updatedInput?: unknown
}

/**
 * The shape Claude expects back, serialised into a text content block.
 *
 * `updatedInput` is always sent on allow: before Claude Code v2.1.207 an allow
 * result without it was rejected as a validation error.
 */
export function permissionPayload(
  decision: ApprovalDecision,
  originalInput: unknown,
): string {
  if (decision.behavior === 'allow') {
    return JSON.stringify({
      behavior: 'allow',
      updatedInput: decision.updatedInput ?? originalInput,
    })
  }
  return JSON.stringify({
    behavior: 'deny',
    message: decision.message || 'Denied from the Claude Remote pane',
  })
}

function send(message: unknown): void {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function reply(id: number | string | null | undefined, result: unknown): void {
  if (id === undefined || id === null) return
  send({ jsonrpc: '2.0', id, result })
}

function replyError(id: number | string | null | undefined, code: number, message: string): void {
  if (id === undefined || id === null) return
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function writeAtomic(target: string, contents: string): void {
  const staging = `${target}.tmp`
  fs.writeFileSync(staging, contents, 'utf-8')
  fs.renameSync(staging, target)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T
  } catch {
    // Missing, or caught mid-write by a writer that is not using rename.
    return null
  }
}

/**
 * Publish the request, then wait for the pane's answer.
 *
 * Exported for tests: the waiting half is the part with the interesting
 * failure modes.
 */
export async function awaitDecision(
  dataDir: string,
  turnId: string,
  request: ApprovalRequest,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<ApprovalDecision> {
  const timeoutMs = options.timeoutMs ?? APPROVAL_TIMEOUT_MS
  const pollMs = options.pollMs ?? POLL_INTERVAL_MS
  const askFile = path.join(dataDir, `${turnId}-ask.json`)
  const decisionFile = path.join(dataDir, `${turnId}-decision.json`)

  // A decision left over from an earlier prompt would be answered instantly and
  // wrongly, so clear the channel before announcing this one.
  try { fs.unlinkSync(decisionFile) } catch { /* nothing stale */ }
  writeAtomic(askFile, JSON.stringify(request))

  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      const decision = readJson<ApprovalDecision>(decisionFile)
      if (decision && decision.id === request.id) {
        try { fs.unlinkSync(decisionFile) } catch { /* already gone */ }
        return decision
      }
      await sleep(pollMs)
    }
    return {
      id: request.id,
      behavior: 'deny',
      message: 'No one answered the permission request in time.',
    }
  } finally {
    try { fs.unlinkSync(askFile) } catch { /* already gone */ }
  }
}

async function handleToolCall(
  dataDir: string,
  turnId: string,
  params: any,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const args = params?.arguments ?? {}
  const toolName: string = args.tool_name ?? args.toolName ?? 'unknown tool'
  const input = args.input ?? {}
  // Claude supplies a tool_use_id; fall back to something unique so a build
  // that omits it still gets a correlatable prompt rather than none.
  const id: string = String(args.tool_use_id ?? args.toolUseId ?? `${turnId}-${Date.now()}`)

  const decision = await awaitDecision(dataDir, turnId, {
    id,
    toolName,
    input,
    askedAt: Date.now(),
  })

  return { content: [{ type: 'text', text: permissionPayload(decision, input) }] }
}

export async function runPermissionServer(turnId: string): Promise<number> {
  const dataDir = process.env.DINOTTY_PLUGIN_DATA_DIR
  if (!dataDir) {
    process.stderr.write('claude-remote permission server: DINOTTY_PLUGIN_DATA_DIR is not set\n')
    return 1
  }

  const rl = readline.createInterface({ input: process.stdin })

  for await (const line of rl) {
    if (!line.trim()) continue
    let request: JsonRpcRequest
    try {
      request = JSON.parse(line)
    } catch {
      continue // Not addressed to us in any way we can answer.
    }

    switch (request.method) {
      case 'initialize':
        reply(request.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: '0.1.0' },
        })
        break

      case 'notifications/initialized':
        break // A notification; nothing to answer.

      case 'tools/list':
        reply(request.id, {
          tools: [{
            name: TOOL_NAME,
            description: 'Ask the Claude Remote pane whether a tool call may proceed.',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: { type: 'string' },
                input: { type: 'object' },
                tool_use_id: { type: 'string' },
              },
              required: ['tool_name', 'input'],
            },
          }],
        })
        break

      case 'tools/call':
        if (request.params?.name !== TOOL_NAME) {
          replyError(request.id, -32602, `unknown tool: ${request.params?.name}`)
          break
        }
        try {
          reply(request.id, await handleToolCall(dataDir, turnId, request.params))
        } catch (e) {
          replyError(request.id, -32603, e instanceof Error ? e.message : String(e))
        }
        break

      case 'ping':
        reply(request.id, {})
        break

      default:
        // Unknown methods must not kill the server: MCP clients probe for
        // capabilities this server does not implement (resources, prompts).
        replyError(request.id, -32601, `method not found: ${request.method}`)
    }
  }

  return 0
}

/**
 * The `--mcp-config` document that points Claude at this server.
 *
 * It invokes node against the bundled CLI directly rather than going through
 * the platform launcher: the launcher exists to solve dinotty's CreateProcess
 * constraint, and here we already know both paths.
 */
export function mcpConfigDocument(turnId: string, dataDir: string): string {
  return JSON.stringify({
    mcpServers: {
      [SERVER_NAME]: {
        command: process.execPath,
        args: [cliEntryPoint(), 'mcp-permission', turnId],
        env: { DINOTTY_PLUGIN_DATA_DIR: dataDir },
      },
    },
  })
}

function cliEntryPoint(): string {
  // argv[1] is dist/cli when node runs the bundle, which is exactly what the
  // permission server needs to re-enter.
  return process.argv[1] ?? path.join(process.env.DINOTTY_PLUGIN_DIR ?? '.', 'dist', 'cli')
}
