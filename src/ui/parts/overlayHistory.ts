/**
 * 浮层历史栈（overlayHistory.ts）
 *
 * 解决的问题：详情 / 表单 / 灯箱这类浮层以前只在页面内挂节点，浏览器「返回」
 * 会把整个页面退出去。这里给每个打开的浮层压一条 history 记录，让返回键先关浮层。
 *
 * 约定：
 * 1. 打开浮层时调用 pushOverlayEntry()（紧跟 appendChild 之后）。
 * 2. 浮层真正关掉之后，在关闭函数里调用 dropOverlayEntry()，把那条记录静默退掉——
 *    静默指不会再触发一次关闭，避免「自己把自己关两遍」。
 * 3. 用户按返回键时走 popstate：调 closeTop 关掉最上层浮层，条目已经被浏览器退掉，
 *    所以这里不再 drop。
 * 4. 所有关闭路径必须走 detailModal.closeDetail / formModal.closeFormModal /
 *    lightbox.closeLightbox，不要直接删节点，否则历史栈会残留幽灵条目。
 */

let depth = 0;
/** 我们自己调 history.back() 时置位，用来吞掉那次 popstate */
let suppressNextPop = false;
/** 正在处理 popstate：此时关闭浮层不应再退条目 */
let handlingPop = false;
let closeTopHandler: (() => boolean) | null = null;

function isOverlayState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>).htlOverlay === true
  );
}

/**
 * 初始化：注册 popstate，返回键优先关浮层。
 * @param closeTop 关闭最上层浮层；关掉了返回 true，没有可关的返回 false
 */
export function initOverlayHistory(closeTop: () => boolean): void {
  closeTopHandler = closeTop;

  // 刷新后浏览器会保留当前条目的 state，先清掉，否则返回键会多退一步
  if (isOverlayState(history.state)) {
    history.replaceState(null, '');
  }

  window.addEventListener('popstate', () => {
    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }
    handlingPop = true;
    try {
      const closed = closeTopHandler ? closeTopHandler() : false;
      if (closed && depth > 0) {
        depth -= 1;
      }
    } finally {
      handlingPop = false;
    }
  });
}

/** 浮层打开后压一条历史记录 */
export function pushOverlayEntry(): void {
  try {
    history.pushState({ htlOverlay: true }, '');
    depth += 1;
  } catch {
    // pushState 不可用（极旧环境）：退化成纯内存浮层，返回键仍会退出页面
  }
}

/** 浮层真正关闭后调用：静默退掉对应历史记录 */
export function dropOverlayEntry(): void {
  if (handlingPop || depth <= 0) {
    return;
  }
  depth -= 1;
  suppressNextPop = true;
  history.back();
}

/** 当前是否有浮层历史记录（调试与测试用） */
export function overlayDepth(): number {
  return depth;
}
