/**
 * MOD-013: 年份导航 (yearNav.ts)
 * 职责：年份锚点、回到顶部、IntersectionObserver 滚动高亮跟随。
 *
 * 禁令：
 * - 年份锚点只列 allYears() 给出的年份（当前结果中存在的）
 * - 筛选结果为空时隐藏年份导航
 * - 不用 scrollIntoView 的 block:'center'（用 'start' + 偏移）
 */

import { el } from '../dom';
import type { AppState } from '../../core/types';
import type { YearGroup } from '../../core/select';
import { allYears } from '../../core/select';
import { registerYearNavRenderer } from '../render';

let yearObserver: IntersectionObserver | null = null;
let currentActiveYear: string | null = null;
let scrollListenerBound = false;
let yearNavClickBound = false;

function escapeCss(val: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(val);
  }
  return val.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function setActiveYear(year: string): void {
  currentActiveYear = year;
  const nav = document.getElementById('year-nav');
  if (!nav) return;

  const chips = nav.querySelectorAll('[data-action="jump-year"]');
  chips.forEach((chip) => {
    const chipYear = chip.getAttribute('data-year') || chip.getAttribute('data-id');
    if (chipYear === year) {
      chip.classList.add('is-active');
      chip.setAttribute('aria-current', 'true');
    } else {
      chip.classList.remove('is-active');
      chip.removeAttribute('aria-current');
    }
  });
}

export function getActiveYear(): string | null {
  return currentActiveYear;
}

export function scrollToYear(year: string): void {
  if (typeof document === 'undefined') return;

  const escapedYear = escapeCss(year);
  const target =
    document.getElementById(`year-${escapedYear}`) ||
    document.getElementById(`year-${year}`) ||
    document.querySelector(`[data-year="${escapedYear}"]`);

  if (!target) return;

  const filterBar = document.getElementById('filter-bar');
  const offset = filterBar ? filterBar.getBoundingClientRect().height : 0;
  const targetTop = window.scrollY + target.getBoundingClientRect().top - offset;

  const prefersReduced =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    try {
      window.scrollTo({
        top: Math.max(0, Math.round(targetTop)),
        behavior: prefersReduced ? 'instant' : 'smooth',
      });
    } catch {
      window.scrollTo(0, Math.max(0, Math.round(targetTop)));
    }
  }

  setActiveYear(year);

  try {
    (target as HTMLElement).focus?.();
  } catch {
    // 忽略焦点设置异常
  }
}

export function scrollToTop(): void {
  if (typeof window === 'undefined') return;

  const prefersReduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  if (typeof window.scrollTo === 'function') {
    try {
      window.scrollTo({
        top: 0,
        behavior: prefersReduced ? 'instant' : 'smooth',
      });
    } catch {
      window.scrollTo(0, 0);
    }
  }
}

function updateScrollTopVisibility(): void {
  const scrollTopBtn = document.querySelector('#year-nav [data-action="scroll-top"]') as HTMLElement | null;
  if (!scrollTopBtn || typeof window === 'undefined') return;

  const isOverOneScreen = window.scrollY > window.innerHeight;
  if (isOverOneScreen) {
    scrollTopBtn.classList.remove('is-hidden');
    scrollTopBtn.style.display = '';
  } else {
    scrollTopBtn.classList.add('is-hidden');
    scrollTopBtn.style.display = 'none';
  }
}

function ensureScrollListener(): void {
  if (scrollListenerBound || typeof window === 'undefined') return;
  scrollListenerBound = true;

  window.addEventListener(
    'scroll',
    () => {
      updateScrollTopVisibility();
    },
    { passive: true }
  );
}

