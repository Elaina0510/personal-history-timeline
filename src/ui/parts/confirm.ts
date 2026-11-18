/**
 * MOD-017 浮层三件套之二：确认对话框
 * 挂载于 #overlay-root，永不参与 #timeline-root 重绘。
 * - 遮罩点击视同取消
 * - Esc 视同取消
 * - 确认按钮 danger 时使用 --htl-color-danger
 * - 返回 Promise<boolean>
 * - 同一个 confirm 重复打开时必须先 resolve 上一个为 false（避免 Promise 悬挂）
 */

import { el } from '../dom';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string; // 默认 '确认'
  cancelText?: string; // 默认 '取消'
  danger?: boolean; // 默认 false，true 时确认按钮用 --htl-color-danger
}

interface ActiveConfirm {
  finish: (value: boolean) => void;
  cleanup: () => void;
}

let activeConfirm: ActiveConfirm | null = null;

function getOverlayRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // 1. 同一个 confirm 重复打开时，必须先将上一个 resolve 为 false，避免 Promise 悬挂
  if (activeConfirm) {
    const prev = activeConfirm;
    activeConfirm = null;
    prev.finish(false);
  }

  return new Promise<boolean>((resolve) => {
    const overlayRoot = getOverlayRoot();
    const confirmText = opts.confirmText ?? '确认';
    const cancelText = opts.cancelText ?? '取消';
    const isDanger = Boolean(opts.danger);

    let isSettled = false;

    // 遮罩容器
    const modalEl = el('div', {
      class: 'htl-modal',
      'data-confirm-modal': '',
      role: 'dialog',
      'aria-modal': 'true',
    });

    // 弹窗主体内容
    const contentEl = el('div', {
      class: 'htl-modal__content',
      style: 'max-width: 440px; width: 100%; box-sizing: border-box;',
    });

    // 标题与内容（纯文本节点，天然防御 XSS）
    const titleEl = el(
      'h3',
      {
        class: 'htl-confirm__title',
        style: 'margin: 0 0 var(--htl-space-3, 12px) 0; font-size: var(--htl-fs-lg, 20px); font-weight: 600; color: var(--htl-color-text, #1e293b);',
      },
      [opts.title]
    );

    const messageEl = el(
      'p',
      {
        class: 'htl-confirm__message',
        style: 'margin: 0 0 var(--htl-space-5, 24px) 0; font-size: var(--htl-fs-sm, 14px); color: var(--htl-color-text-muted, #64748b); line-height: 1.5; white-space: pre-wrap;',
      },
      [opts.message]
    );

    // 取消按钮
    const cancelBtn = el(
      'button',
      {
        type: 'button',
        class: 'htl-confirm__btn-cancel',
        'data-action': 'confirm-cancel',
        style: 'cursor: pointer; padding: var(--htl-space-2, 8px) var(--htl-space-4, 16px);',
      },
      [cancelText]
    );

    // 确认按钮
    const confirmBtnStyle = isDanger
      ? 'cursor: pointer; padding: var(--htl-space-2, 8px) var(--htl-space-4, 16px); background-color: var(--htl-color-danger, #e5484d); border-color: var(--htl-color-danger, #e5484d); color: #ffffff;'
      : 'cursor: pointer; padding: var(--htl-space-2, 8px) var(--htl-space-4, 16px); background-color: var(--htl-color-accent, #4c9aff); border-color: var(--htl-color-accent, #4c9aff); color: #ffffff;';

    const confirmBtn = el(
      'button',
      {
        type: 'button',
        class: 'htl-confirm__btn-ok',
        'data-action': 'confirm-ok',
        style: confirmBtnStyle,
      },
      [confirmText]
    );

    const actionsEl = el(
      'div',
      {
        class: 'htl-confirm__actions',
        style: 'display: flex; justify-content: flex-end; gap: var(--htl-space-3, 12px);',
      },
      [cancelBtn, confirmBtn]
    );

    contentEl.appendChild(titleEl);
    contentEl.appendChild(messageEl);
    contentEl.appendChild(actionsEl);
    modalEl.appendChild(contentEl);

    const cleanup = (): void => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (modalEl.parentNode) {
        modalEl.parentNode.removeChild(modalEl);
      }
    };

    const finish = (result: boolean): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      if (activeConfirm && activeConfirm.finish === finish) {
        activeConfirm = null;
      }
      cleanup();
      resolve(result);
    };

    // Esc 按键视同取消
    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape' || ev.key === 'Esc') {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    };

    // 遮罩点击视同取消（仅点击遮罩本身，点击主体内容不触发）
    modalEl.addEventListener('click', (ev: MouseEvent) => {
      if (ev.target === modalEl) {
        finish(false);
      }
    });

    cancelBtn.addEventListener('click', () => finish(false));
    confirmBtn.addEventListener('click', () => finish(true));

    document.addEventListener('keydown', onKeyDown, true);

    activeConfirm = {
      finish,
      cleanup,
    };

    overlayRoot.appendChild(modalEl);
    confirmBtn.focus?.();
  });
}
