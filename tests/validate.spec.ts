import { describe, expect, it } from 'vitest';
import {
  coerceEvent,
  coerceRecord,
  validateCover,
  validateEventInput,
  validateRecordInput,
  validateTopShape,
  validateUrlScheme,
} from '../src/core/validate';
import { ID_PATTERN } from '../src/core/id';

describe('MOD-004 validate: §8.2 V1, V3~V16, V18~V20, V3b, V3c, V-A1, V-A2', () => {
  // ==========================================
  // 表单入口校验
  // ==========================================

  it('V1: validateEventInput - title 为空报 MISSING_REQUIRED', () => {
    const issues = validateEventInput({
      date: '2026-11-18',
      title: '',
    });
    const issue = issues.find((i) => i.field === 'title' && i.code === 'MISSING_REQUIRED');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('V-A1: validateEventInput - 事件对象带 category: "" 且 date/title 合法返回空数组', () => {
    const issues = validateEventInput({
      date: '2026-11-19',
      title: '合法标题',
      category: '',
    } as any);
    expect(issues).toHaveLength(0);
    expect(issues.some((i) => i.field === 'category')).toBe(false);
  });

  it('V3: validateEventInput - title 长度 61 恰含 1 条 FIELD_TOO_LONG (error)', () => {
    const issues = validateEventInput({
      date: '2026-11-18',
      title: 'a'.repeat(61),
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('FIELD_TOO_LONG');
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.field).toBe('title');
  });

  it('V3b: validateRecordInput - summary 长度 81 报 FIELD_TOO_LONG', () => {
    const issues = validateRecordInput({
      date: '2026-11-18',
      rating: 3,
      summary: 's'.repeat(81),
    });
    const issue = issues.find((i) => i.field === 'summary' && i.code === 'FIELD_TOO_LONG');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('V3c: validateRecordInput - detail 长度 2001 报 FIELD_TOO_LONG', () => {
    const issues = validateRecordInput({
      date: '2026-11-18',
      rating: 3,
      summary: '测试记录',
      detail: 'd'.repeat(2001),
    });
    const issue = issues.find((i) => i.field === 'detail' && i.code === 'FIELD_TOO_LONG');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  it('V4: validateRecordInput - rating 为 0 报 RATING_OUT_OF_RANGE', () => {
    const issues = validateRecordInput({
      date: '2026-11-18',
      rating: 0,
      summary: 'x',
    });
    const issue = issues.find((i) => i.code === 'RATING_OUT_OF_RANGE');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.field).toBe('rating');
  });

  it('V5: validateRecordInput - rating 为 6 报 RATING_OUT_OF_RANGE', () => {
    const issues = validateRecordInput({
      date: '2026-11-18',
      rating: 6,
      summary: 'x',
    });
    const issue = issues.find((i) => i.code === 'RATING_OUT_OF_RANGE');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.field).toBe('rating');
  });

  it('V6: validateRecordInput - summary 空报 MISSING_REQUIRED', () => {
    const issues = validateRecordInput({
      date: '2026-11-18',
      rating: 3,
      summary: '',
    });
    const issue = issues.find((i) => i.field === 'summary' && i.code === 'MISSING_REQUIRED');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  // ==========================================
  // URL 与封面校验
  // ==========================================

  it('V7: validateUrlScheme - javascript:alert(1) 返回 false', () => {
    expect(validateUrlScheme('javascript:alert(1)')).toBe(false);
  });

  it('V8: validateUrlScheme - http:// 与 https:// 返回 true', () => {
    expect(validateUrlScheme('http://a.com')).toBe(true);
    expect(validateUrlScheme('https://a.com')).toBe(true);
  });

  it('V9: validateCover - data:image/jpeg;base64,AAA 无 error', () => {
    const issues = validateCover('data:image/jpeg;base64,AAA');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(issues).toEqual([]);
  });

  it('V10: validateCover - data:text/html;base64,AAA 报 INVALID_URL_SCHEME', () => {
    const issues = validateCover('data:text/html;base64,AAA');
    const issue = issues.find((i) => i.code === 'INVALID_URL_SCHEME');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
  });

  // ==========================================
  // 顶层形态校验
  // ==========================================

  it('V11: validateTopShape - 裸数组 [{...}, {...}] 返回 ok，ui.sortOrder 为 desc', () => {
    const dummyEvents = [
      { date: '2026-11-18', title: 'A' },
      { date: '2026-11-17', title: 'B' },
    ];
    const res = validateTopShape(dummyEvents);
    expect(res.ok).toBe(true);
    expect(res.data).not.toBeNull();
    expect(res.data?.ui.sortOrder).toBe('desc');
    expect(res.data?.events).toEqual(dummyEvents);
    expect(res.issues).toHaveLength(0);
  });

  it('V12: validateTopShape - { events: [...] } 返回 ok', () => {
    const dummyEvents = [{ date: '2026-11-18', title: 'A' }];
    const res = validateTopShape({ events: dummyEvents });
    expect(res.ok).toBe(true);
    expect(res.data).not.toBeNull();
    expect(res.data?.ui.sortOrder).toBe('desc');
    expect(res.data?.events).toEqual(dummyEvents);
    expect(res.issues).toHaveLength(0);
  });

  it('V-A2: validateTopShape - 根对象含 categories 剥离后 Object.hasOwn 为 false 且无 error', () => {
    const obj = {
      schemaVersion: 1,
      appVersion: '0.0.1',
      savedAt: '2026-11-19T12:00:00+08:00',
      categories: ['A', 'B'],
      ui: { sortOrder: 'desc' },
      events: [],
    };
    const res = validateTopShape(obj);
    expect(res.ok).toBe(true);
    expect(res.data).not.toBeNull();
    expect(Object.hasOwn(res.data!, 'categories')).toBe(false);
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('V13: validateTopShape - not json 与 {} 均含 TOP_LEVEL_SHAPE', () => {
    const resEmptyObj = validateTopShape({});
    expect(resEmptyObj.ok).toBe(false);
    expect(resEmptyObj.data).toBeNull();
    expect(resEmptyObj.issues.some((i) => i.code === 'TOP_LEVEL_SHAPE')).toBe(true);

    const resNotJson = validateTopShape('not json');
    expect(resNotJson.ok).toBe(false);
    expect(resNotJson.data).toBeNull();
    expect(resNotJson.issues.some((i) => i.code === 'TOP_LEVEL_SHAPE')).toBe(true);
  });

  // ==========================================
  // 导入强制转换 (coerceEvent / coerceRecord)
  // ==========================================

  it('V14: coerceEvent - 事件缺 id 生成新 id，issues 含 ID_REGENERATED', () => {
    const raw = {
      date: '2026-11-18',
      title: '无 ID 事件',
      category: 'AI模型',
    };
    const { event, issues } = coerceEvent(raw, 0);
    expect(event).not.toBeNull();
    expect(event?.id).toMatch(ID_PATTERN);
    expect(event?.id.startsWith('evt_')).toBe(true);
    const issue = issues.find((i) => i.code === 'ID_REGENERATED');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('V15: coerceEvent - 内的 record rating 为 9 夹取为 5，issues 含 RATING_CLAMPED', () => {
    const raw = {
      date: '2026-11-18',
      title: '测试星级夹取',
      category: 'AI模型',
      records: [
        {
          date: '2026-11-18',
          rating: 9,
          summary: '超出五星',
        },
      ],
    };
    const { event, issues } = coerceEvent(raw, 0);
    expect(event).not.toBeNull();
    expect(event?.records[0]?.rating).toBe(5);
    const issue = issues.find((i) => i.code === 'RATING_CLAMPED');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('V16: coerceEvent - title 100 字截断为 60，issues 含 FIELD_TRUNCATED', () => {
    const longTitle = '测'.repeat(100);
    const raw = {
      date: '2026-11-18',
      title: longTitle,
      category: 'AI模型',
    };
    const { event, issues } = coerceEvent(raw, 0);
    expect(event).not.toBeNull();
    expect(event?.title).toHaveLength(60);
    expect(event?.title).toBe(longTitle.slice(0, 60));
    const issue = issues.find((i) => i.code === 'FIELD_TRUNCATED' && i.field === 'title');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('V18: coerceEvent - relatedIds 包含自身 id 时剔除自身，issues 含 SELF_RELATION', () => {
    const myId = 'evt_1770000000000_aaaaaa';
    const otherId = 'evt_1770000000000_bbbbbb';
    const raw = {
      id: myId,
      date: '2026-11-18',
      title: '测试自身关联',
      category: 'AI模型',
      relatedIds: [myId, otherId],
    };
    const { event, issues } = coerceEvent(raw, 0);
    expect(event).not.toBeNull();
    expect(event?.relatedIds).toEqual([otherId]);
    expect(event?.relatedIds).not.toContain(myId);
    const issue = issues.find((i) => i.code === 'SELF_RELATION');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('V19: coerceEvent - links: [{name: "a", url: "javascript:x"}] 该 link 被丢弃，issues 含 INVALID_URL_SCHEME', () => {
    const raw = {
      date: '2026-11-18',
      title: '测试链接丢弃',
      category: 'AI模型',
      links: [
        { name: 'a', url: 'javascript:x' },
        { name: 'b', url: 'https://example.com' },
      ],
    };
    const { event, issues } = coerceEvent(raw, 0);
    expect(event).not.toBeNull();
    expect(event?.links).toHaveLength(1);
    expect(event?.links[0]).toEqual({ name: 'b', url: 'https://example.com' });
    const issue = issues.find((i) => i.code === 'INVALID_URL_SCHEME');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  it('V20: coerceEvent - 21 条 records 保留 20 条，issues 含 TOO_MANY_RECORDS', () => {
    const records = Array.from({ length: 21 }, (_, idx) => ({
      date: '2026-11-18',
      rating: 3,
      summary: `记录 ${idx + 1}`,
    }));
    const raw = {
      date: '2026-11-18',
      title: '超限记录测试',
      category: 'AI模型',
      records,
    };
    const { event, issues } = coerceEvent(raw, 0);
    expect(event).not.toBeNull();
    expect(event?.records).toHaveLength(20);
    const issue = issues.find((i) => i.code === 'TOO_MANY_RECORDS');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
  });

  // ==========================================
  // 额外健壮性测试
  // ==========================================

  it('额外：coerceRecord - 独立调用时字段截断、星级夹取与 id 生成', () => {
    const raw = {
      date: '2026-11-18',
      rating: -1,
      summary: 'x'.repeat(100),
      detail: 'd'.repeat(2500),
    };
    const { record, issues } = coerceRecord(raw, 5);
    expect(record).not.toBeNull();
    expect(record?.id).toMatch(ID_PATTERN);
    expect(record?.id.startsWith('rec_')).toBe(true);
    expect(record?.rating).toBe(1);
    expect(record?.summary).toHaveLength(80);
    expect(record?.detail).toHaveLength(2000);

    expect(issues.some((i) => i.code === 'ID_REGENERATED')).toBe(true);
    expect(issues.some((i) => i.code === 'RATING_CLAMPED')).toBe(true);
    expect(issues.some((i) => i.code === 'FIELD_TRUNCATED' && i.field === 'summary')).toBe(true);
    expect(issues.some((i) => i.code === 'FIELD_TRUNCATED' && i.field === 'detail')).toBe(true);
  });

  it('额外：coerceRecord - 必填缺失返回 null 与 error issue', () => {
    const { record: r1, issues: i1 } = coerceRecord({ rating: 3, summary: 'abc' }, 0);
    expect(r1).toBeNull();
    expect(i1.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'date')).toBe(true);

    const { record: r2, issues: i2 } = coerceRecord({ date: '2026-11-18', rating: 3 }, 0);
    expect(r2).toBeNull();
    expect(i2.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'summary')).toBe(true);

    const { record: r3, issues: i3 } = coerceRecord({ date: '2026-02-30', summary: 'abc' }, 0);
    expect(r3).toBeNull();
    expect(i3.some((i) => i.code === 'INVALID_DATE' && i.field === 'date')).toBe(true);
  });

  it('额外：coerceEvent - 必填缺失返回 null 与 error issue', () => {
    const { event: e1, issues: i1 } = coerceEvent({ title: 'T' }, 0);
    expect(e1).toBeNull();
    expect(i1.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'date')).toBe(true);

    const { event: e2, issues: i2 } = coerceEvent({ date: '2026-11-18' }, 0);
    expect(e2).toBeNull();
    expect(i2.some((i) => i.code === 'MISSING_REQUIRED' && i.field === 'title')).toBe(true);

    const { event: e4, issues: i4 } = coerceEvent({ date: '2026-02-30', title: 'T' }, 0);
    expect(e4).toBeNull();
    expect(i4.some((i) => i.code === 'INVALID_DATE' && i.field === 'date')).toBe(true);
  });

  it('额外：validateTopShape - 保留 ui、忽略 categories', () => {
    const full = {
      schemaVersion: 1,
      appVersion: '0.0.1',
      savedAt: '2026-11-18T21:30:00+08:00',
      categories: ['生活事件', '自建项目'],
      ui: { sortOrder: 'asc' },
      events: [{ date: '2026-11-18', title: 'A' }],
    };
    const res = validateTopShape(full);
    expect(res.ok).toBe(true);
    expect(res.data?.ui.sortOrder).toBe('asc');
    expect(Object.hasOwn(res.data!, 'categories')).toBe(false);
    expect(res.data?.savedAt).toBe('2026-11-18T21:30:00+08:00');
  });

  it('额外：入参不修改（无副作用纯函数）', () => {
    const rawRecord = {
      date: '2026-11-18',
      rating: 9,
      summary: 's'.repeat(100),
    };
    const freezeRaw = JSON.parse(JSON.stringify(rawRecord));
    coerceRecord(rawRecord, 0);
    expect(rawRecord).toEqual(freezeRaw);

    const rawEvent = {
      date: '2026-11-18',
      title: 't'.repeat(100),
      category: '新分类',
      relatedIds: ['evt_111'],
      links: [{ name: 'a', url: 'javascript:x' }],
    };
    const freezeEvent = JSON.parse(JSON.stringify(rawEvent));
    coerceEvent(rawEvent, 0);
    expect(rawEvent).toEqual(freezeEvent);
  });
});
