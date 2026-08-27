// src/protocol.ts
var NdjsonReader = class {
  buffer = "";
  push(chunk) {
    this.buffer += chunk;
    const out = [];
    let index;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      if (line.trim()) out.push(parseLine(line));
    }
    return out;
  }
  /** Call on process exit: the last line may have no trailing newline. */
  flush() {
    const line = this.buffer.replace(/\r$/, "");
    this.buffer = "";
    return line.trim() ? [parseLine(line)] : [];
  }
};
function parseLine(line) {
  try {
    return { ok: true, event: JSON.parse(line) };
  } catch (e) {
    return { ok: false, raw: line, error: e instanceof Error ? e.message : String(e) };
  }
}
function isInit(e) {
  return e.type === "system" && e.subtype === "init";
}
function isResult(e) {
  return e.type === "result";
}
function textDelta(e) {
  if (e.type !== "stream_event") return null;
  const delta = e.event?.delta;
  return delta?.type === "text_delta" && typeof delta.text === "string" ? delta.text : null;
}
function assistantText(e) {
  if (e.type !== "assistant") return null;
  const parts = e.message?.content;
  if (!Array.isArray(parts)) return null;
  const text = parts.filter((p) => p?.type === "text" && typeof p.text === "string").map((p) => p.text).join("");
  return text || null;
}

