import { describe, expect, it } from 'vitest';
import {
  emptyData,
  normalizeData,
  serialize,
  Store,
  tryParse,
} from '../src/core/store';
import {
  ClockPort,
  LS_BACKUP_KEY,
  LS_CORRUPT_PREFIX,
  LS_KEY,
  PRESET_CATEGORIES,
  StoragePort,
} from '../src/core/types';

// ==========================================
// 内存版 StoragePort Fake 与 ClockPort Fake
// ==========================================

export class MemoryStoragePort implements StoragePort {
  private map = new Map<string, string>();
  private available = true;
  private throwOnWriteKey: string | null = null;
  private throwOnWriteError: Error | null = null;
  public writeCallCount = 0;

  constructor(available = true) {
    this.available = available;
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setThrowOnWrite(key: string | null, error: Error | null): void {
    this.throwOnWriteKey = key;
    this.throwOnWriteError = error;
  }

  read(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  write(key: string, value: string): void {
    if (this.throwOnWriteError) {
      if (this.throwOnWriteKey === null || this.throwOnWriteKey === key) {
        throw this.throwOnWriteError;
      }
    }
    this.writeCallCount++;
    this.map.set(key, value);
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  isAvailable(): boolean {
    return this.available;
  }

  getAllKeys(): string[] {
    return Array.from(this.map.keys());
  }
}

export class FakeClockPort implements ClockPort {
  constructor(
    private ms = 1770000000000,
    private iso = '2026-11-18T12:00:00+08:00'
  ) {}

  nowMs(): number {
    return this.ms;
  }

  nowIso(): string {
    return this.iso;
  }

  advance(ms: number): void {
    this.ms += ms;
  }
}

function createTestStore(options?: {
  storage?: MemoryStoragePort;
  clock?: FakeClockPort;
  appVersion?: string;
  rand?: () => number;
}) {
  const storage = options?.storage ?? new MemoryStoragePort();
  const clock = options?.clock ?? new FakeClockPort();
  const appVersion = options?.appVersion ?? '0.0.1';
  const rand = options?.rand ?? Math.random;
  const store = new Store({ storage, clock, appVersion, rand });
  return { store, storage, clock };
}

describe('MOD-008 Store: §8.6 T1~T22 事务与状态用例', () => {
  // ==========================================
  // T1 ~ T6: 初始化与存储模式
  // ==========================================

  it('T1: 空存储 + init(null) -> source==="empty"，事件 0 条', () => {
    const { store } = createTestStore();
    const res = store.init(null);
    expect(res.source).toBe('empty');
    expect(res.storageMode).toBe('persistent');
    expect(res.issues).toHaveLength(0);
    expect(store.getState().data.events).toHaveLength(0);
  });

  it('T2: 存储有合法数据 + init(seedRaw) -> source==="storage"，seed 被忽略', () => {
    const storage = new MemoryStoragePort();
    const existingData = {
      schemaVersion: 1,
      appVersion: '0.0.1',
      savedAt: '2026-11-18T10:00:00+08:00',
      categories: [...PRESET_CATEGORIES],
      ui: { sortOrder: 'desc' },
      events: [
        {
          id: 'evt_1770000000000_000001',
          date: '2026-11-18',
          title: '已存在事件',
          category: '生活事件',
          links: [],
          relatedIds: [],
          records: [],
          createdAt: '2026-11-18T10:00:00+08:00',
          updatedAt: '2026-11-18T10:00:00+08:00',
        },
      ],
    };
    storage.write(LS_KEY, JSON.stringify(existingData));
    const { store } = createTestStore({ storage });
    const seedRaw = JSON.stringify({
      events: [
        {
          date: '2026-11-18',
          title: '种子事件',
          category: '游戏发售',
        },
      ],
    });
    const res = store.init(seedRaw);
    expect(res.source).toBe('storage');
    expect(store.getState().data.events[0]?.title).toBe('已存在事件');
  });

  it('T3: 空存储 + 合法 seed -> init(seedRaw) -> source==="seed"，且 storage.read(LS_KEY) 非空', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    const seedRaw = JSON.stringify({
      events: [
        {
          id: 'evt_1770000000000_000002',
          date: '2026-11-18',
          title: '种子事件',
          category: '游戏发售',
          links: [],
          relatedIds: [],
          records: [],
          createdAt: '2026-11-18T10:00:00+08:00',
          updatedAt: '2026-11-18T10:00:00+08:00',
        },
      ],
    });
    const res = store.init(seedRaw);
    expect(res.source).toBe('seed');
    expect(res.storageMode).toBe('persistent');
    expect(storage.read(LS_KEY)).not.toBeNull();
    expect(store.getState().data.events).toHaveLength(1);
    expect(store.getState().data.events[0]?.title).toBe('种子事件');
  });

  it('T4: 空存储 + 非法 seed -> init(seedRaw) -> source==="empty"，issues 含 SEED_INVALID', () => {
    const { store } = createTestStore();
    const res = store.init('{bad json');
    expect(res.source).toBe('empty');
    expect(res.issues.some((i) => i.code === 'SEED_INVALID')).toBe(true);
    expect(store.getState().data.events).toHaveLength(0);
  });

  it('T5: 存储中放 "{bad" -> init(null) -> source==="empty"，issues 含 DATA_CORRUPT，且存在以 timeline_data_corrupt_ 开头的键', () => {
    const storage = new MemoryStoragePort();
    storage.write(LS_KEY, '{bad');
    const { store, clock } = createTestStore({ storage });
    const res = store.init(null);
    expect(res.source).toBe('empty');
    expect(res.issues.some((i) => i.code === 'DATA_CORRUPT')).toBe(true);
    const corruptKey = `${LS_CORRUPT_PREFIX}${clock.nowMs()}`;
    expect(storage.read(corruptKey)).toBe('{bad');
  });

  it('T6: storage.isAvailable() 返回 false -> init(null) -> view.storageMode==="memory"，issues 含 STORAGE_UNAVAILABLE', () => {
    const storage = new MemoryStoragePort(false);
    const { store } = createTestStore({ storage });
    const res = store.init(null);
    expect(res.storageMode).toBe('memory');
    expect(res.issues.some((i) => i.code === 'STORAGE_UNAVAILABLE')).toBe(true);
    expect(store.getState().view.storageMode).toBe('memory');
  });

  // ==========================================
  // T7 ~ T10: 事件事务与先落盘后提交
  // ==========================================

  it('T7: 正常状态 -> createEvent(合法输入) -> ok，事件数 +1，storage.read 内容已包含该事件', () => {
    const { store, storage } = createTestStore();
    store.init(null);
    const res = store.createEvent({
      date: '2026-11-18',
      title: '新事件T7',
      category: '生活事件',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.event.title).toBe('新事件T7');
      expect(store.getState().data.events).toHaveLength(1);
      const raw = storage.read(LS_KEY);
      expect(raw).not.toBeNull();
      expect(raw).toContain('新事件T7');
      expect(raw).toContain(res.value.event.id);
    }
  });

  it('T8: 同上 -> createEvent(title 为空) -> ok===false，getState().data.events 长度不变，存储未变', () => {
    const { store, storage } = createTestStore();
    store.init(null);
    const initialRaw = storage.read(LS_KEY);
    const res = store.createEvent({
      date: '2026-11-18',
      title: '',
      category: '生活事件',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'title')).toBe(true);
    }
    expect(store.getState().data.events).toHaveLength(0);
    expect(storage.read(LS_KEY)).toBe(initialRaw);
  });

  it('T9: fake storage write 抛 QuotaExceededError -> createEvent(合法) -> ok===false，issues 含 CAPACITY_EXCEEDED，内存与存储均未变', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    store.init(null);
    const initialEvents = store.getState().data.events;
    const initialStorage = storage.read(LS_KEY);

    const quotaErr = new Error('Quota exceeded');
    quotaErr.name = 'QuotaExceededError';
    storage.setThrowOnWrite(null, quotaErr);

    const res = store.createEvent({
      date: '2026-11-18',
      title: '尝试写入的事件',
      category: '生活事件',
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === 'CAPACITY_EXCEEDED')).toBe(true);
    }
    // 内存未变
    expect(store.getState().data.events).toEqual(initialEvents);
    // 存储未变
    expect(storage.read(LS_KEY)).toBe(initialStorage);
  });

