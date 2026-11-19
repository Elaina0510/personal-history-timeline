---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T27 主轴 —— 竖向折线

- **对应模块**: MOD-018 `src/ui/parts/axis.ts`
- **依赖**: T26（`.htl-node` 由它产出）
- **可并行**: 与 T26 可同时开发；验收必须等 T26 落地后再跑

## 目标

把横向 SVG 折线改成竖向：折线沿 y 轴从上贯到下，穿过每个事件节点；节点在轴列内左右交替偏移，折线因此必然 zigzag（硬折角，不平滑、不正交绕行）。

## 允许改动的文件

```
src/ui/parts/axis.ts
```

## 一、接口（导出面不变）

```ts
export function drawAxis(root: HTMLElement): void;
```

内部 `buildAxisPath(root)`、`scheduleAxis(root)`、`startFloat(root)` 可自由改实现，但要保留这三个职责。

## 二、几何契约（写错这里就是白做）

### 2.1 节点选择器

`root.querySelectorAll('.htl-node')`（不是 `.htl-card__node`）。

### 2.2 内容坐标换算

```ts
const rootRect = root.getBoundingClientRect();
x = Math.round(r.left - rootRect.left + root.scrollLeft + r.width / 2);
y = Math.round(r.top  - rootRect.top  + root.scrollTop  + r.height / 2);
```

**绝对不许加 `window.scrollY`**。`#timeline-root` 不是纵向滚动容器，页面滚动时节点与 root 的矩形同步位移，差值天然稳定；加上 `window.scrollY` 会让折线随页面滚动整体漂移。v0.0.1 的 R14 修的是横向 `scrollLeft`（因为当时 root 是横向滚动容器），性质不同，不要照抄结论。

### 2.3 路径

```
d = `M ${x₀} 0` + ` L ${x₀} ${y₀}` + 对每个后续点 ` L ${xᵢ} ${yᵢ}` + ` L ${xₙ} ${innerHeight}`
```

- 首节点之前从 `y = 0` 竖直下来，末节点之后竖直到底。
- 相邻节点之间**直接连斜线**（`L`），不要曲线、不要正交绕行、不要圆角插值。
- 只有 1 个节点时：`M x₀ 0 L x₀ innerHeight`（一条竖直线，不得返回空串）。

### 2.4 SVG 尺寸与渐变

- SVG 的宽取 `root.clientWidth`（内容区宽，已扣掉左右 padding），高取 `Math.max(root.scrollHeight, rootRect.height)`；`viewBox="0 0 {w} {h}"`、`width/height` 属性与 viewBox 同值、`preserveAspectRatio="none"`，`path` 上保留 `vector-effect="non-scaling-stroke"`。
  **只许一个公式**：不要再混入 `innerWidth` 或 `max(root.scrollWidth, …)`——坐标基准是 root 的左边缘，宽度多算少算都会让整条线横向偏移，且这种偏移不会被任何断言抓到。
- 渐变改为**纵向**：`x1="0" y1="0" x2="0" y2="1"`，stops 仍是 `0 → .15`、`.08 → 1`、`.92 → 1`、`1 → .15`，颜色取 `--htl-color-accent`。
- 插入位置：`root.insertBefore(svg, root.firstChild)`，class `htl-axis-svg`，`aria-hidden="true"`。

### 2.5 灵动层

- **作用对象必须换**：v0.0.1 的 `startFloat` 是给 `.htl-card` 写 `style.transform`；v0.0.2 已经没有 `.htl-card`，原样留下会查到 0 个元素、静默 return（不报错、也没效果）。目标改为 `.htl-cell--axis`，节点数阈值也改成数 `.htl-node`。
- **绝对不许直接给 `.htl-node` 写 `style.transform`**：节点的 `translateX(±--htl-axis-wave)` 是 CSS 里那条 zigzag 的唯一来源，内联 transform 一盖，整条折线被压成直线，而且因为路径是从节点实测重算的，这个塌陷不会有任何报错。
- 方向从 `translateY` 改为 `translateX`（沿引线方向，幅度 1.5~2.5px，索引相位错开），避免竖向浮动遮挡相邻行。
- 每帧重算路径的逻辑保留。
- **节点数 > 120 时不启动浮动**（`startFloat` 直接 return），折线只在重绘与 ResizeObserver 时计算。
- `prefers-reduced-motion: reduce` 时完全不启动（沿用现有判断）。

## 三、边界

| 场景 | 行为 |
|------|------|
| 0 个节点 | 不创建 SVG，直接 return（先删旧的 `.htl-axis-svg` 再判断） |
| 1 个节点 | 一条竖直线，`M x 0 L x height` |
| 窗口缩放 | `ResizeObserver` 观察 root 与每个 `.htl-row`，触发 `scheduleAxis` |
| 重绘 | 每次 `drawAxis` 先删除旧 SVG 再重建，不得叠加两个 |

