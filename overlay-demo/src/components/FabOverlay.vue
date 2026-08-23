<template>
  <!-- whole 模式：整块 widget 即拖拽面。tap = handleTap（宿主在拖后抑制合成 click），drag = 移动 -->
  <div
    class="ov-fab"
    :class="{ 'is-dragging': dragging }"
    role="button"
    aria-label="Overlay demo FAB"
    @click="handleTap"
  >
    <Zap :size="22" />
    <span v-if="taps > 0" class="ov-fab__badge">{{ taps }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Zap } from 'lucide-vue-next'
import type { PluginContext } from '../../../plugin-api/index'

const props = defineProps<{
  /** 宿主注入的插件自身 PluginContext（与 PluginView 同约定） */
  api: PluginContext
  /** 宿主拖拽进行中（visual feedback） */
  dragging?: boolean
}>()

const taps = ref(0)

function handleTap() {
  taps.value++
  const paneId = props.api.terminal.activePaneId()
  if (paneId) {
    props.api.terminal.send(paneId, `echo "hello from overlay FAB #${taps.value}"\n`)
  } else {
    props.api.ui.notify(`overlay FAB tapped ${taps.value}x (no active terminal)`, 'info')
  }
}
</script>

<style scoped>
.ov-fab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent, #8a8a8a);
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  user-select: none;
  cursor: grab;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.ov-fab.is-dragging {
  transform: scale(1.15);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  cursor: grabbing;
}
.ov-fab__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 50%;
  background: var(--color-danger, #e06c75);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
</style>
