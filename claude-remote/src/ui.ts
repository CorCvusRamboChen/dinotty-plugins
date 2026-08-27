import type { PluginContext, PluginExports } from '../../plugin-api/index'
import type { ClaudeProbe } from './claude'
import { createConversation, type Conversation } from './conversation'

/**
 * Milestone 2: send, stream, resume, interrupt.
 *
 * Two structural facts drive the shape of this file, both easy to get wrong:
 *
 *  - `activate()` runs ONCE per plugin, but the component it returns can be
 *    mounted in several panes at the same time (plus the plugin tab). Anything
 *    per-conversation is keyed by `props.paneId`; only genuinely machine-wide
 *    state (the claude probe) lives at activate scope.
 *  - The plugin bundle runs in the browser and has no network permission, so
 *    every local capability goes through `ctx.exec` into the sidecar.
 */

type Locale = 'en' | 'zh'

interface Strings {
  title: string
  probing: string
  notFound: string
  notFoundHint: string
  tooOld: string
  tooOldHint: (found: string, min: string) => string
  probeFailed: string
  empty: string
  placeholder: string
  send: string
  stop: string
  reset: string
  retry: string
  noCapabilities: string
  sessionLabel: (id: string) => string
  costLabel: (usd: number) => string
  permissionLabel: string
}

const PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'dontAsk'] as const

const STRINGS: Record<Locale, Strings> = {
  en: {
    title: 'Claude Remote',
    probing: 'Checking for Claude Code…',
    notFound: 'Claude Code CLI not found',
    notFoundHint: 'Install it with `npm install -g @anthropic-ai/claude-code`, or set the path in plugin settings.',
    tooOld: 'Claude Code is too old',
    tooOldHint: (found, min) => `Found ${found}; this plugin needs ${min} or newer.`,
    probeFailed: 'Could not run Claude Code',
    empty: 'Send a message to start a session.',
    placeholder: 'Message Claude…',
    send: 'Send',
    stop: 'Stop',
    reset: 'New session',
    retry: 'Retry',
    noCapabilities: 'This Claude Code build does not report feature capabilities; falling back to version checks.',
    sessionLabel: id => `session ${id.slice(0, 8)}`,
    costLabel: usd => `$${usd.toFixed(4)}`,
    permissionLabel: 'Permissions',
  },
  zh: {
    title: 'Claude Remote',
    probing: '正在检测 Claude Code…',
    notFound: '未找到 Claude Code CLI',
    notFoundHint: '请执行 `npm install -g @anthropic-ai/claude-code` 安装，或在插件设置中手动指定路径。',
    tooOld: 'Claude Code 版本过低',
    tooOldHint: (found, min) => `检测到 ${found}，本插件需要 ${min} 或更高版本。`,
    probeFailed: '无法运行 Claude Code',
    empty: '发送一条消息开始会话。',
    placeholder: '给 Claude 发消息…',
    send: '发送',
    stop: '停止',
    reset: '新会话',
    retry: '重试',
    noCapabilities: '当前 Claude Code 不上报 capabilities，将回退到版本号判断。',
    sessionLabel: id => `会话 ${id.slice(0, 8)}`,
    costLabel: usd => `$${usd.toFixed(4)}`,
    permissionLabel: '权限模式',
  },
}

