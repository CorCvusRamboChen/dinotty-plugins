import type { PluginContext } from '../../plugin-api/index'
import type { AgentConfig, Task } from './types'

export interface LaunchResult {
  paneId: string
  timers: ReturnType<typeof setTimeout>[]
}

/** New pane needs a moment to mount and connect its PTY before we can send
 *  keystrokes. Without this delay, the first send (the agent command) is
 *  silently dropped because termRefs[paneId] is still undefined on the host. */
const SHELL_READY_DELAY_MS = 400

/** Open a new terminal tab and execute the agent command directly (no shell),
 *  then send the task description after agent.sendDelayMs. */
export async function launchAgentTab(
  ctx: PluginContext,
  task: Task,
  agent: AgentConfig,
): Promise<LaunchResult> {
  const paneId = await ctx.terminal.createTerminalTab({
    cwd: task.cwd,
    argv: [agent.command, ...agent.args],
    title: task.title,
  })

  const sendTimer = setTimeout(() => {
    ctx.terminal.send(paneId, task.description + '\r')
  }, agent.sendDelayMs)

  return { paneId, timers: [sendTimer] }
}

/** Split the active terminal pane (creates a shell), type the agent command
 *  once the new pane is ready, then send the task description.
 *  Returns null if no terminal tab is active. */
export async function launchAgentSplitPane(
  ctx: PluginContext,
  task: Task,
  agent: AgentConfig,
): Promise<LaunchResult | null> {
  const paneId = await ctx.terminal.splitTerminalPane({
    direction: 'horizontal',
    cwd: task.cwd,
  })
  if (!paneId) return null

  const cmdLine = agent.args.length > 0
    ? `${agent.command} ${agent.args.join(' ')}\r`
    : `${agent.command}\r`
  const commandTimer = setTimeout(() => {
    ctx.terminal.send(paneId, cmdLine)
  }, SHELL_READY_DELAY_MS)
  const sendTimer = setTimeout(() => {
    ctx.terminal.send(paneId, task.description + '\r')
  }, SHELL_READY_DELAY_MS + agent.splitSendDelayMs)

  return { paneId, timers: [commandTimer, sendTimer] }
}

export function resendDescription(ctx: PluginContext, task: Task): void {
  if (!task.pane_id) return
  ctx.terminal.send(task.pane_id, task.description + '\r')
}
