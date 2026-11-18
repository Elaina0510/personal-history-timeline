/**
 * MOD-013: 筛选条 (filterBar.ts)
 * 职责：分类 chips、星级按钮、搜索框（300ms 防抖）、清空筛选、排序切换。
 *
 * 禁令：
 * - 不做匹配计算（matchFilters 在 core/select）
 * - 不在防抖回调里手动重建卡片列表
 * - 防抖回调里只改 state，不直接动 DOM
 */

import { el } from '../dom';
import type { AppState, Rating, SortOrder } from '../../core/types';
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

export function toggleCategory(category: string): void {
  const current = latestState?.view.filters.categories ?? [];
  let next: string[];
  if (current.includes(category)) {
    next = current.filter((c) => c !== category);
  } else {
    next = [...current, category];
  }
  const store = getStore();
  if (store) {
    store.setFilters({ categories: next });
  }
}

export function toggleRating(rating: Rating): void {
  const current = latestState?.view.filters.ratings ?? [];
  let next: Rating[];
  if (current.includes(rating)) {
    next = current.filter((r) => r !== rating);
  } else {
    next = [...current, rating];
  }
  const store = getStore();
  if (store) {
    // 选中等值星级时关闭「>=4星」快捷项
    store.setFilters({ ratings: next, minFour: false });
  }
}

export function toggleMinFour(): void {
  const isMinFour = Boolean(latestState?.view.filters.minFour);
  const store = getStore();
  if (store) {
    if (!isMinFour) {
      // 选中「>=4星」时清空等值选择
      store.setFilters({ minFour: true, ratings: [] });
    } else {
      store.setFilters({ minFour: false });
    }
  }
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
    case 'toggle-filter-category':
      if (id) toggleCategory(id);
      break;
    case 'toggle-filter-rating':
      if (id === 'min-four' || id === 'minFour' || id === '>=4') {
        toggleMinFour();
      } else if (id) {
        const ratingNum = parseInt(id, 10);
        if (ratingNum >= 1 && ratingNum <= 5) {
          toggleRating(ratingNum as Rating);
        }
      }
      break;
    case 'toggle-filter-min-four':
      toggleMinFour();
      break;
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

  // 2. 分类 chips
  const categories = state.data.categories ?? [];
  const selectedCategories = state.view.filters.categories ?? [];
  const catChips: HTMLElement[] = categories.map((cat, idx) => {
    const isSelected = selectedCategories.includes(cat);
    const catSlot = (idx % 6) + 1;
    const chipClass = isSelected
      ? `htl-chip htl-chip--cat-${catSlot} htl-chip--active`
      : `htl-chip htl-chip--cat-${catSlot}`;

    return el(
      'button',
      {
        type: 'button',
        class: chipClass,
        'data-action': 'toggle-filter-category',
        'data-id': cat,
        'data-category': cat,
        'aria-pressed': isSelected ? 'true' : 'false',
      },
      [cat]
    );
  });

  const catContainer = el(
    'div',
    {
      class: 'htl-filter-categories',
      style: 'display: flex; flex-wrap: wrap; gap: var(--htl-space-1, 4px); align-items: center;',
    },
    catChips
  );

  // 3. 星级快捷与等值多选
  const isMinFour = Boolean(state.view.filters.minFour);
  const selectedRatings = state.view.filters.ratings ?? [];

  const minFourBtn = el(
    'button',
    {
      type: 'button',
      class: isMinFour ? 'htl-chip htl-chip--active' : 'htl-chip',
      'data-action': 'toggle-filter-rating',
      'data-id': 'min-four',
      'data-min-four': 'true',
      'aria-pressed': isMinFour ? 'true' : 'false',
      title: '4 星及以上（选中时清空等值选择）',
    },
    ['≥4 星']
  );

  const starBtns: HTMLElement[] = [minFourBtn];
  for (let star = 1; star <= 5; star++) {
    const isStarActive = !isMinFour && selectedRatings.includes(star as Rating);
    const starBtn = el(
      'button',
      {
        type: 'button',
        class: isStarActive ? 'htl-chip htl-chip--active' : 'htl-chip',
        'data-action': 'toggle-filter-rating',
        'data-id': String(star),
        'aria-pressed': isStarActive ? 'true' : 'false',
        'aria-label': `${star} 星`,
      },
      [`${star}★`]
    );
    starBtns.push(starBtn);
  }

  const ratingContainer = el(
    'div',
    {
      class: 'htl-filter-ratings',
      style: 'display: flex; flex-wrap: wrap; gap: var(--htl-space-1, 4px); align-items: center;',
    },
    starBtns
  );

  // 4. 操作项：排序切换与清空筛选
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

  container.replaceChildren(searchInput, catContainer, ratingContainer, actionsContainer);
}

// 自动向 UI 渲染主流程注册
registerFilterBarRenderer(renderFilterBar);
if (typeof window !== 'undefined') {
  (window as unknown as { __htl_renderFilterBar?: typeof renderFilterBar }).__htl_renderFilterBar = renderFilterBar;
}
