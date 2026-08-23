<template>
  <!-- grip 模式：内容自带手势（可滚动日志区），只有宿主渲染的 grip 可拖拽 -->
  <div class="ov-dash" :class="{ 'is-dragging': dragging }">
    <!-- data-drag-handle: 宿主把整个 header 当作拖拽面（grip 模式契约）；内容区保持自带手势 -->
    <div class="ov-dash__head" data-drag-handle>
      <span class="ov-dash__title">Overlay dashboard</span>
      <span class="ov-dash__kb" :class="kbOpen ? 'on' : 'off'">
        {{ kbOpen ? 'kb open' : 'kb closed' }}
      </span>
    </div>
    <div class="ov-dash__clock">{{ clock }}</div>
    <div class="ov-dash__rows">
      <span>panes: <b>{{ paneCount }}</b></span>
      <span>visible(): <b>{{ visibleOnce ? 'on' : 'off' }}</b></span>
    </div>
    <div ref="logEl" class="ov-dash__log">
      <div v-for="(line, i) in log" :key="i" class="ov-dash__log-line">{{ line }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PluginContext } from '../../../plugin-api/index'

const props = defineProps<{
  /** 宿主注入的插件自身 PluginContext（与 PluginView 同约定） */
  api: PluginContext
  dragging?: boolean
}>()

const clock = ref('')
const paneCount = ref(0)
const kbOpen = ref(false)
const visibleOnce = ref(true)
const log = ref<string[]>([])
const logEl = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setInterval> | null = null
const disposables: Array<{ dispose(): void }> = []

function push(line: string) {
  log.value = [...log.value.slice(-8), line]
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight })
}

function tick() {
  clock.value = new Date().toLocaleTimeString()
  paneCount.value = props.api.terminal.listPanes().length
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
  // 宿主在系统键盘/内置键盘打开/关闭时同端广播 kb-open/kb-close（dispatchLocal，无后端 POST）
  disposables.push(
    props.api.events.subscribe('kb-open', () => {
      kbOpen.value = true
      push('kb-open')
    })
  )
  disposables.push(
    props.api.events.subscribe('kb-close', () => {
      kbOpen.value = false
      push('kb-close')
    })
  )
  push('mounted')
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  disposables.forEach((d) => d.dispose())
})
</script>

<style scoped>
.ov-dash {
  width: 220px;
  max-width: 70vw;
  padding: 10px 12px;
  border: 1px solid var(--border, #333);
  border-radius: var(--radius, 8px);
  background: color-mix(in srgb, var(--bg-elevated, #1e1e1e) 94%, transparent);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  color: var(--fg, #d4d4d4);
  font-size: 12px;
  line-height: 1.5;
  user-select: none;
}
.ov-dash.is-dragging {
  outline: 1px dashed var(--accent, #8a8a8a);
}
.ov-dash__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.ov-dash__head:active {
  cursor: grabbing;
}
.ov-dash__title {
  font-weight: 600;
}
.ov-dash__kb {
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
}
.ov-dash__kb.on {
  background: var(--color-success, #98c379);
  color: #0a0a0a;
}
.ov-dash__kb.off {
  background: var(--border, #3c3c3c);
  color: var(--fg-muted, #858585);
}
.ov-dash__clock {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ov-dash__rows {
  display: flex;
  gap: 12px;
  margin: 4px 0 8px;
  color: var(--fg-muted, #858585);
}
.ov-dash__log {
  height: 72px;
  overflow-y: auto;
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  padding: 4px 6px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  color: var(--fg-muted, #858585);
}
.ov-dash__log-line {
  white-space: nowrap;
}
</style>
