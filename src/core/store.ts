/**
 * MOD-008: Core Store（唯一可变状态容器与事务）
 *
 * 职责：
 * 1. 唯一可变状态容器（AppState = TimelineData + ViewState）
 * 2. 事务式变更（先落盘成功再提交内存，写失败零半完成状态）
 * 3. 订阅广播（一次事务广播一次）
 * 4. 启动与数据损坏处理（另存 snapshot）
 * 5. 导入导出编排与备份恢复
 *
 * 禁令：
 * - 绝不 import src/ui/**
 * - 绝不碰 window/document/localStorage
 * - 绝不使用 setTimeout / requestAnimationFrame
 * - 绝不把 JSON.parse 异常冒出模块
 *
 * Traces to: REQ-001~REQ-025, REQ-007 [P0], REQ-008 [P0], REQ-009 [P0], REQ-010 [P0], REQ-024 [P0]
 */

import {
  AppState,
  CAPACITY_BLOCK_BYTES,
  CATEGORY_MAX,
  ClockPort,
  DETAIL_MAX,
  EventInput,
  EventPatch,
  FilterState,
  ImportMode,
  ImportPreview,
  ImportPreviewItem,
  ImportReport,
  InitResult,
  Issue,
  IssueCode,
  ISSUE_MESSAGES,
  IssueSeverity,
  LINK_NAME_MAX,
  LS_BACKUP_KEY,
  LS_CORRUPT_PREFIX,
  LS_KEY,
  MAX_LINKS_PER_EVENT,
  MAX_RECORDS_PER_EVENT,
  MAX_RELATIONS_PER_EVENT,
  MutationResult,
  PersonalRecord,
  PRESET_CATEGORIES,
  Rating,
  RecordInput,
  RecordPatch,
  SCHEMA_VERSION,
  SortOrder,
  StoragePort,
  StoreDeps,
  SUMMARY_MAX,
  TimelineData,
  TimelineEvent,
  TITLE_MAX,
  ViewState,
} from './types';
import { isValidDateString } from './date';
import { createId } from './id';
import { capacityState, estimateBytes, estimateRemainingImages } from './capacity';
import {
  validateCover,
  validateEventInput,
  validateRecordInput,
  validateTopShape,
  validateUrlScheme,
} from './validate';
import { enforceInvariants, planMerge } from './merge';

export type {
  MutationResult,
  StoreDeps,
  AppState,
  ViewState,
  InitResult,
  EventInput,
  EventPatch,
  RecordInput,
  RecordPatch,
  ImportPreview,
  ImportPreviewItem,
  ImportReport,
};

const DEFAULT_FILTERS: FilterState = {
  categories: [],
  ratings: [],
  minFour: false,
  keyword: '',
};

function makeIssue(
  code: IssueCode,
  severity: IssueSeverity = 'error',
  opts?: {
    field?: string;
    eventId?: string;
    recordId?: string;
    index?: number;
  }
): Issue {
  return {
    code,
    severity,
    message: ISSUE_MESSAGES[code] || '',
    ...opts,
  };
}

function isQuotaError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e === 'object') {
    const err = e as { name?: string; message?: string; code?: number };
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return true;
    }
    if (err.code === 22 || err.code === 1014) {
      return true;
    }
    if (typeof err.message === 'string' && /quota/i.test(err.message)) {
      return true;
    }
  }
  return false;
}

/**
 * 记录比较器：按 (date, createdAt, id) 升序
 */
function compareRecordsAsc(a: PersonalRecord, b: PersonalRecord): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  const aCreated = a.createdAt || '';
  const bCreated = b.createdAt || '';
  if (aCreated !== bCreated) {
    return aCreated < bCreated ? -1 : 1;
  }
  const aId = a.id || '';
  const bId = b.id || '';
  if (aId !== bId) {
    return aId < bId ? -1 : 1;
  }
  return 0;
}

type MutatorResult<T> =
  | { ok: true; value: T; data?: TimelineData }
  | { ok: false; issues: Issue[] };

// ==========================================
// 4 个内部契约函数
// ==========================================

/**
 * JSON.parse 包裹函数，失败返回 null，绝不向外抛出异常
 */
export function tryParse(raw: string): any | null {
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 产出「空事件 + 预设分类 + 默认 ui」的合法根对象
 */
export function emptyData(clock: ClockPort, appVersion = '0.0.1'): TimelineData {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    savedAt: clock.nowIso(),
    categories: [...PRESET_CATEGORIES],
    ui: {
      sortOrder: 'desc',
    },
    events: [],
  };
}

