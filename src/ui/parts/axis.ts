/**
 * 横向曲折主轴（v0.0.2-R6）
 *
 * 用一条 SVG 折线穿过每个事件节点：卡片上下交替 → 折线自然形成 zigzag，
 * 首尾再水平延伸到容器两端。视觉上是一条曲折的线，而不是平面直尺。
 *
 * 每次全量重绘后重算节点坐标，避免与卡片位置脱节。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface AxisPoint {
  x: number;
  y: number;
  /** 该节点所属卡片的左右边界（保留字段，供后续避让使用） */
  cardLeft: number | null;
  cardRight: number | null;
}

/** 斜折折线：节点之间直接连直线，硬折角（心电图那种） */
function sharpPath(points: AxisPoint[], innerWidth: number): string {
  if (points.length === 0) {
    return '';
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const r = (n: number) => Math.round(n);

  let d = `M 0 ${r(first.y)} L ${r(first.x)} ${r(first.y)}`;
  for (let i = 1; i < points.length; i += 1) {
    const cur = points[i]!;
    d += ` L ${r(cur.x)} ${r(cur.y)}`;
  }
  d += ` L ${innerWidth} ${r(last.y)}`;
  return d;
}

let axisObserver: ResizeObserver | null = null;
let axisRafId = 0;
let axisLastPath = '';
let floatRafId = 0;
let floatStart = 0;

/** 布局稳定后重算一次（字体/图片/展开态都会改变节点位置） */
function scheduleAxis(root: HTMLElement): void {
  if (axisRafId) {
    cancelAnimationFrame(axisRafId);
  }
  axisRafId = requestAnimationFrame(() => {
    axisRafId = 0;
    const d = buildAxisPath(root);
    const path = root.querySelector<SVGPathElement>('.htl-axis-path');
    if (path && d && d !== axisLastPath) {
      axisLastPath = d;
      path.setAttribute('d', d);
    }
  });
}

function buildAxisPath(root: HTMLElement): string {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.htl-card__node'));
  if (nodes.length === 0) {
    return '';
  }
  const cs = window.getComputedStyle(root);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  const rootRect = root.getBoundingClientRect();
  const innerWidth = Math.max(0, Math.max(root.scrollWidth, rootRect.width) - padRight);

  const points: AxisPoint[] = nodes.map((node) => {
    const r = node.getBoundingClientRect();
    const card = node.closest('.htl-card') as HTMLElement | null;
    const cr = card ? card.getBoundingClientRect() : null;
    return {
      x: Math.round(r.left - rootRect.left + r.width / 2),
      y: Math.round(r.top - rootRect.top + r.height / 2),
      cardLeft: cr ? cr.left - rootRect.left : null,
      cardRight: cr ? cr.right - rootRect.left : null,
    };
  });

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return '';
  }

  return sharpPath(points, innerWidth);
}

export function drawAxis(root: HTMLElement): void {
  // 清掉上一轮的线
  const stale = root.querySelector('.htl-axis-svg');
  if (stale) {
    stale.remove();
  }

  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.htl-card__node'));
  if (nodes.length === 0) {
    return;
  }

  const cs = window.getComputedStyle(root);
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;

  const rootRect = root.getBoundingClientRect();
  const width = Math.max(root.scrollWidth, rootRect.width);
  const height = Math.max(root.scrollHeight, rootRect.height);

  const points: AxisPoint[] = nodes.map((node) => {
    const r = node.getBoundingClientRect();
    const card = node.closest('.htl-card') as HTMLElement | null;
    const cr = card ? card.getBoundingClientRect() : null;
    return {
      x: Math.round(r.left - rootRect.left + r.width / 2),
      y: Math.round(r.top - rootRect.top + r.height / 2),
      cardLeft: cr ? cr.left - rootRect.left : null,
      cardRight: cr ? cr.right - rootRect.left : null,
    };
  });

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return;
  }

  const innerWidth = Math.max(0, width - padRight);
  const d = sharpPath(points, innerWidth);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'htl-axis-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', String(innerWidth));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${innerWidth} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // 线性渐变描边：两端淡出，中段实色（用主题 accent 变量，换主题跟着变）
  const accent = window.getComputedStyle(document.documentElement)
    .getPropertyValue('--htl-color-accent')
    .trim() || '#4c9aff';
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'htl-axis-gradient');
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '1');
  grad.setAttribute('y2', '0');
  for (const [offset, opacity] of [['0', '0.15'], ['0.08', '1'], ['0.92', '1'], ['1', '0.15']] as const) {
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
        const target = document.getElementById('timeline-root');
        if (target) {
          scheduleAxis(target);
        }
      });
    }
    axisObserver.disconnect();
    axisObserver.observe(root);
    for (const card of Array.from(root.querySelectorAll('.htl-card'))) {
      axisObserver.observe(card);
    }
  }
}

/**
 * 灵动层：卡片按正弦缓慢上下浮动（各自相位错开），折线每帧跟着节点重算，
 * 视觉上整条时间轴在轻轻呼吸。
 * prefers-reduced-motion 时完全不启动。
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

  const cards = Array.from(root.querySelectorAll<HTMLElement>('.htl-card'));
  if (cards.length === 0) {
    return;
  }
  floatStart = 0;

  const step = (ts: number): void => {
    if (!floatStart) {
      floatStart = ts;
    }
    const t = (ts - floatStart) / 1000;

    cards.forEach((card, index) => {
      const phase = (index % 6) * 0.85;
      const amp = 2.5 + (index % 3) * 1.2; // 2.5~4.9px，深浅不一
      const dy = Math.sin(t * 0.7 + phase) * amp;
      card.style.transform = `translateY(${dy.toFixed(2)}px)`;
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
