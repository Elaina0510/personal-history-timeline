import { describe, it, expect } from 'vitest';
import {
  estimateBytes,
  capacityState,
  estimateRemainingImages,
} from '../src/core/capacity';
import {
  CAPACITY_WARN_BYTES,
  CAPACITY_BLOCK_BYTES,
  MAX_COVER_BYTES,
  type TimelineData,
  type TimelineEvent,
} from '../src/core/types';

function createMockData(events: Partial<TimelineEvent>[] = []): TimelineData {
  return {
    schemaVersion: 1,
    appVersion: '0.0.1',
    savedAt: '2026-11-18T14:00:00+08:00',
    ui: { sortOrder: 'desc' },
    events: events.map((e, idx) => ({
      id: `evt_1700000000000_${String(idx).padStart(6, '0')}`,
      date: '2026-11-18',
      title: `Event ${idx}`,
      links: [],
      relatedIds: [],
      records: [],
      createdAt: '2026-11-18T14:00:00+08:00',
      updatedAt: '2026-11-18T14:00:00+08:00',
      ...e,
    })),
  };
}

describe('MOD-007 capacity', () => {
  describe('C1: estimateBytes', () => {
    it('C1: estimates UTF-16 bytes as json.length * 2', () => {
      const input = 'a'.repeat(100);
      expect(estimateBytes(input)).toBe(200);
    });

    it('returns 0 for empty string', () => {
      expect(estimateBytes('')).toBe(0);
    });
  });

  describe('C2~C5: capacityState', () => {
    it('C2: returns "ok" when bytes is 4194303 (< CAPACITY_WARN_BYTES)', () => {
      expect(CAPACITY_WARN_BYTES).toBe(4194304);
      expect(capacityState(4194303)).toBe('ok');
    });

    it('C3: returns "warn" when bytes is 4194304 (>= CAPACITY_WARN_BYTES lower bound)', () => {
      expect(capacityState(4194304)).toBe('warn');
      expect(capacityState(CAPACITY_WARN_BYTES)).toBe('warn');
    });

    it('C4: returns "warn" when bytes is 4718591 (< CAPACITY_BLOCK_BYTES)', () => {
      expect(CAPACITY_BLOCK_BYTES).toBe(4718592);
      expect(capacityState(4718591)).toBe('warn');
    });

    it('C5: returns "block" when bytes is 4718592 (>= CAPACITY_BLOCK_BYTES lower bound)', () => {
      expect(capacityState(4718592)).toBe('block');
      expect(capacityState(CAPACITY_BLOCK_BYTES)).toBe('block');
    });

    it('returns "ok" for 0 bytes and "block" for values > CAPACITY_BLOCK_BYTES', () => {
      expect(capacityState(0)).toBe('ok');
      expect(capacityState(5000000)).toBe('block');
    });
  });

  describe('C6~C7: estimateRemainingImages', () => {
    it('C6: calculates remaining images when usedBytes=4MiB and no embedded images exist', () => {
      const data = createMockData([]);
      const usedBytes = 4 * 1024 * 1024; // 4194304
      // floor((4718592 - 4194304) / 307200) = floor(524288 / 307200) = 1
      expect(estimateRemainingImages(data, usedBytes)).toBe(1);
    });

    it('C7: calculates remaining images using average size of data: covers (2 images each 200KB)', () => {
      const twoHundredKb = 200 * 1024; // 204800
      const prefix = 'data:image/jpeg;base64,';
      const cover1 = prefix + 'x'.repeat(twoHundredKb - prefix.length);
      const cover2 = prefix + 'y'.repeat(twoHundredKb - prefix.length);

      expect(cover1.length).toBe(204800);
      expect(cover2.length).toBe(204800);

      const data = createMockData([
        { cover: cover1 },
        { cover: cover2 },
      ]);

      // usedBytes = 0, avg = 204800
      // floor(4718592 / 204800) = 23
      expect(estimateRemainingImages(data, 0)).toBe(23);
    });

    it('ignores http/https covers and falls back to MAX_COVER_BYTES', () => {
      const data = createMockData([
        { cover: 'https://example.com/photo1.jpg' },
        { cover: 'http://example.com/photo2.png' },
      ]);
      const usedBytes = 4 * 1024 * 1024;
      // No data: cover, so avg is MAX_COVER_BYTES (307200)
      expect(estimateRemainingImages(data, usedBytes)).toBe(1);
    });

    it('only counts data: covers when mixed with http covers', () => {
      const twoHundredKb = 200 * 1024; // 204800
      const prefix = 'data:image/jpeg;base64,';
      const coverData = prefix + 'z'.repeat(twoHundredKb - prefix.length);

      const data = createMockData([
        { cover: 'https://example.com/remote.jpg' },
        { cover: coverData },
        { cover: undefined },
      ]);

      // Only coverData counts -> avg = 204800
      expect(estimateRemainingImages(data, 0)).toBe(23);
    });

    it('returns 0 when usedBytes >= CAPACITY_BLOCK_BYTES', () => {
      const data = createMockData([]);
      expect(estimateRemainingImages(data, CAPACITY_BLOCK_BYTES)).toBe(0);
      expect(estimateRemainingImages(data, CAPACITY_BLOCK_BYTES + 1000)).toBe(0);
    });
  });
});
