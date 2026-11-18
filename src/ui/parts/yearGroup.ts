/**
 * MOD-010: 年份分组与吸顶标题 (yearGroup.ts)
 * 负责渲染每个年份的分组容器、吸顶标题与该年份下的卡片。
 * 严禁使用 innerHTML、严禁自行做业务计算、严禁在此处绑定事件。
 */

import { el } from '../dom';
import type { YearGroup } from '../../core/select';
import { renderCard } from './card';

/** 稳定的小哈希：同一事件每次重绘得到同样的“无规则”位置 */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

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
  // 轴上年份节点（脉动）
  groupEl.appendChild(
    el('span', { class: 'htl-axis-node htl-axis-node--year', 'aria-hidden': 'true' })
  );

  const renderCardsInto = (host: HTMLElement, cards: typeof group.cards): void => {
    for (const cardView of cards) {
      const expanded = isExpanded(cardView.event.id);
      // 无规则排布：用事件 id 算稳定的伪随机，决定挂上方还是下方、离轴多远、左右留多少
      const sig = hashString(`${cardView.event.id}|${cardView.event.date}|${cardView.event.title}`);
      const isUp = sig % 2 === 0;
      const lift = 26 + (sig % 7) * 9; // 26..80px 离轴距离
      const gap = 18 + ((sig >> 3) % 5) * 10; // 18..58px 左右间距
      const slot = el('div', {
        class: `htl-slot ${isUp ? 'is-up' : 'is-down'}`,
        style: `--lift: ${lift}px; --gap: ${gap}px;`,
      });
      slot.appendChild(renderCard(cardView, expanded));
      host.appendChild(slot);
    }
  };

  const months = Array.isArray(group.months) && group.months.length > 0 ? group.months : null;

  if (!months) {
    // 兼容：调用方只给了扁平 cards（无月份信息）
    renderCardsInto(groupEl, group.cards);
    return groupEl;
  }

  // 二级时间轴：年份 → 月份 → 卡片
  for (const [monthIndex, monthGroup] of months.entries()) {
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
    monthEl.appendChild(
      el('span', {
        class: 'htl-axis-node htl-axis-node--month',
        'aria-hidden': 'true',
        style: `--i: ${monthIndex}`,
      })
    );
    renderCardsInto(monthEl, monthGroup.cards);
    groupEl.appendChild(monthEl);
  }

  return groupEl;
}
