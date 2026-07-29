# Feishu Notify 插件

订阅 dinotty 服务端事件并推送到飞书自定义机器人。

## 功能

- **登录失败告警**：有人输错 token 或在锁定期重试时，飞书群收到通知（替代 issue #218 提的"非本地 IP 首次登录"）
- **登录验证码推送**：验证码登录模式下，6 位验证码生成后推送到本群（5 分钟内有效）
- **验证码已使用告警**：有人用验证码成功登录时推送 IP / UA / 时间，若非本人操作可立即 revoke session
- **通知转发（含等待输入）**：所有 `/api/notify`、OSC、bell 通知都推送到飞书 - 包括 Claude Code hook 发出的"Claude 需要你的输入"提醒
- **命令完成通知**：命令执行结束时推送（OSC 133 检测到，仅含命令名/退出码/耗时，**不含 stdout**）
- **会话创建/关闭**：新 pane 或 SSH 会话创建/关闭时推送
- **Tab 创建/关闭**：标签页生命周期
- **文件变更**：文件监视器检测到文件创建/修改/删除时推送
- **插件进程退出**：插件子进程退出（含异常崩溃）
- **插件变更**：插件安装/卸载/更新
- **飞书 v2 签名校验**：可选启用，防止 webhook URL 泄露后被他人伪造消息
- **配置持久化**：webhook URL、secret、订阅事件保存在 `~/.dinotty/plugin-data/feishu-notify/config.json`

## 使用

### 1. 创建飞书自定义机器人

参考 [飞书官方文档](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)：
- 在飞书群 -> 设置 -> 群机器人 -> 添加自定义机器人
- 复制 webhook URL（形如 `https://open.feishu.cn/open-apis/bot/v2/hook/xxx`）
- （可选）启用"签名校验"，复制生成的 secret

### 2. 安装插件

在 dinotty 设置 -> 插件中安装 `feishu-notify`（或通过 dev-link 指向本目录）。

### 3. 配置

打开插件 tab：
1. 填写 webhook URL
2. （可选）填写签名校验 secret
3. 勾选要订阅的事件（默认勾选"登录失败"、"登录验证码"、"验证码已使用"和"通知（含等待输入）"）
4. 点"保存配置"
5. 点"发送测试消息"验证飞书群能收到

### 4. 等待输入场景（Claude Code）

在 dinotty 终端中运行 Claude Code 时，配置 hook 自动推送通知到飞书：

```jsonc
// .claude/settings.json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST ${DINOTTY_URL}/api/notify -H 'Content-Type: application/json' -d '{\"body\":\"Claude 需要你的输入\",\"title\":\"Claude Code\",\"notification_type\":\"warning\",\"pane_id\":\"'\"$DINOTTY_PANE_ID\"'\"}'"
          }
        ]
      }
    ]
  }
}
```

勾选「通知（含等待输入）」后，这条通知会同时出现在 dinotty 通知面板和飞书群里。

## 事件 payload

### `auth.login_failed`

```json
{
  "ip": "1.2.3.4",
  "reason": "token_mismatch",
  "attempt_count": 3,
  "locked_until": 1700000000
}
```

### `auth.verification_code`

验证码登录模式下，用户在前端点"发送验证码"后触发。后端生成 6 位验证码并立即推送给所有订阅该事件的插件（飞书群收到，即用户本人）。**这是开放事件 - 任何消息通知插件都可订阅。**

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "code": "123456",
  "occurred_at": 1700000000000
}
```

消息示例：`🔑 dinotty 登录验证码 / 验证码: 123456 / 5 分钟内有效，若非本人请求请忽略`

### `auth.verification_code_consumed`

有人用验证码成功登录后触发，包含消费方 IP 和 UA。**这是开放事件 - 任何消息通知插件都可订阅。**

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "ip": "1.2.3.4",
  "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  "occurred_at": 1700000000000
}
```

消息示例：`✅ 验证码已使用 / IP: 1.2.3.4 / UA: Mozilla/5.0 (iPhone...) / 时间: ... / 若非本人操作请立即在设置中 revoke 该 session`

### `notification.received`

