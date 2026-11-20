/**
 * MOD-022: 透视背景网格 (backdrop.ts)
 *
 * 用手算透视画一张「地面网格」：竖线全部汇聚到消失点，横线越靠近观者间距越大，
 * 滚动时横线朝观者方向流动 —— 比 CSS 3D 旋转可预测，也不受 perspective 压缩影响。
 *
 * 纯装饰层：pointer-events: none、aria-hidden，不参与布局与测量；
 * 滚动只在本层 rAF 里改二十多条 <line> 的 y，不动 DOM 结构。
 * 颜色走 theme.css 的 --htl-backdrop-line（与原来的平面列网格同一纸白色系）。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 消失点高度（viewBox 百分比） */
const HORIZON = 20;
/** 横线条数 */
const ROW_COUNT = 26;
/** 底部竖线间距（百分比），画到视口外一点避免两侧留空 */
const COLUMN_STEP = 13;
const COLUMN_MIN = -170;
const COLUMN_MAX = 270;
/** 近处间距放大系数：越大越「地平线很近」 */
const DEPTH_POWER = 2.3;
/** 滚动多少像素走完一个格距 */
const SCROLL_PER_CELL = 1100;

let svgEl: SVGSVGElement | null = null;
let rowEls: SVGLineElement[] = [];
let phase = 0;
let rafId = 0;

function makeLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  opacity: number
): SVGLineElement {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', x1.toFixed(2));
  line.setAttribute('y1', y1.toFixed(2));
  line.setAttribute('x2', x2.toFixed(2));
  line.setAttribute('y2', y2.toFixed(2));
  line.setAttribute('opacity', opacity.toFixed(2));
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('stroke', 'var(--htl-backdrop-line, rgba(242, 239, 230, 0.13))');
  line.setAttribute('stroke-width', '1');
  return line;
}

/** 横线：远处密、近处疏；相位随滚动推进，像地面在脚下往后跑 */
function paint(): void {
  rafId = 0;
  const count = rowEls.length;
  for (let i = 0; i < count; i += 1) {
    const line = rowEls[i];
    if (!line) {
      continue;
    }
    let t = i / count + phase;
    t -= Math.floor(t);
    const y = HORIZON + (100 - HORIZON) * Math.pow(t, DEPTH_POWER);
    line.setAttribute('y1', y.toFixed(2));
    line.setAttribute('y2', y.toFixed(2));
    line.setAttribute('opacity', (0.3 + 0.7 * t).toFixed(2));
  }
}

function schedulePaint(): void {
  if (rafId === 0) {
    rafId = requestAnimationFrame(paint);
  }
}

function build(): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'htl-backdrop__grid');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  // 消失点附近必须渐隐，否则几十条线挤在一个点上会出现亮斑和摩尔纹
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'htl-backdrop-fade');
  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', String(HORIZON));
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', String(HORIZON + 26));
  for (const [offset, alpha] of [['0', '0'], ['0.45', '0.45'], ['1', '1']] as const) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', '#fff');
    stop.setAttribute('stop-opacity', alpha);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);

  const mask = document.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', 'htl-backdrop-mask');
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', '-200');
  mask.setAttribute('y', String(HORIZON));
  mask.setAttribute('width', '600');
  mask.setAttribute('height', '200');
  const maskRect = document.createElementNS(SVG_NS, 'rect');
  maskRect.setAttribute('x', '-200');
  maskRect.setAttribute('y', String(HORIZON));
  maskRect.setAttribute('width', '600');
  maskRect.setAttribute('height', '200');
  maskRect.setAttribute('fill', 'url(#htl-backdrop-fade)');
  mask.appendChild(maskRect);
  defs.appendChild(mask);
  svg.appendChild(defs);

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('mask', 'url(#htl-backdrop-mask)');

  // 竖线：底部等距、顶部收到同一个消失点，透视感由此产生
  for (let x = COLUMN_MIN; x <= COLUMN_MAX; x += COLUMN_STEP) {
    const dist = Math.abs(x - 50) / 120;
    group.appendChild(makeLine(50, HORIZON, x, 100, Math.max(0.18, 0.72 - dist * 0.42)));
  }

  // 横线：y 由 paint() 按滚动相位实时算
  rowEls = [];
  for (let i = 0; i < ROW_COUNT; i += 1) {
    const line = makeLine(0, 100, 100, 100, 0.3);
    rowEls.push(line);
    group.appendChild(line);
  }

  svg.appendChild(group);
  svgEl = svg;
}

function syncPhase(): void {
  phase = (window.scrollY || 0) / SCROLL_PER_CELL;
  phase -= Math.floor(phase);
}

export function mountBackdrop(): void {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  // 幂等：二次初始化不重复挂层
  if (document.getElementById('htl-backdrop')) {
    return;
  }

  const host = document.createElement('div');
  host.className = 'htl-backdrop';
  host.id = 'htl-backdrop';
  host.setAttribute('aria-hidden', 'true');

  build();
  if (svgEl) {
    host.appendChild(svgEl);
  }
  document.body.insertBefore(host, document.body.firstChild);

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  syncPhase();
  paint();

  if (reducedMotion) {
    return;
  }

  window.addEventListener(
    'scroll',
    () => {
      syncPhase();
      schedulePaint();
    },
    { passive: true }
  );
}
