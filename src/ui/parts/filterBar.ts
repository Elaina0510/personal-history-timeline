/**
 * MOD-013: 筛选条 (filterBar.ts)
 * 职责：搜索框（300ms 防抖）、清空筛选、排序切换。星级评分已从界面移除。
 *
 * 禁令：
 * - 不做匹配计算（matchFilters 在 core/select）
 * - 不在防抖回调里手动重建卡片列表
 * - 防抖回调里只改 state，不直接动 DOM
 */

import { el } from '../dom';
import type { AppState, SortOrder } from '../../core/types';
import { SEARCH_DEBOUNCE_MS } from '../../core/types';
import type { Store } from '../../core/store';
import { registerFilterBarRenderer } from '../render';

let currentStore: Store | null = null;
let latestState: AppState | null = null;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let filterBarClickListenerBound = false;

export function setStore(store: Store): void {
  currentStore = store;
}

export function getStore(): Store | null {
  if (currentStore) return currentStore;
  if (typeof window !== 'undefined' && (window as unknown as { __htl_store?: Store }).__htl_store) {
    return (window as unknown as { __htl_store: Store }).__htl_store;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as unknown as { __htl_store?: Store }).__htl_store) {
    return (globalThis as unknown as { __htl_store: Store }).__htl_store;
  }
  return null;
}

export function onKeywordInput(keyword: string): void {
  if (searchDebounceTimer !== null) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }

  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    const store = getStore();
    if (store) {
      store.setFilters({ keyword });
    }
  }, SEARCH_DEBOUNCE_MS);
}

export function clearFilters(): void {
  if (searchDebounceTimer !== null) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  const store = getStore();
  if (store) {
    store.clearFilters();
  }
}

export function toggleSort(): void {
  const current = latestState?.view.sortOrder ?? 'desc';
  const next: SortOrder = current === 'desc' ? 'asc' : 'desc';
  const store = getStore();
  if (store) {
    store.setSortOrder(next);
  }
}

export function handleFilterAction(action: string, id?: string, ev?: Event): void {
  if (ev) {
    if ((ev as unknown as { __htl_filter_handled?: boolean }).__htl_filter_handled) {
      return;
    }
    (ev as unknown as { __htl_filter_handled: boolean }).__htl_filter_handled = true;
  }

  switch (action) {
    case 'clear-filters':
      clearFilters();
      break;
    case 'toggle-sort':
      toggleSort();
      break;
    case 'search-input':
      if (ev && ev.target instanceof HTMLInputElement) {
        onKeywordInput(ev.target.value);
      }
      break;
  }
}

function ensureFilterBarClickListener(container: HTMLElement): void {
  if (filterBarClickListenerBound) return;
  filterBarClickListenerBound = true;

  container.addEventListener('click', (ev: MouseEvent) => {
    const target = ev.target as Node | null;
    const element = target instanceof Element ? target : target?.parentElement;
    const actionEl = element?.closest('[data-action]');
    if (!actionEl || !container.contains(actionEl)) return;

    const action = actionEl.getAttribute('data-action');
    const id = actionEl.getAttribute('data-id') ?? undefined;
    if (action) {
      handleFilterAction(action, id, ev);
    }
  });
}

export function renderFilterBar(state: AppState): void {
  latestState = state;
  if ((state as unknown as { __store?: Store }).__store) {
    currentStore = (state as unknown as { __store: Store }).__store;
  } else if ((state as unknown as { store?: Store }).store) {
    currentStore = (state as unknown as { store: Store }).store;
  }

  const container = document.getElementById('filter-bar');
  if (!container) {
    return;
  }

  if (!container.classList.contains('htl-filter-bar')) {
    container.classList.add('htl-filter-bar');
  }

  ensureFilterBarClickListener(container);

  // 1. 搜索框
  const searchInput = el('input', {
    type: 'search',
    class: 'htl-filter-search',
    placeholder: '搜索事件、简评或碎碎念...',
    value: state.view.filters.keyword ?? '',
    'data-focus-key': 'filter.keyword',
    'data-action': 'search-input',
    'aria-label': '搜索关键词',
    style: 'min-width: 180px; flex: 1 1 180px;',
  });

  searchInput.addEventListener('input', (ev: Event) => {
    const keyword = (ev.target as HTMLInputElement).value;
    onKeywordInput(keyword);
  });

  // 2. 操作项：排序切换与清空筛选
  const sortOrder = state.view.sortOrder ?? 'desc';
  const sortLabel = sortOrder === 'desc' ? '降序 (新→旧)' : '正序 (旧→新)';
  const sortBtn = el(
    'button',
    {
      type: 'button',
      class: 'htl-chip',
      'data-action': 'toggle-sort',
      'data-id': sortOrder,
      'aria-label': `切换排序，当前：${sortLabel}`,
    },
    [sortLabel]
  );

  const clearBtn = el(
    'button',
    {
      type: 'button',
      class: 'htl-chip',
      'data-action': 'clear-filters',
      'aria-label': '清空筛选',
    },
    ['清空筛选']
  );

  const actionsContainer = el(
    'div',
    {
      class: 'htl-filter-actions',
      style: 'display: flex; gap: var(--htl-space-2, 8px); align-items: center; margin-left: auto;',
    },
    [sortBtn, clearBtn]
  );

  container.replaceChildren(searchInput, actionsContainer);
}

// 自动向 UI 渲染主流程注册
registerFilterBarRenderer(renderFilterBar);
if (typeof window !== 'undefined') {
  (window as unknown as { __htl_renderFilterBar?: typeof renderFilterBar }).__htl_renderFilterBar = renderFilterBar;
}