// src/conversation.ts
var turnCounter = 0;
function nextTurnId() {
  turnCounter += 1;
  const random = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  return `turn-${Date.now().toString(36)}-${turnCounter}-${random}`;
}
var DEFAULT_PERMISSION_MODE = "acceptEdits";
function createConversation(ctx, paneKey, onError) {
  const state = ctx.reactive({
    messages: [],
    draft: "",
    sending: false,
    sessionId: null,
    model: null,
    lastCostUsd: null,
    permissionMode: DEFAULT_PERMISSION_MODE
  });
  const sessionKey = `session-${paneKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  let activeTurnId = null;
  let activeHandle = null;
  async function restore() {
    try {
      const saved = await ctx.storage.get(sessionKey);
      if (saved?.sessionId) {
        state.sessionId = saved.sessionId;
        state.model = saved.model ?? null;
        state.messages.push({
          role: "system",
          text: `Resuming session ${saved.sessionId.slice(0, 8)}\u2026`
        });
      }
    } catch {
    }
  }
  async function persistSession() {
    if (!state.sessionId) return;
    try {
      await ctx.storage.set(sessionKey, { sessionId: state.sessionId, model: state.model });
    } catch (e) {
      onError(`could not persist session id: ${describe(e)}`);
    }
  }
  function currentAssistant() {
    const last = state.messages[state.messages.length - 1];
    if (last?.role === "assistant" && last.streaming) return last;
    const created = { role: "assistant", text: "", streaming: true };
    state.messages.push(created);
    return created;
  }
  function dispatch(event) {
    if (isInit(event)) {
      state.sessionId = event.session_id;
      state.model = event.model ?? state.model;
      void persistSession();
      return;
    }
    const delta = textDelta(event);
    if (delta) {
      currentAssistant().text += delta;
      return;
    }
    const assembled = assistantText(event);
    if (assembled !== null) {
      currentAssistant().text = assembled;
      return;
    }
    if (isResult(event)) {
      const streaming = state.messages[state.messages.length - 1];
      if (streaming?.role === "assistant") streaming.streaming = false;
      state.lastCostUsd = typeof event.total_cost_usd === "number" ? event.total_cost_usd : null;
      if (event.is_error) {
        const detail = event.result || "Claude Code reported an error";
        const status = event.api_error_status ? ` (HTTP ${event.api_error_status})` : "";
        state.messages.push({ role: "error", text: `${detail}${status}` });
        return;
      }
      if (event.result && !streaming?.text) {
        state.messages.push({ role: "assistant", text: event.result });
      }
      return;
    }
    if (event.type === "sidecar") {
      const sidecar = event;
      if (sidecar.event === "error") {
        state.messages.push({ role: "error", text: sidecar.error ?? "sidecar error" });
      } else if (sidecar.event === "stderr" && sidecar.data) {
        state.messages.push({ role: "system", text: sidecar.data });
      } else if (sidecar.event === "stopping") {
        state.messages.push({ role: "system", text: "Interrupted." });
      }
    }
  }
  async function drain(stream, onChunk) {
    const reader = stream.getReader();
    try {
      for (; ; ) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onChunk(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  async function send(prompt) {
    const trimmed = prompt.trim();
    if (!trimmed || state.sending) return;
    state.messages.push({ role: "user", text: trimmed });
    state.draft = "";
    state.sending = true;
    const turnId = nextTurnId();
    activeTurnId = turnId;
    const reader = new NdjsonReader();
    const consume = (chunk) => {
      for (const parsed of reader.push(chunk)) {
        if (parsed.ok) dispatch(parsed.event);
        else onError(`unparseable line from sidecar: ${parsed.raw.slice(0, 200)}`);
      }
    };
    try {
      await ctx.storage.set(turnId, {
        prompt: trimmed,
        cwd: ctx.terminal.activeCwd() ?? void 0,
        resumeSessionId: state.sessionId ?? void 0,
        permissionMode: state.permissionMode,
        partialMessages: true
      });
      const handle = ctx.exec.spawn(["turn", turnId, "--stdin-lease"]);
      activeHandle = handle;
      await Promise.all([
        drain(handle.stdout, consume),
        drain(handle.stderr, (chunk) => onError(chunk.trim()))
      ]);
      for (const parsed of reader.flush()) {
        if (parsed.ok) dispatch(parsed.event);
      }
    } catch (e) {
      state.messages.push({ role: "error", text: describe(e) });
    } finally {
      const last = state.messages[state.messages.length - 1];
      if (last?.role === "assistant") last.streaming = false;
      state.sending = false;
      activeHandle = null;
      activeTurnId = null;
      try {
        await ctx.storage.delete(turnId);
      } catch {
      }
    }
  }
  async function interrupt() {
    if (!state.sending) return;
    const turnId = activeTurnId;
    try {
      if (turnId) {
        const processes = await ctx.process.list();
        const match = processes.find((p) => p.state === "running" && p.args.includes(turnId));
        if (match) {
          await ctx.process.stop(match.pid);
          return;
        }
      }
      activeHandle?.kill();
      state.messages.push({
        role: "system",
        text: "Interrupted abruptly \u2014 this turn may be left unfinished in the session."
      });
    } catch (e) {
      onError(`interrupt failed: ${describe(e)}`);
    }
  }
  function reset() {
    state.messages.splice(0, state.messages.length);
    state.sessionId = null;
    state.model = null;
    state.lastCostUsd = null;
    void ctx.storage.delete(sessionKey).catch(() => {
    });
  }
  return { state, send, interrupt, reset, restore };
}
function describe(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/ui.ts
var PERMISSION_MODES = ["default", "acceptEdits", "auto", "dontAsk"];
var STRINGS = {
  en: {
    title: "Claude Remote",
    probing: "Checking for Claude Code\u2026",
    notFound: "Claude Code CLI not found",
    notFoundHint: "Install it with `npm install -g @anthropic-ai/claude-code`, or set the path in plugin settings.",
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
    permissionLabel: "Permissions"
  },
  zh: {
    title: "Claude Remote",
    probing: "\u6B63\u5728\u68C0\u6D4B Claude Code\u2026",
    notFound: "\u672A\u627E\u5230 Claude Code CLI",
    notFoundHint: "\u8BF7\u6267\u884C `npm install -g @anthropic-ai/claude-code` \u5B89\u88C5\uFF0C\u6216\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u624B\u52A8\u6307\u5B9A\u8DEF\u5F84\u3002",
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
    permissionLabel: "\u6743\u9650\u6A21\u5F0F"
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
      state.model ? h("span", { class: "cr-header-meta" }, state.model) : null,
      state.sessionId ? h("span", { class: "cr-header-meta" }, s.sessionLabel(state.sessionId)) : null,
      state.lastCostUsd !== null ? h("span", { class: "cr-header-meta" }, s.costLabel(state.lastCostUsd)) : null,
      h("span", { class: "cr-header-spacer" }),
      state.sessionId && !state.sending ? h("button", { class: "cr-btn cr-btn-small", onClick: () => conversation.reset() }, s.reset) : null,
      p && p.found && !p.error && p.reportsCapabilities === false ? h("span", { class: "cr-header-warn", title: s.noCapabilities }, "!") : null
    ].filter(Boolean));
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
          const s = t();
          const blocker = ready.value ? null : renderBlocker();
          const { state } = conversation;
          return h("div", { class: "cr-root" }, [
            renderHeader(conversation),
            blocker ?? h("div", { class: "cr-body" }, [
              h(
                "div",
                { class: "cr-transcript" },
                state.messages.length ? state.messages.map((message, i) => h("div", {
                  class: `cr-msg cr-msg-${message.role}${message.streaming ? " cr-msg-streaming" : ""}`,
                  key: i
                }, message.text)) : h("div", { class: "cr-empty" }, s.empty)
              ),
              renderComposer(conversation)
            ])
          ]);
        };
      }
    },
    dispose() {
      for (const conversation of conversations.values()) {
        if (conversation.state.sending) void conversation.interrupt();
      }
      conversations.clear();
    }
  };
}
export {
  activate
};
