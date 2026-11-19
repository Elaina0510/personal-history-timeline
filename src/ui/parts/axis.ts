/**
 * 竖向曲折主轴（v0.0.2-R1 / T27）
 *
 * 用一条 SVG 折线自上而下穿过每个事件节点：条目左右交替 → 节点在轴列内交替偏移 ±wave → 折线必然形成硬折角 zigzag，
 * 首尾再竖直延伸到容器顶部与底部。
 *
 * 每次全量重绘后重算节点坐标，避免与条目位置脱节。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface AxisPoint {
  x: number;
  y: number;
}

/** 斜折折线：首节点从 (x0, 0) 竖直下来，节点之间直接连斜线（硬折角），末节点竖直到底部 innerHeight */
function sharpPath(points: AxisPoint[], innerHeight: number): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0]!;
  if (points.length === 1) {
    return `M ${first.x} 0 L ${first.x} ${innerHeight}`;
  }
  const last = points[points.length - 1]!;

  let d = `M ${first.x} 0 L ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const cur = points[i]!;
    d += ` L ${cur.x} ${cur.y}`;
  }
  d += ` L ${last.x} ${innerHeight}`;
  return d;
}

let axisObserver: ResizeObserver | null = null;
let axisRafId = 0;
let axisLastPath = '';
let floatRafId = 0;
let floatStart = 0;

/** 布局稳定后重算一次（字体/图片/窗口缩放都会改变节点位置） */
function scheduleAxis(root: HTMLElement): void {
  if (axisRafId) {
    cancelAnimationFrame(axisRafId);
  }
  axisRafId = requestAnimationFrame(() => {
    axisRafId = 0;
    const d = buildAxisPath(root);
    const svg = root.querySelector<SVGSVGElement>('.htl-axis-svg');
    if (svg) {
      const rootRect = root.getBoundingClientRect();
      const width = root.clientWidth;
      const height = Math.max(root.scrollHeight, rootRect.height);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    const path = root.querySelector<SVGPathElement>('.htl-axis-path');
    if (path && d && d !== axisLastPath) {
      axisLastPath = d;
      path.setAttribute('d', d);
    }
  });
}

function buildAxisPath(root: HTMLElement): string {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.htl-node'));
  if (nodes.length === 0) {
    return '';
  }
  const rootRect = root.getBoundingClientRect();
  const height = Math.max(root.scrollHeight, rootRect.height);

  const points: AxisPoint[] = nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return {
      x: Math.round(r.left - rootRect.left + root.scrollLeft + r.width / 2),
      y: Math.round(r.top - rootRect.top + root.scrollTop + r.height / 2),
    };
  });

  return sharpPath(points, height);
}

export function drawAxis(root: HTMLElement): void {
  // 每次 drawAxis 先删旧 .htl-axis-svg 再重建，永远只有一个 SVG
  const stales = root.querySelectorAll('.htl-axis-svg');
  stales.forEach((el) => el.remove());

  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.htl-node'));
  if (nodes.length === 0) {
    if (floatRafId) {
      cancelAnimationFrame(floatRafId);
      floatRafId = 0;
    }
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const width = root.clientWidth;
  const height = Math.max(root.scrollHeight, rootRect.height);

  const points: AxisPoint[] = nodes.map((node) => {
    const r = node.getBoundingClientRect();
    return {
      x: Math.round(r.left - rootRect.left + root.scrollLeft + r.width / 2),
      y: Math.round(r.top - rootRect.top + root.scrollTop + r.height / 2),
    };
  });

  const d = sharpPath(points, height);
  if (!d) {
    return;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'htl-axis-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // 纵向线性渐变描边：两端淡出，中段实色（用主题 accent 变量）
  const accent = (
    typeof window !== 'undefined'
      ? window.getComputedStyle(document.documentElement).getPropertyValue('--htl-color-accent').trim()
      : ''
  ) || '#4c9aff';

  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'htl-axis-gradient');
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');
  for (const [offset, opacity] of [
    ['0', '0.15'],
    ['0.08', '1'],
    ['0.92', '1'],
    ['1', '0.15'],
  ] as const) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', accent);
    stop.setAttribute('stop-opacity', opacity);
    grad.appendChild(stop);
  }
  defs.appendChild(grad);
  svg.appendChild(defs);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('class', 'htl-axis-path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('vector-effect', 'non-scaling-stroke');

  svg.appendChild(path);
  root.insertBefore(svg, root.firstChild);

  // 布局稳定后再校准一次 + 尺寸变化时重画
  axisLastPath = d;
  scheduleAxis(root);

  startFloat(root);

  if (typeof ResizeObserver !== 'undefined') {
    if (!axisObserver) {
      axisObserver = new ResizeObserver(() => {
        const target = document.getElementById('timeline-root') ?? root;
        if (target) {
          scheduleAxis(target);
        }
      });
    }
    axisObserver.disconnect();
    axisObserver.observe(root);
    for (const row of Array.from(root.querySelectorAll('.htl-row'))) {
      axisObserver.observe(row);
    }
  }
}

/**
 * 灵动层：轴列 (.htl-cell--axis) 缓慢水平浮动（各自相位错开），折线每帧跟着节点重算。
 * 绝不直接给 .htl-node 写内联 transform（避免覆盖 CSS 的 ±wave zigzag）。
 * 节点数 > 120 或 prefers-reduced-motion 时不启动。
 */
function startFloat(root: HTMLElement): void {
  if (floatRafId) {
    cancelAnimationFrame(floatRafId);
    floatRafId = 0;
  }
  if (typeof window === 'undefined' || !window.matchMedia) {
    return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const nodes = root.querySelectorAll('.htl-node');
  if (nodes.length === 0 || nodes.length > 120) {
    return;
  }

  const cells = Array.from(root.querySelectorAll<HTMLElement>('.htl-cell--axis'));
  if (cells.length === 0) {
    return;
  }
  floatStart = 0;

  const step = (ts: number): void => {
    if (!floatStart) {
      floatStart = ts;
    }
    const t = (ts - floatStart) / 1000;

    cells.forEach((cell, index) => {
      const phase = (index % 6) * 0.85;
      const amp = 1.5 + (index % 3) * 0.5; // 1.5~2.5px
      const dx = Math.sin(t * 0.7 + phase) * amp;
      cell.style.transform = `translateX(${dx.toFixed(2)}px)`;
    });

    const d = buildAxisPath(root);
    const path = root.querySelector<SVGPathElement>('.htl-axis-path');
    if (path && d && d !== axisLastPath) {
      axisLastPath = d;
      path.setAttribute('d', d);
    }

    floatRafId = requestAnimationFrame(step);
  };

  floatRafId = requestAnimationFrame(step);
}
