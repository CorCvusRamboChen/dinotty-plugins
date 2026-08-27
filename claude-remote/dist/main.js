// src/versions.ts
var PER_CALL_APPROVAL_SINCE = "2.1.199";

// src/conversation.ts
var turnCounter = 0;
function nextTurnId() {
  turnCounter += 1;
  const random = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  return `turn-${Date.now().toString(36)}-${turnCounter}-${random}`;
}
var DEFAULT_PERMISSION_MODE = "acceptEdits";
var POLL_INTERVAL_MS = 250;
var STALE_AFTER_MS = 15e3;
var MAX_HISTORY_MESSAGES = 200;
function createConversation(ctx, paneKey, onError) {
  const state = ctx.reactive({
    history: [],
    live: [],
    draft: "",
    sending: false,
    sessionId: null,
    model: null,
    lastCostUsd: null,
    permissionMode: DEFAULT_PERMISSION_MODE,
    tools: [],
    allowedTools: [],
    perCallApproval: false,
    pendingApproval: null,
    reattached: false
  });
  const sessionKey = `session-${paneKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  let activeTurnId = null;
  let pollTimer = null;
  let disposed = false;
  async function loadSession() {
    try {
      return await ctx.storage.get(sessionKey);
    } catch {
      return void 0;
    }
  }
  async function saveSession(patch) {
    try {
      const existing = await loadSession() ?? {};
      await ctx.storage.set(sessionKey, { ...existing, ...patch });
    } catch (e) {
      onError(`could not persist session: ${describe(e)}`);
    }
  }
  function absorbSnapshot(snapshot) {
    state.live = snapshot.messages;
    if (snapshot.sessionId) state.sessionId = snapshot.sessionId;
    if (snapshot.model) state.model = snapshot.model;
    if (snapshot.tools?.length) state.tools = snapshot.tools;
    if (snapshot.costUsd !== null) state.lastCostUsd = snapshot.costUsd;
  }
  async function finishTurn(snapshot) {
    if (snapshot) {
      state.history.push(...snapshot.messages);
      if (state.history.length > MAX_HISTORY_MESSAGES) {
        state.history.splice(0, state.history.length - MAX_HISTORY_MESSAGES);
      }
    }
    state.live = [];
    state.sending = false;
    state.reattached = false;
    state.pendingApproval = null;
    const finishedTurnId = activeTurnId;
    activeTurnId = null;
    await saveSession({
      sessionId: state.sessionId ?? void 0,
      model: state.model ?? void 0,
      history: state.history,
      activeTurnId: void 0
    });
    if (finishedTurnId) {
      try {
        await ctx.storage.delete(`${finishedTurnId}-log`);
      } catch {
      }
    }
  }
  function follow(turnId) {
    activeTurnId = turnId;
    state.sending = true;
    let lastSeenAt = Date.now();
    let lastUpdatedAt = -1;
    const tick = async () => {
      if (disposed || activeTurnId !== turnId) return;
      let snapshot;
      try {
        snapshot = await ctx.storage.get(`${turnId}-log`);
      } catch {
        snapshot = void 0;
      }
      try {
        state.pendingApproval = await ctx.storage.get(`${turnId}-ask`) ?? null;
      } catch {
        state.pendingApproval = null;
      }
      if (state.pendingApproval) lastSeenAt = Date.now();
      if (snapshot) {
        if (snapshot.updatedAt !== lastUpdatedAt) {
          lastUpdatedAt = snapshot.updatedAt;
          lastSeenAt = Date.now();
        }
        absorbSnapshot(snapshot);
        if (snapshot.status !== "running") {
          await finishTurn(snapshot);
          return;
        }
      }
      if (Date.now() - lastSeenAt > STALE_AFTER_MS && !await isTurnRunning(turnId)) {
        state.live = [
          ...snapshot?.messages ?? [],
          { role: "error", text: "This turn stopped without finishing." }
        ];
        await finishTurn({
          ...snapshot ?? emptySnapshot(turnId),
          status: "failed",
          messages: state.live
        });
        return;
      }
      pollTimer = setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    };
    void tick();
  }
  async function isTurnRunning(turnId) {
    try {
      const processes = await ctx.process.list();
      return processes.some((p) => p.state === "running" && p.args.includes(turnId));
    } catch {
      return true;
    }
  }
  async function restore() {
    const saved = await loadSession();
    if (!saved) return;
    if (saved.sessionId) state.sessionId = saved.sessionId;
    if (saved.model) state.model = saved.model;
    if (saved.history?.length) state.history = saved.history;
    if (saved.allowedTools) state.allowedTools = saved.allowedTools;
    if (saved.perCallApproval !== void 0) state.perCallApproval = saved.perCallApproval;
    if (saved.activeTurnId) {
      state.reattached = true;
      follow(saved.activeTurnId);
    }
  }
  async function send(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed || state.sending) return;
    const turnId = nextTurnId();
    state.draft = "";
    state.live = [{ role: "user", text: trimmed }];
    state.sending = true;
    try {
      await ctx.storage.set(turnId, {
        prompt: trimmed,
        cwd: ctx.terminal.activeCwd() ?? void 0,
        resumeSessionId: state.sessionId ?? void 0,
        permissionMode: state.permissionMode,
        allowedTools: state.allowedTools.length ? state.allowedTools : void 0,
        perCallApproval: state.perCallApproval,
        partialMessages: true
      });
      await saveSession({ activeTurnId: turnId });
      await ctx.process.start(["turn", turnId, "--stdin-lease", "--persist"]);
      follow(turnId);
    } catch (e) {
      state.live = [...state.live, { role: "error", text: describe(e) }];
      state.sending = false;
      await saveSession({ activeTurnId: void 0 });
      try {
        await ctx.storage.delete(turnId);
      } catch {
      }
    }
  }
  async function interrupt() {
    if (!state.sending || !activeTurnId) return;
    try {
      const processes = await ctx.process.list();
      const match = processes.find((p) => p.state === "running" && p.args.includes(activeTurnId));
      if (match) {
        await ctx.process.stop(match.pid);
        return;
      }
      onError("nothing to interrupt \u2014 the turn already ended");
    } catch (e) {
      onError(`interrupt failed: ${describe(e)}`);
    }
  }
  async function decide(behavior) {
    const pending = state.pendingApproval;
    if (!pending || !activeTurnId) return;
    try {
      await ctx.storage.set(`${activeTurnId}-decision`, {
        id: pending.id,
        behavior,
        message: behavior === "deny" ? "Denied from the Claude Remote pane" : void 0
      });
      state.pendingApproval = null;
    } catch (e) {
      onError(`could not record the decision: ${describe(e)}`);
    }
  }
  function setAllowedTools(tools) {
    state.allowedTools = tools;
    void saveSession({ allowedTools: tools });
  }
  function setPerCallApproval(enabled) {
    state.perCallApproval = enabled;
    void saveSession({ perCallApproval: enabled });
  }
  function reset() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    activeTurnId = null;
    state.history = [];
    state.live = [];
    state.sending = false;
    state.reattached = false;
    state.pendingApproval = null;
    state.sessionId = null;
    state.model = null;
    state.lastCostUsd = null;
    void ctx.storage.delete(sessionKey).catch(() => {
    });
  }
  function dispose() {
    disposed = true;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }
  return {
    state,
    send,
    interrupt,
    decide,
    setAllowedTools,
    setPerCallApproval,
    reset,
    restore,
    dispose
  };
}
function emptySnapshot(turnId) {
  return {
    turnId,
    status: "failed",
    sessionId: null,
    model: null,
    messages: [],
    tools: [],
    costUsd: null,
    updatedAt: Date.now()
  };
}
function describe(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/ui.ts
var PERMISSION_MODES = ["default", "acceptEdits", "plan", "auto", "dontAsk"];
var STRINGS = {
  en: {
    title: "Claude Remote",
    probing: "Checking for Claude Code\u2026",
    notFound: "Claude Code CLI not found",
    notFoundHint: "Install it with `npm install -g @anthropic-ai/claude-code`, or point CLAUDE_REMOTE_CLAUDE_BIN at it.",
    tooOld: "Claude Code is too old",
    tooOldHint: (found, min) => `Found ${found}; this plugin needs ${min} or newer.`,
    probeFailed: "Could not run Claude Code",
    empty: "Send a message to start a session.",
    placeholder: "Message Claude\u2026",
    send: "Send",
    stop: "Stop",
    reset: "New session",
    retry: "Retry",
    noCapabilities: "This Claude Code build does not report feature capabilities; falling back to version checks.",
    sessionLabel: (id) => `session ${id.slice(0, 8)}`,
    costLabel: (usd) => `$${usd.toFixed(4)}`,
    permissionLabel: "Permissions",
    reattached: "Reattached to a turn already in progress.",
    perCall: "Ask every time",
    perCallUnsupported: (min) => `Per-call approval needs Claude Code ${min} or newer.`,
    approvalTitle: (tool) => `Claude wants to use ${tool}`,
    allow: "Allow",
    deny: "Deny",
    toolsLabel: (allowed, total) => `Tools ${allowed}/${total}`,
    toolsHint: "Checked tools run without asking."
  },
  zh: {
    title: "Claude Remote",
    probing: "\u6B63\u5728\u68C0\u6D4B Claude Code\u2026",
    notFound: "\u672A\u627E\u5230 Claude Code CLI",
    notFoundHint: "\u8BF7\u6267\u884C `npm install -g @anthropic-ai/claude-code` \u5B89\u88C5\uFF0C\u6216\u7528 CLAUDE_REMOTE_CLAUDE_BIN \u6307\u5B9A\u8DEF\u5F84\u3002",
    tooOld: "Claude Code \u7248\u672C\u8FC7\u4F4E",
    tooOldHint: (found, min) => `\u68C0\u6D4B\u5230 ${found}\uFF0C\u672C\u63D2\u4EF6\u9700\u8981 ${min} \u6216\u66F4\u9AD8\u7248\u672C\u3002`,
    probeFailed: "\u65E0\u6CD5\u8FD0\u884C Claude Code",
    empty: "\u53D1\u9001\u4E00\u6761\u6D88\u606F\u5F00\u59CB\u4F1A\u8BDD\u3002",
    placeholder: "\u7ED9 Claude \u53D1\u6D88\u606F\u2026",
    send: "\u53D1\u9001",
    stop: "\u505C\u6B62",
    reset: "\u65B0\u4F1A\u8BDD",
    retry: "\u91CD\u8BD5",
    noCapabilities: "\u5F53\u524D Claude Code \u4E0D\u4E0A\u62A5 capabilities\uFF0C\u5C06\u56DE\u9000\u5230\u7248\u672C\u53F7\u5224\u65AD\u3002",
    sessionLabel: (id) => `\u4F1A\u8BDD ${id.slice(0, 8)}`,
    costLabel: (usd) => `$${usd.toFixed(4)}`,
    permissionLabel: "\u6743\u9650\u6A21\u5F0F",
    reattached: "\u5DF2\u91CD\u65B0\u63A5\u4E0A\u4E00\u4E2A\u6B63\u5728\u8FDB\u884C\u7684\u56DE\u5408\u3002",
    perCall: "\u6BCF\u6B21\u8BE2\u95EE",
    perCallUnsupported: (min) => `\u9010\u6B21\u786E\u8BA4\u9700\u8981 Claude Code ${min} \u6216\u66F4\u9AD8\u7248\u672C\u3002`,
    approvalTitle: (tool) => `Claude \u60F3\u4F7F\u7528 ${tool}`,
    allow: "\u5141\u8BB8",
    deny: "\u62D2\u7EDD",
    toolsLabel: (allowed, total) => `\u5DE5\u5177 ${allowed}/${total}`,
    toolsHint: "\u52FE\u9009\u7684\u5DE5\u5177\u4E0D\u518D\u8BE2\u95EE\u3002"
  }
};
function activate(ctx) {
  const h = ctx.h;
  const probe = ctx.ref(null);
  const probeError = ctx.ref("");
  const probing = ctx.ref(false);
  const conversations = /* @__PURE__ */ new Map();
  let syntheticKeys = 0;
  const syntheticByProps = /* @__PURE__ */ new WeakMap();
  function keyFor(props) {
    if (typeof props?.paneId === "string" && props.paneId) return props.paneId;
    const existing = syntheticByProps.get(props);
    if (existing) return existing;
    const key = `tab-${++syntheticKeys}`;
    syntheticByProps.set(props, key);
    return key;
  }
  function conversationFor(props) {
    const key = keyFor(props);
    let conversation = conversations.get(key);
    if (!conversation) {
      conversation = createConversation(ctx, key, (message) => {
        if (message) ctx.ui.notify(message, "warn", "Claude Remote");
      });
      conversations.set(key, conversation);
      void conversation.restore();
    }
    return conversation;
  }
  function t() {
    const locale = ctx.i18n.getLocale();
    return STRINGS[locale] ?? STRINGS.en;
  }
  async function runProbe() {
    if (probing.value) return;
    probing.value = true;
    probeError.value = "";
    try {
      const res = await ctx.exec.run(["probe"], { timeout: 2e4 });
      if (res.code !== 0) {
        probeError.value = res.stderr.trim() || `sidecar exited with code ${res.code}`;
        return;
      }
      for (const line of res.stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed?.type === "probe") {
            probe.value = parsed;
            return;
          }
          if (parsed?.type === "error") {
            probeError.value = String(parsed.error);
            return;
          }
        } catch {
        }
      }
      probeError.value = "sidecar returned no probe result";
    } catch (e) {
      probeError.value = e instanceof Error ? e.message : String(e);
    } finally {
      probing.value = false;
    }
  }
  const ready = ctx.computed(() => {
    const p = probe.value;
    return Boolean(p?.found && !p.error && p.versionOk !== false) && !probeError.value;
  });
  ctx.commands.register("claude-remote.open", () => {
    ctx.open();
  });
  ctx.commands.register("claude-remote.interrupt", () => {
    let stopped = false;
    for (const conversation of conversations.values()) {
      if (conversation.state.sending) {
        void conversation.interrupt();
        stopped = true;
      }
    }
    if (!stopped) ctx.ui.notify("Nothing is running", "info", "Claude Remote");
  });
  void runProbe();
  function renderErrorPanel(heading, hint) {
    const s = t();
    return h("div", { class: "cr-panel cr-panel-error" }, [
      h("div", { class: "cr-panel-title" }, heading),
      h("div", { class: "cr-panel-hint" }, hint),
      h("button", { class: "cr-btn", onClick: () => void runProbe() }, s.retry)
    ]);
  }
  function renderBlocker() {
    const s = t();
    if (probing.value && !probe.value) return h("div", { class: "cr-panel" }, s.probing);
    if (probeError.value) return renderErrorPanel(s.probeFailed, probeError.value);
    const p = probe.value;
    if (!p) return h("div", { class: "cr-panel" }, s.probing);
    if (!p.found) return renderErrorPanel(s.notFound, s.notFoundHint);
    if (p.error) return renderErrorPanel(s.probeFailed, p.error);
    if (p.versionOk === false) return renderErrorPanel(s.tooOld, s.tooOldHint(p.version ?? "?", p.minVersion));
    return null;
  }
  function renderHeader(conversation) {
    const s = t();
    const p = probe.value;
    const { state } = conversation;
    return h("div", { class: "cr-header" }, [
      h("span", { class: "cr-header-title" }, s.title),
      // The detected CLI, shown from the moment the probe lands: before a turn
      // runs it is the only evidence the environment was found at all.
      p?.version ? h("span", { class: "cr-header-meta" }, `claude ${p.version}`) : null,
      state.model ? h("span", { class: "cr-header-meta" }, state.model) : null,
      state.sessionId ? h("span", { class: "cr-header-meta" }, s.sessionLabel(state.sessionId)) : null,
      state.lastCostUsd !== null ? h("span", { class: "cr-header-meta" }, s.costLabel(state.lastCostUsd)) : null,
      h("span", { class: "cr-header-spacer" }),
      state.sessionId && !state.sending ? h("button", { class: "cr-btn cr-btn-small", onClick: () => conversation.reset() }, s.reset) : null,
      p && p.found && !p.error && p.reportsCapabilities === false ? h("span", { class: "cr-header-warn", title: s.noCapabilities }, "!") : null
    ].filter(Boolean));
  }
  function renderTranscript(conversation) {
    const s = t();
    const { state } = conversation;
    const messages = [...state.history, ...state.live];
    if (!messages.length) return h("div", { class: "cr-transcript" }, h("div", { class: "cr-empty" }, s.empty));
    return h("div", { class: "cr-transcript" }, [
      state.reattached ? h("div", { class: "cr-msg cr-msg-system" }, s.reattached) : null,
      ...messages.map((message, i) => h("div", {
        class: `cr-msg cr-msg-${message.role}${message.streaming ? " cr-msg-streaming" : ""}`,
        key: i
      }, message.text))
    ].filter(Boolean));
  }
  function renderPerCallToggle(conversation) {
    const s = t();
    const { state } = conversation;
    const supported = probe.value?.supportsPerCallApproval !== false;
    return h("label", {
      class: `cr-percall${supported ? "" : " cr-percall-disabled"}`,
      title: supported ? s.perCall : s.perCallUnsupported(PER_CALL_APPROVAL_SINCE)
    }, [
      h("input", {
        type: "checkbox",
        checked: state.perCallApproval && supported,
        disabled: state.sending || !supported,
        onChange: (e) => conversation.setPerCallApproval(e.target.checked)
      }),
      h("span", null, s.perCall)
    ]);
  }
  function renderApproval(conversation) {
    const s = t();
    const pending = conversation.state.pendingApproval;
    if (!pending) return null;
    const detail = summariseInput(pending.input);
    return h("div", { class: "cr-approval" }, [
      h("div", { class: "cr-approval-title" }, s.approvalTitle(pending.toolName)),
      detail ? h("pre", { class: "cr-approval-detail" }, detail) : null,
      h("div", { class: "cr-approval-actions" }, [
        h("button", {
          class: "cr-btn cr-btn-deny",
          onClick: () => void conversation.decide("deny")
        }, s.deny),
        h("button", {
          class: "cr-btn cr-btn-allow",
          onClick: () => void conversation.decide("allow")
        }, s.allow)
      ])
    ].filter(Boolean));
  }
  function renderTools(conversation) {
    const s = t();
    const { state } = conversation;
    if (!state.tools.length) return null;
    const allowed = new Set(state.allowedTools);
    return h("details", { class: "cr-tools" }, [
      h(
        "summary",
        { class: "cr-tools-summary" },
        s.toolsLabel(allowed.size, state.tools.length)
      ),
      h("div", { class: "cr-tools-hint" }, s.toolsHint),
      h("div", { class: "cr-tools-list" }, state.tools.map((tool) => h("label", { class: "cr-tool", key: tool }, [
        h("input", {
          type: "checkbox",
          checked: allowed.has(tool),
          disabled: state.sending,
          onChange: (e) => {
            const next = new Set(state.allowedTools);
            if (e.target.checked) next.add(tool);
            else next.delete(tool);
            conversation.setAllowedTools([...next]);
          }
        }),
        h("span", null, tool)
      ])))
    ]);
  }
  function renderComposer(conversation) {
    const s = t();
    const { state } = conversation;
    return h("div", { class: "cr-composer" }, [
      h("select", {
        class: "cr-select",
        title: s.permissionLabel,
        value: state.permissionMode,
        disabled: state.sending,
        onChange: (e) => {
          state.permissionMode = e.target.value;
        }
      }, PERMISSION_MODES.map((mode) => h("option", { value: mode, key: mode }, mode))),
      renderPerCallToggle(conversation),
      h("textarea", {
        class: "cr-input",
        rows: 3,
        value: state.draft,
        placeholder: s.placeholder,
        disabled: state.sending,
        onInput: (e) => {
          state.draft = e.target.value;
        },
        onKeydown: (e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            void conversation.send(state.draft);
          }
        }
      }),
      state.sending ? h("button", {
        class: "cr-btn cr-btn-stop",
        onClick: () => void conversation.interrupt()
      }, s.stop) : h("button", {
        class: "cr-btn cr-btn-send",
        disabled: !state.draft.trim(),
        onClick: () => void conversation.send(state.draft)
      }, s.send)
    ]);
  }
  return {
    component: {
      props: ["paneId", "workspaceId", "isVisible", "isFocused"],
      setup(props) {
        const conversation = conversationFor(props);
        return () => {
          const blocker = ready.value ? null : renderBlocker();
          return h("div", { class: "cr-root" }, [
            renderHeader(conversation),
            blocker ?? h("div", { class: "cr-body" }, [
              renderTools(conversation),
              renderTranscript(conversation),
              renderApproval(conversation),
              renderComposer(conversation)
            ].filter(Boolean))
          ]);
        };
      }
    },
    dispose() {
      for (const conversation of conversations.values()) conversation.dispose();
      conversations.clear();
    }
  };
}
function summariseInput(input) {
  if (input === null || input === void 0) return "";
  if (typeof input === "string") return input;
  try {
    const text = JSON.stringify(input, null, 2);
    return text.length > 800 ? `${text.slice(0, 800)}
\u2026` : text;
  } catch {
    return String(input);
  }
}
export {
  activate
};
