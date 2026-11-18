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

  for (const cardView of group.cards) {
    const expanded = isExpanded(cardView.event.id);
    const cardEl = renderCard(cardView, expanded);
    groupEl.appendChild(cardEl);
  }

  return groupEl;
}
