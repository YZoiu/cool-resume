/*
 * preview-edit.js — 预览区直接编辑
 *
 * 编辑模式打开后，预览里的 data-edit-path 节点可改文字；增删按钮改结构。
 * 文字修改只写回 JSON，避免每个按键都重绘；结构变化才重新渲染并恢复焦点。
 */

import {
  DEFAULT_PHOTO_HEIGHT_MM,
  DEFAULT_PHOTO_WIDTH_MM,
  getPhotoSize,
  PHOTO_WIDTH_MAX_MM,
  PHOTO_WIDTH_MIN_MM,
} from './renderer.js';
import {
  bumpModuleScale,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  getModuleScale,
  serializeMarkup,
} from './text-markup.js';
import { t } from './app-i18n.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isIndex(key) {
  return /^\d+$/.test(key);
}

function getAt(target, path) {
  if (!path) return target;
  return path.split('.').reduce((cursor, key) => {
    if (cursor == null) return undefined;
    return cursor[isIndex(key) ? Number(key) : key];
  }, target);
}

function parentPath(path) {
  const keys = path.split('.');
  keys.pop();
  return keys.join('.');
}

function ensureArray(data, path) {
  const keys = path.split('.').filter(Boolean);
  let cursor = data;
  keys.forEach((key, index) => {
    const current = isIndex(key) ? Number(key) : key;
    const isLast = index === keys.length - 1;
    const nextIsIndex = !isLast && isIndex(keys[index + 1]);
    if (cursor[current] == null) cursor[current] = isLast || nextIsIndex ? [] : {};
    cursor = cursor[current];
  });
  if (!Array.isArray(cursor)) return null;
  return cursor;
}

function setAt(target, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let cursor = target;
  for (const key of keys) {
    const index = isIndex(key) ? Number(key) : key;
    if (cursor[index] == null) cursor[index] = isIndex(key) ? [] : {};
    cursor = cursor[index];
  }
  cursor[isIndex(last) ? Number(last) : last] = value;
}

function removeAt(target, path) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.length ? getAt(target, keys.join('.')) : target;
  if (parent == null) return false;
  if (Array.isArray(parent) && isIndex(last)) {
    parent.splice(Number(last), 1);
    return true;
  }
  if (last in parent) {
    delete parent[last];
    return true;
  }
  return false;
}

function collectionTemplate(path, locale) {
  const zh = locale !== 'en-US';
  const normalized = path.replace(/\.\d+(?=\.|$)/g, '.N');
  switch (normalized) {
    case 'basicInfo.items':
      return { label: zh ? '标签' : 'Label', value: zh ? '内容' : 'Value' };
    case 'summary.items':
    case 'work.N.summary':
    case 'projects.N.summary':
      return zh ? '新的一条内容' : 'New bullet';
    case 'work':
      return {
        company: zh ? '公司名称' : 'Company',
        position: zh ? '职位' : 'Title',
        date: zh ? '起止时间' : 'Dates',
        summary: [zh ? '工作内容' : 'Responsibility'],
      };
    case 'projects':
      return {
        name: zh ? '项目名称' : 'Project',
        date: zh ? '起止时间' : 'Dates',
        background: zh ? '项目背景' : 'Background',
        techStack: zh ? '技术栈' : 'Tech stack',
        role: zh ? '项目职责' : 'Role',
        summary: [zh ? '项目内容' : 'Highlight'],
      };
    case 'skills':
      return { category: zh ? '类别' : 'Category', keywords: zh ? '技能' : 'Skills' };
    case 'education':
      return {
        institution: zh ? '学校' : 'School',
        degree: zh ? '学历，专业' : 'Degree, major',
        date: zh ? '起止时间' : 'Dates',
      };
    default:
      return '';
  }
}

function firstEditablePath(collectionPath, index) {
  const normalized = collectionPath.replace(/\.\d+(?=\.|$)/g, '.N');
  switch (normalized) {
    case 'basicInfo.items':
      return `${collectionPath}.${index}.value`;
    case 'work':
      return `work.${index}.company`;
    case 'projects':
      return `projects.${index}.name`;
    case 'skills':
      return `skills.${index}.category`;
    case 'education':
      return `education.${index}.institution`;
    default:
      return `${collectionPath}.${index}`;
  }
}

function readEditableText(element) {
  return serializeMarkup(element);
}

function fieldFromRange(range) {
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element?.closest?.('[data-edit-path]') || null;
}

