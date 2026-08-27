// src/ui.ts
var STRINGS = {
  en: {
    title: "Claude Remote",
    probing: "Checking for Claude Code\u2026",
    notFound: "Claude Code CLI not found",
    notFoundHint: "Install it with `npm install -g @anthropic-ai/claude-code`, or set the path in plugin settings.",
    tooOld: "Claude Code is too old",
    tooOldHint: (found, min) => `Found ${found}; this plugin needs ${min} or newer.`,
    probeFailed: "Could not run Claude Code",
    ready: "Ready",
    placeholder: "Message Claude\u2026  (sending lands in milestone 2)",
    send: "Send",
    retry: "Retry",
    noCapabilities: "This Claude Code build does not report feature capabilities; falling back to version checks."
  },
  zh: {
    title: "Claude Remote",
    probing: "\u6B63\u5728\u68C0\u6D4B Claude Code\u2026",
    notFound: "\u672A\u627E\u5230 Claude Code CLI",
    notFoundHint: "\u8BF7\u6267\u884C `npm install -g @anthropic-ai/claude-code` \u5B89\u88C5\uFF0C\u6216\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u624B\u52A8\u6307\u5B9A\u8DEF\u5F84\u3002",
    tooOld: "Claude Code \u7248\u672C\u8FC7\u4F4E",
    tooOldHint: (found, min) => `\u68C0\u6D4B\u5230 ${found}\uFF0C\u672C\u63D2\u4EF6\u9700\u8981 ${min} \u6216\u66F4\u9AD8\u7248\u672C\u3002`,
    probeFailed: "\u65E0\u6CD5\u8FD0\u884C Claude Code",
    ready: "\u5C31\u7EEA",
    placeholder: "\u7ED9 Claude \u53D1\u6D88\u606F\u2026\uFF08\u53D1\u9001\u529F\u80FD\u5728\u91CC\u7A0B\u7891 2 \u63A5\u5165\uFF09",
    send: "\u53D1\u9001",
    retry: "\u91CD\u8BD5",
    noCapabilities: "\u5F53\u524D Claude Code \u4E0D\u4E0A\u62A5 capabilities\uFF0C\u5C06\u56DE\u9000\u5230\u7248\u672C\u53F7\u5224\u65AD\u3002"
  }
};
function activate(ctx) {
  const h = ctx.h;
  const probe = ctx.ref(null);
  const probeError = ctx.ref("");
  const probing = ctx.ref(false);
  const paneStates = /* @__PURE__ */ new Map();
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
  function stateFor(props) {
    const key = keyFor(props);
    let state = paneStates.get(key);
    if (!state) {
      state = ctx.reactive({ draft: "", transcript: [] });
      paneStates.set(key, state);
    }
    return state;
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
  ctx.commands.register("claude-remote.open", () => {
    ctx.open();
  });
  ctx.commands.register("claude-remote.interrupt", () => {
    ctx.ui.notify("Interrupt arrives in milestone 3", "info");
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
  function renderStatus() {
    const s = t();
    if (probing.value && !probe.value) {
      return h("div", { class: "cr-panel" }, s.probing);
    }
    if (probeError.value) {
      return renderErrorPanel(s.probeFailed, probeError.value);
    }
    const p = probe.value;
    if (!p) return h("div", { class: "cr-panel" }, s.probing);
    if (!p.found) return renderErrorPanel(s.notFound, s.notFoundHint);
    if (p.error) return renderErrorPanel(s.probeFailed, p.error);
    if (p.versionOk === false) {
      return renderErrorPanel(s.tooOld, s.tooOldHint(p.version ?? "?", p.minVersion));
    }
    return null;
  }
  function renderHeader() {
    const s = t();
    const p = probe.value;
    return h("div", { class: "cr-header" }, [
      h("span", { class: "cr-header-title" }, s.title),
      p?.version ? h("span", { class: "cr-header-meta" }, `claude ${p.version}`) : null,
      p && p.found && !p.error && p.reportsCapabilities === false ? h("span", { class: "cr-header-warn", title: s.noCapabilities }, "!") : null
    ].filter(Boolean));
  }
  return {
    component: {
      props: ["paneId", "workspaceId", "isVisible", "isFocused"],
      setup(props) {
        const state = stateFor(props);
        return () => {
          const s = t();
          const blocker = renderStatus();
          return h("div", { class: "cr-root" }, [
            renderHeader(),
            blocker ?? h("div", { class: "cr-body" }, [
              h(
                "div",
                { class: "cr-transcript" },
                state.transcript.length ? state.transcript.map((entry, i) => h("div", { class: `cr-msg cr-msg-${entry.role}`, key: i }, entry.text)) : h("div", { class: "cr-empty" }, s.ready)
              ),
              h("div", { class: "cr-composer" }, [
                h("textarea", {
                  class: "cr-input",
                  rows: 3,
                  value: state.draft,
                  placeholder: s.placeholder,
                  onInput: (e) => {
                    state.draft = e.target.value;
                  }
                }),
                h("button", {
                  class: "cr-btn cr-btn-send",
                  disabled: true,
                  title: s.placeholder
                }, s.send)
              ])
            ])
          ]);
        };
      }
    },
    dispose() {
      paneStates.clear();
    }
  };
}
export {
  activate
};
