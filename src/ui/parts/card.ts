/**
 * MOD-010: 卡片渲染 (card.ts)
 * 负责折叠态与展开态卡片 DOM 生成。
 * 折叠态固定展示六项：发生日期、分类 chip、最新记录星级、标题、最新记录简评、记录数 / 关联数。
 * 展开态按 sortedRecords() 列出全部记录、配图（点击开灯箱）、外链、关联 chip、操作区。
 * 严禁使用 innerHTML、严禁自行计算业务派生数据、严禁在此处绑定事件。
 */

import { el } from '../dom';
import type { CardView } from '../../core/select';
import { sortedRecords } from '../../core/select';

export function renderCard(view: CardView, expanded: boolean): HTMLElement {
  const event = view.event;
  const isExpandable = view.expandable;

  const cardAttrs: Record<string, string | number | boolean | undefined> = {
    class: expanded ? 'htl-card htl-card--expanded' : 'htl-card',
    'data-id': event.id,
    'data-event-id': event.id,
  };

  if (isExpandable) {
    cardAttrs['data-expandable'] = 'true';
    if (!expanded) {
      // 折叠态下整卡可点击触发展开
      cardAttrs['data-action'] = 'toggle-card';
      cardAttrs['role'] = 'button';
      cardAttrs['tabindex'] = '0';
      cardAttrs['aria-expanded'] = 'false';
    }
  }

  const card = el('article', cardAttrs);

  // 横向主轴上的事件节点（视觉元素，不参与交互）
  card.appendChild(el('span', { class: 'htl-card__node', 'aria-hidden': 'true' }));

  // 1. 顶部第一行：日期、分类 chip、星级、展开箭头（可选）
  const topRowChildren: (Node | string)[] = [];

  // (1) 发生日期
  topRowChildren.push(
    el('span', { class: 'htl-card__date' }, [event.date])
  );

  // (2) 分类 chip
  topRowChildren.push(
    el('span', { class: 'htl-chip' }, [event.category])
  );

  // (3) 最新记录星级（REQ-005）
  if (view.latestRecord) {
    const rating = view.latestRecord.rating;
    const starText = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    topRowChildren.push(
      el(
        'span',
        {
          class: 'htl-star',
          'aria-label': `${rating} 星`,
          title: `${rating} 星`,
        },
        [starText]
      )
    );
  } else {
    // 无记录显示「暂无记录」，不得显示 0 星
    topRowChildren.push(
      el('span', { class: 'htl-card__date', 'aria-label': '暂无记录' }, ['暂无记录'])
    );
  }

  // (4) 展开箭头：只有可展开时才渲染箭头（REQ-014）
  if (isExpandable) {
    const toggleButton = el(
      'button',
      {
        type: 'button',
        'data-action': 'toggle-card',
        'data-id': event.id,
        'data-focus-key': `card.${event.id}.toggle`,
        'aria-expanded': expanded ? 'true' : 'false',
        'aria-label': expanded ? '折叠卡片' : '展开卡片',
        style: 'margin-left: auto; background: none; border: none; padding: 0 4px; font-size: 12px; cursor: pointer;',
      },
      [expanded ? '▲' : '▼']
    );
    topRowChildren.push(toggleButton);
  }

  const header = el(
    'div',
    {
      style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;',
      // 展开态下点顶部行也可折叠
      ...(expanded && isExpandable
        ? {
            'data-action': 'toggle-card',
            'data-id': event.id,
            style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;',
          }
        : {}),
    },
    topRowChildren
  );
  card.appendChild(header);

  // (4) 标题
  const titleEl = el('h3', { class: 'htl-card__title' }, [event.title]);
  card.appendChild(titleEl);

  // (5) 最新记录简评（若无记录则显示「暂无记录」）
  const summaryText = view.latestRecord ? view.latestRecord.summary : '—';
  const summaryEl = el('div', { class: 'htl-card__summary' }, [summaryText]);
  card.appendChild(summaryEl);

  // (6) 记录数 / 关联数
  const metaText = `${view.recordCount} 记录 / ${view.relationCount} 关联`;
  const metaEl = el(
    'div',
    {
      class: 'htl-card__meta',
      'data-record-count': view.recordCount,
      'data-relation-count': view.relationCount,
    },
    [metaText]
  );
  card.appendChild(metaEl);

  // 折叠态必须且只能展示上述六项，不得出现碎碎念正文、配图、外链
  if (!expanded) {
    return card;
  }

  // -------------------------------------------------------------------------
  // 展开态（REQ-014）
  // -------------------------------------------------------------------------

  // 1. 全部记录列表（按 sortedRecords 升序排列）
  const records = sortedRecords(event);
  if (records.length > 0) {
    const recordsContainer = el('div', { class: 'htl-card__records' });
    for (const rec of records) {
      const recItem = el('div', {
        class: 'htl-card__record',
        'data-record-id': rec.id,
      });

      // 记录头：日期 + 星级 + 记录操作（编辑/删除/新增）
      const starText = '★'.repeat(rec.rating) + '☆'.repeat(5 - rec.rating);
      const recHeader = el(
        'div',
        { style: 'display: flex; align-items: center; gap: 8px;' },
        [
          el('span', { class: 'htl-card__date' }, [rec.date]),
          el('span', { class: 'htl-star', 'aria-label': `${rec.rating} 星` }, [starText]),
          el('div', { style: 'margin-left: auto; display: flex; gap: 4px;' }, [
            el(
              'button',
              {
                type: 'button',
                'data-action': 'add-record',
                'data-id': event.id,
                'aria-label': '新增记录',
                style: 'padding: 2px 6px; font-size: 12px;',
              },
              ['新增']
            ),
            el(
              'button',
              {
                type: 'button',
                'data-action': 'edit-record',
                'data-id': rec.id,
                'aria-label': '编辑记录',
                style: 'padding: 2px 6px; font-size: 12px;',
              },
              ['编辑']
            ),
            el(
              'button',
              {
                type: 'button',
                'data-action': 'delete-record',
                'data-id': rec.id,
                'aria-label': '删除记录',
                style: 'padding: 2px 6px; font-size: 12px;',
              },
              ['删除']
            ),
          ]),
        ]
      );
      recItem.appendChild(recHeader);

      // 记录简评
      recItem.appendChild(
        el('div', { class: 'htl-card__summary', style: 'margin-top: 4px;' }, [rec.summary])
      );

      // 碎碎念正文（若有）
      if (rec.detail && rec.detail.trim() !== '') {
        recItem.appendChild(
          el('div', { class: 'htl-card__record-detail' }, [rec.detail])
        );
      }

      recordsContainer.appendChild(recItem);
    }
    card.appendChild(recordsContainer);
  }

  // 2. 封面配图（点击 → openLightbox）
  if (event.cover && event.cover.trim() !== '') {
    const coverContainer = el('div', { class: 'htl-card__cover' });
    const coverImg = el('img', {
      src: event.cover,
      alt: event.title,
      'data-action': 'open-lightbox',
      'data-id': event.cover,
      'aria-label': `查看大图：${event.title}`,
    });
    coverContainer.appendChild(coverImg);
    card.appendChild(coverContainer);
  }

  // 3. 外链列表（rel="noopener noreferrer"）
  if (Array.isArray(event.links) && event.links.length > 0) {
    const linksContainer = el('div', { class: 'htl-card__links' });
    for (const link of event.links) {
      const linkEl = el(
        'a',
        {
          href: link.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'htl-chip',
        },
        [link.name]
      );
      linksContainer.appendChild(linkEl);
    }
    card.appendChild(linksContainer);
  }

  // 4. 关联区（chip 含日期+标题+方向+跨度，点击 → jump-relation）
  if (Array.isArray(view.relations) && view.relations.length > 0) {
    const relationsContainer = el('div', { class: 'htl-card__relations' });
    for (const rel of view.relations) {
      const dirSymbol = rel.dir === 'before' ? '←' : rel.dir === 'after' ? '→' : '↔';
      const chipText = `${dirSymbol} ${rel.date} ${rel.title} · ${rel.spanText}`;
      const relChip = el(
        'button',
        {
          type: 'button',
          class: 'htl-chip',
          'data-action': 'jump-relation',
          'data-id': rel.eventId,
          'aria-label': `跳转到关联事件：${rel.title}`,
        },
        [chipText]
      );
      relationsContainer.appendChild(relChip);
    }
    card.appendChild(relationsContainer);
  }

  // 5. 操作区（编辑/删除事件、每条记录旁的新增/编辑/删除）
  const actionsContainer = el('div', { class: 'htl-card__actions' }, [
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
  card.appendChild(actionsContainer);

  return card;
}
