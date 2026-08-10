import type { PluginContext } from '../../plugin-api/index'
import type { AgentConfig, AgentsConfig, Task, TaskflowState, TaskStatus } from './types'
import { DEFAULT_AGENTS, INITIAL_STATE } from './types'
import { generateId, nowIso } from './format'

const STORAGE_KEY = 'state'
const PERSIST_DEBOUNCE_MS = 300

export async function loadState(ctx: PluginContext): Promise<TaskflowState> {
  const stored = await ctx.storage.get<TaskflowState>(STORAGE_KEY)
  if (!stored || stored.version !== 1) {
    return { ...INITIAL_STATE }
  }
  return {
    tasks: Array.isArray(stored.tasks) ? stored.tasks : [],
    version: 1,
    hide_done: typeof stored.hide_done === 'boolean' ? stored.hide_done : true,
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

export function persist(ctx: PluginContext, state: TaskflowState): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void ctx.storage.set(STORAGE_KEY, state)
  }, PERSIST_DEBOUNCE_MS)
}

export async function persistNow(ctx: PluginContext, state: TaskflowState): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  await ctx.storage.set(STORAGE_KEY, state)
}

export function clearPersistTimer(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress'],
  in_progress: ['done', 'interrupted'],
  interrupted: ['in_progress', 'done'],
  done: ['in_progress'],
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function findTask(state: TaskflowState, taskId: string): Task | undefined {
  return state.tasks.find((t) => t.id === taskId)
}

export function transitionTask(
  state: TaskflowState,
  taskId: string,
  target: TaskStatus,
  patch?: Partial<Task>,
): { ok: true; task: Task } | { ok: false; error: string } {
  const task = findTask(state, taskId)
  if (!task) return { ok: false, error: 'task not found' }
  if (!canTransition(task.status, target)) {
    return { ok: false, error: `cannot transition from ${task.status} to ${target}` }
  }
  const now = nowIso()
  task.status = target
  if (target === 'in_progress') {
    if (!task.started_at) task.started_at = now
    task.attempts += 1
    task.last_error = undefined
  } else if (target === 'done') {
    task.completed_at = now
  }
  if (patch) Object.assign(task, patch)
  return { ok: true, task: task }
}

export interface AddTaskParams {
  title: string
  description?: string
  cwd: string
  source?: 'manual' | 'agent'
  status?: TaskStatus
  agent_id?: string
}

export function addTask(state: TaskflowState, params: AddTaskParams): Task {
  const now = nowIso()
  const status = params.status ?? 'todo'
  const task: Task = {
    id: generateId(),
    title: params.title,
    description: params.description || params.title,
    status,
    cwd: params.cwd,
    source: params.source ?? 'manual',
    attempts: 0,
    created_at: now,
  }
  if (params.agent_id) task.agent_id = params.agent_id
  if (status === 'done') {
    task.completed_at = now
  }
  state.tasks.unshift(task)
  return task
}

export function deleteTask(state: TaskflowState, taskId: string): boolean {
  const idx = state.tasks.findIndex((t) => t.id === taskId)
  if (idx === -1) return false
  state.tasks.splice(idx, 1)
  return true
}

export function updateTask(
  state: TaskflowState,
  taskId: string,
  patch: Partial<Task>,
): Task | undefined {
  const task = findTask(state, taskId)
  if (!task) return undefined
  Object.assign(task, patch)
  return task
}

export function parseBatchLines(text: string): string[] {
  const results: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    results.push(trimmed)
  }
  return results
}

const AGENTS_STORAGE_KEY = 'agents'

export async function loadAgents(ctx: PluginContext): Promise<AgentsConfig> {
  const stored = await ctx.storage.get<AgentsConfig>(AGENTS_STORAGE_KEY)
  if (!stored || stored.version !== 1 || !Array.isArray(stored.agents) || stored.agents.length === 0) {
    return { ...DEFAULT_AGENTS, agents: DEFAULT_AGENTS.agents.map((a) => ({ ...a, args: [...a.args] })) }
  }
  return {
    version: 1,
    agents: stored.agents.map((a) => ({
      id: a.id,
      name: a.name,
      command: a.command,
      args: Array.isArray(a.args) ? [...a.args] : [],
      sendDelayMs: typeof a.sendDelayMs === 'number' ? a.sendDelayMs : 1500,
      splitSendDelayMs: typeof a.splitSendDelayMs === 'number' ? a.splitSendDelayMs : 2500,
    })),
    defaultId: stored.agents.some((a) => a.id === stored.defaultId) ? stored.defaultId : stored.agents[0].id,
  }
}

export async function saveAgents(ctx: PluginContext, cfg: AgentsConfig): Promise<void> {
  await ctx.storage.set(AGENTS_STORAGE_KEY, cfg)
}

export function findAgent(cfg: AgentsConfig, id?: string): AgentConfig | null {
  if (cfg.agents.length === 0) return null
  const targetId = id ?? cfg.defaultId
  return cfg.agents.find((a) => a.id === targetId) ?? cfg.agents[0] ?? null
}

export function addAgent(cfg: AgentsConfig, agent: AgentConfig): void {
  cfg.agents.push(agent)
  if (!cfg.defaultId || !cfg.agents.some((a) => a.id === cfg.defaultId)) {
    cfg.defaultId = agent.id
  }
}

export function updateAgent(cfg: AgentsConfig, agent: AgentConfig): boolean {
  const idx = cfg.agents.findIndex((a) => a.id === agent.id)
  if (idx === -1) return false
  cfg.agents[idx] = agent
  return true
}

export function deleteAgent(cfg: AgentsConfig, id: string): { ok: true } | { ok: false; error: string } {
  if (cfg.agents.length <= 1) {
    return { ok: false, error: 'last_agent_protected' }
  }
  const idx = cfg.agents.findIndex((a) => a.id === id)
  if (idx === -1) return { ok: false, error: 'agent not found' }
  cfg.agents.splice(idx, 1)
  if (cfg.defaultId === id) {
    cfg.defaultId = cfg.agents[0].id
  }
  return { ok: true }
}

export function newAgentId(): string {
  return generateId()
}
