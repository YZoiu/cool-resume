/*
 * 预览内联标记：加粗 **text**、斜体 *text*、高亮 ==text==、字号 {{fs:16}}text{{/fs}}
 */

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarks(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');
  return html;
}

export function renderInlineMarkup(text) {
  if (text == null || text === '') return '';
  const source = String(text);
  const re = /\{\{fs:(\d+(?:\.\d+)?)\}\}([\s\S]*?)\{\{\/fs\}\}/g;
  let html = '';
  let last = 0;
  let match;
  while ((match = re.exec(source))) {
    html += renderMarks(source.slice(last, match.index));
    const size = match[1];
    html += `<span data-fs="${size}" style="font-size: calc(${size}px * var(--resume-module-scale, 1))">${renderInlineMarkup(match[2])}</span>`;
    last = re.lastIndex;
  }
  html += renderMarks(source.slice(last));
  return html;
}

export function serializeMarkup(node) {
  if (!node) return '';
  let out = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent.replace(/\u00a0/g, ' ');
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') {
      out += '\n';
      return;
    }
    const inner = serializeMarkup(child);
    if (!inner) return;
    if (tag === 'strong' || tag === 'b') out += `**${inner}**`;
    else if (tag === 'em' || tag === 'i') out += `*${inner}*`;
    else if (tag === 'mark') out += `==${inner}==`;
    else if (child.hasAttribute('data-fs')) out += `{{fs:${child.getAttribute('data-fs')}}}${inner}{{/fs}}`;
    else out += inner;
  });
  return out.replace(/\n+$/g, '');
}

export const MODULE_SCALE_STEP = 0.05;
export const MODULE_SCALE_MIN = 0.8;
export const MODULE_SCALE_MAX = 1.45;
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 36;

export function getModuleScale(data, key) {
  const value = Number(data?.style?.fontScale?.[key]);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MODULE_SCALE_MAX, Math.max(MODULE_SCALE_MIN, value));
}

export function bumpModuleScale(current, deltaSteps) {
  const next = Math.round((Number(current) + deltaSteps * MODULE_SCALE_STEP) * 100) / 100;
  return Math.min(MODULE_SCALE_MAX, Math.max(MODULE_SCALE_MIN, next));
}
