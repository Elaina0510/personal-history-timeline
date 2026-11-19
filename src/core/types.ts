/**
 * MOD-001: 全项目唯一类型真相源（SSOT）
 * 包含全部类型、接口、常量、枚举与文案映射。
 * 零运行时代码：无函数、无副作用。
 */

// ==========================================
// §4.1 持久化根对象与偏好
// ==========================================

export type SortOrder = 'desc' | 'asc';

export interface UiPrefs {
  sortOrder: SortOrder;
}

export interface TimelineData {
  schemaVersion: 1;
  appVersion: string;        // '0.0.1'
  savedAt: string;           // ISO8601 带本地时区偏移，如 '2026-11-18T21:30:00+08:00'
  ui: UiPrefs;
  events: TimelineEvent[];   // 不保证有序；展示前由 select.buildCards 排序分组
}

// ==========================================
// §4.2 事件与链接
// ==========================================

export interface EventLink {
  name: string;              // 1..20
  url: string;               // 仅 http: / https:
}

export interface TimelineEvent {
  id: string;                // ^(evt)_\d{13}_[0-9a-z]{6}$ ，创建后不可变
  date: string;              // 'YYYY-MM-DD'，事件发生日期
  title: string;             // 1..60
  cover?: string;            // 缺省 = 无图
  links: EventLink[];        // 0..10，缺省写 []
  relatedIds: string[];      // 0..10，缺省写 []，不得含自身
  records: PersonalRecord[]; // 0..20
  createdAt: string;         // ISO8601
  updatedAt: string;         // ISO8601，每次保存刷新
}

// ==========================================
// §4.3 记录与星级
// ==========================================

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface PersonalRecord {
  id: string;                // ^(rec)_\d{13}_[0-9a-z]{6}$
  date: string;              // 'YYYY-MM-DD'，记录日期，与事件日期先后不设限制（REQ Assumptions）
  rating: Rating;            // 必填，默认 3
  summary: string;           // 1..80，卡片折叠态展示
  detail?: string;           // 0..2000，缺省 = 无碎碎念
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// §4.5 常量
// ==========================================

export const LS_KEY = 'timeline_data_v1';
export const LS_BACKUP_KEY = 'timeline_backup_v1';        // 全量覆盖前快照
export const LS_CORRUPT_PREFIX = 'timeline_data_corrupt_'; // + <epochMs>

export const MAX_RECORDS_PER_EVENT = 20;
export const MAX_LINKS_PER_EVENT = 10;
export const MAX_RELATIONS_PER_EVENT = 10;

export const MAX_COVER_BYTES = 300 * 1024;      // 压缩后单图上限
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 原始文件上限
export const COVER_MAX_EDGE = 1280;
export const JPEG_QUALITIES = [0.8, 0.6] as const;

export const CAPACITY_WARN_BYTES = 4 * 1024 * 1024;   // 4 MiB
export const CAPACITY_BLOCK_BYTES = Math.floor(4.5 * 1024 * 1024); // 4718592

export const TITLE_MAX = 60;
export const SUMMARY_MAX = 80;
export const DETAIL_MAX = 2000;
export const LINK_NAME_MAX = 20;

export const SEARCH_DEBOUNCE_MS = 300;
export const FLASH_DURATION_MS = 2000;
export const TOAST_DURATION_MS = 2000;
export const DEFAULT_RATING = 3;

export const SCHEMA_VERSION = 1;

// ==========================================
// §5.1 状态、变更与导入导出契约
// ==========================================

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Issue[] };

export interface StoreDeps {
  storage: StoragePort;
  clock: ClockPort;
  appVersion: string;
  rand?: () => number;   // 默认 Math.random，测试注入
}

export interface FilterState {
  ratings: Rating[];
  minFour: boolean;
  keyword: string;
}

export interface ViewState {
  readonly sortOrder: SortOrder;
  readonly filters: FilterState;
  readonly flashId: string | null;
  readonly storageMode: 'persistent' | 'memory';
  readonly capacity: { bytes: number; level: 'ok' | 'warn' | 'block'; remainingImages: number };
  readonly lastIssue: Issue | null;       // 最近一次 UI 需要提示的错误
}

export interface AppState {
  readonly data: TimelineData;
  readonly view: ViewState;
}

export interface InitResult {
  source: 'storage' | 'seed' | 'empty';
  storageMode: 'persistent' | 'memory';
  issues: Issue[];        // 可能含 STORAGE_UNAVAILABLE / DATA_CORRUPT / SEED_INVALID
}

export interface EventInput {
  date: string;
  title: string;
}

export interface EventPatch {
  date?: string;
  title?: string;
  cover?: string | null;      // null = 清除封面
  links?: EventLink[];        // 整体替换
}

export interface RecordInput {
  date: string;
  rating: number;
  summary: string;
  detail?: string;
}

