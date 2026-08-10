// src/types.ts
var INITIAL_STATE = {
  tasks: [],
  version: 1,
  hide_done: true
};
var DEFAULT_AGENTS = {
  version: 1,
  defaultId: "claude-code",
  agents: [
    {
      id: "claude-code",
      name: "Claude Code",
      command: "claude",
      args: [],
      sendDelayMs: 1500,
      splitSendDelayMs: 2500
    },
    {
      id: "codex",
      name: "Codex",
      command: "codex",
      args: [],
      sendDelayMs: 2500,
      splitSendDelayMs: 3500
    }
  ]
};

// src/i18n.ts
var messages = {
  en: {
    tabs: {
      tasks: "Tasks",
      agents: "Agents"
    },
    status: {
      todo: "To do",
      in_progress: "In progress",
      done: "Done",
      interrupted: "Interrupted"
    },
    header: {
      title: "Taskflow",
      addTask: "Add task",
      collapseForm: "Collapse",
      hideDone: "Hide done",
      showDone: "Show done",
      multiSelect: "Multi-select",
      exitMultiSelect: "Exit multi-select"
    },
    batch: {
      selected: (count) => `${count} selected`,
      selectAll: "Select all",
      unselectAll: "Unselect all",
      complete: "Complete",
      delete: "Delete",
      clear: "Clear",
      noInProgress: "No in-progress tasks to complete",
      noSelection: "No tasks selected",
      completeConfirm: (count) => `Complete ${count} in-progress task(s)?`,
      deleteConfirm: (count) => `Delete ${count} task(s)?`
    },
    form: {
      placeholderSingle: "Task description (Enter to submit, Shift+Enter for newline)",
      placeholderBatch: "One task per line\nImplement login page\nFix registration validation\nWrite unit tests",
      submit: "Add",
      batchSubmit: "Submit batch",
      templatesShow: "Templates \u25BC",
      templatesHide: "Templates \u25B2",
      batchMode: "Batch mode",
      singleMode: "Single mode",
      cwdHint: (cwd) => `Working directory: ${cwd}`,
      cwdMissing: "No working directory detected"
    },
    empty: {
      title: "No tasks yet",
      hint: 'Click "Add task" above and enter a description to begin'
    },
    loading: "Loading...",
    task: {
      start: "Start in new tab",
      split: "Start in split",
      complete: "Done",
      interrupt: "Interrupt",
      resend: "Resend",
      restart: "Restart",
      delete: "Delete",
      attempts: (count) => `Attempts: ${count}`
    },
    templates: [
      {
        label: "Fix bug",
        description: "Please locate and fix the following bug:\n\n{describe the problem here}\n\nSteps: reproduce first, find root cause, then fix and verify the regression."
      },
      {
        label: "Implement feature",
        description: "Please implement the following feature:\n\n{describe the feature here}\n\nSteps: design first, confirm, then implement, and finally write tests for coverage."
      },
      {
        label: "Refactor",
        description: "Please refactor the following code:\n\n{describe the refactor goal here}\n\nConstraints: preserve external behavior, improve internal structure, run existing tests to ensure nothing breaks."
      },
      {
        label: "Write tests",
        description: "Please write tests for the following code:\n\n{describe the code under test here}\n\nRequirements: cover the happy path and edge cases, using the project's existing test framework."
      },
      {
        label: "Code review",
        description: "Please review the following code:\n\n{paste or describe the code here}\n\nFocus: readability, correctness, security, performance. Provide concrete improvement suggestions."
      }
    ],
    notify: {
      addNoCwd: "taskflow:add received a task but could not determine the working directory",
      agentAdded: (title) => `Agent added task: ${title}`,
      noCwd: "Could not determine the working directory. Open a terminal tab first.",
      emptyBatch: "Please enter one task per line",
      emptyTitle: "Please enter a task description",
      startFailed: (msg) => `Failed to start agent tab: ${msg}`,
      noPane: "This task has not launched an agent tab yet",
      splitNoTerminal: "Open a terminal tab before splitting to run a task",
      splitFailed: (msg) => `Failed to start agent in split pane: ${msg}`,
      transitionError: (msg) => msg,
      agentMissing: "No agent configured. Add one in the Agents tab.",
      agentSaved: "Agent saved",
      agentDeleted: (name) => `Agent "${name}" deleted`,
      agentEmptyName: "Agent name cannot be empty",
      agentEmptyCommand: "Agent command cannot be empty",
      agentLastProtected: "Keep at least one agent",
      agentInvalidDelay: "Delay must be a non-negative number"
    },
    confirm: {
      deleteTask: (title) => `Delete task "${title}"?`,
      deleteAgent: (name) => `Delete agent "${name}"?`
    },
    commands: {
      noTodo: "No to-do tasks",
      noInProgress: "No in-progress tasks"
    },
    errors: {
      userInterrupted: "Manually interrupted by user",
      tabClosed: (exitCode) => `tab closed (exit ${exitCode})`
    },
    time: {
      justNow: "Just now",
      minutesAgo: (n) => `${n} min ago`,
      hoursAgo: (n) => `${n} h ago`,
      daysAgo: (n) => `${n} d ago`,
      locale: "en-US",
      durationDays: (days, hours) => `${days}d ${hours}h`,
      durationHours: (hours, mins) => `${hours}h ${mins}m`,
      durationMins: (mins, secs) => `${mins}m ${secs}s`,
      durationSecs: (secs) => `${secs}s`
    },
    agents: {
      title: "Agents",
      desc: "Configure which CLI agents tasks can launch. The default is used when a task does not specify one.",
      add: "Add agent",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      cancel: "Cancel",
      setDefault: "Set as default",
      isDefault: "Default",
      nameLabel: "Name",
      commandLabel: "Command",
      argsLabel: "Args",
      argsHint: "Space-separated, e.g. --model gpt-4",
      sendDelayLabel: "Send delay (ms)",
      splitDelayLabel: "Split delay (ms)",
      delayHint: "How long to wait after spawn before sending the task description",
      namePlaceholder: "e.g. Claude Code",
      commandPlaceholder: "e.g. claude",
      argsPlaceholder: "e.g. --model gpt-4"
    }
  },
  zh: {
    tabs: {
      tasks: "\u4EFB\u52A1",
      agents: "Agent"
    },
    status: {
      todo: "\u5F85\u529E",
      in_progress: "\u8FDB\u884C\u4E2D",
      done: "\u5DF2\u5B8C\u6210",
      interrupted: "\u5DF2\u4E2D\u65AD"
    },
    header: {
      title: "Taskflow",
      addTask: "\u6DFB\u52A0\u4EFB\u52A1",
      collapseForm: "\u6536\u8D77",
      hideDone: "\u9690\u85CF\u5DF2\u5B8C\u6210",
      showDone: "\u663E\u793A\u5DF2\u5B8C\u6210",
      multiSelect: "\u591A\u9009",
      exitMultiSelect: "\u9000\u51FA\u591A\u9009"
    },
    batch: {
      selected: (count) => `\u5DF2\u9009 ${count}`,
      selectAll: "\u5168\u9009",
      unselectAll: "\u53D6\u6D88\u5168\u9009",
      complete: "\u5B8C\u6210\u9009\u4E2D",
      delete: "\u5220\u9664\u9009\u4E2D",
      clear: "\u6E05\u7A7A\u9009\u62E9",
      noInProgress: "\u6CA1\u6709\u53EF\u5B8C\u6210\u7684\u8FDB\u884C\u4E2D\u4EFB\u52A1",
      noSelection: "\u672A\u9009\u4E2D\u4EFB\u4F55\u4EFB\u52A1",
      completeConfirm: (count) => `\u5B8C\u6210 ${count} \u4E2A\u8FDB\u884C\u4E2D\u4EFB\u52A1\uFF1F`,
      deleteConfirm: (count) => `\u5220\u9664 ${count} \u4E2A\u4EFB\u52A1\uFF1F`
    },
    form: {
      placeholderSingle: "\u4EFB\u52A1\u63CF\u8FF0\uFF08Enter \u63D0\u4EA4\uFF0CShift+Enter \u6362\u884C\uFF09",
      placeholderBatch: "\u6BCF\u884C\u4E00\u4E2A\u4EFB\u52A1\n\u5B9E\u73B0\u767B\u5F55\u9875\u9762\n\u4FEE\u590D\u6CE8\u518C\u63A5\u53E3\u7684\u6821\u9A8C\u95EE\u9898\n\u7F16\u5199\u5355\u5143\u6D4B\u8BD5",
      submit: "\u6DFB\u52A0",
      batchSubmit: "\u6279\u91CF\u63D0\u4EA4",
      templatesShow: "\u6A21\u677F \u25BC",
      templatesHide: "\u6A21\u677F \u25B2",
      batchMode: "\u5207\u6362\u6279\u91CF",
      singleMode: "\u5207\u6362\u5355\u884C",
      cwdHint: (cwd) => `\u5DE5\u4F5C\u76EE\u5F55: ${cwd}`,
      cwdMissing: "\u672A\u68C0\u6D4B\u5230\u5DE5\u4F5C\u76EE\u5F55"
    },
    empty: {
      title: "\u8FD8\u6CA1\u6709\u4EFB\u52A1",
      hint: "\u70B9\u51FB\u4E0A\u65B9\u300C\u6DFB\u52A0\u4EFB\u52A1\u300D\u6309\u94AE\uFF0C\u8F93\u5165\u4EFB\u52A1\u63CF\u8FF0\u540E\u56DE\u8F66\u6DFB\u52A0"
    },
    loading: "\u52A0\u8F7D\u4E2D...",
    task: {
      start: "\u65B0 tab \u542F\u52A8",
      split: "\u5206\u5C4F\u542F\u52A8",
      complete: "\u5B8C\u6210",
      interrupt: "\u4E2D\u65AD",
      resend: "\u91CD\u53D1",
      restart: "\u91CD\u542F",
      delete: "\u5220\u9664",
      attempts: (count) => `\u5C1D\u8BD5 ${count}`
    },
    templates: [
      {
        label: "\u4FEE\u590D bug",
        description: "\u8BF7\u5B9A\u4F4D\u5E76\u4FEE\u590D\u4EE5\u4E0B bug\uFF1A\n\n{\u5728\u6B64\u63CF\u8FF0\u95EE\u9898}\n\n\u6B65\u9AA4\uFF1A\u5148\u590D\u73B0\u95EE\u9898\uFF0C\u5B9A\u4F4D\u6839\u56E0\uFF0C\u518D\u4FEE\u590D\u5E76\u9A8C\u8BC1\u56DE\u5F52\u3002"
      },
      {
        label: "\u5B9E\u73B0\u529F\u80FD",
        description: "\u8BF7\u5B9E\u73B0\u4EE5\u4E0B\u529F\u80FD\uFF1A\n\n{\u5728\u6B64\u63CF\u8FF0\u529F\u80FD}\n\n\u6B65\u9AA4\uFF1A\u5148\u8BBE\u8BA1\u65B9\u6848\uFF0C\u786E\u8BA4\u540E\u518D\u5B9E\u73B0\uFF0C\u6700\u540E\u7F16\u5199\u6D4B\u8BD5\u8986\u76D6\u3002"
      },
      {
        label: "\u91CD\u6784",
        description: "\u8BF7\u91CD\u6784\u4EE5\u4E0B\u4EE3\u7801\uFF1A\n\n{\u5728\u6B64\u63CF\u8FF0\u91CD\u6784\u76EE\u6807}\n\n\u7EA6\u675F\uFF1A\u4FDD\u6301\u5916\u90E8\u884C\u4E3A\u4E0D\u53D8\uFF0C\u6539\u5584\u5185\u90E8\u7ED3\u6784\uFF0C\u8FD0\u884C\u73B0\u6709\u6D4B\u8BD5\u786E\u4FDD\u4E0D\u7834\u574F\u3002"
      },
      {
        label: "\u7F16\u5199\u6D4B\u8BD5",
        description: "\u8BF7\u4E3A\u4EE5\u4E0B\u4EE3\u7801\u7F16\u5199\u6D4B\u8BD5\uFF1A\n\n{\u5728\u6B64\u63CF\u8FF0\u88AB\u6D4B\u4EE3\u7801}\n\n\u8981\u6C42\uFF1A\u8986\u76D6\u6B63\u5E38\u8DEF\u5F84\u4E0E\u8FB9\u754C\u60C5\u51B5\uFF0C\u4F7F\u7528\u9879\u76EE\u73B0\u6709\u6D4B\u8BD5\u6846\u67B6\u3002"
      },
      {
        label: "\u4EE3\u7801\u5BA1\u67E5",
        description: "\u8BF7\u5BA1\u67E5\u4EE5\u4E0B\u4EE3\u7801\uFF1A\n\n{\u5728\u6B64\u7C98\u8D34\u6216\u63CF\u8FF0\u4EE3\u7801}\n\n\u5173\u6CE8\uFF1A\u53EF\u8BFB\u6027\u3001\u6B63\u786E\u6027\u3001\u5B89\u5168\u6027\u3001\u6027\u80FD\u3002\u7ED9\u51FA\u5177\u4F53\u6539\u8FDB\u5EFA\u8BAE\u3002"
      }
    ],
    notify: {
      addNoCwd: "taskflow:add \u6536\u5230\u4EFB\u52A1\u4F46\u65E0\u6CD5\u786E\u5B9A\u5DE5\u4F5C\u76EE\u5F55",
      agentAdded: (title) => `agent \u6DFB\u52A0\u4EFB\u52A1: ${title}`,
      noCwd: "\u65E0\u6CD5\u786E\u5B9A\u5DE5\u4F5C\u76EE\u5F55\uFF0C\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u7EC8\u7AEF tab",
      emptyBatch: "\u8BF7\u8F93\u5165\u4EFB\u52A1\uFF0C\u6BCF\u884C\u4E00\u4E2A",
      emptyTitle: "\u8BF7\u8F93\u5165\u4EFB\u52A1\u63CF\u8FF0",
      startFailed: (msg) => `\u542F\u52A8 agent tab \u5931\u8D25: ${msg}`,
      noPane: "\u8BE5\u4EFB\u52A1\u5C1A\u672A\u542F\u52A8 agent tab",
      splitNoTerminal: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u7EC8\u7AEF tab \u540E\u518D\u5206\u5C4F\u6267\u884C",
      splitFailed: (msg) => `\u5206\u5C4F\u542F\u52A8 agent \u5931\u8D25: ${msg}`,
      transitionError: (msg) => msg,
      agentMissing: "\u672A\u914D\u7F6E\u4EFB\u4F55 agent\uFF0C\u8BF7\u5148\u5728 Agent \u9875\u6DFB\u52A0",
      agentSaved: "agent \u5DF2\u4FDD\u5B58",
      agentDeleted: (name) => `\u5DF2\u5220\u9664 agent\u300C${name}\u300D`,
      agentEmptyName: "agent \u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A",
      agentEmptyCommand: "agent \u547D\u4EE4\u4E0D\u80FD\u4E3A\u7A7A",
      agentLastProtected: "\u81F3\u5C11\u4FDD\u7559\u4E00\u4E2A agent",
      agentInvalidDelay: "\u5EF6\u8FDF\u5FC5\u987B\u4E3A\u975E\u8D1F\u6570"
    },
    confirm: {
      deleteTask: (title) => `\u5220\u9664\u4EFB\u52A1\u300C${title}\u300D\uFF1F`,
      deleteAgent: (name) => `\u5220\u9664 agent\u300C${name}\u300D\uFF1F`
    },
    commands: {
      noTodo: "\u6CA1\u6709\u5F85\u529E\u4EFB\u52A1",
      noInProgress: "\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u4EFB\u52A1"
    },
    errors: {
      userInterrupted: "\u7528\u6237\u624B\u52A8\u4E2D\u65AD",
      tabClosed: (exitCode) => `tab closed (exit ${exitCode})`
    },
    time: {
      justNow: "\u521A\u521A",
      minutesAgo: (n) => `${n} \u5206\u949F\u524D`,
      hoursAgo: (n) => `${n} \u5C0F\u65F6\u524D`,
      daysAgo: (n) => `${n} \u5929\u524D`,
      locale: "zh-CN",
      durationDays: (days, hours) => `${days}\u5929 ${hours}\u5C0F\u65F6`,
      durationHours: (hours, mins) => `${hours}\u5C0F\u65F6 ${mins}\u5206`,
      durationMins: (mins, secs) => `${mins}\u5206 ${secs}\u79D2`,
      durationSecs: (secs) => `${secs}\u79D2`
    },
    agents: {
      title: "Agent",
      desc: "\u914D\u7F6E\u4EFB\u52A1\u53EF\u542F\u52A8\u7684 agent CLI\u3002\u672A\u6307\u5B9A\u65F6\u4F7F\u7528\u9ED8\u8BA4 agent\u3002",
      add: "\u6DFB\u52A0 agent",
      edit: "\u7F16\u8F91",
      delete: "\u5220\u9664",
      save: "\u4FDD\u5B58",
      cancel: "\u53D6\u6D88",
      setDefault: "\u8BBE\u4E3A\u9ED8\u8BA4",
      isDefault: "\u9ED8\u8BA4",
      nameLabel: "\u540D\u79F0",
      commandLabel: "\u547D\u4EE4",
      argsLabel: "\u53C2\u6570",
      argsHint: "\u7A7A\u683C\u5206\u9694\uFF0C\u5982 --model gpt-4",
      sendDelayLabel: "\u53D1\u9001\u5EF6\u8FDF (ms)",
      splitDelayLabel: "\u5206\u5C4F\u5EF6\u8FDF (ms)",
      delayHint: "\u542F\u52A8 agent \u540E\u7B49\u5F85\u591A\u4E45\u518D\u53D1\u9001\u4EFB\u52A1\u63CF\u8FF0",
      namePlaceholder: "\u5982 Claude Code",
      commandPlaceholder: "\u5982 claude",
      argsPlaceholder: "\u5982 --model gpt-4"
    }
  }
};
function messagesFor(locale) {
  return messages[locale];
}
function useLocale(ctx) {
  const locale = ctx.ref(ctx.i18n.getLocale());
  const subscription = ctx.i18n.onDidChangeLocale((next) => {
    locale.value = next;
  });
  return { locale, subscription };
}

