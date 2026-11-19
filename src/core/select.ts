/**
 * MOD-006: 排序、筛选、关键词搜索、年份分组、反向关联索引与卡片展示派生数据
 * Traces to: REQ-012 [P0]、REQ-013 [P0]、REQ-014 [P0]、REQ-015 [P0]、REQ-016 [P1]、REQ-019 [P0]
 * Non-Goals: 不产生 DOM、不做高亮、不做分页、不原地修改入参数组。
 * SSOT: 拥有「最新记录」判定、事件排序比较器、筛选谓词、关联合并去重规则。
 */

import { spanText } from './date';
import type {
  FilterState,
  PersonalRecord,
  SortOrder,
  TimelineEvent,
} from './types';

export interface RelationView {
  eventId: string;
  date: string;
  title: string;
  dir: 'before' | 'after' | 'same';
  spanText: string;
}

export interface CardView {
  event: TimelineEvent;
  latestRecord: PersonalRecord | null; // null = 「暂无记录」
  visible: boolean;
  relations: RelationView[];
  relationCount: number;
  recordCount: number;
}

export interface MonthGroup {
  /** '01'..'12'；空串表示该事件日期缺失 */
  month: string;
  cards: CardView[];
}

export interface YearGroup {
  year: string;
  /** v0.0.2 起：年内按月再分一层，月份小节顺序随年组内排序方向 */
  months: MonthGroup[];
  /** 该年全部卡片（扁平视图，供年份导航与既有调用方使用） */
  cards: CardView[];
}

/**
 * 记录升序三元组比较：(date, createdAt, id)
 */
function compareRecordsAsc(a: PersonalRecord, b: PersonalRecord): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

/**
 * 返回按 (date, createdAt, id) 升序排序的记录副本（不修改入参）
 */
export function sortedRecords(e: TimelineEvent): PersonalRecord[] {
  if (!e.records || e.records.length === 0) {
    return [];
  }
  return [...e.records].sort(compareRecordsAsc);
}

/**
 * 最新记录：三元组 (date, createdAt, id) 字典序最大者。同日多条时后创建的胜出（REQ-005）
 * 无记录返回 null
 */
export function latestRecord(e: TimelineEvent): PersonalRecord | null {
  const records = sortedRecords(e);
  return records.length > 0 ? records[records.length - 1]! : null;
}

/**
 * 事件排序：(date, createdAt, id) 升序比较器（与方向无关的升序比较）
 */
export function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

/**
 * 获取按指定方向的事件比较器
 * order='desc' 时日期降序，但同日内部始终按 createdAt 升序（不随方向翻转）
 */
function getEventComparator(order: SortOrder): (a: TimelineEvent, b: TimelineEvent) => number {
  if (order === 'asc') {
    return compareEvents;
  }
  return (a: TimelineEvent, b: TimelineEvent): number => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    // 同日内部始终按 createdAt 升序（不随方向翻转）
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    if (a.id !== b.id) {
      return a.id < b.id ? -1 : 1;
    }
    return 0;
  };
}


/**
 * 反向关联索引构建：
 * relatedOf(e) = 去重(e.relatedIds ∪ reverse(e.id))，剔除自身与不存在的 id
 */
export function buildRelationIndex(events: TimelineEvent[]): Map<string, string[]> {
  const validIds = new Set<string>();
  for (const e of events) {
    if (e && e.id) {
      validIds.add(e.id);
    }
  }

  // 统计被动关联 reverse: targetId -> eventIds
  const reverseMap = new Map<string, string[]>();
  for (const e of events) {
    if (!e || !e.id || !Array.isArray(e.relatedIds)) continue;
    for (const targetId of e.relatedIds) {
      if (targetId && targetId !== e.id && validIds.has(targetId)) {
        let revList = reverseMap.get(targetId);
        if (!revList) {
          revList = [];
          reverseMap.set(targetId, revList);
        }
        revList.push(e.id);
      }
    }
  }

  const result = new Map<string, string[]>();
  for (const e of events) {
    if (!e || !e.id) continue;
    const relatedSet = new Set<string>();

    // 1. 主动关联 e.relatedIds
    if (Array.isArray(e.relatedIds)) {
      for (const id of e.relatedIds) {
        if (id && id !== e.id && validIds.has(id)) {
          relatedSet.add(id);
        }
      }
    }

    // 2. 被动关联 reverse(e.id)
    const rev = reverseMap.get(e.id);
    if (rev) {
      for (const id of rev) {
        if (id && id !== e.id && validIds.has(id)) {
          relatedSet.add(id);
        }
      }
    }

    result.set(e.id, Array.from(relatedSet));
  }

  return result;
}

