/**
 * MOD-019: 覆盖式事件详情浮层 (detailModal.ts)
 *
 * 职责：
 * 1. 展示单条事件详情：日期、标题、全部记录（按记录日期升序）、配图、外链、关联事件、操作区。
 * 2. 导出 openDetail / closeDetail / refreshDetail / isDetailOpen。
 * 3. 浮层挂载于 #overlay-root，使用 lockScroll / unlockScroll 管理页面滚动锁。
 * 4. 数据通过 buildCards / sortedRecords 派生，严格不自行计算最新记录、跨度、方向。
 * 5. 增删改全部交给 data-action 全局委托，本模块不直接处理数据修改。
 * 6. 严禁使用 innerHTML、严禁全局 document 监听 keydown、严禁直接操作 is-locked。
 *
 * 打开状态不进 ViewState 理由：
 * 进视图状态会触发全量重绘 #timeline-root，而浮层不在重建范围内，纯属浪费。
 */

import { el } from '../dom';
import { lockScroll, unlockScroll } from './scrollLock';
import { dropOverlayEntry, pushOverlayEntry } from './overlayHistory';
import { toast } from './toast';
import { buildCards, sortedRecords } from '../../core/select';
import type { CardView } from '../../core/select';
import type { AppState, FilterState } from '../../core/types';
import type { Store } from '../../core/store';

let currentEventId: string | null = null;
let currentRoot: HTMLElement | null = null;
let currentStore: Store | null = null;
let lastPanelScrollTop = 0;
/** 打开时记下的起点行矩形，收起时原路缩回去 */
let currentOrigin: OriginRect | null = null;
/** 正在播放收起动画，防止重复关闭 */
let closing = false;
/** 收起动画结束时要执行的真正清理，重开时可提前触发 */
let pendingCloseFinish: (() => void) | null = null;

/** 展开动画的起点：被点中的那一行（红色高亮块）在视口里的位置 */
export interface OriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const OPEN_DURATION_MS = 520;
const CONTENT_FADE_MS = 220;
const CONTENT_DELAY_MS = 300;
const OPEN_EASING = 'cubic-bezier(0.45, 0.05, 0.25, 1)';
/** 收起：展开的逆过程，略快一点，收尾干脆 */
const CLOSE_DURATION_MS = 420;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 展开动画：浮层从被点的那一行长大。
 *
 * - 面板用 transform 从行的矩形拉伸到自身矩形（内容延后淡入，看不见压扁过程）；
 * - 另加一层红色 ghost，从行的高亮块长到浮层大小再淡出，衔接「变红 → 展开」；
 * - 无起点 / 偏好减少动效 / WAAPI 不可用时退回 CSS 的 htl-panel-rise。
 */
