/**
 * 容量水位提示条（补设计缺口）
 *
 * detailed-design.md §7.2 要求：「水位到 4MiB → 顶部黄色警示条，不阻断 →
 * 「本地存储已用 X MB，约还能存 N 张配图」」，并注明该文案属于 UI 层自持。
 * 但 §3 模块表里没有任何模块被分配这个渲染职责，T05/T09 只把 capacity 放进 view，
 * T14 的 render 只重建 #timeline-root，结果用户永远看不到水位预警。
 *
 * 本模块独立订阅 store，只读 view.capacity，不参与 #timeline-root 重绘。
 */

import { el } from '../dom';
import type { AppState } from '../../core/types';

interface CapacitySource {
  subscribe(listener: (s: AppState) => void): () => void;
  getState(): AppState;
}

let bar: HTMLElement | null = null;

function ensureBar(): HTMLElement {
  if (bar && bar.parentNode) {
    return bar;
  }
  const host = document.getElementById('capacity-host') ?? document.body;
  bar = el('div', {
    id: 'capacity-bar',
    class: 'htl-capacity-bar',
    role: 'status',
    'aria-live': 'polite',
  });
  host.prepend(bar);
  return bar;
}

function removeBar(): void {
  if (bar && bar.parentNode) {
    bar.parentNode.removeChild(bar);
  }
  bar = null;
}

/** 仅在有压力时出现；level 回到 ok 立刻移除（不阻断） */
export function renderCapacityBar(state: AppState): void {
  const { capacity } = state.view;
  if (capacity.level === 'ok') {
    removeBar();
    return;
  }
  const usedMb = (capacity.bytes / (1024 * 1024)).toFixed(1);
  const node = ensureBar();
  node.classList.toggle('htl-capacity-bar--block', capacity.level === 'block');
  node.textContent =
    capacity.level === 'block'
      ? `本地存储已用 ${usedMb} MB，已达上限，新的配图写入会被拒绝，请改用图片链接或删除旧配图`
      : `本地存储已用 ${usedMb} MB，约还能存 ${capacity.remainingImages} 张配图`;
}

/** 传 store 实例即可，main.ts 一行接入 */
export function mountCapacityBar(store: CapacitySource): void {
  store.subscribe(renderCapacityBar);
  renderCapacityBar(store.getState());
}