/**
 * 筛选匹配：
 * 1. 星级：minFour 优先（rating>=4）；否则 ratings 含该值；无记录事件一律 false（REQ-005）
 * 2. 关键词：小写、split(/\s+/) 后 every 命中，禁止正则
 * 两者 AND
 */
export function matchFilters(e: TimelineEvent, f: FilterState): boolean {
  // 1. 星级筛选
  if (f.minFour) {
    const latest = latestRecord(e);
    if (!latest || latest.rating < 4) {
      return false;
    }
  } else if (Array.isArray(f.ratings) && f.ratings.length > 0) {
    const latest = latestRecord(e);
    if (!latest || !f.ratings.includes(latest.rating)) {
      return false;
    }
  }

  // 3. 关键词筛选
  if (typeof f.keyword === 'string') {
    const trimmed = f.keyword.trim();
    if (trimmed !== '') {
      const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length > 0) {
        const textParts = [
          e.title ?? '',
          ...(e.records ?? []).flatMap(r => [r.summary ?? '', r.detail ?? '']),
        ];
        const fullText = textParts.join(' ').toLowerCase();
        const allMatched = terms.every(term => fullText.includes(term));
        if (!allMatched) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * 当前结果中存在的年份（按当前结果中出现的顺序去重）
 */
export function allYears(cards: CardView[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of cards) {
    const y = c.event?.date ? c.event.date.slice(0, 4) : '';
    if (y && !seen.has(y)) {
      seen.add(y);
      result.push(y);
    }
  }
  return result;
}

/**
 * 计算卡片视图与年份分组：
 * 1. 构建全量关联索引
 * 2. 筛选
 * 3. 排序（按 order，同日内部恒 createdAt 升序）
 * 4. 组装 CardView（计算最新记录、关联卡片视图、跨度文案）
 * 5. 年份分组（组顺序与组内顺序同向）
 */
export function buildCards(
  events: TimelineEvent[],
  f: FilterState,
  order: SortOrder
): YearGroup[] {
  const relationIndex = buildRelationIndex(events);
  const eventsMap = new Map<string, TimelineEvent>();
  for (const e of events) {
    if (e && e.id) {
      eventsMap.set(e.id, e);
    }
  }

  // 筛选（不修改入参）
  const filtered: TimelineEvent[] = [];
  for (const e of events) {
    try {
      if (matchFilters(e, f)) {
        filtered.push(e);
      }
    } catch {
      // 坏数据跳过
    }
  }

  // 排序（新数组排序）
  const comparator = getEventComparator(order);
  filtered.sort(comparator);

  // 组装 CardView
  const cards: CardView[] = [];
  for (const e of filtered) {
    try {
      const relatedIds = relationIndex.get(e.id) ?? [];
      const relations: RelationView[] = [];

      for (const targetId of relatedIds) {
        const target = eventsMap.get(targetId);
        if (!target) continue;

        let dir: 'before' | 'after' | 'same';
        if (target.date < e.date) {
          dir = 'before';
        } else if (target.date > e.date) {
          dir = 'after';
        } else {
          dir = 'same';
        }

        const span = spanText(e.date, target.date, dir);
        relations.push({
          eventId: target.id,
          date: target.date,
          title: target.title,
          dir,
          spanText: span,
        });
      }

      const latest = latestRecord(e);
      const relationCount = relations.length;
      const recordCount = Array.isArray(e.records) ? e.records.length : 0;

      cards.push({
        event: e,
        latestRecord: latest,
        visible: true,
        relations,
        relationCount,
        recordCount,
      });
    } catch {
      // 坏数据跳过
    }
  }

  // 年份分组（年内按月再分一层；cards 已按日期排序，故年月都是连续段）
  const groups: YearGroup[] = [];
  let currentGroup: YearGroup | null = null;
  let currentMonth: MonthGroup | null = null;

  for (const card of cards) {
    const date = card.event?.date ?? '';
    const year = date ? date.slice(0, 4) : '';
    const month = date ? date.slice(5, 7) : '';
    if (!currentGroup || currentGroup.year !== year) {
      currentGroup = { year, months: [], cards: [] };
      currentMonth = null;
      groups.push(currentGroup);
    }
    currentGroup.cards.push(card);
    if (!currentMonth || currentMonth.month !== month) {
      currentMonth = { month, cards: [] };
      currentGroup.months.push(currentMonth);
    }
    currentMonth.cards.push(card);
  }

  return groups;
}
