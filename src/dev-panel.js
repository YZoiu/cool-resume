import './dev-panel.css';
import { t } from './app-i18n.js';
import { getStoredPageSeparators, setPageSeparators, refreshPageSeparators, schedulePageSeparatorRefresh, getStoredCompactMode, setStoredCompactMode, applyCompactModeClass, getStoredSmartLayout, setStoredSmartLayout, applySmartLayoutClass, getStoredShowPhoto, setStoredShowPhoto, applyShowPhotoClass, withForcedPageSeparators, COMPACT_PAGE_MARGIN_MM, DEFAULT_PAGE_MARGIN_MM } from './page-separator-mode.js';
import { childrenOf as catalogChildren, isAncestorOfActive, isDescendant } from './version-catalog.js';
import { exportResumeImage } from './image-export.js';
import { exportResumePdf } from './pdf-export.js';
import { isTauriShell, SaveCancelledError } from './file-save.js';
import { createIcons } from 'lucide';
import { APP_ICONS } from './icon-set.js';
import Sortable from 'sortablejs';

const THEME_GROUPS = [
  {
    id: 'minimal',
    labelKey: 'app.themeGroupMinimal',
    themes: [
      { id: 'minimal', label: '极简蓝', en: 'Blue' },
      { id: 'minimal-slate', label: '极简灰', en: 'Slate' },
      { id: 'minimal-forest', label: '极简绿', en: 'Forest' },
      { id: 'minimal-ink', label: '极简黑', en: 'Ink' },
      { id: 'ats', label: 'ATS 黑白', en: 'ATS' },
      { id: 'graphite', label: '极简橙', en: 'Graphite' },
      { id: 'editorial', label: '极简酒红', en: 'Editorial' },
    ],
  },
  {
    id: 'bar',
    labelKey: 'app.themeGroupBar',
    themes: [
      { id: 'navy', label: '深蓝标题栏', en: 'Navy' },
      { id: 'teal', label: '松石标题栏', en: 'Teal' },
      { id: 'navy-forest', label: '墨绿标题栏', en: 'Pine' },
      { id: 'navy-burgundy', label: '酒红标题栏', en: 'Burgundy' },
      { id: 'navy-charcoal', label: '炭灰标题栏', en: 'Charcoal' },
    ],
  },
];
const TITLE_STYLE_OPTIONS = [
  { id: 'theme', key: 'app.titleStyleTheme' },
  { id: 'minimal', key: 'app.titleStyleMinimal' },
  { id: 'bar', key: 'app.titleStyleBar' },
];
const SPACING_GROUPS = [
  { id: 'paper', key: 'spacing.paper' },
  { id: 'header', key: 'spacing.header' },
  { id: 'title', key: 'spacing.title' },
  { id: 'section', key: 'spacing.section' },
  { id: 'entry', key: 'spacing.entry' },
  { id: 'list', key: 'spacing.list' },
];
const SPACING_CONTROLS = [
  { key: 'resume-page-margin', group: 'paper', label: '页边距', en: 'Page margin', min: 4, max: 16, step: 1, unit: 'mm', fallback: DEFAULT_PAGE_MARGIN_MM },
  { key: 'resume-body-padding-y', group: 'paper', label: '顶部边距', en: 'Top padding', min: 0, max: 40, step: 1, unit: 'px' },
  { key: 'resume-line-height', group: 'paper', label: '行高', en: 'Line height', min: 1.05, max: 1.8, step: 0.05, unit: '' },
  { key: 'resume-text-font-size', group: 'paper', label: '正文字号', en: 'Body size', min: 11, max: 16, step: 0.5, unit: 'px', fallback: 13, alias: '--text-font-size' },
  { key: 'resume-header-gap', group: 'header', label: '姓名区块', en: 'Name block', min: 0, max: 28, step: 1, unit: 'px' },
  { key: 'resume-header-bottom-gap', group: 'header', label: '页眉底部', en: 'Header bottom', min: 0, max: 18, step: 1, unit: 'px' },
  { key: 'resume-name-size', group: 'header', label: '姓名字号', en: 'Name size', min: 16, max: 32, step: 1, unit: 'px', fallback: 22 },
  { key: 'resume-basic-info-gap', group: 'header', label: '信息行距', en: 'Info gap', min: 0, max: 14, step: 1, unit: 'px' },
  { key: 'resume-profile-column-gap', group: 'header', label: '信息列距', en: 'Info columns', min: 8, max: 36, step: 1, unit: 'px', fallback: 16 },
  { key: 'resume-education-gap', group: 'header', label: '教育条目', en: 'Education gap', min: 0, max: 16, step: 1, unit: 'px', fallback: 6 },
  { key: 'resume-section-title-size', group: 'title', label: '标题字号', en: 'Title size', min: 12, max: 20, step: 0.5, unit: 'px', fallback: 14 },
  { key: 'resume-section-title-pad-y', group: 'title', label: '标题上下边距', en: 'Title pad Y', min: 0, max: 12, step: 1, unit: 'px', optional: true, fallback: 3 },
  { key: 'resume-section-title-pad-x', group: 'title', label: '标题左右边距', en: 'Title pad X', min: 0, max: 16, step: 1, unit: 'px', optional: true, fallback: 8 },
  { key: 'resume-section-title-radius', group: 'title', label: '标题圆角', en: 'Title radius', min: 0, max: 10, step: 1, unit: 'px', optional: true, fallback: 3 },
  { key: 'resume-section-title-rule', group: 'title', label: '下划线粗细', en: 'Underline', min: 0, max: 4, step: 1, unit: 'px', optional: true, fallback: 1 },
  { key: 'resume-section-title-tracking', group: 'title', label: '标题字距', en: 'Tracking', min: 0, max: 2, step: 0.1, unit: 'px', optional: true, fallback: 1 },
  { key: 'resume-section-title-gap', group: 'title', label: '标题与内容', en: 'Title gap', min: 0, max: 16, step: 1, unit: 'px' },
  { key: 'resume-section-gap', group: 'section', label: '章节间距', en: 'Section gap', min: 0, max: 30, step: 1, unit: 'px' },
  { key: 'resume-section-rule-gap', group: 'section', label: '章节分割线', en: 'Section rule', min: 0, max: 24, step: 1, unit: 'px' },
  { key: 'resume-entry-gap', group: 'entry', label: '条目间距', en: 'Entry gap', min: 0, max: 24, step: 1, unit: 'px' },
  { key: 'resume-entry-header-gap', group: 'entry', label: '条目标题', en: 'Entry header', min: 0, max: 12, step: 1, unit: 'px' },
  { key: 'resume-entry-title-size', group: 'entry', label: '条目标题字号', en: 'Entry size', min: 12, max: 20, step: 0.5, unit: 'px', fallback: 15.5 },
  { key: 'resume-project-separator', group: 'entry', label: '项目分割线', en: 'Project rule', min: 0, max: 28, step: 1, unit: 'px' },
  { key: 'resume-project-inner-divider', group: 'entry', label: '项目内分割线', en: 'Inner rule', min: 0, max: 24, step: 1, unit: 'px' },
  { key: 'resume-skill-gap', group: 'list', label: '技能行距', en: 'Skill gap', min: 0, max: 16, step: 1, unit: 'px' },
  { key: 'resume-list-gap', group: 'list', label: '列表间距', en: 'List gap', min: 0, max: 8, step: 1, unit: 'px' },
  { key: 'resume-list-top-gap', group: 'list', label: '列表上间距', en: 'List top', min: 0, max: 12, step: 1, unit: 'px' },
  { key: 'resume-keyword-gap', group: 'list', label: '关键字间距', en: 'Keyword gap', min: 0, max: 14, step: 1, unit: 'px' },
];
const STORAGE_KEY_THEME = 'myresume2-theme';
const STORAGE_KEY_SPACING = 'myresume2-spacing';
const STORAGE_KEY_TOOLBAR = 'myresume2-editor-toolbar-visible';
const STORAGE_KEY_TITLE_STYLE = 'myresume2-title-style';
let SPACING_DEFAULTS = {};

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function childrenOf(catalog, parentId) {
  return catalogChildren(catalog, parentId);
}

