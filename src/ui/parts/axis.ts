/**
 * 居中折线主轴 (axis.ts)
 *
 * 轴在条目列的正中间，节点在轴列内左右交替（CSS 的 ±wave），所以穿过所有节点的折线
 * 自然成 zigzag；首尾再竖直延伸到容器顶部与底部，让轴看起来是连续的。
 *
 * 只做「测量 + 画一条 path」，不写任何节点 transform（那是 CSS 的事）。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface AxisPoint {
  x: number;
  y: number;
}

/** 折线：首点竖直落下 → 逐点直连（硬折角）→ 末点竖直到底 */
function zigzagPath(points: AxisPoint[], height: number): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0]!;
  if (points.length === 1) {
    return `M ${first.x} 0 L ${first.x} ${height}`;
  }
  const last = points[points.length - 1]!;

  let d = `M ${first.x} 0 L ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const cur = points[i]!;
    d += ` L ${cur.x} ${cur.y}`;
  }
  d += ` L ${last.x} ${height}`;
  return d;
}

let observer: ResizeObserver | null = null;
let rafId = 0;
let lastPath = '';

function measure(root: HTMLElement): { points: AxisPoint[]; width: number; height: number } {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.htl-node'));
  const rootRect = root.getBoundingClientRect();
  const width = root.clientWidth;
  const height = Math.max(root.scrollHeight, rootRect.height);
  const points = nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return {
      x: Math.round(r.left - rootRect.left + root.scrollLeft + r.width / 2),
      y: Math.round(r.top - rootRect.top + root.scrollTop + r.height / 2),
    };
  });
  return { points, width, height };
}

function paint(root: HTMLElement, force = false): void {
  const { points, width, height } = measure(root);
  const d = zigzagPath(points, height);
  const svg = root.querySelector<SVGSVGElement>('.htl-axis-svg');
  if (!svg) {
    return;
  }
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const path = svg.querySelector<SVGPathElement>('.htl-axis-path');
  if (path && d && (force || d !== lastPath)) {
    lastPath = d;
    path.setAttribute('d', d);
  }
}

/** 布局稳定后再校准一次（web font / 图片会改变行高） */
function schedule(root: HTMLElement): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
  }
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    paint(root);
  });
}

export function drawAxis(root: HTMLElement): void {
  root.querySelectorAll('.htl-axis-svg').forEach((el) => el.remove());

  const { points, width, height } = measure(root);
  if (points.length === 0) {
    lastPath = '';
    return;
  }

  const d = zigzagPath(points, height);
  lastPath = '';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'htl-axis-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'htl-axis-path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(path);

  root.insertBefore(svg, root.firstChild);
  lastPath = d;

  schedule(root);

  if (typeof ResizeObserver !== 'undefined') {
    if (!observer) {
      observer = new ResizeObserver(() => {
        const target = document.getElementById('timeline-root');
        if (target) {
          schedule(target);
        }
      });
    }
    observer.disconnect();
    observer.observe(root);
    for (const row of Array.from(root.querySelectorAll('.htl-row'))) {
      observer.observe(row);
    }
  }
}