## 严禁

- 不许加 `window.scrollY` / `window.scrollX`。
- 不许做成平滑曲线（Catmull-Rom / 贝塞尔）或 90° 正交绕行。
- 不许读 `.htl-card__node`、`.htl-slot`、`.is-up`、`.is-down` 这些已删除的选择器。
- 不许把节点坐标写死成 `left: 50%` 之类——坐标必须从 DOM 实测。
- 不许在 axis.ts 里改 DOM 结构或绑定事件（它只画线）。
- 不许把动画帧率或阈值做成外部配置项（YAGNI）。

## 验收清单（可复现断言，派发方复跑）

1. `document.querySelectorAll('.htl-node').length === document.querySelectorAll('.htl-row').length`。
2. `.htl-axis-path` 的 `d` 属性：以 `M` 开头，第一个点是 `(x₀, 0)`，最后一个点 `y` 等于 SVG 的 `height`；中间相邻点的 `y` 严格递增（表格化打印前 5 个点验证）。
3. **zigzag 必须真的存在**（光验 y 递增不够——一条笔直竖线能通过上面所有断言）：把 `d` 拆成点序列后，相邻折点的 `x` 必须在两个值之间来回切换，且两值的中点是轴列中心、各自距中线约等于 `--htl-axis-wave`（误差 ±2px）。
4. 节点没有被内联 transform 污染：`document.querySelector('.htl-node').getAttribute('style')` 不含 `transform`（zigzag 靠 CSS，浮动不许写它）。
5. `document.querySelectorAll('.htl-axis-svg').length === 1`（重绘 3 次后仍为 1）。
6. 页面纵向滚动 500px 后，取第一个节点中心与路径上对应点的屏幕距离，误差 ≤ 1px（验证没有 `window.scrollY` 漂移）。
7. 把窗口宽度从 1400 拉到 700：折线自动重算，节点仍在线上（误差 ≤ 1px）。
8. `document.documentElement.scrollWidth <= window.innerWidth`（无横向滚动条）。注意 `body` 上有 `overflow-x: hidden`，这条只能当兜底，别当成「真的没有横向溢出」的证据。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T27 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

前置：T26 已把事件行改成 .htl-row[data-event-id]，节点是 .htl-cell--axis 里的 span.htl-node，旧的 .htl-card__node 已不存在。

先读（只读）：
- detailed-design-v0.0.2.md 的 §5.3（axis.ts 几何契约）与 §7.1（主轴边界）
- proposal-v0.0.2.md 的 REQ-026

任务：只改 src/ui/parts/axis.ts，把横向折线改成竖向折线。

硬性要求：
1. 节点选择器改成 .htl-node；坐标用 rect 与 rootRect 的差值 + root.scrollLeft/scrollTop 换算中心点。
2. 路径：从 (x₀, 0) 竖直下来到首节点，然后逐点 L 连斜线（硬折角），最后从末节点竖直到底部 innerHeight。只有 1 个节点时是 M x 0 L x height。
3. 渐变改纵向：x1=0 y1=0 x2=0 y2=1，颜色取 --htl-color-accent。
4. 每次 drawAxis 先删掉旧的 .htl-axis-svg 再重建，永远只有一个 SVG。
5. 灵动层：作用对象从 .htl-card 换成 .htl-cell--axis（旧的 .htl-card 已经不存在，照抄会造成静默 no-op），方向从 translateY 改成 translateX（幅度 1.5~2.5px）；绝不许给 .htl-node 写内联 transform——那会覆盖 CSS 里 ±wave 的偏移、把 zigzag 压平。节点数超过 120 时直接不启动浮动；prefers-reduced-motion 时同样不启动。
6. ResizeObserver 观察 root 与每个 .htl-row。

严禁（最重要的一条）：
- 绝对不能加 window.scrollY。加了之后页面一滚动折线就整体漂移。页面滚动时节点和 root 是同步位移的，差值稳定，加了反而错。
- 不许做平滑曲线或正交绕行，REQ-026 明确要求硬折角斜折。
- 不许读已删除的 .htl-card__node / .htl-slot / .is-up / .is-down。
- 不许在 axis.ts 里改 DOM 结构或绑事件。

完成标准：
- npm run typecheck 零错误，贴输出
- 交付可复现断言清单：节点数=行数；路径首点 y=0、末点 y=SVG 高度、中间点 y 递增；**折点 x 在两个值之间交替且各自离轴中线约等于 --htl-axis-wave**；`.htl-node` 上没有内联 transform；重绘 3 次后 SVG 仍只有 1 个；页面滚动 500px 后节点与路径点屏幕距离误差 ≤1px；窗口缩放后仍在线上。DOM 断言由派发方用浏览器复跑，不要自述「已验证」。
```
