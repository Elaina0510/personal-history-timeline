/**
 * MOD-010: 事件条目渲染 (entry.ts)
 *
 * 三列结构：条目格（左/右交替）+ 轴格（节点）。轴在正中，节点在轴列内左右交替偏移，
 * 折线因此必然成 zigzag，不会是一条死直线。
 * 严禁使用 innerHTML、严禁自行做业务计算、严禁在此处绑定事件。
 */

import { el } from '../dom';
import type { CardView } from '../../core/select';

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

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

  const recsEl = el('span', { class: 'htl-entry__recs' }, [`${pad(view.recordCount, 2)} REC`]);
  const metaEl = el('p', { class: 'htl-entry__meta' }, [recsEl]);

  const entryEl = el('div', { class: 'htl-entry' }, [dateEl, titleBtn, metaEl]);
  const entryCell = el('div', { class: 'htl-cell--entry' }, [entryEl]);

  const nodeEl = el('span', { class: 'htl-node', 'aria-hidden': 'true' });
  const axisCell = el('div', { class: 'htl-cell--axis' }, [nodeEl]);

  // 摆幅按序号轮换，折线不是等幅锯齿
  const ampClass =
    seq % 3 === 0 ? 'is-amp-wide' : seq % 3 === 1 ? 'is-amp-mid' : 'is-amp-tight';

  return el(
    'div',
    {
      class: `htl-row ${sideClass} ${ampClass}`,
      'data-event-id': event.id,
      'data-seq': String(seq),
    },
    [entryCell, axisCell]
  );
}
