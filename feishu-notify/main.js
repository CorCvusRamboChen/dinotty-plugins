/**
 * feishu-notify
 *
 * Subscribe to dinotty server-side events (auth.login_failed, command.finished,
 * session.created, session.closed) and push them to a Feishu custom bot.
 *
 * Configuration is persisted via ctx.storage and the plugin exposes a Vue
 * component (rendered with ctx.h) for the user to edit webhook URL, signing
 * secret, and which events to subscribe to.
 *
 * Feishu bot v2 signature scheme:
 *   timestamp = unix seconds
 *   string_to_sign = `${timestamp}\n${secret}`
 *   sign = base64(HMAC-SHA256(key=string_to_sign, message=""))
 *
 * Reference: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 */

const EVENT_OPTIONS = [
  {
    name: 'auth.login_failed',
    label: '登录失败',
    desc: '有人输错 token 或在锁定期重试（推荐）',
    default: true,
  },
  {
    name: 'auth.verification_code',
    label: '登录验证码',
    desc: '验证码登录模式下，6 位验证码已生成（推送到本群）',
    default: true,
  },
  {
    name: 'auth.verification_code_consumed',
    label: '验证码已使用',
    desc: '有人用验证码成功登录，包含 IP 和 UA（若非本人操作请立即 revoke session）',
    default: true,
  },
  {
    name: 'notification.received',
    label: '通知（含等待输入）',
    desc: '所有 /api/notify、OSC、bell 通知 - 含 Claude Code "等待输入"',
    default: true,
  },
  {
    name: 'command.finished',
    label: '命令完成',
    desc: '命令执行结束（OSC 133 检测到，不含 stdout）',
    default: false,
  },
  {
    name: 'session.created',
    label: '会话创建',
    desc: '新 pane / SSH 会话创建',
    default: false,
  },
  {
    name: 'session.closed',
    label: '会话关闭',
    desc: 'pane 关闭',
    default: false,
  },
  {
    name: 'tab.created',
    label: 'Tab 创建',
    desc: '新标签页创建',
    default: false,
  },
  {
    name: 'tab.closed',
    label: 'Tab 关闭',
    desc: '标签页关闭',
    default: false,
  },
  {
    name: 'file.changed',
    label: '文件变更',
    desc: '文件监视器检测到文件创建/修改/删除',
    default: false,
  },
  {
    name: 'process.exited',
    label: '插件进程退出',
    desc: '插件子进程退出（含异常崩溃）',
    default: false,
  },
  {
    name: 'plugin.changed',
    label: '插件变更',
    desc: '插件安装/卸载/更新',
    default: false,
  },
]

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Dedup safeguard: if the same event (same name + identical payload) fires
// multiple times within DEDUP_TTL_MS, only the first one is sent to Feishu.
// This catches zombie subscriptions left over from hot-reload or multiple
// plugin instances on different sync clients - the underlying issue is
// frontend-side, but this prevents duplicate Feishu messages.
const recentSends = new Map()
const DEDUP_TTL_MS = 5000

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

function isDuplicate(eventName, data) {
  const key = `${eventName}::${stableStringify(data)}`
  const now = Date.now()
  for (const [k, t] of recentSends) {
    if (now - t > DEDUP_TTL_MS) recentSends.delete(k)
  }
  if (recentSends.has(key)) {
    return true
  }
  recentSends.set(key, now)
  return false
}

