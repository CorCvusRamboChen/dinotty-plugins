import type { PluginContext, Disposable } from '../../plugin-api/index'
import type { TaskStatus } from './types'

export type Locale = 'en' | 'zh'

interface TemplateMessages {
  label: string
  description: string
}

interface Messages {
  tabs: {
    tasks: string
    agents: string
  }
  status: Record<TaskStatus, string>
  header: {
    title: string
    addTask: string
    collapseForm: string
    hideDone: string
    showDone: string
    multiSelect: string
    exitMultiSelect: string
  }
  batch: {
    selected: (count: number) => string
    selectAll: string
    unselectAll: string
    complete: string
    delete: string
    clear: string
    noInProgress: string
    noSelection: string
    completeConfirm: (count: number) => string
    deleteConfirm: (count: number) => string
  }
  form: {
    placeholderSingle: string
    placeholderBatch: string
    submit: string
    batchSubmit: string
    templatesShow: string
    templatesHide: string
    batchMode: string
    singleMode: string
    cwdHint: (cwd: string) => string
    cwdMissing: string
  }
  empty: {
    title: string
    hint: string
  }
  loading: string
  task: {
    start: string
    split: string
    complete: string
    interrupt: string
    resend: string
    restart: string
    delete: string
    attempts: (count: number) => string
  }
  templates: TemplateMessages[]
  notify: {
    addNoCwd: string
    agentAdded: (title: string) => string
    noCwd: string
    emptyBatch: string
    emptyTitle: string
    startFailed: (msg: string) => string
    noPane: string
    splitNoTerminal: string
    splitFailed: (msg: string) => string
    transitionError: (msg: string) => string
    agentMissing: string
    agentSaved: string
    agentDeleted: (name: string) => string
    agentEmptyName: string
    agentEmptyCommand: string
    agentLastProtected: string
    agentInvalidDelay: string
  }
  confirm: {
    deleteTask: (title: string) => string
    deleteAgent: (name: string) => string
  }
  commands: {
    noTodo: string
    noInProgress: string
  }
  errors: {
    userInterrupted: string
    tabClosed: (exitCode: number) => string
  }
  time: {
    justNow: string
    minutesAgo: (n: number) => string
    hoursAgo: (n: number) => string
    daysAgo: (n: number) => string
    locale: string
    durationDays: (days: number, hours: number) => string
    durationHours: (hours: number, mins: number) => string
    durationMins: (mins: number, secs: number) => string
    durationSecs: (secs: number) => string
  }
  agents: {
    title: string
    desc: string
    add: string
    edit: string
    delete: string
    save: string
    cancel: string
    setDefault: string
    isDefault: string
    nameLabel: string
    commandLabel: string
    argsLabel: string
    argsHint: string
    sendDelayLabel: string
    splitDelayLabel: string
    delayHint: string
    namePlaceholder: string
    commandPlaceholder: string
    argsPlaceholder: string
  }
}

