/**
 * 云端同步面板
 *
 * 只做 UI：读写配置、触发 SyncService 的 pull / push、把结果翻译成人话。
 * 冲突不走静默覆盖：409 之后由用户点「用云端覆盖本地」或「用本地覆盖云端」。
 */

import { el } from '../dom';
import { toast } from './toast';
import { confirmDialog } from './confirm';
import type { SyncService, PushResult } from '../sync';
import type { RemoteSnapshot } from '../../core/sync';

let service: SyncService | null = null;
let panelEl: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function setSyncService(s: SyncService): void {
  service = s;
}

function overlayRoot(): HTMLElement {
  let root = document.getElementById('overlay-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'overlay-root';
    document.body.appendChild(root);
  }
  return root;
}

export function isSyncPanelOpen(): boolean {
  return panelEl !== null;
}

export function closeSyncPanel(): void {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
  }
  document.body.classList.remove('is-locked');
  if (panelEl && panelEl.parentNode) {
    panelEl.parentNode.removeChild(panelEl);
  }
  panelEl = null;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '从未同步';
  return iso.replace('T', ' ').slice(0, 19);
}

export function openSyncPanel(s: SyncService): void {
  setSyncService(s);
  if (!service) return;
  closeSyncPanel();

  const root = overlayRoot();
  const backdrop = el('div', { class: 'htl-modal', 'data-sync-modal': '', role: 'dialog', 'aria-modal': 'true', 'aria-label': '云端同步' });
  const content = el('div', {
    class: 'htl-modal__content',
    style:
      'max-width: 560px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: var(--htl-space-4, 16px);',
  });

  const closeBtn = el(
    'button',
    {
      type: 'button',
      'data-role': 'sync-close',
      'aria-label': '关闭',
      style:
        'background: transparent; border: none; font-size: 20px; cursor: pointer; padding: 4px; line-height: 1; color: var(--htl-color-text-muted, #64748b);',
    },
    ['×']
  );

  const header = el('div', { style: 'display: flex; justify-content: space-between; align-items: center;' }, [
    el('h3', { style: 'margin: 0; font-size: var(--htl-fs-lg, 20px); font-weight: 600;' }, ['云端同步']),
    closeBtn,
  ]);

  const statusLine = el('div', {
    'data-role': 'sync-status',
    style:
      'font-size: var(--htl-fs-sm, 14px); line-height: 1.6; color: var(--htl-color-text-muted, #64748b); padding: 10px 12px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 4px; background: var(--htl-color-bg, #f8f9fa);',
  });

  const endpointInput = el('input', {
    type: 'text',
    'data-role': 'sync-endpoint',
    placeholder: '/api 或 https://xxx.workers.dev/api',
    style: 'width: 100%; box-sizing: border-box; padding: 8px; font-size: 14px;',
  }) as HTMLInputElement;

  const tokenInput = el('input', {
    type: 'password',
    'data-role': 'sync-token',
    placeholder: '同步口令（服务端 SYNC_TOKEN）',
    autocomplete: 'off',
    style: 'width: 100%; box-sizing: border-box; padding: 8px; font-size: 14px;',
  }) as HTMLInputElement;

  const autoInput = el('input', {
    type: 'checkbox',
    'data-role': 'sync-auto',
  }) as HTMLInputElement;

  const field = (label: string, control: HTMLElement): HTMLElement =>
    el('div', { style: 'display: flex; flex-direction: column; gap: 6px;' }, [
      el('label', { style: 'font-size: 14px; font-weight: 500;' }, [label]),
      control,
    ]);

  const form = el('div', { style: 'display: flex; flex-direction: column; gap: var(--htl-space-3, 12px);' }, [
    field('服务地址', endpointInput),
    field('同步口令', tokenInput),
    el('label', { style: 'display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer;' }, [
      autoInput,
      el('span', {}, ['自动同步（改动后推送、打开页面时拉取）']),
    ]),
  ]);

  const messageLine = el('div', {
    'data-role': 'sync-message',
    style: 'display: none; font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 4px;',
  });

  const conflictBox = el('div', {
    'data-role': 'sync-conflict',
    style:
      'display: none; flex-direction: column; gap: 10px; padding: 10px 12px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 4px; font-size: 13px; line-height: 1.5;',
  });

  const btn = (role: string, label: string, primary = false): HTMLButtonElement =>
    el(
      'button',
      {
        type: 'button',
        'data-role': role,
        class: primary ? 'htl-chip htl-chip--active' : 'htl-chip',
        style: 'padding: 6px 14px; font-size: 14px;',
      },
      [label]
    ) as HTMLButtonElement;

  const testBtn = btn('sync-test', '测试连接');
  const saveBtn = btn('sync-save', '保存设置', true);
  const pullBtn = btn('sync-pull', '立即拉取');
  const pushBtn = btn('sync-push', '立即推送');
  const closeFooter = btn('sync-close', '关闭');

  const actions = el('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px;' }, [testBtn, saveBtn]);
  const actions2 = el('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px;' }, [pullBtn, pushBtn]);
  const footer = el(
    'div',
    {
      style:
        'display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--htl-color-border, #e2e8f0); padding-top: 12px;',
    },
    [closeFooter]
  );

  content.appendChild(header);
  content.appendChild(statusLine);
  content.appendChild(form);
  content.appendChild(messageLine);
  content.appendChild(conflictBox);
  content.appendChild(actions);
  content.appendChild(actions2);
  content.appendChild(footer);
  backdrop.appendChild(content);

  const showMessage = (text: string, kind: 'ok' | 'error' | 'info' = 'info'): void => {
    const palette: Record<string, string> = {
      ok: 'background: #dcfce7; color: #15803d;',
      error: 'background: #fee2e2; color: #b91c1c;',
      info: 'background: #eff6ff; color: #1d4ed8;',
    };
    messageLine.textContent = text;
    messageLine.setAttribute('style', `display: block; font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 4px; ${palette[kind]}`);
  };
  const clearMessage = (): void => {
    messageLine.textContent = '';
    messageLine.setAttribute('style', 'display: none;');
  };

  const renderStatus = (): void => {
    if (!service) return;
    const st = service.status();
    const parts: string[] = [];
    if (!st.ready) {
      parts.push('未配置：填好服务地址与口令后点保存');
    } else {
      parts.push(`已连接 ${st.endpoint}`);
      parts.push(`云端 v${st.revision}`);
      parts.push(`上次同步 ${fmtTime(st.lastSyncedAt)}`);
      parts.push(st.dirty ? '本地有未推送改动' : '本地与云端一致');
      parts.push(st.auto ? '自动同步已开' : '自动同步已关');
    }
    statusLine.textContent = parts.join(' · ');
  };

  const hideConflict = (): void => {
    conflictBox.replaceChildren();
    conflictBox.setAttribute('style', 'display: none;');
  };

  const loadForm = (): void => {
    if (!service) return;
    const cfg = service.getConfig();
    endpointInput.value = cfg.endpoint;
    tokenInput.value = cfg.token;
    autoInput.checked = cfg.auto;
  };

  const saveConfig = (): void => {
    if (!service) return;
    service.saveConfig({
      endpoint: endpointInput.value,
      token: tokenInput.value,
      auto: autoInput.checked,
    });
    endpointInput.value = service.getConfig().endpoint;
    renderStatus();
  };

  const showConflict = (remote: RemoteSnapshot, message: string): void => {
    conflictBox.replaceChildren();
    conflictBox.appendChild(
      el('div', { style: 'font-weight: 600; color: #991b1b;' }, [`冲突：${message}`])
    );
    conflictBox.appendChild(
      el('div', {}, [
        `云端 v${remote.revision}（保存于 ${fmtTime(remote.savedAt)}），本地也改过。选一个——`,
      ])
    );
    const takeRemote = btn('sync-use-remote', '用云端覆盖本地');
    const keepLocal = btn('sync-force-push', '用本地覆盖云端');
    takeRemote.addEventListener('click', () => {
      if (!service) return;
      const r = service.applyRemoteSnapshot(remote);
      if (r.ok) {
        hideConflict();
        showMessage(`已用云端 v${remote.revision} 覆盖本地`, 'ok');
        toast('已拉取云端版本');
      } else {
        showMessage(r.message, 'error');
      }
      renderStatus();
    });
    keepLocal.addEventListener('click', () => {
      void doPush(true);
    });
    conflictBox.appendChild(el('div', { style: 'display: flex; gap: 8px; flex-wrap: wrap;' }, [takeRemote, keepLocal]));
    conflictBox.setAttribute('style', 'display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 4px; font-size: 13px; line-height: 1.5;');
  };

  const doPush = async (force: boolean): Promise<PushResult | null> => {
    if (!service) return null;
    saveConfig();
    clearMessage();
    showMessage('正在推送…', 'info');
    const result = await service.push(force);
    if (result.ok) {
      hideConflict();
      showMessage(result.message, 'ok');
    } else if (result.kind === 'conflict' && result.remote) {
      clearMessage();
      showConflict(result.remote, result.message);
    } else {
      showMessage(result.message, 'error');
    }
    renderStatus();
    return result;
  };

  testBtn.addEventListener('click', () => {
    if (!service) return;
    saveConfig();
    void (async () => {
      showMessage('正在测试连接…', 'info');
      const r = await service!.health();
      showMessage(r.message, r.ok ? 'ok' : 'error');
    })();
  });

  saveBtn.addEventListener('click', () => {
    saveConfig();
    showMessage('设置已保存在本机', 'ok');
  });

  pullBtn.addEventListener('click', () => {
    if (!service) return;
    void (async () => {
      const st = service!.status();
      if (st.dirty && st.lastSyncedAt !== null) {
        const go = await confirmDialog({
          title: '拉取会覆盖本地改动',
          message: '本地有还没推送的改动，拉取会用云端数据覆盖它。继续？建议先点「立即推送」或导出备份。',
          confirmText: '仍然拉取',
          danger: true,
        });
        if (!go) return;
      }
      saveConfig();
      clearMessage();
      showMessage('正在拉取…', 'info');
      const r = await service!.pull();
      if (r.ok) {
        hideConflict();
        showMessage(r.message, r.applied ? 'ok' : 'info');
        if (r.applied) toast('已从云端拉取');
      } else {
        showMessage(r.message, 'error');
      }
      renderStatus();
    })();
  });

  pushBtn.addEventListener('click', () => {
    void doPush(false);
  });

  closeBtn.addEventListener('click', closeSyncPanel);
  closeFooter.addEventListener('click', closeSyncPanel);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSyncPanel();
  });

  keyHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      closeSyncPanel();
    }
  };
  document.addEventListener('keydown', keyHandler, true);

  document.body.classList.add('is-locked');
  root.appendChild(backdrop);
  panelEl = backdrop;

  loadForm();
  renderStatus();
}
