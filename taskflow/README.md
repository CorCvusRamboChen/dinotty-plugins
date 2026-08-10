# Taskflow 插件

dinotty 插件，用于管理 AI 任务流。每个任务在一个可配置的 agent CLI（如 Claude Code、Codex、Aider）交互式 tab 中执行，状态机为 `todo -> in_progress -> done`（tab 关闭未完成时记为 `interrupted`）。

## 功能

- 纯文本录入，无需 `[]` 前缀；标题支持多行（Shift+Enter 换行）
- 单任务 / 批量两种输入模式
- 自动继承当前终端的工作目录，无需手动设置 cwd
- 创建任务时可选择 agent（Claude Code / Codex / 自定义）
- 一键启动 agent tab 执行任务（自动发送任务描述）
- 新 tab 启动 / 分屏启动两种执行方式
- 状态机约束：禁止非法跳转（如 `todo -> done`）
- 监听 `session.closed` 事件，tab 关闭时自动标记为中断
- 任务持久化（`~/.dinotty/plugin-data/taskflow/state.json`），重启不丢
- agent 配置持久化（`~/.dinotty/plugin-data/taskflow/agents.json`），重启不丢
- 完成任务可一键隐藏，重启不丢
- 任务模板：修复 bug / 实现功能 / 重构 / 编写测试 / 代码审查
- 批量操作：多选后一键完成或删除
- 事件总线接入：agent 通过 `taskflow:add` 事件写入任务（`source: 'agent'`）
- Command Palette 集成：`taskflow.open` / `taskflow.new` / `taskflow.start` / `taskflow.complete`

## 依赖

任意 agent CLI（默认配置 Claude Code 与 Codex），需在 PATH 中可执行：

- **Claude Code**: `claude` 命令
- **Codex**: `codex` 命令

可在 Agent 配置页添加其他 agent CLI（如 `aider`、`gemini` 等）。

## 使用

1. 在 dinotty 工具栏打开 Taskflow 插件 tab
2. 顶部切换「任务」/「Agent」两个 tab
3. 在「任务」tab 输入框中填写任务描述，选择 agent，回车提交
4. 点击任务卡片上的「新 tab 启动」按钮打开一个新的 agent tab，或点击「分屏启动」在当前 tab 中分屏执行；两种方式都会自动发送任务描述
5. 任务完成后点击「完成」；若关闭 tab 未完成，Taskflow 会自动标记为「已中断」
6. 中断的任务可点击「重启」重新启动一个 agent tab（使用任务创建时记录的 agent）

### Agent 配置

在「Agent」tab 中：

- 添加 / 编辑 / 删除 agent 配置（名称、命令、参数、发送延迟）
- 设置默认 agent（创建任务时默认选中）
- 每个 agent 的「发送延迟」控制启动 CLI 后多久发送任务描述（CLI 启动慢的适当调大）

预置配置：

| 名称 | 命令 | 发送延迟 | 分屏延迟 |
|------|------|----------|----------|
| Claude Code | `claude` | 1500ms | 2500ms |
| Codex | `codex` | 2500ms | 3500ms |

### 新 tab 启动 vs 分屏启动

- **新 tab 启动**：新建一个 agent tab，任务在独立 tab 中执行
- **分屏启动**：在当前 tab 中分屏创建一个新 pane 执行 agent，便于对照任务描述与执行过程

### 多行任务描述

输入框支持多行：Enter 提交，Shift+Enter 换行。需要给 agent 更详细的指令时，直接在输入框写多行即可，整段内容作为任务标题和发送给 agent 的 prompt。

### 批量模式

点击「切换批量」进入批量录入模式，每行一个任务（批量任务共用表单选择的 agent）：

```
实现登录页面
实现注册页面
编写单元测试
```

### 工作目录

新建任务时自动使用当前活跃终端 tab 的工作目录。如果没有活跃终端，回退到当前 workspace 路径。输入框下方会显示当前使用的工作目录。

### 任务模板

点击「模板」展开预设模板列表，选择后将结构化指令填入输入框（可在此基础上编辑细节）：

- **修复 bug**：复现 -> 定位根因 -> 修复 -> 验证
- **实现功能**：方案 -> 实现 -> 测试
- **重构**：保持外部行为，改善内部结构
- **编写测试**：覆盖正常路径与边界情况
- **代码审查**：可读性 / 正确性 / 安全性 / 性能

### 批量操作

点击头部的「多选」按钮进入选择模式，任务卡片显示 checkbox，可：

- 全选 / 取消全选当前可见任务
- 一键完成所有选中的进行中任务
- 一键删除所有选中任务

### 事件总线（agent 写入）

外部 agent（如 Claude Code 通过 dinotty MCP Server）可发送 `taskflow:add` 事件创建任务：

```json
{
  "title": "修复登录页样式",
  "description": "请定位并修复登录页在 Safari 下的样式错位...",
  "cwd": "/path/to/project"
}
```

`cwd` 可选，缺省时使用当前活跃终端工作目录。任务以 `source: 'agent'` 标记，使用全局默认 agent。

## 状态机

```
todo ──启动──> in_progress ──完成──> done
                  │
                  └──中断/ tab 关闭──> interrupted

interrupted ──重启──> in_progress
done ──重启──> in_progress
```

`attempts` 字段在每次进入 `in_progress` 时自增，用于追踪任务重试次数。

## 数据结构

```typescript
interface Task {
  id: string
  title: string
  description: string       // 发送给 agent 的指令，默认等于 title
  status: 'todo' | 'in_progress' | 'done' | 'interrupted'
  cwd: string
  pane_id?: string          // agent tab 的 pane id
  source: 'manual' | 'agent'
  agent_id?: string         // 使用的 agent 配置 id；缺失时用默认
  attempts: number
  created_at: string
  started_at?: string
  completed_at?: string
  last_error?: string
}

interface AgentConfig {
  id: string
  name: string              // 显示名：Claude Code / Codex / ...
  command: string           // 可执行命令：claude / codex / aider
  args: string[]            // 额外参数：['--model', 'gpt-4']
  sendDelayMs: number       // 新 tab 模式下发送描述前的延迟
  splitSendDelayMs: number  // 分屏模式下的延迟
}
```

## 路线图

- **Phase 1**（已完成）：手动创建任务、启动 agent tab、状态流转
- **Phase 2**（已完成）：事件总线接入、命令扩展、批量操作、任务模板
- **Phase 3**（已完成）：多 agent 支持、分屏启动、可折叠表单、i18n
- **Phase 4**（待定）：输出监听替换延迟 send、Mission Control 集成、任务统计、跨任务依赖
