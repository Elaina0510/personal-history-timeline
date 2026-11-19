/**
 * MOD-016: 滚动锁引用计数管理
 *
 * 契约：
 * - 模块级 count，计数只能是 0..N。
 * - lockScroll(): count 加一；首次从 0→1 时给 document.body 添加 'is-locked'。
 * - unlockScroll(): count 减一并夹到 0；从 1→0 时移除 'is-locked'。在 0 时调用为 no-op，不抛错、不出现负计数。
 * - resetScrollLock(): count 归零并移除 'is-locked'（仅供测试与整页重置）。
 */

let count = 0;

export function lockScroll(): void {
  count += 1;
  if (count === 1) {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.add('is-locked');
    }
  }
}

export function unlockScroll(): void {
  if (count <= 0) {
    return;
  }
  count -= 1;
  if (count === 0) {
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('is-locked');
    }
  }
}

export function resetScrollLock(): void {
  count = 0;
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('is-locked');
  }
}
