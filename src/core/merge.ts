/**
 * MOD-005: Core 合并与不变量裁剪
 *
 * 负责导入的两种模式（合并去重 / 全量覆盖）、不变量裁剪（记录 ≤20、关联 ≤10）与差异预览生成。
 * 纯逻辑模块：无存储写入、无备份操作、不修改入参、不抛异常。
 *
 * Traces to: REQ-010 [P0], REQ-011 [P0], REQ-019 [P0]
 */

import {
  CAPACITY_BLOCK_BYTES,
  CATEGORY_MAX,
  ImportMode,
  ImportPreview,
  ImportPreviewItem,
  Issue,
  ISSUE_MESSAGES,
  MAX_RECORDS_PER_EVENT,
  MAX_RELATIONS_PER_EVENT,
  PersonalRecord,
  PRESET_CATEGORIES,
  TimelineData,
  TimelineEvent,
  TITLE_MAX,
} from './types';
import { isValidDateString } from './date';
import { createId, ID_PATTERN } from './id';
import { estimateBytes } from './capacity';

export type { ImportMode };

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

/**
 * 事件比较器：按 (date, createdAt, id) 升序
 */
function compareEventsAsc(a: TimelineEvent, b: TimelineEvent): number {
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

/**
 * 分类合并：预设在前、自定义按加入顺序追加并去重
 */
function mergeCategories(localCats: string[] = [], incomingCats: string[] = []): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const c of localCats) {
    if (typeof c === 'string' && c.trim()) {
      const trimmed = c.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }

  for (const c of incomingCats) {
    if (typeof c === 'string' && c.trim()) {
      const trimmed = c.trim();
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }

  return result;
}

/**
 * 生成不与当前已知 ID 冲突的新事件 ID
 */
function generateUniqueEventId(knownIds: Set<string>): string {
  let id = createId('evt', Date.now(), Math.random);
  while (knownIds.has(id)) {
    id = createId('evt', Date.now(), Math.random);
  }
  knownIds.add(id);
  return id;
}

/**
 * 不变量裁剪：
 * 1. 单事件 records ≤ 20，按 (date, createdAt, id) 升序保留前 20 条，丢弃靠后者
 * 2. 关联合计（主动 + 被动）≤ 10，超出时按目标事件 (date, createdAt, id) 升序保留前 10 个关联，丢弃靠后者
 * 3. 清理自关联与重复关联
 *
 * 返回被丢弃的记录数、关联数，以及受影响（被裁剪修改）的事件 ID 列表。
 */
export function enforceInvariants(data: TimelineData): {
  droppedRecords: number;
  droppedRelations: number;
  affectedEventIds: string[];
} {
  if (!data || !Array.isArray(data.events)) {
    return {
      droppedRecords: 0,
      droppedRelations: 0,
      affectedEventIds: [],
    };
  }

  let droppedRecords = 0;
  let droppedRelations = 0;
  const affected = new Set<string>();

  // 1. 裁剪 records
  for (const e of data.events) {
    if (!Array.isArray(e.records)) {
      e.records = [];
    }
    if (e.records.length > MAX_RECORDS_PER_EVENT) {
      e.records.sort(compareRecordsAsc);
      const excess = e.records.length - MAX_RECORDS_PER_EVENT;
      droppedRecords += excess;
      e.records = e.records.slice(0, MAX_RECORDS_PER_EVENT);
      affected.add(e.id);
    }
  }

  // 2. 清理自关联与重复关联
  for (const e of data.events) {
    if (!Array.isArray(e.relatedIds)) {
      e.relatedIds = [];
      continue;
    }
    const origLen = e.relatedIds.length;
    const filtered: string[] = [];
    const seen = new Set<string>();
    for (const rid of e.relatedIds) {
      if (typeof rid === 'string' && rid !== e.id && !seen.has(rid)) {
        seen.add(rid);
        filtered.push(rid);
      }
    }
    if (filtered.length !== origLen) {
      e.relatedIds = filtered;
      affected.add(e.id);
    }
  }

  // 3. 裁剪关联数（主动 + 被动合计 ≤ 10）
  // 按 (date, createdAt, id) 升序排列所有事件，保证裁剪判定确定性
  const sortedEvents = [...data.events].sort(compareEventsAsc);
  const knownEventMap = new Map<string, TimelineEvent>();
  for (const e of data.events) {
    knownEventMap.set(e.id, e);
  }

  for (const e of sortedEvents) {
    // 找出所有与 e 产生关联的已知事件（主动或被动）
    const validNeighbors: TimelineEvent[] = [];
    for (const other of data.events) {
      if (other.id === e.id) continue;
      const eToOther = e.relatedIds.includes(other.id);
      const otherToE = other.relatedIds.includes(e.id);
      if (eToOther || otherToE) {
        validNeighbors.push(other);
      }
    }

    if (validNeighbors.length > MAX_RELATIONS_PER_EVENT) {
      // 保留 (date, createdAt, id) 升序靠前者，丢弃靠后者
      validNeighbors.sort(compareEventsAsc);
      const toDrop = validNeighbors.slice(MAX_RELATIONS_PER_EVENT);

      for (const target of toDrop) {
        let edgeRemoved = false;
        // 若 e 主动关联了 target，解除
        if (e.relatedIds.includes(target.id)) {
          e.relatedIds = e.relatedIds.filter((id) => id !== target.id);
          affected.add(e.id);
          edgeRemoved = true;
        }
        // 若 target 主动关联了 e（对 e 是被动关联），解除
        if (target.relatedIds.includes(e.id)) {
          target.relatedIds = target.relatedIds.filter((id) => id !== e.id);
          affected.add(target.id);
          edgeRemoved = true;
        }

        if (edgeRemoved) {
          droppedRelations += 1;
          affected.add(e.id);
        }
      }
    }

    // 针对悬空关联（指向不存在的 id），若主动关联数组长度仍然超限，做兜底截断
    if (e.relatedIds.length > MAX_RELATIONS_PER_EVENT) {
      const excess = e.relatedIds.length - MAX_RELATIONS_PER_EVENT;
      droppedRelations += excess;
      e.relatedIds = e.relatedIds.slice(0, MAX_RELATIONS_PER_EVENT);
      affected.add(e.id);
    }
  }

  return {
    droppedRecords,
    droppedRelations,
    affectedEventIds: Array.from(affected).sort(),
  };
}

/**
 * 导入合并规划：
 * - merge 模式：同 id 比 updatedAt，incoming 更新则整条替换，否则 skipped；本地独有保留
 * - overwrite 模式：events 整体替换，但 categories 取并集
 * - 缺失 updatedAt 视为最旧
 * - 不修改 local 与 incoming 原对象
 * - items 最多 200 条，超出置 truncated = true
 */
export function planMerge(
  local: TimelineData,
  incoming: TimelineData,
  mode: ImportMode
): {
  next: TimelineData;
  preview: ImportPreview;
} {
  // 零异常兜底与深拷贝
  const clonedLocal: TimelineData = local && typeof local === 'object'
    ? structuredClone(local)
    : {
        schemaVersion: 1,
        appVersion: '0.0.1',
        savedAt: new Date().toISOString(),
        categories: [...PRESET_CATEGORIES],
        ui: { sortOrder: 'desc' },
        events: [],
      };

  const clonedIncoming: TimelineData = incoming && typeof incoming === 'object'
    ? structuredClone(incoming)
    : {
        schemaVersion: 1,
        appVersion: '0.0.1',
        savedAt: new Date().toISOString(),
        categories: [...PRESET_CATEGORIES],
        ui: { sortOrder: 'desc' },
        events: [],
      };

  if (!Array.isArray(clonedLocal.events)) {
    clonedLocal.events = [];
  }
  if (!Array.isArray(clonedLocal.categories)) {
    clonedLocal.categories = [...PRESET_CATEGORIES];
  }

  const allItems: ImportPreviewItem[] = [];
  const warnings: Issue[] = [];
  const counts = { added: 0, updated: 0, skipped: 0, errors: 0 };

  const allKnownIds = new Set<string>();
  for (const e of clonedLocal.events) {
    if (e && e.id) allKnownIds.add(e.id);
  }

  const localMap = new Map<string, TimelineEvent>();
  for (const e of clonedLocal.events) {
    if (e && e.id) localMap.set(e.id, e);
  }

  const seenIncomingIds = new Set<string>();

  // 下一版本 events 容器
  const nextEvents: TimelineEvent[] =
    mode === 'merge' ? [...clonedLocal.events] : [];

  const incomingEvents = Array.isArray(clonedIncoming.events)
    ? clonedIncoming.events
    : [];

  for (let i = 0; i < incomingEvents.length; i++) {
    const raw = incomingEvents[i];

    // 校验条目有效性
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      counts.errors++;
      allItems.push({
        index: i,
        eventId: null,
        date: '',
        title: '',
        action: 'error',
        code: 'TOP_LEVEL_SHAPE',
        message: ISSUE_MESSAGES.TOP_LEVEL_SHAPE,
      });
      continue;
    }

    const item = raw as Partial<TimelineEvent>;

    // 必填字段缺失校验（缺 title、缺 date、缺 category）
    if (typeof item.title !== 'string' || item.title.trim() === '') {
      counts.errors++;
      allItems.push({
        index: i,
        eventId: typeof item.id === 'string' ? item.id : null,
        date: typeof item.date === 'string' ? item.date : '',
        title: '',
        action: 'error',
        code: 'MISSING_REQUIRED',
        message: ISSUE_MESSAGES.MISSING_REQUIRED,
      });
      continue;
    }

    if (typeof item.date !== 'string' || item.date.trim() === '') {
      counts.errors++;
      allItems.push({
        index: i,
        eventId: typeof item.id === 'string' ? item.id : null,
        date: '',
        title: item.title,
        action: 'error',
        code: 'MISSING_REQUIRED',
        message: ISSUE_MESSAGES.MISSING_REQUIRED,
      });
      continue;
    }

    if (!isValidDateString(item.date.trim())) {
      counts.errors++;
      allItems.push({
        index: i,
        eventId: typeof item.id === 'string' ? item.id : null,
        date: item.date,
        title: item.title,
        action: 'error',
        code: 'INVALID_DATE',
        message: ISSUE_MESSAGES.INVALID_DATE,
      });
      continue;
    }

    if (typeof item.category !== 'string' || item.category.trim() === '') {
      counts.errors++;
      allItems.push({
        index: i,
        eventId: typeof item.id === 'string' ? item.id : null,
        date: item.date,
        title: item.title,
        action: 'error',
        code: 'MISSING_REQUIRED',
        message: ISSUE_MESSAGES.MISSING_REQUIRED,
      });
      continue;
    }

    // 宽容处理超长字段（截断并记录 warning）
    let title = item.title;
    if (title.length > TITLE_MAX) {
      title = title.slice(0, TITLE_MAX);
      warnings.push({
        code: 'FIELD_TRUNCATED',
        severity: 'warning',
        message: ISSUE_MESSAGES.FIELD_TRUNCATED,
        field: 'title',
        eventId: typeof item.id === 'string' ? item.id : undefined,
        index: i,
      });
    }

    let category = item.category.trim();
    if (category.length > CATEGORY_MAX) {
      category = category.slice(0, CATEGORY_MAX);
      warnings.push({
        code: 'FIELD_TRUNCATED',
        severity: 'warning',
        message: ISSUE_MESSAGES.FIELD_TRUNCATED,
        field: 'category',
        eventId: typeof item.id === 'string' ? item.id : undefined,
        index: i,
      });
    }

    if (
      !PRESET_CATEGORIES.includes(category as any) &&
      !clonedLocal.categories.includes(category)
    ) {
      warnings.push({
        code: 'UNKNOWN_CATEGORY_ADDED',
        severity: 'warning',
        message: ISSUE_MESSAGES.UNKNOWN_CATEGORY_ADDED,
        field: 'category',
        eventId: typeof item.id === 'string' ? item.id : undefined,
        index: i,
      });
    }

    // 组装合法事件对象
    const date = item.date.trim();
    let id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id.trim() : '';

    if (!id) {
      id = generateUniqueEventId(allKnownIds);
      warnings.push({
        code: 'ID_REGENERATED',
        severity: 'warning',
        message: ISSUE_MESSAGES.ID_REGENERATED,
        field: 'id',
        eventId: id,
        index: i,
      });
    } else if (seenIncomingIds.has(id)) {
      // 导入文件内同 id 重复（M5）
      const newId = generateUniqueEventId(allKnownIds);
      warnings.push({
        code: 'DUPLICATE_ID_REGENERATED',
        severity: 'warning',
        message: ISSUE_MESSAGES.DUPLICATE_ID_REGENERATED,
        field: 'id',
        eventId: newId,
        index: i,
      });
      id = newId;
    }

    seenIncomingIds.add(id);
    allKnownIds.add(id);

    const event: TimelineEvent = {
      id,
      date,
      title,
      category,
      ...(item.cover ? { cover: item.cover } : {}),
      links: Array.isArray(item.links) ? item.links : [],
      relatedIds: Array.isArray(item.relatedIds) ? item.relatedIds : [],
      records: Array.isArray(item.records) ? item.records : [],
      createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    };

    // 判定动作
    if (mode === 'merge') {
      const localEvent = localMap.get(event.id);
      if (!localEvent) {
        // 本地不存在 -> added
        counts.added++;
        allItems.push({
          index: i,
          eventId: event.id,
          date: event.date,
          title: event.title,
          action: 'added',
        });
        nextEvents.push(event);
        localMap.set(event.id, event);
      } else {
        // 本地存在 -> 比较 updatedAt（ISO 字符串字典序，缺失视为最旧）
        const incomingUpdated = event.updatedAt || '';
        const localUpdated = localEvent.updatedAt || '';
        if (incomingUpdated > localUpdated) {
          // incoming 胜出 -> 整条替换（含 records 集合整体替换）
          counts.updated++;
          allItems.push({
            index: i,
            eventId: event.id,
            date: event.date,
            title: event.title,
            action: 'updated',
          });
          const idx = nextEvents.findIndex((e) => e.id === event.id);
          if (idx >= 0) {
            nextEvents[idx] = event;
          } else {
            nextEvents.push(event);
          }
          localMap.set(event.id, event);
        } else {
          // 本地更新或相同 -> skipped，本地 A 保持原样
          counts.skipped++;
          allItems.push({
            index: i,
            eventId: event.id,
            date: event.date,
            title: event.title,
            action: 'skipped',
          });
        }
      }
    } else {
      // overwrite 模式：events 整体替换
      const localEvent = localMap.get(event.id);
      if (localEvent) {
        counts.updated++;
        allItems.push({
          index: i,
          eventId: event.id,
          date: event.date,
          title: event.title,
          action: 'updated',
        });
      } else {
        counts.added++;
        allItems.push({
          index: i,
          eventId: event.id,
          date: event.date,
          title: event.title,
          action: 'added',
        });
      }
      nextEvents.push(event);
      localMap.set(event.id, event);
    }
  }

  // 分类合并（保留本地自定义分类）
  const mergedCategories = mergeCategories(clonedLocal.categories, clonedIncoming.categories);
  const catSet = new Set(mergedCategories);
  for (const e of nextEvents) {
    if (e.category && !catSet.has(e.category)) {
      catSet.add(e.category);
      mergedCategories.push(e.category);
    }
  }

  const next: TimelineData = {
    schemaVersion: 1,
    appVersion: clonedLocal.appVersion || '0.0.1',
    savedAt: clonedLocal.savedAt || new Date().toISOString(),
    categories: mergedCategories,
    ui: {
      sortOrder: clonedLocal.ui?.sortOrder === 'asc' ? 'asc' : 'desc',
    },
    events: nextEvents,
  };

  // 执行不变量裁剪（记录 ≤20、关联 ≤10）
  const invReport = enforceInvariants(next);
  if (invReport.droppedRecords > 0) {
    warnings.push({
      code: 'TOO_MANY_RECORDS',
      severity: 'warning',
      message: ISSUE_MESSAGES.TOO_MANY_RECORDS,
      field: 'records',
    });
  }
  if (invReport.droppedRelations > 0) {
    warnings.push({
      code: 'TOO_MANY_RELATIONS',
      severity: 'warning',
      message: ISSUE_MESSAGES.TOO_MANY_RELATIONS,
      field: 'relatedIds',
    });
  }

  // 容量估算与水位判定
  const json = JSON.stringify(next);
  const postBytes = estimateBytes(json);
  const blockedByCapacity = postBytes >= CAPACITY_BLOCK_BYTES;

  const preview: ImportPreview = {
    mode,
    counts,
    items: allItems.slice(0, 200),
    truncated: allItems.length > 200,
    droppedRecords: invReport.droppedRecords,
    droppedRelations: invReport.droppedRelations,
    affectedEventIds: invReport.affectedEventIds,
    postBytes,
    blockedByCapacity,
    warnings,
  };

  return { next, preview };
}
