/**
 * MOD-011: 事件表单与记录表单弹窗 (formModal.ts)
 *
 * 职责：
 * 1. 事件新增/编辑表单与记录新增/编辑表单的 DOM 构造与交互。
 * 2. 字段级错误展示（调用 core/validate，错误按 Issue.field 定位到字段下方红字，提交时聚焦首个错误字段）。
 * 3. 动态链接行（focus-key 带序号 form.event.links.<i>.name，最多 10 行，达到上限置灰）。
 * 4. 关联多选（可搜索下拉，排除自身与已选，显示 日期 + 标题，最多 10 条，超限提示）。
 * 5. 封面来源页签（图片链接 / 本地上传，走 platform.compressImage，成功后显示缩略图 + 移除）。
 * 6. 记录表单（5 颗星单选默认 3 支持 ←/→，碎碎念实时字数统计上限 2000）。
 * 7. 未保存关闭二次确认（字段改过时，遮罩/ESC/取消均先 confirmDialog('有未保存的修改，确定关闭？')）。
 * 8. 保存成功：toast('已保存')，关闭弹窗，store.flash(id)。
 * 9. 编辑态「删除此事件」二次确认（文案含标题与关联数）。
 *
 * 禁令：
 * - 不自己写校验规则（必须走 validate.*）。
 * - 不直接改 store 内部数据（只调方法并处理 MutationResult）。
 * - 永不在此文件里操作 #timeline-root。
 */

import type {
  EventLink,
  Issue,
  Rating,
  TimelineEvent,
} from '../../core/types';
import {
  DETAIL_MAX,
  ISSUE_MESSAGES,
  LINK_NAME_MAX,
  MAX_LINKS_PER_EVENT,
  MAX_RECORDS_PER_EVENT,
  MAX_RELATIONS_PER_EVENT,
  SUMMARY_MAX,
  TITLE_MAX,
} from '../../core/types';
import { Store } from '../../core/store';
import {
  validateCover,
  validateEventInput,
  validateRecordInput,
  validateUrlScheme,
} from '../../core/validate';
import { buildRelationIndex } from '../../core/select';
import { el } from '../dom';
import { compressImage } from '../platform';
import { toast } from './toast';
import { confirmDialog } from './confirm';
import { lockScroll, unlockScroll } from './scrollLock';
import { dropOverlayEntry, pushOverlayEntry } from './overlayHistory';

let activeStore: Store | null = null;
let activeModal: HTMLElement | null = null;
let activeKeydownListener: ((e: KeyboardEvent) => void) | null = null;
let activeAttemptClose: (() => Promise<void>) | null = null;

export function setStore(store: Store): void {
  activeStore = store;
}

export function getStore(): Store | null {
  if (activeStore) {
    return activeStore;
  }
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __htl_store?: Store };
    if (w.__htl_store) {
      return w.__htl_store;
    }
  }
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as unknown as { __htl_store?: Store };
    if (g.__htl_store) {
      return g.__htl_store;
    }
  }
  return null;
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

function getTodayDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function closeFormModal(force?: boolean): void {
  if (force) {
    if (activeKeydownListener) {
      document.removeEventListener('keydown', activeKeydownListener, true);
      activeKeydownListener = null;
    }
    unlockScroll();
    const hadModal = activeModal !== null;
    if (activeModal && activeModal.parentNode) {
      activeModal.parentNode.removeChild(activeModal);
    }
    activeModal = null;
    activeAttemptClose = null;
    if (hadModal) {
      dropOverlayEntry();
    }
  } else {
    if (activeAttemptClose) {
      activeAttemptClose();
    } else {
      closeFormModal(true);
    }
  }
}

/**
 * 打开事件表单（新增 / 编辑）
 */