function renderEvent(eventName, data) {
  const lines = ['【dinotty 事件通知】']
  switch (eventName) {
    case 'auth.login_failed':
      lines.push('⚠️ 登录失败')
      lines.push(`IP: ${data.ip}`)
      lines.push(`原因: ${data.reason === 'token_mismatch' ? 'token 不匹配' : '账号锁定中'}`)
      lines.push(`累计失败: ${data.attempt_count} 次`)
      if (data.locked_until) {
        const until = new Date(data.locked_until * 1000).toLocaleString()
        lines.push(`锁定至: ${until}`)
      }
      break
    case 'auth.verification_code':
      lines.push('🔑 dinotty 登录验证码')
      lines.push(`验证码: ${data.code}`)
      lines.push('5 分钟内有效，若非本人请求请忽略')
      break
    case 'auth.verification_code_consumed':
      lines.push('✅ 验证码已使用')
      lines.push(`IP: ${data.ip}`)
      if (data.user_agent) lines.push(`UA: ${data.user_agent}`)
      if (data.occurred_at) {
        const t = new Date(data.occurred_at).toLocaleString()
        lines.push(`时间: ${t}`)
      }
      lines.push('若非本人操作请立即在设置中 revoke 该 session')
      break
    case 'notification.received': {
      const typeLabel = {
        info: 'ℹ️ 信息',
        success: '✅ 成功',
        warning: '⚠️ 警告',
        error: '❌ 错误',
        urgent: '🚨 紧急',
        bell: '🔔 Bell',
      }[data.notification_type] || `📢 ${data.notification_type}`
      lines.push(typeLabel)
      if (data.title) lines.push(`标题: ${data.title}`)
      lines.push(`正文: ${data.body}`)
      if (data.pane_id) lines.push(`Pane: ${data.pane_id}`)
      lines.push(`级别: ${data.severity || data.notification_type}`)
      if (data.occurred_at) {
        const t = new Date(data.occurred_at).toLocaleString()
        lines.push(`时间: ${t}`)
      }
      break
    }
    case 'command.finished':
      lines.push('✅ 命令完成')
      lines.push(`Pane: ${data.pane_id}`)
      lines.push(`命令: ${data.command}`)
      lines.push(`退出码: ${data.exit_code}`)
      lines.push(`耗时: ${data.duration_ms} ms`)
      lines.push(`检测方式: ${data.method}`)
      break
    case 'session.created':
      lines.push('🆕 会话创建')
      lines.push(`Pane: ${data.pane_id}`)
      lines.push(`Shell: ${data.shell_type}`)
      break
    case 'session.closed':
      lines.push('🔚 会话关闭')
      lines.push(`Pane: ${data.pane_id}`)
      if (data.exit_code !== null && data.exit_code !== undefined) {
        lines.push(`退出码: ${data.exit_code}`)
      }
      break
    case 'tab.created':
      lines.push('📑 Tab 创建')
      lines.push(`Tab: ${data.tab_id}`)
      lines.push(`Pane: ${data.pane_id}`)
      break
    case 'tab.closed':
      lines.push('🗑️ Tab 关闭')
      lines.push(`Tab: ${data.tab_id}`)
      break
    case 'file.changed':
      lines.push('📄 文件变更')
      lines.push(`路径: ${data.path}`)
      lines.push(`类型: ${data.change_type}`)
      break
    case 'process.exited':
      lines.push('💤 插件进程退出')
      lines.push(`插件: ${data.plugin_id}`)
      lines.push(`PID: ${data.pid}`)
      if (data.exit_code !== null && data.exit_code !== undefined) {
        lines.push(`退出码: ${data.exit_code}`)
      }
      break
    case 'plugin.changed':
      lines.push('🔌 插件变更')
      lines.push(`插件: ${data.plugin_id}`)
      lines.push(`变更: ${data.change}`)
      break
    default:
      lines.push(`事件: ${eventName}`)
      lines.push(JSON.stringify(data, null, 2))
  }
  return lines.join('\n')
}

