import type { PluginContext, PluginExports, Disposable } from '../../plugin-api/index'
import type { AgentConfig, AgentsConfig, Task, TaskflowState, TaskStatus } from './types'
import { DEFAULT_AGENTS, INITIAL_STATE } from './types'
import {
  loadState, persist, persistNow, clearPersistTimer, canTransition, transitionTask,
  addTask, deleteTask, updateTask, parseBatchLines,
  loadAgents, saveAgents, findAgent, addAgent, updateAgent, deleteAgent, newAgentId,
} from './state'
import { launchAgentTab, launchAgentSplitPane, resendDescription } from './agent'
import { formatRelativeTime, shortPaneId } from './format'
import { messagesFor, useLocale } from './i18n'

const STATUS_ICON: Record<TaskStatus, string> = {
  todo: '○',
  in_progress: '◐',
  done: '●',
  interrupted: '⊘',
}

interface TaskTemplate {
  label: string
  description: string
}

interface AgentAddPayload {
  title: string
  description?: string
  cwd?: string
  status?: TaskStatus
}

export function activate(ctx: PluginContext): PluginExports {
  const state = ctx.reactive<TaskflowState>({ ...INITIAL_STATE })
  const agentsConfig = ctx.reactive<AgentsConfig>({
    version: 1,
    defaultId: DEFAULT_AGENTS.defaultId,
    agents: DEFAULT_AGENTS.agents.map((a) => ({ ...a, args: [...a.args] })),
  })
  const loading = ctx.ref(true)
  const newTaskInput = ctx.ref('')
  const batchMode = ctx.ref(false)
  const selectionMode = ctx.ref(false)
  const selectedIds = ctx.ref<string[]>([])
  const showTemplates = ctx.ref(false)
  const showForm = ctx.ref(false)
  const activeTab = ctx.ref<'tasks' | 'agents'>('tasks')
  const selectedAgentId = ctx.ref('')
  const editingAgentId = ctx.ref<string | null>(null)
  const editName = ctx.ref('')
  const editCommand = ctx.ref('')
  const editArgs = ctx.ref('')
  const editSendDelay = ctx.ref(1500)
  const editSplitDelay = ctx.ref(2500)
  const pendingSends = new Map<string, ReturnType<typeof setTimeout>[]>()
  const { locale, subscription: localeSub } = useLocale(ctx)
  const t = () => messagesFor(locale.value)

  let disposables: Disposable[] = [localeSub]

  async function init() {
    const loaded = await loadState(ctx)
    state.tasks = loaded.tasks
    state.hide_done = loaded.hide_done
    const loadedAgents = await loadAgents(ctx)
    agentsConfig.agents = loadedAgents.agents.map((a) => ({ ...a, args: [...a.args] }))
    agentsConfig.defaultId = loadedAgents.defaultId
    selectedAgentId.value = loadedAgents.defaultId
    loading.value = false

    const closedSub = ctx.events.subscribe<{ pane_id: string; exit_code: number }>(
      'session.closed',
      (data) => {
        if (!data || !data.pane_id) return
        const task = state.tasks.find((t) => t.pane_id === data.pane_id)
        if (!task) return
        if (task.status !== 'in_progress') return
        const result = transitionTask(state, task.id, 'interrupted', {
          last_error: t().errors.tabClosed(data.exit_code),
        })
        if (result.ok) persist(ctx, state)
      },
    )
    disposables.push(closedSub)

    const addSub = ctx.events.subscribe<AgentAddPayload>(
      'taskflow:add',
      (data) => {
        if (!data || typeof data.title !== 'string' || !data.title.trim()) return
        const cwd = typeof data.cwd === 'string' && data.cwd.trim() ? data.cwd : resolveCwd()
        if (!cwd) {
          ctx.ui.notify(t().notify.addNoCwd, 'warn')
          return
        }
        const task = addTask(state, {
          title: data.title.trim(),
          description: typeof data.description === 'string' && data.description.trim() ? data.description! : data.title.trim(),
          cwd,
          source: 'agent',
          status: data.status,
        })
        persist(ctx, state)
        ctx.ui.notify(t().notify.agentAdded(task.title), 'info')
      },
    )
    disposables.push(addSub)
  }

  function resolveCwd(): string {
    return ctx.terminal.activeCwd() ?? ''
  }

  function resetForm() {
    newTaskInput.value = ''
    showTemplates.value = false
  }

  async function submitNewTasks() {
    const cwd = resolveCwd()
    if (!cwd) {
      ctx.ui.notify(t().notify.noCwd, 'warn')
      return
    }

    let titles: string[]
    if (batchMode.value) {
      titles = parseBatchLines(newTaskInput.value)
      if (titles.length === 0) {
        ctx.ui.notify(t().notify.emptyBatch, 'warn')
        return
      }
    } else {
      const trimmed = newTaskInput.value.trim()
      if (!trimmed) {
        ctx.ui.notify(t().notify.emptyTitle, 'warn')
        return
      }
      titles = [trimmed]
    }

    for (const title of titles) {
      addTask(state, {
        title,
        description: title,
        cwd,
        agent_id: selectedAgentId.value || agentsConfig.defaultId,
      })
    }
    persist(ctx, state)
    resetForm()
  }

  async function startTask(task: Task) {
    if (!canTransition(task.status, 'in_progress')) return
    const agent = findAgent(agentsConfig, task.agent_id)
    if (!agent) {
      ctx.ui.notify(t().notify.agentMissing, 'warn')
      return
    }
    const result = transitionTask(state, task.id, 'in_progress')
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), 'warn')
      return
    }
    persist(ctx, state)
    try {
      const { paneId, timers } = await launchAgentTab(ctx, task, agent)
      updateTask(state, task.id, { pane_id: paneId })
      if (timers.length) pendingSends.set(task.id, timers)
      persist(ctx, state)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      transitionTask(state, task.id, 'interrupted', { last_error: msg })
      persist(ctx, state)
      ctx.ui.notify(t().notify.startFailed(msg), 'error')
    }
  }

  async function startTaskInSplitPane(task: Task) {
    if (!canTransition(task.status, 'in_progress')) return
    const agent = findAgent(agentsConfig, task.agent_id)
    if (!agent) {
      ctx.ui.notify(t().notify.agentMissing, 'warn')
      return
    }
    const result = transitionTask(state, task.id, 'in_progress')
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), 'warn')
      return
    }
    persist(ctx, state)
    try {
      const launch = await launchAgentSplitPane(ctx, task, agent)
      if (!launch) {
        transitionTask(state, task.id, 'interrupted', {
          last_error: t().notify.splitNoTerminal,
        })
        persist(ctx, state)
        ctx.ui.notify(t().notify.splitNoTerminal, 'warn')
        return
      }
      updateTask(state, task.id, { pane_id: launch.paneId })
      if (launch.timers.length) pendingSends.set(task.id, launch.timers)
      persist(ctx, state)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      transitionTask(state, task.id, 'interrupted', { last_error: msg })
      persist(ctx, state)
      ctx.ui.notify(t().notify.splitFailed(msg), 'error')
    }
  }

  function markDone(task: Task) {
    const result = transitionTask(state, task.id, 'done')
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), 'warn')
      return
    }
    clearPendingSend(task.id)
    persist(ctx, state)
  }

  function markInterrupted(task: Task) {
    const result = transitionTask(state, task.id, 'interrupted', {
      last_error: t().errors.userInterrupted,
    })
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), 'warn')
      return
    }
    clearPendingSend(task.id)
    persist(ctx, state)
  }

  async function removeTask(task: Task) {
    const ok = await ctx.ui.confirm(t().confirm.deleteTask(task.title))
    if (!ok) return
    clearPendingSend(task.id)
    deleteTask(state, task.id)
    persist(ctx, state)
  }

  function resend(task: Task) {
    if (!task.pane_id) {
      ctx.ui.notify(t().notify.noPane, 'warn')
      return
    }
    resendDescription(ctx, task)
  }

  function clearPendingSend(taskId: string) {
    const timers = pendingSends.get(taskId)
    if (timers) {
      for (const t of timers) clearTimeout(t)
      pendingSends.delete(taskId)
    }
  }

  function toggleHideDone() {
    state.hide_done = !state.hide_done
    persist(ctx, state)
  }

  function toggleBatchMode() {
    batchMode.value = !batchMode.value
  }

  function toggleTemplates() {
    showTemplates.value = !showTemplates.value
  }

  function toggleForm() {
    showForm.value = !showForm.value
    if (showForm.value) {
      setTimeout(() => {
        const el = document.querySelector<HTMLTextAreaElement>('.tf-root .tf-input')
        el?.focus()
      }, 0)
    }
  }

  function applyTemplate(tpl: TaskTemplate) {
    newTaskInput.value = tpl.description
    showTemplates.value = false
  }

  function isSelected(taskId: string): boolean {
    return selectedIds.value.includes(taskId)
  }

  function toggleSelection(taskId: string) {
    const idx = selectedIds.value.indexOf(taskId)
    if (idx === -1) {
      selectedIds.value = [...selectedIds.value, taskId]
    } else {
      selectedIds.value = selectedIds.value.filter((id) => id !== taskId)
    }
  }

  function toggleSelectionMode() {
    selectionMode.value = !selectionMode.value
    if (!selectionMode.value) selectedIds.value = []
  }

  function selectAllVisible() {
    const visible = visibleTasks()
    const allSelected = visible.every((t) => selectedIds.value.includes(t.id))
    selectedIds.value = allSelected ? [] : visible.map((t) => t.id)
  }

  function clearSelection() {
    selectedIds.value = []
  }

  function startEditAgent(agent?: AgentConfig) {
    editingAgentId.value = agent ? agent.id : null
    editName.value = agent?.name ?? ''
    editCommand.value = agent?.command ?? ''
    editArgs.value = agent?.args.join(' ') ?? ''
    editSendDelay.value = agent?.sendDelayMs ?? 1500
    editSplitDelay.value = agent?.splitSendDelayMs ?? 2500
  }

  function cancelEditAgent() {
    editingAgentId.value = null
    editName.value = ''
    editCommand.value = ''
    editArgs.value = ''
    editSendDelay.value = 1500
    editSplitDelay.value = 2500
  }

  async function saveAgentForm() {
    const m = t()
    const name = editName.value.trim()
    const command = editCommand.value.trim()
    if (!name) { ctx.ui.notify(m.notify.agentEmptyName, 'warn'); return }
    if (!command) { ctx.ui.notify(m.notify.agentEmptyCommand, 'warn'); return }
    const sendDelay = Math.max(0, Math.floor(editSendDelay.value))
    const splitDelay = Math.max(0, Math.floor(editSplitDelay.value))
    if (Number.isNaN(sendDelay) || Number.isNaN(splitDelay)) {
      ctx.ui.notify(m.notify.agentInvalidDelay, 'warn')
      return
    }
    const args = parseBatchLines(editArgs.value)
    const id = editingAgentId.value ?? newAgentId()
    const agent: AgentConfig = { id, name, command, args, sendDelayMs: sendDelay, splitSendDelayMs: splitDelay }
    if (editingAgentId.value) {
      updateAgent(agentsConfig, agent)
    } else {
      addAgent(agentsConfig, agent)
    }
    await saveAgents(ctx, agentsConfig)
    cancelEditAgent()
    ctx.ui.notify(m.notify.agentSaved, 'info')
  }

  async function removeAgent(agent: AgentConfig) {
    const m = t()
    const ok = await ctx.ui.confirm(m.confirm.deleteAgent(agent.name))
    if (!ok) return
    const result = deleteAgent(agentsConfig, agent.id)
    if (!result.ok) {
      ctx.ui.notify(m.notify.agentLastProtected, 'warn')
      return
    }
    if (selectedAgentId.value === agent.id) {
      selectedAgentId.value = agentsConfig.defaultId
    }
    await saveAgents(ctx, agentsConfig)
    ctx.ui.notify(m.notify.agentDeleted(agent.name), 'info')
  }

  async function setDefaultAgent(agent: AgentConfig) {
    agentsConfig.defaultId = agent.id
    await saveAgents(ctx, agentsConfig)
  }

  async function batchComplete() {
    const targets = state.tasks.filter(
      (t) => isSelected(t.id) && t.status === 'in_progress',
    )
    if (targets.length === 0) {
      ctx.ui.notify(t().batch.noInProgress, 'warn')
      return
    }
    const ok = await ctx.ui.confirm(t().batch.completeConfirm(targets.length))
    if (!ok) return
    for (const t of targets) {
      const result = transitionTask(state, t.id, 'done')
      if (result.ok) clearPendingSend(t.id)
    }
    persist(ctx, state)
    clearSelection()
  }

  async function batchDelete() {
    const targets = state.tasks.filter((t) => isSelected(t.id))
    if (targets.length === 0) {
      ctx.ui.notify(t().batch.noSelection, 'warn')
      return
    }
    const ok = await ctx.ui.confirm(t().batch.deleteConfirm(targets.length))
    if (!ok) return
    for (const t of targets) {
      clearPendingSend(t.id)
      deleteTask(state, t.id)
    }
    persist(ctx, state)
    clearSelection()
  }

  function visibleTasks(): Task[] {
    if (!state.hide_done) return state.tasks
    return state.tasks.filter((t) => t.status !== 'done')
  }

  function renderTaskCard(task: Task) {
    const m = t()
    const buttons: Array<any> = []
    if (task.status === 'todo') {
      buttons.push(
        hBtn(ctx, m.task.start, 'tf-btn-primary', () => startTask(task)),
      )
      buttons.push(hBtn(ctx, m.task.split, 'tf-btn-ghost', () => startTaskInSplitPane(task)))
    } else if (task.status === 'in_progress') {
      buttons.push(hBtn(ctx, m.task.complete, 'tf-btn-success', () => markDone(task)))
      buttons.push(hBtn(ctx, m.task.interrupt, 'tf-btn-ghost', () => markInterrupted(task)))
      buttons.push(hBtn(ctx, m.task.resend, 'tf-btn-ghost', () => resend(task)))
    } else if (task.status === 'interrupted') {
      buttons.push(hBtn(ctx, m.task.restart, 'tf-btn-primary', () => startTask(task)))
    } else if (task.status === 'done') {
      buttons.push(hBtn(ctx, m.task.restart, 'tf-btn-ghost', () => startTask(task)))
    }
    buttons.push(hBtn(ctx, m.task.delete, 'tf-btn-danger-ghost', () => removeTask(task)))

    const meta: Array<any> = []
    const agent = findAgent(agentsConfig, task.agent_id)
    if (agent) {
      meta.push({ text: agent.name, class: 'tf-meta-item tf-meta-agent' })
    }
    meta.push({ text: m.task.attempts(task.attempts), class: 'tf-meta-item' })
    if (task.pane_id) {
      meta.push({ text: `#${shortPaneId(task.pane_id)}`, class: 'tf-meta-item tf-meta-pane' })
    }
    if (task.started_at) {
      meta.push({ text: formatRelativeTime(task.started_at, locale.value), class: 'tf-meta-item' })
    }
    if (task.last_error) {
      meta.push({ text: task.last_error, class: 'tf-meta-item tf-meta-error' })
    }

    return ctx.h(
      'div',
      {
        key: task.id,
        class: [
          'tf-task',
          `tf-task-${task.status}`,
          isSelected(task.id) ? 'tf-task-selected' : '',
        ],
        onClick: selectionMode.value ? () => toggleSelection(task.id) : undefined,
      },
      [
        selectionMode.value
          ? ctx.h('input', {
              type: 'checkbox',
              class: 'tf-task-check',
              checked: isSelected(task.id),
              onChange: () => toggleSelection(task.id),
              onClick: (e: Event) => e.stopPropagation(),
            })
          : ctx.h('div', { class: 'tf-task-status' }, STATUS_ICON[task.status]),
        ctx.h('div', { class: 'tf-task-body' }, [
          ctx.h('div', { class: 'tf-task-title', title: task.title }, task.title),
          ctx.h('div', { class: 'tf-task-meta' },
            meta.map((m2) => ctx.h('span', { class: m2.class }, m2.text)),
          ),
        ]),
        selectionMode.value
          ? null
          : ctx.h('div', { class: 'tf-task-actions' }, buttons),
      ].filter(Boolean as (v: unknown) => boolean),
    )
  }

  function renderNewTaskForm() {
    const m = t()
    const cwd = resolveCwd()
    const cwdHint = cwd ? m.form.cwdHint(cwd) : m.form.cwdMissing
    const placeholder = batchMode.value ? m.form.placeholderBatch : m.form.placeholderSingle

    const inputEl = ctx.h('textarea', {
      class: 'tf-input tf-textarea',
      placeholder,
      rows: batchMode.value ? 6 : 2,
      value: newTaskInput.value,
      onInput: (e: Event) => { newTaskInput.value = (e.target as HTMLTextAreaElement).value },
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !batchMode.value) {
          e.preventDefault()
          void submitNewTasks()
        }
      },
    })

    return ctx.h('div', { class: 'tf-form' }, [
      inputEl,
      ctx.h('div', { class: 'tf-form-row' }, [
        ctx.h('select', {
          class: 'tf-agent-select',
          value: selectedAgentId.value,
          onChange: (e: Event) => {
            selectedAgentId.value = (e.target as HTMLSelectElement).value
          },
        }, agentsConfig.agents.map((a) =>
          ctx.h('option', { value: a.id }, `${a.name}${a.id === agentsConfig.defaultId ? ` · ${m.agents.isDefault}` : ''}`),
        )),
      ]),
      ctx.h('div', { class: 'tf-form-actions' }, [
        hBtn(ctx, batchMode.value ? m.form.batchSubmit : m.form.submit, 'tf-btn-primary', () => submitNewTasks()),
        batchMode.value
          ? null
          : hBtn(ctx, showTemplates.value ? m.form.templatesHide : m.form.templatesShow, 'tf-btn-ghost', toggleTemplates),
        hBtn(ctx, batchMode.value ? m.form.singleMode : m.form.batchMode, 'tf-btn-ghost', toggleBatchMode),
      ].filter(Boolean as (v: unknown) => boolean)),
      ctx.h('div', { class: 'tf-cwd-hint' }, cwdHint),
      showTemplates.value && !batchMode.value
        ? ctx.h('div', { class: 'tf-templates' },
            m.templates.map((tpl) =>
              ctx.h('button', {
                key: tpl.label,
                class: 'tf-template-btn',
                onClick: () => applyTemplate(tpl),
              }, tpl.label),
            ),
          )
        : null,
    ])
  }

  function renderHeader() {
    const m = t()
    return ctx.h('div', { class: 'tf-header' }, [
      ctx.h('h2', { class: 'tf-title' }, m.header.title),
      ctx.h('div', { class: 'tf-header-actions' }, [
        ctx.h('button', {
          class: ['tf-btn', 'tf-btn-sm', showForm.value ? 'tf-btn-ghost' : 'tf-btn-primary'],
          onClick: toggleForm,
          title: showForm.value ? m.header.collapseForm : m.header.addTask,
        }, showForm.value ? m.header.collapseForm : m.header.addTask),
        ctx.h('button', {
          class: 'tf-btn tf-btn-ghost tf-btn-sm',
          onClick: toggleHideDone,
          title: state.hide_done ? m.header.showDone : m.header.hideDone,
        }, state.hide_done ? m.header.showDone : m.header.hideDone),
        ctx.h('button', {
          class: ['tf-btn', 'tf-btn-sm', selectionMode.value ? 'tf-btn-primary' : 'tf-btn-ghost'],
          onClick: toggleSelectionMode,
          title: m.header.multiSelect,
        }, selectionMode.value ? m.header.exitMultiSelect : m.header.multiSelect),
      ]),
    ])
  }

  function renderBatchBar() {
    if (!selectionMode.value) return null
    const m = t()
    const visible = visibleTasks()
    const allSelected = visible.length > 0 && visible.every((t) => selectedIds.value.includes(t.id))
    return ctx.h('div', { class: 'tf-batch-bar' }, [
      ctx.h('span', { class: 'tf-batch-count' }, m.batch.selected(selectedIds.value.length)),
      ctx.h('button', {
        class: 'tf-btn tf-btn-ghost tf-btn-sm',
        onClick: selectAllVisible,
        disabled: visible.length === 0,
      }, allSelected ? m.batch.unselectAll : m.batch.selectAll),
      ctx.h('button', {
        class: 'tf-btn tf-btn-success tf-btn-sm',
        onClick: batchComplete,
        disabled: selectedIds.value.length === 0,
      }, m.batch.complete),
      ctx.h('button', {
        class: 'tf-btn tf-btn-danger-ghost tf-btn-sm',
        onClick: batchDelete,
        disabled: selectedIds.value.length === 0,
      }, m.batch.delete),
      ctx.h('button', {
        class: 'tf-btn tf-btn-ghost tf-btn-sm',
        onClick: clearSelection,
        disabled: selectedIds.value.length === 0,
      }, m.batch.clear),
    ])
  }

  function renderEmpty() {
    const m = t()
    return ctx.h('div', { class: 'tf-empty' }, [
      ctx.h('div', { class: 'tf-empty-icon' }, '✓'),
      ctx.h('p', null, m.empty.title),
      ctx.h('p', { class: 'tf-empty-hint' }, m.empty.hint),
    ])
  }

  function renderTabs() {
    const m = t()
    return ctx.h('nav', { class: 'tf-tabs' }, [
      ctx.h('button', {
        class: ['tf-tab', activeTab.value === 'tasks' ? 'active' : ''],
        onClick: () => { activeTab.value = 'tasks' },
      }, m.tabs.tasks),
      ctx.h('button', {
        class: ['tf-tab', activeTab.value === 'agents' ? 'active' : ''],
        onClick: () => { activeTab.value = 'agents' },
      }, m.tabs.agents),
    ])
  }

  function renderAgentEditForm() {
    const m = t()
    const isEditing = editingAgentId.value !== null
    return ctx.h('div', { class: 'tf-agent-form' }, [
      ctx.h('div', { class: 'tf-agent-field' }, [
        ctx.h('label', { class: 'tf-label' }, m.agents.nameLabel),
        ctx.h('input', {
          class: 'tf-input',
          type: 'text',
          placeholder: m.agents.namePlaceholder,
          value: editName.value,
          onInput: (e: Event) => { editName.value = (e.target as HTMLInputElement).value },
        }),
      ]),
      ctx.h('div', { class: 'tf-agent-field' }, [
        ctx.h('label', { class: 'tf-label' }, m.agents.commandLabel),
        ctx.h('input', {
          class: 'tf-input',
          type: 'text',
          placeholder: m.agents.commandPlaceholder,
          value: editCommand.value,
          onInput: (e: Event) => { editCommand.value = (e.target as HTMLInputElement).value },
        }),
      ]),
      ctx.h('div', { class: 'tf-agent-field' }, [
        ctx.h('label', { class: 'tf-label' }, m.agents.argsLabel),
        ctx.h('input', {
          class: 'tf-input',
          type: 'text',
          placeholder: m.agents.argsPlaceholder,
          value: editArgs.value,
          onInput: (e: Event) => { editArgs.value = (e.target as HTMLInputElement).value },
        }),
        ctx.h('p', { class: 'tf-hint' }, m.agents.argsHint),
      ]),
      ctx.h('div', { class: 'tf-agent-field-row' }, [
        ctx.h('div', { class: 'tf-agent-field' }, [
          ctx.h('label', { class: 'tf-label' }, m.agents.sendDelayLabel),
          ctx.h('input', {
            class: 'tf-input',
            type: 'number',
            min: '0',
            value: editSendDelay.value,
            onInput: (e: Event) => { editSendDelay.value = Number((e.target as HTMLInputElement).value) },
          }),
        ]),
        ctx.h('div', { class: 'tf-agent-field' }, [
          ctx.h('label', { class: 'tf-label' }, m.agents.splitDelayLabel),
          ctx.h('input', {
            class: 'tf-input',
            type: 'number',
            min: '0',
            value: editSplitDelay.value,
            onInput: (e: Event) => { editSplitDelay.value = Number((e.target as HTMLInputElement).value) },
          }),
        ]),
      ]),
      ctx.h('p', { class: 'tf-hint' }, m.agents.delayHint),
      ctx.h('div', { class: 'tf-agent-form-actions' }, [
        hBtn(ctx, m.agents.save, 'tf-btn-primary', () => { void saveAgentForm() }),
        hBtn(ctx, m.agents.cancel, 'tf-btn-ghost', cancelEditAgent),
      ]),
      isEditing ? null : ctx.h('p', { class: 'tf-hint' }, m.agents.desc),
    ].filter(Boolean as (v: unknown) => boolean))
  }

  function renderAgentCard(agent: AgentConfig) {
    const m = t()
    const isDefault = agent.id === agentsConfig.defaultId
    const cmdLine = agent.args.length > 0 ? `${agent.command} ${agent.args.join(' ')}` : agent.command
    return ctx.h('div', { class: 'tf-agent-card', key: agent.id }, [
      ctx.h('div', { class: 'tf-agent-card-head' }, [
        ctx.h('div', { class: 'tf-agent-card-name' }, [
          ctx.h('span', null, agent.name),
          isDefault ? ctx.h('span', { class: 'tf-agent-default-badge' }, m.agents.isDefault) : null,
        ].filter(Boolean as (v: unknown) => boolean)),
        ctx.h('div', { class: 'tf-agent-card-actions' }, [
          isDefault
            ? null
            : hBtn(ctx, m.agents.setDefault, 'tf-btn-ghost', () => { void setDefaultAgent(agent) }),
          hBtn(ctx, m.agents.edit, 'tf-btn-ghost', () => startEditAgent(agent)),
          hBtn(ctx, m.agents.delete, 'tf-btn-danger-ghost', () => { void removeAgent(agent) }),
        ].filter(Boolean as (v: unknown) => boolean)),
      ]),
      ctx.h('div', { class: 'tf-agent-card-cmd' }, cmdLine),
      ctx.h('div', { class: 'tf-agent-card-meta' }, [
        ctx.h('span', { class: 'tf-meta-item' }, `${m.agents.sendDelayLabel}: ${agent.sendDelayMs}`),
        ctx.h('span', { class: 'tf-meta-item' }, `${m.agents.splitDelayLabel}: ${agent.splitSendDelayMs}`),
      ]),
    ])
  }

  function renderAgentsPanel() {
    const m = t()
    const isEditing = editingAgentId.value !== null
    return ctx.h('div', { class: 'tf-agents-panel' }, [
      ctx.h('div', { class: 'tf-agents-header' }, [
        ctx.h('div', null, [
          ctx.h('h2', { class: 'tf-title' }, m.agents.title),
          ctx.h('p', { class: 'tf-hint' }, m.agents.desc),
        ]),
        isEditing
          ? null
          : hBtn(ctx, m.agents.add, 'tf-btn-primary', () => startEditAgent()),
      ].filter(Boolean as (v: unknown) => boolean)),
      isEditing ? renderAgentEditForm() : null,
      ctx.h('div', { class: 'tf-agent-list' }, agentsConfig.agents.map(renderAgentCard)),
    ].filter(Boolean as (v: unknown) => boolean))
  }

  const component = {
    setup() {
      ctx.onMounted(() => { void init() })
      ctx.onUnmounted(() => {
        for (const d of disposables) d.dispose()
        disposables = []
        for (const timers of pendingSends.values()) for (const t of timers) clearTimeout(t)
        pendingSends.clear()
        void persistNow(ctx, state)
        void saveAgents(ctx, agentsConfig)
      })
      return {}
    },
    render() {
      if (loading.value) {
        return ctx.h('div', { class: 'tf-loading' }, t().loading)
      }
      const m = t()
      const tasksPanel = activeTab.value === 'tasks'
        ? [
            renderHeader(),
            renderBatchBar(),
            showForm.value ? renderNewTaskForm() : null,
            visibleTasks().length === 0
              ? renderEmpty()
              : ctx.h('div', { class: 'tf-list' }, visibleTasks().map(renderTaskCard)),
          ]
        : [renderAgentsPanel()]
      return ctx.h('div', { class: 'tf-root' }, [
        renderTabs(),
        ...(tasksPanel.filter(Boolean as (v: unknown) => boolean) as any[]),
      ])
    },
  }

  disposables.push(
    ctx.commands.register('taskflow.new', () => {
      showForm.value = true
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('.tf-root .tf-input')
        if (el) el.focus()
        else ctx.open()
      }, 0)
    }),
    ctx.commands.register('taskflow.start', () => {
      const todo = state.tasks.find((t) => t.status === 'todo')
      if (!todo) {
        ctx.ui.notify(t().commands.noTodo, 'warn')
        return
      }
      ctx.open()
      void startTask(todo)
    }),
    ctx.commands.register('taskflow.complete', () => {
      const ongoing = state.tasks.find((t) => t.status === 'in_progress')
      if (!ongoing) {
        ctx.ui.notify(t().commands.noInProgress, 'warn')
        return
      }
      markDone(ongoing)
    }),
  )

  return { component, dispose: () => {
    for (const d of disposables) d.dispose()
    disposables = []
    for (const timers of pendingSends.values()) for (const t of timers) clearTimeout(t)
    pendingSends.clear()
    clearPersistTimer()
    void saveAgents(ctx, agentsConfig)
  } }
}

function hBtn(
  ctx: PluginContext,
  label: string,
  cls: string,
  onClick: () => void,
) {
  return ctx.h('button', { class: ['tf-btn', 'tf-btn-sm', cls], onClick }, label)
}
