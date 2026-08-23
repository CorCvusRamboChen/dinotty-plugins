<template>
  <!-- interactive:false 被动层：纯展示，宿主给 widget 加 pointer-events:none，点击穿透到终端；
       只有宿主渲染的 grip 可拖拽 reposition -->
  <div class="ov-pill">
    <span class="ov-pill__dot" :class="{ live: connected }" />
    <span>overlay demo v0.1</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { PluginContext } from '../../../plugin-api/index'

defineProps<{
  api: PluginContext
  dragging?: boolean
}>()

const connected = ref(false)

let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  connected.value = true
  // 心跳闪烁，展示被动层仍是活的（pointer-events 穿透但不代表无状态）
  timer = setInterval(() => {
    connected.value = !connected.value
  }, 2000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.ov-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--bg-elevated, #1e1e1e) 90%, transparent);
  border: 1px solid var(--border, #333);
  color: var(--fg-muted, #858585);
  font-size: 11px;
  white-space: nowrap;
  user-select: none;
}
.ov-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fg-muted, #555);
  transition: background 0.3s ease;
}
.ov-pill__dot.live {
  background: var(--color-success, #98c379);
}
</style>
