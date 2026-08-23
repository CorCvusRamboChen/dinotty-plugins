# _shared/host-bridge

宿主桥接模块，供本仓库的（键盘类）插件在构建时直接 import。插件 bundle 不携带自己的
vue / 单例 composable 副本，而是在运行时从宿主 window 全局读取：

- `vue.ts` -> `window.__DINOTTY_VUE__`（宿主 Vue runtime，宿主 main.ts 启动时赋值）
- `settings.ts` / `history.ts` / `i18n.ts` / `fileNavigation.ts`
  -> `window.__DINOTTY_HOST__`（宿主单例 composable namespace，宿主
  `installHostBridge()` 启动时赋值）

插件构建配置把 `vue` alias 到 `./vue.ts`，其余单例直接
`import { settings } from '../_shared/host-bridge/settings'`。

设计文档：dinotty 仓库 `.claude/doc/keyboard-plugin-design.md`（Phase 1b）。

**同步契约**：这些文件与主仓库 `frontend/src/keyboard/host-bridge/` 镜像。
任一副本变更必须同步到另一方。主仓库副本用于 builtin-keyboard lib 构建；
本仓库副本是第三方插件（mini-keyboard）的权威来源。
