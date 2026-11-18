/**
 * MOD-016 一次性事件委托
 * 在 document 上注册委托监听（click 与 input），通过 closest('[data-action]') 派发。
 * 启动时调用一次，内部维护 bound 标志确保幂等，避免重绘导致重复监听。
 */

export interface ActionHandler {
  (action: string, id: string | undefined, ev: Event): void;
}

let bound = false;

export function bindActions(handler: ActionHandler): void {
  if (bound) {
    return;
  }
  bound = true;

  const listener = (ev: Event): void => {
    const target = ev.target as Node | null;
    const element = target instanceof Element ? target : target?.parentElement;
    const actionEl = element?.closest('[data-action]');
    if (!actionEl) {
      return;
    }
    const action = actionEl.getAttribute('data-action');
    if (!action) {
      return;
    }
    const id = actionEl.getAttribute('data-id') ?? undefined;
    handler(action, id, ev);
  };

  document.addEventListener('click', listener);
  document.addEventListener('input', listener);
}