function animateOpen(overlay: HTMLElement, panel: HTMLElement, origin: OriginRect | null): void {
  if (!origin || prefersReducedMotion()) {
    return;
  }

  // 接管后 CSS keyframes 必须让位，否则两套动画叠加
  panel.style.animation = 'none';

  const target = panel.getBoundingClientRect();
  if (target.width <= 0 || target.height <= 0) {
    panel.style.animation = '';
    return;
  }

  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
  const sx = Math.max(origin.width / target.width, 0.06);
  const sy = Math.max(origin.height / target.height, 0.05);

  try {
    panel.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: 'translate(0px, 0px) scale(1, 1)' },
      ],
      { duration: OPEN_DURATION_MS, easing: OPEN_EASING, fill: 'both' }
    );

    // 内容后一步淡入，压扁的过程不被看见
    for (const child of Array.from(panel.children)) {
      (child as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: CONTENT_FADE_MS,
        delay: CONTENT_DELAY_MS,
        easing: 'ease-out',
        fill: 'both',
      });
    }

    // 红色块：从行的高亮块长到浮层大小，途中淡出
    const ghost = document.createElement('div');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = [
      'position:fixed',
      `left:${origin.left}px`,
      `top:${origin.top}px`,
      `width:${origin.width}px`,
      `height:${origin.height}px`,
      'background:var(--htl-color-accent, #f40c3f)',
      'pointer-events:none',
      'z-index:2',
    ].join(';');
    overlay.appendChild(ghost);

    const gsx = target.width / origin.width;
    const gsy = target.height / origin.height;
    // ghost 从行出发走向浮层：位移方向与面板相反（面板是从浮层退到行再展开）
    const gdx = -dx;
    const gdy = -dy;

    // 位移/缩放与面板用同一组参数，因此红块全程正好盖住面板 —— 看到的是「一块红长大」
    ghost.animate(
      [
        { transform: 'translate(0px, 0px) scale(1, 1)' },
        { transform: `translate(${gdx}px, ${gdy}px) scale(${gsx}, ${gsy})` },
      ],
      { duration: OPEN_DURATION_MS, easing: OPEN_EASING, fill: 'both' }
    );

    // 透明度单独一条 linear 曲线，先压住红色，后段褪掉露出浮层
    const ghostFade = ghost.animate(
      [
        { opacity: 0.94 },
        { opacity: 0.92, offset: 0.35 },
        { opacity: 0.5, offset: 0.72 },
        { opacity: 0 },
      ],
      { duration: OPEN_DURATION_MS, easing: 'linear', fill: 'both' }
    );
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ghost.remove();
    };
    ghostFade.onfinish = finish;
    // 后台标签页 rAF 被节流时 onfinish 可能不触发，兜底移除 ghost
    window.setTimeout(finish, OPEN_DURATION_MS + 120);
  } catch {
    // WAAPI 不可用就恢复 CSS 动画
    panel.style.animation = '';
  }
}

/**
 * 收起动画：展开的逆过程。
 *
 * 面板从自身矩形缩回被点的那一行，内容先淡出；红色 ghost 从浮层尺寸缩回行尺寸，
 * 遮罩整体淡出 —— 观感是「浮层收成红块 → 红块缩回那一行」。
 * 与展开共用同一组几何参数，所以红块全程正好盖住面板。
 * 动画结束（或超时兜底）后回调 done 移除节点。不支持 WAAPI / 减少动效时返回 false。
 */
function animateClose(
  overlay: HTMLElement,
  panel: HTMLElement,
  origin: OriginRect | null,
  done: () => void
): boolean {
  if (!origin || prefersReducedMotion()) {
    return false;
  }

  const target = panel.getBoundingClientRect();
  if (target.width <= 0 || target.height <= 0) {
    return false;
  }

  const dx = origin.left + origin.width / 2 - (target.left + target.width / 2);
  const dy = origin.top + origin.height / 2 - (target.top + target.height / 2);
  const sx = Math.max(origin.width / target.width, 0.06);
  const sy = Math.max(origin.height / target.height, 0.05);

  let ghost: HTMLElement | null = null;

  try {
    // 清掉展开时残留的 fill 动画，避免两套 transform 叠加
    panel.getAnimations?.().forEach((a) => a.cancel());

    // 面板：从浮层矩形缩回被点的行（展开的逆过程）
    panel.animate(
      [
        { transform: 'translate(0px, 0px) scale(1, 1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      ],
      { duration: CLOSE_DURATION_MS, easing: OPEN_EASING, fill: 'both' }
    );

    // 内容先淡出（展开是延迟淡入，收起反过来）
    for (const child of Array.from(panel.children)) {
      const c = child as HTMLElement;
      c.getAnimations?.().forEach((a) => a.cancel());
      c.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.round(CLOSE_DURATION_MS * 0.65),
        easing: 'ease-in',
        fill: 'both',
      });
    }

    // 遮罩整体淡出：ease-in 让前段保持、后段快速褪去
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_DURATION_MS,
      easing: 'ease-in',
      fill: 'both',
    });

    // 红 ghost：从浮层尺寸缩回行尺寸，与面板同参，全程盖住面板
    ghost = document.createElement('div');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = [
      'position:fixed',
      `left:${origin.left}px`,
      `top:${origin.top}px`,
      `width:${origin.width}px`,
      `height:${origin.height}px`,
      'background:var(--htl-color-accent, #f40c3f)',
      'pointer-events:none',
      'z-index:2',
    ].join(';');
    overlay.appendChild(ghost);

    const gsx = target.width / origin.width;
    const gsy = target.height / origin.height;
    const gdx = -dx;
    const gdy = -dy;

    ghost.animate(
      [
        { transform: `translate(${gdx}px, ${gdy}px) scale(${gsx}, ${gsy})` },
        { transform: 'translate(0px, 0px) scale(1, 1)' },
      ],
      { duration: CLOSE_DURATION_MS, easing: OPEN_EASING, fill: 'both' }
    );

    const ghostFade = ghost.animate(
      [
        { opacity: 0.94 },
        { opacity: 0.92, offset: 0.35 },
        { opacity: 0.5, offset: 0.72 },
        { opacity: 0 },
      ],
      { duration: CLOSE_DURATION_MS, easing: 'linear', fill: 'both' }
    );

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ghost?.remove();
      done();
    };
    ghostFade.onfinish = finish;
    // 标签页切后台时 onfinish 可能不触发，兜底收尾
    window.setTimeout(finish, CLOSE_DURATION_MS + 120);
    return true;
  } catch {
    ghost?.remove();
    return false;
  }
}

