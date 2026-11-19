/**
 * MOD-004: Core 校验与强制转换
 *
 * 两套入口：
 * 1. 表单校验（严格，超长即 error，拒绝保存）
 * 2. 导入校验（宽容，超长截断降级为 warning，保留条目）
 *
 * Traces to: REQ-002 [P0], REQ-003 [P0], REQ-005 [P0], REQ-006 [P2], REQ-011 [P0], REQ-025 [P1]
 */

import {
  DEFAULT_RATING,
  DETAIL_MAX,
  EventInput,
  EventLink,
  Issue,
  IssueCode,
  ISSUE_MESSAGES,
  IssueSeverity,
  LINK_NAME_MAX,
  MAX_LINKS_PER_EVENT,
  MAX_RECORDS_PER_EVENT,
  MAX_RELATIONS_PER_EVENT,
  PersonalRecord,
  Rating,
  RecordInput,
  SUMMARY_MAX,
  TimelineData,
  TimelineEvent,
  TITLE_MAX,
} from './types';
import { isValidDateString } from './date';
import { createId, ID_PATTERN } from './id';

/**
 * 格式化带本地时区偏移的 ISO8601 时间戳字符串
 * 例如：2026-11-18T21:30:00+08:00
 */
function formatLocalIso(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const tzHours = pad(Math.floor(absOffset / 60));
  const tzMinutes = pad(absOffset % 60);

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${tzHours}:${tzMinutes}`;
}

function makeIssue(
  code: IssueCode,
  severity: IssueSeverity,
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
    message: ISSUE_MESSAGES[code],
    ...opts,
  };
}

/**
 * 表单入口：校验新增/编辑事件的输入（严格，超长即 error）
 */
export function validateEventInput(i: EventInput): Issue[] {
  const issues: Issue[] = [];
  if (!i || typeof i !== 'object') {
    issues.push(makeIssue('MISSING_REQUIRED', 'error'));
    return issues;
  }

  // 1. date
  if (typeof i.date !== 'string' || i.date.trim() === '') {
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'date' }));
  } else if (!isValidDateString(i.date.trim())) {
    issues.push(makeIssue('INVALID_DATE', 'error', { field: 'date' }));
  }

  // 2. title
  if (typeof i.title !== 'string' || i.title.trim() === '') {
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'title' }));
  } else if (i.title.length > TITLE_MAX) {
    issues.push(makeIssue('FIELD_TOO_LONG', 'error', { field: 'title' }));
  }

  return issues;
}

/**
 * 表单入口：校验新增/编辑个人记录的输入（严格，超长即 error）
 */
export function validateRecordInput(i: RecordInput): Issue[] {
  const issues: Issue[] = [];
  if (!i || typeof i !== 'object') {
    issues.push(makeIssue('MISSING_REQUIRED', 'error'));
    return issues;
  }

  // 1. date
  if (typeof i.date !== 'string' || i.date.trim() === '') {
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'date' }));
  } else if (!isValidDateString(i.date.trim())) {
    issues.push(makeIssue('INVALID_DATE', 'error', { field: 'date' }));
  }

  // 2. rating: 必须为 1 到 5 的整数
  if (
    i.rating === undefined ||
    i.rating === null ||
    typeof i.rating !== 'number' ||
    !Number.isInteger(i.rating) ||
    i.rating < 1 ||
    i.rating > 5
  ) {
    issues.push(makeIssue('RATING_OUT_OF_RANGE', 'error', { field: 'rating' }));
  }

  // 3. summary
  if (typeof i.summary !== 'string' || i.summary.trim() === '') {
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'summary' }));
  } else if (i.summary.length > SUMMARY_MAX) {
    issues.push(makeIssue('FIELD_TOO_LONG', 'error', { field: 'summary' }));
  }

  // 4. detail (可选)
  if (i.detail !== undefined && i.detail !== null && typeof i.detail === 'string') {
    if (i.detail.length > DETAIL_MAX) {
      issues.push(makeIssue('FIELD_TOO_LONG', 'error', { field: 'detail' }));
    }
  }

  return issues;
}

/**
 * 链接协议校验：仅支持 http:// 或 https://
 */
export function validateUrlScheme(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 封面校验：允许 http:、https:、data:image/ 三种前缀，其余报 INVALID_URL_SCHEME
 */
export function validateCover(value: string): Issue[] {
  if (typeof value !== 'string') {
    return [makeIssue('INVALID_URL_SCHEME', 'error', { field: 'cover' })];
  }
  if (!value) {
    return [];
  }
  if (value.startsWith('data:image/')) {
    return [];
  }
  if (validateUrlScheme(value)) {
    return [];
  }
  return [makeIssue('INVALID_URL_SCHEME', 'error', { field: 'cover' })];
}

/**
 * 导入入口：单条记录宽松校验 + 强制转换
 */
export function coerceRecord(
  raw: unknown,
  index: number
): { record: PersonalRecord | null; issues: Issue[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      record: null,
      issues: [makeIssue('MISSING_REQUIRED', 'error', { index })],
    };
  }

  const r = raw as Record<string, any>;
  const issues: Issue[] = [];
  let hasError = false;

  // 1. id
  let id: string;
  if (typeof r.id === 'string' && ID_PATTERN.test(r.id)) {
    id = r.id;
  } else {
    id = createId('rec', Date.now(), Math.random);
    issues.push(makeIssue('ID_REGENERATED', 'warning', { field: 'id', recordId: id, index }));
  }

  // 2. date
  let date = '';
  if (typeof r.date !== 'string' || r.date.trim() === '') {
    hasError = true;
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'date', recordId: id, index }));
  } else if (!isValidDateString(r.date.trim())) {
    hasError = true;
    issues.push(makeIssue('INVALID_DATE', 'error', { field: 'date', recordId: id, index }));
  } else {
    date = r.date.trim();
  }

  // 3. summary
  let summary = '';
  if (typeof r.summary !== 'string' || r.summary.trim() === '') {
    hasError = true;
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'summary', recordId: id, index }));
  } else if (r.summary.length > SUMMARY_MAX) {
    summary = r.summary.slice(0, SUMMARY_MAX);
    issues.push(makeIssue('FIELD_TRUNCATED', 'warning', { field: 'summary', recordId: id, index }));
  } else {
    summary = r.summary;
  }

  // 4. rating
  let rating: Rating = DEFAULT_RATING;
  if (r.rating !== undefined && r.rating !== null) {
    const num = Number(r.rating);
    if (isNaN(num)) {
      rating = DEFAULT_RATING;
    } else if (num < 1) {
      rating = 1;
      issues.push(makeIssue('RATING_CLAMPED', 'warning', { field: 'rating', recordId: id, index }));
    } else if (num > 5) {
      rating = 5;
      issues.push(makeIssue('RATING_CLAMPED', 'warning', { field: 'rating', recordId: id, index }));
    } else {
      const rounded = Math.round(num);
      const clamped = Math.max(1, Math.min(5, rounded)) as Rating;
      if (clamped !== num) {
        issues.push(makeIssue('RATING_CLAMPED', 'warning', { field: 'rating', recordId: id, index }));
      }
      rating = clamped;
    }
  }

  // 5. detail
  let detail: string | undefined = undefined;
  if (typeof r.detail === 'string' && r.detail.length > 0) {
    if (r.detail.length > DETAIL_MAX) {
      detail = r.detail.slice(0, DETAIL_MAX);
      issues.push(makeIssue('FIELD_TRUNCATED', 'warning', { field: 'detail', recordId: id, index }));
    } else {
      detail = r.detail;
    }
  }

  // 6. createdAt & updatedAt
  const createdAt =
    typeof r.createdAt === 'string' && r.createdAt.length > 0
      ? r.createdAt
      : formatLocalIso(new Date());
  const updatedAt =
    typeof r.updatedAt === 'string' && r.updatedAt.length > 0
      ? r.updatedAt
      : createdAt;

  if (hasError) {
    return { record: null, issues };
  }

  const record: PersonalRecord = {
    id,
    date,
    rating,
    summary,
    ...(detail !== undefined ? { detail } : {}),
    createdAt,
    updatedAt,
  };

  return { record, issues };
}

/**
 * 导入入口：单条事件宽松校验 + 强制转换
 */
export function coerceEvent(
  raw: unknown,
  index: number
): { event: TimelineEvent | null; issues: Issue[] } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      event: null,
      issues: [makeIssue('MISSING_REQUIRED', 'error', { index })],
    };
  }

  const e = raw as Record<string, any>;
  const issues: Issue[] = [];
  let hasError = false;

  // 1. id
  let id: string;
  if (typeof e.id === 'string' && ID_PATTERN.test(e.id)) {
    id = e.id;
  } else {
    id = createId('evt', Date.now(), Math.random);
    issues.push(makeIssue('ID_REGENERATED', 'warning', { field: 'id', eventId: id, index }));
  }

  // 2. date
  let date = '';
  if (typeof e.date !== 'string' || e.date.trim() === '') {
    hasError = true;
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'date', eventId: id, index }));
  } else if (!isValidDateString(e.date.trim())) {
    hasError = true;
    issues.push(makeIssue('INVALID_DATE', 'error', { field: 'date', eventId: id, index }));
  } else {
    date = e.date.trim();
  }

  // 3. title
  let title = '';
  if (typeof e.title !== 'string' || e.title.trim() === '') {
    hasError = true;
    issues.push(makeIssue('MISSING_REQUIRED', 'error', { field: 'title', eventId: id, index }));
  } else if (e.title.length > TITLE_MAX) {
    title = e.title.slice(0, TITLE_MAX);
    issues.push(makeIssue('FIELD_TRUNCATED', 'warning', { field: 'title', eventId: id, index }));
  } else {
    title = e.title;
  }

  // 4. cover
  let cover: string | undefined = undefined;
  if (typeof e.cover === 'string' && e.cover.length > 0) {
    const coverIssues = validateCover(e.cover);
    if (coverIssues.length > 0) {
      issues.push(
        makeIssue('INVALID_URL_SCHEME', 'warning', { field: 'cover', eventId: id, index })
      );
      cover = undefined;
    } else {
      cover = e.cover;
    }
  }

  // 6. links
  const links: EventLink[] = [];
  if (Array.isArray(e.links)) {
    for (const l of e.links) {
      if (typeof l !== 'object' || l === null) continue;
      const url = typeof l.url === 'string' ? l.url : '';
      if (!validateUrlScheme(url)) {
        issues.push(
          makeIssue('INVALID_URL_SCHEME', 'warning', { field: 'links', eventId: id, index })
        );
        continue;
      }
      let name = typeof l.name === 'string' ? l.name : '';
      if (name.length > LINK_NAME_MAX) {
        name = name.slice(0, LINK_NAME_MAX);
        issues.push(
          makeIssue('FIELD_TRUNCATED', 'warning', { field: 'links', eventId: id, index })
        );
      }
      links.push({ name, url });
    }
    if (links.length > MAX_LINKS_PER_EVENT) {
      issues.push(
        makeIssue('TOO_MANY_LINKS', 'warning', { field: 'links', eventId: id, index })
      );
      links.length = MAX_LINKS_PER_EVENT;
    }
  }

  // 7. relatedIds
  let relatedIds: string[] = [];
  if (Array.isArray(e.relatedIds)) {
    let selfRelated = false;
    for (const rid of e.relatedIds) {
      if (typeof rid !== 'string') continue;
      if (rid === id) {
        selfRelated = true;
        continue;
      }
      if (!relatedIds.includes(rid)) {
        relatedIds.push(rid);
      }
    }
    if (selfRelated) {
      issues.push(
        makeIssue('SELF_RELATION', 'warning', { field: 'relatedIds', eventId: id, index })
      );
    }
    if (relatedIds.length > MAX_RELATIONS_PER_EVENT) {
      issues.push(
        makeIssue('TOO_MANY_RELATIONS', 'warning', { field: 'relatedIds', eventId: id, index })
      );
      relatedIds = relatedIds.slice(0, MAX_RELATIONS_PER_EVENT);
    }
  }

  // 8. records
  const records: PersonalRecord[] = [];
  if (Array.isArray(e.records)) {
    const hadTooMany = e.records.length > MAX_RECORDS_PER_EVENT;
    for (let rIdx = 0; rIdx < e.records.length; rIdx++) {
      const rawRecord = e.records[rIdx];
      const result = coerceRecord(rawRecord, rIdx);
      for (const iss of result.issues) {
        issues.push({
          ...iss,
          eventId: id,
          index,
        });
      }
      if (result.record !== null) {
        records.push(result.record);
      }
    }
    if (records.length > MAX_RECORDS_PER_EVENT) {
      records.length = MAX_RECORDS_PER_EVENT;
    }
    if (hadTooMany) {
      issues.push(
        makeIssue('TOO_MANY_RECORDS', 'warning', { field: 'records', eventId: id, index })
      );
    }
  }

  // 9. createdAt & updatedAt
  const createdAt =
    typeof e.createdAt === 'string' && e.createdAt.length > 0
      ? e.createdAt
      : formatLocalIso(new Date());
  const updatedAt =
    typeof e.updatedAt === 'string' && e.updatedAt.length > 0
      ? e.updatedAt
      : createdAt;

  if (hasError) {
    return { event: null, issues };
  }

  const event: TimelineEvent = {
    id,
    date,
    title,
    ...(cover !== undefined ? { cover } : {}),
    links,
    relatedIds,
    records,
    createdAt,
    updatedAt,
  };

  return { event, issues };
}

/**
 * 导入入口：顶层结构校验与形态补全
 * 接受三种形态：
 * 1. 完整根对象
 * 2. { events: [...] }
 * 3. 裸数组 [...]
 * 后两者补 ui.sortOrder='desc'、savedAt 用当前时间字符串。
 */
export function validateTopShape(
  json: unknown
): { ok: boolean; data: TimelineData | null; issues: Issue[] } {
  if (json === null || json === undefined || typeof json !== 'object') {
    return {
      ok: false,
      data: null,
      issues: [makeIssue('TOP_LEVEL_SHAPE', 'error')],
    };
  }

  // 形态 3: 裸数组
  if (Array.isArray(json)) {
    return {
      ok: true,
      data: {
        schemaVersion: 1,
        appVersion: '0.0.1',
        savedAt: formatLocalIso(new Date()),
        ui: { sortOrder: 'desc' },
        events: json as any,
      },
      issues: [],
    };
  }

  const obj = json as Record<string, any>;

  // 必须包含 events 数组
  if (!Array.isArray(obj.events)) {
    return {
      ok: false,
      data: null,
      issues: [makeIssue('TOP_LEVEL_SHAPE', 'error')],
    };
  }

  // 形态 1 & 2
  const sortOrder = obj.ui?.sortOrder === 'asc' ? 'asc' : 'desc';

  const savedAt =
    typeof obj.savedAt === 'string' && obj.savedAt.length > 0
      ? obj.savedAt
      : formatLocalIso(new Date());

  const appVersion =
    typeof obj.appVersion === 'string' && obj.appVersion.length > 0
      ? obj.appVersion
      : '0.0.1';

  return {
    ok: true,
    data: {
      schemaVersion: 1,
      appVersion,
      savedAt,
      ui: { sortOrder },
      events: obj.events,
    },
    issues: [],
  };
}