所有 dinotty 通知（`/api/notify`、OSC 9/777/1337、terminal bell）都走这个事件。`notification_type` 取值：`info` / `success` / `warning` / `error` / `urgent` / `bell`。

```json
{
  "pane_id": "pane-1",
  "title": "Claude Code",
  "body": "Claude 需要你的输入",
  "notification_type": "warning",
  "severity": "warning",
  "occurred_at": 1700000000000
}
```

`title` 在 bell 等无标题通知下可能为 `null`。

### `command.finished`

```json
{
  "pane_id": "pane-1",
  "command": "cargo build",
  "exit_code": 0,
  "duration_ms": 150,
  "method": "shell_integration"
}
```

### `session.created`

```json
{
  "pane_id": "pane-1",
  "shell_type": "zsh"
}
```

### `session.closed`

```json
{
  "pane_id": "pane-1",
  "exit_code": 0
}
```

### `tab.created`

```json
{
  "tab_id": "tab-1",
  "pane_id": "pane-1"
}
```

### `tab.closed`

```json
{
  "tab_id": "tab-1"
}
```

### `file.changed`

```json
{
  "path": "/Users/dev/project/src/main.rs",
  "change_type": "changed"
}
```

`change_type` 取值：`created` / `changed` / `deleted`。

### `process.exited`

```json
{
  "plugin_id": "my-plugin",
  "pid": 1234,
  "exit_code": 0
}
```

`exit_code` 在异常退出时可能为 `null`。

### `plugin.changed`

```json
{
  "plugin_id": "my-plugin",
  "change": "installed"
}
```

`change` 取值由插件加载器决定，常见有 `installed` / `uninstalled` / `updated` 等。

## 设计说明

- **不内置 IP 白名单过滤**：每次登录失败都会推送，由用户在飞书侧自行决定是否打扰。这是 issue #218 替代方案的核心 - "失败登录告警"才是真正需要响应的安全信号。
- **`notification.received` 默认订阅**：这是用户最关心的场景（等待输入、错误告警）；其余新事件默认关闭避免噪音。
- **通知不做类型过滤**：所有 `notification_type`（info/success/warning/error/urgent/bell）都推送，如需过滤请在飞书侧设置免打扰。
- **签名校验**：飞书 v2 算法 = `base64(HMAC-SHA256(key={timestamp}\n{secret}, message=""))`，由后端 `ctx.crypto.hmac` 在非安全 HTTP 上下文也能正常工作。

## 安全说明：验证码登录

启用流程：
1. 在 dinotty「安全与访问」设置中选择「验证码登录」
2. 切换前会弹出确认对话框，需勾选「我已了解恢复流程」
3. 切换后远程用户登录时只能使用一次性验证码

注意事项：
- **群消息可见性**：飞书自定义机器人会推送到整个群，建议群里只加自己的账号。验证码会被群内所有人看到 - 这是飞书自定义机器人的固有限制（无定向推送）。
- **回退方法**：若验证码登录被卡住（如插件被卸载、订阅丢失），编辑 `~/.dinotty/settings.json`，将 `auth.login_method` 改回 `"token"`，重启 dinotty 服务即可恢复令牌登录。
- **插件卸载保护**：当 `login_method=verification_code` 且本插件正在订阅 `auth.verification_code` 时，后端会拒绝卸载（409）以防锁死。请先切回令牌登录再卸载本插件。
- **跨 IP 使用验证码**：验证码绑定到 `request_id`，不绑定 IP。攻击者截到验证码后可在 5 分钟内跨 IP 使用 - 这是设计权衡，允许用户在切换网络时仍可登录。`verification_code_consumed` 事件会暴露消费方 IP 和 UA，方便你事后判断是否本人操作。

## 已知限制

- 同一 dinotty 客户端内插件互发事件会因 echo suppression 失败 - 本插件只订阅服务端事件，不 emit，不受影响。
- 飞书机器人有消息频率限制（每分钟约 100 条），高频事件（如 `command.finished`、`file.changed`、`notification.received`）订阅后可能触发限流。
- `file.changed` 仅在「pane 内通过 `/ws/watch` 显式订阅路径」时才会触发事件总线，不是全局文件变更告警。