export function activate(ctx: PluginContext): PluginExports {
  const h = ctx.h

  // Machine-wide, so deliberately shared across panes.
  const probe = ctx.ref<ClaudeProbe | null>(null)
  const probeError = ctx.ref<string>('')
  const probing = ctx.ref(false)

  // Per-pane. The plugin tab has no paneId of its own, so it gets a stable
  // synthetic key rather than colliding with a real pane.
  const conversations = new Map<string, Conversation>()
  let syntheticKeys = 0
  const syntheticByProps = new WeakMap<object, string>()

  function keyFor(props: any): string {
    if (typeof props?.paneId === 'string' && props.paneId) return props.paneId
    const existing = syntheticByProps.get(props)
    if (existing) return existing
    const key = `tab-${++syntheticKeys}`
    syntheticByProps.set(props, key)
    return key
  }

  function conversationFor(props: any): Conversation {
    const key = keyFor(props)
    let conversation = conversations.get(key)
    if (!conversation) {
      conversation = createConversation(ctx, key, message => {
        if (message) ctx.ui.notify(message, 'warn', 'Claude Remote')
      })
      conversations.set(key, conversation)
      void conversation.restore()
    }
    return conversation
  }

  function t(): Strings {
    const locale = ctx.i18n.getLocale() as Locale
    return STRINGS[locale] ?? STRINGS.en
  }

  async function runProbe(): Promise<void> {
    if (probing.value) return
    probing.value = true
    probeError.value = ''
    try {
      const res = await ctx.exec.run(['probe'], { timeout: 20_000 })
      if (res.code !== 0) {
        probeError.value = res.stderr.trim() || `sidecar exited with code ${res.code}`
        return
      }
      for (const line of res.stdout.split('\n')) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (parsed?.type === 'probe') { probe.value = parsed as ClaudeProbe; return }
          if (parsed?.type === 'error') { probeError.value = String(parsed.error); return }
        } catch { /* not our line */ }
      }
      probeError.value = 'sidecar returned no probe result'
    } catch (e) {
      probeError.value = e instanceof Error ? e.message : String(e)
    } finally {
      probing.value = false
    }
  }

  const ready = ctx.computed(() => {
    const p = probe.value
    return Boolean(p?.found && !p.error && p.versionOk !== false) && !probeError.value
  })

  ctx.commands.register('claude-remote.open', () => { ctx.open() })
  ctx.commands.register('claude-remote.interrupt', () => {
    let stopped = false
    for (const conversation of conversations.values()) {
      if (conversation.state.sending) { void conversation.interrupt(); stopped = true }
    }
    if (!stopped) ctx.ui.notify('Nothing is running', 'info', 'Claude Remote')
  })

  void runProbe()

  function renderErrorPanel(heading: string, hint: string) {
    const s = t()
    return h('div', { class: 'cr-panel cr-panel-error' }, [
      h('div', { class: 'cr-panel-title' }, heading),
      h('div', { class: 'cr-panel-hint' }, hint),
      h('button', { class: 'cr-btn', onClick: () => void runProbe() }, s.retry),
    ])
  }

  function renderBlocker() {
    const s = t()
    if (probing.value && !probe.value) return h('div', { class: 'cr-panel' }, s.probing)
    if (probeError.value) return renderErrorPanel(s.probeFailed, probeError.value)
    const p = probe.value
    if (!p) return h('div', { class: 'cr-panel' }, s.probing)
    if (!p.found) return renderErrorPanel(s.notFound, s.notFoundHint)
    if (p.error) return renderErrorPanel(s.probeFailed, p.error)
    if (p.versionOk === false) return renderErrorPanel(s.tooOld, s.tooOldHint(p.version ?? '?', p.minVersion))
    return null
  }

  function renderHeader(conversation: Conversation) {
    const s = t()
    const p = probe.value
    const { state } = conversation
    return h('div', { class: 'cr-header' }, [
      h('span', { class: 'cr-header-title' }, s.title),
      state.model ? h('span', { class: 'cr-header-meta' }, state.model) : null,
      state.sessionId
        ? h('span', { class: 'cr-header-meta' }, s.sessionLabel(state.sessionId))
        : null,
      state.lastCostUsd !== null
        ? h('span', { class: 'cr-header-meta' }, s.costLabel(state.lastCostUsd))
        : null,
      h('span', { class: 'cr-header-spacer' }),
      state.sessionId && !state.sending
        ? h('button', { class: 'cr-btn cr-btn-small', onClick: () => conversation.reset() }, s.reset)
        : null,
      p && p.found && !p.error && p.reportsCapabilities === false
        ? h('span', { class: 'cr-header-warn', title: s.noCapabilities }, '!')
        : null,
    ].filter(Boolean))
  }

  function renderComposer(conversation: Conversation) {
    const s = t()
    const { state } = conversation
    return h('div', { class: 'cr-composer' }, [
      h('select', {
        class: 'cr-select',
        title: s.permissionLabel,
        value: state.permissionMode,
        disabled: state.sending,
        onChange: (e: any) => { state.permissionMode = e.target.value },
      }, PERMISSION_MODES.map(mode =>
        h('option', { value: mode, key: mode }, mode))),
      h('textarea', {
        class: 'cr-input',
        rows: 3,
        value: state.draft,
        placeholder: s.placeholder,
        disabled: state.sending,
        onInput: (e: any) => { state.draft = e.target.value },
        onKeydown: (e: KeyboardEvent) => {
          // Enter sends; Shift+Enter is a newline. On a phone the on-screen
          // keyboard's return key is the only send affordance that isn't a tap
          // across the whole screen.
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault()
            void conversation.send(state.draft)
          }
        },
      }),
      state.sending
        ? h('button', {
            class: 'cr-btn cr-btn-stop',
            onClick: () => void conversation.interrupt(),
          }, s.stop)
        : h('button', {
            class: 'cr-btn cr-btn-send',
            disabled: !state.draft.trim(),
            onClick: () => void conversation.send(state.draft),
          }, s.send),
    ])
  }

  return {
    component: {
      props: ['paneId', 'workspaceId', 'isVisible', 'isFocused'],
      setup(props: any) {
        const conversation = conversationFor(props)
        return () => {
          const s = t()
          const blocker = ready.value ? null : renderBlocker()
          const { state } = conversation
          return h('div', { class: 'cr-root' }, [
            renderHeader(conversation),
            blocker ?? h('div', { class: 'cr-body' }, [
              h('div', { class: 'cr-transcript' },
                state.messages.length
                  ? state.messages.map((message, i) =>
                      h('div', {
                        class: `cr-msg cr-msg-${message.role}${message.streaming ? ' cr-msg-streaming' : ''}`,
                        key: i,
                      }, message.text))
                  : h('div', { class: 'cr-empty' }, s.empty)),
              renderComposer(conversation),
            ]),
          ])
        }
      },
    },
    dispose() {
      for (const conversation of conversations.values()) {
        if (conversation.state.sending) void conversation.interrupt()
      }
      conversations.clear()
    },
  }
}