const messages: Record<Locale, Messages> = {
  en: {
    tabs: {
      tasks: 'Tasks',
      agents: 'Agents',
    },
    status: {
      todo: 'To do',
      in_progress: 'In progress',
      done: 'Done',
      interrupted: 'Interrupted',
    },
    header: {
      title: 'Taskflow',
      addTask: 'Add task',
      collapseForm: 'Collapse',
      hideDone: 'Hide done',
      showDone: 'Show done',
      multiSelect: 'Multi-select',
      exitMultiSelect: 'Exit multi-select',
    },
    batch: {
      selected: (count) => `${count} selected`,
      selectAll: 'Select all',
      unselectAll: 'Unselect all',
      complete: 'Complete',
      delete: 'Delete',
      clear: 'Clear',
      noInProgress: 'No in-progress tasks to complete',
      noSelection: 'No tasks selected',
      completeConfirm: (count) => `Complete ${count} in-progress task(s)?`,
      deleteConfirm: (count) => `Delete ${count} task(s)?`,
    },
    form: {
      placeholderSingle: 'Task description (Enter to submit, Shift+Enter for newline)',
      placeholderBatch: 'One task per line\nImplement login page\nFix registration validation\nWrite unit tests',
      submit: 'Add',
      batchSubmit: 'Submit batch',
      templatesShow: 'Templates ▼',
      templatesHide: 'Templates ▲',
      batchMode: 'Batch mode',
      singleMode: 'Single mode',
      cwdHint: (cwd) => `Working directory: ${cwd}`,
      cwdMissing: 'No working directory detected',
    },
    empty: {
      title: 'No tasks yet',
      hint: 'Click "Add task" above and enter a description to begin',
    },
    loading: 'Loading...',
    task: {
      start: 'Start in new tab',
      split: 'Start in split',
      complete: 'Done',
      interrupt: 'Interrupt',
      resend: 'Resend',
      restart: 'Restart',
      delete: 'Delete',
      attempts: (count) => `Attempts: ${count}`,
    },
    templates: [
      {
        label: 'Fix bug',
        description: 'Please locate and fix the following bug:\n\n{describe the problem here}\n\nSteps: reproduce first, find root cause, then fix and verify the regression.',
      },
      {
        label: 'Implement feature',
        description: 'Please implement the following feature:\n\n{describe the feature here}\n\nSteps: design first, confirm, then implement, and finally write tests for coverage.',
      },
      {
        label: 'Refactor',
        description: 'Please refactor the following code:\n\n{describe the refactor goal here}\n\nConstraints: preserve external behavior, improve internal structure, run existing tests to ensure nothing breaks.',
      },
      {
        label: 'Write tests',
        description: 'Please write tests for the following code:\n\n{describe the code under test here}\n\nRequirements: cover the happy path and edge cases, using the project\'s existing test framework.',
      },
      {
        label: 'Code review',
        description: 'Please review the following code:\n\n{paste or describe the code here}\n\nFocus: readability, correctness, security, performance. Provide concrete improvement suggestions.',
      },
    ],
    notify: {
      addNoCwd: 'taskflow:add received a task but could not determine the working directory',
      agentAdded: (title) => `Agent added task: ${title}`,
      noCwd: 'Could not determine the working directory. Open a terminal tab first.',
      emptyBatch: 'Please enter one task per line',
      emptyTitle: 'Please enter a task description',
      startFailed: (msg) => `Failed to start agent tab: ${msg}`,
      noPane: 'This task has not launched an agent tab yet',
      splitNoTerminal: 'Open a terminal tab before splitting to run a task',
      splitFailed: (msg) => `Failed to start agent in split pane: ${msg}`,
      transitionError: (msg) => msg,
      agentMissing: 'No agent configured. Add one in the Agents tab.',
      agentSaved: 'Agent saved',
      agentDeleted: (name) => `Agent "${name}" deleted`,
      agentEmptyName: 'Agent name cannot be empty',
      agentEmptyCommand: 'Agent command cannot be empty',
      agentLastProtected: 'Keep at least one agent',
      agentInvalidDelay: 'Delay must be a non-negative number',
    },
    confirm: {
      deleteTask: (title) => `Delete task "${title}"?`,
      deleteAgent: (name) => `Delete agent "${name}"?`,
    },
    commands: {
      noTodo: 'No to-do tasks',
      noInProgress: 'No in-progress tasks',
    },
    errors: {
      userInterrupted: 'Manually interrupted by user',
      tabClosed: (exitCode) => `tab closed (exit ${exitCode})`,
    },
    time: {
      justNow: 'Just now',
      minutesAgo: (n) => `${n} min ago`,
      hoursAgo: (n) => `${n} h ago`,
      daysAgo: (n) => `${n} d ago`,
      locale: 'en-US',
      durationDays: (days, hours) => `${days}d ${hours}h`,
      durationHours: (hours, mins) => `${hours}h ${mins}m`,
      durationMins: (mins, secs) => `${mins}m ${secs}s`,
      durationSecs: (secs) => `${secs}s`,
    },
    agents: {
      title: 'Agents',
      desc: 'Configure which CLI agents tasks can launch. The default is used when a task does not specify one.',
      add: 'Add agent',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      setDefault: 'Set as default',
      isDefault: 'Default',
      nameLabel: 'Name',
      commandLabel: 'Command',
      argsLabel: 'Args',
      argsHint: 'Space-separated, e.g. --model gpt-4',
      sendDelayLabel: 'Send delay (ms)',
      splitDelayLabel: 'Split delay (ms)',
      delayHint: 'How long to wait after spawn before sending the task description',
      namePlaceholder: 'e.g. Claude Code',
      commandPlaceholder: 'e.g. claude',
      argsPlaceholder: 'e.g. --model gpt-4',
    },
  },
  zh: {
    tabs: {
      tasks: '任务',
      agents: 'Agent',
    },
    status: {
      todo: '待办',
      in_progress: '进行中',
      done: '已完成',
      interrupted: '已中断',
    },
    header: {
      title: 'Taskflow',
      addTask: '添加任务',
      collapseForm: '收起',
      hideDone: '隐藏已完成',
      showDone: '显示已完成',
      multiSelect: '多选',
      exitMultiSelect: '退出多选',
    },
    batch: {
      selected: (count) => `已选 ${count}`,
      selectAll: '全选',
      unselectAll: '取消全选',
      complete: '完成选中',
      delete: '删除选中',
      clear: '清空选择',
      noInProgress: '没有可完成的进行中任务',
      noSelection: '未选中任何任务',
      completeConfirm: (count) => `完成 ${count} 个进行中任务？`,
      deleteConfirm: (count) => `删除 ${count} 个任务？`,
    },
    form: {
      placeholderSingle: '任务描述（Enter 提交，Shift+Enter 换行）',
      placeholderBatch: '每行一个任务\n实现登录页面\n修复注册接口的校验问题\n编写单元测试',
      submit: '添加',
      batchSubmit: '批量提交',
      templatesShow: '模板 ▼',
      templatesHide: '模板 ▲',
      batchMode: '切换批量',
      singleMode: '切换单行',
      cwdHint: (cwd) => `工作目录: ${cwd}`,
      cwdMissing: '未检测到工作目录',
    },
    empty: {
      title: '还没有任务',
      hint: '点击上方「添加任务」按钮，输入任务描述后回车添加',
    },
    loading: '加载中...',
    task: {
      start: '新 tab 启动',
      split: '分屏启动',
      complete: '完成',
      interrupt: '中断',
      resend: '重发',
      restart: '重启',
      delete: '删除',
      attempts: (count) => `尝试 ${count}`,
    },
    templates: [
      {
        label: '修复 bug',
        description: '请定位并修复以下 bug：\n\n{在此描述问题}\n\n步骤：先复现问题，定位根因，再修复并验证回归。',
      },
      {
        label: '实现功能',
        description: '请实现以下功能：\n\n{在此描述功能}\n\n步骤：先设计方案，确认后再实现，最后编写测试覆盖。',
      },
      {
        label: '重构',
        description: '请重构以下代码：\n\n{在此描述重构目标}\n\n约束：保持外部行为不变，改善内部结构，运行现有测试确保不破坏。',
      },
      {
        label: '编写测试',
        description: '请为以下代码编写测试：\n\n{在此描述被测代码}\n\n要求：覆盖正常路径与边界情况，使用项目现有测试框架。',
      },
      {
        label: '代码审查',
        description: '请审查以下代码：\n\n{在此粘贴或描述代码}\n\n关注：可读性、正确性、安全性、性能。给出具体改进建议。',
      },
    ],
    notify: {
      addNoCwd: 'taskflow:add 收到任务但无法确定工作目录',
      agentAdded: (title) => `agent 添加任务: ${title}`,
      noCwd: '无法确定工作目录，请先打开一个终端 tab',
      emptyBatch: '请输入任务，每行一个',
      emptyTitle: '请输入任务描述',
      startFailed: (msg) => `启动 agent tab 失败: ${msg}`,
      noPane: '该任务尚未启动 agent tab',
      splitNoTerminal: '请先打开一个终端 tab 后再分屏执行',
      splitFailed: (msg) => `分屏启动 agent 失败: ${msg}`,
      transitionError: (msg) => msg,
      agentMissing: '未配置任何 agent，请先在 Agent 页添加',
      agentSaved: 'agent 已保存',
      agentDeleted: (name) => `已删除 agent「${name}」`,
      agentEmptyName: 'agent 名称不能为空',
      agentEmptyCommand: 'agent 命令不能为空',
      agentLastProtected: '至少保留一个 agent',
      agentInvalidDelay: '延迟必须为非负数',
    },
    confirm: {
      deleteTask: (title) => `删除任务「${title}」？`,
      deleteAgent: (name) => `删除 agent「${name}」？`,
    },
    commands: {
      noTodo: '没有待办任务',
      noInProgress: '没有进行中的任务',
    },
    errors: {
      userInterrupted: '用户手动中断',
      tabClosed: (exitCode) => `tab closed (exit ${exitCode})`,
    },
    time: {
      justNow: '刚刚',
      minutesAgo: (n) => `${n} 分钟前`,
      hoursAgo: (n) => `${n} 小时前`,
      daysAgo: (n) => `${n} 天前`,
      locale: 'zh-CN',
      durationDays: (days, hours) => `${days}天 ${hours}小时`,
      durationHours: (hours, mins) => `${hours}小时 ${mins}分`,
      durationMins: (mins, secs) => `${mins}分 ${secs}秒`,
      durationSecs: (secs) => `${secs}秒`,
    },
    agents: {
      title: 'Agent',
      desc: '配置任务可启动的 agent CLI。未指定时使用默认 agent。',
      add: '添加 agent',
      edit: '编辑',
      delete: '删除',
      save: '保存',
      cancel: '取消',
      setDefault: '设为默认',
      isDefault: '默认',
      nameLabel: '名称',
      commandLabel: '命令',
      argsLabel: '参数',
      argsHint: '空格分隔，如 --model gpt-4',
      sendDelayLabel: '发送延迟 (ms)',
      splitDelayLabel: '分屏延迟 (ms)',
      delayHint: '启动 agent 后等待多久再发送任务描述',
      namePlaceholder: '如 Claude Code',
      commandPlaceholder: '如 claude',
      argsPlaceholder: '如 --model gpt-4',
    },
  },
}

export function messagesFor(locale: Locale): Messages {
  return messages[locale]
}

/** Resolve the initial locale and keep it in sync with the host.
 *  Returns the reactive locale ref and the subscription disposable. */
export function useLocale(ctx: PluginContext): {
  locale: { value: Locale }
  subscription: Disposable
} {
  const locale = ctx.ref<Locale>(ctx.i18n.getLocale())
  const subscription = ctx.i18n.onDidChangeLocale((next) => {
    locale.value = next
  })
  return { locale, subscription }
}
