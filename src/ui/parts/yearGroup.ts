/**
 * MOD-010: 年份分组与吸顶标题 (yearGroup.ts)
 * 负责渲染每个年份的分组容器、吸顶标题与该年份下的卡片。
 * 严禁使用 innerHTML、严禁自行做业务计算、严禁在此处绑定事件。
 */

import { el } from '../dom';
import type { YearGroup } from '../../core/select';
import { renderCard } from './card';

export function renderYearGroup(
  group: YearGroup,
  expandedIds?: ReadonlySet<string> | ((id: string) => boolean)
): HTMLElement {
  const isExpanded =
    typeof expandedIds === 'function'
      ? expandedIds
      : (id: string) => Boolean(expandedIds?.has(id));

  const groupEl = el('section', {
    class: 'htl-year-group',
    'data-year': group.year,
  });

  const headingText = group.year ? `${group.year} 年` : '未知年份';
  const headingEl = el(
    'h2',
    {
      class: 'htl-year-heading',
      id: `year-${group.year}`,
      'data-year': group.year,
      'data-focus-key': `year.${group.year}`,
      tabindex: '-1',
    },
    [headingText]
  );
  groupEl.appendChild(headingEl);

  const renderCardsInto = (host: HTMLElement, cards: typeof group.cards): void => {
    for (const cardView of cards) {
      const expanded = isExpanded(cardView.event.id);
      host.appendChild(renderCard(cardView, expanded));
    }
  };

  const months = Array.isArray(group.months) && group.months.length > 0 ? group.months : null;

  if (!months) {
    // 兼容：调用方只给了扁平 cards（无月份信息）
    renderCardsInto(groupEl, group.cards);
    return groupEl;
  }

  // 二级时间轴：年份 → 月份 → 卡片
  for (const monthGroup of months) {
    const monthLabel = monthGroup.month ? `${Number(monthGroup.month)} 月` : '未知月份';
    const monthEl = el('section', {
      class: 'htl-month-group',
      'data-month': monthGroup.month,
      'data-year': group.year,
    });
    monthEl.appendChild(
      el(
        'h3',
        {
          class: 'htl-month-heading',
          id: `month-${group.year}-${monthGroup.month}`,
          'data-year': group.year,
          'data-month': monthGroup.month,
          'data-focus-key': `month.${group.year}.${monthGroup.month}`,
          tabindex: '-1',
        },
        [monthLabel]
      )
    );
    renderCardsInto(monthEl, monthGroup.cards);
    groupEl.appendChild(monthEl);
  }

  return groupEl;
}
