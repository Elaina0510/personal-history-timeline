/**
 * MOD-010: 事件条目行渲染 (entry.ts) — v0.0.3 行式档案布局
 *
 * 一行 = 日期 / 竖轴 / 标题 + 元信息 / 序号，四列对齐同一套细线网格。
 * 严禁使用 innerHTML、严禁自行做业务计算、严禁在此处绑定事件。
 */

import { el } from '../dom';
import type { CardView } from '../../core/select';

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function renderEntry(view: CardView, seq: number): HTMLElement {
  const event = view.event;
  const rating = view.latestRecord?.rating ?? 0;

  const dateEl = el('span', { class: 'htl-row__date' }, [event.date]);

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

  const ratingEl = el(
    'span',
    { class: 'htl-entry__rating', title: rating > 0 ? `${rating} 星` : '暂无记录' },
    [rating > 0 ? '★'.repeat(rating) : '—']
  );
  const recsEl = el('span', { class: 'htl-entry__recs' }, [`${pad(view.recordCount, 2)} REC`]);
  const metaEl = el('p', { class: 'htl-entry__meta' }, [ratingEl, recsEl]);

  const entryEl = el('div', { class: 'htl-entry' }, [titleBtn, metaEl]);

  const nodeEl = el('span', { class: 'htl-node', 'aria-hidden': 'true' });
  const railEl = el('span', { class: 'htl-row__rail', 'aria-hidden': 'true' }, [nodeEl]);

  const indexEl = el('span', { class: 'htl-row__index' }, [pad(seq + 1, 3)]);

  return el(
    'div',
    {
      class: 'htl-row',
      'data-event-id': event.id,
      'data-seq': String(seq),
    },
    [dateEl, railEl, entryEl, indexEl]
  );
}