export function openEventForm(
  opts: ({ mode: 'create' } | { mode: 'edit'; eventId: string }) & { store?: Store }
): void {
  if (opts.store) {
    setStore(opts.store);
  }
  const rawStore = getStore();
  if (!rawStore) {
    toast('系统状态未就绪', 'error');
    return;
  }
  const store: Store = rawStore;

  // 关闭已有实例
  if (activeModal) {
    closeFormModal(true);
  }

  const state = store.getState();
  const allEvents = state.data.events;
  let targetEvent: TimelineEvent | null = null;

  if (opts.mode === 'edit') {
    targetEvent = allEvents.find((e) => e.id === opts.eventId) ?? null;
    if (!targetEvent) {
      toast('事件不存在或已被删除', 'error');
      return;
    }
  }

  const isEdit = opts.mode === 'edit' && targetEvent !== null;
  const initialDate = isEdit && targetEvent ? targetEvent.date : getTodayDateString();
  const initialTitle = isEdit && targetEvent ? targetEvent.title : '';
  const initialCover = isEdit && targetEvent ? targetEvent.cover ?? '' : '';
  const initialLinks: EventLink[] =
    isEdit && targetEvent && Array.isArray(targetEvent.links)
      ? targetEvent.links.map((l) => ({ name: l.name, url: l.url }))
      : [];
  const initialRelatedIds: string[] =
    isEdit && targetEvent && Array.isArray(targetEvent.relatedIds)
      ? [...targetEvent.relatedIds]
      : [];

  let currentDate = initialDate;
  let currentTitle = initialTitle;
  let currentCover = initialCover;
  let currentLinks: EventLink[] = structuredClone(initialLinks);
  let currentRelatedIds: string[] = [...initialRelatedIds];
  let isDirty = false;

  function checkDirty(): boolean {
    if (isDirty) return true;
    if (currentDate !== initialDate) return true;
    if (currentTitle !== initialTitle) return true;
    if (currentCover !== initialCover) return true;
    if (currentRelatedIds.length !== initialRelatedIds.length) return true;
    if (currentRelatedIds.some((id, idx) => id !== initialRelatedIds[idx])) return true;
    if (currentLinks.length !== initialLinks.length) return true;
    for (let i = 0; i < currentLinks.length; i++) {
      if (
        currentLinks[i]?.name !== initialLinks[i]?.name ||
        currentLinks[i]?.url !== initialLinks[i]?.url
      ) {
        return true;
      }
    }
    return false;
  }

  const overlayRoot = getOverlayRoot();
  const modalTitle = isEdit ? '编辑事件' : '新建事件';

  const modalEl = el('div', {
    class: 'htl-modal',
    'data-form-modal': 'event',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': modalTitle,
  });

  const contentEl = el('div', {
    class: 'htl-modal__content',
    style: 'max-width: 640px; width: 100%; box-sizing: border-box;',
  });

  // 1. 弹窗顶栏
  const headerEl = el(
    'div',
    {
      style:
        'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;',
    },
    [
      el(
        'h3',
        {
          style:
            'margin: 0; font-size: var(--htl-fs-lg, 20px); font-weight: 600; color: var(--htl-color-text, #1e293b);',
        },
        [modalTitle]
      ),
      el(
        'button',
        {
          type: 'button',
          'data-action': 'close-modal',
          'aria-label': '关闭',
          style:
            'background: none; border: none; font-size: 20px; cursor: pointer; color: var(--htl-color-text-muted, #64748b); line-height: 1; padding: 4px;',
        },
        ['×']
      ),
    ]
  );

  const formEl = el('form', {
    novalidate: true,
    style: 'display: flex; flex-direction: column; gap: 16px;',
  });

  // 2. 字段：发生日期
  const dateFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['发生日期 *']
    ),
    el('input', {
      type: 'text',
      class: 'htl-form__input',
      'data-focus-key': 'form.event.date',
      'data-field': 'date',
      placeholder: 'YYYY-MM-DD',
      value: currentDate,
      style:
        'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
    }),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'date',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const dateInput = dateFieldBox.querySelector('input') as HTMLInputElement;
  dateInput.addEventListener('input', () => {
    currentDate = dateInput.value;
    isDirty = true;
    clearFieldError('date');
  });

  // 3. 字段：标题
  const titleFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['标题 *']
    ),
    el('input', {
      type: 'text',
      class: 'htl-form__input',
      'data-focus-key': 'form.event.title',
      'data-field': 'title',
      maxlength: TITLE_MAX,
      placeholder: '1~60 个字符',
      value: currentTitle,
      style:
        'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
    }),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'title',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const titleInput = titleFieldBox.querySelector('input') as HTMLInputElement;
  titleInput.addEventListener('input', () => {
    currentTitle = titleInput.value;
    isDirty = true;
    clearFieldError('title');
  });

  // 4. 字段：封面（两页签：图片链接 / 本地上传）
  const coverFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['封面配图（可选）']
    ),
    el(
      'div',
      { style: 'display: flex; gap: 8px; margin-bottom: 8px;' },
      [
        el(
          'button',
          {
            type: 'button',
            class: 'htl-chip htl-chip--active',
            'data-action': 'tab-cover-url',
            style: 'padding: 4px 10px; cursor: pointer;',
          },
          ['图片链接']
        ),
        el(
          'button',
          {
            type: 'button',
            class: 'htl-chip',
            'data-action': 'tab-cover-upload',
            style: 'padding: 4px 10px; cursor: pointer;',
          },
          ['本地上传']
        ),
      ]
    ),
    el('div', { class: 'htl-form__cover-url-pane', style: 'margin-top: 6px;' }, [
      el('input', {
        type: 'text',
        class: 'htl-form__input',
        'data-focus-key': 'form.event.cover',
        'data-field': 'cover',
        placeholder: 'http:// 或 https://',
        value: currentCover.startsWith('data:') ? '' : currentCover,
        style:
          'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
      }),
    ]),
    el(
      'div',
      { class: 'htl-form__cover-upload-pane', style: 'display: none; margin-top: 6px;' },
      [
        el('input', {
          type: 'file',
          accept: 'image/*',
          'data-focus-key': 'form.event.cover.file',
          style: 'display: none;',
        }),
        el(
          'button',
          {
            type: 'button',
            'data-action': 'choose-cover-file',
            style:
              'padding: 8px 14px; font-size: var(--htl-fs-sm, 14px); border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); background-color: var(--htl-color-surface, #ffffff); cursor: pointer;',
          },
          ['选择图片文件']
        ),
      ]
    ),
    el('div', {
      class: 'htl-form__cover-preview-box',
      style: currentCover
        ? 'margin-top: 10px; display: flex; align-items: flex-start; gap: 12px;'
        : 'display: none; margin-top: 10px;',
    }),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'cover',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const tabUrlBtn = coverFieldBox.querySelector('[data-action="tab-cover-url"]') as HTMLButtonElement;
  const tabUploadBtn = coverFieldBox.querySelector('[data-action="tab-cover-upload"]') as HTMLButtonElement;
  const urlPane = coverFieldBox.querySelector('.htl-form__cover-url-pane') as HTMLElement;
  const uploadPane = coverFieldBox.querySelector('.htl-form__cover-upload-pane') as HTMLElement;
  const coverUrlInput = urlPane.querySelector('input') as HTMLInputElement;
  const coverFileInput = uploadPane.querySelector('input') as HTMLInputElement;
  const chooseCoverBtn = uploadPane.querySelector('button') as HTMLButtonElement;
  const coverPreviewBox = coverFieldBox.querySelector('.htl-form__cover-preview-box') as HTMLElement;

  function switchCoverTab(tab: 'url' | 'upload'): void {
    if (tab === 'url') {
      tabUrlBtn.classList.add('htl-chip--active');
      tabUploadBtn.classList.remove('htl-chip--active');
      urlPane.style.display = 'block';
      uploadPane.style.display = 'none';
    } else {
      tabUploadBtn.classList.add('htl-chip--active');
      tabUrlBtn.classList.remove('htl-chip--active');
      urlPane.style.display = 'none';
      uploadPane.style.display = 'block';
    }
  }

  tabUrlBtn.addEventListener('click', () => switchCoverTab('url'));
  tabUploadBtn.addEventListener('click', () => switchCoverTab('upload'));

  function updateCoverPreview(): void {
    coverPreviewBox.replaceChildren();
    if (currentCover) {
      coverPreviewBox.style.display = 'flex';
      coverPreviewBox.style.alignItems = 'flex-start';
      coverPreviewBox.style.gap = '12px';

      const previewImg = el('img', {
        src: currentCover,
        alt: '封面预览',
        style:
          'max-width: 160px; max-height: 100px; object-fit: cover; border-radius: var(--htl-radius-sm, 4px); border: 1px solid var(--htl-color-border, #e2e8f0);',
      });

      const removeBtn = el(
        'button',
        {
          type: 'button',
          'data-action': 'remove-cover',
          style:
            'padding: 4px 10px; font-size: var(--htl-fs-xs, 12px); color: var(--htl-color-danger, #e5484d); border: 1px solid var(--htl-color-danger, #e5484d); border-radius: var(--htl-radius-sm, 4px); background: transparent; cursor: pointer;',
        },
        ['移除封面']
      );

      removeBtn.addEventListener('click', () => {
        currentCover = '';
        coverUrlInput.value = '';
        coverFileInput.value = '';
        isDirty = true;
        updateCoverPreview();
        clearFieldError('cover');
      });

      coverPreviewBox.appendChild(previewImg);
      coverPreviewBox.appendChild(removeBtn);
    } else {
      coverPreviewBox.style.display = 'none';
    }
  }
  updateCoverPreview();

  coverUrlInput.addEventListener('input', () => {
    currentCover = coverUrlInput.value.trim();
    isDirty = true;
    clearFieldError('cover');
    updateCoverPreview();
  });

  chooseCoverBtn.addEventListener('click', () => {
    coverFileInput.click();
  });

  coverFileInput.addEventListener('change', async () => {
    const file = coverFileInput.files?.[0];
    if (!file) return;

    clearFieldError('cover');
    const res = await compressImage(file);
    if (!res.ok) {
      const errMsg = ISSUE_MESSAGES[res.code] || '图片处理失败';
      showFieldError('cover', errMsg);
    } else {
      currentCover = res.dataUrl;
      isDirty = true;
      updateCoverPreview();
    }
  });

  // 6. 字段：外部链接
  const linksFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['外部链接（最多 10 个）']
    ),
    el('div', {
      class: 'htl-form__links-list',
      style: 'display: flex; flex-direction: column; gap: 8px;',
    }),
    el(
      'button',
      {
        type: 'button',
        class: 'htl-form__btn-add-link',
        'data-action': 'add-link',
        style:
          'align-self: flex-start; margin-top: 8px; padding: 6px 12px; font-size: var(--htl-fs-xs, 12px); border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); background-color: var(--htl-color-surface, #ffffff); cursor: pointer;',
      },
      ['+ 添加链接']
    ),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'links',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const linksListEl = linksFieldBox.querySelector('.htl-form__links-list') as HTMLElement;
  const addLinkBtn = linksFieldBox.querySelector('[data-action="add-link"]') as HTMLButtonElement;

  function renderLinks(): void {
    linksListEl.replaceChildren();
    const atLimit = currentLinks.length >= MAX_LINKS_PER_EVENT;
    addLinkBtn.disabled = atLimit;
    addLinkBtn.style.opacity = atLimit ? '0.5' : '1';
    addLinkBtn.style.cursor = atLimit ? 'not-allowed' : 'pointer';

    currentLinks.forEach((link, idx) => {
      const row = el('div', {
        class: 'htl-form__link-row',
        style: 'display: flex; gap: 8px; align-items: center;',
      });

      const nameInput = el('input', {
        type: 'text',
        class: 'htl-form__input',
        'data-focus-key': `form.event.links.${idx}.name`,
        placeholder: '链接名称',
        maxlength: LINK_NAME_MAX,
        value: link.name,
        style:
          'width: 140px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 6px 10px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
      });
      nameInput.addEventListener('input', () => {
        link.name = nameInput.value;
        isDirty = true;
        clearFieldError(`links.${idx}.name`);
        clearFieldError('links');
      });

      const urlInput = el('input', {
        type: 'text',
        class: 'htl-form__input',
        'data-focus-key': `form.event.links.${idx}.url`,
        placeholder: 'https://...',
        value: link.url,
        style:
          'flex: 1; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 6px 10px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
      });
      urlInput.addEventListener('input', () => {
        link.url = urlInput.value;
        isDirty = true;
        clearFieldError(`links.${idx}.url`);
        clearFieldError('links');
      });

      const removeBtn = el(
        'button',
        {
          type: 'button',
          'data-action': 'remove-link',
          'data-index': idx,
          'aria-label': `移除第 ${idx + 1} 个链接`,
          style:
            'padding: 6px 10px; font-size: var(--htl-fs-xs, 12px); color: var(--htl-color-danger, #e5484d); border: 1px solid var(--htl-color-danger, #e5484d); border-radius: var(--htl-radius-sm, 4px); background: transparent; cursor: pointer; white-space: nowrap;',
        },
        ['移除']
      );
      removeBtn.addEventListener('click', () => {
        currentLinks.splice(idx, 1);
        isDirty = true;
        renderLinks();
      });

      row.appendChild(nameInput);
      row.appendChild(urlInput);
      row.appendChild(removeBtn);
      linksListEl.appendChild(row);
    });
  }
  renderLinks();

  addLinkBtn.addEventListener('click', () => {
    if (currentLinks.length >= MAX_LINKS_PER_EVENT) {
      return;
    }
    currentLinks.push({ name: '', url: '' });
    isDirty = true;
    renderLinks();
    const newIdx = currentLinks.length - 1;
    const addedInput = linksListEl.querySelector(
      `[data-focus-key="form.event.links.${newIdx}.name"]`
    ) as HTMLElement | null;
    addedInput?.focus();
  });

  // 7. 字段：关联事件
  const relationsFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['关联事件（最多 10 条）']
    ),
    el('div', {
      class: 'htl-form__relations-chips',
      style: 'display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;',
    }),
    el('div', { style: 'position: relative;' }, [
      el('input', {
        type: 'text',
        class: 'htl-form__input',
        'data-focus-key': 'form.event.related.search',
        placeholder: '搜索事件（日期或标题）...',
        style:
          'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
      }),
      el('div', {
        class: 'htl-form__relation-dropdown',
        style:
          'max-height: 160px; overflow-y: auto; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); margin-top: 4px; background: var(--htl-color-surface, #ffffff); display: none; position: absolute; left: 0; right: 0; z-index: 10; box-shadow: var(--htl-shadow-card, 0 4px 12px #0000001a);',
      }),
    ]),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'relatedIds',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const relationsChipsEl = relationsFieldBox.querySelector('.htl-form__relations-chips') as HTMLElement;
  const relationSearchInput = relationsFieldBox.querySelector('[data-focus-key="form.event.related.search"]') as HTMLInputElement;
  const relationDropdownEl = relationsFieldBox.querySelector('.htl-form__relation-dropdown') as HTMLElement;

  function renderRelationChips(): void {
    relationsChipsEl.replaceChildren();
    const evts = store.getState().data.events;
    for (const relId of currentRelatedIds) {
      const target = evts.find((e) => e.id === relId);
      const textLabel = target ? `${target.date} ${target.title}` : relId;

      const chip = el(
        'span',
        {
          class: 'htl-chip',
          'data-id': relId,
          style: 'display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;',
        },
        [
          textLabel,
          el(
            'button',
            {
              type: 'button',
              'data-action': 'remove-relation',
              'data-id': relId,
              'aria-label': `移除关联：${textLabel}`,
              style:
                'border: none; background: none; cursor: pointer; padding: 0; font-size: 14px; line-height: 1; color: inherit;',
            },
            ['×']
          ),
        ]
      );

      const removeBtn = chip.querySelector('button');
      removeBtn?.addEventListener('click', () => {
        currentRelatedIds = currentRelatedIds.filter((id) => id !== relId);
        isDirty = true;
        renderRelationChips();
        renderRelationDropdown();
      });

      relationsChipsEl.appendChild(chip);
    }
  }
  renderRelationChips();

  function renderRelationDropdown(): void {
    relationDropdownEl.replaceChildren();
    const evts = store.getState().data.events;
    const currentId = isEdit && targetEvent ? targetEvent.id : null;
    const kw = relationSearchInput.value.trim().toLowerCase();

    const candidates = evts.filter((e) => {
      if (e.id === currentId) return false;
      if (currentRelatedIds.includes(e.id)) return false;
      if (kw) {
        const full = `${e.date} ${e.title}`.toLowerCase();
        if (!full.includes(kw)) return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      const emptyNote = el(
        'div',
        {
          style:
            'padding: 8px 12px; font-size: var(--htl-fs-xs, 12px); color: var(--htl-color-text-muted, #64748b);',
        },
        [kw ? '无匹配事件' : '暂无可关联事件']
      );
      relationDropdownEl.appendChild(emptyNote);
      return;
    }

    for (const c of candidates) {
      const itemEl = el(
        'div',
        {
          class: 'htl-form__relation-option',
          'data-action': 'add-relation',
          'data-id': c.id,
          style:
            'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--htl-color-border, #f1f5f9); font-size: var(--htl-fs-sm, 14px);',
        },
        [`${c.date} ${c.title}`]
      );

      itemEl.addEventListener('mouseenter', () => {
        itemEl.style.backgroundColor = 'var(--htl-color-bg, #f8f9fa)';
      });
      itemEl.addEventListener('mouseleave', () => {
        itemEl.style.backgroundColor = '';
      });

      itemEl.addEventListener('click', () => {
        if (currentRelatedIds.length >= MAX_RELATIONS_PER_EVENT) {
          toast('最多关联 10 条事件', 'warn');
          return;
        }
        currentRelatedIds.push(c.id);
        isDirty = true;
        relationSearchInput.value = '';
        renderRelationChips();
        renderRelationDropdown();
      });

      relationDropdownEl.appendChild(itemEl);
    }
  }

  relationSearchInput.addEventListener('focus', () => {
    renderRelationDropdown();
    relationDropdownEl.style.display = 'block';
  });

  relationSearchInput.addEventListener('input', () => {
    renderRelationDropdown();
    relationDropdownEl.style.display = 'block';
  });

  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node | null;
    if (
      target &&
      !relationSearchInput.contains(target) &&
      !relationDropdownEl.contains(target)
    ) {
      relationDropdownEl.style.display = 'none';
    }
  };
  document.addEventListener('click', onDocClick);

  // 8. 底部操作按钮
  const footerActions = el('div', {
    style:
      'display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--htl-color-border, #e2e8f0);',
  });

  if (isEdit && targetEvent) {
    const deleteBtn = el(
      'button',
      {
        type: 'button',
        'data-action': 'delete-event',
        'data-id': targetEvent.id,
        style:
          'padding: 8px 16px; font-size: var(--htl-fs-sm, 14px); color: var(--htl-color-danger, #e5484d); border: 1px solid var(--htl-color-danger, #e5484d); border-radius: var(--htl-radius-sm, 4px); background: transparent; cursor: pointer; margin-right: auto;',
      },
      ['删除此事件']
    );

    deleteBtn.addEventListener('click', async () => {
      const allEvts = store.getState().data.events;
      const relIndex = buildRelationIndex(allEvts);
      const relationCount = relIndex.get(targetEvent.id)?.length ?? 0;

      const confirmed = await confirmDialog({
        title: '删除事件',
        message: `确定删除「${targetEvent.title}」？将同时解除 ${relationCount} 处关联`,
        confirmText: '确定',
        cancelText: '取消',
        danger: true,
      });

      if (confirmed) {
        const res = store.deleteEvent(targetEvent.id);
        if (res.ok) {
          toast('已删除');
          closeFormModal(true);
        } else {
          toast(res.issues[0]?.message || '删除失败', 'error');
        }
      }
    });

    footerActions.appendChild(deleteBtn);
  }

  const cancelBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'cancel-form',
      style:
        'padding: 8px 16px; font-size: var(--htl-fs-sm, 14px); border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); cursor: pointer;',
    },
    ['取消']
  );

  const saveBtn = el(
    'button',
    {
      type: 'submit',
      'data-action': 'submit-form',
      style:
        'padding: 8px 16px; font-size: var(--htl-fs-sm, 14px); border: 1px solid var(--htl-color-accent, #4c9aff); border-radius: var(--htl-radius-sm, 4px); background-color: var(--htl-color-accent, #4c9aff); color: #ffffff; cursor: pointer; font-weight: 500;',
    },
    ['保存']
  );

  footerActions.appendChild(cancelBtn);
  footerActions.appendChild(saveBtn);

  // 错误处理工具
  function showFieldError(field: string, message: string): void {
    let errEl = modalEl.querySelector(`[data-error-field="${field}"]`) as HTMLElement | null;
    if (!errEl && field.startsWith('links')) {
      errEl = modalEl.querySelector('[data-error-field="links"]') as HTMLElement | null;
    }
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = 'block';
    }
    const inputEl = modalEl.querySelector(
      `[data-focus-key*="${field}"], [data-field="${field}"]`
    ) as HTMLElement | null;
    if (inputEl) {
      inputEl.style.borderColor = 'var(--htl-color-danger, #e5484d)';
    }
  }

  function clearFieldError(field: string): void {
    let errEl = modalEl.querySelector(`[data-error-field="${field}"]`) as HTMLElement | null;
    if (!errEl && field.startsWith('links')) {
      errEl = modalEl.querySelector('[data-error-field="links"]') as HTMLElement | null;
    }
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
    const inputEl = modalEl.querySelector(
      `[data-focus-key*="${field}"], [data-field="${field}"]`
    ) as HTMLElement | null;
    if (inputEl) {
      inputEl.style.borderColor = '';
    }
  }

  function clearAllErrors(): void {
    const errorContainers = modalEl.querySelectorAll('.htl-form__error');
    errorContainers.forEach((el) => {
      (el as HTMLElement).textContent = '';
      (el as HTMLElement).style.display = 'none';
    });
    const inputs = modalEl.querySelectorAll('input, select, textarea');
    inputs.forEach((el) => {
      (el as HTMLElement).style.borderColor = '';
    });
  }

  function focusFirstErrorField(issues: Issue[]): void {
    const first = issues[0];
    if (!first || !first.field) return;
    const target = modalEl.querySelector(
      `[data-focus-key*="${first.field}"], [data-field="${first.field}"]`
    ) as HTMLElement | null;
    target?.focus();
  }

  // 提交处理
  formEl.addEventListener('submit', (ev: Event) => {
    ev.preventDefault();
    clearAllErrors();

    const dateVal = dateInput.value.trim();
    const titleVal = titleInput.value.trim();

    // 1. Core 校验
    const issues = validateEventInput({
      date: dateVal,
      title: titleVal,
    });

    // 2. 封面校验
    if (currentCover) {
      const coverIssues = validateCover(currentCover);
      issues.push(...coverIssues);
    }

    // 3. 链接校验
    if (currentLinks.length > MAX_LINKS_PER_EVENT) {
      issues.push({
        code: 'TOO_MANY_LINKS',
        severity: 'error',
        field: 'links',
        message: ISSUE_MESSAGES.TOO_MANY_LINKS,
      });
    }

    for (let i = 0; i < currentLinks.length; i++) {
      const l = currentLinks[i];
      if (!l) continue;
      const name = l.name.trim();
      const url = l.url.trim();

      if (!name) {
        issues.push({
          code: 'MISSING_REQUIRED',
          severity: 'error',
          field: `links.${i}.name`,
          message: ISSUE_MESSAGES.MISSING_REQUIRED,
        });
      } else if (name.length > LINK_NAME_MAX) {
        issues.push({
          code: 'FIELD_TOO_LONG',
          severity: 'error',
          field: `links.${i}.name`,
          message: ISSUE_MESSAGES.FIELD_TOO_LONG,
        });
      }

      if (!url || !validateUrlScheme(url)) {
        issues.push({
          code: 'INVALID_URL_SCHEME',
          severity: 'error',
          field: `links.${i}.url`,
          message: ISSUE_MESSAGES.INVALID_URL_SCHEME,
        });
      }
    }

    // 4. 关联事件数量校验
    if (currentRelatedIds.length > MAX_RELATIONS_PER_EVENT) {
      issues.push({
        code: 'TOO_MANY_RELATIONS',
        severity: 'error',
        field: 'relatedIds',
        message: ISSUE_MESSAGES.TOO_MANY_RELATIONS,
      });
    }

    if (issues.length > 0) {
      for (const issue of issues) {
        if (issue.field) {
          showFieldError(issue.field, issue.message);
        } else {
          toast(issue.message, 'error');
        }
      }
      focusFirstErrorField(issues);
      return;
    }

    // 5. 提交至 Store
    if (opts.mode === 'create') {
      const createRes = store.createEvent({
        date: dateVal,
        title: titleVal,
      });

      if (!createRes.ok) {
        for (const issue of createRes.issues) {
          if (issue.field) showFieldError(issue.field, issue.message);
          else toast(issue.message, 'error');
        }
        focusFirstErrorField(createRes.issues);
        return;
      }

      const newId = createRes.value.event.id;
      if (currentCover || currentLinks.length > 0) {
        const updateRes = store.updateEvent({
          eventId: newId,
          cover: currentCover || null,
          links: currentLinks.map((l) => ({ name: l.name.trim(), url: l.url.trim() })),
        });
        if (!updateRes.ok) {
          toast(updateRes.issues[0]?.message || '保存失败', 'error');
          return;
        }
      }

      if (currentRelatedIds.length > 0) {
        const relRes = store.setRelations(newId, currentRelatedIds);
        if (!relRes.ok) {
          toast(relRes.issues[0]?.message || '设置关联失败', 'error');
          return;
        }
      }

      toast('已保存');
      closeFormModal(true);
      store.flash(newId);
    } else {
      const updateRes = store.updateEvent({
        eventId: opts.eventId,
        date: dateVal,
        title: titleVal,
        cover: currentCover || null,
        links: currentLinks.map((l) => ({ name: l.name.trim(), url: l.url.trim() })),
      });

      if (!updateRes.ok) {
        for (const issue of updateRes.issues) {
          if (issue.field) showFieldError(issue.field, issue.message);
          else toast(issue.message, 'error');
        }
        focusFirstErrorField(updateRes.issues);
        return;
      }

      const relRes = store.setRelations(opts.eventId, currentRelatedIds);
      if (!relRes.ok) {
        toast(relRes.issues[0]?.message || '设置关联失败', 'error');
        return;
      }

      toast('已保存');
      closeFormModal(true);
      store.flash(opts.eventId);
    }
  });

  // 未保存关闭逻辑
  async function attemptClose(): Promise<void> {
    if (checkDirty()) {
      const confirmed = await confirmDialog({
        title: '确认关闭',
        message: '有未保存的修改，确定关闭？',
        confirmText: '确定',
        cancelText: '取消',
      });
      if (confirmed) {
        document.removeEventListener('click', onDocClick);
        closeFormModal(true);
      }
    } else {
      document.removeEventListener('click', onDocClick);
      closeFormModal(true);
    }
  }

  cancelBtn.addEventListener('click', attemptClose);
  const closeBtn = headerEl.querySelector('[data-action="close-modal"]');
  closeBtn?.addEventListener('click', attemptClose);

  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) {
      attemptClose();
    }
  });

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      attemptClose();
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  activeKeydownListener = onKeydown;
  activeAttemptClose = attemptClose;
  activeModal = modalEl;

  // 装配
  formEl.appendChild(dateFieldBox);
  formEl.appendChild(titleFieldBox);
  formEl.appendChild(coverFieldBox);
  formEl.appendChild(linksFieldBox);
  formEl.appendChild(relationsFieldBox);
  formEl.appendChild(footerActions);

  contentEl.appendChild(headerEl);
  contentEl.appendChild(formEl);
  modalEl.appendChild(contentEl);

  lockScroll();
  overlayRoot.appendChild(modalEl);
  pushOverlayEntry();

  // 默认聚焦标题输入框（若无标题则聚焦标题，若新建且日期为空可聚焦日期）
  titleInput.focus();
}

