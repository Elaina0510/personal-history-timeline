/**
 * MOD-022: 透视背景线 (backdrop.ts)
 *
 * 只有竖线：底部等距、顶部全部收到同一个消失点，于是天然向远处汇聚。
 * 滚动时消失点在视口上部缓慢漂移（左右摆 + 轻微上下），整片线条随之转向，
 * 形成「镜头在动」的纵深变化 —— 比横线流动安静，也不压文字。
 *
 * 纯装饰层：pointer-events: none、aria-hidden，不参与布局与测量；
 * 滚动只在本层 rAF 里改三十多条 <line> 的起点，不动 DOM 结构。
 * 颜色走 theme.css 的 --htl-backdrop-line（与原来的平面列网格同一纸白色系）。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 消失点基准高度（viewBox 百分比） */
const HORIZON = 20;
/** 底部竖线间距（百分比），画到视口外一点避免两侧留空 */
const COLUMN_STEP = 11;
const COLUMN_MIN = -170;
const COLUMN_MAX = 270;
/** 消失点左右摆幅（百分比） */
const DRIFT_X = 12;
/** 消失点上下摆幅（百分比） */
const DRIFT_Y = 5;
/** 滚动多少像素走完一个漂移周期 */
const DRIFT_PERIOD_PX = 2600;

let svgEl: SVGSVGElement | null = null;
let columnEls: SVGLineElement[] = [];
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

/** 只改竖线的起点：消失点随滚动缓慢漂移，底部端点不动 */
function paint(): void {
  rafId = 0;
  const angle = ((window.scrollY || 0) / DRIFT_PERIOD_PX) * Math.PI * 2;
  const x = (50 + DRIFT_X * Math.sin(angle)).toFixed(2);
  const y = (HORIZON + DRIFT_Y * Math.cos(angle)).toFixed(2);
  for (const line of columnEls) {
    line.setAttribute('x1', x);
    line.setAttribute('y1', y);
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
  grad.setAttribute('y1', String(HORIZON - DRIFT_Y));
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', String(HORIZON + 24));
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
  mask.setAttribute('y', String(HORIZON - DRIFT_Y));
  mask.setAttribute('width', '600');
  mask.setAttribute('height', '200');
  const maskRect = document.createElementNS(SVG_NS, 'rect');
  maskRect.setAttribute('x', '-200');
  maskRect.setAttribute('y', String(HORIZON - DRIFT_Y));
  maskRect.setAttribute('width', '600');
  maskRect.setAttribute('height', '200');
  maskRect.setAttribute('fill', 'url(#htl-backdrop-fade)');
  mask.appendChild(maskRect);
  defs.appendChild(mask);
  svg.appendChild(defs);

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('mask', 'url(#htl-backdrop-mask)');

  // 竖线：底部等距、顶部收到同一个消失点，透视感由此产生
  columnEls = [];
  for (let x = COLUMN_MIN; x <= COLUMN_MAX; x += COLUMN_STEP) {
    const dist = Math.abs(x - 50) / 120;
    const line = makeLine(50, HORIZON, x, 100, Math.max(0.18, 0.72 - dist * 0.42));
    columnEls.push(line);
    group.appendChild(line);
  }

  svg.appendChild(group);
  svgEl = svg;
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

  paint();

  if (reducedMotion) {
    return;
  }

  window.addEventListener('scroll', schedulePaint, { passive: true });
}
