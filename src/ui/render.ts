/**
 * MOD-010: UI 渲染主函数 (render.ts)
 * 负责读 AppState 全量重建 #timeline-root，并在重绘前后进行焦点与滚动位置恢复。
 * 严禁使用 innerHTML、严禁自行做业务计算、严禁在此处绑定事件。
 */

import type { AppState } from '../core/types';
import { FLASH_DURATION_MS } from '../core/types';
import type { YearGroup } from '../core/select';
import { buildCards } from '../core/select';
import { el } from './dom';
import { renderYearGroup } from './parts/yearGroup';

export { renderEntry } from './parts/entry';
export { renderYearGroup } from './parts/yearGroup';

export type FilterBarRenderer = (state: Readonly<AppState>) => void;
export type YearNavRenderer = (state: Readonly<AppState>, groups: YearGroup[]) => void;

let filterBarRenderer: FilterBarRenderer | null = null;
let yearNavRenderer: YearNavRenderer | null = null;

export function registerFilterBarRenderer(fn: FilterBarRenderer | null): void {
  filterBarRenderer = fn;
}

export function registerYearNavRenderer(fn: YearNavRenderer | null): void {
  yearNavRenderer = fn;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

function escapeCss(val: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(val);
  }
  return val.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function render(state: AppState): void {
  // 1. 重绘前记录活动控件焦点、选区与滚动位置（§2.3、§6.4）
  const activeEl = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const focusKey = activeEl?.dataset?.focusKey ?? null;
  let selStart: number | null = null;
  let selEnd: number | null = null;

  if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
    try {
      selStart = activeEl.selectionStart;
      selEnd = activeEl.selectionEnd;
    } catch {
      // 某些特殊 input 类型可能不支持 selectionStart
    }
  }

  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;

  // 2. 读 AppState，由 core/select.buildCards 完成筛选与排序分组（严禁自算）
  const groups = buildCards(state.data.events, state.view.filters, state.view.sortOrder);

  // 3. 全量重建 #timeline-root
  const root = document.getElementById('timeline-root');
  if (!root) {
    return;
  }

  // 确保根容器具有时间轴样式类
  if (!root.classList.contains('htl-timeline')) {
    root.classList.add('htl-timeline');
  }

  // 空态与内容重建
  if (state.data.events.length === 0) {
    // 全站 0 条：「还没有任何记录，写下第一条吧」+ 新建按钮
    const emptyContainer = el(
      'div',
      {
        style: 'text-align: center; padding: 48px 16px; color: var(--htl-color-text-muted, #64748b);',
        'data-testid': 'empty-all',
      },
      [
        el('p', { style: 'font-size: 16px; margin-bottom: 16px;' }, [
          '还没有任何记录，写下第一条吧',
        ]),
        el(
          'button',
          {
            type: 'button',
            'data-action': 'new-event',
            style: 'padding: 8px 16px;',
          },
          ['写下第一条']
        ),
      ]
    );
    root.replaceChildren(emptyContainer);
  } else if (groups.length === 0) {
    // 筛选后 0 条：「没有符合条件的事件」+ 清空筛选按钮
    const emptyContainer = el(
      'div',
      {
        style: 'text-align: center; padding: 48px 16px; color: var(--htl-color-text-muted, #64748b);',
        'data-testid': 'empty-filtered',
      },
      [
        el('p', { style: 'font-size: 16px; margin-bottom: 16px;' }, [
          '没有符合条件的事件',
        ]),
        el(
          'button',
          {
            type: 'button',
            'data-action': 'clear-filters',
            style: 'padding: 8px 16px;',
          },
          ['清空筛选']
        ),
      ]
    );
    root.replaceChildren(emptyContainer);
  } else {
    // 渲染各年份分组
    const flat = groups.flatMap(g =>
      Array.isArray(g.months) && g.months.length > 0
        ? g.months.flatMap(m => m.cards)
        : g.cards
    );
    const seqOf = new Map<string, number>();
    flat.forEach((v, i) => seqOf.set(v.event.id, i));
    const groupElements = groups.map(g => renderYearGroup(g, seqOf));
    root.replaceChildren(...groupElements);
  }

  // 4. 调用筛选栏与年份导航子渲染器（若已注册）
  if (filterBarRenderer) {
    try {
      filterBarRenderer(state);
    } catch {
      // 容错
    }
  } else if (
    typeof (window as unknown as { __htl_renderFilterBar?: FilterBarRenderer }).__htl_renderFilterBar === 'function'
  ) {
    try {
      (window as unknown as { __htl_renderFilterBar: FilterBarRenderer }).__htl_renderFilterBar(state);
    } catch {
      // 容错
    }
  }

  if (yearNavRenderer) {
    try {
      yearNavRenderer(state, groups);
    } catch {
      // 容错
    }
  } else if (
    typeof (window as unknown as { __htl_renderYearNav?: YearNavRenderer }).__htl_renderYearNav === 'function'
  ) {
    try {
      (window as unknown as { __htl_renderYearNav: YearNavRenderer }).__htl_renderYearNav(state, groups);
    } catch {
      // 容错
    }
  }

  // 5. 恢复焦点与选区（§2.3、§6.4）
  if (focusKey) {
    try {
      const elToFocus = document.querySelector(`[data-focus-key="${escapeCss(focusKey)}"]`) as HTMLElement | null;
      if (elToFocus) {
        elToFocus.focus();
        if (
          (elToFocus instanceof HTMLInputElement || elToFocus instanceof HTMLTextAreaElement) &&
          selStart !== null &&
          selEnd !== null
        ) {
          try {
            elToFocus.setSelectionRange(selStart, selEnd);
          } catch {
            // 忽略不支持选区的元素异常
          }
        }
      }
    } catch {
      // 忽略选择器异常
    }
  }

  // 6. 恢复滚动位置
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    try {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    } catch {
      // 部分环境不支持 instant 选项
      window.scrollTo(0, scrollY);
    }
  }

  // 7. 应用 flashId 高亮并在 FLASH_DURATION_MS 后移除（§6.4）
  if (state.view.flashId) {
    if (flashTimer !== null) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }

    try {
      const escapedId = escapeCss(state.view.flashId);
      const targetCard = root.querySelector(
        `[data-event-id="${escapedId}"], [data-id="${escapedId}"]`
      ) as HTMLElement | null;

      if (targetCard) {
        targetCard.classList.add('is-flash');
        flashTimer = setTimeout(() => {
          targetCard.classList.remove('is-flash');
          flashTimer = null;
        }, FLASH_DURATION_MS);
      }
    } catch {
      // 忽略异常
    }
  }
}