// src/format.ts
function formatRelativeTime(iso, locale) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const m = messagesFor(locale).time;
  if (diffMs < 0) return m.justNow;
  const diffSec = Math.floor(diffMs / 1e3);
  const diffMin = Math.floor(diffMs / 6e4);
  const diffHour = Math.floor(diffMs / 36e5);
  const diffDay = Math.floor(diffMs / 864e5);
  if (diffSec < 60) return m.justNow;
  if (diffMin < 60) return m.minutesAgo(diffMin);
  if (diffHour < 24) return m.hoursAgo(diffHour);
  if (diffDay < 30) return m.daysAgo(diffDay);
  return d.toLocaleDateString(m.locale);
}
function shortPaneId(paneId) {
  if (!paneId) return "";
  return paneId.length > 8 ? paneId.slice(0, 8) : paneId;
}
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/state.ts
var STORAGE_KEY = "state";
var PERSIST_DEBOUNCE_MS = 300;
async function loadState(ctx) {
  const stored = await ctx.storage.get(STORAGE_KEY);
  if (!stored || stored.version !== 1) {
    return { ...INITIAL_STATE };
  }
  return {
    tasks: Array.isArray(stored.tasks) ? stored.tasks : [],
    version: 1,
    hide_done: typeof stored.hide_done === "boolean" ? stored.hide_done : true
  };
}
var persistTimer = null;
function persist(ctx, state) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void ctx.storage.set(STORAGE_KEY, state);
  }, PERSIST_DEBOUNCE_MS);
}
async function persistNow(ctx, state) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await ctx.storage.set(STORAGE_KEY, state);
}
function clearPersistTimer() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}
var ALLOWED_TRANSITIONS = {
  todo: ["in_progress"],
  in_progress: ["done", "interrupted"],
  interrupted: ["in_progress", "done"],
  done: ["in_progress"]
};
function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
function findTask(state, taskId) {
  return state.tasks.find((t) => t.id === taskId);
}
function transitionTask(state, taskId, target, patch) {
  const task = findTask(state, taskId);
  if (!task) return { ok: false, error: "task not found" };
  if (!canTransition(task.status, target)) {
    return { ok: false, error: `cannot transition from ${task.status} to ${target}` };
  }
  const now = nowIso();
  task.status = target;
  if (target === "in_progress") {
    if (!task.started_at) task.started_at = now;
    task.attempts += 1;
    task.last_error = void 0;
  } else if (target === "done") {
    task.completed_at = now;
  }
  if (patch) Object.assign(task, patch);
  return { ok: true, task };
}
function addTask(state, params) {
  const now = nowIso();
  const status = params.status ?? "todo";
  const task = {
    id: generateId(),
    title: params.title,
    description: params.description || params.title,
    status,
    cwd: params.cwd,
    source: params.source ?? "manual",
    attempts: 0,
    created_at: now
  };
  if (params.agent_id) task.agent_id = params.agent_id;
  if (status === "done") {
    task.completed_at = now;
  }
  state.tasks.unshift(task);
  return task;
}
function deleteTask(state, taskId) {
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return false;
  state.tasks.splice(idx, 1);
  return true;
}
function updateTask(state, taskId, patch) {
  const task = findTask(state, taskId);
  if (!task) return void 0;
  Object.assign(task, patch);
  return task;
}
function parseBatchLines(text) {
  const results = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    results.push(trimmed);
  }
  return results;
}
var AGENTS_STORAGE_KEY = "agents";
async function loadAgents(ctx) {
  const stored = await ctx.storage.get(AGENTS_STORAGE_KEY);
  if (!stored || stored.version !== 1 || !Array.isArray(stored.agents) || stored.agents.length === 0) {
    return { ...DEFAULT_AGENTS, agents: DEFAULT_AGENTS.agents.map((a) => ({ ...a, args: [...a.args] })) };
  }
  return {
    version: 1,
    agents: stored.agents.map((a) => ({
      id: a.id,
      name: a.name,
      command: a.command,
      args: Array.isArray(a.args) ? [...a.args] : [],
      sendDelayMs: typeof a.sendDelayMs === "number" ? a.sendDelayMs : 1500,
      splitSendDelayMs: typeof a.splitSendDelayMs === "number" ? a.splitSendDelayMs : 2500
    })),
    defaultId: stored.agents.some((a) => a.id === stored.defaultId) ? stored.defaultId : stored.agents[0].id
  };
}
async function saveAgents(ctx, cfg) {
  await ctx.storage.set(AGENTS_STORAGE_KEY, cfg);
}
function findAgent(cfg, id) {
  if (cfg.agents.length === 0) return null;
  const targetId = id ?? cfg.defaultId;
  return cfg.agents.find((a) => a.id === targetId) ?? cfg.agents[0] ?? null;
}
function addAgent(cfg, agent) {
  cfg.agents.push(agent);
  if (!cfg.defaultId || !cfg.agents.some((a) => a.id === cfg.defaultId)) {
    cfg.defaultId = agent.id;
  }
}
function updateAgent(cfg, agent) {
  const idx = cfg.agents.findIndex((a) => a.id === agent.id);
  if (idx === -1) return false;
  cfg.agents[idx] = agent;
  return true;
}
function deleteAgent(cfg, id) {
  if (cfg.agents.length <= 1) {
    return { ok: false, error: "last_agent_protected" };
  }
  const idx = cfg.agents.findIndex((a) => a.id === id);
  if (idx === -1) return { ok: false, error: "agent not found" };
  cfg.agents.splice(idx, 1);
  if (cfg.defaultId === id) {
    cfg.defaultId = cfg.agents[0].id;
  }
  return { ok: true };
}
function newAgentId() {
  return generateId();
}

