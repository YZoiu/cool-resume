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
  return (element.innerText || element.textContent || '').replace(/\u00a0/g, ' ').replace(/\n+$/g, '');
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
    const field = event.target.closest?.('[data-edit-path]');
    if (!field || !document.documentElement.classList.contains('resume-preview-edit-mode')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      field.blur();
    }
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

  function handleClick(event) {
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
      app.removeEventListener('keydown', handlePhotoKey);
      fileInput.remove();
    },
  };
}
