import './style.css';
import { renderResume } from './renderer.js';
import { initResumeEditor } from './resume-editor.js';
import { createResumeStore } from './version-store.js';
import { getInitialAppLocale, getSupportedAppLocales, i18nReady, setAppLocale } from './app-i18n.js';
import { getStoredPageSeparators, setPageSeparators, initPageSeparatorResizeListener, getStoredCompactMode, applyCompactModeClass, getStoredShowPhoto, applyShowPhotoClass, COMPACT_PAGE_MARGIN_MM } from './page-separator-mode.js';
import { initPreviewEdit, focusPreviewPath } from './preview-edit.js';
import { inject } from '@vercel/analytics';

const STORAGE_KEY = 'myresume2-theme';

await i18nReady;
const resumeStore = await createResumeStore().init();
const initialVersion = await resumeStore.getActive();
const DEFAULT_THEME = initialVersion.data.theme || 'minimal';

function getExampleData(versionId, fallbackData) {
  try {
    return resumeStore.getBundledVersion(versionId);
  } catch {
    // User-created versions have no bundled source. Keep their creation data as
    // the only available reset target instead of silently replacing it with a
    // different version's example.
    return fallbackData;
  }
}

function getInitialTheme() {
  try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME; } catch { return DEFAULT_THEME; }
}

export function setTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  try { localStorage.setItem(STORAGE_KEY, themeName); } catch { /* ignore */ }
}

export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
}

setTheme(getInitialTheme());

function applySpacing(spacing) {
  Object.entries(spacing || {}).forEach(([key, value]) => {
    let cssValue;
    if (typeof value === 'string') cssValue = value;
    else if (key === 'resume-line-height') cssValue = String(value);
    else if (key === 'resume-page-margin' || key === 'resume-canvas-padding-x') cssValue = `${value}mm`;
    else cssValue = `${value}px`;
    document.documentElement.style.setProperty(`--${key}`, cssValue);
  });
}

if (getStoredCompactMode()) {
  applyCompactModeClass(true);
  document.documentElement.style.setProperty('--resume-page-margin', `${COMPACT_PAGE_MARGIN_MM}mm`);
}
if (getStoredShowPhoto()) applyShowPhotoClass(true);

let activeVersion = { versionId: initialVersion.versionId };
let activeResumeData = initialVersion.data;
let lastPersistedData = JSON.stringify(activeResumeData);
let activeExampleData = getExampleData(activeVersion.versionId, activeResumeData);
let activeLocale = getInitialAppLocale();
applySpacing(activeResumeData?.style?.spacing);

function isPreviewEditMode() {
  return document.documentElement.classList.contains('resume-preview-edit-mode');
}

function renderApp(data, { forceRecapture = false, renderResumeFn = renderResume } = {}) {
  applySpacing(data?.style?.spacing);
  document.documentElement.lang = activeLocale;
  document.title = `${data.name} - ${data.title}`;
  document.getElementById('app').innerHTML = renderResumeFn(data, {
    locale: activeLocale,
    editMode: isPreviewEditMode(),
  });
  setPageSeparators(getStoredPageSeparators(), forceRecapture);
}

function setPreviewEditMode(enabled) {
  document.documentElement.classList.toggle('resume-preview-edit-mode', !!enabled);
  renderApp(activeResumeData, { forceRecapture: true });
}

renderApp(activeResumeData, { forceRecapture: true });

let editorController;
let panelController;
let initDevPanel;

function createEditor(wasOpen = false) {
  editorController = initResumeEditor({
    initialData: activeResumeData,
    defaultData: activeExampleData,
    locale: activeLocale,
    onChange: data => {
      activeResumeData = data;
      renderApp(data, { forceRecapture: true });
    },
    onSave: async data => {
      await resumeStore.saveVersion(activeVersion.versionId, data);
      lastPersistedData = JSON.stringify(data);
    },
  });
  if (wasOpen) editorController.setOpen(true);
}

function createPanel() {
  panelController = initDevPanel({
    currentTheme: getCurrentTheme(),
    defaultTheme: DEFAULT_THEME,
    defaultSpacing: activeResumeData?.style?.spacing || {},
    onThemeChange: setTheme,
    onEditorToggle: () => editorController.toggle(),
    onEditModeChange: setPreviewEditMode,
    locale: activeLocale,
    locales: getSupportedAppLocales(),
    onLocaleChange: changeLocale,
    catalog: resumeStore.getCatalog(),
    activeVersion,
    onVersionChange: changeVersion,
    onVersionCreate: createVersion,
    onVersionCopy: copyVersion,
    onVersionRename: renameVersion,
    onVersionDelete: deleteVersion,
    onVersionMove: moveVersion,
  });
  if (editorController?.isOpen()) window.dispatchEvent(new CustomEvent('resume-editor-toggle', { detail: { open: true } }));
}

