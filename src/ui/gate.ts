/**
 * 同步门禁（只在「带 /api 的部署」上启用）
 *
 * 目的：
 * - Cloudflare Worker 那份站点默认就是要同步的，打开时先要口令；
 * - 没有口令 / 口令不对，就停在锁屏，不给看数据也不给改；
 * - GitHub Pages 那份是展示站（没有 /api），探不到后端就不上锁，行为跟以前一样。
 *
 * 判断依据是真实探测 `/api/health`：返回我们自己的 JSON 才算 API 模式，
 * 不靠 hostname 猜——换了自定义域名也不会判断错。
 */

import { el } from './dom';
import type { StoragePort } from '../core/types';
import {
  configFromRaw,
  isEndpointUsable,
  normalizeEndpoint,
  SYNC_CONFIG_KEY,
  type SyncConfig,
} from '../core/sync';

export interface ApiProbe {
  mode: 'api' | 'static';
  endpoint: string;
  revision: number;
}

/** 探测当前站点后面有没有同步后端 */
export async function probeApiMode(): Promise<ApiProbe> {
  const fallback: ApiProbe = { mode: 'static', endpoint: '/api', revision: 0 };
  try {
    const res = await fetch('/api/health', { headers: { accept: 'application/json' } });
    if (!res.ok) return fallback;
    const body = (await res.json()) as { ok?: boolean; service?: string; revision?: number };
    if (body?.ok !== true || typeof body.service !== 'string' || !body.service.includes('timeline')) {
      return fallback;
    }
    return {
      mode: 'api',
      endpoint: '/api',
      revision: typeof body.revision === 'number' ? body.revision : 0,
    };
  } catch {
    return fallback;
  }
}

function endpointOf(config: SyncConfig): string {
  const normalized = normalizeEndpoint(config.endpoint);
  return isEndpointUsable(normalized) ? normalized : '/api';
}

/** 用口令真的读一次 /data：2xx 才算有效 */
export async function verifyToken(config: SyncConfig): Promise<boolean> {
  const token = config.token.trim();
  if (token === '') return false;
  try {
    const res = await fetch(`${endpointOf(config)}/data`, {
      method: 'GET',
      headers: { 'x-sync-token': token },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function persist(config: StoragePort, endpoint: string, token: string): void {
  config.write(
    SYNC_CONFIG_KEY,
    JSON.stringify({ endpoint: normalizeEndpoint(endpoint) || '/api', token: token.trim(), auto: true })
  );
}

/**
 * 门禁主函数：已存有效口令直接放行；否则锁屏等输入。
 * 返回 true 表示可以进入应用。
 */
export async function unlockGate(storage: StoragePort): Promise<boolean> {
  const stored = configFromRaw(storage.read(SYNC_CONFIG_KEY));
  const storedConfig: SyncConfig = { ...stored, endpoint: '/api' };

  if (storedConfig.token !== '' && (await verifyToken(storedConfig))) {
    // 口令有效：顺手把 auto 打开、endpoint 归到同源 /api
    persist(storage, '/api', storedConfig.token);
    return true;
  }

  return openLockScreen(storage, storedConfig.token);
}

function openLockScreen(storage: StoragePort, initialToken: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const overlay = el('div', {
      'data-gate': '',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': '需要同步口令',
      style:
        'position: fixed; inset: 0; z-index: 9998; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--htl-color-bg, #f4f1ea);',
    });

    const card = el('div', {
      style:
        'width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 14px; padding: 24px; border: 1px solid var(--htl-color-border, #e2e8f0); border-radius: 6px; background: var(--htl-color-surface, #fff); box-shadow: 0 10px 30px rgba(0,0,0,0.08);',
    });

    card.appendChild(
      el('div', { style: 'font-size: 12px; letter-spacing: 0.18em; color: var(--htl-color-text-muted, #64748b);' }, [
        'PRIVATE ARCHIVE',
      ])
    );
    card.appendChild(el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 700;' }, ['输入同步口令']));
    card.appendChild(
      el('p', { style: 'margin: 0; font-size: 13px; line-height: 1.6; color: var(--htl-color-text-muted, #64748b);' }, [
        '这份部署接的是云端数据，口令不对就不放行。口令只存在这台设备上，不会发给别人。',
      ])
    );

    const input = el('input', {
      type: 'password',
      'data-role': 'gate-token',
      autocomplete: 'off',
      placeholder: '同步口令',
      style: 'width: 100%; box-sizing: border-box; padding: 10px; font-size: 14px;',
    }) as HTMLInputElement;
    input.value = initialToken;

    const message = el('div', {
      'data-role': 'gate-message',
      style: 'display: none; font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 4px;',
    });

    const submit = el(
      'button',
      {
        type: 'button',
        'data-role': 'gate-submit',
        class: 'htl-chip htl-chip--active',
        style: 'width: 100%; padding: 10px; font-size: 14px;',
      },
      ['解锁']
    ) as HTMLButtonElement;

    const showError = (text: string): void => {
      message.textContent = text;
      message.setAttribute(
        'style',
        'display: block; font-size: 13px; line-height: 1.5; padding: 8px 10px; border-radius: 4px; background: #fee2e2; color: #b91c1c;'
      );
    };

    let busy = false;
    const attempt = async (): Promise<void> => {
      if (busy) return;
      const token = input.value.trim();
      if (token === '') {
        showError('口令不能为空');
        return;
      }
      busy = true;
      submit.disabled = true;
      submit.textContent = '验证中…';
      const ok = await verifyToken({ endpoint: '/api', token, auto: true });
      busy = false;
      submit.disabled = false;
      submit.textContent = '解锁';
      if (!ok) {
        showError('口令不对，或者服务端还没设 SYNC_TOKEN');
        input.select();
        return;
      }
      persist(storage, '/api', token);
      overlay.remove();
      document.body.classList.remove('is-locked');
      resolve(true);
    };

    submit.addEventListener('click', () => {
      void attempt();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void attempt();
      }
    });
    // 锁屏期间不许 Esc 关掉
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    card.appendChild(input);
    card.appendChild(message);
    card.appendChild(submit);
    card.appendChild(
      el('div', { style: 'font-size: 12px; color: var(--htl-color-text-muted, #64748b); line-height: 1.6;' }, [
        '忘记口令：在项目里跑 npm run cf:secret 重设 Worker 的 SYNC_TOKEN，再回来填新口令。',
      ])
    );

    overlay.appendChild(card);
    document.body.classList.add('is-locked');
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}
