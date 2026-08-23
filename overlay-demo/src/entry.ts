// Overlay demo plugin (global-overlay-design.md Phase 1). Exercises all three
// drag modes of the overlay contribution point:
//   - whole 模式 FAB：整块可拖，tap = 触发命令，drag = 移动（拖后不误触 click）
//   - grip 模式看板：data-drag-handle header 即拖拽面，内容区（滚动日志）保持自带手势；
//     订阅宿主 kb-open/kb-close 广播
//   - interactive:false 被动层：纯展示，pointer-events:none，点击穿透到终端，
//     宿主渲染的顶部 header bar 仍可 reposition
//
// 组件只触碰 `api` prop（宿主注入的 PluginContext），证明 overlay 组件除注入的
// context 外不需要任何宿主全局。
import type { PluginContext, PluginExports } from '../../plugin-api/index'
import FabOverlay from './components/FabOverlay.vue'
import DashboardOverlay from './components/DashboardOverlay.vue'
import StatusPill from './components/StatusPill.vue'

export function activate(ctx: PluginContext): PluginExports {
  return {
    overlay: [
      {
        id: 'overlay-demo:fab',
        component: FabOverlay,
        dragHandle: 'whole',
        interactive: true,
        // 缺省 'bottom-right'，让开状态栏
        defaultPosition: 'bottom-right',
      },
      {
        id: 'overlay-demo:dashboard',
        component: DashboardOverlay,
        dragHandle: 'grip',
        interactive: true,
        defaultPosition: { x: 24, y: 48 },
        // visible() 只在注册时求值一次：设置里关掉则整个 overlay 不注册
        visible: () => ctx.settings.get().overlayDemoDashboard !== false,
      },
      {
        id: 'overlay-demo:status',
        component: StatusPill,
        dragHandle: 'grip',
        interactive: false,
        defaultPosition: 'bottom-left',
      },
    ],
  }
}