const EMPTY_FILTER: FilterState = { ratings: [], minFour: false, keyword: '' };

function getOverlayRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

function getCardView(state: Readonly<AppState>, eventId: string): CardView | undefined {
  const groups = buildCards(state.data.events, EMPTY_FILTER, state.view.sortOrder);
  const flatCards = groups.flatMap((g) => (g.cards ? g.cards : g.months.flatMap((m) => m.cards)));
  return flatCards.find((v) => v.event.id === eventId);
}

function renderPanel(view: CardView): HTMLElement {
  const event = view.event;

  // Header: 日期、标题、关闭按钮
  const headEl = el('header', { class: 'htl-detail__head' }, [
    el('span', { class: 'htl-detail__date' }, [event.date]),
    el('h2', { class: 'htl-detail__title' }, [event.title]),
    el(
      'button',
      {
        type: 'button',
        'data-action': 'close-detail',
        'aria-label': '关闭',
      },
      ['✕']
    ),
  ]);

  const bodyChildren: HTMLElement[] = [];

  // 1. Records 区（按 sortedRecords 升序展示，为空时只渲染一行「还没有记录」）
  const records = sortedRecords(event);
  const recordsContainer = el('div', { class: 'htl-detail__records' });
  if (records.length === 0) {
    recordsContainer.appendChild(
      el('p', { class: 'htl-detail__record-summary' }, ['还没有记录'])
    );
  } else {
    for (const rec of records) {
      const recordHead = el('div', { class: 'htl-detail__record-head' }, [
        el('span', { class: 'htl-detail__record-date' }, [rec.date]),
        el(
          'button',
          {
            type: 'button',
            'data-action': 'edit-record',
            'data-id': rec.id,
          },
          ['编辑']
        ),
        el(
          'button',
          {
            type: 'button',
            'data-action': 'delete-record',
            'data-id': rec.id,
          },
          ['删除']
        ),
      ]);

      const recordChildren: (HTMLElement | string)[] = [
        recordHead,
        el('p', { class: 'htl-detail__record-summary' }, [rec.summary]),
      ];

      if (rec.detail && rec.detail.trim() !== '') {
        recordChildren.push(
          el('p', { class: 'htl-detail__record-detail' }, [rec.detail])
        );
      }

      const recordEl = el(
        'div',
        {
          class: 'htl-detail__record',
          'data-record-id': rec.id,
        },
        recordChildren
      );

      recordsContainer.appendChild(recordEl);
    }
  }
  bodyChildren.push(recordsContainer);

  // 2. Cover 封面配图（点击唤起大图灯箱）
  if (event.cover && event.cover.trim() !== '') {
    const coverEl = el('div', { class: 'htl-detail__cover' }, [
      el('img', {
        src: event.cover,
        'data-action': 'open-lightbox',
        'data-id': event.cover,
        alt: event.title,
      }),
    ]);
    bodyChildren.push(coverEl);
  }

  // 3. Links 外部链接列表
  if (Array.isArray(event.links) && event.links.length > 0) {
    const linkNodes = event.links.map((link) =>
      el(
        'a',
        {
          class: 'htl-chip',
          href: link.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        [link.name]
      )
    );
    const linksEl = el('div', { class: 'htl-detail__links' }, linkNodes);
    bodyChildren.push(linksEl);
  }

  // 4. Relations 关联列表（直接消费 view.relations 的 dir 与 spanText）
  if (Array.isArray(view.relations) && view.relations.length > 0) {
    const relationNodes = view.relations.map((rel) => {
      const dirSymbol =
        rel.dir === 'before' ? '←' : rel.dir === 'after' ? '→' : '↔';
      const textContent = `${dirSymbol} ${rel.date} ${rel.title} · ${rel.spanText}`;
      return el(
        'button',
        {
          type: 'button',
          class: 'htl-chip',
          'data-action': 'jump-relation',
          'data-id': rel.eventId,
        },
        [textContent]
      );
    });
    const relationsEl = el(
      'div',
      { class: 'htl-detail__relations' },
      relationNodes
    );
    bodyChildren.push(relationsEl);
  }

  // 5. Actions 操作区（增删改委托由全局 handler 捕获，不许自己处理）
  const actionsEl = el('div', { class: 'htl-detail__actions' }, [
    el(
      'button',
      {
        type: 'button',
        'data-action': 'add-record',
        'data-id': event.id,
      },
      ['+ 添加记录']
    ),
    el(
      'button',
      {
        type: 'button',
        'data-action': 'edit-event',
        'data-id': event.id,
      },
      ['编辑事件']
    ),
    el(
      'button',
      {
        type: 'button',
        'data-action': 'delete-event',
        'data-id': event.id,
      },
      ['删除事件']
    ),
  ]);
  bodyChildren.push(actionsEl);

  const bodyEl = el('div', { class: 'htl-detail__body' }, bodyChildren);

  const panelEl = el('div', { class: 'htl-detail__panel' }, [headEl, bodyEl]);

  panelEl.addEventListener('scroll', () => {
    lastPanelScrollTop = panelEl.scrollTop;
  });

  return panelEl;
}

export function openDetail(eventId: string, store: Store, origin?: OriginRect | null): void {
  // 收起动画还没放完就又开了新事件：立即收尾旧的，避免残留节点与滚动锁叠加
  if (closing && pendingCloseFinish) {
    pendingCloseFinish();
  }

  const state = store.getState();
  const view = getCardView(state, eventId);

  if (!view) {
    toast('事件不存在或已被删除', 'error');
    return;
  }

  currentEventId = eventId;
  currentStore = store;
  lastPanelScrollTop = 0;
  currentOrigin = origin ?? null;
  closing = false;

  // 若已打开浮层，直接复用浮层并就地重建 panel
  if (currentRoot && currentRoot.isConnected) {
    const oldPanel = currentRoot.querySelector<HTMLElement>('.htl-detail__panel');
    const newPanel = renderPanel(view);
    // 已打开时切换事件：就地替换内容，不重播展开动画
    newPanel.style.animation = 'none';
    if (oldPanel) {
      oldPanel.replaceWith(newPanel);
    } else {
      currentRoot.replaceChildren(newPanel);
    }
    newPanel.scrollTop = 0;
    return;
  }

  // 若未打开，构建浮层根节点并挂载到 #overlay-root
  const overlayRoot = getOverlayRoot();

  const modalEl = el('div', {
    class: 'htl-detail',
    'data-detail': '',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '事件详情',
  });

  const panel = renderPanel(view);
  modalEl.appendChild(panel);

  // 事件委托：遮罩（点击根浮层背景）与关闭按钮关闭浮层
  modalEl.addEventListener('click', (ev: MouseEvent) => {
    if (ev.target === modalEl) {
      closeDetail();
      return;
    }
    const target = ev.target as HTMLElement | null;
    const closeBtn = target?.closest<HTMLElement>('button[data-action="close-detail"]');
    if (closeBtn && modalEl.contains(closeBtn)) {
      closeDetail();
    }
  });

  currentRoot = modalEl;

  lockScroll();
  overlayRoot.appendChild(modalEl);
  // 从被点的那一行展开成浮层（无起点时退回 CSS 的 rise 动画）
  animateOpen(modalEl, panel, origin ?? null);
  // 压一条历史记录：手机上按返回先关浮层，而不是退出整个页面
  pushOverlayEntry();
}

export function closeDetail(): void {
  if (closing) {
    return;
  }
  if (!currentRoot && currentEventId === null) {
    return;
  }

  const root = currentRoot;
  const panel = root ? root.querySelector<HTMLElement>('.htl-detail__panel') : null;

  // 逻辑上先关闭：isDetailOpen 立即为 false，避免返回键 / 重复点击二次处理
  currentEventId = null;
  currentStore = null;
  lastPanelScrollTop = 0;

  // 立即解锁滚动并退历史栈：jump-relation 关闭后要马上能 scrollIntoView，
  // 且不能放进 finish，否则快速重开时提前收尾会重复 unlock / drop
  unlockScroll();
  dropOverlayEntry();

  const finish = () => {
    if (root && root.parentNode) {
      root.parentNode.removeChild(root);
    }
    if (currentRoot === root) {
      currentRoot = null;
    }
    pendingCloseFinish = null;
    closing = false;
  };
  pendingCloseFinish = finish;

  // 播放收起动画；不支持 / 减少动效时立即清理
  const animated = root && panel ? animateClose(root, panel, currentOrigin, finish) : false;
  if (animated) {
    closing = true;
  } else {
    finish();
  }
  currentOrigin = null;
}

export function refreshDetail(state: Readonly<AppState>): void {
  if (!isDetailOpen() || !currentEventId || !currentRoot) {
    return;
  }

  const view = getCardView(state, currentEventId);
  if (!view) {
    closeDetail();
    toast('事件不存在或已被删除', 'error');
    return;
  }

  const oldPanel = currentRoot.querySelector<HTMLElement>('.htl-detail__panel');
  const prevScrollTop = oldPanel ? oldPanel.scrollTop : lastPanelScrollTop;

  const newPanel = renderPanel(view);
  // 数据刷新（增删改记录）时不重播展开动画
  newPanel.style.animation = 'none';
  if (oldPanel) {
    oldPanel.replaceWith(newPanel);
  } else {
    currentRoot.replaceChildren(newPanel);
  }

  // 恢复 panel.scrollTop（夹到合法范围）
  if (newPanel.scrollHeight > 0 || newPanel.clientHeight > 0) {
    const maxScroll = Math.max(0, newPanel.scrollHeight - newPanel.clientHeight);
    const targetScroll = Math.min(Math.max(0, prevScrollTop), maxScroll);
    newPanel.scrollTop = targetScroll;
    lastPanelScrollTop = targetScroll;
  } else {
    newPanel.scrollTop = prevScrollTop;
    lastPanelScrollTop = prevScrollTop;
  }
}

export function isDetailOpen(): boolean {
  return currentEventId !== null && currentRoot !== null;
}