export interface RecordPatch {
  date?: string;
  rating?: number;
  summary?: string;
  detail?: string | null;
}

export type ImportMode = 'merge' | 'overwrite';

export interface ImportPreviewItem {
  index: number;
  eventId: string | null;
  date: string;
  title: string;
  action: 'added' | 'updated' | 'skipped' | 'error';
  code?: IssueCode;
  message?: string;
}

export interface ImportPreview {
  mode: ImportMode;
  counts: { added: number; updated: number; skipped: number; errors: number };
  items: ImportPreviewItem[];   // 最多 200 条
  truncated: boolean;
  droppedRecords: number;
  droppedRelations: number;
  affectedEventIds: string[];
  postBytes: number;
  blockedByCapacity: boolean;
  warnings: Issue[];
}

export interface ImportReport {
  mode: ImportMode;
  applied: { added: number; updated: number; skipped: number; errors: number };
  backupKey: string | null;   // 'timeline_backup_v1' 或 null（合并模式不备份）
  bytes: number;
}

// ==========================================
// §5.2 Port 接口
// ==========================================

export interface StoragePort {
  read(key: string): string | null;
  write(key: string, value: string): void;   // 失败必须 throw（QuotaExceededError 等）
  remove(key: string): void;
  isAvailable(): boolean;
}

export interface ClockPort {
  nowMs(): number;
  nowIso(): string;   // 带本地时区偏移的 ISO8601
}

// ==========================================
// §5.3 Issue、IssueSeverity 与 IssueCode
// ==========================================

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;           // 面向用户的中文文案，来自 ISSUE_MESSAGES
  field?: string;
  eventId?: string;
  recordId?: string;
  index?: number;            // 导入条目序号
}

export type IssueCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_DATE'
  | 'RATING_OUT_OF_RANGE'
  | 'TOO_MANY_RECORDS'
  | 'TOO_MANY_LINKS'
  | 'TOO_MANY_RELATIONS'
  | 'SELF_RELATION'
  | 'INVALID_URL_SCHEME'
  | 'FIELD_TOO_LONG'
  | 'FIELD_TRUNCATED'
  | 'RATING_CLAMPED'
  | 'ID_REGENERATED'
  | 'DUPLICATE_ID_REGENERATED'
  | 'JSON_SYNTAX'
  | 'TOP_LEVEL_SHAPE'
  | 'EMPTY_FILE'
  | 'SEED_INVALID'
  | 'DATA_CORRUPT'
  | 'CAPACITY_EXCEEDED'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_WRITE_FAILED'
  | 'BACKUP_FAILED'
  | 'EVENT_NOT_FOUND'
  | 'RECORD_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILE_TYPE'
  | 'COVER_TOO_LARGE';

// ==========================================
// §7.2.1 ISSUE_MESSAGES 映射表
// ==========================================

export const ISSUE_MESSAGES: Record<IssueCode, string> = {
  MISSING_REQUIRED: '此项为必填',
  INVALID_DATE: '请输入有效日期',
  RATING_OUT_OF_RANGE: '星级必须在 1 到 5 之间',
  TOO_MANY_RECORDS: '单条事件最多 20 条记录',
  TOO_MANY_LINKS: '单条事件最多 10 个外部链接',
  TOO_MANY_RELATIONS: '最多关联 10 条事件',
  SELF_RELATION: '不能关联事件自身',
  INVALID_URL_SCHEME: '链接仅支持 http:// 或 https://',
  FIELD_TOO_LONG: '内容超出长度上限',
  FIELD_TRUNCATED: '内容超长，已截断保存',
  RATING_CLAMPED: '星级超出范围，已按边界值保存',
  ID_REGENERATED: '标识缺失，已重新生成',
  DUPLICATE_ID_REGENERATED: '标识重复，已重新生成',
  JSON_SYNTAX: 'JSON 格式错误，无法解析',
  TOP_LEVEL_SHAPE: '数据结构不符合要求',
  EMPTY_FILE: '文件内容为空',
  SEED_INVALID: '初始数据结构有误，已跳过加载',
  DATA_CORRUPT: '本地数据无法解析，已备份为损坏快照',
  CAPACITY_EXCEEDED: '本地存储空间已满，请改用图片链接或删除旧配图',
  STORAGE_UNAVAILABLE: '当前浏览器禁用了本地存储，刷新后数据会丢失，请立即导出备份',
  STORAGE_WRITE_FAILED: '保存失败，本次修改已回滚',
  BACKUP_FAILED: '备份失败，已取消覆盖操作',
  EVENT_NOT_FOUND: '事件不存在或已被删除',
  RECORD_NOT_FOUND: '记录不存在或已被删除',
  FILE_TOO_LARGE: '图片过大（超过 10MB），请压缩后再试',
  INVALID_FILE_TYPE: '请选择图片文件',
  COVER_TOO_LARGE: '图片过大，请压缩后上传或改用图片链接',
};
