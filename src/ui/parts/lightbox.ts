/**
 * MOD-017 浮层三件套之三：大图灯箱
 * 挂载于 #overlay-root，永不参与 #timeline-root 重绘。
 * - Esc 与遮罩点击关闭
 * - 打开时给 document.body 加 .is-locked（CSS 中 overflow: hidden），关闭时移除
 * - 图片 object-fit: contain
 */

import { el } from '../dom';

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

  document.body.classList.remove('is-locked');

  if (currentLightbox && currentLightbox.parentNode) {
    currentLightbox.parentNode.removeChild(currentLightbox);
  }
  currentLightbox = null;
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
  document.body.classList.add('is-locked');

  overlayRoot.appendChild(lightboxEl);
  currentLightbox = lightboxEl;
}
