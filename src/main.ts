import './ui/styles/theme.css'; import './ui/styles/components.css';
import { createClock, createStorage, loadSeedRaw } from './ui/platform';
import { Store } from './core/store';
import { render } from './ui/render';
import { bindActions } from './ui/bind';
import { el } from './ui/dom';
import { buildRelationIndex } from './core/select';
import { toast } from './ui/parts/toast'; import { confirmDialog } from './ui/parts/confirm';
import { openLightbox, closeLightbox } from './ui/parts/lightbox';
import { scrollToYear, scrollToTop } from './ui/parts/yearNav';
import { openEventForm, openRecordForm, closeFormModal, setStore as setFormStore } from './ui/parts/formModal';
import { handleFilterAction, setStore as setFilterStore } from './ui/parts/filterBar';
import { openImportModal, openExportModal, openRestoreBackupConfirm, setStore as setImportStore } from './ui/parts/importExport';
import { renderToolbar } from './ui/parts/toolbar';
let store: Store;
async function handler(action: string, id: string | undefined, ev: Event): Promise<void> {
  const events = store.getState().data.events;
  switch (action) {
    case 'new-event': openEventForm({ mode: 'create', store }); break;
    case 'edit-event': if (id) openEventForm({ mode: 'edit', eventId: id, store }); break;
    case 'delete-event': {
      const e = events.find((item) => item.id === id);
      if (id && e && await confirmDialog({ title: '删除事件', message: `确定删除「${e.title}」？将同时解除 ${buildRelationIndex(events).get(id)?.length ?? 0} 处关联`, danger: true })) {
        if (store.deleteEvent(id).ok) toast('已删除');
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
    case 'toggle-card': if (id) store.toggleExpanded(id); break;
    case 'open-lightbox': if (id) openLightbox(id); break;
    case 'jump-relation': {
      let t = id ? document.querySelector<HTMLElement>(`#timeline-root [data-id="${id}"]`) : null;
      if (!t && id) { store.clearFilters(); t = document.querySelector<HTMLElement>(`#timeline-root [data-id="${id}"]`); toast('已清除筛选以显示目标事件'); }
      if (t && id) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); store.flash(id); }
      break;
    }
    case 'jump-year': if (id) scrollToYear(id); break;
    case 'scroll-top': scrollToTop(); break;
    case 'open-import': openImportModal(); break;
    case 'open-export': openExportModal(); break;
    case 'restore-backup': openRestoreBackupConfirm(); break;
    default: handleFilterAction(action, id, ev); break;
  }
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeLightbox(); closeFormModal(); }
  else if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault();
    document.querySelector<HTMLElement>('[data-focus-key="filter.keyword"]')?.focus();
  }
});
async function init(): Promise<void> {
  const storage = createStorage(), clock = createClock();
  store = new Store({ storage, clock, appVersion: '0.0.1' });
  setFormStore(store); setFilterStore(store); setImportStore(store);
  (window as unknown as { __htl_store?: Store }).__htl_store = store;
  const seedRaw = await loadSeedRaw();
  const res = store.init(seedRaw);
  store.subscribe((s) => render(s));
  render(store.getState());
  renderToolbar();
  bindActions(handler);
  for (const issue of res.issues) {
    if (issue.code === 'STORAGE_UNAVAILABLE') {
      document.body.prepend(el('div', { class: 'htl-toast--warning', style: 'background:#fef3c7;color:#92400e;padding:8px;text-align:center;' }, [issue.message]));
    } else if (issue.severity === 'error') toast(issue.message, 'error');
  }
}
void init();
