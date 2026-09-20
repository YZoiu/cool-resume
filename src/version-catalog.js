export const EMPTY_RESUME = {
  name: '', title: '', experience: '', photo: '',
  basicInfo: { items: [] }, work: [], projects: [], skills: [], education: [],
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createVersionId() {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
  return `v-${Date.now().toString(36)}-${suffix}`;
}

export function getVersion(catalog, versionId) {
  const version = catalog.versions?.find(item => item.id === versionId);
  if (!version) throw new Error(`未知简历版本：${versionId}`);
  return version;
}

export function childrenOf(catalog, parentId) {
  return (catalog?.versions || []).filter(item => item.parentId === parentId);
}

export function collectSubtreeIds(catalog, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    (catalog.versions || []).forEach(item => {
      if (ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    });
  }
  return ids;
}

export function isDescendant(catalog, versionId, ancestorId) {
  let cursor = (catalog?.versions || []).find(version => version.id === versionId);
  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) return true;
    cursor = (catalog.versions || []).find(version => version.id === cursor.parentId);
  }
  return false;
}

export function isAncestorOfActive(catalog, versionId, activeVersionId) {
  let cursor = (catalog?.versions || []).find(version => version.id === activeVersionId);
  while (cursor?.parentId) {
    if (cursor.parentId === versionId) return true;
    cursor = (catalog.versions || []).find(version => version.id === cursor.parentId);
  }
  return false;
}

export function moveEntries(catalog, versionId, targetId, placement) {
  const moving = getVersion(catalog, versionId);
  const target = getVersion(catalog, targetId);
  if (moving.id === target.id) throw new Error('无效的拖拽目标');
  const movingIds = collectSubtreeIds(catalog, versionId);
  if (movingIds.has(targetId)) throw new Error('不能移动到自身或子版本中');
  const remaining = catalog.versions.filter(item => !movingIds.has(item.id));
  const targetIndex = remaining.findIndex(item => item.id === targetId);
  const targetSubtreeIds = collectSubtreeIds({ versions: remaining }, targetId);
  const subtreeEnd = remaining.reduce((index, item, itemIndex) => (
    targetSubtreeIds.has(item.id) ? Math.max(index, itemIndex) : index
  ), targetIndex);
  const insertIndex = placement === 'before'
    ? targetIndex
    : placement === 'after' || placement === 'child' ? subtreeEnd + 1 : -1;
  if (insertIndex < 0) throw new Error('无效的拖拽位置');
  const now = new Date().toISOString();
  const nextMoving = catalog.versions
    .filter(item => movingIds.has(item.id))
    .map(item => item.id === versionId
      ? { ...item, parentId: placement === 'child' ? targetId : target.parentId, updatedAt: now }
      : item);
  remaining.splice(insertIndex, 0, ...nextMoving);
  return { ...catalog, versions: remaining };
}

export function renameEntry(catalog, versionId, name, now = new Date().toISOString()) {
  getVersion(catalog, versionId);
  return {
    ...catalog,
    versions: catalog.versions.map(item => item.id === versionId ? { ...item, name, updatedAt: now } : item),
  };
}

export function deleteEntry(catalog, versionId) {
  const version = getVersion(catalog, versionId);
  if (childrenOf(catalog, versionId).length) throw new Error('请先删除所有子版本');
  if (catalog.versions.length === 1) throw new Error('至少保留一个版本');
  const nextVersions = catalog.versions.filter(item => item.id !== versionId);
  const nextActiveVersionId = catalog.activeVersionId === versionId
    ? (version.parentId || nextVersions[0].id)
    : catalog.activeVersionId;
  return { ...catalog, activeVersionId: nextActiveVersionId, versions: nextVersions };
}

export function touchVersion(catalog, versionId, now = new Date().toISOString()) {
  getVersion(catalog, versionId);
  return {
    ...catalog,
    versions: catalog.versions.map(item => item.id === versionId ? { ...item, updatedAt: now } : item),
  };
}

export function catalogStamp(catalog, versionId) {
  const entry = catalog?.versions?.find(item => item.id === versionId);
  return `${catalog?.activeVersionId || ''}:${versionId || ''}:${entry?.updatedAt || ''}:${catalog?.versions?.length || 0}`;
}
