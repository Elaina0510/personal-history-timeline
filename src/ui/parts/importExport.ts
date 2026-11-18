/**
 * MOD-012: 导入导出弹窗 (importExport.ts)
 * 职责：
 * 1. 导入弹窗：来源页签（文件上传 / 粘贴文本）、模式选择（合并去重 / 全量覆盖）、预览计数与明细、容量与错误拦截、确认执行。
 * 2. 导出弹窗：显示将导出条数、下载 events_YYYYMMDD-HHmm.json、复制 JSON（失败降级 showTextareaFallback）。
 * 3. 弹窗底部「从上次覆盖前备份恢复」入口：confirmDialog 二次确认后调用 store.restoreBackup()。
 *
 * 禁令：
 * - 绝不自己解析 JSON、不做合并比较（全部经 store.previewImport / applyImport）。
 * - 绝不在此文件直接读写 localStorage。
 * - 绝不用 innerHTML 渲染导入明细。
 *
 * Traces to: REQ-009 [P0], REQ-010 [P0], REQ-011 [P0]
 */

import type { ImportMode, ImportPreview } from '../../core/types';
import { Store } from '../../core/store';
import { el } from '../dom';
import {
  createClock,
  createStorage,
  downloadJson,
  copyText,
  showTextareaFallback,
} from '../platform';
import { toast } from './toast';
import { confirmDialog } from './confirm';

let storeInstance: Store | null = null;
let activeModalEl: HTMLElement | null = null;
let keydownHandler: ((ev: KeyboardEvent) => void) | null = null;

export function setStore(store: Store): void {
  storeInstance = store;
}

export function getStore(): Store {
  if (storeInstance) {
    return storeInstance;
  }
  if (
    typeof window !== 'undefined' &&
    (window as unknown as { __htl_store?: Store }).__htl_store
  ) {
    return (window as unknown as { __htl_store: Store }).__htl_store;
  }
  const storage = createStorage();
  const clock = createClock();
  const s = new Store({ storage, clock, appVersion: '0.0.1' });
  s.init(null);
  storeInstance = s;
  return s;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __htl_setImportExportStore?: typeof setStore }).__htl_setImportExportStore = setStore;
}

function getOverlayRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

export function closeModal(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  if (typeof document !== 'undefined') {
    document.body.classList.remove('is-locked');
  }
  if (activeModalEl && activeModalEl.parentNode) {
    activeModalEl.parentNode.removeChild(activeModalEl);
  }
  activeModalEl = null;
}

export function formatFilenameDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `events_${yyyy}${mm}${dd}-${hh}${min}.json`;
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'added':
      return '新增';
    case 'updated':
      return '更新';
    case 'skipped':
      return '跳过';
    case 'error':
      return '错误';
    default:
      return action;
  }
}

function getActionBadgeStyle(action: string): string {
  switch (action) {
    case 'added':
      return 'background: #dcfce7; color: #15803d; border-color: #86efac;';
    case 'updated':
      return 'background: #dbeafe; color: #1d4ed8; border-color: #93c5fd;';
    case 'skipped':
      return 'background: #f1f5f9; color: #475569; border-color: #cbd5e1;';
    case 'error':
      return 'background: #fee2e2; color: #b91c1c; border-color: #fca5a5;';
    default:
      return '';
  }
}

/**
 * 导入弹窗
 */