function formatVersionDate(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'en-US' ? 'en-US' : 'zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function exportFileName(catalog, activeVersion) {
  const version = (catalog?.versions || []).find(item => item.id === activeVersion?.versionId);
  const stamp = new Date();
  const pad = value => String(value).padStart(2, '0');
  const timestamp = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`;
  const safe = value => String(value || 'resume').trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'resume';
  return `resume-${safe(version?.name)}-${safe(version?.id)}-${timestamp}`;
}

function getStoredTitleStyle() {
  try {
    const value = localStorage.getItem(STORAGE_KEY_TITLE_STYLE);
    return TITLE_STYLE_OPTIONS.some(item => item.id === value) ? value : 'theme';
  } catch { return 'theme'; }
}
function setStoredTitleStyle(value) {
  try { localStorage.setItem(STORAGE_KEY_TITLE_STYLE, value); } catch { /* ignore */ }
}
function applyTitleStyle(value) {
  const root = document.documentElement;
  root.classList.toggle('resume-title-style-minimal', value === 'minimal');
  root.classList.toggle('resume-title-style-bar', value === 'bar');
}

function renderThemeOptions(currentTheme, locale) {
  return THEME_GROUPS.map(group => `<optgroup label="${t(locale, group.labelKey)}">${group.themes.map(theme => `<option value="${theme.id}" ${theme.id === currentTheme ? 'selected' : ''}>${locale === 'en-US' ? theme.en : theme.label}</option>`).join('')}</optgroup>`).join('');
}

function renderSpacingControls(locale) {
  return SPACING_GROUPS.map(group => {
    const controls = SPACING_CONTROLS.filter(item => item.group === group.id);
    if (!controls.length) return '';
    return `<section class="resume-editor-spacing-group"><h3>${t(locale, group.key)}</h3><div class="resume-editor-spacing-grid">${controls.map(control => `<label class="resume-editor-spacing-item"><span>${locale === 'en-US' ? control.en : control.label}</span><output data-key="${control.key}"></output><input type="range" data-key="${control.key}" min="${control.min}" max="${control.max}" step="${control.step}" value="${SPACING_DEFAULTS[control.key]}" /></label>`).join('')}</div></section>`;
  }).join('');
}

function spacingCssValue(control, value) {
  if (control.key === 'resume-line-height') return String(value);
  return `${value}${control.unit || ''}`;
}

function renderVersionNode(catalog, version, activeVersionId, depth, locale, expansion) {
  const children = childrenOf(catalog, version.id);
  const hasChildren = children.length > 0;
  const defaultExpanded = version.id === activeVersionId || isAncestorOfActive(catalog, version.id, activeVersionId);
  const expanded = expansion?.collapsed?.has(version.id) ? false : expansion?.expanded?.has(version.id) || defaultExpanded;
  const active = version.id === activeVersionId;
  const deleteDisabled = hasChildren || (catalog?.versions || []).length === 1;
  const createdDate = formatVersionDate(version.createdAt, locale) || t(locale, 'version.noDate');
  const updatedDate = formatVersionDate(version.updatedAt, locale) || t(locale, 'version.noDate');
  return `<div class="resume-version-tree-node" role="treeitem" aria-level="${depth + 1}" aria-expanded="${hasChildren ? expanded : ''}" data-version-node="${escapeText(version.id)}">
    <div class="resume-version-tree-row" style="--tree-depth:${depth}">
      ${hasChildren ? `<button type="button" class="resume-version-tree-toggle" data-version-toggle aria-expanded="${expanded}" aria-label="${t(locale, expanded ? 'version.collapse' : 'version.expand')} ${escapeText(version.name)}"><span aria-hidden="true">${expanded ? '▾' : '▸'}</span></button>` : '<span class="resume-version-tree-toggle-spacer" aria-hidden="true"></span>'}
      <button type="button" class="resume-version-tree-item ${active ? 'is-active' : ''}" data-version-id="${escapeText(version.id)}" aria-label="${escapeText(version.name)}" ${active ? 'aria-current="true"' : ''}><span class="resume-version-tree-label"><span class="resume-version-tree-name">${escapeText(version.name)}</span><small class="resume-version-tree-meta" aria-label="${t(locale, 'version.createdAt')} ${createdDate}，${t(locale, 'version.updatedAt')} ${updatedDate}"><span>${t(locale, 'version.createdAt')} ${createdDate}</span><span aria-hidden="true">·</span><span>${t(locale, 'version.updatedAt')} ${updatedDate}</span></small></span></button>
      <span class="resume-version-tree-actions">
        <button type="button" class="resume-version-tree-action" data-version-action="new" data-version-id="${escapeText(version.id)}" title="${t(locale, 'version.newChild')}" aria-label="${t(locale, 'version.newChild')}：${escapeText(version.name)}"><i data-lucide="plus"></i></button>
        <button type="button" class="resume-version-tree-action" data-version-action="copy" data-version-id="${escapeText(version.id)}" title="${t(locale, 'version.copy')}" aria-label="${t(locale, 'version.copy')}：${escapeText(version.name)}"><i data-lucide="copy"></i></button>
        <button type="button" class="resume-version-tree-action" data-version-action="rename" data-version-id="${escapeText(version.id)}" title="${t(locale, 'version.rename')}" aria-label="${t(locale, 'version.rename')}：${escapeText(version.name)}"><i data-lucide="pencil"></i></button>
        <button type="button" class="resume-version-tree-action danger" data-version-action="delete" data-version-id="${escapeText(version.id)}" title="${deleteDisabled ? t(locale, 'version.deleteDisabled') : t(locale, 'version.delete')}" aria-label="${t(locale, 'version.delete')}：${escapeText(version.name)}" ${deleteDisabled ? 'disabled' : ''}><i data-lucide="trash-2"></i></button>
      </span>
    </div>
    <div class="resume-version-tree-children" role="group" data-version-children ${hasChildren && !expanded ? 'hidden' : ''}>${children.map(child => renderVersionNode(catalog, child, activeVersionId, depth + 1, locale, expansion)).join('')}</div>
  </div>`;
}

function renderVersionTree(catalog, activeVersion, locale, expansion) {
  const roots = childrenOf(catalog, null);
  return roots.length ? roots.map(version => renderVersionNode(catalog, version, activeVersion?.versionId, 0, locale, expansion)).join('') : `<div class="resume-version-tree-empty">${t(locale, 'version.noChildren')}</div>`;
}

function renderParentOptions(catalog, selectedId, locale) {
  const options = [`<option value="">${t(locale, 'version.parentRoot')}</option>`];
  function append(parentId, depth) {
    childrenOf(catalog, parentId).forEach(version => {
      options.push(`<option value="${escapeText(version.id)}" ${version.id === selectedId ? 'selected' : ''}>${'　'.repeat(depth)}${escapeText(version.name)}</option>`);
      append(version.id, depth + 1);
    });
  }
  append(null, 0);
  return options.join('');
}

function getStoredSpacing() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SPACING) || '{}'); } catch { return {}; }
}
function setStoredSpacing(values) {
  try { localStorage.setItem(STORAGE_KEY_SPACING, JSON.stringify(values)); } catch { /* ignore */ }
}
function applySpacing(values) {
  const root = document.documentElement;
  SPACING_CONTROLS.forEach(control => {
    const stored = values[control.key];
    if (stored === undefined && control.optional) {
      root.style.removeProperty(`--${control.key}`);
      if (control.alias) root.style.removeProperty(control.alias);
      return;
    }
    const value = stored ?? SPACING_DEFAULTS[control.key];
    const cssValue = spacingCssValue(control, value);
    root.style.setProperty(`--${control.key}`, cssValue);
    if (control.alias) root.style.setProperty(control.alias, cssValue);
  });
  const padY = values['resume-section-title-pad-y'];
  const padX = values['resume-section-title-pad-x'];
  if (padY !== undefined || padX !== undefined) {
    root.style.setProperty('--resume-section-title-padding', `${padY ?? SPACING_DEFAULTS['resume-section-title-pad-y']}px ${padX ?? SPACING_DEFAULTS['resume-section-title-pad-x']}px`);
  } else {
    root.style.removeProperty('--resume-section-title-padding');
  }
}
function getToolbarVisibility() {
  try { return localStorage.getItem(STORAGE_KEY_TOOLBAR) !== 'false'; } catch { return true; }
}
function setToolbarVisibility(visible) {
  try { localStorage.setItem(STORAGE_KEY_TOOLBAR, String(visible)); } catch { /* ignore */ }
}

/** 顶部编辑栏：承接主题、排版、分页分隔线和导出控制。 */
export function initDevPanel({ currentTheme, defaultTheme, defaultSpacing, onThemeChange, onEditorToggle, onEditModeChange, locale = 'zh-CN', locales = [], onLocaleChange, catalog, activeVersion, onVersionChange, onVersionCreate, onVersionCopy, onVersionRename, onVersionDelete, onVersionMove }) {
  const root = document.documentElement;
  let toolbarOffsetFrame = null;
  let toolbarResizeObserver = null;
  let currentCatalog = catalog;
  let currentActive = activeVersion;
  const expandedIds = new Set();
  const collapsedIds = new Set();
  const expansion = { expanded: expandedIds, collapsed: collapsedIds };
  SPACING_DEFAULTS = Object.fromEntries(SPACING_CONTROLS.map(control => {
    const { key } = control;
    if (defaultSpacing[key] !== undefined) return [key, String(defaultSpacing[key])];
    if (control.fallback !== undefined) return [key, String(control.fallback)];
    const fallback = getComputedStyle(root).getPropertyValue(`--${key}`).trim();
    return [key, fallback ? String(parseFloat(fallback)) : '0'];
  }));

  const toolbar = document.createElement('section');
  toolbar.className = 'resume-editor-toolbar';
  toolbar.setAttribute('aria-label', t(locale, 'app.toolbarAria'));
  toolbar.innerHTML = `
    <div class="resume-editor-toolbar-main">
      <div class="resume-editor-toolbar-brand"><span class="resume-editor-brand-mark"><i data-lucide="layout-panel-top"></i></span><span>${t(locale, 'app.name')}</span></div>
      <div class="resume-editor-toolbar-controls">
        <button type="button" class="resume-editor-toolbar-button" data-action="editor" aria-pressed="false" title="${t(locale, 'app.openJson')}"><i data-lucide="code-2"></i><span>${t(locale, 'app.edit')}</span></button>
        <span class="resume-editor-toolbar-divider"></span>
        <div class="resume-version-picker">
          <button type="button" class="resume-version-picker-button" data-action="version-menu" aria-expanded="false" aria-haspopup="tree" title="${t(locale, 'version.select')}"><i data-lucide="git-branch"></i><span>${escapeText((currentCatalog?.versions || []).find(item => item.id === currentActive?.versionId)?.name || currentActive?.versionId || '')}</span><i data-lucide="chevron-down"></i></button>
          <div class="resume-version-picker-menu" data-version-menu role="tree" hidden>
            <div class="resume-version-tree">${renderVersionTree(currentCatalog, currentActive, locale, expansion)}</div>
            <div class="resume-version-picker-footer"><button type="button" class="resume-version-root-create" data-version-action="new-root"><i data-lucide="plus"></i>${t(locale, 'version.newRoot')}</button><output class="resume-version-status" data-version-status hidden></output></div>
          </div>
        </div>
        <span class="resume-editor-toolbar-divider"></span>
        <label class="resume-editor-control" title="${t(locale, 'app.theme')}"><i data-lucide="palette"></i><select class="resume-editor-theme-select" aria-label="${t(locale, 'app.theme')}">
          ${renderThemeOptions(currentTheme, locale)}
        </select></label>
        ${locales.length ? `<label class="resume-editor-control" title="${t(locale, 'app.language')}"><select class="resume-editor-locale-select" aria-label="${t(locale, 'app.language')}">${locales.map(item => `<option value="${item.code}" ${item.code === locale ? 'selected' : ''}>${item.label}</option>`).join('')}</select></label>` : ''}
        <span class="resume-editor-toolbar-divider"></span>
        <button type="button" class="resume-editor-toolbar-button" data-action="spacing" aria-expanded="false" title="${t(locale, 'app.spacingTitle')}"><i data-lucide="sliders-horizontal"></i><span>${t(locale, 'app.spacing')}</span></button>
        <button type="button" class="resume-editor-toolbar-button" data-action="reset-theme" title="${t(locale, 'app.reset')}"><i data-lucide="rotate-ccw"></i><span>${t(locale, 'app.reset')}</span></button>
        <button type="button" class="resume-editor-toolbar-button primary" data-action="export" title="${t(locale, 'export.title')}"><i data-lucide="file-down"></i><span>${t(locale, 'app.export')}</span></button>
        <label class="resume-editor-toggle" title="${t(locale, 'app.editModeTitle')}"><i data-lucide="pencil"></i><span>${t(locale, 'app.editMode')}</span><input type="checkbox" class="resume-editor-edit-mode-toggle" /></label>
        <button type="button" class="resume-editor-toolbar-button quiet" data-action="hide" title="${t(locale, 'app.hide')}"><i data-lucide="eye-off"></i><span>${t(locale, 'app.hide')}</span></button>
      </div>
    </div>
    <div class="resume-editor-toolbar-drawer" aria-hidden="true">
      <div class="resume-editor-toolbar-drawer-header"><strong><i data-lucide="sliders-horizontal"></i>${t(locale, 'app.spacingTitle')}</strong><span>${t(locale, 'app.spacingHint')}</span></div>
      <div class="resume-editor-layout-options">
        <label class="resume-editor-layout-option" title="${t(locale, 'app.pageSeparatorsTitle')}"><span>${t(locale, 'app.pageSeparators')}</span><input type="checkbox" class="resume-editor-page-separator-toggle" /></label>
        <label class="resume-editor-layout-option" title="${t(locale, 'app.compactModeTitle')}"><span>${t(locale, 'app.compactMode')}</span><input type="checkbox" class="resume-editor-compact-toggle" /></label>
        <label class="resume-editor-layout-option" title="${t(locale, 'app.smartLayoutTitle')}"><span>${t(locale, 'app.smartLayout')}</span><input type="checkbox" class="resume-editor-smart-layout-toggle" /></label>
        <label class="resume-editor-layout-option" title="${t(locale, 'app.showPhotoTitle')}"><span>${t(locale, 'app.showPhoto')}</span><input type="checkbox" class="resume-editor-photo-toggle" /></label>
        <label class="resume-editor-layout-option resume-editor-layout-option-select" title="${t(locale, 'app.titleStyleTitle')}"><span>${t(locale, 'app.titleStyle')}</span><select class="resume-editor-title-style-select" aria-label="${t(locale, 'app.titleStyle')}">${TITLE_STYLE_OPTIONS.map(option => `<option value="${option.id}">${t(locale, option.key)}</option>`).join('')}</select></label>
      </div>
      <div class="resume-editor-spacing-groups">
        ${renderSpacingControls(locale)}
      </div>
      <button type="button" class="resume-editor-toolbar-button" data-action="reset-spacing">${t(locale, 'app.resetSpacing')}</button>
    </div>`;

  const versionDialog = document.createElement('div');
  versionDialog.className = 'resume-version-dialog';
  versionDialog.hidden = true;
  versionDialog.innerHTML = `
    <form class="resume-version-dialog-card" data-version-dialog-form aria-modal="true" aria-labelledby="resume-version-dialog-title">
      <div class="resume-version-dialog-header"><h2 id="resume-version-dialog-title" data-version-dialog-title></h2></div>
      <label class="resume-version-dialog-field"><span>${t(locale, 'version.nameLabel')}</span><input type="text" data-version-dialog-name required autocomplete="off" /></label>
      <label class="resume-version-dialog-field" data-version-dialog-parent-field><span>${t(locale, 'version.parentLabel')}</span><select data-version-dialog-parent></select></label>
      <output class="resume-version-dialog-status" data-version-dialog-status hidden></output>
      <div class="resume-version-dialog-actions"><button type="button" data-version-dialog-cancel>${t(locale, 'version.cancel')}</button><button type="submit" class="primary" data-version-dialog-submit>${t(locale, 'version.confirm')}</button></div>
    </form>`;

  const imageDialog = document.createElement('div');
  imageDialog.className = 'resume-image-dialog';
  imageDialog.hidden = true;
  imageDialog.innerHTML = `
    <form class="resume-image-dialog-card" data-image-dialog-form aria-modal="true" aria-labelledby="resume-image-dialog-title">
      <div class="resume-version-dialog-header"><h2 id="resume-image-dialog-title">${t(locale, 'export.title')}</h2></div>
      <label class="resume-version-dialog-field"><span>${t(locale, 'export.type')}</span><select data-export-type><option value="pdf">${t(locale, 'export.pdf')}</option><option value="image">${t(locale, 'export.image')}</option></select></label>
      <div data-image-options hidden>
      <label class="resume-version-dialog-field"><span>${t(locale, 'image.format')}</span><select data-image-format><option value="png">${t(locale, 'image.png')}</option><option value="jpeg">${t(locale, 'image.jpeg')}</option></select></label>
      <label class="resume-version-dialog-field"><span>${t(locale, 'image.scale')}</span><select data-image-scale><option value="1">${t(locale, 'image.scale1')}</option><option value="2" selected>${t(locale, 'image.scale2')}</option><option value="3">${t(locale, 'image.scale3')}</option></select></label>
      <p class="resume-image-dialog-hint">${t(locale, 'image.hint')}</p>
      </div>
      <output class="resume-version-dialog-status" data-image-dialog-status hidden></output>
      <div class="resume-version-dialog-actions"><button type="button" data-image-dialog-cancel>${t(locale, 'image.cancel')}</button><button type="submit" class="primary" data-image-dialog-submit>${t(locale, 'export.submit')}</button></div>
    </form>`;

  const restoreButton = document.createElement('button');
  restoreButton.type = 'button';
  restoreButton.className = 'resume-editor-toolbar-restore';
  restoreButton.setAttribute('aria-label', t(locale, 'app.restoreAria'));
  restoreButton.title = t(locale, 'app.restoreTitle');
  restoreButton.innerHTML = `<i data-lucide="panel-top-open"></i><span>${t(locale, 'app.show')}</span>`;
  const themeSelect = toolbar.querySelector('.resume-editor-theme-select');
  const versionPicker = toolbar.querySelector('.resume-version-picker');
  const versionMenuButton = toolbar.querySelector('[data-action="version-menu"]');
  const versionMenu = toolbar.querySelector('[data-version-menu]');
  const versionStatus = toolbar.querySelector('[data-version-status]');
  const versionDialogForm = versionDialog.querySelector('[data-version-dialog-form]');
  const versionDialogTitle = versionDialog.querySelector('[data-version-dialog-title]');
  const versionDialogName = versionDialog.querySelector('[data-version-dialog-name]');
  const versionDialogParent = versionDialog.querySelector('[data-version-dialog-parent]');
  const versionDialogParentField = versionDialog.querySelector('[data-version-dialog-parent-field]');
  const versionDialogStatus = versionDialog.querySelector('[data-version-dialog-status]');
  const imageDialogForm = imageDialog.querySelector('[data-image-dialog-form]');
  const imageDialogStatus = imageDialog.querySelector('[data-image-dialog-status]');
  const exportType = imageDialog.querySelector('[data-export-type]');
  const imageOptions = imageDialog.querySelector('[data-image-options]');
  const editorButton = toolbar.querySelector('[data-action="editor"]');
  const pageSeparatorToggle = toolbar.querySelector('.resume-editor-page-separator-toggle');
  const compactToggle = toolbar.querySelector('.resume-editor-compact-toggle');
  const smartLayoutToggle = toolbar.querySelector('.resume-editor-smart-layout-toggle');
  const photoToggle = toolbar.querySelector('.resume-editor-photo-toggle');
  const titleStyleSelect = toolbar.querySelector('.resume-editor-title-style-select');
  const editModeToggle = toolbar.querySelector('.resume-editor-edit-mode-toggle');
  const drawer = toolbar.querySelector('.resume-editor-toolbar-drawer');
  const spacingButton = toolbar.querySelector('[data-action="spacing"]');
  const spacingSliders = toolbar.querySelectorAll('.resume-editor-spacing-item input');
  const spacingOutputs = toolbar.querySelectorAll('.resume-editor-spacing-item output');
  let spacingValues = getStoredSpacing();
  let compactEnabled = getStoredCompactMode();
  let smartLayoutEnabled = getStoredSmartLayout();
  let showPhotoEnabled = getStoredShowPhoto();

  function openImageDialog() {
    imageDialogStatus.hidden = true;
    imageDialog.hidden = false;
    requestAnimationFrame(() => exportType.focus());
  }
  function closeImageDialog() { imageDialog.hidden = true; imageDialogStatus.hidden = true; }

  function closeVersionMenu() {
    versionMenu.hidden = true;
    versionMenuButton.setAttribute('aria-expanded', 'false');
    versionStatus.hidden = true;
  }
  function setVersionStatus(message, type = 'error') {
    versionStatus.textContent = message;
    versionStatus.dataset.type = type;
    versionStatus.hidden = false;
  }
  let versionDialogState = null;
  function setVersionDialogStatus(message) {
    versionDialogStatus.textContent = message;
    versionDialogStatus.hidden = false;
  }
  function closeVersionDialog() {
    versionDialog.hidden = true;
    versionDialogState = null;
    versionDialogStatus.hidden = true;
  }
  function openVersionDialog({ mode, sourceVersionId = null, parentId = null, initialName = '' }) {
    closeVersionMenu();
    versionDialogState = { mode, sourceVersionId };
    versionDialogTitle.textContent = t(locale, mode === 'copy' ? 'version.copyTitle' : mode === 'rename' ? 'version.renameTitle' : 'version.newTitle');
    versionDialogName.value = initialName;
    versionDialogParent.innerHTML = renderParentOptions(currentCatalog, parentId, locale);
    versionDialogParentField.hidden = mode === 'new-root' || mode === 'rename';
    versionDialogStatus.hidden = true;
    versionDialog.hidden = false;
    requestAnimationFrame(() => versionDialogName.focus());
  }

  function updateSpacingOutputs() {
    spacingOutputs.forEach(output => {
      const control = SPACING_CONTROLS.find(item => item.key === output.dataset.key);
      output.textContent = `${spacingValues[output.dataset.key] ?? SPACING_DEFAULTS[output.dataset.key]}${control.unit}`;
    });
  }
  function syncSpacingSlider(key) {
    const slider = toolbar.querySelector(`.resume-editor-spacing-item input[data-key="${key}"]`);
    if (slider) slider.value = spacingValues[key] ?? SPACING_DEFAULTS[key];
  }
  function applyCompactLayout(enabled) {
    compactEnabled = !!enabled;
    compactToggle.checked = compactEnabled;
    applyCompactModeClass(compactEnabled);
    setStoredCompactMode(compactEnabled);
    if (compactEnabled) {
      spacingValues['resume-page-margin'] = String(COMPACT_PAGE_MARGIN_MM);
    } else {
      delete spacingValues['resume-page-margin'];
    }
    applySpacing(spacingValues);
    setStoredSpacing(spacingValues);
    syncSpacingSlider('resume-page-margin');
    updateSpacingOutputs();
    schedulePageSeparatorRefresh();
  }
  function applySmartLayout(enabled) {
    smartLayoutEnabled = !!enabled;
    smartLayoutToggle.checked = smartLayoutEnabled;
    applySmartLayoutClass(smartLayoutEnabled);
    setStoredSmartLayout(smartLayoutEnabled);
    if (smartLayoutEnabled && !getStoredPageSeparators()) {
      pageSeparatorToggle.checked = true;
      setPageSeparators(true);
      return;
    }
    schedulePageSeparatorRefresh();
  }
  function applyShowPhoto(enabled) {
    showPhotoEnabled = !!enabled;
    photoToggle.checked = showPhotoEnabled;
    applyShowPhotoClass(showPhotoEnabled);
    setStoredShowPhoto(showPhotoEnabled);
    schedulePageSeparatorRefresh();
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    spacingButton.setAttribute('aria-expanded', 'false');
    spacingButton.classList.remove('active');
    updateToolbarOffset();
  }
  function updateToolbarOffset() {
    if (toolbarOffsetFrame !== null) return;
    toolbarOffsetFrame = requestAnimationFrame(() => {
      toolbarOffsetFrame = null;
      const offset = toolbar.classList.contains('is-hidden') ? 0 : toolbar.offsetHeight;
      root.style.setProperty('--resume-editor-toolbar-offset', `${offset}px`);
    });
  }
  function updateVisibility(visible) {
    toolbar.classList.toggle('is-hidden', !visible);
    toolbar.setAttribute('aria-hidden', String(!visible));
    restoreButton.classList.toggle('is-visible', !visible);
    document.documentElement.classList.toggle('resume-editor-toolbar-visible', visible);
    setToolbarVisibility(visible);
    if (!visible) closeDrawer();
    updateToolbarOffset();
  }

  if (compactEnabled && spacingValues['resume-page-margin'] === undefined) {
    spacingValues['resume-page-margin'] = String(COMPACT_PAGE_MARGIN_MM);
  }
  applyCompactModeClass(compactEnabled);
  applySpacing(spacingValues);
  compactToggle.checked = compactEnabled;
  smartLayoutToggle.checked = smartLayoutEnabled;
  applySmartLayoutClass(smartLayoutEnabled);
  photoToggle.checked = showPhotoEnabled;
  applyShowPhotoClass(showPhotoEnabled);
  const titleStyle = getStoredTitleStyle();
  titleStyleSelect.value = titleStyle;
  applyTitleStyle(titleStyle);
  editModeToggle.checked = document.documentElement.classList.contains('resume-preview-edit-mode');
  schedulePageSeparatorRefresh(0);
  spacingSliders.forEach(slider => {
    if (spacingValues[slider.dataset.key] !== undefined) slider.value = spacingValues[slider.dataset.key];
    slider.addEventListener('input', () => {
      spacingValues[slider.dataset.key] = slider.value;
      applySpacing(spacingValues);
      setStoredSpacing(spacingValues);
      updateSpacingOutputs();
      schedulePageSeparatorRefresh();
    });
  });
  updateSpacingOutputs();
  themeSelect.addEventListener('change', () => onThemeChange(themeSelect.value));
  versionMenuButton.addEventListener('click', () => {
    const open = versionMenu.hidden;
    versionMenu.hidden = !open;
    versionMenuButton.setAttribute('aria-expanded', String(open));
  });
  let dragState = null;
  const sortableInstances = [];
  function findMoveTarget(event) {
    const list = event.to;
    const parentNode = list.closest('[data-version-node]');
    if (list.matches('.resume-version-tree-children') && parentNode && event.from !== list) {
      return { targetId: parentNode.dataset.versionNode, placement: 'child' };
    }
    const siblings = [...list.children].filter(node => node.matches('[data-version-node]'));
    const next = siblings[event.newIndex + 1];
    if (next) return { targetId: next.dataset.versionNode, placement: 'before' };
    const previous = siblings[event.newIndex - 1];
    if (previous) return { targetId: previous.dataset.versionNode, placement: 'after' };
    return null;
  }
  function bindVersionTree() {
    sortableInstances.splice(0).forEach(instance => instance.destroy());
    const tree = versionMenu.querySelector('.resume-version-tree');
    if (!tree) return;
    tree.innerHTML = renderVersionTree(currentCatalog, currentActive, locale, expansion);
    const label = versionMenuButton.querySelector('span');
    if (label) label.textContent = (currentCatalog?.versions || []).find(item => item.id === currentActive?.versionId)?.name || currentActive?.versionId || '';
    tree.querySelectorAll('[data-version-toggle]').forEach(toggle => toggle.addEventListener('click', () => {
      const node = toggle.closest('[data-version-node]');
      const items = node?.querySelector(':scope > .resume-version-tree-children');
      if (!items || !node) return;
      const expanded = items.hidden;
      items.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', `${t(locale, expanded ? 'version.collapse' : 'version.expand')} ${node.querySelector('.resume-version-tree-name')?.textContent || ''}`);
      toggle.querySelector('span').textContent = expanded ? '▾' : '▸';
      const versionId = node.dataset.versionNode;
      if (expanded) { expandedIds.add(versionId); collapsedIds.delete(versionId); }
      else { collapsedIds.add(versionId); expandedIds.delete(versionId); }
    }));
    tree.querySelectorAll('.resume-version-tree-item').forEach(item => item.addEventListener('click', async () => {
      if (item.dataset.suppressSelect === 'true') { delete item.dataset.suppressSelect; return; }
      closeVersionMenu();
      try {
        await onVersionChange?.({ versionId: item.dataset.versionId });
      } catch (error) {
        setVersionStatus(error.message || String(error));
        versionMenu.hidden = false;
        versionMenuButton.setAttribute('aria-expanded', 'true');
      }
    }));
    versionMenu.querySelectorAll('.resume-version-tree, .resume-version-tree .resume-version-tree-children').forEach(list => {
      sortableInstances.push(Sortable.create(list, {
        group: { name: 'resume-version-tree', pull: true, put: true },
        draggable: '>.resume-version-tree-node',
        handle: '.resume-version-tree-item',
        animation: 160,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fallbackOnBody: true,
        fallbackTolerance: 5,
        swapThreshold: 0.65,
        emptyInsertThreshold: 12,
        ghostClass: 'resume-version-sortable-ghost',
        chosenClass: 'resume-version-sortable-chosen',
        dragClass: 'resume-version-sortable-drag',
        onMove(event) {
          const sourceId = dragState?.sourceId;
          const targetNode = event.to.closest('[data-version-node]') || event.related?.closest?.('[data-version-node]');
          if (sourceId && targetNode && (targetNode.dataset.versionNode === sourceId || isDescendant(currentCatalog, targetNode.dataset.versionNode, sourceId))) return false;
          return true;
        },
        onStart(event) {
          const item = event.item.querySelector('.resume-version-tree-item');
          dragState = { sourceId: event.item.dataset.versionNode, item };
          if (item) item.dataset.suppressSelect = 'true';
          document.body.classList.add('resume-version-dragging');
        },
        async onEnd(event) {
          const state = dragState;
          dragState = null;
          document.body.classList.remove('resume-version-dragging');
          const item = state?.item;
          const target = state ? findMoveTarget(event) : null;
          if (item) window.setTimeout(() => { delete item.dataset.suppressSelect; }, 0);
          if (!state || !target || state.sourceId === target.targetId) return;
          try {
            await onVersionMove?.(state.sourceId, target.targetId, target.placement);
          } catch (error) {
            setVersionStatus(error.message || String(error));
            bindVersionTree();
          }
        },
      }));
    });
    tree.querySelectorAll('[data-version-action]').forEach(button => button.addEventListener('click', handleVersionAction));
    createIcons({ icons: APP_ICONS, root: versionMenu });
  }
  async function handleVersionAction(event) {
    event.stopPropagation();
    const button = event.currentTarget;
    const action = button.dataset.versionAction;
    const versionId = button.dataset.versionId;
    const version = (currentCatalog?.versions || []).find(item => item.id === versionId);
    if (action === 'new-root') openVersionDialog({ mode: 'new-root' });
    else if (action === 'new') openVersionDialog({ mode: 'new', parentId: versionId });
    else if (action === 'copy' && version) openVersionDialog({ mode: 'copy', sourceVersionId: versionId, parentId: version.parentId, initialName: t(locale, 'version.copyName', { name: version.name }) });
    else if (action === 'rename' && version) openVersionDialog({ mode: 'rename', sourceVersionId: versionId, initialName: version.name });
    else if (action === 'delete' && version && window.confirm(t(locale, 'version.deleteConfirm', { name: version.name }))) {
      try { await onVersionDelete?.(versionId); } catch (error) { setVersionStatus(t(locale, 'version.deleteFailed', { message: error.message || String(error) })); }
    }
  }
  versionMenu.querySelector('[data-version-action="new-root"]')?.addEventListener('click', handleVersionAction);
  bindVersionTree();
  function setCatalog(nextCatalog, nextActive) {
    currentCatalog = nextCatalog;
    currentActive = nextActive;
    bindVersionTree();
  }
  versionDialogForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!versionDialogState) return;
    const name = versionDialogName.value.trim();
    if (!name) { setVersionDialogStatus(t(locale, 'version.nameRequired')); versionDialogName.focus(); return; }
    const parentId = versionDialogParentField.hidden ? null : (versionDialogParent.value || null);
    try {
      if (versionDialogState.mode === 'copy') await onVersionCopy?.({ name, sourceVersionId: versionDialogState.sourceVersionId, parentId });
      else if (versionDialogState.mode === 'rename') await onVersionRename?.({ versionId: versionDialogState.sourceVersionId, name });
      else await onVersionCreate?.({ name, parentId });
      closeVersionDialog();
    } catch (error) {
      const key = versionDialogState.mode === 'copy' ? 'version.copyFailed' : versionDialogState.mode === 'rename' ? 'version.renameFailed' : 'version.createFailed';
      setVersionDialogStatus(t(locale, key, { message: error.message || String(error) }));
    }
  });
  versionDialog.querySelector('[data-version-dialog-cancel]').addEventListener('click', closeVersionDialog);
  versionDialog.addEventListener('click', event => { if (event.target === versionDialog) closeVersionDialog(); });
  const handleVersionOutsideClick = event => { if (!versionPicker.contains(event.target)) closeVersionMenu(); };
  const handleVersionEscape = event => { if (event.key === 'Escape') { if (!versionDialog.hidden) closeVersionDialog(); else closeVersionMenu(); } };
  document.addEventListener('pointerdown', handleVersionOutsideClick);
  document.addEventListener('keydown', handleVersionEscape);
  toolbar.querySelector('.resume-editor-locale-select')?.addEventListener('change', event => onLocaleChange(event.target.value));
  editorButton.addEventListener('click', () => onEditorToggle());
  const handleEditorToggle = event => {
    const open = Boolean(event.detail?.open);
    editorButton.classList.toggle('active', open);
    editorButton.setAttribute('aria-pressed', String(open));
    editorButton.title = open ? t(locale, 'app.closeJson') : t(locale, 'app.openJson');
  };
  window.addEventListener('resume-editor-toggle', handleEditorToggle);
  pageSeparatorToggle.checked = getStoredPageSeparators();
  pageSeparatorToggle.addEventListener('change', () => setPageSeparators(pageSeparatorToggle.checked));
  compactToggle.addEventListener('change', () => applyCompactLayout(compactToggle.checked));
  smartLayoutToggle.addEventListener('change', () => applySmartLayout(smartLayoutToggle.checked));
  photoToggle.addEventListener('change', () => applyShowPhoto(photoToggle.checked));
  titleStyleSelect.addEventListener('change', () => {
    applyTitleStyle(titleStyleSelect.value);
    setStoredTitleStyle(titleStyleSelect.value);
    schedulePageSeparatorRefresh();
  });
  editModeToggle.addEventListener('change', () => onEditModeChange?.(editModeToggle.checked));
  spacingButton.addEventListener('click', () => {
    const open = drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', !open);
    drawer.setAttribute('aria-hidden', String(open));
    spacingButton.setAttribute('aria-expanded', String(!open));
    spacingButton.classList.toggle('active', !open);
    updateToolbarOffset();
  });
  toolbar.querySelector('[data-action="reset-theme"]').addEventListener('click', () => {
    try { localStorage.removeItem(STORAGE_KEY_THEME); } catch {}
    themeSelect.value = defaultTheme;
    onThemeChange(defaultTheme);
  });
  toolbar.querySelector('[data-action="reset-spacing"]').addEventListener('click', () => {
    compactEnabled = false;
    compactToggle.checked = false;
    applyCompactModeClass(false);
    setStoredCompactMode(false);
    smartLayoutEnabled = false;
    smartLayoutToggle.checked = false;
    applySmartLayoutClass(false);
    setStoredSmartLayout(false);
    spacingValues = {};
    setStoredSpacing(spacingValues);
    applySpacing({});
    titleStyleSelect.value = 'theme';
    applyTitleStyle('theme');
    setStoredTitleStyle('theme');
    spacingSliders.forEach(slider => { slider.value = SPACING_DEFAULTS[slider.dataset.key]; });
    updateSpacingOutputs();
    schedulePageSeparatorRefresh();
  });
  async function printResume() {
    closeImageDialog();
    await new Promise(resolve => requestAnimationFrame(resolve));
    const previousTitle = document.title;
    document.title = exportFileName(currentCatalog, currentActive);
    try {
      await withForcedPageSeparators(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        window.print();
      });
    } finally {
      document.title = previousTitle;
    }
  }
  exportType.addEventListener('change', () => { imageOptions.hidden = exportType.value !== 'image'; });
  toolbar.querySelector('[data-action="export"]').addEventListener('click', openImageDialog);
  imageDialogForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = imageDialogForm.querySelector('[data-image-dialog-submit]');
    submit.disabled = true;
    imageDialogStatus.textContent = t(locale, 'export.working');
    imageDialogStatus.hidden = false;
    try {
      const fileName = exportFileName(currentCatalog, currentActive);
      if (exportType.value === 'pdf') {
        if (isTauriShell()) await exportResumePdf({ fileName });
        else await printResume();
      } else {
        await exportResumeImage({
          format: imageDialogForm.querySelector('[data-image-format]').value,
          scale: imageDialogForm.querySelector('[data-image-scale]').value,
          fileName,
        });
      }
      closeImageDialog();
    } catch (error) {
      if (error?.name === 'SaveCancelledError' || error instanceof SaveCancelledError) {
        imageDialogStatus.hidden = true;
        return;
      }
      imageDialogStatus.textContent = t(locale, 'image.failed', { message: error.message || String(error) });
      imageDialogStatus.hidden = false;
    } finally { submit.disabled = false; }
  });
  imageDialog.querySelector('[data-image-dialog-cancel]').addEventListener('click', closeImageDialog);
  imageDialog.addEventListener('click', event => { if (event.target === imageDialog) closeImageDialog(); });
  toolbar.querySelector('[data-action="export-image"]')?.addEventListener('click', openImageDialog);
  toolbar.querySelector('[data-action="hide"]').addEventListener('click', () => updateVisibility(false));
  restoreButton.addEventListener('click', () => updateVisibility(true));
  const handleToolbarShortcut = event => {
    if (event.altKey && event.key.toLowerCase() === 'e') { event.preventDefault(); updateVisibility(toolbar.classList.contains('is-hidden')); }
    if (event.key === 'Escape') closeDrawer();
  };
  document.addEventListener('keydown', handleToolbarShortcut);
  document.body.prepend(toolbar);
  toolbarResizeObserver = new ResizeObserver(updateToolbarOffset);
  toolbarResizeObserver.observe(toolbar);
  document.body.appendChild(restoreButton);
  document.body.appendChild(versionDialog);
  document.body.appendChild(imageDialog);
  createIcons({ icons: APP_ICONS });
  updateVisibility(getToolbarVisibility());
  return {
    setCatalog,
    destroy: () => {
      toolbarResizeObserver?.disconnect();
      if (toolbarOffsetFrame !== null) cancelAnimationFrame(toolbarOffsetFrame);
      window.removeEventListener('resume-editor-toggle', handleEditorToggle);
      document.removeEventListener('pointerdown', handleVersionOutsideClick);
      document.removeEventListener('keydown', handleVersionEscape);
      document.removeEventListener('keydown', handleToolbarShortcut);
      sortableInstances.forEach(instance => instance.destroy());
      document.body.classList.remove('resume-version-dragging');
      toolbar.remove();
      restoreButton.remove();
      versionDialog.remove();
      imageDialog.remove();
      document.documentElement.classList.remove('resume-editor-toolbar-visible');
      document.documentElement.style.removeProperty('--resume-editor-toolbar-offset');
    },
  };
}
