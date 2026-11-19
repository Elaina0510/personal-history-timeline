import { describe, expect, it } from 'vitest';
import { enforceInvariants, planMerge } from '../src/core/merge';
import {
  type PersonalRecord,
  type TimelineData,
  type TimelineEvent,
} from '../src/core/types';

function makeRecord(overrides: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    id: 'rec_1770000000000_000001',
    date: '2026-01-01',
    rating: 3,
    summary: '测试记录',
    createdAt: '2026-01-01T00:00:00+08:00',
    updatedAt: '2026-01-01T00:00:00+08:00',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'evt_1770000000000_000001',
    date: '2026-01-01',
    title: '测试事件',
    links: [],
    relatedIds: [],
    records: [],
    createdAt: '2026-01-01T00:00:00+08:00',
    updatedAt: '2026-01-01T00:00:00+08:00',
    ...overrides,
  };
}

function makeData(events: TimelineEvent[] = []): TimelineData {
  return {
    schemaVersion: 1,
    appVersion: '0.0.1',
    savedAt: '2026-01-01T12:00:00+08:00',
    ui: { sortOrder: 'desc' },
    events,
  };
}

describe('MOD-005 merge: M1~M10, M-A1, M-A2 规范测试', () => {
  it('M1: 本地 A(updated 10:00)，导入 A(updated 09:00) -> planMerge("merge") -> updated:0, skipped:1，本地 A 未变', () => {
    const localA = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '本地事件 A',
      updatedAt: '2026-01-01T10:00:00+08:00',
      records: [makeRecord({ id: 'rec_1', summary: '本地旧记录' })],
    });
    const incomingA = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '导入事件 A（旧版）',
      updatedAt: '2026-01-01T09:00:00+08:00',
      records: [makeRecord({ id: 'rec_2', summary: '导入记录' })],
    });

    const local = makeData([localA]);
    const incoming = makeData([incomingA]);

    const { next, preview } = planMerge(local, incoming, 'merge');

    expect(preview.counts.updated).toBe(0);
    expect(preview.counts.skipped).toBe(1);
    expect(preview.counts.added).toBe(0);
    expect(preview.counts.errors).toBe(0);
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]!.action).toBe('skipped');

    const resultA = next.events.find((e) => e.id === 'evt_1770000000000_00000a');
    expect(resultA).toBeDefined();
    expect(resultA?.title).toBe('本地事件 A');
    expect(resultA?.updatedAt).toBe('2026-01-01T10:00:00+08:00');
    expect(resultA?.records[0]?.summary).toBe('本地旧记录');
  });

  it('M2: 本地 A(09:00)，导入 A(10:00) 且记录集合不同 -> planMerge("merge") -> updated:1，A 的 records 整体替换为导入方', () => {
    const localA = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '本地事件 A',
      updatedAt: '2026-01-01T09:00:00+08:00',
      records: [
        makeRecord({ id: 'rec_local_1', summary: '本地记录1' }),
        makeRecord({ id: 'rec_local_2', summary: '本地记录2' }),
      ],
    });
    const incomingA = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '导入新事件 A',
      updatedAt: '2026-01-01T10:00:00+08:00',
      records: [
        makeRecord({ id: 'rec_incoming_3', summary: '导入方新记录3' }),
      ],
    });

    const local = makeData([localA]);
    const incoming = makeData([incomingA]);

    const { next, preview } = planMerge(local, incoming, 'merge');

    expect(preview.counts.updated).toBe(1);
    expect(preview.counts.skipped).toBe(0);
    expect(preview.counts.added).toBe(0);
    expect(preview.items[0]!.action).toBe('updated');

    const resultA = next.events.find((e) => e.id === 'evt_1770000000000_00000a');
    expect(resultA).toBeDefined();
    expect(resultA?.title).toBe('导入新事件 A');
    // 验证 records 整体替换，无本地残余记录（绝不作记录级独立合并）
    expect(resultA?.records).toHaveLength(1);
    expect(resultA?.records[0]?.id).toBe('rec_incoming_3');
    expect(resultA?.records[0]?.summary).toBe('导入方新记录3');
  });

  it('M3: 本地 A、B；导入仅 A -> planMerge("merge") -> B 仍在（合并不删除）', () => {
    const localA = makeEvent({ id: 'evt_1770000000000_00000a', title: '事件 A' });
    const localB = makeEvent({ id: 'evt_1770000000000_00000b', title: '独有事件 B' });
    const incomingA = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '事件 A (导入)',
      updatedAt: '2026-01-01T11:00:00+08:00',
    });

    const local = makeData([localA, localB]);
    const incoming = makeData([incomingA]);

    const { next, preview } = planMerge(local, incoming, 'merge');

    expect(next.events).toHaveLength(2);
    expect(next.events.some((e) => e.id === 'evt_1770000000000_00000b')).toBe(true);
    expect(preview.counts.updated).toBe(1);
    expect(preview.counts.added).toBe(0);
  });

  it('M4: 同上，mode="overwrite" -> B 消失', () => {
    const localA = makeEvent({ id: 'evt_1770000000000_00000a', title: '事件 A' });
    const localB = makeEvent({ id: 'evt_1770000000000_00000b', title: '独有事件 B' });
    const incomingA = makeEvent({ id: 'evt_1770000000000_00000a', title: '事件 A (全量导入)' });

    const local = makeData([localA, localB]);
    const incoming = makeData([incomingA]);

    const { next, preview } = planMerge(local, incoming, 'overwrite');

    // B 消失，仅有 A
    expect(next.events).toHaveLength(1);
    expect(next.events[0]!.id).toBe('evt_1770000000000_00000a');
    expect(next.events.some((e) => e.id === 'evt_1770000000000_00000b')).toBe(false);

    expect(preview.counts.updated).toBe(1);
    expect(preview.counts.added).toBe(0);
  });

  it('M5: 导入文件内两条同 id -> 第二条 ID 重建，counts.added 只加 1，warnings 含 DUPLICATE_ID_REGENERATED', () => {
    const localA = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '本地事件 A',
      updatedAt: '2026-01-01T10:00:00+08:00',
    });

    const incoming1 = makeEvent({
      id: 'evt_1770000000000_00000a',
      title: '导入事件 A-1（同id）',
      updatedAt: '2026-01-01T09:00:00+08:00', // 比本地旧，会被 skipped
    });

    const incoming2 = makeEvent({
      id: 'evt_1770000000000_00000a', // 故意相同 id
      title: '导入事件 A-2（同id重复）',
      updatedAt: '2026-01-01T12:00:00+08:00',
    });

    const local = makeData([localA]);
    const incoming = makeData([incoming1, incoming2]);

    const { next, preview } = planMerge(local, incoming, 'merge');

    // 第一条 skipped，第二条 ID 重建后作为新条目 added
    expect(preview.counts.skipped).toBe(1);
    expect(preview.counts.added).toBe(1);
    expect(preview.warnings.some((w) => w.code === 'DUPLICATE_ID_REGENERATED')).toBe(true);

    // next 中包含两条事件：一条原 ID A，另一条为重建的新 ID
    expect(next.events).toHaveLength(2);
    const original = next.events.find((e) => e.id === 'evt_1770000000000_00000a');
    const regenerated = next.events.find((e) => e.id !== 'evt_1770000000000_00000a');
    expect(original).toBeDefined();
    expect(regenerated).toBeDefined();
    expect(regenerated?.title).toBe('导入事件 A-2（同id重复）');
  });

  it('M6: 导入后某事件 records 25 条 -> enforceInvariants -> 保留 20 条（按 (date,createdAt,id) 升序取前 20），droppedRecords===5', () => {
    // 构造 25 条记录，故意打乱顺序
    const records: PersonalRecord[] = [];
    for (let i = 1; i <= 25; i++) {
      const day = String(i).padStart(2, '0');
      records.push(
        makeRecord({
          id: `rec_1770000000000_${String(i).padStart(6, '0')}`,
          date: `2026-01-${day}`,
          createdAt: `2026-01-${day}T12:00:00+08:00`,
          summary: `记录 ${i}`,
        })
      );
    }
    // 打乱顺序
    records.sort(() => Math.random() - 0.5);

    const eventWith25Records = makeEvent({
      id: 'evt_1770000000000_manyrec',
      records,
    });
    const data = makeData([eventWith25Records]);

    const report = enforceInvariants(data);

    expect(report.droppedRecords).toBe(5);
    expect(eventWith25Records.records).toHaveLength(20);
    expect(report.affectedEventIds).toContain('evt_1770000000000_manyrec');

    // 验证保留的是 (date, createdAt, id) 升序前 20 条（即 01 到 20 号）
    for (let i = 0; i < 20; i++) {
      const day = String(i + 1).padStart(2, '0');
      expect(eventWith25Records.records[i]!.date).toBe(`2026-01-${day}`);
      expect(eventWith25Records.records[i]!.summary).toBe(`记录 ${i + 1}`);
    }
  });

  it('M7: 合并后 A 的主动关联 8 + 被动 4 -> enforceInvariants -> 关联总数裁到 10，droppedRelations===2，affectedEventIds 含 A，且确实改了另一条事件的关联数组', () => {
    // 事件 A（日期较早）
    const eventA = makeEvent({
      id: 'evt_1770000000000_00000a',
      date: '2026-01-01',
      createdAt: '2026-01-01T00:00:00+08:00',
      title: '主事件 A',
      relatedIds: [], // 下文填入 8 个主动关联
    });

    // 8 个主动关联的目标事件 A1~A8（日期设为 2026-02-01 ~ 2026-02-08）
    const activeTargets: TimelineEvent[] = [];
    for (let i = 1; i <= 8; i++) {
      const id = `evt_1770000000000_act00${i}`;
      eventA.relatedIds.push(id);
      activeTargets.push(
        makeEvent({
          id,
          date: `2026-02-0${i}`,
          createdAt: `2026-02-0${i}T00:00:00+08:00`,
          title: `主动目标 ${i}`,
          relatedIds: [],
        })
      );
    }

    // 4 个被动关联事件 P1~P4（在各自 relatedIds 中指向 A）
    // 设 P1, P2 日期为 2026-03-01, 2026-03-02
    // 设 P3, P4 日期为 2026-04-01, 2026-04-02（在 (date, createdAt, id) 升序中排在最后两位）
    const p1 = makeEvent({
      id: 'evt_1770000000000_pas001',
      date: '2026-03-01',
      createdAt: '2026-03-01T00:00:00+08:00',
      title: '被动事件 P1',
      relatedIds: [eventA.id],
    });
    const p2 = makeEvent({
      id: 'evt_1770000000000_pas002',
      date: '2026-03-02',
      createdAt: '2026-03-02T00:00:00+08:00',
      title: '被动事件 P2',
      relatedIds: [eventA.id],
    });
    const p3 = makeEvent({
      id: 'evt_1770000000000_pas003',
      date: '2026-04-01',
      createdAt: '2026-04-01T00:00:00+08:00',
      title: '被动事件 P3（应被裁剪）',
      relatedIds: [eventA.id],
    });
    const p4 = makeEvent({
      id: 'evt_1770000000000_pas004',
      date: '2026-04-02',
      createdAt: '2026-04-02T00:00:00+08:00',
      title: '被动事件 P4（应被裁剪）',
      relatedIds: [eventA.id],
    });

    const data = makeData([eventA, ...activeTargets, p1, p2, p3, p4]);

    // 裁剪前断言：P3 与 P4 确有指向 A 的关联
    expect(p3.relatedIds).toContain(eventA.id);
    expect(p4.relatedIds).toContain(eventA.id);

    const report = enforceInvariants(data);

    // 裁到 10，掉 2
    expect(report.droppedRelations).toBe(2);
    expect(report.affectedEventIds).toContain(eventA.id);

    // 明确验证：另一条事件（P3/P4）的关联数组确实被改
    expect(p3.relatedIds).not.toContain(eventA.id);
    expect(p4.relatedIds).not.toContain(eventA.id);
    expect(report.affectedEventIds).toContain(p3.id);
    expect(report.affectedEventIds).toContain(p4.id);

    // P1, P2 升序在前，依然保留
    expect(p1.relatedIds).toContain(eventA.id);
    expect(p2.relatedIds).toContain(eventA.id);
  });

  it('M8: 导入条目缺 title -> planMerge -> counts.errors===1，该条目 items[i].action==="error"，其余正常', () => {
    const local = makeData([]);
    const validEvent = makeEvent({
      id: 'evt_1770000000000_valid01',
      title: '正常事件',
    });
    const missingTitleEvent = makeEvent({
      id: 'evt_1770000000000_notitle',
      title: '', // 缺 title
    });

    const incoming = makeData([missingTitleEvent, validEvent]);

    const { next, preview } = planMerge(local, incoming, 'merge');

    expect(preview.counts.errors).toBe(1);
    expect(preview.counts.added).toBe(1);

    expect(preview.items).toHaveLength(2);
    expect(preview.items[0]!.action).toBe('error');
    expect(preview.items[0]!.code).toBe('MISSING_REQUIRED');
    expect(preview.items[1]!.action).toBe('added');
    expect(preview.items[1]!.title).toBe('正常事件');

    // next 中仅包含合法事件
    expect(next.events).toHaveLength(1);
    expect(next.events[0]!.id).toBe('evt_1770000000000_valid01');
  });

  it('M9: 连续两次同文件导入 -> 第二次 previewImport/planMerge -> added:0, updated:0, skipped:N', () => {
    const local = makeData([]);
    const incoming = makeData([
      makeEvent({ id: 'evt_1770000000000_000001', title: '事件 1', updatedAt: '2026-01-01T10:00:00+08:00' }),
      makeEvent({ id: 'evt_1770000000000_000002', title: '事件 2', updatedAt: '2026-01-01T10:00:00+08:00' }),
      makeEvent({ id: 'evt_1770000000000_000003', title: '事件 3', updatedAt: '2026-01-01T10:00:00+08:00' }),
    ]);

    // 第一次导入：全部 added
    const firstResult = planMerge(local, incoming, 'merge');
    expect(firstResult.preview.counts.added).toBe(3);
    expect(firstResult.preview.counts.skipped).toBe(0);

    // 拿着第一次导入后的结果再次导入完全相同的文件
    const secondResult = planMerge(firstResult.next, incoming, 'merge');

    expect(secondResult.preview.counts.added).toBe(0);
    expect(secondResult.preview.counts.updated).toBe(0);
    expect(secondResult.preview.counts.skipped).toBe(3);
    expect(secondResult.preview.counts.errors).toBe(0);
    expect(secondResult.preview.items.every((it) => it.action === 'skipped')).toBe(true);
  });

  it('M10: 上次导入后本地数据被改，再用最新数据执行 -> 重新计算，结果以当次为准（不出现错配）', () => {
    // 初始本地状态：事件 A updatedAt 为 09:00
    const local = makeData([
      makeEvent({
        id: 'evt_1770000000000_00000a',
        title: '本地事件 A',
        updatedAt: '2026-01-01T09:00:00+08:00',
      }),
    ]);

    // 外部待导入文件：事件 A updatedAt 为 10:00
    const incoming = makeData([
      makeEvent({
        id: 'evt_1770000000000_00000a',
        title: '导入事件 A',
        updatedAt: '2026-01-01T10:00:00+08:00',
      }),
    ]);

    // 旧预览：认为 incoming 更时新，应更新
    const stalePreview = planMerge(local, incoming, 'merge');
    expect(stalePreview.preview.counts.updated).toBe(1);

    // 在 applyImport 执行前，用户在本地将事件 A 保存到了 11:00，或新增了事件 B
    const updatedLocal = makeData([
      makeEvent({
        id: 'evt_1770000000000_00000a',
        title: '本地新编辑事件 A',
        updatedAt: '2026-01-01T11:00:00+08:00',
      }),
      makeEvent({
        id: 'evt_1770000000000_00000b',
        title: '本地新增事件 B',
      }),
    ]);

    // 重新根据最新 local 计算
    const freshPlan = planMerge(updatedLocal, incoming, 'merge');

    // 重新计算后：incoming 的 10:00 落后于本地的 11:00，变为 skipped，且保留了本地新增事件 B
    expect(freshPlan.preview.counts.updated).toBe(0);
    expect(freshPlan.preview.counts.skipped).toBe(1);
    expect(freshPlan.next.events).toHaveLength(2);
    const resultA = freshPlan.next.events.find((e) => e.id === 'evt_1770000000000_00000a');
    expect(resultA?.title).toBe('本地新编辑事件 A');
    expect(resultA?.updatedAt).toBe('2026-01-01T11:00:00+08:00');
  });

  it('M-A1: 导入文件为 V0.0.1 格式：根带 categories、2 条事件各带 category，date/title 合法', () => {
    const local = makeData([]);
    const incoming = {
      schemaVersion: 1,
      appVersion: '0.0.1',
      savedAt: '2026-01-01T12:00:00+08:00',
      categories: ['生活', '工作'],
      ui: { sortOrder: 'desc' },
      events: [
        {
          id: 'evt_1770000000000_000001',
          date: '2026-01-01',
          title: '旧格式事件1',
          category: '生活',
          links: [],
          relatedIds: [],
          records: [],
          createdAt: '2026-01-01T00:00:00+08:00',
          updatedAt: '2026-01-01T00:00:00+08:00',
        },
        {
          id: 'evt_1770000000000_000002',
          date: '2026-01-02',
          title: '旧格式事件2',
          category: '工作',
          links: [],
          relatedIds: [],
          records: [],
          createdAt: '2026-01-02T00:00:00+08:00',
          updatedAt: '2026-01-02T00:00:00+08:00',
        },
      ],
    } as any;

    const { next, preview } = planMerge(local, incoming, 'merge');

    expect(preview.counts.errors).toBe(0);
    expect(preview.counts.added).toBe(2);
    expect(preview.items.every((it) => !it.message || !it.message.includes('分类'))).toBe(true);
    expect(next.events).toHaveLength(2);
    expect(next.events.every((e) => Object.hasOwn(e, 'category') === false)).toBe(true);
  });

  it('M-A2: 本地 1 条事件、导入同 id 的旧格式事件（带 category）-> updated:1，无 category 键', () => {
    const localA = makeEvent({
      id: 'evt_1770000000000_000001',
      date: '2026-01-01',
      title: '本地事件',
      updatedAt: '2026-01-01T00:00:00+08:00',
    });
    const incomingA = {
      id: 'evt_1770000000000_000001',
      date: '2026-01-01',
      title: '导入新事件（带 category）',
      category: '生活',
      updatedAt: '2026-01-01T10:00:00+08:00',
    };

    const local = makeData([localA]);
    const incoming = {
      schemaVersion: 1,
      appVersion: '0.0.1',
      savedAt: '2026-01-01T12:00:00+08:00',
      categories: ['生活'],
      ui: { sortOrder: 'desc' },
      events: [incomingA],
    } as any;

    const { next, preview } = planMerge(local, incoming, 'merge');

    expect(preview.counts.updated).toBe(1);
    expect(next.events).toHaveLength(1);
    expect(next.events[0]!.title).toBe('导入新事件（带 category）');
    expect(Object.hasOwn(next.events[0]!, 'category')).toBe(false);
  });

  describe('边界条件与硬性规则验证', () => {
    it('缺失 updatedAt 视为最旧：本地无 updatedAt，导入有 updatedAt 则覆盖；本地有则跳过', () => {
      const localWithOutUpdate = makeData([
        makeEvent({ id: 'evt_1', updatedAt: '' }),
      ]);
      const incomingWithUpdate = makeData([
        makeEvent({ id: 'evt_1', updatedAt: '2026-01-01T10:00:00+08:00' }),
      ]);

      const res1 = planMerge(localWithOutUpdate, incomingWithUpdate, 'merge');
      expect(res1.preview.counts.updated).toBe(1);

      const localWithUpdate = makeData([
        makeEvent({ id: 'evt_2', updatedAt: '2026-01-01T10:00:00+08:00' }),
      ]);
      const incomingWithoutUpdate = makeData([
        makeEvent({ id: 'evt_2', updatedAt: '' }),
      ]);

      const res2 = planMerge(localWithUpdate, incomingWithoutUpdate, 'merge');
      expect(res2.preview.counts.skipped).toBe(1);
    });

    it('入参不可变性：planMerge 绝不修改 local 与 incoming 原对象', () => {
      const localA = makeEvent({ id: 'evt_1', title: 'Local' });
      const incomingA = makeEvent({ id: 'evt_1', title: 'Incoming', updatedAt: '2026-01-01T12:00:00+08:00' });
      const local = makeData([localA]);
      const incoming = makeData([incomingA]);

      const localSnapshot = JSON.stringify(local);
      const incomingSnapshot = JSON.stringify(incoming);

      planMerge(local, incoming, 'merge');

      expect(JSON.stringify(local)).toBe(localSnapshot);
      expect(JSON.stringify(incoming)).toBe(incomingSnapshot);
    });

    it('preview.items 最多 200 条，超出置 truncated=true，四项计数与总条数必须吻合', () => {
      const incomingEvents: TimelineEvent[] = [];
      for (let i = 0; i < 250; i++) {
        incomingEvents.push(
          makeEvent({
            id: `evt_1770000000000_${String(i).padStart(6, '0')}`,
            title: `批量事件 ${i}`,
          })
        );
      }
      const local = makeData([]);
      const incoming = makeData(incomingEvents);

      const { preview } = planMerge(local, incoming, 'merge');

      expect(preview.counts.added).toBe(250);
      expect(preview.items).toHaveLength(200);
      expect(preview.truncated).toBe(true);
      expect(
        preview.counts.added + preview.counts.updated + preview.counts.skipped + preview.counts.errors
      ).toBe(250);
    });

    it('不变量裁剪：自动移除自关联与重复关联', () => {
      const e = makeEvent({
        id: 'evt_self',
        relatedIds: ['evt_self', 'evt_other', 'evt_other'],
      });
      const data = makeData([e]);

      const report = enforceInvariants(data);

      expect(e.relatedIds).toEqual(['evt_other']);
      expect(report.affectedEventIds).toContain('evt_self');
    });

    it('异常输入兜底：传入空对象或空数组不抛异常', () => {
      expect(() => planMerge({} as any, {} as any, 'merge')).not.toThrow();
      expect(() => enforceInvariants({} as any)).not.toThrow();
    });
  });
});