export function openImportModal(): void {
  closeModal();

  const overlayRoot = getOverlayRoot();
  let currentTab: 'file' | 'paste' = 'file';
  let currentMode: ImportMode = 'merge';
  let currentRaw = '';

  const modalEl = el('div', {
    class: 'htl-modal',
    'data-import-modal': '',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '导入数据',
  });

  const contentEl = el('div', {
    class: 'htl-modal__content',
    style:
      'max-width: 600px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--htl-space-4, 16px);',
  });

  // 1. 头部标题与关闭按钮
  const closeBtnTop = el(
    'button',
    {
      type: 'button',
      'data-action': 'close-modal',
      'aria-label': '关闭',
      style:
        'background: transparent; border: none; font-size: 20px; cursor: pointer; padding: 4px; line-height: 1; color: var(--htl-color-text-muted, #64748b);',
    },
    ['×']
  );
  closeBtnTop.addEventListener('click', () => closeModal());

  const headerEl = el(
    'div',
    {
      style: 'display: flex; justify-content: space-between; align-items: center;',
    },
    [
      el(
        'h3',
        {
          style:
            'margin: 0; font-size: var(--htl-fs-lg, 20px); font-weight: 600; color: var(--htl-color-text, #1e293b);',
        },
        ['导入数据']
      ),
      closeBtnTop,
    ]
  );

  // 2. 来源页签切换
  const tabFileBtn = el(
    'button',
    {
      type: 'button',
      'data-tab': 'file',
      class: 'htl-chip htl-chip--active',
      style: 'padding: 6px 16px;',
    },
    ['上传文件']
  );

  const tabPasteBtn = el(
    'button',
    {
      type: 'button',
      'data-tab': 'paste',
      class: 'htl-chip',
      style: 'padding: 6px 16px;',
    },
    ['粘贴文本']
  );

  const tabsContainer = el(
    'div',
    {
      style:
        'display: flex; gap: var(--htl-space-2, 8px); border-bottom: 1px solid var(--htl-color-border, #e2e8f0); padding-bottom: var(--htl-space-2, 8px);',
    },
    [tabFileBtn, tabPasteBtn]
  );

  // 3. 来源面板
  const fileInput = el('input', {
    type: 'file',
    accept: '.json,application/json',
    'data-role': 'file-input',
    style: 'width: 100%; font-size: var(--htl-fs-sm, 14px);',
  });

  const filePanel = el(
    'div',
    {
      'data-panel': 'file',
      style: 'display: block;',
    },
    [
      el(
        'label',
        {
          style:
            'display: block; font-size: var(--htl-fs-sm, 14px); margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
        },
        ['选择 JSON 数据文件：']
      ),
      fileInput,
    ]
  );

  const pasteTextarea = el('textarea', {
    'data-role': 'paste-textarea',
    rows: 6,
    placeholder: '在此粘贴导出的 events.json 数据...',
    style:
      'width: 100%; box-sizing: border-box; resize: vertical; font-family: var(--htl-font-mono, monospace); font-size: var(--htl-fs-xs, 12px); padding: 8px;',
  });

  const pastePanel = el(
    'div',
    {
      'data-panel': 'paste',
      style: 'display: none;',
    },
    [
      el(
        'label',
        {
          style:
            'display: block; font-size: var(--htl-fs-sm, 14px); margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
        },
        ['粘贴 JSON 数据内容：']
      ),
      pasteTextarea,
    ]
  );

  // 4. 模式单选
  const mergeRadio = el('input', {
    type: 'radio',
    name: 'import-mode',
    value: 'merge',
    checked: true,
    'data-mode': 'merge',
  });

  const overwriteRadio = el('input', {
    type: 'radio',
    name: 'import-mode',
    value: 'overwrite',
    'data-mode': 'overwrite',
  });

  const overwriteWarn = el(
    'span',
    {
      'data-role': 'overwrite-warning',
      style:
        'color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-left: 4px;',
    },
    ['（将删除本地不在导入文件中的事件）']
  );

  const modeContainer = el(
    'div',
    {
      style:
        'display: flex; flex-direction: column; gap: var(--htl-space-2, 8px); padding: var(--htl-space-3, 12px); background-color: var(--htl-color-bg, #f8f9fa); border-radius: var(--htl-radius-sm, 4px); border: 1px solid var(--htl-color-border, #e2e8f0);',
    },
    [
      el('span', { style: 'font-size: var(--htl-fs-sm, 14px); font-weight: 600;' }, [
        '导入模式：',
      ]),
      el(
        'div',
        {
          style:
            'display: flex; align-items: center; gap: var(--htl-space-4, 16px); flex-wrap: wrap;',
        },
        [
          el(
            'label',
            {
              style:
                'display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: var(--htl-fs-sm, 14px);',
            },
            [mergeRadio, el('span', {}, ['合并去重（默认）'])]
          ),
          el(
            'label',
            {
              style:
                'display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: var(--htl-fs-sm, 14px);',
            },
            [overwriteRadio, el('span', {}, ['全量覆盖']), overwriteWarn]
          ),
        ]
      ),
    ]
  );

  // 5. 错误提示区
  const errorEl = el('div', {
    'data-role': 'import-error',
    style:
      'display: none; padding: var(--htl-space-2, 8px) var(--htl-space-3, 12px); background-color: #fee2e2; border-left: 4px solid var(--htl-color-danger, #e5484d); color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-sm, 14px); border-radius: var(--htl-radius-sm, 4px); line-height: 1.4;',
  });

  // 6. 预览区域
  const countAddedEl = el(
    'strong',
    {
      'data-count': 'added',
      style: 'font-size: 18px; font-weight: bold; color: #15803d;',
    },
    ['0']
  );
  const countUpdatedEl = el(
    'strong',
    {
      'data-count': 'updated',
      style: 'font-size: 18px; font-weight: bold; color: #1d4ed8;',
    },
    ['0']
  );
  const countSkippedEl = el(
    'strong',
    {
      'data-count': 'skipped',
      style: 'font-size: 18px; font-weight: bold; color: #334155;',
    },
    ['0']
  );
  const countErrorsEl = el(
    'strong',
    {
      'data-count': 'errors',
      style: 'font-size: 18px; font-weight: bold; color: #b91c1c;',
    },
    ['0']
  );

  const previewCountsGrid = el(
    'div',
    {
      style:
        'display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--htl-space-2, 8px); text-align: center;',
    },
    [
      el(
        'div',
        {
          style:
            'padding: 8px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 4px; background: #f0fdf4;',
        },
        [
          el('div', { style: 'font-size: 12px; color: #166534; margin-bottom: 2px;' }, ['新增']),
          countAddedEl,
        ]
      ),
      el(
        'div',
        {
          style:
            'padding: 8px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 4px; background: #eff6ff;',
        },
        [
          el('div', { style: 'font-size: 12px; color: #1e40af; margin-bottom: 2px;' }, ['更新']),
          countUpdatedEl,
        ]
      ),
      el(
        'div',
        {
          style:
            'padding: 8px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 4px; background: #f8fafc;',
        },
        [
          el('div', { style: 'font-size: 12px; color: #475569; margin-bottom: 2px;' }, ['跳过']),
          countSkippedEl,
        ]
      ),
      el(
        'div',
        {
          style:
            'padding: 8px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 4px; background: #fef2f2;',
        },
        [
          el('div', { style: 'font-size: 12px; color: #991b1b; margin-bottom: 2px;' }, ['错误']),
          countErrorsEl,
        ]
      ),
    ]
  );

  const detailsCountEl = el('span', { 'data-role': 'details-count' }, ['0']);
  const truncatedEl = el(
    'div',
    {
      'data-role': 'preview-truncated',
      style:
        'display: none; color: var(--htl-color-star, #f59e0b); font-size: 12px; margin: 6px 0;',
    },
    ['仅显示前 200 条']
  );

  const itemsListEl = el('div', {
    'data-role': 'preview-items-list',
    style:
      'max-height: 220px; overflow-y: auto; margin-top: 8px; display: flex; flex-direction: column; gap: 4px;',
  });

  const detailsSummary = el(
    'summary',
    {
      style: 'cursor: pointer; font-weight: 500; user-select: none; font-size: 13px;',
    },
    ['预览明细 (', detailsCountEl, ' 条)']
  );

  const detailsEl = el(
    'details',
    {
      'data-role': 'preview-details',
      style:
        'border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 4px; padding: 8px; background-color: var(--htl-color-surface, #ffffff);',
    },
    [detailsSummary, truncatedEl, itemsListEl]
  );

  const previewArea = el(
    'div',
    {
      'data-role': 'import-preview',
      style: 'display: none; flex-direction: column; gap: var(--htl-space-3, 12px);',
    },
    [previewCountsGrid, detailsEl]
  );

  // 7. 禁用原因提示
  const reasonEl = el('div', {
    'data-role': 'disabled-reason',
    style:
      'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-sm, 14px); line-height: 1.4;',
  });

  // 8. 底部操作区
  const restoreBackupBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'restore-backup',
      style:
        'font-size: var(--htl-fs-xs, 12px); color: var(--htl-color-text-muted, #64748b); background: transparent; border: 1px dashed var(--htl-color-border, #e2e8f0); padding: 6px 12px;',
    },
    ['从上次覆盖前备份恢复']
  );
  restoreBackupBtn.addEventListener('click', () => {
    openRestoreBackupConfirm();
  });

  const cancelBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'close-modal',
      style: 'padding: 6px 16px;',
    },
    ['取消']
  );
  cancelBtn.addEventListener('click', () => closeModal());

  const confirmBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'confirm-import',
      disabled: true,
      style:
        'padding: 6px 16px; background-color: var(--htl-color-accent, #4c9aff); border-color: var(--htl-color-accent, #4c9aff); color: #ffffff; opacity: 0.5; cursor: not-allowed;',
    },
    ['确认导入']
  );

  const footerEl = el(
    'div',
    {
      style:
        'display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--htl-color-border, #e2e8f0); padding-top: var(--htl-space-3, 12px); margin-top: var(--htl-space-2, 8px); flex-wrap: wrap; gap: 8px;',
    },
    [
      restoreBackupBtn,
      el(
        'div',
        {
          style: 'display: flex; gap: var(--htl-space-2, 8px); margin-left: auto;',
        },
        [cancelBtn, confirmBtn]
      ),
    ]
  );

  contentEl.appendChild(headerEl);
  contentEl.appendChild(tabsContainer);
  contentEl.appendChild(filePanel);
  contentEl.appendChild(pastePanel);
  contentEl.appendChild(modeContainer);
  contentEl.appendChild(errorEl);
  contentEl.appendChild(previewArea);
  contentEl.appendChild(reasonEl);
  contentEl.appendChild(footerEl);
  modalEl.appendChild(contentEl);

  function resetPreview(): void {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    previewArea.style.display = 'none';
    reasonEl.style.display = 'none';
    reasonEl.textContent = '';
    countAddedEl.textContent = '0';
    countUpdatedEl.textContent = '0';
    countSkippedEl.textContent = '0';
    countErrorsEl.textContent = '0';
    detailsCountEl.textContent = '0';
    itemsListEl.replaceChildren();
    truncatedEl.style.display = 'none';
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.cursor = 'not-allowed';
  }

  function runPreview(): void {
    if (!currentRaw || currentRaw.trim() === '') {
      resetPreview();
      return;
    }

    const s = getStore();
    const res = s.previewImport({ raw: currentRaw, mode: currentMode });

    if (!res.ok) {
      const issue = res.issues[0];
      errorEl.textContent = issue?.message || 'JSON 格式错误，无法解析';
      errorEl.style.display = 'block';
      previewArea.style.display = 'none';
      reasonEl.style.display = 'none';
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
      return;
    }

    errorEl.style.display = 'none';
    errorEl.textContent = '';
    const preview = res.value;
    previewArea.style.display = 'flex';

    countAddedEl.textContent = String(preview.counts.added);
    countUpdatedEl.textContent = String(preview.counts.updated);
    countSkippedEl.textContent = String(preview.counts.skipped);
    countErrorsEl.textContent = String(preview.counts.errors);

    detailsCountEl.textContent = String(preview.items.length);
    truncatedEl.style.display = preview.truncated ? 'block' : 'none';

    // 严禁 innerHTML，以 DOM 构造明细项
    itemsListEl.replaceChildren();
    for (const item of preview.items) {
      const itemRow = el(
        'div',
        {
          class: `htl-import-item htl-import-item--${item.action}`,
          'data-action-type': item.action,
          style:
            'display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-bottom: 1px solid var(--htl-color-border, #e2e8f0); font-size: 12px; gap: 8px;',
        },
        [
          el(
            'div',
            {
              style:
                'display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
            },
            [
              el(
                'span',
                {
                  style:
                    'color: var(--htl-color-text-muted, #64748b); font-family: monospace;',
                },
                [`#${item.index + 1}`]
              ),
              el(
                'span',
                {
                  style: 'color: var(--htl-color-text-muted, #64748b);',
                },
                [item.date || '-']
              ),
              el(
                'span',
                {
                  style: 'font-weight: 500;',
                  title: item.title,
                },
                [item.title || '(无标题)']
              ),
            ]
          ),
          el(
            'div',
            {
              style: 'display: flex; align-items: center; gap: 4px; flex-shrink: 0;',
            },
            [
              el(
                'span',
                {
                  class: `htl-chip htl-import-badge--${item.action}`,
                  style: `padding: 2px 6px; font-size: 11px; ${getActionBadgeStyle(item.action)}`,
                },
                [getActionLabel(item.action)]
              ),
              ...(item.message
                ? [
                    el(
                      'span',
                      {
                        style: 'color: var(--htl-color-danger, #e5484d);',
                      },
                      [item.message]
                    ),
                  ]
                : []),
            ]
          ),
        ]
      );
      itemsListEl.appendChild(itemRow);
    }

    const effectiveCount = preview.counts.added + preview.counts.updated;
    if (preview.blockedByCapacity) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
      reasonEl.textContent = '导入后将超出存储上限，请改用图片链接';
      reasonEl.style.display = 'block';
    } else if (effectiveCount === 0) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
      if (preview.counts.errors > 0) {
        reasonEl.textContent = `没有可导入的有效事件（共 ${preview.counts.errors} 条错误）`;
      } else if (preview.counts.skipped > 0) {
        reasonEl.textContent = '没有可导入的有效事件（全部条目已跳过）';
      } else {
        reasonEl.textContent = '没有可导入的有效事件';
      }
      reasonEl.style.display = 'block';
    } else {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
      reasonEl.style.display = 'none';
      reasonEl.textContent = '';
    }
  }

  function switchTab(tab: 'file' | 'paste'): void {
    if (currentTab === tab) return;
    currentTab = tab;
    if (tab === 'file') {
      tabFileBtn.classList.add('htl-chip--active');
      tabPasteBtn.classList.remove('htl-chip--active');
      filePanel.style.display = 'block';
      pastePanel.style.display = 'none';
      pasteTextarea.value = '';
      currentRaw = '';
    } else {
      tabPasteBtn.classList.add('htl-chip--active');
      tabFileBtn.classList.remove('htl-chip--active');
      pastePanel.style.display = 'block';
      filePanel.style.display = 'none';
      fileInput.value = '';
      currentRaw = '';
      pasteTextarea.focus();
    }
    resetPreview();
  }

  tabFileBtn.addEventListener('click', () => switchTab('file'));
  tabPasteBtn.addEventListener('click', () => switchTab('paste'));

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      currentRaw = '';
      resetPreview();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        currentRaw = reader.result;
        runPreview();
      }
    };
    reader.onerror = () => {
      errorEl.textContent = '读取文件失败';
      errorEl.style.display = 'block';
    };
    reader.readAsText(file);
  });

  pasteTextarea.addEventListener('input', () => {
    currentRaw = pasteTextarea.value;
    runPreview();
  });

  mergeRadio.addEventListener('change', () => {
    if (mergeRadio.checked) {
      currentMode = 'merge';
      if (currentRaw) {
        runPreview();
      }
    }
  });

  overwriteRadio.addEventListener('change', () => {
    if (overwriteRadio.checked) {
      currentMode = 'overwrite';
      if (currentRaw) {
        runPreview();
      }
    }
  });

  confirmBtn.addEventListener('click', () => {
    if (confirmBtn.disabled || !currentRaw) {
      return;
    }
    const s = getStore();
    const res = s.applyImport({ raw: currentRaw, mode: currentMode });
    if (res.ok) {
      closeModal();
      const applied = res.value.applied;
      toast(
        `导入完成：新增 ${applied.added} / 更新 ${applied.updated} / 跳过 ${applied.skipped} / 错误 ${applied.errors}`,
        'success'
      );
    } else {
      const issue = res.issues[0];
      toast(issue?.message || '导入失败', 'error');
    }
  });

  modalEl.addEventListener('click', (ev: MouseEvent) => {
    if (ev.target === modalEl) {
      closeModal();
    }
  });

  keydownHandler = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      ev.stopPropagation();
      closeModal();
    }
  };
  document.addEventListener('keydown', keydownHandler, true);

  if (typeof document !== 'undefined') {
    document.body.classList.add('is-locked');
  }

  overlayRoot.appendChild(modalEl);
  activeModalEl = modalEl;
}

