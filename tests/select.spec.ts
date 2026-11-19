import { describe, expect, it } from 'vitest';
import {
  allYears,
  buildCards,
  buildRelationIndex,
  compareEvents,
  latestRecord,
  matchFilters,
  sortedRecords,
} from '../src/core/select';
import type { FilterState, PersonalRecord, TimelineEvent } from '../src/core/types';

function makeRecord(overrides: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    id: 'rec_1770000000000_000001',
    date: '2026-01-01',
    rating: 3,
    summary: '测试记录总结',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'evt_1770000000000_000001',
    date: '2026-01-01',
    title: '测试事件标题',
    links: [],
    relatedIds: [],
    records: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const defaultFilter: FilterState = {
  ratings: [],
  minFour: false,
  keyword: '',
};

describe('MOD-006 select: S1~S20 规范测试', () => {
  it('S1: 事件 3 条记录 rating 3/4/5，date 递增 -> latestRecord -> rating 5', () => {
    const e = makeEvent({
      records: [
        makeRecord({ id: 'rec_1', date: '2025-01-01', rating: 3, createdAt: '2025-01-01T00:00:00Z' }),
        makeRecord({ id: 'rec_2', date: '2025-02-01', rating: 4, createdAt: '2025-02-01T00:00:00Z' }),
        makeRecord({ id: 'rec_3', date: '2025-03-01', rating: 5, createdAt: '2025-03-01T00:00:00Z' }),
      ],
    });

    const latest = latestRecord(e);
    expect(latest).not.toBeNull();
    expect(latest?.rating).toBe(5);
    expect(latest?.id).toBe('rec_3');
  });

  it('S2: 两条记录同 date，先建 rating 2、后建 rating 4 -> latestRecord -> rating 4（比 createdAt）', () => {
    const e = makeEvent({
      records: [
        makeRecord({ id: 'rec_1', date: '2025-01-01', rating: 2, createdAt: '2025-01-01T10:00:00Z' }),
        makeRecord({ id: 'rec_2', date: '2025-01-01', rating: 4, createdAt: '2025-01-01T12:00:00Z' }),
      ],
    });

    const latest = latestRecord(e);
    expect(latest).not.toBeNull();
    expect(latest?.rating).toBe(4);
    expect(latest?.id).toBe('rec_2');
  });

  it('S3: 事件无记录 -> latestRecord -> null', () => {
    const e = makeEvent({ records: [] });
    expect(latestRecord(e)).toBeNull();
  });

  it('S4: 事件跨 2024/2025/2026 -> buildCards(order:\'desc\') -> 3 组，年份降序，组内降序', () => {
    const events: TimelineEvent[] = [
      makeEvent({ id: 'evt_2024', date: '2024-05-15', createdAt: '2024-05-15T00:00:00Z' }),
      makeEvent({ id: 'evt_2025', date: '2025-08-20', createdAt: '2025-08-20T00:00:00Z' }),
      makeEvent({ id: 'evt_2026_early', date: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' }),
      makeEvent({ id: 'evt_2026_late', date: '2026-11-10', createdAt: '2026-11-10T00:00:00Z' }),
    ];

    const groups = buildCards(events, defaultFilter, 'desc');
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.year)).toEqual(['2026', '2025', '2024']);

    // 2026 组内降序：11-10 在 02-01 前面
    const g2026Cards = groups[0]!.cards;
    expect(g2026Cards).toHaveLength(2);
    expect(g2026Cards[0]!.event.id).toBe('evt_2026_late');
    expect(g2026Cards[1]!.event.id).toBe('evt_2026_early');
  });

  it('S5: 同上 order:\'asc\' -> 同上 -> 组与组内全部反转', () => {
    const events: TimelineEvent[] = [
      makeEvent({ id: 'evt_2024', date: '2024-05-15', createdAt: '2024-05-15T00:00:00Z' }),
      makeEvent({ id: 'evt_2025', date: '2025-08-20', createdAt: '2025-08-20T00:00:00Z' }),
      makeEvent({ id: 'evt_2026_early', date: '2026-02-01', createdAt: '2026-02-01T00:00:00Z' }),
      makeEvent({ id: 'evt_2026_late', date: '2026-11-10', createdAt: '2026-11-10T00:00:00Z' }),
    ];

    const groups = buildCards(events, defaultFilter, 'asc');
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.year)).toEqual(['2024', '2025', '2026']);

    // 2026 组内升序：02-01 在 11-10 前面
    const g2026Cards = groups[2]!.cards;
    expect(g2026Cards).toHaveLength(2);
    expect(g2026Cards[0]!.event.id).toBe('evt_2026_early');
    expect(g2026Cards[1]!.event.id).toBe('evt_2026_late');
  });

  it('S6: 同日两条事件，createdAt 先后不同 -> buildCards 任一方向 -> 同日内部始终按 createdAt 升序（不随方向翻转）', () => {
    const e1 = makeEvent({
      id: 'evt_day_first',
      date: '2025-05-01',
      createdAt: '2025-05-01T09:00:00.000Z',
    });
    const e2 = makeEvent({
      id: 'evt_day_second',
      date: '2025-05-01',
      createdAt: '2025-05-01T15:00:00.000Z',
    });
    const events = [e2, e1]; // 乱序输入

    const descGroups = buildCards(events, defaultFilter, 'desc');
    expect(descGroups[0]!.cards.map(c => c.event.id)).toEqual(['evt_day_first', 'evt_day_second']);

    const ascGroups = buildCards(events, defaultFilter, 'asc');
    expect(ascGroups[0]!.cards.map(c => c.event.id)).toEqual(['evt_day_first', 'evt_day_second']);
  });

  it('S-A1: 2 条事件（无 category 字段，星级 3 与 5） -> buildCards -> 只剩 5 星事件且 CardView 无 expandable', () => {
    const e1 = makeEvent({
      id: 'evt_3',
      records: [makeRecord({ rating: 3 })],
    });
    const e2 = makeEvent({
      id: 'evt_5',
      records: [makeRecord({ rating: 5 })],
    });

    const groups = buildCards([e1, e2], { ratings: [5], minFour: false, keyword: '' }, 'desc');
    const allCards = groups.flatMap(g => g.cards);
    expect(allCards).toHaveLength(1);
    expect(allCards[0]!.event.id).toBe('evt_5');
    expect(Object.hasOwn(allCards[0]!, 'expandable')).toBe(false);
  });

  it('S8: keyword + ratings:[5] -> buildCards -> 两者交集', () => {
    const e1 = makeEvent({
      id: 'evt_ai_5',
      title: 'AI模型 5星',
      records: [makeRecord({ rating: 5 })],
    });
    const e2 = makeEvent({
      id: 'evt_ai_3',
      title: 'AI模型 3星',
      records: [makeRecord({ rating: 3 })],
    });
    const e3 = makeEvent({
      id: 'evt_game_5',
      title: '游戏发售 5星',
      records: [makeRecord({ rating: 5 })],
    });

    const filter: FilterState = {
      ...defaultFilter,
      keyword: 'AI模型',
      ratings: [5],
    };

    const groups = buildCards([e1, e2, e3], filter, 'desc');
    const allCards = groups.flatMap(g => g.cards);
    expect(allCards).toHaveLength(1);
    expect(allCards[0]!.event.id).toBe('evt_ai_5');
  });

  it('S9: 事件无记录 + minFour:true -> matchFilters -> false', () => {
    const e = makeEvent({ records: [] });
    const filter: FilterState = { ...defaultFilter, minFour: true };
    expect(matchFilters(e, filter)).toBe(false);
  });

  it('S10: keyword 只出现在某记录 detail -> matchFilters -> true', () => {
    const e = makeEvent({
      title: '日常记录',
      records: [
        makeRecord({ summary: '去超市', detail: '碰巧遇见了很久没见的老同学 Gemini' }),
      ],
    });
    const filter: FilterState = { ...defaultFilter, keyword: 'Gemini' };
    expect(matchFilters(e, filter)).toBe(true);
  });

  it('S11: keyword=\'a b\'，标题只含 a，简评只含 b -> matchFilters -> true（各词在合并后的文本中命中）', () => {
    const e = makeEvent({
      title: 'apple pie recipe',
      records: [
        makeRecord({ summary: 'banana smoothie is also good' }),
      ],
    });
    const filter: FilterState = { ...defaultFilter, keyword: 'apple banana' };
    expect(matchFilters(e, filter)).toBe(true);
  });

  it('S12: keyword=\'AB\'，标题 \'ab\' -> matchFilters -> true（不区分大小写）', () => {
    const e = makeEvent({ title: 'ab testing result' });
    const filter: FilterState = { ...defaultFilter, keyword: 'AB' };
    expect(matchFilters(e, filter)).toBe(true);
  });

  it('S13: keyword=\'(\' -> matchFilters -> 不抛错，按字面匹配', () => {
    const eMatch = makeEvent({ title: 'Claude 3.5 (Sonnet)' });
    const eNoMatch = makeEvent({ title: 'Claude 3.5 Sonnet' });
    const filter: FilterState = { ...defaultFilter, keyword: '(' };

    expect(() => matchFilters(eMatch, filter)).not.toThrow();
    expect(matchFilters(eMatch, filter)).toBe(true);
    expect(matchFilters(eNoMatch, filter)).toBe(false);
  });

  it('S14: A.relatedIds=[B]，B.relatedIds=[] -> buildRelationIndex + A/B 的 relations -> A 与 B 双向都能看到对方', () => {
    const a = makeEvent({ id: 'evt_a', title: '事件A', relatedIds: ['evt_b'] });
    const b = makeEvent({ id: 'evt_b', title: '事件B', relatedIds: [] });

    const index = buildRelationIndex([a, b]);
    expect(index.get('evt_a')).toContain('evt_b');
    expect(index.get('evt_b')).toContain('evt_a');

    const groups = buildCards([a, b], defaultFilter, 'desc');
    const allCards = groups.flatMap(g => g.cards);
    const cardA = allCards.find(c => c.event.id === 'evt_a');
    const cardB = allCards.find(c => c.event.id === 'evt_b');

    expect(cardA?.relations.some(r => r.eventId === 'evt_b')).toBe(true);
    expect(cardB?.relations.some(r => r.eventId === 'evt_a')).toBe(true);
  });

  it('S15: A 关联 B 且 B 也关联 A -> 同上 -> 不重复出现，只一条', () => {
    const a = makeEvent({ id: 'evt_a', title: '事件A', relatedIds: ['evt_b'] });
    const b = makeEvent({ id: 'evt_b', title: '事件B', relatedIds: ['evt_a'] });

    const index = buildRelationIndex([a, b]);
    expect(index.get('evt_a')).toEqual(['evt_b']);
    expect(index.get('evt_b')).toEqual(['evt_a']);

    const groups = buildCards([a, b], defaultFilter, 'desc');
    const allCards = groups.flatMap(g => g.cards);
    const cardA = allCards.find(c => c.event.id === 'evt_a');
    const cardB = allCards.find(c => c.event.id === 'evt_b');

    expect(cardA?.relations).toHaveLength(1);
    expect(cardA?.relationCount).toBe(1);
    expect(cardB?.relations).toHaveLength(1);
    expect(cardB?.relationCount).toBe(1);
  });

  it('S16: A.relatedIds 含不存在 id -> 同上 -> 该条被忽略，relationCount 不计入', () => {
    const a = makeEvent({ id: 'evt_a', relatedIds: ['evt_non_existent'] });
    const b = makeEvent({ id: 'evt_b', relatedIds: [] });

    const index = buildRelationIndex([a, b]);
    expect(index.get('evt_a')).toEqual([]);

    const groups = buildCards([a, b], defaultFilter, 'desc');
    const allCards = groups.flatMap(g => g.cards);
    const cardA = allCards.find(c => c.event.id === 'evt_a');

    expect(cardA?.relations).toEqual([]);
    expect(cardA?.relationCount).toBe(0);
  });

  it('S20: 关联 A-B，A 日期晚于 B -> relations 中 A 侧的 dir -> \'before\'（对方更早）', () => {
    const a = makeEvent({
      id: 'evt_a',
      title: '晚期事件',
      date: '2026-05-01',
      relatedIds: ['evt_b'],
    });
    const b = makeEvent({
      id: 'evt_b',
      title: '早期事件',
      date: '2026-01-01',
      relatedIds: [],
    });

    const groups = buildCards([a, b], defaultFilter, 'desc');
    const allCards = groups.flatMap(g => g.cards);
    const cardA = allCards.find(c => c.event.id === 'evt_a');
    expect(cardA).toBeDefined();

    const relInA = cardA?.relations[0];
    expect(relInA?.eventId).toBe('evt_b');
    expect(relInA?.dir).toBe('before');
    expect(relInA?.spanText).toBe('此前 4 个月（共 120 天）');

    // 反向：B 侧看 A，对方更晚，dir 应为 'after'
    const cardB = allCards.find(c => c.event.id === 'evt_b');
    const relInB = cardB?.relations[0];
    expect(relInB?.eventId).toBe('evt_a');
    expect(relInB?.dir).toBe('after');
    expect(relInB?.spanText).toBe('此后 4 个月（共 120 天）');
  });

  describe('补充边界与特性测试', () => {
    it('sortedRecords 不修改入参 e.records，并按三元组升序排序', () => {
      const r1 = makeRecord({ id: 'rec_b', date: '2026-01-01', createdAt: '2026-01-01T12:00:00Z' });
      const r2 = makeRecord({ id: 'rec_a', date: '2026-01-01', createdAt: '2026-01-01T08:00:00Z' });
      const e = makeEvent({ records: [r1, r2] });

      const sorted = sortedRecords(e);
      expect(sorted[0]?.id).toBe('rec_a');
      expect(sorted[1]?.id).toBe('rec_b');
      // 原数组不变
      expect(e.records[0]?.id).toBe('rec_b');
      expect(e.records[1]?.id).toBe('rec_a');
    });

    it('compareEvents 是与方向无关的升序比较器', () => {
      const e1 = makeEvent({ id: 'evt_1', date: '2025-01-01', createdAt: '2025-01-01T10:00:00Z' });
      const e2 = makeEvent({ id: 'evt_2', date: '2025-01-01', createdAt: '2025-01-01T12:00:00Z' });
      const e3 = makeEvent({ id: 'evt_3', date: '2025-02-01', createdAt: '2025-02-01T00:00:00Z' });

      expect(compareEvents(e1, e2)).toBeLessThan(0);
      expect(compareEvents(e2, e1)).toBeGreaterThan(0);
      expect(compareEvents(e1, e3)).toBeLessThan(0);
      expect(compareEvents(e1, e1)).toBe(0);
    });

    it('buildCards 不修改入参 events 数组', () => {
      const e1 = makeEvent({ id: 'evt_1', date: '2025-01-01' });
      const e2 = makeEvent({ id: 'evt_2', date: '2026-01-01' });
      const originalEvents = [e1, e2];

      buildCards(originalEvents, defaultFilter, 'desc');
      expect(originalEvents[0]?.id).toBe('evt_1');
      expect(originalEvents[1]?.id).toBe('evt_2');
    });

    it('allYears 提取卡片中去重且保序的年份列表', () => {
      const events: TimelineEvent[] = [
        makeEvent({ id: 'e1', date: '2026-05-01' }),
        makeEvent({ id: 'e2', date: '2026-01-01' }),
        makeEvent({ id: 'e3', date: '2025-11-01' }),
        makeEvent({ id: 'e4', date: '2024-03-01' }),
      ];
      const descCards = buildCards(events, defaultFilter, 'desc').flatMap(g => g.cards);
      expect(allYears(descCards)).toEqual(['2026', '2025', '2024']);

      const ascCards = buildCards(events, defaultFilter, 'asc').flatMap(g => g.cards);
      expect(allYears(ascCards)).toEqual(['2024', '2025', '2026']);
    });

    it('buildRelationIndex 剔除自身关联与不存在的 ID', () => {
      const e = makeEvent({
        id: 'evt_self',
        relatedIds: ['evt_self', 'evt_ghost'],
      });
      const index = buildRelationIndex([e]);
      expect(index.get('evt_self')).toEqual([]);
    });

    it('matchFilters 无星级筛选时无记录事件仍然可见', () => {
      const e = makeEvent({ records: [] });
      expect(matchFilters(e, defaultFilter)).toBe(true);
    });

    it('matchFilters ratings 包含该值才命中，无记录为 false', () => {
      const eWith5 = makeEvent({ records: [makeRecord({ rating: 5 })] });
      const eWith3 = makeEvent({ records: [makeRecord({ rating: 3 })] });
      const eNoRec = makeEvent({ records: [] });
      const f: FilterState = { ...defaultFilter, ratings: [4, 5] };

      expect(matchFilters(eWith5, f)).toBe(true);
      expect(matchFilters(eWith3, f)).toBe(false);
      expect(matchFilters(eNoRec, f)).toBe(false);
    });
  });
  describe('buildCards 二级时间轴：年 → 月分组（v0.0.2）', () => {
    const mk = (date: string, id: string) => makeEvent({ date, id });

    it('M2-1: 同一年的三个月各成一个小节，月内卡片顺序随全局排序', () => {
      const events = [
        mk('2026-03-10', 'evt_a'),
        mk('2026-01-05', 'evt_b'),
        mk('2026-03-20', 'evt_c'),
      ];
      const groups = buildCards(events, defaultFilter, 'desc');
      expect(groups).toHaveLength(1);
      expect(groups[0]!.months.map((m) => m.month)).toEqual(['03', '01']);
      expect(groups[0]!.months[0]!.cards.map((c) => c.event.id)).toEqual(['evt_c', 'evt_a']);
      expect(groups[0]!.months[1]!.cards.map((c) => c.event.id)).toEqual(['evt_b']);
    });

    it('M2-2: 跨年时每年各自持有自己的月份小节', () => {
      const events = [
        mk('2026-02-01', 'evt_1'),
        mk('2025-12-31', 'evt_2'),
        mk('2025-06-01', 'evt_3'),
      ];
      const groups = buildCards(events, defaultFilter, 'desc');
      expect(groups.map((g) => g.year)).toEqual(['2026', '2025']);
      expect(groups[0]!.months.map((m) => m.month)).toEqual(['02']);
      expect(groups[1]!.months.map((m) => m.month)).toEqual(['12', '06']);
    });

    it('M2-3: 切正序后月份小节顺序同时反转', () => {
      const events = [mk('2026-03-10', 'evt_a'), mk('2026-01-05', 'evt_b')];
      const desc = buildCards(events, defaultFilter, 'desc');
      const asc = buildCards(events, defaultFilter, 'asc');
      expect(desc[0]!.months.map((m) => m.month)).toEqual(['03', '01']);
      expect(asc[0]!.months.map((m) => m.month)).toEqual(['01', '03']);
    });

    it('M2-4: 月份卡片合计等于扁平 cards（无遗漏无重复）', () => {
      const events = [
        mk('2026-03-10', 'evt_a'),
        mk('2026-03-11', 'evt_b'),
        mk('2026-07-01', 'evt_c'),
      ];
      const g = buildCards(events, defaultFilter, 'desc')[0]!;
      const flatFromMonths = g.months.flatMap((m) => m.cards.map((c) => c.event.id));
      expect(flatFromMonths).toEqual(g.cards.map((c) => c.event.id));
      expect(g.months).toHaveLength(2);
    });
  });
});
