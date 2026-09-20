import bundledCatalog from '../data-example/catalog.json';
import {
  EMPTY_RESUME,
  catalogStamp,
  clone,
  createVersionId,
  deleteEntry,
  getVersion,
  moveEntries,
  renameEntry,
  touchVersion,
} from './version-catalog.js';

const bundledFiles = import.meta.glob('../data-example/versions/*.json', { eager: true, import: 'default' });
const ACTIVE_KEY = 'myresume2-active-version';
const DB_NAME = 'myresume2-resume-versions';
const DB_VERSION = 2;
const CATALOG_KEY = 'catalog';

function bundledPath(file) {
  return `../data-example/${file}`;
}

function getBundledVersion(versionId, catalog = bundledCatalog) {
  const entry = catalog.versions.find(item => item.id === versionId);
  if (!entry) throw new Error(`未知简历版本：${versionId}`);
  const data = bundledFiles[bundledPath(entry.file)];
  if (!data) throw new Error(`找不到简历数据：${entry.file}`);
  return { entry, data: clone(data) };
}

function readStoredActive() {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
}

function writeStoredActive(versionId) {
  try { localStorage.setItem(ACTIVE_KEY, versionId); } catch { /* ignore */ }
}

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('versions')) request.result.createObjectStore('versions', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      request.result.onclose = () => { dbPromise = null; };
      resolve(request.result);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('versions').objectStore('versions').get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('versions', 'readwrite').objectStore('versions').put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('versions', 'readwrite').objectStore('versions').delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败：HTTP ${response.status}`);
  return payload;
}

export function createResumeStore() {
  const dev = import.meta.env.DEV;
  let catalog = clone(bundledCatalog);

  async function persistCatalog() {
    if (!dev) await idbPut(CATALOG_KEY, clone(catalog));
  }

  async function loadCatalog() {
    if (dev) {
      catalog = await requestJson('/__resume_versions');
    } else {
      const stored = await idbGet(CATALOG_KEY);
      if (stored?.schemaVersion === bundledCatalog.schemaVersion && Array.isArray(stored.versions)) catalog = stored;
      else await persistCatalog();
    }
    return catalog;
  }

  function findEntry(versionId) {
    return getVersion(catalog, versionId);
  }

  async function getVersionData(versionId) {
    const entry = findEntry(versionId);
    if (dev) return requestJson(`/__resume_versions/${encodeURIComponent(versionId)}`);
    const local = await idbGet(`data:${versionId}`);
    if (local) return clone(local);
    return getBundledVersion(entry.id, catalog).data;
  }

  async function setActive(versionId) {
    findEntry(versionId);
    if (dev) {
      catalog = await requestJson('/__resume_versions/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
    } else {
      catalog.activeVersionId = versionId;
      await persistCatalog();
      writeStoredActive(versionId);
    }
    return { versionId, data: await getVersionData(versionId) };
  }

  return {
    mode: dev ? 'filesystem' : 'indexeddb',
    async init() { await loadCatalog(); return this; },
    getCatalog: () => clone(catalog),
    catalogStamp: versionId => catalogStamp(catalog, versionId),
    async refreshCatalog() {
      await loadCatalog();
      return clone(catalog);
    },
    getActive: async () => {
      const stored = !dev && readStoredActive();
      const versionId = catalog.versions.some(item => item.id === stored) ? stored : catalog.activeVersionId;
      return { versionId, data: await getVersionData(versionId) };
    },
    getVersion: getVersionData,
    getBundledVersion: versionId => getBundledVersion(versionId).data,
    setActive,
    async moveVersion(versionId, targetId, placement) {
      findEntry(versionId);
      findEntry(targetId);
      if (!['before', 'after', 'child'].includes(placement)) throw new Error('无效的拖拽位置');
      if (dev) {
        catalog = await requestJson(`/__resume_versions/${encodeURIComponent(versionId)}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId, placement }),
        });
      } else {
        catalog = moveEntries(catalog, versionId, targetId, placement);
        await persistCatalog();
      }
      return clone(catalog);
    },
    async createVersion({ name, parentId = null, copyFromVersionId = null }) {
      const normalizedName = String(name || '').trim();
      if (!normalizedName) throw new Error('版本名称不能为空');
      if (parentId !== null) findEntry(parentId);
      if (copyFromVersionId !== null) findEntry(copyFromVersionId);
      if (dev) {
        const result = await requestJson('/__resume_versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalizedName, parentId, copyFromVersionId }),
        });
        catalog = result.catalog;
        return { versionId: result.versionId, data: result.data };
      }
      const versionId = createVersionId();
      const data = copyFromVersionId ? await getVersionData(copyFromVersionId) : clone(EMPTY_RESUME);
      const now = new Date().toISOString();
      catalog.versions.push({ id: versionId, name: normalizedName, parentId, file: `versions/${versionId}.json`, createdAt: now, updatedAt: now });
      await idbPut(`data:${versionId}`, clone(data));
      await persistCatalog();
      return { versionId, data: clone(data) };
    },
    async renameVersion(versionId, name) {
      const normalizedName = String(name || '').trim();
      if (!normalizedName) throw new Error('版本名称不能为空');
      findEntry(versionId);
      if (dev) {
        catalog = await requestJson(`/__resume_versions/${encodeURIComponent(versionId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: normalizedName }),
        });
      } else {
        catalog = renameEntry(catalog, versionId, normalizedName);
        await persistCatalog();
      }
      return clone(catalog);
    },
    async deleteVersion(versionId) {
      findEntry(versionId);
      const previousActive = catalog.activeVersionId;
      if (dev) {
        catalog = await requestJson(`/__resume_versions/${encodeURIComponent(versionId)}`, { method: 'DELETE' });
      } else {
        catalog = deleteEntry(catalog, versionId);
        await idbDelete(`data:${versionId}`);
        await persistCatalog();
      }
      writeStoredActive(catalog.activeVersionId);
      const switched = previousActive === versionId;
      return {
        versionId: catalog.activeVersionId,
        switched,
        data: switched ? await getVersionData(catalog.activeVersionId) : null,
        catalog: clone(catalog),
      };
    },
    async saveVersion(versionId, data) {
      findEntry(versionId);
      if (dev) {
        await requestJson(`/__resume_versions/${encodeURIComponent(versionId)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        catalog = await requestJson('/__resume_versions');
      } else {
        await idbPut(`data:${versionId}`, clone(data));
        catalog = touchVersion(catalog, versionId);
        await persistCatalog();
      }
    },
  };
}