// src/agent.ts
var SHELL_READY_DELAY_MS = 400;
async function launchAgentTab(ctx, task, agent) {
  const paneId = await ctx.terminal.createTerminalTab({
    cwd: task.cwd,
    argv: [agent.command, ...agent.args],
    title: task.title
  });
  const sendTimer = setTimeout(() => {
    ctx.terminal.send(paneId, task.description + "\r");
  }, agent.sendDelayMs);
  return { paneId, timers: [sendTimer] };
}
async function launchAgentSplitPane(ctx, task, agent) {
  const paneId = await ctx.terminal.splitTerminalPane({
    direction: "horizontal",
    cwd: task.cwd
  });
  if (!paneId) return null;
  const cmdLine = agent.args.length > 0 ? `${agent.command} ${agent.args.join(" ")}\r` : `${agent.command}\r`;
  const commandTimer = setTimeout(() => {
    ctx.terminal.send(paneId, cmdLine);
  }, SHELL_READY_DELAY_MS);
  const sendTimer = setTimeout(() => {
    ctx.terminal.send(paneId, task.description + "\r");
  }, SHELL_READY_DELAY_MS + agent.splitSendDelayMs);
  return { paneId, timers: [commandTimer, sendTimer] };
}
function resendDescription(ctx, task) {
  if (!task.pane_id) return;
  ctx.terminal.send(task.pane_id, task.description + "\r");
}