/**
 * 打开记录表单（新增 / 编辑）
 */
export function openRecordForm(
  opts: ({ eventId: string } | { eventId: string; recordId: string }) & { store?: Store }
): void {
  if (opts.store) {
    setStore(opts.store);
  }
  const rawStore = getStore();
  if (!rawStore) {
    toast('系统状态未就绪', 'error');
    return;
  }
  const store: Store = rawStore;

  // 关闭已有实例
  if (activeModal) {
    closeFormModal(true);
  }

  const state = store.getState();
  const targetEvent = state.data.events.find((e) => e.id === opts.eventId);
  if (!targetEvent) {
    toast('事件不存在或已被删除', 'error');
    return;
  }

  const isEdit = 'recordId' in opts && Boolean(opts.recordId);

  // 上限拦截：已有 20 条记录的事件再点新增记录 → 阻止并提示上限
  if (!isEdit && (targetEvent.records?.length ?? 0) >= MAX_RECORDS_PER_EVENT) {
    toast(ISSUE_MESSAGES.TOO_MANY_RECORDS, 'error');
    return;
  }

  let targetRecord = null;
  if (isEdit) {
    targetRecord = (targetEvent.records ?? []).find((r) => r.id === (opts as any).recordId) ?? null;
    if (!targetRecord) {
      toast('记录不存在或已被删除', 'error');
      return;
    }
  }

  const initialDate = targetRecord ? targetRecord.date : getTodayDateString();
  // 星级评分已从界面移除：数据层仍带 rating 字段（编辑时保留原值，新建固定 3），只为兼容已有数据与 schema
  const initialRating: Rating = targetRecord ? (targetRecord.rating as Rating) : 3;
  const initialSummary = targetRecord ? targetRecord.summary : '';
  const initialDetail = targetRecord && targetRecord.detail ? targetRecord.detail : '';

  let currentDate = initialDate;
  let currentRating: Rating = initialRating;
  let currentSummary = initialSummary;
  let currentDetail = initialDetail;
  let isDirty = false;

  function checkDirty(): boolean {
    if (isDirty) return true;
    if (currentDate !== initialDate) return true;
    if (currentRating !== initialRating) return true;
    if (currentSummary !== initialSummary) return true;
    if (currentDetail !== initialDetail) return true;
    return false;
  }

  const overlayRoot = getOverlayRoot();
  const modalTitle = isEdit ? '编辑记录' : '添加记录';

  const modalEl = el('div', {
    class: 'htl-modal',
    'data-form-modal': 'record',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': modalTitle,
  });

  const contentEl = el('div', {
    class: 'htl-modal__content',
    style: 'max-width: 560px; width: 100%; box-sizing: border-box;',
  });

  // 1. 顶栏
  const headerEl = el(
    'div',
    {
      style:
        'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;',
    },
    [
      el(
        'h3',
        {
          style:
            'margin: 0; font-size: var(--htl-fs-lg, 20px); font-weight: 600; color: var(--htl-color-text, #1e293b);',
        },
        [modalTitle]
      ),
      el(
        'button',
        {
          type: 'button',
          'data-action': 'close-modal',
          'aria-label': '关闭',
          style:
            'background: none; border: none; font-size: 20px; cursor: pointer; color: var(--htl-color-text-muted, #64748b); line-height: 1; padding: 4px;',
        },
        ['×']
      ),
    ]
  );

  const formEl = el('form', {
    novalidate: true,
    style: 'display: flex; flex-direction: column; gap: 16px;',
  });

  const recordIdPrefix = isEdit && (opts as any).recordId ? (opts as any).recordId : 'new';

  // 2. 字段：记录日期
  const dateFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['记录日期 *']
    ),
    el('input', {
      type: 'text',
      class: 'htl-form__input',
      'data-focus-key': `form.record.${recordIdPrefix}.date`,
      'data-field': 'date',
      placeholder: 'YYYY-MM-DD',
      value: currentDate,
      style:
        'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
    }),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'date',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const dateInput = dateFieldBox.querySelector('input') as HTMLInputElement;
  dateInput.addEventListener('input', () => {
    currentDate = dateInput.value;
    isDirty = true;
    clearFieldError('date');
  });

  // 3. 字段：简评
  const summaryFieldBox = el('div', {}, [
    el(
      'label',
      {
        style:
          'display: block; font-size: var(--htl-fs-sm, 14px); font-weight: 500; margin-bottom: 6px; color: var(--htl-color-text, #1e293b);',
      },
      ['简评 * (1~80 字)']
    ),
    el('input', {
      type: 'text',
      class: 'htl-form__input',
      'data-focus-key': `form.record.${recordIdPrefix}.summary`,
      'data-field': 'summary',
      maxlength: SUMMARY_MAX,
      placeholder: '卡片折叠态展示的简评...',
      value: currentSummary,
      style:
        'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box;',
    }),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'summary',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const summaryInput = summaryFieldBox.querySelector('input') as HTMLInputElement;
  summaryInput.addEventListener('input', () => {
    currentSummary = summaryInput.value;
    isDirty = true;
    clearFieldError('summary');
  });

  // 5. 字段：碎碎念
  const detailFieldBox = el('div', {}, [
    el(
      'div',
      { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
      [
        el(
          'label',
          {
            style:
              'font-size: var(--htl-fs-sm, 14px); font-weight: 500; color: var(--htl-color-text, #1e293b);',
          },
          ['碎碎念（可选）']
        ),
        el(
          'span',
          {
            class: 'htl-form__char-count',
            'data-role': 'detail-char-count',
            style: 'font-size: var(--htl-fs-xs, 12px); color: var(--htl-color-text-muted, #64748b);',
          },
          [`${currentDetail.length} / ${DETAIL_MAX}`]
        ),
      ]
    ),
    el('textarea', {
      class: 'htl-form__textarea',
      'data-focus-key': `form.record.${recordIdPrefix}.detail`,
      'data-field': 'detail',
      rows: '5',
      maxlength: DETAIL_MAX,
      placeholder: '写下更详细的记录或心情（上限 2000 字）...',
      value: currentDetail,
      style:
        'width: 100%; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); padding: 8px 12px; font-size: var(--htl-fs-sm, 14px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); box-sizing: border-box; resize: vertical;',
    }),
    el('div', {
      class: 'htl-form__error',
      'data-error-field': 'detail',
      style:
        'display: none; color: var(--htl-color-danger, #e5484d); font-size: var(--htl-fs-xs, 12px); margin-top: 4px;',
    }),
  ]);

  const detailTextarea = detailFieldBox.querySelector('textarea') as HTMLTextAreaElement;
  const charCountEl = detailFieldBox.querySelector('.htl-form__char-count') as HTMLElement;

  detailTextarea.addEventListener('input', () => {
    currentDetail = detailTextarea.value;
    isDirty = true;
    charCountEl.textContent = `${currentDetail.length} / ${DETAIL_MAX}`;
    clearFieldError('detail');
  });

  // 6. 底部操作按钮
  const footerActions = el('div', {
    style:
      'display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--htl-color-border, #e2e8f0);',
  });

  if (isEdit && targetRecord) {
    const deleteBtn = el(
      'button',
      {
        type: 'button',
        'data-action': 'delete-record',
        'data-id': targetRecord.id,
        style:
          'padding: 8px 16px; font-size: var(--htl-fs-sm, 14px); color: var(--htl-color-danger, #e5484d); border: 1px solid var(--htl-color-danger, #e5484d); border-radius: var(--htl-radius-sm, 4px); background: transparent; cursor: pointer; margin-right: auto;',
      },
      ['删除此记录']
    );

    deleteBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: '删除记录',
        message: '确定删除这条记录？',
        confirmText: '确定',
        cancelText: '取消',
        danger: true,
      });

      if (confirmed) {
        const res = store.deleteRecord({
          eventId: opts.eventId,
          recordId: targetRecord.id,
        });
        if (res.ok) {
          toast('已删除');
          closeFormModal(true);
          store.flash(opts.eventId);
        } else {
          toast(res.issues[0]?.message || '删除失败', 'error');
        }
      }
    });

    footerActions.appendChild(deleteBtn);
  }

  const cancelBtn = el(
    'button',
    {
      type: 'button',
      'data-action': 'cancel-form',
      style:
        'padding: 8px 16px; font-size: var(--htl-fs-sm, 14px); border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: var(--htl-radius-sm, 4px); background-color: var(--htl-color-surface, #ffffff); color: var(--htl-color-text, #1e293b); cursor: pointer;',
    },
    ['取消']
  );

  const saveBtn = el(
    'button',
    {
      type: 'submit',
      'data-action': 'submit-form',
      style:
        'padding: 8px 16px; font-size: var(--htl-fs-sm, 14px); border: 1px solid var(--htl-color-accent, #4c9aff); border-radius: var(--htl-radius-sm, 4px); background-color: var(--htl-color-accent, #4c9aff); color: #ffffff; cursor: pointer; font-weight: 500;',
    },
    ['保存']
  );

  footerActions.appendChild(cancelBtn);
  footerActions.appendChild(saveBtn);

  // 错误处理工具
  function showFieldError(field: string, message: string): void {
    const errEl = modalEl.querySelector(`[data-error-field="${field}"]`) as HTMLElement | null;
    if (errEl) {
      errEl.textContent = message;
      errEl.style.display = 'block';
    }
    const inputEl = modalEl.querySelector(
      `[data-focus-key*="${field}"], [data-field="${field}"]`
    ) as HTMLElement | null;
    if (inputEl) {
      inputEl.style.borderColor = 'var(--htl-color-danger, #e5484d)';
    }
  }

  function clearFieldError(field: string): void {
    const errEl = modalEl.querySelector(`[data-error-field="${field}"]`) as HTMLElement | null;
    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }
    const inputEl = modalEl.querySelector(
      `[data-focus-key*="${field}"], [data-field="${field}"]`
    ) as HTMLElement | null;
    if (inputEl) {
      inputEl.style.borderColor = '';
    }
  }

  function clearAllErrors(): void {
    const errorContainers = modalEl.querySelectorAll('.htl-form__error');
    errorContainers.forEach((el) => {
      (el as HTMLElement).textContent = '';
      (el as HTMLElement).style.display = 'none';
    });
    const inputs = modalEl.querySelectorAll('input, select, textarea');
    inputs.forEach((el) => {
      (el as HTMLElement).style.borderColor = '';
    });
  }

  function focusFirstErrorField(issues: Issue[]): void {
    const first = issues[0];
    if (!first || !first.field) return;
    const target = modalEl.querySelector(
      `[data-focus-key*="${first.field}"], [data-field="${first.field}"]`
    ) as HTMLElement | null;
    target?.focus();
  }

  // 提交处理
  formEl.addEventListener('submit', (ev: Event) => {
    ev.preventDefault();
    clearAllErrors();

    const dateVal = dateInput.value.trim();
    const summaryVal = summaryInput.value.trim();
    const detailVal = detailTextarea.value;

    const issues = validateRecordInput({
      date: dateVal,
      rating: currentRating,
      summary: summaryVal,
      detail: detailVal ? detailVal : undefined,
    });

    if (issues.length > 0) {
      for (const issue of issues) {
        if (issue.field) {
          showFieldError(issue.field, issue.message);
        } else {
          toast(issue.message, 'error');
        }
      }
      focusFirstErrorField(issues);
      return;
    }

    if (!isEdit) {
      const res = store.addRecord({
        eventId: opts.eventId,
        date: dateVal,
        rating: currentRating,
        summary: summaryVal,
        detail: detailVal ? detailVal : undefined,
      });

      if (!res.ok) {
        for (const issue of res.issues) {
          if (issue.code === 'TOO_MANY_RECORDS') {
            toast(issue.message, 'error');
          } else if (issue.field) {
            showFieldError(issue.field, issue.message);
          } else {
            toast(issue.message, 'error');
          }
        }
        focusFirstErrorField(res.issues);
        return;
      }
    } else {
      const res = store.updateRecord({
        eventId: opts.eventId,
        recordId: (opts as any).recordId,
        date: dateVal,
        rating: currentRating,
        summary: summaryVal,
        detail: detailVal ? detailVal : null,
      });

      if (!res.ok) {
        for (const issue of res.issues) {
          if (issue.field) {
            showFieldError(issue.field, issue.message);
          } else {
            toast(issue.message, 'error');
          }
        }
        focusFirstErrorField(res.issues);
        return;
      }
    }

    toast('已保存');
    closeFormModal(true);
    store.flash(opts.eventId);
  });

  // 未保存关闭逻辑
  async function attemptClose(): Promise<void> {
    if (checkDirty()) {
      const confirmed = await confirmDialog({
        title: '确认关闭',
        message: '有未保存的修改，确定关闭？',
        confirmText: '确定',
        cancelText: '取消',
      });
      if (confirmed) {
        closeFormModal(true);
      }
    } else {
      closeFormModal(true);
    }
  }

  cancelBtn.addEventListener('click', attemptClose);
  const closeBtn = headerEl.querySelector('[data-action="close-modal"]');
  closeBtn?.addEventListener('click', attemptClose);

  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) {
      attemptClose();
    }
  });

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      attemptClose();
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  activeKeydownListener = onKeydown;
  activeAttemptClose = attemptClose;
  activeModal = modalEl;

  // 装配
  formEl.appendChild(dateFieldBox);
  formEl.appendChild(summaryFieldBox);
  formEl.appendChild(detailFieldBox);
  formEl.appendChild(footerActions);

  contentEl.appendChild(headerEl);
  contentEl.appendChild(formEl);
  modalEl.appendChild(contentEl);

  lockScroll();
  overlayRoot.appendChild(modalEl);
  pushOverlayEntry();

  summaryInput.focus();
}
