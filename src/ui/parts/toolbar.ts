/**
 * 全局工具栏（新建事件 / 导入 / 导出 / 恢复备份）
 *
 * 补设计缺口：detailed-design.md 的 §4.6 DOM 契约只定了四个容器，
 * 没有任何模块负责渲染这几个全局动作的入口按钮，导致 REQ-001 / REQ-009 / REQ-010
 * 在 v0.0.1 的 UI 上无路可走。本模块只做「渲染按钮」这一件事：
 * 不读 store、不做业务判断，点击全部经 bind.ts 的一次性委托交给 main.ts 的 handler。
 */

import { el } from '../dom';

interface ToolbarItem {
  action: string;
  label: string;
  title: string;
}

const ITEMS: ToolbarItem[] = [
  { action: 'new-event', label: '+ 新建事件', title: '新建一条事件（快捷键：无）' },
  { action: 'open-import', label: '导入', title: '从 JSON 文件或粘贴导入' },
  { action: 'open-export', label: '导出', title: '下载或复制全部数据' },
  { action: 'reset-seed', label: '重置为示例', title: '清空本地数据并重新载入随应用发布的示例事件' },
];

/** 幂等：重复调用只重建 #toolbar 的子树 */
export function renderToolbar(): void {
  const host = document.getElementById('toolbar');
  if (!host) {
    return;
  }
  const bar = el('div', { class: 'htl-toolbar', role: 'toolbar', 'aria-label': '全局操作' });
  for (const item of ITEMS) {
    bar.appendChild(
      el(
        'button',
        {
          type: 'button',
          class: 'htl-chip htl-toolbar__btn',
          'data-action': item.action,
          title: item.title,
        },
        [item.label]
      )
    );
  }
  host.replaceChildren(bar);
}