/**
 * 补默认值、去重 categories、剔除空 cover/空 detail 键、按 (date,createdAt,id) 归一化 records 顺序。
 * 所有写路径都必须经过 normalizeData。
 */
export function normalizeData(data: TimelineData): TimelineData {
  if (!data || typeof data !== 'object') {
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: '0.0.1',
      savedAt: '',
      categories: [...PRESET_CATEGORIES],
      ui: { sortOrder: 'desc' },
      events: [],
    };
  }

  // 1. categories 去重
  const rawCategories = Array.isArray(data.categories) ? data.categories : [];
  const categories: string[] = [];
  const seenCats = new Set<string>();
  for (const c of rawCategories) {
    if (typeof c === 'string' && c.trim()) {
      const trimmed = c.trim();
      if (!seenCats.has(trimmed)) {
        seenCats.add(trimmed);
        categories.push(trimmed);
      }
    }
  }
  if (categories.length === 0) {
    categories.push(...PRESET_CATEGORIES);
  }

  // 2. ui.sortOrder
  const sortOrder: SortOrder = data.ui?.sortOrder === 'asc' ? 'asc' : 'desc';

  // 3. events
  const rawEvents = Array.isArray(data.events) ? data.events : [];
  const events: TimelineEvent[] = [];

  for (const e of rawEvents) {
    if (!e || typeof e !== 'object') continue;

    // 规范化 records
    const rawRecords = Array.isArray(e.records) ? e.records : [];
    const records: PersonalRecord[] = [];

    for (const r of rawRecords) {
      if (!r || typeof r !== 'object') continue;

      const normRecord: PersonalRecord = {
        id: r.id || '',
        date: r.date || '',
        rating: r.rating || 3,
        summary: r.summary || '',
        createdAt: r.createdAt || '',
        updatedAt: r.updatedAt || '',
      };

      // 序列化纪律：detail 为空时省略该键（不写 null、不写 ""）
      if (typeof r.detail === 'string' && r.detail.length > 0) {
        normRecord.detail = r.detail;
      }

      records.push(normRecord);
    }

    // 按 (date, createdAt, id) 升序归一化 records 顺序
    records.sort(compareRecordsAsc);

    const normEvent: TimelineEvent = {
      id: e.id || '',
      date: e.date || '',
      title: e.title || '',
      category: e.category || '',
      links: Array.isArray(e.links)
        ? e.links
            .filter((l) => l && typeof l === 'object' && typeof l.name === 'string' && typeof l.url === 'string')
            .map((l) => ({ name: l.name, url: l.url }))
        : [],
      relatedIds: Array.isArray(e.relatedIds)
        ? e.relatedIds.filter((id): id is string => typeof id === 'string' && id !== e.id)
        : [],
      records,
      createdAt: e.createdAt || '',
      updatedAt: e.updatedAt || '',
    };

    // 序列化纪律：cover 为空时省略该键（不写 null、不写 ""）
    if (typeof e.cover === 'string' && e.cover.length > 0) {
      normEvent.cover = e.cover;
    }

    events.push(normEvent);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof data.appVersion === 'string' && data.appVersion ? data.appVersion : '0.0.1',
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    categories,
    ui: { sortOrder },
    events,
  };
}

/**
 * 序列化函数：导出与落盘共用同一份实现，保证两者输出逐字节相同
 */
export function serialize(d: TimelineData): string {
  return JSON.stringify(normalizeData(d), null, 2);
}

// ==========================================
// Store 核心类
// ==========================================

export class Store {
  private deps: StoreDeps;
  private rand: () => number;
  private committed: TimelineData;
  private view: ViewState;
  private storageMode: 'persistent' | 'memory';
  private listeners: Set<(s: AppState) => void> = new Set();