function restoreRange(range) {
  const selection = window.getSelection();
  if (!selection || !range) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片'));
    };
    image.src = url;
  });
}

async function compressPhoto(file) {
  const image = await loadImage(file);
  const maxWidth = 360;
  const maxHeight = 480;
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function focusPreviewPath(path) {
  if (!path) return;
  const app = document.getElementById('app');
  const target = app?.querySelector(`[data-edit-path="${CSS.escape(path)}"]`);
  if (!target) return;
  target.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function initPreviewEdit({ getData, applyData, onSave, getLocale = () => 'zh-CN' }) {
  const app = document.getElementById('app');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/*';
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  let composing = false;
  let saveTimer = null;
  let photoResize = null;
  let savedRange = null;
  const formatMenu = document.createElement('div');
  formatMenu.className = 'resume-format-menu';
  formatMenu.hidden = true;
  formatMenu.innerHTML = `
    <button type="button" data-format="bold">${t(getLocale(), 'format.bold')}</button>
    <button type="button" data-format="size-up">${t(getLocale(), 'format.sizeUp')}</button>
    <button type="button" data-format="size-down">${t(getLocale(), 'format.sizeDown')}</button>
  `;
  document.body.appendChild(formatMenu);

  function currentData() {
    return clone(getData());
  }

  function scheduleSave(data) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      onSave?.(clone(data));
    }, 420);
  }

  function commit(data, { rerender = false, focusPath = null, save = true } = {}) {
    applyData(data, { rerender, focusPath });
    if (save) scheduleSave(data);
  }

  function commitText(path, value) {
    const data = currentData();
    setAt(data, path, value);
    applyData(data, { rerender: false });
    scheduleSave(data);
  }

  function commitField(field) {
    if (!field?.dataset.editPath) return;
    commitText(field.dataset.editPath, readEditableText(field));
  }

  function hideFormatMenu() {
    formatMenu.hidden = true;
    savedRange = null;
  }

  function showFormatMenu(event) {
    formatMenu.hidden = false;
    const pad = 8;
    const width = formatMenu.offsetWidth || 140;
    const height = formatMenu.offsetHeight || 110;
    const left = Math.min(event.clientX, window.innerWidth - width - pad);
    const top = Math.min(event.clientY, window.innerHeight - height - pad);
    formatMenu.style.left = `${Math.max(pad, left)}px`;
    formatMenu.style.top = `${Math.max(pad, top)}px`;
  }

  function selectionRange() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
    return selection.getRangeAt(0);
  }

  function toggleSelectionBold() {
    const range = savedRange || selectionRange();
    if (!range) return;
    const field = fieldFromRange(range);
    if (!field || !app.contains(field)) return;
    restoreRange(range);
    field.focus();
    document.execCommand('bold');
    commitField(field);
  }

  function currentModuleScaleFor(element) {
    const host = element.closest('[data-section-key]');
    const raw = host ? getComputedStyle(host).getPropertyValue('--resume-module-scale') : '1';
    const scale = parseFloat(raw);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function adjustSelectionFontSize(delta) {
    const range = savedRange || selectionRange();
    if (!range) return;
    const field = fieldFromRange(range);
    if (!field || !app.contains(field)) return;
    restoreRange(range.cloneRange());
    const scale = currentModuleScaleFor(field);
    const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const existing = startEl?.closest?.('[data-fs]');
    const coversExisting = existing && field.contains(existing)
      && range.toString() === existing.textContent;
    let next;
    if (coversExisting) {
      next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(Number(existing.getAttribute('data-fs')) + delta)));
      existing.setAttribute('data-fs', String(next));
      existing.style.fontSize = `calc(${next}px * var(--resume-module-scale, 1))`;
    } else {
      const computed = parseFloat(getComputedStyle(startEl).fontSize) || 14;
      next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(computed / scale + delta)));
      const span = document.createElement('span');
      span.dataset.fs = String(next);
      span.style.fontSize = `calc(${next}px * var(--resume-module-scale, 1))`;
      try {
        range.surroundContents(span);
      } catch {
        span.appendChild(range.extractContents());
        range.insertNode(span);
      }
    }
    commitField(field);
  }

  function applyModuleScale(sectionKey, deltaSteps) {
    if (!sectionKey) return;
    const data = currentData();
    if (!data.style) data.style = {};
    if (!data.style.fontScale || typeof data.style.fontScale !== 'object') data.style.fontScale = {};
    const next = bumpModuleScale(getModuleScale(data, sectionKey), deltaSteps);
    if (Math.abs(next - 1) < 0.001) delete data.style.fontScale[sectionKey];
    else data.style.fontScale[sectionKey] = next;
    commit(data, { rerender: true });
  }

  async function assignPhoto(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const photo = await compressPhoto(file);
    const data = currentData();
    data.photo = photo;
    commit(data, { rerender: true });
  }

  function handleInput(event) {
    if (composing) return;
    const field = event.target.closest?.('[data-edit-path]');
    if (!field || !app.contains(field)) return;
    if (!document.documentElement.classList.contains('resume-preview-edit-mode')) return;
    commitText(field.dataset.editPath, readEditableText(field));
  }

  function handlePaste(event) {
    const field = event.target.closest?.('[data-edit-path]');
    if (!field || !document.documentElement.classList.contains('resume-preview-edit-mode')) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') hideFormatMenu();
    const field = event.target.closest?.('[data-edit-path]');
    if (!field || !document.documentElement.classList.contains('resume-preview-edit-mode')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      field.blur();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      savedRange = selectionRange()?.cloneRange() || savedRange;
      toggleSelectionBold();
    }
    if (event.key === 'Escape') hideFormatMenu();
  }

  function pxToMm(px) {
    return px * 25.4 / 96;
  }

  function roundMm(value) {
    return Math.round(value * 10) / 10;
  }

  function applyPhotoSizeToDom(width, height) {
    const header = app.querySelector('.resume-header');
    const photo = app.querySelector('.resume-photo');
    if (header) {
      header.style.setProperty('--resume-photo-width', `${width}mm`);
      header.style.setProperty('--resume-photo-height', `${height}mm`);
    }
    if (photo) {
      photo.style.width = `${width}mm`;
      photo.style.height = `${height}mm`;
    }
  }

  function startPhotoResize(event) {
    const handle = event.target.closest?.('[data-edit-action="resize-photo"]');
    if (!handle || !app.contains(handle)) return false;
    if (!document.documentElement.classList.contains('resume-preview-edit-mode')) return false;
    event.preventDefault();
    event.stopPropagation();
    const current = getPhotoSize(getData());
    photoResize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: current.width,
    };
    handle.setPointerCapture?.(event.pointerId);
    document.documentElement.classList.add('resume-photo-resizing');
    document.addEventListener('pointermove', movePhotoResize);
    document.addEventListener('pointerup', endPhotoResize);
    document.addEventListener('pointercancel', endPhotoResize);
    return true;
  }

  function movePhotoResize(event) {
    if (!photoResize) return;
    const aspect = DEFAULT_PHOTO_HEIGHT_MM / DEFAULT_PHOTO_WIDTH_MM;
    const deltaMm = pxToMm(event.clientX - photoResize.startX);
    const width = Math.min(PHOTO_WIDTH_MAX_MM, Math.max(PHOTO_WIDTH_MIN_MM, roundMm(photoResize.startWidth + deltaMm)));
    applyPhotoSizeToDom(width, roundMm(width * aspect));
  }

  function endPhotoResize(event) {
    if (!photoResize) return;
    const aspect = DEFAULT_PHOTO_HEIGHT_MM / DEFAULT_PHOTO_WIDTH_MM;
    const deltaMm = pxToMm(event.clientX - photoResize.startX);
    const width = Math.min(PHOTO_WIDTH_MAX_MM, Math.max(PHOTO_WIDTH_MIN_MM, roundMm(photoResize.startWidth + deltaMm)));
    const height = roundMm(width * aspect);
    photoResize = null;
    document.documentElement.classList.remove('resume-photo-resizing');
    document.removeEventListener('pointermove', movePhotoResize);
    document.removeEventListener('pointerup', endPhotoResize);
    document.removeEventListener('pointercancel', endPhotoResize);
    const data = currentData();
    data.photoWidth = width;
    data.photoHeight = height;
    applyPhotoSizeToDom(width, height);
    commit(data, { rerender: false });
  }

  function handlePointerDown(event) {
    startPhotoResize(event);
  }

  function handleContextMenu(event) {
    if (!document.documentElement.classList.contains('resume-preview-edit-mode')) return;
    const field = event.target.closest?.('[data-edit-path]');
    if (!field || !app.contains(field)) return;
    const range = selectionRange();
    if (!range || !range.toString().trim()) return;
    const ancestor = range.commonAncestorContainer;
    if (ancestor !== field && !field.contains(ancestor)) return;
    event.preventDefault();
    savedRange = range.cloneRange();
    showFormatMenu(event);
  }

  function handleFormatMenuClick(event) {
    const button = event.target.closest?.('[data-format]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.format;
    if (action === 'bold') toggleSelectionBold();
    else if (action === 'size-up') adjustSelectionFontSize(1);
    else if (action === 'size-down') adjustSelectionFontSize(-1);
    hideFormatMenu();
  }

  function handleClick(event) {
    if (!formatMenu.hidden && !formatMenu.contains(event.target)) hideFormatMenu();
    if (event.target.closest?.('[data-edit-action="resize-photo"]')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const removePhoto = event.target.closest?.('[data-edit-action="remove-photo"]');
    if (removePhoto && app.contains(removePhoto)) {
      event.preventDefault();
      event.stopPropagation();
      const data = currentData();
      data.photo = '';
      commit(data, { rerender: true });
      return;
    }

    const photo = event.target.closest?.('[data-edit-action="photo"]');
    if (photo && app.contains(photo) && document.documentElement.classList.contains('resume-show-photo')) {
      event.preventDefault();
      fileInput.click();
      return;
    }

    if (!document.documentElement.classList.contains('resume-preview-edit-mode')) return;

    const scaleBtn = event.target.closest?.('[data-edit-action="module-scale"]');
    if (scaleBtn && app.contains(scaleBtn)) {
      event.preventDefault();
      applyModuleScale(scaleBtn.dataset.sectionKey, Number(scaleBtn.dataset.scaleDelta) || 0);
      return;
    }

    const button = event.target.closest?.('[data-edit-action]');
    if (!button || !app.contains(button)) return;
    const action = button.dataset.editAction;
    const path = button.dataset.editPath;
    if (action === 'add' && path) {
      event.preventDefault();
      const data = currentData();
      const list = ensureArray(data, path);
      if (!list) return;
      list.push(clone(collectionTemplate(path, getLocale())));
      commit(data, { rerender: true, focusPath: firstEditablePath(path, list.length - 1) });
      return;
    }
    if (action === 'remove' && path) {
      event.preventDefault();
      const data = currentData();
      removeAt(data, path);
      const parent = parentPath(path);
      commit(data, { rerender: true, focusPath: parent || null });
    }
  }

  function handlePhotoKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest?.('[data-edit-action="remove-photo"]')) return;
    if (event.target.closest?.('[data-edit-action="resize-photo"]')) return;
    const photo = event.target.closest?.('[data-edit-action="photo"]');
    if (!photo || !app.contains(photo)) return;
    if (!document.documentElement.classList.contains('resume-show-photo')) return;
    event.preventDefault();
    fileInput.click();
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      await assignPhoto(file);
    } catch (error) {
      console.warn(error);
    }
  });

  app.addEventListener('input', handleInput);
  app.addEventListener('paste', handlePaste);
  app.addEventListener('keydown', handleKeydown);
  app.addEventListener('pointerdown', handlePointerDown);
  app.addEventListener('click', handleClick);
  app.addEventListener('contextmenu', handleContextMenu);
  formatMenu.addEventListener('pointerdown', event => event.preventDefault());
  formatMenu.addEventListener('click', handleFormatMenuClick);
  const handleDocumentPointerDown = event => {
    if (!formatMenu.hidden && !formatMenu.contains(event.target)) hideFormatMenu();
  };
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  app.addEventListener('keydown', handlePhotoKey);
  app.addEventListener('compositionstart', () => { composing = true; });
  app.addEventListener('compositionend', event => {
    composing = false;
    handleInput(event);
  });

  return {
    destroy() {
      window.clearTimeout(saveTimer);
      photoResize = null;
      document.documentElement.classList.remove('resume-photo-resizing');
      document.removeEventListener('pointermove', movePhotoResize);
      document.removeEventListener('pointerup', endPhotoResize);
      document.removeEventListener('pointercancel', endPhotoResize);
      app.removeEventListener('input', handleInput);
      app.removeEventListener('paste', handlePaste);
      app.removeEventListener('keydown', handleKeydown);
      app.removeEventListener('pointerdown', handlePointerDown);
      app.removeEventListener('click', handleClick);
      app.removeEventListener('contextmenu', handleContextMenu);
      formatMenu.removeEventListener('click', handleFormatMenuClick);
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      app.removeEventListener('keydown', handlePhotoKey);
      formatMenu.remove();
      fileInput.remove();
    },
  };
}