function setupIntersectionObserver(years: string[]): void {
  if (yearObserver) {
    yearObserver.disconnect();
    yearObserver = null;
  }

  if (typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const filterBar = document.getElementById('filter-bar');
  const filterBarHeight = filterBar ? Math.round(filterBar.getBoundingClientRect().height) : 60;

  const groupsToObserve = document.querySelectorAll('.htl-year-group');
  if (groupsToObserve.length === 0) {
    return;
  }

  yearObserver = new IntersectionObserver(
    (entries) => {
      const intersecting = entries.filter((e) => e.isIntersecting);
      if (intersecting.length > 0) {
        // 取离吸顶 filterBar 顶部最近的分组
        intersecting.sort((a, b) => {
          return (
            Math.abs(a.boundingClientRect.top - filterBarHeight) -
            Math.abs(b.boundingClientRect.top - filterBarHeight)
          );
        });
        const activeEntry = intersecting[0];
        if (activeEntry) {
          const activeGroup = activeEntry.target as HTMLElement;
          const year = activeGroup.getAttribute('data-year');
          if (year) {
            setActiveYear(year);
          }
        }
      }
    },
    {
      rootMargin: `-${filterBarHeight}px 0px -50% 0px`,
      threshold: [0, 0.1, 0.5],
    }
  );

  groupsToObserve.forEach((g) => yearObserver?.observe(g));
}

function ensureYearNavClick(nav: HTMLElement): void {
  if (yearNavClickBound) return;
  yearNavClickBound = true;

  nav.addEventListener('click', (ev: MouseEvent) => {
    const target = ev.target as Node | null;
    const element = target instanceof Element ? target : target?.parentElement;
    const actionEl = element?.closest('[data-action]');
    if (!actionEl || !nav.contains(actionEl)) return;

    const action = actionEl.getAttribute('data-action');
    const id = actionEl.getAttribute('data-id') ?? undefined;

    if (action === 'jump-year' && id) {
      if ((ev as unknown as { __htl_yearnav_handled?: boolean }).__htl_yearnav_handled) return;
      (ev as unknown as { __htl_yearnav_handled: boolean }).__htl_yearnav_handled = true;
      scrollToYear(id);
    } else if (action === 'scroll-top') {
      if ((ev as unknown as { __htl_yearnav_handled?: boolean }).__htl_yearnav_handled) return;
      (ev as unknown as { __htl_yearnav_handled: boolean }).__htl_yearnav_handled = true;
      scrollToTop();
    }
  });
}

export function renderYearNav(state: AppState, groups: YearGroup[]): void {
  const nav = document.getElementById('year-nav');
  if (!nav) {
    return;
  }

  // 7. 筛选结果为空时隐藏年份导航
  const allCards = groups.flatMap((g) => g.cards);
  const years = allYears(allCards);

  if (groups.length === 0 || years.length === 0) {
    nav.classList.add('is-hidden');
    nav.style.display = 'none';
    nav.replaceChildren();
    if (yearObserver) {
      yearObserver.disconnect();
      yearObserver = null;
    }
    currentActiveYear = null;
    return;
  }

  nav.classList.remove('is-hidden');
  nav.style.display = '';

  if (!nav.classList.contains('htl-year-nav')) {
    nav.classList.add('htl-year-nav');
  }
  nav.setAttribute('aria-label', '年份导航');

  ensureYearNavClick(nav);
  ensureScrollListener();

  // 若当前高亮年份不在新结果中，重置为第一个年份
  if (!currentActiveYear || !years.includes(currentActiveYear)) {
    const firstYear = years[0];
    currentActiveYear = firstYear !== undefined ? firstYear : null;
  }

  const chips: HTMLElement[] = years.map((year) => {
    const isActive = currentActiveYear === year;
    const chipClass = isActive ? 'htl-chip is-active' : 'htl-chip';

    return el(
      'button',
      {
        type: 'button',
        class: chipClass,
        'data-action': 'jump-year',
        'data-id': year,
        'data-year': year,
        'data-focus-key': `year.${year}`,
        'aria-label': `${year} 年`,
        ...(isActive ? { 'aria-current': 'true' } : {}),
      },
      [year]
    );
  });

  // 6. 回到顶部按钮：window.scrollY > 一屏 时显示
  const isOverOneScreen = typeof window !== 'undefined' && window.scrollY > window.innerHeight;
  const scrollTopBtn = el(
    'button',
    {
      type: 'button',
      class: isOverOneScreen ? 'htl-chip' : 'htl-chip is-hidden',
      'data-action': 'scroll-top',
      'aria-label': '回到顶部',
      title: '回到顶部',
      style: isOverOneScreen
        ? 'margin-top: var(--htl-space-2, 8px);'
        : 'margin-top: var(--htl-space-2, 8px); display: none;',
    },
    ['↑ 顶部']
  );

  nav.replaceChildren(...chips, scrollTopBtn);

  // 5. 滚动高亮：IntersectionObserver
  setupIntersectionObserver(years);
}

// 自动向 UI 渲染主流程注册
registerYearNavRenderer(renderYearNav);
if (typeof window !== 'undefined') {
  (window as unknown as { __htl_renderYearNav?: typeof renderYearNav }).__htl_renderYearNav = renderYearNav;
}
