import type { PluginContext, PluginExports } from '../../plugin-api/index'
import type { ClaudeProbe } from './claude'

/**
 * Milestone 1: the pane shell.
 *
 * Two structural facts drive the shape of this file, both of them easy to get
 * wrong:
 *
 *  - `activate()` runs ONCE per plugin, but the component it returns can be
 *    mounted in several panes at the same time (plus the plugin tab). Anything
 *    per-conversation has to be keyed by `props.paneId`; only genuinely
 *    machine-wide state (the claude probe) belongs at activate scope.
 *  - The plugin bundle runs in the browser and has no network permission, so
 *    every local capability goes through `ctx.exec` into the sidecar.
 */

interface PaneState {
  draft: string
  transcript: Array<{ role: 'user' | 'assistant' | 'error'; text: string }>
}

type Locale = 'en' | 'zh'

interface Strings {
  title: string
  probing: string
  notFound: string
  notFoundHint: string
  tooOld: string
  tooOldHint: (found: string, min: string) => string
  probeFailed: string
  ready: string
  placeholder: string
  send: string
  retry: string
  noCapabilities: string
}

const STRINGS: Record<Locale, Strings> = {
  en: {
    title: 'Claude Remote',
    probing: 'Checking for Claude Code…',
    notFound: 'Claude Code CLI not found',
    notFoundHint: 'Install it with `npm install -g @anthropic-ai/claude-code`, or set the path in plugin settings.',
    tooOld: 'Claude Code is too old',
    tooOldHint: (found: string, min: string) => `Found ${found}; this plugin needs ${min} or newer.`,
    probeFailed: 'Could not run Claude Code',
    ready: 'Ready',
    placeholder: 'Message Claude…  (sending lands in milestone 2)',
    send: 'Send',
    retry: 'Retry',
    noCapabilities: 'This Claude Code build does not report feature capabilities; falling back to version checks.',
  },
  zh: {
    title: 'Claude Remote',
    probing: '正在检测 Claude Code…',
    notFound: '未找到 Claude Code CLI',
    notFoundHint: '请执行 `npm install -g @anthropic-ai/claude-code` 安装，或在插件设置中手动指定路径。',
    tooOld: 'Claude Code 版本过低',
    tooOldHint: (found: string, min: string) => `检测到 ${found}，本插件需要 ${min} 或更高版本。`,
    probeFailed: '无法运行 Claude Code',
    ready: '就绪',
    placeholder: '给 Claude 发消息…（发送功能在里程碑 2 接入）',
    send: '发送',
    retry: '重试',
    noCapabilities: '当前 Claude Code 不上报 capabilities，将回退到版本号判断。',
  },
}

export function activate(ctx: PluginContext): PluginExports {
  const h = ctx.h

  // Machine-wide, so deliberately shared across panes.
  const probe = ctx.ref<ClaudeProbe | null>(null)
  const probeError = ctx.ref<string>('')
  const probing = ctx.ref(false)

  // Per-pane, keyed by paneId. The plugin tab has no paneId of its own, so it
  // gets a stable synthetic key rather than colliding with a real pane.
  const paneStates = new Map<string, PaneState>()
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

  function stateFor(props: any): PaneState {
    const key = keyFor(props)
    let state = paneStates.get(key)
    if (!state) {
      state = ctx.reactive({ draft: '', transcript: [] }) as PaneState
      paneStates.set(key, state)
    }
    return state
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
      // The sidecar emits one JSON object per line; the probe payload is the
      // first line that parses.
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

  ctx.commands.register('claude-remote.open', () => { ctx.open() })
  ctx.commands.register('claude-remote.interrupt', () => {
    ctx.ui.notify('Interrupt arrives in milestone 3', 'info')
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

  function renderStatus() {
    const s = t()
    if (probing.value && !probe.value) {
      return h('div', { class: 'cr-panel' }, s.probing)
    }
    if (probeError.value) {
      return renderErrorPanel(s.probeFailed, probeError.value)
    }
    const p = probe.value
    if (!p) return h('div', { class: 'cr-panel' }, s.probing)
    if (!p.found) return renderErrorPanel(s.notFound, s.notFoundHint)
    if (p.error) return renderErrorPanel(s.probeFailed, p.error)
    if (p.versionOk === false) {
      return renderErrorPanel(s.tooOld, s.tooOldHint(p.version ?? '?', p.minVersion))
    }
    return null
  }

  function renderHeader() {
    const s = t()
    const p = probe.value
    return h('div', { class: 'cr-header' }, [
      h('span', { class: 'cr-header-title' }, s.title),
      p?.version
        ? h('span', { class: 'cr-header-meta' }, `claude ${p.version}`)
        : null,
      p && p.found && !p.error && p.reportsCapabilities === false
        ? h('span', { class: 'cr-header-warn', title: s.noCapabilities }, '!')
        : null,
    ].filter(Boolean))
  }

  return {
    component: {
      props: ['paneId', 'workspaceId', 'isVisible', 'isFocused'],
      setup(props: any) {
        const state = stateFor(props)
        return () => {
          const s = t()
          const blocker = renderStatus()
          return h('div', { class: 'cr-root' }, [
            renderHeader(),
            blocker ?? h('div', { class: 'cr-body' }, [
              h('div', { class: 'cr-transcript' },
                state.transcript.length
                  ? state.transcript.map((entry, i) =>
                      h('div', { class: `cr-msg cr-msg-${entry.role}`, key: i }, entry.text))
                  : h('div', { class: 'cr-empty' }, s.ready)),
              h('div', { class: 'cr-composer' }, [
                h('textarea', {
                  class: 'cr-input',
                  rows: 3,
                  value: state.draft,
                  placeholder: s.placeholder,
                  onInput: (e: any) => { state.draft = e.target.value },
                }),
                h('button', {
                  class: 'cr-btn cr-btn-send',
                  disabled: true,
                  title: s.placeholder,
                }, s.send),
              ]),
            ]),
          ])
        }
      },
    },
    dispose() {
      paneStates.clear()
    },
  }
}