async function changeVersion(nextActive) {
  if (nextActive.versionId === activeVersion.versionId) return;
  const wasOpen = editorController?.isOpen();
  const result = await resumeStore.setActive(nextActive.versionId);
  activeVersion = { versionId: result.versionId };
  activeResumeData = result.data;
  lastPersistedData = JSON.stringify(activeResumeData);
  activeExampleData = getExampleData(activeVersion.versionId, activeResumeData);
  editorController?.destroy();
  panelController?.destroy();
  setTheme(activeResumeData.theme || DEFAULT_THEME);
  renderApp(activeResumeData, { forceRecapture: true });
  createEditor(wasOpen);
  createPanel();
}

async function reloadAfterVersionMutation(versionId, wasOpen) {
  const result = await resumeStore.setActive(versionId);
  activeVersion = { versionId: result.versionId };
  activeResumeData = result.data;
  lastPersistedData = JSON.stringify(activeResumeData);
  activeExampleData = getExampleData(activeVersion.versionId, activeResumeData);
  editorController?.destroy();
  panelController?.destroy();
  setTheme(activeResumeData.theme || DEFAULT_THEME);
  renderApp(activeResumeData, { forceRecapture: true });
  createEditor(wasOpen);
  createPanel();
}

async function createVersion({ name, parentId = null }) {
  const wasOpen = editorController?.isOpen();
  const result = await resumeStore.createVersion({ name, parentId });
  await reloadAfterVersionMutation(result.versionId, wasOpen);
}

async function copyVersion({ name, sourceVersionId, parentId = null }) {
  const wasOpen = editorController?.isOpen();
  const result = await resumeStore.createVersion({ name, parentId, copyFromVersionId: sourceVersionId });
  await reloadAfterVersionMutation(result.versionId, wasOpen);
}

async function renameVersion({ versionId, name }) {
  await resumeStore.renameVersion(versionId, name);
  panelController?.destroy();
  createPanel();
}

async function deleteVersion(versionId) {
  const wasOpen = editorController?.isOpen();
  const result = await resumeStore.deleteVersion(versionId);
  await reloadAfterVersionMutation(result.versionId, wasOpen);
}

async function moveVersion(versionId, targetId, placement) {
  await resumeStore.moveVersion(versionId, targetId, placement);
  panelController?.destroy();
  createPanel();
}

async function changeLocale(locale) {
  if (locale === activeLocale) return;
  const wasOpen = editorController?.isOpen();
  editorController?.destroy();
  panelController?.destroy();
  await setAppLocale(locale);
  activeLocale = getInitialAppLocale();
  renderApp(activeResumeData, { forceRecapture: true });
  createEditor(wasOpen);
  createPanel();
}

createEditor();
initPreviewEdit({
  getData: () => activeResumeData,
  applyData: (data, { rerender = false, focusPath = null } = {}) => {
    activeResumeData = data;
    editorController?.setData(data);
    if (rerender) {
      renderApp(data, { forceRecapture: true });
      if (focusPath) requestAnimationFrame(() => focusPreviewPath(focusPath));
    }
  },
  onSave: async data => {
    await resumeStore.saveVersion(activeVersion.versionId, data);
    lastPersistedData = JSON.stringify(data);
  },
  getLocale: () => activeLocale,
});
initPageSeparatorResizeListener();
import('./dev-panel.js').then(module => {
  initDevPanel = module.initDevPanel;
  createPanel();
});

const runningInTauri = Boolean(globalThis.__TAURI_INTERNALS__ || globalThis.__TAURI__);
if (!runningInTauri) inject();

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.accept('./renderer.js', newModule => {
    if (!newModule) return;
    renderApp(activeResumeData, { forceRecapture: true, renderResumeFn: newModule.renderResume });
  });
}

if (import.meta.env.DEV) {
  window.setInterval(async () => {
    try {
      const externalData = await resumeStore.getVersion(activeVersion.versionId);
      const serialized = JSON.stringify(externalData);
      if (serialized === lastPersistedData) return;
      // 编辑器刚写回的内容会被下一次轮询读到；这时只同步快照，不要 setData 整份替换，否则光标会跳到第一行。
      if (serialized === JSON.stringify(activeResumeData)) {
        lastPersistedData = serialized;
        return;
      }
      lastPersistedData = serialized;
      activeResumeData = externalData;
      editorController?.setData(externalData);
      renderApp(externalData, { forceRecapture: true });
    } catch { /* 外部文件暂时不可读时保留当前预览 */ }
  }, 1500);
}
