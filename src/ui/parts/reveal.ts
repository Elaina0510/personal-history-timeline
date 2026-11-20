/**
 * MOD-021: 条目滚动入场动画 (reveal.ts)
 *
 * 职责：
 * 1. 观察时间轴条目（.htl-row），进入视口时加 is-revealed，交由 CSS 做「上浮 + 淡入」。
 * 2. 重绘后重新接管新节点；已经露出过的事件（按 data-event-id）直接置为已揭示，避免编辑/筛选后整页重新闪一遍。
 * 3. 降级：无 IntersectionObserver 或用户偏好减少动态效果时，一次性全部揭示，绝不把内容锁死成不可见。
 *
 * 纯视觉模块：不读 Store、不碰业务计算、不绑定事件、不用 innerHTML。
 * 隐藏态由 CSS 挂在 .htl-timeline.is-reveal-armed 之下，因此禁用 JS 时页面照常可见。
 */

const ARMED_CLASS = 'is-reveal-armed';
const ROW_SELECTOR = '.htl-row';
const REVEALED_CLASS = 'is-revealed';
const DELAY_STEP_MS = 60;
const DELAY_MAX_STEPS = 5;

/** 已经露出过的事件 id —— 重绘后这些行不再走动画 */
const revealedIds = new Set<string>();

let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  if (motionQuery === null) {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  return motionQuery.matches;
}

function markRevealed(row: HTMLElement): void {
  const id = row.dataset.eventId;
  if (id) {
    revealedIds.add(id);
  }
  row.classList.add(REVEALED_CLASS);
}

function ensureObserver(): IntersectionObserver | null {
  if (observer !== null) {
    return observer;
  }
  if (typeof IntersectionObserver === 'undefined') {
    return null;
  }
  observer = new IntersectionObserver(
    (entries) => {
      // 同一批进入的行错峰出场，滚动时一行一行浮上来更像活的东西
      let step = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const row = entry.target as HTMLElement;
        row.style.setProperty(
          '--htl-reveal-delay',
          `${Math.min(step, DELAY_MAX_STEPS) * DELAY_STEP_MS}ms`
        );
        step += 1;
        markRevealed(row);
        observer?.unobserve(row);
      }
    },
    // 底部预收 8%，元素真正「进来」一截后才触发
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );
  return observer;
}

/**
 * 在每次 render 之后调用：接管当前所有条目行。
 * 幂等——同一批节点重复调用只会重复观察同一个元素，IO 本身会去重。
 */
export function mountReveal(root: HTMLElement): void {
  try {
    const rows = Array.from(root.querySelectorAll<HTMLElement>(ROW_SELECTOR));
    if (rows.length === 0) {
      return;
    }

    const io = prefersReducedMotion() ? null : ensureObserver();

    // 无 IO / 偏好减少动效：全部直接揭示，不做任何隐藏
    if (io === null) {
      root.classList.remove(ARMED_CLASS);
      for (const row of rows) {
        markRevealed(row);
      }
      return;
    }

    root.classList.add(ARMED_CLASS);

    for (const row of rows) {
      const id = row.dataset.eventId ?? '';
      if (id !== '' && revealedIds.has(id)) {
        row.classList.add(REVEALED_CLASS);
        continue;
      }
      if (row.classList.contains(REVEALED_CLASS)) {
        continue;
      }
      io.observe(row);
    }
  } catch {
    // 动画是纯装饰，任何异常都不该影响时间轴本身
    try {
      root.classList.remove(ARMED_CLASS);
    } catch {
      // 忽略
    }
  }
}
