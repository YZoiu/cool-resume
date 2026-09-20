import { t } from './app-i18n.js';

/*
 * renderer.js — 将版本 JSON 渲染为简历 HTML
 * 每个 section 对应一个 renderXxx 函数。姓名、基本信息和教育背景合并为页头，
 * 证件照贴在右上角；编辑模式通过 data-edit-path 把预览映射回 JSON。
 */

const ICONS = {
  mail: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/></svg>`,

  phone: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,

  mapPin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`,

  user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,

  briefcase: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>`,

  rocket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"/><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"/></svg>`,

  wrench: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>`,

  graduationCap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`,

  award: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/></svg>`,
};

const INTEGRATED_SECTIONS = new Set(['basicInfo', 'education']);
export const DEFAULT_PHOTO_WIDTH_MM = 25;
export const DEFAULT_PHOTO_HEIGHT_MM = 35;
export const PHOTO_WIDTH_MIN_MM = 16;
export const PHOTO_WIDTH_MAX_MM = 36;

let ctx = { locale: 'zh-CN', editMode: false };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getPhotoSize(data) {
  const aspect = DEFAULT_PHOTO_HEIGHT_MM / DEFAULT_PHOTO_WIDTH_MM;
  const rawWidth = Number(data?.photoWidth);
  const rawHeight = Number(data?.photoHeight);
  const width = clamp(
    Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : DEFAULT_PHOTO_WIDTH_MM,
    PHOTO_WIDTH_MIN_MM,
    PHOTO_WIDTH_MAX_MM,
  );
  const height = Number.isFinite(rawHeight) && rawHeight > 0
    ? clamp(rawHeight, PHOTO_WIDTH_MIN_MM * aspect, PHOTO_WIDTH_MAX_MM * aspect)
    : width * aspect;
  return { width, height };
}

function icon(name) {
  return ICONS[name] || '';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInlineMarkdown(text) {
  if (text == null) return '';
  let html = escapeHtml(String(text));
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/==(.+?)==/g, '<mark>$1</mark>');
  return html;
}

function editable(path, value, kind = 'text') {
  const rendered = kind === 'markdown' && !ctx.editMode
    ? renderInlineMarkdown(value)
    : escapeHtml(value ?? '');
  const ce = ctx.editMode ? ' contenteditable="true" spellcheck="false"' : '';
  return `<span class="resume-edit-text"${ce} data-edit-path="${escapeHtml(path)}" data-edit-kind="${kind}">${rendered}</span>`;
}

function addBtn(path, label) {
  if (!ctx.editMode) return '';
  return `<button type="button" class="resume-edit-btn resume-edit-add" data-edit-action="add" data-edit-path="${escapeHtml(path)}">${escapeHtml(label)}</button>`;
}

function removeBtn(path) {
  if (!ctx.editMode) return '';
  return `<button type="button" class="resume-edit-btn resume-edit-remove" data-edit-action="remove" data-edit-path="${escapeHtml(path)}" aria-label="${escapeHtml(t(ctx.locale, 'edit.remove'))}" title="${escapeHtml(t(ctx.locale, 'edit.remove'))}">×</button>`;
}

function renderBullets(items, pathPrefix) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0 && !ctx.editMode) return '';
  const lis = list.map((item, index) => {
    const path = `${pathPrefix}.${index}`;
    const body = ctx.editMode ? escapeHtml(item ?? '') : renderInlineMarkdown(item);
    const ce = ctx.editMode ? ' contenteditable="true" spellcheck="false"' : '';
    return `<li data-edit-item="${escapeHtml(path)}"><p class="resume-edit-text"${ce} data-edit-path="${escapeHtml(path)}" data-edit-kind="markdown">${body}</p>${removeBtn(path)}</li>`;
  }).join('');
  return `<ul>${lis}</ul>${addBtn(pathPrefix, t(ctx.locale, 'edit.addBullet'))}`;
}

function renderPhoto(data) {
  const src = typeof data.photo === 'string' ? data.photo.trim() : '';
  const { width, height } = getPhotoSize(data);
  const img = src
    ? `<img class="resume-photo-image" src="${escapeHtml(src)}" alt="${escapeHtml(data.name || '')}">`
    : `<span class="resume-photo-placeholder">${escapeHtml(t(ctx.locale, 'photo.placeholder'))}</span>`;
  const remove = ctx.editMode && src
    ? `<button type="button" class="resume-edit-btn resume-photo-remove" data-edit-action="remove-photo" title="${escapeHtml(t(ctx.locale, 'photo.remove'))}">×</button>`
    : '';
  const resize = ctx.editMode
    ? `<span class="resume-photo-resize" data-edit-action="resize-photo" title="${escapeHtml(t(ctx.locale, 'photo.resize'))}"></span>`
    : '';
  return `<div class="resume-photo" data-edit-action="photo" role="button" tabindex="0" title="${escapeHtml(t(ctx.locale, src ? 'photo.change' : 'photo.placeholder'))}" style="width:${width}mm;height:${height}mm">${img}${remove}${resize}</div>`;
}

function renderLabeledItem(label, valueHtml, extraClass = '') {
  return `
    <div class="resume-basic-info-item${extraClass ? ` ${extraClass}` : ''}">
      <span class="resume-basic-info-label">${label}</span>
      <span class="resume-basic-info-value">${valueHtml}</span>
    </div>
  `;
}

function renderProfile(data) {
  const basicItems = data.basicInfo?.items || [];
  const education = Array.isArray(data.education) ? data.education : [];
  if (!basicItems.length && !education.length && !ctx.editMode) return '';

  const basic = basicItems.map((item, index) => `
    <div class="resume-basic-info-item" data-edit-item="basicInfo.items.${index}">
      ${removeBtn(`basicInfo.items.${index}`)}
      <span class="resume-basic-info-label">${editable(`basicInfo.items.${index}.label`, item.label)}</span>
      <span class="resume-basic-info-value">${editable(`basicInfo.items.${index}.value`, item.value)}</span>
    </div>
  `).join('');

  const edu = education.map((entry, index) => `
    <div class="resume-profile-education-entry" data-edit-item="education.${index}">
      ${removeBtn(`education.${index}`)}
      ${renderLabeledItem(escapeHtml(t(ctx.locale, 'profile.institution')), editable(`education.${index}.institution`, entry.institution))}
      ${renderLabeledItem(escapeHtml(t(ctx.locale, 'profile.degree')), editable(`education.${index}.degree`, entry.degree))}
      ${renderLabeledItem(escapeHtml(t(ctx.locale, 'profile.date')), editable(`education.${index}.date`, entry.date))}
    </div>
  `).join('');

  return `
    <div class="resume-profile">
      <div class="resume-profile-basic">
        ${basic}
        ${addBtn('basicInfo.items', t(ctx.locale, 'edit.addBasic'))}
      </div>
      <div class="resume-profile-education">
        ${edu}
        ${addBtn('education', t(ctx.locale, 'edit.addEducation'))}
      </div>
    </div>
  `;
}

export function renderHeader(data) {
  const photo = getPhotoSize(data);
  return `
    <header class="resume-header" style="--resume-photo-width:${photo.width}mm;--resume-photo-height:${photo.height}mm">
      ${renderPhoto(data)}
      <div class="resume-header-body">
        <h1 class="resume-name">${editable('name', data.name)}</h1>
        ${renderProfile(data)}
      </div>
    </header>
  `;
}

function renderSection(title, iconName, content, sectionKey) {
  return `
    <section class="resume-section" data-section-key="${escapeHtml(sectionKey)}">
      <h2 class="resume-section-title"><i class="resume-section-icon">${icon(iconName)}</i>${escapeHtml(title)}</h2>
      <div class="resume-section-content">${content}</div>
    </section>
  `;
}

function renderBasicInfo(basicInfo) {
  const items = (basicInfo?.items || []).map(item => `
    <div class="resume-basic-info-item">
      <span class="resume-basic-info-label">${escapeHtml(item.label)}</span>
      <span class="resume-basic-info-value">${escapeHtml(item.value)}</span>
    </div>
  `).join('');
  return `<div class="resume-basic-info">${items}</div>`;
}

function renderSummary(summary) {
  if (!summary || !summary.items || summary.items.length === 0) {
    return ctx.editMode
      ? `<div class="resume-summary-content">${renderBullets([], 'summary.items')}</div>`
      : '';
  }
  return `<div class="resume-summary-content">${renderBullets(summary.items, 'summary.items')}</div>`;
}

function renderWork(work) {
  const entries = (work || []).map((entry, index) => `
    <div class="resume-entry" data-edit-item="work.${index}">
      ${removeBtn(`work.${index}`)}
      <div class="resume-entry-header">
        <div class="resume-entry-title">
          ${editable(`work.${index}.company`, entry.company)}
          <span class="resume-entry-title-separator">·</span>
          ${editable(`work.${index}.position`, entry.position)}
        </div>
        <div class="resume-entry-date">${editable(`work.${index}.date`, entry.date)}</div>
      </div>
      <div class="resume-entry-summary">${renderBullets(entry.summary, `work.${index}.summary`)}</div>
    </div>
  `).join('');
  return `${entries}${addBtn('work', t(ctx.locale, 'edit.addWork'))}`;
}

function renderProjectMeta(entry, index) {
  const fields = [
    { key: 'background', label: t(ctx.locale, 'project.background') },
    { key: 'techStack', label: t(ctx.locale, 'project.techStack') },
    { key: 'role', label: t(ctx.locale, 'project.role') },
  ];
  const lines = fields
    .filter(({ key }) => ctx.editMode || entry[key])
    .map(({ key, label }) => `
      <div class="resume-project-meta">
        <span class="resume-project-meta-label">${escapeHtml(label)}</span>
        <span class="resume-project-meta-value">${editable(`projects.${index}.${key}`, entry[key], 'markdown')}</span>
      </div>
    `);
  return lines.length ? `<div class="resume-project-meta-list">${lines.join('')}</div>` : '';
}

function renderProjects(projects) {
  const entries = (projects || []).map((entry, index) => `
    <div class="resume-entry resume-project-entry" data-edit-item="projects.${index}">
      ${removeBtn(`projects.${index}`)}
      <div class="resume-entry-header">
        <div class="resume-entry-title">${editable(`projects.${index}.name`, entry.name)}</div>
        <div class="resume-entry-date">${editable(`projects.${index}.date`, entry.date)}</div>
      </div>
      ${renderProjectMeta(entry, index)}
      <hr class="resume-project-divider">
      <div class="resume-entry-summary">${renderBullets(entry.summary, `projects.${index}.summary`)}</div>
    </div>
  `).join('');
  return `${entries}${addBtn('projects', t(ctx.locale, 'edit.addProject'))}`;
}

function renderSkills(skills) {
  const items = (skills || []).map((skill, index) => `
    <div class="resume-skill-item" data-edit-item="skills.${index}">
      ${removeBtn(`skills.${index}`)}
      <div class="resume-skill-name">${editable(`skills.${index}.category`, skill.category)}</div>
      <div class="resume-skill-keywords">${ctx.editMode ? editable(`skills.${index}.keywords`, skill.keywords) : renderSkillKeywords(skill.keywords)}</div>
    </div>
  `).join('');
  return `${items}${addBtn('skills', t(ctx.locale, 'edit.addSkill'))}`;
}

function renderSkillKeywords(keywords) {
  const groups = String(keywords || '')
    .split('；')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf(':');
      if (separator < 0) return `<span class="resume-skill-group">${escapeHtml(part)}</span>`;
      const level = part.slice(0, separator).trim();
      const values = part.slice(separator + 1).trim();
      return `<span class="resume-skill-group"><span class="resume-skill-level">${escapeHtml(level)}</span><span class="resume-skill-values">${escapeHtml(values)}</span></span>`;
    });

  return groups.join('') || '<span class="resume-skill-group">—</span>';
}

function renderEducation(education) {
  const entries = (education || []).map(entry => `
    <div class="resume-entry">
      <div class="resume-entry-header">
        <div>
          <div class="resume-entry-title">${escapeHtml(entry.institution)}</div>
          <div class="resume-entry-organization">${escapeHtml(entry.degree)}</div>
        </div>
        <div class="resume-entry-date">${escapeHtml(entry.date)}</div>
      </div>
    </div>
  `).join('');
  return entries;
}

const SECTIONS = {
  basicInfo: { key: 'basicInfo', icon: 'user', render: renderBasicInfo },
  summary: { key: 'summary', icon: 'award', render: renderSummary },
  skills: { key: 'skills', icon: 'wrench', render: renderSkills },
  work: { key: 'work', icon: 'briefcase', render: renderWork },
  projects: { key: 'projects', icon: 'rocket', render: renderProjects },
  education: { key: 'education', icon: 'graduationCap', render: renderEducation },
};

const DEFAULT_ORDER = ['header', 'summary', 'skills', 'work', 'projects'];

export function renderResume(data, { locale = 'zh-CN', editMode = false } = {}) {
  ctx = { locale, editMode: !!editMode };
  const order = data.order || DEFAULT_ORDER;
  return order.map(key => {
    if (key === 'header') return renderHeader(data);
    if (INTEGRATED_SECTIONS.has(key)) return '';
    const section = SECTIONS[key];
    if (!section) return '';
    return renderSection(t(locale, `section.${section.key}`), section.icon, section.render(data[key]), section.key);
  }).join('');
}