export function activate(ctx) {
  const h = ctx.h

  const webhookUrl = ctx.ref('')
  const secret = ctx.ref('')
  const events = ctx.reactive(
    Object.fromEntries(EVENT_OPTIONS.map((e) => [e.name, e.default]))
  )
  const saving = ctx.ref(false)
  const testing = ctx.ref(false)
  const lastResult = ctx.ref(null)

  const unsubscribers = []

  function unsubscribeAll() {
    while (unsubscribers.length) {
      const u = unsubscribers.pop()
      try {
        u.dispose()
      } catch {
        // ignore
      }
    }
  }

  function resubscribe() {
    unsubscribeAll()
    for (const opt of EVENT_OPTIONS) {
      if (!events[opt.name]) continue
      const handler = async (data) => {
        await sendFeishu(opt.name, data)
      }
      unsubscribers.push(ctx.events.subscribe(opt.name, handler))
    }
  }

  async function loadConfig() {
    const saved = await ctx.storage.get('config')
    if (!saved) {
      resubscribe()
      return
    }
    webhookUrl.value = saved.webhookUrl || ''
    secret.value = saved.secret || ''
    if (saved.events) {
      for (const opt of EVENT_OPTIONS) {
        if (saved.events[opt.name] !== undefined) {
          events[opt.name] = saved.events[opt.name]
        }
      }
    }
    resubscribe()
  }

  loadConfig()

  async function save() {
    saving.value = true
    try {
      await ctx.storage.set('config', {
        webhookUrl: webhookUrl.value,
        secret: secret.value,
        events: { ...events },
      })
      resubscribe()
      ctx.ui.notify('配置已保存', 'success')
    } catch (e) {
      ctx.ui.notify(`保存失败: ${e.message}`, 'error')
    } finally {
      saving.value = false
    }
  }

  async function sendToFeishu(url, secretValue, body) {
    const payload = { ...body }
    if (secretValue) {
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const stringToSign = `${timestamp}\n${secretValue}`
      const hmacBytes = await ctx.crypto.hmac('sha256', stringToSign, '')
      const sign = bytesToBase64(hmacBytes)
      payload.timestamp = timestamp
      payload.sign = sign
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${json.msg || res.statusText}` }
      }
      if (json.code !== 0 && json.code !== undefined) {
        return { ok: false, error: `飞书返回 code ${json.code}: ${json.msg || ''}` }
      }
      return { ok: true, response: json }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  async function sendFeishu(eventName, data) {
    if (!webhookUrl.value) return
    if (isDuplicate(eventName, data)) return
    const text = renderEvent(eventName, data)
    const result = await sendToFeishu(webhookUrl.value, secret.value, {
      msg_type: 'text',
      content: { text },
    })
    if (!result.ok) {
      ctx.ui.notify(`飞书通知发送失败: ${result.error}`, 'error')
    }
  }

  async function testSend() {
    if (!webhookUrl.value) {
      ctx.ui.notify('请先填写 webhook URL', 'warn')
      return
    }
    testing.value = true
    lastResult.value = null
    try {
      const result = await sendToFeishu(webhookUrl.value, secret.value, {
        msg_type: 'text',
        content: { text: '【dinotty 测试消息】飞书通知插件已配置成功' },
      })
      lastResult.value = result
      if (result.ok) {
        ctx.ui.notify('测试消息已发送', 'success')
      } else {
        ctx.ui.notify(`发送失败: ${result.error}`, 'error')
      }
    } finally {
      testing.value = false
    }
  }

  return {
    component: {
      render() {
        const children = [
          h('h2', { class: 'fn-title' }, '飞书通知'),
          h('p', { class: 'fn-desc' }, '订阅 dinotty 服务端事件，推送到飞书自定义机器人'),
        ]

        children.push(
          h('div', { class: 'fn-field' }, [
            h('label', { class: 'fn-label' }, '飞书机器人 Webhook URL'),
            h('input', {
              class: 'fn-input',
              type: 'text',
              placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx',
              value: webhookUrl.value,
              onInput: (e) => {
                webhookUrl.value = e.target.value
              },
            }),
          ])
        )

        children.push(
          h('div', { class: 'fn-field' }, [
            h('label', { class: 'fn-label' }, '签名校验 Secret（可选）'),
            h('input', {
              class: 'fn-input',
              type: 'password',
              placeholder: '启用签名校验时填写',
              value: secret.value,
              onInput: (e) => {
                secret.value = e.target.value
              },
            }),
            h('p', { class: 'fn-hint' }, '在飞书机器人"签名校验"设置里生成的 secret'),
          ])
        )

        children.push(
          h('div', { class: 'fn-field' }, [
            h('label', { class: 'fn-label' }, '订阅事件'),
            h(
              'div',
              { class: 'fn-events' },
              EVENT_OPTIONS.map((opt) =>
                h('label', { class: 'fn-event' }, [
                  h('input', {
                    type: 'checkbox',
                    checked: events[opt.name],
                    onChange: (e) => {
                      events[opt.name] = e.target.checked
                    },
                  }),
                  h('div', { class: 'fn-event-text' }, [
                    h('div', { class: 'fn-event-name' }, opt.label),
                    h('div', { class: 'fn-event-desc' }, opt.desc),
                  ]),
                ])
              )
            ),
          ])
        )

        children.push(
          h('div', { class: 'fn-actions' }, [
            h(
              'button',
              {
                class: 'fn-btn fn-btn-primary',
                disabled: saving.value,
                onClick: save,
              },
              saving.value ? '保存中...' : '保存配置'
            ),
            h(
              'button',
              {
                class: 'fn-btn fn-btn-ghost',
                disabled: testing.value,
                onClick: testSend,
              },
              testing.value ? '发送中...' : '发送测试消息'
            ),
          ])
        )

        if (lastResult.value) {
          children.push(
            h(
              'div',
              {
                class: `fn-result ${lastResult.value.ok ? 'fn-result-ok' : 'fn-result-fail'}`,
              },
              lastResult.value.ok
                ? '✅ 测试消息已发送，请查看飞书群'
                : `❌ ${lastResult.value.error}`
            )
          )
        }

        return h('div', { class: 'fn-root' }, children)
      },
    },
    deactivate() {
      unsubscribeAll()
    },
  }
}