  constructor(deps: StoreDeps) {
    this.deps = deps;
    this.rand = deps.rand ?? Math.random;
    this.storageMode = deps.storage.isAvailable() ? 'persistent' : 'memory';
    this.committed = emptyData(deps.clock, deps.appVersion);

    const initialJson = serialize(this.committed);
    const initialBytes = estimateBytes(initialJson);

    this.view = {
      sortOrder: this.committed.ui.sortOrder,
      filters: { ...DEFAULT_FILTERS },
      expandedIds: new Set<string>(),
      flashId: null,
      storageMode: this.storageMode,
      capacity: {
        bytes: initialBytes,
        level: capacityState(initialBytes),
        remainingImages: estimateRemainingImages(this.committed, initialBytes),
      },
      lastIssue: null,
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // 隔离 listener 异常
      }
    }
  }

  private updateCapacity(): void {
    const json = serialize(this.committed);
    const bytes = estimateBytes(json);
    this.view = {
      ...this.view,
      storageMode: this.storageMode,
      capacity: {
        bytes,
        level: capacityState(bytes),
        remainingImages: estimateRemainingImages(this.committed, bytes),
      },
    };
  }

  /**
   * 变更事务：所有写操作的唯一路径
   * 规则 1：先落盘成功，才更新内存并广播
   * 规则 2：draft 是深拷贝（structuredClone），绝不直接改 committed
   * 规则 3：一次事务只 notify 一次
   */
  private mutate<T>(
    fn: (draft: TimelineData) => MutatorResult<T>
  ): MutationResult<T> {
    const snapshot = this.committed;
    const draft = structuredClone(snapshot);
    const r = fn(draft);
    if (!r.ok) {
      return r;
    }

    const next = normalizeData(r.data ?? draft);
    enforceInvariants(next);
    next.savedAt = this.deps.clock.nowIso();

    const json = JSON.stringify(next, null, 2);
    const bytes = estimateBytes(json);

    const committedJson = JSON.stringify(this.committed, null, 2);
    const committedBytes = estimateBytes(committedJson);

    if (bytes >= CAPACITY_BLOCK_BYTES && bytes > committedBytes) {
      return { ok: false, issues: [makeIssue('CAPACITY_EXCEEDED', 'error')] };
    }

    if (this.storageMode === 'persistent') {
      try {
        this.deps.storage.write(LS_KEY, json);
      } catch (e) {
        if (isQuotaError(e)) {
          return { ok: false, issues: [makeIssue('CAPACITY_EXCEEDED', 'error')] };
        }
        this.storageMode = 'memory';
        return { ok: false, issues: [makeIssue('STORAGE_WRITE_FAILED', 'error')] };
      }
    }

    // 先落盘成功，后提交内存
    this.committed = next;
    this.view = {
      ...this.view,
      storageMode: this.storageMode,
      capacity: {
        bytes,
        level: capacityState(bytes),
        remainingImages: estimateRemainingImages(next, bytes),
      },
    };

    // 一次事务只广播一次
    this.notify();

    return { ok: true, value: r.value };
  }

  // ==========================================
  // 公共接口
  // ==========================================

  public init(seedRaw: string | null): InitResult {
    this.storageMode = this.deps.storage.isAvailable() ? 'persistent' : 'memory';
    const issues: Issue[] = [];

    if (this.storageMode === 'memory') {
      this.committed = emptyData(this.deps.clock, this.deps.appVersion);
      this.updateCapacity();
      issues.push(makeIssue('STORAGE_UNAVAILABLE', 'warning'));
      return { source: 'empty', storageMode: 'memory', issues };
    }

    let raw: string | null = null;
    try {
      raw = this.deps.storage.read(LS_KEY);
    } catch {
      this.storageMode = 'memory';
      issues.push(makeIssue('STORAGE_UNAVAILABLE', 'warning'));
      this.committed = emptyData(this.deps.clock, this.deps.appVersion);
      this.updateCapacity();
      return { source: 'empty', storageMode: 'memory', issues };
    }

    if (raw !== null) {
      const parsed = tryParse(raw);
      if (parsed === null) {
        try {
          this.deps.storage.write(`${LS_CORRUPT_PREFIX}${this.deps.clock.nowMs()}`, raw);
        } catch {
          // 容忍损坏备份写入失败
        }
        issues.push(makeIssue('DATA_CORRUPT', 'error'));
        this.committed = emptyData(this.deps.clock, this.deps.appVersion);
        this.updateCapacity();
        return { source: 'empty', storageMode: this.storageMode, issues };
      }

      const r = validateTopShape(parsed);
      if (r.ok && r.data) {
        this.committed = normalizeData(r.data);
        this.view = {
          ...this.view,
          sortOrder: this.committed.ui.sortOrder,
        };
        this.updateCapacity();
        return { source: 'storage', storageMode: this.storageMode, issues };
      }

      try {
        this.deps.storage.write(`${LS_CORRUPT_PREFIX}${this.deps.clock.nowMs()}`, raw);
      } catch {
        // 容忍损坏备份写入失败
      }
      issues.push(makeIssue('DATA_CORRUPT', 'error'));
      this.committed = emptyData(this.deps.clock, this.deps.appVersion);
      this.updateCapacity();
      return { source: 'empty', storageMode: this.storageMode, issues };
    }

    if (seedRaw !== null) {
      const parsed = tryParse(seedRaw);
      const r = parsed === null ? null : validateTopShape(parsed);
      if (r !== null && r.ok && r.data) {
        this.committed = normalizeData(r.data);
        this.view = {
          ...this.view,
          sortOrder: this.committed.ui.sortOrder,
        };
        try {
          this.deps.storage.write(LS_KEY, serialize(this.committed));
        } catch {
          this.storageMode = 'memory';
          issues.push(makeIssue('STORAGE_WRITE_FAILED', 'warning'));
        }
        this.updateCapacity();
        return { source: 'seed', storageMode: this.storageMode, issues };
      }

      issues.push(makeIssue('SEED_INVALID', 'error'));
      this.committed = emptyData(this.deps.clock, this.deps.appVersion);
      this.updateCapacity();
      return { source: 'empty', storageMode: this.storageMode, issues };
    }

    this.committed = emptyData(this.deps.clock, this.deps.appVersion);
    this.updateCapacity();
    return { source: 'empty', storageMode: this.storageMode, issues };
  }

  public getState(): AppState {
    return {
      data: this.committed,
      view: this.view,
    };
  }

  public subscribe(listener: (s: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ==========================================
  // 事件变更
  // ==========================================

  public createEvent(input: EventInput): MutationResult<{ event: TimelineEvent }> {
    const issues = validateEventInput(input);
    if (issues.length > 0) {
      return { ok: false, issues };
    }

    let createdEvent: TimelineEvent | null = null;
    const res = this.mutate<{ event: TimelineEvent }>((draft) => {
      let id = createId('evt', this.deps.clock.nowMs(), this.rand);
      while (draft.events.some((e) => e.id === id)) {
        id = createId('evt', this.deps.clock.nowMs(), this.rand);
      }

      const date = input.date.trim();
      const title = input.title.trim();
      const category = input.category.trim();

      if (!draft.categories.includes(category)) {
        draft.categories.push(category);
      }

      const event: TimelineEvent = {
        id,
        date,
        title,
        category,
        links: [],
        relatedIds: [],
        records: [],
        createdAt: this.deps.clock.nowIso(),
        updatedAt: this.deps.clock.nowIso(),
      };

      draft.events.push(event);
      createdEvent = event;
      return { ok: true, value: { event }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { event: createdEvent! } };
  }

  public updateEvent(input: { eventId: string } & EventPatch): MutationResult<{ event: TimelineEvent }> {
    const target = this.committed.events.find((e) => e.id === input.eventId);
    if (!target) {
      return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
    }

    const issues: Issue[] = [];
    if (input.date !== undefined) {
      if (typeof input.date !== 'string' || input.date.trim() === '') {
        issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'date', eventId: input.eventId }));
      } else if (!isValidDateString(input.date.trim())) {
        issues.push(makeIssue('INVALID_DATE', 'error', { field: 'date', eventId: input.eventId }));
      }
    }

    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || input.title.trim() === '') {
        issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'title', eventId: input.eventId }));
      } else if (input.title.length > TITLE_MAX) {
        issues.push(makeIssue('FIELD_TOO_LONG', 'error', { field: 'title', eventId: input.eventId }));
      }
    }

    if (input.category !== undefined) {
      if (typeof input.category !== 'string' || input.category.trim() === '') {
        issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'category', eventId: input.eventId }));
      } else if (input.category.trim().length > CATEGORY_MAX) {
        issues.push(makeIssue('FIELD_TOO_LONG', 'error', { field: 'category', eventId: input.eventId }));
      }
    }

    if (input.cover !== undefined && input.cover !== null && input.cover !== '') {
      const coverIssues = validateCover(input.cover);
      if (coverIssues.length > 0) {
        issues.push(...coverIssues.map((i) => ({ ...i, eventId: input.eventId })));
      }
    }

    if (input.links !== undefined) {
      if (input.links.length > MAX_LINKS_PER_EVENT) {
        issues.push(makeIssue('TOO_MANY_LINKS', 'error', { field: 'links', eventId: input.eventId }));
      }
      for (const l of input.links) {
        if (!l || typeof l !== 'object') {
          issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'links', eventId: input.eventId }));
          continue;
        }
        if (typeof l.name !== 'string' || l.name.trim() === '') {
          issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'links.name', eventId: input.eventId }));
        } else if (l.name.length > LINK_NAME_MAX) {
          issues.push(makeIssue('FIELD_TOO_LONG', 'error', { field: 'links.name', eventId: input.eventId }));
        }
        if (typeof l.url !== 'string' || !validateUrlScheme(l.url)) {
          issues.push(makeIssue('INVALID_URL_SCHEME', 'error', { field: 'links.url', eventId: input.eventId }));
        }
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    let updatedEvent: TimelineEvent | null = null;
    const res = this.mutate<{ event: TimelineEvent }>((draft) => {
      const e = draft.events.find((ev) => ev.id === input.eventId);
      if (!e) {
        return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
      }

      if (input.date !== undefined) e.date = input.date.trim();
      if (input.title !== undefined) e.title = input.title.trim();
      if (input.category !== undefined) {
        const cat = input.category.trim();
        if (!draft.categories.includes(cat)) {
          draft.categories.push(cat);
        }
        e.category = cat;
      }
      if (input.cover !== undefined) {
        if (input.cover === null || input.cover === '') {
          delete e.cover;
        } else {
          e.cover = input.cover;
        }
      }
      if (input.links !== undefined) {
        e.links = input.links.map((l) => ({ name: l.name.trim(), url: l.url.trim() }));
      }

      e.updatedAt = this.deps.clock.nowIso();
      updatedEvent = e;
      return { ok: true, value: { event: e }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { event: updatedEvent! } };
  }

  public deleteEvent(eventId: string): MutationResult<{ removedRelations: number }> {
    const target = this.committed.events.find((e) => e.id === eventId);
    if (!target) {
      return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId })] };
    }

    // 视图展开态清理
    if (this.view.expandedIds.has(eventId)) {
      const nextExpanded = new Set(this.view.expandedIds);
      nextExpanded.delete(eventId);
      this.view = { ...this.view, expandedIds: nextExpanded };
    }

    let removedRelations = 0;
    const res = this.mutate<{ removedRelations: number }>((draft) => {
      const idx = draft.events.findIndex((e) => e.id === eventId);
      if (idx < 0) {
        return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId })] };
      }

      for (const other of draft.events) {
        if (other.id === eventId) continue;
        if (Array.isArray(other.relatedIds) && other.relatedIds.includes(eventId)) {
          other.relatedIds = other.relatedIds.filter((id) => id !== eventId);
          other.updatedAt = this.deps.clock.nowIso();
          removedRelations++;
        }
      }

      draft.events.splice(idx, 1);
      return { ok: true, value: { removedRelations }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { removedRelations } };
  }

  // ==========================================
  // 记录变更
  // ==========================================

  public addRecord(input: { eventId: string } & RecordInput): MutationResult<{ record: PersonalRecord }> {
    const target = this.committed.events.find((e) => e.id === input.eventId);
    if (!target) {
      return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
    }

    if ((target.records ?? []).length >= MAX_RECORDS_PER_EVENT) {
      return {
        ok: false,
        issues: [makeIssue('TOO_MANY_RECORDS', 'error', { eventId: input.eventId, field: 'records' })],
      };
    }

    const issues = validateRecordInput(input);
    if (issues.length > 0) {
      return { ok: false, issues: issues.map((i) => ({ ...i, eventId: input.eventId })) };
    }

    let createdRecord: PersonalRecord | null = null;
    const res = this.mutate<{ record: PersonalRecord }>((draft) => {
      const e = draft.events.find((ev) => ev.id === input.eventId);
      if (!e) {
        return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
      }
      if ((e.records ?? []).length >= MAX_RECORDS_PER_EVENT) {
        return {
          ok: false,
          issues: [makeIssue('TOO_MANY_RECORDS', 'error', { eventId: input.eventId, field: 'records' })],
        };
      }

      let recId = createId('rec', this.deps.clock.nowMs(), this.rand);
      while ((e.records ?? []).some((r) => r.id === recId)) {
        recId = createId('rec', this.deps.clock.nowMs(), this.rand);
      }

      const rec: PersonalRecord = {
        id: recId,
        date: input.date.trim(),
        rating: input.rating as Rating,
        summary: input.summary.trim(),
        createdAt: this.deps.clock.nowIso(),
        updatedAt: this.deps.clock.nowIso(),
      };
      if (typeof input.detail === 'string' && input.detail.length > 0) {
        rec.detail = input.detail;
      }

      if (!Array.isArray(e.records)) {
        e.records = [];
      }
      e.records.push(rec);
      e.updatedAt = this.deps.clock.nowIso();
      createdRecord = rec;
      return { ok: true, value: { record: rec }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { record: createdRecord! } };
  }

  public updateRecord(
    input: { eventId: string; recordId: string } & RecordPatch
  ): MutationResult<{ record: PersonalRecord }> {
    const target = this.committed.events.find((e) => e.id === input.eventId);
    if (!target) {
      return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
    }
    const targetRec = (target.records ?? []).find((r) => r.id === input.recordId);
    if (!targetRec) {
      return {
        ok: false,
        issues: [makeIssue('RECORD_NOT_FOUND', 'error', { eventId: input.eventId, recordId: input.recordId })],
      };
    }

    const issues: Issue[] = [];
    if (input.date !== undefined) {
      if (typeof input.date !== 'string' || input.date.trim() === '') {
        issues.push(
          makeIssue('MISSING_REQUIRED', 'error', {
            field: 'date',
            eventId: input.eventId,
            recordId: input.recordId,
          })
        );
      } else if (!isValidDateString(input.date.trim())) {
        issues.push(
          makeIssue('INVALID_DATE', 'error', {
            field: 'date',
            eventId: input.eventId,
            recordId: input.recordId,
          })
        );
      }
    }

    if (input.rating !== undefined) {
      if (
        typeof input.rating !== 'number' ||
        !Number.isInteger(input.rating) ||
        input.rating < 1 ||
        input.rating > 5
      ) {
        issues.push(
          makeIssue('RATING_OUT_OF_RANGE', 'error', {
            field: 'rating',
            eventId: input.eventId,
            recordId: input.recordId,
          })
        );
      }
    }

    if (input.summary !== undefined) {
      if (typeof input.summary !== 'string' || input.summary.trim() === '') {
        issues.push(
          makeIssue('MISSING_REQUIRED', 'error', {
            field: 'summary',
            eventId: input.eventId,
            recordId: input.recordId,
          })
        );
      } else if (input.summary.length > SUMMARY_MAX) {
        issues.push(
          makeIssue('FIELD_TOO_LONG', 'error', {
            field: 'summary',
            eventId: input.eventId,
            recordId: input.recordId,
          })
        );
      }
    }

    if (input.detail !== undefined && input.detail !== null && input.detail !== '') {
      if (input.detail.length > DETAIL_MAX) {
        issues.push(
          makeIssue('FIELD_TOO_LONG', 'error', {
            field: 'detail',
            eventId: input.eventId,
            recordId: input.recordId,
          })
        );
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    let updatedRecord: PersonalRecord | null = null;
    const res = this.mutate<{ record: PersonalRecord }>((draft) => {
      const e = draft.events.find((ev) => ev.id === input.eventId);
      if (!e) {
        return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
      }
      const r = (e.records ?? []).find((rec) => rec.id === input.recordId);
      if (!r) {
        return {
          ok: false,
          issues: [makeIssue('RECORD_NOT_FOUND', 'error', { eventId: input.eventId, recordId: input.recordId })],
        };
      }

      if (input.date !== undefined) r.date = input.date.trim();
      if (input.rating !== undefined) r.rating = input.rating as Rating;
      if (input.summary !== undefined) r.summary = input.summary.trim();
      if (input.detail !== undefined) {
        if (input.detail === null || input.detail === '') {
          delete r.detail;
        } else {
          r.detail = input.detail;
        }
      }

      r.updatedAt = this.deps.clock.nowIso();
      e.updatedAt = this.deps.clock.nowIso();
      updatedRecord = r;
      return { ok: true, value: { record: r }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { record: updatedRecord! } };
  }

  public deleteRecord(input: { eventId: string; recordId: string }): MutationResult<null> {
    const target = this.committed.events.find((e) => e.id === input.eventId);
    if (!target) {
      return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
    }
    const targetRec = (target.records ?? []).find((r) => r.id === input.recordId);
    if (!targetRec) {
      return {
        ok: false,
        issues: [makeIssue('RECORD_NOT_FOUND', 'error', { eventId: input.eventId, recordId: input.recordId })],
      };
    }

    const res = this.mutate<null>((draft) => {
      const e = draft.events.find((ev) => ev.id === input.eventId);
      if (!e) {
        return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId: input.eventId })] };
      }
      const idx = (e.records ?? []).findIndex((r) => r.id === input.recordId);
      if (idx < 0) {
        return {
          ok: false,
          issues: [makeIssue('RECORD_NOT_FOUND', 'error', { eventId: input.eventId, recordId: input.recordId })],
        };
      }

      e.records.splice(idx, 1);
      e.updatedAt = this.deps.clock.nowIso();
      return { ok: true, value: null, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: null };
  }

  // ==========================================
  // 关联 / 分类
  // ==========================================

  public setRelations(eventId: string, relatedIds: string[]): MutationResult<{ event: TimelineEvent }> {
    const target = this.committed.events.find((e) => e.id === eventId);
    if (!target) {
      return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId })] };
    }

    if (relatedIds.includes(eventId)) {
      return { ok: false, issues: [makeIssue('SELF_RELATION', 'error', { eventId, field: 'relatedIds' })] };
    }

    const distinctRelatedIds = Array.from(new Set(relatedIds));

    // 校验不变量：关联总数（主动 + 被动）<= 10
    const hypothetical = this.committed.events.map((e) => {
      if (e.id === eventId) {
        return { ...e, relatedIds: distinctRelatedIds };
      }
      return e;
    });

    for (const e of hypothetical) {
      const active = new Set(e.relatedIds.filter((id) => id !== e.id));
      const passive = new Set(
        hypothetical
          .filter((other) => other.id !== e.id && other.relatedIds.includes(e.id))
          .map((other) => other.id)
      );
      const combined = new Set([...active, ...passive]);
      if (combined.size > MAX_RELATIONS_PER_EVENT) {
        return {
          ok: false,
          issues: [makeIssue('TOO_MANY_RELATIONS', 'error', { eventId: e.id, field: 'relatedIds' })],
        };
      }
    }

    let updatedEvent: TimelineEvent | null = null;
    const res = this.mutate<{ event: TimelineEvent }>((draft) => {
      const e = draft.events.find((ev) => ev.id === eventId);
      if (!e) {
        return { ok: false, issues: [makeIssue('EVENT_NOT_FOUND', 'error', { eventId })] };
      }

      e.relatedIds = distinctRelatedIds;
      e.updatedAt = this.deps.clock.nowIso();
      updatedEvent = e;
      return { ok: true, value: { event: e }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { event: updatedEvent! } };
  }

  public addCategory(name: string): MutationResult<{ categories: string[] }> {
    if (typeof name !== 'string' || name.trim() === '') {
      return { ok: false, issues: [makeIssue('MISSING_REQUIRED', 'error', { field: 'category' })] };
    }
    const trimmed = name.trim();
    if (trimmed.length > CATEGORY_MAX) {
      return { ok: false, issues: [makeIssue('FIELD_TOO_LONG', 'error', { field: 'category' })] };
    }
    if (this.committed.categories.includes(trimmed)) {
      return { ok: false, issues: [makeIssue('CATEGORY_EXISTS', 'error', { field: 'category' })] };
    }

    let updatedCategories: string[] = [];
    const res = this.mutate<{ categories: string[] }>((draft) => {
      if (draft.categories.includes(trimmed)) {
        return { ok: false, issues: [makeIssue('CATEGORY_EXISTS', 'error', { field: 'category' })] };
      }
      draft.categories.push(trimmed);
      updatedCategories = draft.categories;
      return { ok: true, value: { categories: draft.categories }, data: draft };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }
    return { ok: true, value: { categories: updatedCategories } };
  }

  // ==========================================
  // 视图变更（不进持久化，除 sortOrder）
  // ==========================================

  public setSortOrder(order: SortOrder): void {
    const prevOrder = this.view.sortOrder;
    this.view = {
      ...this.view,
      sortOrder: order,
    };
    const res = this.mutate<null>((draft) => {
      draft.ui.sortOrder = order;
      return { ok: true, value: null, data: draft };
    });
    if (!res.ok) {
      this.view = {
        ...this.view,
        sortOrder: prevOrder,
      };
    }
  }

  public setFilters(patch: Partial<FilterState>): void {
    this.view = {
      ...this.view,
      filters: {
        ...this.view.filters,
        ...patch,
      },
    };
    this.notify();
  }

  public clearFilters(): void {
    this.view = {
      ...this.view,
      filters: { ...DEFAULT_FILTERS },
    };
    this.notify();
  }

  public toggleExpanded(eventId: string): void {
    const next = new Set(this.view.expandedIds);
    if (next.has(eventId)) {
      next.delete(eventId);
    } else {
      next.add(eventId);
    }
    this.view = {
      ...this.view,
      expandedIds: next,
    };
    this.notify();
  }

  public flash(eventId: string | null): void {
    this.view = {
      ...this.view,
      flashId: eventId,
    };
    this.notify();
  }

  public setLastIssue(issue: Issue | null): void {
    this.view = {
      ...this.view,
      lastIssue: issue,
    };
    this.notify();
  }

  // ==========================================
  // 导入导出
  // ==========================================

  public exportJson(): string {
    return serialize(this.committed);
  }

  public previewImport(input: { raw: string; mode: ImportMode }): MutationResult<ImportPreview> {
    if (typeof input.raw !== 'string' || input.raw.trim() === '') {
      return { ok: false, issues: [makeIssue('EMPTY_FILE', 'error')] };
    }

    const parsed = tryParse(input.raw);
    if (parsed === null) {
      return { ok: false, issues: [makeIssue('JSON_SYNTAX', 'error')] };
    }

    const shapeResult = validateTopShape(parsed);
    if (!shapeResult.ok || !shapeResult.data) {
      return { ok: false, issues: shapeResult.issues };
    }

    const { preview } = planMerge(this.committed, shapeResult.data, input.mode);
    return { ok: true, value: preview };
  }

  public applyImport(input: { raw: string; mode: ImportMode }): MutationResult<ImportReport> {
    if (typeof input.raw !== 'string' || input.raw.trim() === '') {
      return { ok: false, issues: [makeIssue('EMPTY_FILE', 'error')] };
    }

    const parsed = tryParse(input.raw);
    if (parsed === null) {
      return { ok: false, issues: [makeIssue('JSON_SYNTAX', 'error')] };
    }

    const shapeResult = validateTopShape(parsed);
    if (!shapeResult.ok || !shapeResult.data) {
      return { ok: false, issues: shapeResult.issues };
    }

    const { next, preview } = planMerge(this.committed, shapeResult.data, input.mode);

    if (preview.blockedByCapacity) {
      return { ok: false, issues: [makeIssue('CAPACITY_EXCEEDED', 'error')] };
    }

    if (input.mode === 'overwrite' && this.storageMode === 'persistent') {
      const currentJson = serialize(this.committed);
      try {
        this.deps.storage.write(LS_BACKUP_KEY, currentJson);
      } catch {
        return { ok: false, issues: [makeIssue('BACKUP_FAILED', 'error')] };
      }
    }

    const res = this.mutate<null>((_draft) => {
      return { ok: true, value: null, data: next };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }

    const report: ImportReport = {
      mode: input.mode,
      applied: preview.counts,
      backupKey: input.mode === 'overwrite' ? LS_BACKUP_KEY : null,
      bytes: preview.postBytes,
    };

    return { ok: true, value: report };
  }

  public restoreBackup(): MutationResult<{ restored: boolean }> {
    if (this.storageMode !== 'persistent') {
      return { ok: true, value: { restored: false } };
    }

    let raw: string | null = null;
    try {
      raw = this.deps.storage.read(LS_BACKUP_KEY);
    } catch {
      return { ok: true, value: { restored: false } };
    }

    if (raw === null) {
      return { ok: true, value: { restored: false } };
    }

    const parsed = tryParse(raw);
    if (parsed === null) {
      return { ok: false, issues: [makeIssue('DATA_CORRUPT', 'error')] };
    }

    const r = validateTopShape(parsed);
    if (!r.ok || !r.data) {
      return { ok: false, issues: [makeIssue('DATA_CORRUPT', 'error')] };
    }

    const restoredData = normalizeData(r.data);
    const res = this.mutate<null>((_draft) => {
      return { ok: true, value: null, data: restoredData };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }

    return { ok: true, value: { restored: true } };
  }

  public reloadFromSeed(seedRaw: string | null): MutationResult<{ seeded: boolean }> {
    if (seedRaw === null) {
      return { ok: true, value: { seeded: false } };
    }

    const parsed = tryParse(seedRaw);
    const r = parsed === null ? null : validateTopShape(parsed);
    if (r === null || !r.ok || !r.data) {
      return { ok: false, issues: [makeIssue('SEED_INVALID', 'error')] };
    }

    const seededData = normalizeData(r.data);
    const res = this.mutate<null>((_draft) => {
      return { ok: true, value: null, data: seededData };
    });

    if (!res.ok) {
      return { ok: false, issues: res.issues };
    }

    return { ok: true, value: { seeded: true } };
  }
}
