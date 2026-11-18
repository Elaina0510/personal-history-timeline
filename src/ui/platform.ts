import type { StoragePort, ClockPort } from '../core/types';
import {
  MAX_COVER_BYTES,
  MAX_UPLOAD_BYTES,
  COVER_MAX_EDGE,
  JPEG_QUALITIES,
} from '../core/types';

declare const __BUILD_ID__: string;

/**
 * 创建 StoragePort 实现（浏览器 localStorage 适配层）
 */
export function createStorage(): StoragePort {
  return {
    read(key: string): string | null {
      try {
        if (typeof window === 'undefined' || !window.localStorage) {
          return null;
        }
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key: string, value: string): void {
      try {
        if (typeof window === 'undefined' || !window.localStorage) {
          throw new Error('localStorage is not available');
        }
        window.localStorage.setItem(key, value);
      } catch (err) {
        // 失败必须重新抛出（store 依赖它判断容量超限 / QuotaExceededError）
        throw err;
      }
    },
    remove(key: string): void {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // 忽略移除失败
      }
    },
    isAvailable(): boolean {
      try {
        if (typeof window === 'undefined' || !window.localStorage) {
          return false;
        }
        const testKey = `__storage_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * 格式化带本地时区偏移的 ISO8601 时间戳字符串
 * 例如：2026-11-18T21:30:00+08:00
 */
function formatLocalIso(date: Date): string {
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

/**
 * 创建 ClockPort 实现
 */
export function createClock(): ClockPort {
  return {
    nowMs(): number {
      return Date.now();
    },
    nowIso(): string {
      return formatLocalIso(new Date());
    },
  };
}

/**
 * 加载种子数据原始文本
 * 失败或非 2xx 返回 null，绝不抛错
 */
export async function loadSeedRaw(): Promise<string | null> {
  try {
    const buildId = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';
    const res = await fetch('./data/events.json?v=' + buildId);
    if (!res.ok) {
      return null;
    }
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * 图片压缩
 * 长边缩至 <= 1280，JPEG 质量尝试 0.8 / 0.6，输出 Data URL（<= 300KB）
 */
export async function compressImage(
  file: File
): Promise<
  | { ok: true; dataUrl: string }
  | { ok: false; code: 'COVER_TOO_LARGE' | 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' }
> {
  // 前置校验：非图片类型
  if (!file.type.startsWith('image/')) {
    return { ok: false, code: 'INVALID_FILE_TYPE' };
  }

  // 前置校验：文件超过 10MiB
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE' };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, code: 'INVALID_FILE_TYPE' };
  }

  try {
    const { width, height } = bitmap;
    const maxEdge = Math.max(width, height);
    let targetWidth = width;
    let targetHeight = height;

    if (maxEdge > COVER_MAX_EDGE) {
      const scale = COVER_MAX_EDGE / maxEdge;
      targetWidth = Math.round(width * scale);
      targetHeight = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, code: 'COVER_TOO_LARGE' };
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    let selectedBlob: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });
      if (blob && blob.size <= MAX_COVER_BYTES) {
        selectedBlob = blob;
        break;
      }
    }

    if (!selectedBlob) {
      return { ok: false, code: 'COVER_TOO_LARGE' };
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to data URL'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(selectedBlob);
    });

    return { ok: true, dataUrl };
  } finally {
    bitmap.close?.();
  }
}

/**
 * 触发 JSON 文件下载
 */
export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 写入剪贴板（失败返回 false）
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 剪贴板降级：在 #overlay-root 渲染只读 textarea 并全选
 */
export function showTextareaFallback(text: string): void {
  if (typeof document === 'undefined') {
    return;
  }

  const overlayRoot = document.getElementById('overlay-root') ?? document.body;

  const existing = document.getElementById('copy-fallback-overlay');
  if (existing) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.id = 'copy-fallback-overlay';
  container.setAttribute('data-component', 'copy-fallback');
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-label', '复制降级窗口');

  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
    box-sizing: border-box;
  `;

  const modalBox = document.createElement('div');
  modalBox.style.cssText = `
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    padding: 20px;
    box-sizing: border-box;
  `;

  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

  const title = document.createElement('h3');
  title.textContent = '复制数据';
  title.style.cssText = 'margin: 0; font-size: 18px; font-weight: 600; color: #111827;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.setAttribute('data-action', 'close-fallback');
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'background: transparent; border: none; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px; color: #6b7280;';

  header.appendChild(title);
  header.appendChild(closeBtn);

  const tip = document.createElement('p');
  tip.textContent = '已选中全部 JSON，请按 Ctrl+C 复制';
  tip.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; color: #4b5563;';

  const textarea = document.createElement('textarea');
  textarea.setAttribute('data-role', 'fallback-textarea');
  textarea.readOnly = true;
  textarea.value = text;
  textarea.rows = 8;
  textarea.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.4;
    padding: 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    color: #111827;
    resize: vertical;
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 16px;';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.setAttribute('data-action', 'close-fallback');
  confirmBtn.textContent = '关闭';
  confirmBtn.style.cssText = `
    padding: 6px 16px;
    background: #3b82f6;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
  `;

  footer.appendChild(confirmBtn);

  modalBox.appendChild(header);
  modalBox.appendChild(tip);
  modalBox.appendChild(textarea);
  modalBox.appendChild(footer);
  container.appendChild(modalBox);

  const cleanup = () => {
    window.removeEventListener('keydown', handleKeydown);
    container.remove();
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
    }
  };

  closeBtn.addEventListener('click', cleanup);
  confirmBtn.addEventListener('click', cleanup);
  container.addEventListener('click', (e) => {
    if (e.target === container) {
      cleanup();
    }
  });
  window.addEventListener('keydown', handleKeydown);

  overlayRoot.appendChild(container);

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
}