// src/ui.ts
var STATUS_ICON = {
  todo: "\u25CB",
  in_progress: "\u25D0",
  done: "\u25CF",
  interrupted: "\u2298"
};
function activate(ctx) {
  const state = ctx.reactive({ ...INITIAL_STATE });
  const agentsConfig = ctx.reactive({
    version: 1,
    defaultId: DEFAULT_AGENTS.defaultId,
    agents: DEFAULT_AGENTS.agents.map((a) => ({ ...a, args: [...a.args] }))
  });
  const loading = ctx.ref(true);
  const newTaskInput = ctx.ref("");
  const batchMode = ctx.ref(false);
  const selectionMode = ctx.ref(false);
  const selectedIds = ctx.ref([]);
  const showTemplates = ctx.ref(false);
  const showForm = ctx.ref(false);
  const activeTab = ctx.ref("tasks");
  const selectedAgentId = ctx.ref("");
  const editingAgentId = ctx.ref(null);
  const editName = ctx.ref("");
  const editCommand = ctx.ref("");
  const editArgs = ctx.ref("");
  const editSendDelay = ctx.ref(1500);
  const editSplitDelay = ctx.ref(2500);
  const pendingSends = /* @__PURE__ */ new Map();
  const { locale, subscription: localeSub } = useLocale(ctx);
  const t = () => messagesFor(locale.value);
  let disposables = [localeSub];
  async function init() {
    const loaded = await loadState(ctx);
    state.tasks = loaded.tasks;
    state.hide_done = loaded.hide_done;
    const loadedAgents = await loadAgents(ctx);
    agentsConfig.agents = loadedAgents.agents.map((a) => ({ ...a, args: [...a.args] }));
    agentsConfig.defaultId = loadedAgents.defaultId;
    selectedAgentId.value = loadedAgents.defaultId;
    loading.value = false;
    const closedSub = ctx.events.subscribe(
      "session.closed",
      (data) => {
        if (!data || !data.pane_id) return;
        const task = state.tasks.find((t2) => t2.pane_id === data.pane_id);
        if (!task) return;
        if (task.status !== "in_progress") return;
        const result = transitionTask(state, task.id, "interrupted", {
          last_error: t().errors.tabClosed(data.exit_code)
        });
        if (result.ok) persist(ctx, state);
      }
    );
    disposables.push(closedSub);
    const addSub = ctx.events.subscribe(
      "taskflow:add",
      (data) => {
        if (!data || typeof data.title !== "string" || !data.title.trim()) return;
        const cwd = typeof data.cwd === "string" && data.cwd.trim() ? data.cwd : resolveCwd();
        if (!cwd) {
          ctx.ui.notify(t().notify.addNoCwd, "warn");
          return;
        }
        const task = addTask(state, {
          title: data.title.trim(),
          description: typeof data.description === "string" && data.description.trim() ? data.description : data.title.trim(),
          cwd,
          source: "agent",
          status: data.status
        });
        persist(ctx, state);
        ctx.ui.notify(t().notify.agentAdded(task.title), "info");
      }
    );
    disposables.push(addSub);
  }
  function resolveCwd() {
    return ctx.terminal.activeCwd() ?? "";
  }
  function resetForm() {
    newTaskInput.value = "";
    showTemplates.value = false;
  }
  async function submitNewTasks() {
    const cwd = resolveCwd();
    if (!cwd) {
      ctx.ui.notify(t().notify.noCwd, "warn");
      return;
    }
    let titles;
    if (batchMode.value) {
      titles = parseBatchLines(newTaskInput.value);
      if (titles.length === 0) {
        ctx.ui.notify(t().notify.emptyBatch, "warn");
        return;
      }
    } else {
      const trimmed = newTaskInput.value.trim();
      if (!trimmed) {
        ctx.ui.notify(t().notify.emptyTitle, "warn");
        return;
      }
      titles = [trimmed];
    }
    for (const title of titles) {
      addTask(state, {
        title,
        description: title,
        cwd,
        agent_id: selectedAgentId.value || agentsConfig.defaultId
      });
    }
    persist(ctx, state);
    resetForm();
  }
  async function startTask(task) {
    if (!canTransition(task.status, "in_progress")) return;
    const agent = findAgent(agentsConfig, task.agent_id);
    if (!agent) {
      ctx.ui.notify(t().notify.agentMissing, "warn");
      return;
    }
    const result = transitionTask(state, task.id, "in_progress");
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), "warn");
      return;
    }
    persist(ctx, state);
    try {
      const { paneId, timers } = await launchAgentTab(ctx, task, agent);
      updateTask(state, task.id, { pane_id: paneId });
      if (timers.length) pendingSends.set(task.id, timers);
      persist(ctx, state);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      transitionTask(state, task.id, "interrupted", { last_error: msg });
      persist(ctx, state);
      ctx.ui.notify(t().notify.startFailed(msg), "error");
    }
  }
  async function startTaskInSplitPane(task) {
    if (!canTransition(task.status, "in_progress")) return;
    const agent = findAgent(agentsConfig, task.agent_id);
    if (!agent) {
      ctx.ui.notify(t().notify.agentMissing, "warn");
      return;
    }
    const result = transitionTask(state, task.id, "in_progress");
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), "warn");
      return;
    }
    persist(ctx, state);
    try {
      const launch = await launchAgentSplitPane(ctx, task, agent);
      if (!launch) {
        transitionTask(state, task.id, "interrupted", {
          last_error: t().notify.splitNoTerminal
        });
        persist(ctx, state);
        ctx.ui.notify(t().notify.splitNoTerminal, "warn");
        return;
      }
      updateTask(state, task.id, { pane_id: launch.paneId });
      if (launch.timers.length) pendingSends.set(task.id, launch.timers);
      persist(ctx, state);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      transitionTask(state, task.id, "interrupted", { last_error: msg });
      persist(ctx, state);
      ctx.ui.notify(t().notify.splitFailed(msg), "error");
    }
  }
  function markDone(task) {
    const result = transitionTask(state, task.id, "done");
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), "warn");
      return;
    }
    clearPendingSend(task.id);
    persist(ctx, state);
  }
  function markInterrupted(task) {
    const result = transitionTask(state, task.id, "interrupted", {
      last_error: t().errors.userInterrupted
    });
    if (!result.ok) {
      ctx.ui.notify(t().notify.transitionError(result.error), "warn");
      return;
    }
    clearPendingSend(task.id);
    persist(ctx, state);
  }
  async function removeTask(task) {
    const ok = await ctx.ui.confirm(t().confirm.deleteTask(task.title));
    if (!ok) return;
    clearPendingSend(task.id);
    deleteTask(state, task.id);
    persist(ctx, state);
  }
  function resend(task) {
    if (!task.pane_id) {
      ctx.ui.notify(t().notify.noPane, "warn");
      return;
    }
    resendDescription(ctx, task);
  }
  function clearPendingSend(taskId) {
    const timers = pendingSends.get(taskId);
    if (timers) {
      for (const t2 of timers) clearTimeout(t2);
      pendingSends.delete(taskId);
    }
  }
  function toggleHideDone() {
    state.hide_done = !state.hide_done;
    persist(ctx, state);
  }
  function toggleBatchMode() {
    batchMode.value = !batchMode.value;
  }
  function toggleTemplates() {
    showTemplates.value = !showTemplates.value;
  }
  function toggleForm() {
    showForm.value = !showForm.value;
    if (showForm.value) {
      setTimeout(() => {
        const el = document.querySelector(".tf-root .tf-input");
        el?.focus();
      }, 0);
    }
  }
  function applyTemplate(tpl) {
    newTaskInput.value = tpl.description;
    showTemplates.value = false;
  }
  function isSelected(taskId) {
    return selectedIds.value.includes(taskId);
  }
  function toggleSelection(taskId) {
    const idx = selectedIds.value.indexOf(taskId);
    if (idx === -1) {
      selectedIds.value = [...selectedIds.value, taskId];
    } else {
      selectedIds.value = selectedIds.value.filter((id) => id !== taskId);
    }
  }
  function toggleSelectionMode() {
    selectionMode.value = !selectionMode.value;
    if (!selectionMode.value) selectedIds.value = [];
  }
  function selectAllVisible() {
    const visible = visibleTasks();
    const allSelected = visible.every((t2) => selectedIds.value.includes(t2.id));
    selectedIds.value = allSelected ? [] : visible.map((t2) => t2.id);
  }
  function clearSelection() {
    selectedIds.value = [];
  }
  function startEditAgent(agent) {
    editingAgentId.value = agent ? agent.id : null;
    editName.value = agent?.name ?? "";
    editCommand.value = agent?.command ?? "";
    editArgs.value = agent?.args.join(" ") ?? "";
    editSendDelay.value = agent?.sendDelayMs ?? 1500;
    editSplitDelay.value = agent?.splitSendDelayMs ?? 2500;
  }
  function cancelEditAgent() {
    editingAgentId.value = null;
    editName.value = "";
    editCommand.value = "";
    editArgs.value = "";
    editSendDelay.value = 1500;
    editSplitDelay.value = 2500;
  }
  async function saveAgentForm() {
    const m = t();
    const name = editName.value.trim();
    const command = editCommand.value.trim();
    if (!name) {
      ctx.ui.notify(m.notify.agentEmptyName, "warn");
      return;
    }
    if (!command) {
      ctx.ui.notify(m.notify.agentEmptyCommand, "warn");
      return;
    }
    const sendDelay = Math.max(0, Math.floor(editSendDelay.value));
    const splitDelay = Math.max(0, Math.floor(editSplitDelay.value));
    if (Number.isNaN(sendDelay) || Number.isNaN(splitDelay)) {
      ctx.ui.notify(m.notify.agentInvalidDelay, "warn");
      return;
    }
    const args = parseBatchLines(editArgs.value);
    const id = editingAgentId.value ?? newAgentId();
    const agent = { id, name, command, args, sendDelayMs: sendDelay, splitSendDelayMs: splitDelay };
    if (editingAgentId.value) {
      updateAgent(agentsConfig, agent);
    } else {
      addAgent(agentsConfig, agent);
    }
    await saveAgents(ctx, agentsConfig);
    cancelEditAgent();
    ctx.ui.notify(m.notify.agentSaved, "info");
  }
  async function removeAgent(agent) {
    const m = t();
    const ok = await ctx.ui.confirm(m.confirm.deleteAgent(agent.name));
    if (!ok) return;
    const result = deleteAgent(agentsConfig, agent.id);
    if (!result.ok) {
      ctx.ui.notify(m.notify.agentLastProtected, "warn");
      return;
    }
    if (selectedAgentId.value === agent.id) {
      selectedAgentId.value = agentsConfig.defaultId;
    }
    await saveAgents(ctx, agentsConfig);
    ctx.ui.notify(m.notify.agentDeleted(agent.name), "info");
  }
  async function setDefaultAgent(agent) {
    agentsConfig.defaultId = agent.id;
    await saveAgents(ctx, agentsConfig);
  }
  async function batchComplete() {
    const targets = state.tasks.filter(
      (t2) => isSelected(t2.id) && t2.status === "in_progress"
    );
    if (targets.length === 0) {
      ctx.ui.notify(t().batch.noInProgress, "warn");
      return;
    }
    const ok = await ctx.ui.confirm(t().batch.completeConfirm(targets.length));
    if (!ok) return;
    for (const t2 of targets) {
      const result = transitionTask(state, t2.id, "done");
      if (result.ok) clearPendingSend(t2.id);
    }
    persist(ctx, state);
    clearSelection();
  }
  async function batchDelete() {
    const targets = state.tasks.filter((t2) => isSelected(t2.id));
    if (targets.length === 0) {
      ctx.ui.notify(t().batch.noSelection, "warn");
      return;
    }
    const ok = await ctx.ui.confirm(t().batch.deleteConfirm(targets.length));
    if (!ok) return;
    for (const t2 of targets) {
      clearPendingSend(t2.id);
      deleteTask(state, t2.id);
    }
    persist(ctx, state);
    clearSelection();
  }
  function visibleTasks() {
    if (!state.hide_done) return state.tasks;
    return state.tasks.filter((t2) => t2.status !== "done");
  }
  function renderTaskCard(task) {
    const m = t();
    const buttons = [];
    if (task.status === "todo") {
      buttons.push(
        hBtn(ctx, m.task.start, "tf-btn-primary", () => startTask(task))
      );
      buttons.push(hBtn(ctx, m.task.split, "tf-btn-ghost", () => startTaskInSplitPane(task)));
    } else if (task.status === "in_progress") {
      buttons.push(hBtn(ctx, m.task.complete, "tf-btn-success", () => markDone(task)));
      buttons.push(hBtn(ctx, m.task.interrupt, "tf-btn-ghost", () => markInterrupted(task)));
      buttons.push(hBtn(ctx, m.task.resend, "tf-btn-ghost", () => resend(task)));
    } else if (task.status === "interrupted") {
      buttons.push(hBtn(ctx, m.task.restart, "tf-btn-primary", () => startTask(task)));
    } else if (task.status === "done") {
      buttons.push(hBtn(ctx, m.task.restart, "tf-btn-ghost", () => startTask(task)));
    }
    buttons.push(hBtn(ctx, m.task.delete, "tf-btn-danger-ghost", () => removeTask(task)));
    const meta = [];
    const agent = findAgent(agentsConfig, task.agent_id);
    if (agent) {
      meta.push({ text: agent.name, class: "tf-meta-item tf-meta-agent" });
    }
    meta.push({ text: m.task.attempts(task.attempts), class: "tf-meta-item" });
    if (task.pane_id) {
      meta.push({ text: `#${shortPaneId(task.pane_id)}`, class: "tf-meta-item tf-meta-pane" });
    }
    if (task.started_at) {
      meta.push({ text: formatRelativeTime(task.started_at, locale.value), class: "tf-meta-item" });
    }
    if (task.last_error) {
      meta.push({ text: task.last_error, class: "tf-meta-item tf-meta-error" });
    }
    return ctx.h(
      "div",
      {
        key: task.id,
        class: [
          "tf-task",
          `tf-task-${task.status}`,
          isSelected(task.id) ? "tf-task-selected" : ""
        ],
        onClick: selectionMode.value ? () => toggleSelection(task.id) : void 0
      },
      [
        selectionMode.value ? ctx.h("input", {
          type: "checkbox",
          class: "tf-task-check",
          checked: isSelected(task.id),
          onChange: () => toggleSelection(task.id),
          onClick: (e) => e.stopPropagation()
        }) : ctx.h("div", { class: "tf-task-status" }, STATUS_ICON[task.status]),
        ctx.h("div", { class: "tf-task-body" }, [
          ctx.h("div", { class: "tf-task-title", title: task.title }, task.title),
          ctx.h(
            "div",
            { class: "tf-task-meta" },
            meta.map((m2) => ctx.h("span", { class: m2.class }, m2.text))
          )
        ]),
        selectionMode.value ? null : ctx.h("div", { class: "tf-task-actions" }, buttons)
      ].filter(Boolean)
    );
  }
  function renderNewTaskForm() {
    const m = t();
    const cwd = resolveCwd();
    const cwdHint = cwd ? m.form.cwdHint(cwd) : m.form.cwdMissing;
    const placeholder = batchMode.value ? m.form.placeholderBatch : m.form.placeholderSingle;
    const inputEl = ctx.h("textarea", {
      class: "tf-input tf-textarea",
      placeholder,
      rows: batchMode.value ? 6 : 2,
      value: newTaskInput.value,
      onInput: (e) => {
        newTaskInput.value = e.target.value;
      },
      onKeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey && !batchMode.value) {
          e.preventDefault();
          void submitNewTasks();
        }
      }
    });
    return ctx.h("div", { class: "tf-form" }, [
      inputEl,
      ctx.h("div", { class: "tf-form-row" }, [
        ctx.h("select", {
          class: "tf-agent-select",
          value: selectedAgentId.value,
          onChange: (e) => {
            selectedAgentId.value = e.target.value;
          }
        }, agentsConfig.agents.map(
          (a) => ctx.h("option", { value: a.id }, `${a.name}${a.id === agentsConfig.defaultId ? ` \xB7 ${m.agents.isDefault}` : ""}`)
        ))
      ]),
      ctx.h("div", { class: "tf-form-actions" }, [
        hBtn(ctx, batchMode.value ? m.form.batchSubmit : m.form.submit, "tf-btn-primary", () => submitNewTasks()),
        batchMode.value ? null : hBtn(ctx, showTemplates.value ? m.form.templatesHide : m.form.templatesShow, "tf-btn-ghost", toggleTemplates),
        hBtn(ctx, batchMode.value ? m.form.singleMode : m.form.batchMode, "tf-btn-ghost", toggleBatchMode)
      ].filter(Boolean)),
      ctx.h("div", { class: "tf-cwd-hint" }, cwdHint),
      showTemplates.value && !batchMode.value ? ctx.h(
        "div",
        { class: "tf-templates" },
        m.templates.map(
          (tpl) => ctx.h("button", {
            key: tpl.label,
            class: "tf-template-btn",
            onClick: () => applyTemplate(tpl)
          }, tpl.label)
        )
      ) : null
    ]);
  }
  function renderHeader() {
    const m = t();
    return ctx.h("div", { class: "tf-header" }, [
      ctx.h("h2", { class: "tf-title" }, m.header.title),
      ctx.h("div", { class: "tf-header-actions" }, [
        ctx.h("button", {
          class: ["tf-btn", "tf-btn-sm", showForm.value ? "tf-btn-ghost" : "tf-btn-primary"],
          onClick: toggleForm,
          title: showForm.value ? m.header.collapseForm : m.header.addTask
        }, showForm.value ? m.header.collapseForm : m.header.addTask),
        ctx.h("button", {
          class: "tf-btn tf-btn-ghost tf-btn-sm",
          onClick: toggleHideDone,
          title: state.hide_done ? m.header.showDone : m.header.hideDone
        }, state.hide_done ? m.header.showDone : m.header.hideDone),
        ctx.h("button", {
          class: ["tf-btn", "tf-btn-sm", selectionMode.value ? "tf-btn-primary" : "tf-btn-ghost"],
          onClick: toggleSelectionMode,
          title: m.header.multiSelect
        }, selectionMode.value ? m.header.exitMultiSelect : m.header.multiSelect)
      ])
    ]);
  }
  function renderBatchBar() {
    if (!selectionMode.value) return null;
    const m = t();
    const visible = visibleTasks();
    const allSelected = visible.length > 0 && visible.every((t2) => selectedIds.value.includes(t2.id));
    return ctx.h("div", { class: "tf-batch-bar" }, [
      ctx.h("span", { class: "tf-batch-count" }, m.batch.selected(selectedIds.value.length)),
      ctx.h("button", {
        class: "tf-btn tf-btn-ghost tf-btn-sm",
        onClick: selectAllVisible,
        disabled: visible.length === 0
      }, allSelected ? m.batch.unselectAll : m.batch.selectAll),
      ctx.h("button", {
        class: "tf-btn tf-btn-success tf-btn-sm",
        onClick: batchComplete,
        disabled: selectedIds.value.length === 0
      }, m.batch.complete),
      ctx.h("button", {
        class: "tf-btn tf-btn-danger-ghost tf-btn-sm",
        onClick: batchDelete,
        disabled: selectedIds.value.length === 0
      }, m.batch.delete),
      ctx.h("button", {
        class: "tf-btn tf-btn-ghost tf-btn-sm",
        onClick: clearSelection,
        disabled: selectedIds.value.length === 0
      }, m.batch.clear)
    ]);
  }
  function renderEmpty() {
    const m = t();
    return ctx.h("div", { class: "tf-empty" }, [
      ctx.h("div", { class: "tf-empty-icon" }, "\u2713"),
      ctx.h("p", null, m.empty.title),
      ctx.h("p", { class: "tf-empty-hint" }, m.empty.hint)
    ]);
  }
  function renderTabs() {
    const m = t();
    return ctx.h("nav", { class: "tf-tabs" }, [
      ctx.h("button", {
        class: ["tf-tab", activeTab.value === "tasks" ? "active" : ""],
        onClick: () => {
          activeTab.value = "tasks";
        }
      }, m.tabs.tasks),
      ctx.h("button", {
        class: ["tf-tab", activeTab.value === "agents" ? "active" : ""],
        onClick: () => {
          activeTab.value = "agents";
        }
      }, m.tabs.agents)
    ]);
  }
  function renderAgentEditForm() {
    const m = t();
    const isEditing = editingAgentId.value !== null;
    return ctx.h("div", { class: "tf-agent-form" }, [
      ctx.h("div", { class: "tf-agent-field" }, [
        ctx.h("label", { class: "tf-label" }, m.agents.nameLabel),
        ctx.h("input", {
          class: "tf-input",
          type: "text",
          placeholder: m.agents.namePlaceholder,
          value: editName.value,
          onInput: (e) => {
            editName.value = e.target.value;
          }
        })
      ]),
      ctx.h("div", { class: "tf-agent-field" }, [
        ctx.h("label", { class: "tf-label" }, m.agents.commandLabel),
        ctx.h("input", {
          class: "tf-input",
          type: "text",
          placeholder: m.agents.commandPlaceholder,
          value: editCommand.value,
          onInput: (e) => {
            editCommand.value = e.target.value;
          }
        })
      ]),
      ctx.h("div", { class: "tf-agent-field" }, [
        ctx.h("label", { class: "tf-label" }, m.agents.argsLabel),
        ctx.h("input", {
          class: "tf-input",
          type: "text",
          placeholder: m.agents.argsPlaceholder,
          value: editArgs.value,
          onInput: (e) => {
            editArgs.value = e.target.value;
          }
        }),
        ctx.h("p", { class: "tf-hint" }, m.agents.argsHint)
      ]),
      ctx.h("div", { class: "tf-agent-field-row" }, [
        ctx.h("div", { class: "tf-agent-field" }, [
          ctx.h("label", { class: "tf-label" }, m.agents.sendDelayLabel),
          ctx.h("input", {
            class: "tf-input",
            type: "number",
            min: "0",
            value: editSendDelay.value,
            onInput: (e) => {
              editSendDelay.value = Number(e.target.value);
            }
          })
        ]),
        ctx.h("div", { class: "tf-agent-field" }, [
          ctx.h("label", { class: "tf-label" }, m.agents.splitDelayLabel),
          ctx.h("input", {
            class: "tf-input",
            type: "number",
            min: "0",
            value: editSplitDelay.value,
            onInput: (e) => {
              editSplitDelay.value = Number(e.target.value);
            }
          })
        ])
      ]),
      ctx.h("p", { class: "tf-hint" }, m.agents.delayHint),
      ctx.h("div", { class: "tf-agent-form-actions" }, [
        hBtn(ctx, m.agents.save, "tf-btn-primary", () => {
          void saveAgentForm();
        }),
        hBtn(ctx, m.agents.cancel, "tf-btn-ghost", cancelEditAgent)
      ]),
      isEditing ? null : ctx.h("p", { class: "tf-hint" }, m.agents.desc)
    ].filter(Boolean));
  }
  function renderAgentCard(agent) {
    const m = t();
    const isDefault = agent.id === agentsConfig.defaultId;
    const cmdLine = agent.args.length > 0 ? `${agent.command} ${agent.args.join(" ")}` : agent.command;
    return ctx.h("div", { class: "tf-agent-card", key: agent.id }, [
      ctx.h("div", { class: "tf-agent-card-head" }, [
        ctx.h("div", { class: "tf-agent-card-name" }, [
          ctx.h("span", null, agent.name),
          isDefault ? ctx.h("span", { class: "tf-agent-default-badge" }, m.agents.isDefault) : null
        ].filter(Boolean)),
        ctx.h("div", { class: "tf-agent-card-actions" }, [
          isDefault ? null : hBtn(ctx, m.agents.setDefault, "tf-btn-ghost", () => {
            void setDefaultAgent(agent);
          }),
          hBtn(ctx, m.agents.edit, "tf-btn-ghost", () => startEditAgent(agent)),
          hBtn(ctx, m.agents.delete, "tf-btn-danger-ghost", () => {
            void removeAgent(agent);
          })
        ].filter(Boolean))
      ]),
      ctx.h("div", { class: "tf-agent-card-cmd" }, cmdLine),
      ctx.h("div", { class: "tf-agent-card-meta" }, [
        ctx.h("span", { class: "tf-meta-item" }, `${m.agents.sendDelayLabel}: ${agent.sendDelayMs}`),
        ctx.h("span", { class: "tf-meta-item" }, `${m.agents.splitDelayLabel}: ${agent.splitSendDelayMs}`)
      ])
    ]);
  }
  function renderAgentsPanel() {
    const m = t();
    const isEditing = editingAgentId.value !== null;
    return ctx.h("div", { class: "tf-agents-panel" }, [
      ctx.h("div", { class: "tf-agents-header" }, [
        ctx.h("div", null, [
          ctx.h("h2", { class: "tf-title" }, m.agents.title),
          ctx.h("p", { class: "tf-hint" }, m.agents.desc)
        ]),
        isEditing ? null : hBtn(ctx, m.agents.add, "tf-btn-primary", () => startEditAgent())
      ].filter(Boolean)),
      isEditing ? renderAgentEditForm() : null,
      ctx.h("div", { class: "tf-agent-list" }, agentsConfig.agents.map(renderAgentCard))
    ].filter(Boolean));
  }
  const component = {
    setup() {
      ctx.onMounted(() => {
        void init();
      });
      ctx.onUnmounted(() => {
        for (const d of disposables) d.dispose();
        disposables = [];
        for (const timers of pendingSends.values()) for (const t2 of timers) clearTimeout(t2);
        pendingSends.clear();
        void persistNow(ctx, state);
        void saveAgents(ctx, agentsConfig);
      });
      return {};
    },
    render() {
      if (loading.value) {
        return ctx.h("div", { class: "tf-loading" }, t().loading);
      }
      const m = t();
      const tasksPanel = activeTab.value === "tasks" ? [
        renderHeader(),
        renderBatchBar(),
        showForm.value ? renderNewTaskForm() : null,
        visibleTasks().length === 0 ? renderEmpty() : ctx.h("div", { class: "tf-list" }, visibleTasks().map(renderTaskCard))
      ] : [renderAgentsPanel()];
      return ctx.h("div", { class: "tf-root" }, [
        renderTabs(),
        ...tasksPanel.filter(Boolean)
      ]);
    }
  };
  disposables.push(
    ctx.commands.register("taskflow.new", () => {
      showForm.value = true;
      setTimeout(() => {
        const el = document.querySelector(".tf-root .tf-input");
        if (el) el.focus();
        else ctx.open();
      }, 0);
    }),
    ctx.commands.register("taskflow.start", () => {
      const todo = state.tasks.find((t2) => t2.status === "todo");
      if (!todo) {
        ctx.ui.notify(t().commands.noTodo, "warn");
        return;
      }
      ctx.open();
      void startTask(todo);
    }),
    ctx.commands.register("taskflow.complete", () => {
      const ongoing = state.tasks.find((t2) => t2.status === "in_progress");
      if (!ongoing) {
        ctx.ui.notify(t().commands.noInProgress, "warn");
        return;
      }
      markDone(ongoing);
    })
  );
  return { component, dispose: () => {
    for (const d of disposables) d.dispose();
    disposables = [];
    for (const timers of pendingSends.values()) for (const t2 of timers) clearTimeout(t2);
    pendingSends.clear();
    clearPersistTimer();
    void saveAgents(ctx, agentsConfig);
  } };
}
function hBtn(ctx, label, cls, onClick) {
  return ctx.h("button", { class: ["tf-btn", "tf-btn-sm", cls], onClick }, label);
}
export {
  activate
};