/**
 * 导出弹窗
 */
export function openExportModal(): void {
  closeModal();

  const overlayRoot = getOverlayRoot();
  const s = getStore();
  const state = s.getState();
  const count = state.data.events.length;
  const jsonText = s.exportJson();

  const modalEl = el('div', {
    class: 'htl-modal',
    'data-export-modal': '',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '导出数据',
  });

  const contentEl = el('div', {
    class: 'htl-modal__content',
    style:
      'max-width: 480px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--htl-space-4, 16px);',
  });

  const closeBtnTop = el(
    'button',
    {
      type: 'button',
      'data-action': 'close-modal',
      'aria-label': '关闭',
      style:
        'background: transparent; border: none; font-size: 20px; cursor: pointer; padding: 4px; line-height: 1; color: var(--htl-color-text-muted, #64748b);',
    },
    ['×']
  );
  closeBtnTop.addEventListener('click', () => closeModal());

  const headerEl = el(
    'div',
    {
      style: 'display: flex; justify-content: space-between; align-items: center;',
    },
    [
      el(
        'h3',
        {
          style:
            'margin: 0; font-size: var(--htl-fs-lg, 20px); font-weight: 600; color: var(--htl-color-text, #1e293b);',
        },
        ['导出数据']
      ),
      closeBtnTop,
    ]
  );

  const countEl = el(
    'p',
    {
      'data-role': 'export-count',
      style:
        'margin: 0; font-size: var(--htl-fs-sm, 14px); color: var(--htl-color-text, #1e293b);',
    },
    [`即将导出 ${count} 条事件数据`]
  );

  const downloadBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'download-json',
      style:
        'padding: var(--htl-space-2, 8px) var(--htl-space-4, 16px); background-color: var(--htl-color-accent, #4c9aff); border-color: var(--htl-color-accent, #4c9aff); color: #ffffff; text-align: center; font-weight: 500;',
    },
    ['下载 events.json']
  );

  downloadBtn.addEventListener('click', () => {
    const filename = formatFilenameDate(new Date());
    downloadJson(filename, jsonText);
    toast('已开始下载导出文件', 'success');
  });

  const copyBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'copy-json',
      style:
        'padding: var(--htl-space-2, 8px) var(--htl-space-4, 16px); text-align: center;',
    },
    ['复制 JSON']
  );

  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(jsonText);
    if (ok) {
      toast('已复制全部 JSON 到剪贴板', 'success');
    } else {
      showTextareaFallback(jsonText);
    }
  });

  const actionsEl = el(
    'div',
    {
      style:
        'display: flex; flex-direction: column; gap: var(--htl-space-2, 8px); margin-top: var(--htl-space-2, 8px);',
    },
    [downloadBtn, copyBtn]
  );

  const closeBtnBottom = el(
    'button',
    {
      type: 'button',
      'data-action': 'close-modal',
      style: 'padding: 6px 16px;',
    },
    ['关闭']
  );
  closeBtnBottom.addEventListener('click', () => closeModal());

  const footerEl = el(
    'div',
    {
      style:
        'display: flex; justify-content: flex-end; border-top: 1px solid var(--htl-color-border, #e2e8f0); padding-top: var(--htl-space-3, 12px);',
    },
    [closeBtnBottom]
  );

  contentEl.appendChild(headerEl);
  contentEl.appendChild(countEl);
  contentEl.appendChild(actionsEl);
  contentEl.appendChild(footerEl);
  modalEl.appendChild(contentEl);

  modalEl.addEventListener('click', (ev: MouseEvent) => {
    if (ev.target === modalEl) {
      closeModal();
    }
  });

  keydownHandler = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      ev.stopPropagation();
      closeModal();
    }
  };
  document.addEventListener('keydown', keydownHandler, true);

  if (typeof document !== 'undefined') {
    document.body.classList.add('is-locked');
  }

  overlayRoot.appendChild(modalEl);
  activeModalEl = modalEl;
}

/**
 * 从上次覆盖前备份恢复确认
 */
export function openRestoreBackupConfirm(): void {
  void (async () => {
    const confirmed = await confirmDialog({
      title: '从上次覆盖前备份恢复',
      message: '确定要从上次全量覆盖前的备份恢复吗？当前数据将被覆盖。',
      confirmText: '确认恢复',
      cancelText: '取消',
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    const s = getStore();
    const res = s.restoreBackup();
    if (res.ok) {
      if (res.value.restored) {
        toast('已从备份恢复数据', 'success');
        closeModal();
      } else {
        toast('未找到可用备份', 'warn');
      }
    } else {
      const issue = res.issues[0];
      toast(issue?.message || '恢复备份失败', 'error');
    }
  })();
}
