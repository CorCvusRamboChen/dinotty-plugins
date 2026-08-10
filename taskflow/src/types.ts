export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'interrupted'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  cwd: string
  pane_id?: string
  source: 'manual' | 'agent'
  attempts: number
  created_at: string
  started_at?: string
  completed_at?: string
  last_error?: string
  agent_id?: string
}

export interface TaskflowState {
  tasks: Task[]
  version: 1
  hide_done: boolean
}

export const INITIAL_STATE: TaskflowState = {
  tasks: [],
  version: 1,
  hide_done: true,
}

export interface AgentConfig {
  id: string
  name: string
  command: string
  args: string[]
  sendDelayMs: number
  splitSendDelayMs: number
}

export interface AgentsConfig {
  agents: AgentConfig[]
  defaultId: string
  version: 1
}

export const DEFAULT_AGENTS: AgentsConfig = {
  version: 1,
  defaultId: 'claude-code',
  agents: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      args: [],
      sendDelayMs: 1500,
      splitSendDelayMs: 2500,
    },
    {
      id: 'codex',
      name: 'Codex',
      command: 'codex',
      args: [],
      sendDelayMs: 2500,
      splitSendDelayMs: 3500,
    },
  ],
}
