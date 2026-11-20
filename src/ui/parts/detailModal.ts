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

export function openDetail(eventId: string, store: Store): void {
  const state = store.getState();
  const view = getCardView(state, eventId);

  if (!view) {
    toast('事件不存在或已被删除', 'error');
    return;
  }

  currentEventId = eventId;
  currentStore = store;
  lastPanelScrollTop = 0;

  // 若已打开浮层，直接复用浮层并就地重建 panel
  if (currentRoot && currentRoot.isConnected) {
    const oldPanel = currentRoot.querySelector<HTMLElement>('.htl-detail__panel');
    const newPanel = renderPanel(view);
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
  // 压一条历史记录：手机上按返回先关浮层，而不是退出整个页面
  pushOverlayEntry();
}

export function closeDetail(): void {
  if (!currentRoot && currentEventId === null) {
    return;
  }

  if (currentRoot) {
    if (currentRoot.parentNode) {
      currentRoot.parentNode.removeChild(currentRoot);
    }
    currentRoot = null;
  }

  currentEventId = null;
  currentStore = null;
  lastPanelScrollTop = 0;

  unlockScroll();
  dropOverlayEntry();
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