  it('T10: 已存在 2 条其他事件关联 A -> deleteEvent(A) -> value.removedRelations===2，其他事件的 relatedIds 不再含 A', () => {
    const { store } = createTestStore();
    store.init(null);
    const eA = store.createEvent({ date: '2026-01-01', title: '事件A', category: '生活事件' });
    const eB = store.createEvent({ date: '2026-01-02', title: '事件B', category: '生活事件' });
    const eC = store.createEvent({ date: '2026-01-03', title: '事件C', category: '生活事件' });
    if (!eA.ok || !eB.ok || !eC.ok) throw new Error('create failed');
    const idA = eA.value.event.id;
    const idB = eB.value.event.id;
    const idC = eC.value.event.id;

    store.setRelations(idB, [idA]);
    store.setRelations(idC, [idA]);

    const delRes = store.deleteEvent(idA);
    expect(delRes.ok).toBe(true);
    if (delRes.ok) {
      expect(delRes.value.removedRelations).toBe(2);
    }
    const eventsAfter = store.getState().data.events;
    expect(eventsAfter.find((e) => e.id === idA)).toBeUndefined();
    const bAfter = eventsAfter.find((e) => e.id === idB);
    const cAfter = eventsAfter.find((e) => e.id === idC);
    expect(bAfter?.relatedIds).toEqual([]);
    expect(cAfter?.relatedIds).toEqual([]);
  });

