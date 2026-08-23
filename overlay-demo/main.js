const e = window.__DINOTTY_VUE__;
if (!e)
  throw new Error("host vue bridge missing: window.__DINOTTY_VUE__ not assigned");
const r = e.ref;
e.reactive;
e.computed;
e.watch;
const I = e.onMounted;
e.onUnmounted;
const S = e.onBeforeUnmount;
e.nextTick;
const k = e.h, y = e.defineComponent;
e.getCurrentInstance;
const v = e.toDisplayString, b = e.normalizeClass;
e.normalizeStyle;
const p = e.openBlock, f = e.createElementBlock, l = e.createElementVNode;
e.createBlock;
const O = e.createVNode, P = e.createCommentVNode, T = e.createTextVNode;
e.withCtx;
e.withDirectives;
e.withModifiers;
e.withKeys;
e.vModelText;
e.vShow;
e.mergeProps;
const N = e.renderList;
e.renderSlot;
e.resolveComponent;
e.resolveDirective;
e.resolveDynamicComponent;
e.resolveTransitionHooks;
e.setBlockTracking;
e.useSlots;
e.useAttrs;
e.isRef;
const R = e.unref;
e.toRef;
e.toRefs;
e.customRef;
e.triggerRef;
e.shallowRef;
e.shallowReactive;
e.readonly;
e.proxyRefs;
e.markRaw;
e.toRaw;
e.effectScope;
e.EffectScope;
e.watchEffect;
e.watchPostEffect;
e.watchSyncEffect;
e.Teleport;
e.Suspense;
e.KeepAlive;
e.Transition;
e.TransitionGroup;
const V = e.Fragment;
e.Static;
e.Text;
e.Comment;
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const $ = (o) => {
  for (const t in o)
    if (t.startsWith("aria-") || t === "role" || t === "title")
      return !0;
  return !1;
};
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const B = (o) => o === "";
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const F = (...o) => o.filter((t, n, s) => !!t && t.trim() !== "" && s.indexOf(t) === n).join(" ").trim();
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const E = (o) => o.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const U = (o) => o.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (t, n, s) => s ? s.toUpperCase() : n.toLowerCase()
);
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const L = (o) => {
  const t = U(o);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
var _ = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const z = ({
  name: o,
  iconNode: t,
  absoluteStrokeWidth: n,
  "absolute-stroke-width": s,
  strokeWidth: a,
  "stroke-width": m,
  size: i = _.width,
  color: g = _.stroke,
  ...c
}, { slots: d }) => k(
  "svg",
  {
    ..._,
    ...c,
    width: i,
    height: i,
    stroke: g,
    "stroke-width": B(n) || B(s) || n === !0 || s === !0 ? Number(a || m || _["stroke-width"]) * 24 / Number(i) : a || m || _["stroke-width"],
    class: F(
      "lucide",
      c.class,
      ...o ? [`lucide-${E(L(o))}-icon`, `lucide-${E(o)}`] : ["lucide-icon"]
    ),
    ...!d.default && !$(c) && { "aria-hidden": "true" }
  },
  [...t.map((h) => k(...h)), ...d.default ? [d.default()] : []]
);
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const H = (o, t) => (n, { slots: s, attrs: a }) => k(
  z,
  {
    ...a,
    ...n,
    iconNode: t,
    name: o
  },
  s
);
/**
 * @license lucide-vue-next v1.0.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const M = H("zap", [
  [
    "path",
    {
      d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      key: "1xq2db"
    }
  ]
]), Z = {
  key: 0,
  class: "ov-fab__badge"
}, j = /* @__PURE__ */ y({
  __name: "FabOverlay",
  props: {
    api: {},
    dragging: { type: Boolean }
  },
  setup(o) {
    const t = o, n = r(0);
    function s() {
      n.value++;
      const a = t.api.terminal.activePaneId();
      a ? t.api.terminal.send(a, `echo "hello from overlay FAB #${n.value}"
`) : t.api.ui.notify(`overlay FAB tapped ${n.value}x (no active terminal)`, "info");
    }
    return (a, m) => (p(), f("div", {
      class: b(["ov-fab", { "is-dragging": o.dragging }]),
      role: "button",
      "aria-label": "Overlay demo FAB",
      onClick: s
    }, [
      O(R(M), { size: 22 }),
      n.value > 0 ? (p(), f("span", Z, v(n.value), 1)) : P("", !0)
    ], 2));
  }
}), C = (o, t) => {
  const n = o.__vccOpts || o;
  for (const [s, a] of t)
    n[s] = a;
  return n;
}, Y = /* @__PURE__ */ C(j, [["__scopeId", "data-v-6335bb47"]]), q = {
  class: "ov-dash__head",
  "data-drag-handle": ""
}, G = { class: "ov-dash__clock" }, K = { class: "ov-dash__rows" }, J = /* @__PURE__ */ y({
  __name: "DashboardOverlay",
  props: {
    api: {},
    dragging: { type: Boolean }
  },
  setup(o) {
    const t = o, n = r(""), s = r(0), a = r(!1), m = r(!0), i = r([]), g = r(null);
    let c = null;
    const d = [];
    function h(w) {
      i.value = [...i.value.slice(-8), w], g.value?.scrollTo({ top: g.value.scrollHeight });
    }
    function x() {
      n.value = (/* @__PURE__ */ new Date()).toLocaleTimeString(), s.value = t.api.terminal.listPanes().length;
    }
    return I(() => {
      x(), c = setInterval(x, 1e3), d.push(
        t.api.events.subscribe("kb-open", () => {
          a.value = !0, h("kb-open");
        })
      ), d.push(
        t.api.events.subscribe("kb-close", () => {
          a.value = !1, h("kb-close");
        })
      ), h("mounted");
    }), S(() => {
      c && clearInterval(c), d.forEach((w) => w.dispose());
    }), (w, u) => (p(), f("div", {
      class: b(["ov-dash", { "is-dragging": o.dragging }])
    }, [
      l("div", q, [
        u[0] || (u[0] = l("span", { class: "ov-dash__title" }, "Overlay dashboard", -1)),
        l("span", {
          class: b(["ov-dash__kb", a.value ? "on" : "off"])
        }, v(a.value ? "kb open" : "kb closed"), 3)
      ]),
      l("div", G, v(n.value), 1),
      l("div", K, [
        l("span", null, [
          u[1] || (u[1] = T("panes: ", -1)),
          l("b", null, v(s.value), 1)
        ]),
        l("span", null, [
          u[2] || (u[2] = T("visible(): ", -1)),
          l("b", null, v(m.value ? "on" : "off"), 1)
        ])
      ]),
      l("div", {
        ref_key: "logEl",
        ref: g,
        class: "ov-dash__log"
      }, [
        (p(!0), f(V, null, N(i.value, (A, D) => (p(), f("div", {
          key: D,
          class: "ov-dash__log-line"
        }, v(A), 1))), 128))
      ], 512)
    ], 2));
  }
}), Q = /* @__PURE__ */ C(J, [["__scopeId", "data-v-b65a6d6d"]]), X = { class: "ov-pill" }, W = /* @__PURE__ */ y({
  __name: "StatusPill",
  props: {
    api: {},
    dragging: { type: Boolean }
  },
  setup(o) {
    const t = r(!1);
    let n = null;
    return I(() => {
      t.value = !0, n = setInterval(() => {
        t.value = !t.value;
      }, 2e3);
    }), S(() => {
      n && clearInterval(n);
    }), (s, a) => (p(), f("div", X, [
      l("span", {
        class: b(["ov-pill__dot", { live: t.value }])
      }, null, 2),
      a[0] || (a[0] = l("span", null, "overlay demo v0.1", -1))
    ]));
  }
}), ee = /* @__PURE__ */ C(W, [["__scopeId", "data-v-7d158396"]]);
function te(o) {
  return {
    overlay: [
      {
        id: "overlay-demo:fab",
        component: Y,
        dragHandle: "whole",
        interactive: !0,
        // 缺省 'bottom-right'，让开状态栏
        defaultPosition: "bottom-right"
      },
      {
        id: "overlay-demo:dashboard",
        component: Q,
        dragHandle: "grip",
        interactive: !0,
        defaultPosition: { x: 24, y: 48 },
        // visible() 只在注册时求值一次：设置里关掉则整个 overlay 不注册
        visible: () => o.settings.get().overlayDemoDashboard !== !1
      },
      {
        id: "overlay-demo:status",
        component: ee,
        dragHandle: "grip",
        interactive: !1,
        defaultPosition: "bottom-left"
      }
    ]
  };
}
export {
  te as activate
};
