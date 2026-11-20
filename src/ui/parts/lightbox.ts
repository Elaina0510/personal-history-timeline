/**
 * MOD-017 浮层三件套之三：大图灯箱
 * 挂载于 #overlay-root，永不参与 #timeline-root 重绘。
 * - Esc 与遮罩点击关闭
 * - 打开时通过 scrollLock 锁定滚动，关闭时解锁
 * - 图片 object-fit: contain
 */

import { el } from '../dom';
import { lockScroll, unlockScroll } from './scrollLock';
import { dropOverlayEntry, pushOverlayEntry } from './overlayHistory';

let currentLightbox: HTMLElement | null = null;
let keydownListener: ((ev: KeyboardEvent) => void) | null = null;

function getOverlayRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

export function closeLightbox(): void {
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener, true);
    keydownListener = null;
  }

  unlockScroll();

  const hadLightbox = currentLightbox !== null;
  if (currentLightbox && currentLightbox.parentNode) {
    currentLightbox.parentNode.removeChild(currentLightbox);
  }
  currentLightbox = null;

  if (hadLightbox) {
    dropOverlayEntry();
  }
}

export function openLightbox(src: string, alt?: string): void {
  // 若已存在打开的灯箱，先关闭以保持单一实例
  if (currentLightbox) {
    closeLightbox();
  }

  const overlayRoot = getOverlayRoot();

  const lightboxEl = el('div', {
    class: 'htl-lightbox',
    'data-lightbox': '',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': alt || '图片查看器',
  });

  const imgEl = el('img', {
    class: 'htl-lightbox__img',
    src,
    alt: alt ?? '',
    style: 'object-fit: contain; max-width: 90vw; max-height: 90vh;',
  });

  lightboxEl.appendChild(imgEl);

  // 遮罩点击关闭（点击背景遮罩生效，点击图片本体不关闭）
  lightboxEl.addEventListener('click', (ev: MouseEvent) => {
    if (ev.target === lightboxEl) {
      closeLightbox();
    }
  });

  // Esc 按键关闭
  keydownListener = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      ev.stopPropagation();
      closeLightbox();
    }
  };
  document.addEventListener('keydown', keydownListener, true);

  // 打开时锁定 body 滚动
  lockScroll();

  overlayRoot.appendChild(lightboxEl);
  currentLightbox = lightboxEl;
  pushOverlayEntry();
}
