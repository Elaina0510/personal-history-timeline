/**
 * MOD-010: 事件条目行渲染 (entry.ts)
 * 渲染单条事件在竖向主轴上的整行布局。
 * 行结构由「条目格 (.htl-cell--entry)」与「轴格 (.htl-cell--axis)」构成，左右侧由 side 决定。
 * 严禁使用 innerHTML、严禁自行做业务计算、严禁在此处绑定事件。
 */

import { el } from '../dom';
import type { CardView } from '../../core/select';

export function renderEntry(
  view: CardView,
  seq: number,
  side: 'left' | 'right'
): HTMLElement {
  const event = view.event;
  const sideClass = side === 'right' ? 'is-right' : 'is-left';

  const dateEl = el('span', { class: 'htl-entry__date' }, [event.date]);
  const titleBtn = el(
    'button',
    {
      type: 'button',
      class: 'htl-entry__title',
      'data-action': 'open-detail',
      'data-id': event.id,
      'data-focus-key': `entry.${event.id}`,
    },
    [event.title]
  );

  const entryEl = el('article', { class: 'htl-entry' }, [dateEl, titleBtn]);
  const entryCell = el('div', { class: 'htl-cell--entry' }, [entryEl]);

  const nodeEl = el('span', { class: 'htl-node', 'aria-hidden': 'true' });
  const linkEl = el('span', { class: 'htl-link', 'aria-hidden': 'true' });
  const axisCell = el('div', { class: 'htl-cell--axis' }, [nodeEl, linkEl]);

  const rowEl = el(
    'div',
    {
      class: `htl-row ${sideClass}`,
      'data-event-id': event.id,
      'data-seq': String(seq),
    },
    [entryCell, axisCell]
  );

  return rowEl;
}
