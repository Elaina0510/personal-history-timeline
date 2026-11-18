/**
 * MOD-017 浮层三件套之一：Toast 轻提示
 * 挂载于 #overlay-root，永不参与 #timeline-root 重绘。
 * - 右下角堆叠，最多同时 3 条，第 4 条替换最旧一条；
 * - TOAST_DURATION_MS 自动消失；
 * - 同文本重复触发时重置计时而不新增。
 */

import { TOAST_DURATION_MS } from '../../core/types';
import { el } from '../dom';

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';

interface ActiveToast {
  message: string;
  level: ToastLevel;
  element: HTMLElement;
  timerId: ReturnType<typeof setTimeout>;
}

const MAX_TOASTS = 3;
const activeToasts: ActiveToast[] = [];
let toastContainer: HTMLElement | null = null;

function getOverlayRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

function ensureContainer(): HTMLElement {
  if (toastContainer && toastContainer.parentNode) {
    return toastContainer;
  }
  const overlayRoot = getOverlayRoot();
  toastContainer = el('div', {
    class: 'htl-toast-container',
    'data-toast-container': '',
    style:
      'position: fixed; right: var(--htl-space-4, 16px); bottom: var(--htl-space-4, 16px); ' +
      'z-index: var(--htl-z-toast, 300); display: flex; flex-direction: column; ' +
      'gap: var(--htl-space-2, 8px); pointer-events: none; max-width: min(400px, calc(100vw - var(--htl-space-6, 32px)));',
  });
  overlayRoot.appendChild(toastContainer);
  return toastContainer;
}

function removeToast(toastItem: ActiveToast): void {
  clearTimeout(toastItem.timerId);
  const index = activeToasts.indexOf(toastItem);
  if (index !== -1) {
    activeToasts.splice(index, 1);
  }
  if (toastItem.element.parentNode) {
    toastItem.element.parentNode.removeChild(toastItem.element);
  }
  if (activeToasts.length === 0 && toastContainer && toastContainer.parentNode) {
    toastContainer.parentNode.removeChild(toastContainer);
    toastContainer = null;
  }
}

const LEVEL_COLORS: Record<ToastLevel, string> = {
  info: 'var(--htl-color-accent, #4c9aff)',
  success: 'var(--htl-color-success, #10b981)',
  warn: 'var(--htl-color-star, #f59e0b)',
  error: 'var(--htl-color-danger, #e5484d)',
};

export function toast(message: string, level: ToastLevel = 'info'): void {
  // 1. 同文本重复触发时重置计时而不新增
  const existing = activeToasts.find((item) => item.message === message);
  if (existing) {
    clearTimeout(existing.timerId);
    existing.timerId = setTimeout(() => {
      removeToast(existing);
    }, TOAST_DURATION_MS);
    return;
  }

  // 2. 超出最大数量（3条），替换最旧一条
  while (activeToasts.length >= MAX_TOASTS) {
    const oldest = activeToasts[0];
    if (oldest) {
      removeToast(oldest);
    }
  }

  const container = ensureContainer();

  const borderColor = LEVEL_COLORS[level] ?? LEVEL_COLORS.info;
  const itemEl = el(
    'div',
    {
      class: 'htl-toast__item',
      'data-toast-item': '',
      'data-level': level,
      role: 'status',
      'aria-live': 'polite',
      style: `pointer-events: auto; border-left: 4px solid ${borderColor}; margin-top: 0;`,
    },
    [message]
  );

  const newToast: ActiveToast = {
    message,
    level,
    element: itemEl,
    timerId: setTimeout(() => {
      removeToast(newToast);
    }, TOAST_DURATION_MS),
  };

  activeToasts.push(newToast);
  container.appendChild(itemEl);
}
