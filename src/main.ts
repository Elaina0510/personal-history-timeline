import './ui/styles/theme.css'; import './ui/styles/components.css';
import { createClock, createStorage, loadSeedRaw } from './ui/platform';
import { Store } from './core/store';
import { render } from './ui/render';
import { bindActions } from './ui/bind';
import { el } from './ui/dom';
import { buildRelationIndex } from './core/select';
import { toast } from './ui/parts/toast'; import { confirmDialog } from './ui/parts/confirm';
import { openLightbox, closeLightbox } from './ui/parts/lightbox';
import { openDetail, closeDetail, refreshDetail } from './ui/parts/detailModal';
import { scrollToYear, scrollToTop } from './ui/parts/yearNav';
import { openEventForm, openRecordForm, closeFormModal, setStore as setFormStore } from './ui/parts/formModal';
import { handleFilterAction, setStore as setFilterStore } from './ui/parts/filterBar';
import { openImportModal, openExportModal, openRestoreBackupConfirm, setStore as setImportStore } from './ui/parts/importExport';
import { renderToolbar } from './ui/parts/toolbar';
import { mountCapacityBar } from './ui/parts/capacityBar';
import type { AppState } from './core/types';

/** 首屏报头统计：只做纯展示聚合，不参与业务判定 */
function updateHeroStats(s: AppState): void {
  const events = s.data.events;
  const eventsEl = document.getElementById('hs-events');
  const spanEl = document.getElementById('hs-span');
  const recordsEl = document.getElementById('hs-records');
  if (!eventsEl || !spanEl || !recordsEl) return;
  eventsEl.textContent = String(events.length).padStart(2, '0');
  const years = events
    .map((e) => e.date.slice(0, 4))
    .filter((y) => /^\d{4}$/.test(y))
    .sort();
  const first = years[0];
  const last = years[years.length - 1];
  spanEl.textContent = first === undefined || last === undefined
    ? '—'
    : first === last
      ? first
      : `${first}—${last}`;
  const records = events.reduce(
    (sum, e) => sum + (Array.isArray(e.records) ? e.records.length : 0),
    0
  );
  recordsEl.textContent = String(records).padStart(2, '0');
}
let store: Store;
/** 首屏拿到的种子原文，重置按钮复用（不重新联网取，离线也能重置） */
let seedSnapshot: string | null = null;
async function handler(action: string, id: string | undefined, ev: Event): Promise<void> {
  const events = store.getState().data.events;
  switch (action) {
    case 'new-event': openEventForm({ mode: 'create', store }); break;
    case 'edit-event': if (id) openEventForm({ mode: 'edit', eventId: id, store }); break;
    case 'delete-event': {
      const e = events.find((item) => item.id === id);
      if (id && e && await confirmDialog({ title: '删除事件', message: `确定删除「${e.title}」？将同时解除 ${buildRelationIndex(events).get(id)?.length ?? 0} 处关联`, danger: true })) {
        if (store.deleteEvent(id).ok) { closeDetail(); toast('已删除'); }
      }
      break;
    }
    case 'add-record': if (id) openRecordForm({ eventId: id, store }); break;
    case 'edit-record': {
      const e = events.find((item) => item.records.some((r) => r.id === id));
      if (id && e) openRecordForm({ eventId: e.id, recordId: id, store });
      break;
    }
    case 'delete-record': {
      const e = events.find((item) => item.records.some((r) => r.id === id));
      if (id && e && await confirmDialog({ title: '删除记录', message: '确定删除这条记录？', danger: true })) {
        if (store.deleteRecord({ eventId: e.id, recordId: id }).ok) { toast('已删除'); store.flash(e.id); }
      }
      break;
    }
    case 'open-detail': if (id) openDetail(id, store); break;
    case 'close-detail': closeDetail(); break;
    case 'open-lightbox': if (id) openLightbox(id); break;
    case 'jump-relation': {
      closeDetail();
      let t = id ? document.querySelector<HTMLElement>(`#timeline-root [data-id="${id}"]`) : null;
      if (!t && id) { store.clearFilters(); t = document.querySelector<HTMLElement>(`#timeline-root [data-id="${id}"]`); toast('已清除筛选以显示目标事件'); }
      if (t && id) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); store.flash(id); }
      break;
    }
    case 'jump-year': if (id) scrollToYear(id); break;
    case 'scroll-top': scrollToTop(); break;
    case 'open-import': openImportModal(); break;
    case 'open-export': openExportModal(); break;
    case 'restore-backup': openRestoreBackupConfirm(); break;
    case 'reset-seed': {
      if (await confirmDialog({
        title: '重置为示例数据',
        message: '将清空当前全部事件与记录，并重新载入随应用发布的示例事件。此操作不可撤销，建议先导出备份。',
        confirmText: '确认重置',
        danger: true,
      })) {
        const r = store.reloadFromSeed(seedSnapshot);
        if (!r.ok) {
          toast('重置失败：示例数据无效', 'error');
        } else if (!r.value.seeded) {
          toast('示例数据不可用，未做改动', 'warn');
        } else {
          closeDetail();
          toast('已重置为示例数据', 'success');
        }
      }
      break;
    }
    default: handleFilterAction(action, id, ev); break;
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeLightbox(); closeFormModal(); closeDetail(); }
  else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault();
    document.querySelector<HTMLElement>('[data-focus-key="filter.keyword"]')?.focus();
  }
});
async function init(): Promise<void> {
  const storage = createStorage(), clock = createClock();
  store = new Store({ storage, clock, appVersion: '0.0.3' });
  setFormStore(store); setFilterStore(store); setImportStore(store);
  (window as unknown as { __htl_store?: Store }).__htl_store = store;
  const seedRaw = await loadSeedRaw();
  seedSnapshot = seedRaw;
  const res = store.init(seedRaw);
  store.subscribe((s) => {
    render(s);
    refreshDetail(s);
    updateHeroStats(s);
  });
  render(store.getState());
  updateHeroStats(store.getState());
  renderToolbar();
  mountCapacityBar(store);
  bindActions(handler);

  // 首屏红色区内隐藏右侧年份索引，滚过首屏后淡入（纯视觉，不涉及状态）
  const heroEl = document.querySelector<HTMLElement>('.htl-hero');
  const syncHeroState = (): void => {
    const bottom = heroEl ? heroEl.getBoundingClientRect().bottom : 0;
    document.body.classList.toggle('is-past-hero', bottom < 120);
  };
  window.addEventListener('scroll', syncHeroState, { passive: true });
  syncHeroState();
  for (const issue of res.issues) {
    if (issue.code === 'STORAGE_UNAVAILABLE') {
      document.body.prepend(el('div', { class: 'htl-toast--warning', style: 'background:#fef3c7;color:#92400e;padding:8px;text-align:center;' }, [issue.message]));
    } else if (issue.severity === 'error') toast(issue.message, 'error');
  }
}
void init();