  // ==========================================
  // T11 ~ T13: 记录与关联不变量
  // ==========================================

  it('T11: 事件已有 20 条记录 -> addRecord -> ok===false，issues 含 TOO_MANY_RECORDS', () => {
    const { store } = createTestStore();
    store.init(null);
    const evRes = store.createEvent({ date: '2026-01-01', title: '事件T11', category: '生活事件' });
    if (!evRes.ok) throw new Error('create failed');
    const eventId = evRes.value.event.id;

    for (let i = 0; i < 20; i++) {
      const r = store.addRecord({
        eventId,
        date: '2026-01-01',
        rating: 3,
        summary: `记录 ${i + 1}`,
      });
      expect(r.ok).toBe(true);
    }

    // 第 21 条
    const r21 = store.addRecord({
      eventId,
      date: '2026-01-01',
      rating: 3,
      summary: '第21条记录',
    });
    expect(r21.ok).toBe(false);
    if (!r21.ok) {
      expect(r21.issues.some((i) => i.code === 'TOO_MANY_RECORDS')).toBe(true);
    }
    const currentEvent = store.getState().data.events.find((e) => e.id === eventId);
    expect(currentEvent?.records).toHaveLength(20);
  });

  it('T12: setRelations(A,[A]) -> ok===false，issues 含 SELF_RELATION', () => {
    const { store } = createTestStore();
    store.init(null);
    const evRes = store.createEvent({ date: '2026-01-01', title: '事件A', category: '生活事件' });
    if (!evRes.ok) throw new Error('create failed');
    const idA = evRes.value.event.id;

    const res = store.setRelations(idA, [idA]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === 'SELF_RELATION')).toBe(true);
    }
  });

  it('T13: A 的关联合计（主动+被动，均不含 B）已为 10 条 -> setRelations(B, [...B的原有关联, A]) -> ok===false，issues 含 TOO_MANY_RELATIONS；A 的结果关联数仍为 10', () => {
    const { store } = createTestStore();
    store.init(null);
    const eA = store.createEvent({ date: '2026-01-01', title: '事件A', category: '生活事件' });
    if (!eA.ok) throw new Error();
    const idA = eA.value.event.id;

    // 创建 10 个其他事件并关联 A (使得 A 的关联合计已为 10 条)
    const otherIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const e = store.createEvent({
        date: `2026-01-${String(i + 2).padStart(2, '0')}`,
        title: `事件O${i}`,
        category: '生活事件',
      });
      if (!e.ok) throw new Error();
      otherIds.push(e.value.event.id);
    }
    store.setRelations(idA, otherIds);

    // 创建事件 B
    const eB = store.createEvent({ date: '2026-02-01', title: '事件B', category: '生活事件' });
    if (!eB.ok) throw new Error();
    const idB = eB.value.event.id;

    // B 尝试关联 A
    const res = store.setRelations(idB, [idA]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === 'TOO_MANY_RELATIONS')).toBe(true);
    }
    // A 的关联数仍为 10
    const aAfter = store.getState().data.events.find((e) => e.id === idA);
    expect(aAfter?.relatedIds).toHaveLength(10);
    const bAfter = store.getState().data.events.find((e) => e.id === idB);
    expect(bAfter?.relatedIds).toEqual([]);
  });

  // ==========================================
  // T14 ~ T17: 导出与导入编排
  // ==========================================

  it('T14: 正常数据 -> exportJson() -> 可被 JSON.parse，events 长度一致，缩进为 2', () => {
    const { store } = createTestStore();
    store.init(null);
    store.createEvent({ date: '2026-01-01', title: 'E1', category: '生活事件' });
    store.createEvent({ date: '2026-01-02', title: 'E2', category: '生活事件' });

    const json = store.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.events).toHaveLength(2);
    expect(json).toContain('\n  "schemaVersion": 1,');
  });

  it('T15: 存储有数据 -> previewImport(mode:"overwrite") -> backupKey 未创建；applyImport 后 storage.read(LS_BACKUP_KEY) 非空', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    store.init(null);
    store.createEvent({ date: '2026-01-01', title: '已有事件', category: '生活事件' });

    const importRaw = JSON.stringify({
      events: [{ date: '2026-02-01', title: '导入的新事件', category: '生活事件' }],
    });

    const preview = store.previewImport({ raw: importRaw, mode: 'overwrite' });
    expect(preview.ok).toBe(true);
    // preview 阶段不写备份
    expect(storage.read(LS_BACKUP_KEY)).toBeNull();

    const applyRes = store.applyImport({ raw: importRaw, mode: 'overwrite' });
    expect(applyRes.ok).toBe(true);
    // apply 后备份非空
    expect(storage.read(LS_BACKUP_KEY)).not.toBeNull();
  });

  it('T16: 导入后字节数 ≥ 4718592 -> applyImport -> ok===false，issues 含 CAPACITY_EXCEEDED，数据未变', () => {
    const { store } = createTestStore();
    store.init(null);
    store.createEvent({ date: '2026-01-01', title: '原事件', category: '生活事件' });
    const beforeEvents = store.getState().data.events;

    // estimateBytes = json.length * 2，构造超 4.5MiB (4718592 字节)
    const bigDetail = 'x'.repeat(2400000);
    const hugeRaw = JSON.stringify({
      events: [
        {
          date: '2026-01-01',
          title: '超大事件',
          category: '生活事件',
          records: [
            {
              date: '2026-01-01',
              rating: 3,
              summary: '超大摘要',
              detail: bigDetail,
            },
          ],
        },
      ],
    });

    const res = store.applyImport({ raw: hugeRaw, mode: 'merge' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === 'CAPACITY_EXCEEDED')).toBe(true);
    }
    expect(store.getState().data.events).toEqual(beforeEvents);
  });

  it('T17: 备份 write 抛错 -> applyImport(overwrite) -> ok===false，issues 含 BACKUP_FAILED，数据未变', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    store.init(null);
    store.createEvent({ date: '2026-01-01', title: '原事件', category: '生活事件' });
    const beforeEvents = store.getState().data.events;

    storage.setThrowOnWrite(LS_BACKUP_KEY, new Error('Backup disk full'));

    const importRaw = JSON.stringify({
      events: [{ date: '2026-02-01', title: '试图覆盖的事件', category: '生活事件' }],
    });

    const res = store.applyImport({ raw: importRaw, mode: 'overwrite' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === 'BACKUP_FAILED')).toBe(true);
    }
    expect(store.getState().data.events).toEqual(beforeEvents);
  });

  // ==========================================
  // T18 ~ T20: 订阅广播与视图状态
  // ==========================================

  it('T18: 订阅后执行任意写操作 -> subscribe 计数 -> 监听器被调用 1 次（不重复广播）', () => {
    const { store } = createTestStore();
    store.init(null);

    let callCount = 0;
    const unsubscribe = store.subscribe(() => {
      callCount++;
    });

    store.createEvent({ date: '2026-01-01', title: '事件', category: '生活事件' });
    expect(callCount).toBe(1);

    unsubscribe();
    store.createEvent({ date: '2026-01-02', title: '事件2', category: '生活事件' });
    expect(callCount).toBe(1);
  });

  it('T19: setSortOrder("asc") -> 再 init（模拟重开） -> 新 state 的 sortOrder==="asc"（持久化到 ui.sortOrder）', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    store.init(null);
    store.setSortOrder('asc');
    expect(store.getState().view.sortOrder).toBe('asc');

    // 模拟重开：新 store 挂在同一 storage
    const store2 = new Store({ storage, clock: new FakeClockPort(), appVersion: '0.0.1' });
    store2.init(null);
    expect(store2.getState().view.sortOrder).toBe('asc');
    expect(store2.getState().data.ui.sortOrder).toBe('asc');
  });

  it('T20: setFilters(...) -> 再 init -> 新 state 的 filters 为默认空（视图筛选不持久化）', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    store.init(null);
    store.setFilters({ keyword: 'keyword_test', minFour: true });
    expect(store.getState().view.filters.keyword).toBe('keyword_test');

    // 模拟重开
    const store2 = new Store({ storage, clock: new FakeClockPort(), appVersion: '0.0.1' });
    store2.init(null);
    expect(store2.getState().view.filters.keyword).toBe('');
    expect(store2.getState().view.filters.minFour).toBe(false);
  });

  // ==========================================
  // T21 ~ T22: 序列化纪律（空 cover 与 detail 不落键）
  // ==========================================

  it('T21: 事件 cover 为空串 -> 任意写操作后读 storage.read -> 序列化结果中不含 "cover" 键', () => {
    const { store, storage } = createTestStore();
    store.init(null);
    const e = store.createEvent({ date: '2026-01-01', title: 'E1', category: '生活事件' });
    if (!e.ok) throw new Error();
    store.updateEvent({ eventId: e.value.event.id, cover: '' });

    const raw = storage.read(LS_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toMatch(/"cover"\s*:/);
  });

  it('T22: 记录的 detail 为 "" -> 同上 -> 不含 "detail" 键', () => {
    const { store, storage } = createTestStore();
    store.init(null);
    const e = store.createEvent({ date: '2026-01-01', title: 'E1', category: '生活事件' });
    if (!e.ok) throw new Error();
    const r = store.addRecord({
      eventId: e.value.event.id,
      date: '2026-01-01',
      rating: 3,
      summary: 'S1',
      detail: '',
    });
    expect(r.ok).toBe(true);

    const raw = storage.read(LS_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toMatch(/"detail"\s*:/);
  });

  // ==========================================
  // 额外健壮性测试：备份恢复、种子重载、内部函数
  // ==========================================

  it('restoreBackup: 无备份返回 ok: true, restored: false', () => {
    const { store } = createTestStore();
    store.init(null);
    const res = store.restoreBackup();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.restored).toBe(false);
    }
  });

  it('restoreBackup: 覆盖后恢复备份成功', () => {
    const storage = new MemoryStoragePort();
    const { store } = createTestStore({ storage });
    store.init(null);
    store.createEvent({ date: '2026-01-01', title: '原始事件', category: '生活事件' });

    const importRaw = JSON.stringify({
      events: [{ date: '2026-02-01', title: '新事件', category: '生活事件' }],
    });
    store.applyImport({ raw: importRaw, mode: 'overwrite' });
    expect(store.getState().data.events[0]?.title).toBe('新事件');

    const restoreRes = store.restoreBackup();
    expect(restoreRes.ok).toBe(true);
    if (restoreRes.ok) {
      expect(restoreRes.value.restored).toBe(true);
    }
    expect(store.getState().data.events[0]?.title).toBe('原始事件');
  });

  it('reloadFromSeed: 合法 seed 重载成功', () => {
    const { store } = createTestStore();
    store.init(null);
    const seedRaw = JSON.stringify({
      events: [{ date: '2026-05-01', title: '种子事件重载', category: '游戏发售' }],
    });
    const res = store.reloadFromSeed(seedRaw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.seeded).toBe(true);
    }
    expect(store.getState().data.events[0]?.title).toBe('种子事件重载');
  });

  it('exportJson 与 storage.read(LS_KEY) 逐字节相同', () => {
    const { store, storage } = createTestStore();
    store.init(null);
    store.createEvent({ date: '2026-01-01', title: '一致性验证事件', category: '生活事件' });
    const exported = store.exportJson();
    const stored = storage.read(LS_KEY);
    expect(exported).toBe(stored);
  });

  it('内部函数 emptyData, normalizeData, serialize, tryParse 正常工作', () => {
    const clock = new FakeClockPort();
    const empty = emptyData(clock);
    expect(empty.schemaVersion).toBe(1);
    expect(empty.events).toHaveLength(0);
    expect(empty.savedAt).toBe(clock.nowIso());

    expect(tryParse('invalid')).toBeNull();
    expect(tryParse('{"a":1}')).toEqual({ a: 1 });

    const norm = normalizeData(empty);
    expect(norm.categories).toEqual([...PRESET_CATEGORIES]);

    const s = serialize(empty);
    expect(s).toContain('"schemaVersion": 1');
  });
});
