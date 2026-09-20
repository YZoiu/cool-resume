import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildThirdPartyNotices } from './scripts/third-party-notices.js';
import {
  EMPTY_RESUME,
  createVersionId,
  deleteEntry,
  getVersion,
  moveEntries,
  renameEntry,
} from './src/version-catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, 'data');
const exampleRoot = path.resolve(__dirname, 'data-example');
const catalogPath = path.join(dataRoot, 'catalog.json');
const execFileAsync = promisify(execFile);

function versionPath(versionId) {
  if (!/^[a-z0-9-]+$/i.test(versionId)) throw new Error('非法版本 ID');
  return path.join(dataRoot, 'versions', `${versionId}.json`);
}

async function readJson(file) {
  return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporary, file);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function removeVersionFile(file) {
  try {
    await execFileAsync('trash', [file]);
  } catch {
    await fs.promises.rm(file, { force: true });
  }
}

function resumeSourceSyncPlugin() {
  return {
    name: 'resume-source-sync',
    // JSON 编辑器已经通过 onChange 重绘预览；它随后写回源文件时不能再触发
    // Vite 整页 HMR，否则会销毁编辑器、光标和打开状态。
    handleHotUpdate({ file }) {
      if (path.resolve(file).startsWith(dataRoot)) return [];
      return undefined;
    },
    configureServer(server) {
      server.middlewares.use('/__resume_versions', async (req, res, next) => {
        const parts = req.url.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
        const send = (status, value) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
        try {
          const catalog = await readJson(catalogPath);
          if (req.method === 'GET' && parts.length === 0) {
            send(200, catalog);
            return;
          }
          if (req.method === 'POST' && parts.length === 0) {
            const { name, parentId = null, copyFromVersionId = null } = await readRequestJson(req);
            const normalizedName = String(name || '').trim();
            if (!normalizedName) throw new Error('版本名称不能为空');
            if (parentId !== null) getVersion(catalog, parentId);
            const source = copyFromVersionId === null ? null : getVersion(catalog, copyFromVersionId);
            const versionId = createVersionId();
            const now = new Date().toISOString();
            const version = { id: versionId, name: normalizedName, parentId, file: `versions/${versionId}.json`, createdAt: now, updatedAt: now };
            const data = source ? await readJson(versionPath(source.id)) : EMPTY_RESUME;
            await writeJsonAtomic(versionPath(versionId), data);
            const nextCatalog = { ...catalog, versions: [...catalog.versions, version] };
            await writeJsonAtomic(catalogPath, nextCatalog);
            send(201, { versionId, data, catalog: nextCatalog });
            return;
          }
          if (parts.length === 1 && parts[0] === 'active' && req.method === 'PUT') {
            const { versionId } = await readRequestJson(req);
            getVersion(catalog, versionId);
            const nextCatalog = { ...catalog, activeVersionId: versionId };
            await writeJsonAtomic(catalogPath, nextCatalog);
            send(200, nextCatalog);
            return;
          }
          if (parts.length === 2 && parts[1] === 'move' && req.method === 'POST') {
            const { targetId, placement } = await readRequestJson(req);
            const nextCatalog = moveEntries(catalog, parts[0], targetId, placement);
            await writeJsonAtomic(catalogPath, nextCatalog);
            send(200, nextCatalog);
            return;
          }
          if (parts.length === 1) {
            const version = getVersion(catalog, parts[0]);
            const file = versionPath(version.id);
            if (req.method === 'GET') { send(200, await readJson(file)); return; }
            if (req.method === 'PUT') {
              const value = await readRequestJson(req);
              if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('简历数据顶层必须是 JSON 对象');
              await writeJsonAtomic(file, value);
              const now = new Date().toISOString();
              const nextCatalog = { ...catalog, versions: catalog.versions.map(item => item.id === version.id ? { ...item, updatedAt: now } : item) };
              await writeJsonAtomic(catalogPath, nextCatalog);
              send(200, { ok: true });
              return;
            }
            if (req.method === 'PATCH') {
              const { name } = await readRequestJson(req);
              const normalizedName = String(name || '').trim();
              if (!normalizedName) throw new Error('版本名称不能为空');
              const nextCatalog = renameEntry(catalog, version.id, normalizedName);
              await writeJsonAtomic(catalogPath, nextCatalog);
              send(200, nextCatalog);
              return;
            }
            if (req.method === 'DELETE') {
              const nextCatalog = deleteEntry(catalog, version.id);
              await writeJsonAtomic(catalogPath, nextCatalog);
              await removeVersionFile(file);
              send(200, nextCatalog);
              return;
            }
          }
          next();
        } catch (error) { send(400, { error: error.message }); }
      });
    },
  };
}

const tauriHost = process.env.TAURI_DEV_HOST;
const runningInTauri = Boolean(tauriHost) || process.env.TAURI_ENV_PLATFORM != null;
// 桌面 WebView 固定走 IPv4，避免 Windows 上 localhost → ::1 导致 HMR WebSocket 连不上。
const tauriDevHost = tauriHost || (runningInTauri ? '127.0.0.1' : false);

export default defineConfig({
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [
    resumeSourceSyncPlugin(),
    // singlefile 会把 base 改成 ./ ，开发时会打断 Vite HMR；只在生产打包时启用。
    {
      ...viteSingleFile(),
      apply: 'build',
    },
    {
      name: 'inject-resume-theme',
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          if (!ctx.filename.endsWith('index.html')) return html;
          try {
            const sourceRoot = ctx.server ? dataRoot : exampleRoot;
            const sourceCatalogPath = path.join(sourceRoot, 'catalog.json');
            const catalog = JSON.parse(fs.readFileSync(sourceCatalogPath, 'utf-8'));
            const activePath = path.join(sourceRoot, 'versions', `${catalog.activeVersionId}.json`);
            const theme = JSON.parse(fs.readFileSync(activePath, 'utf-8')).theme;
            if (theme && typeof theme === 'string') {
              return html.replace('<html lang="zh-hans">', `<html lang="zh-hans" data-theme="${theme}">`);
            }
          } catch {
            // ignore
          }
          return html;
        },
      },
    },
    {
      name: 'finalize-single-file',
      writeBundle() {
        const distIndex = path.resolve(__dirname, 'dist/index.html');
        const outputDir = path.resolve(__dirname, 'output');
        const target = path.join(outputDir, 'resume.html');
        if (fs.existsSync(distIndex)) {
          const notices = buildThirdPartyNotices();
          if (notices.includes('-->')) throw new Error('Third-party notices contain an unsafe HTML comment terminator');
          const html = fs.readFileSync(distIndex, 'utf8');
          const output = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!--\n${notices}\n-->`);
          fs.writeFileSync(distIndex, output, 'utf8');
          fs.mkdirSync(outputDir, { recursive: true });
          fs.writeFileSync(target, output, 'utf8');
          console.log('✓ copied dist/index.html → output/resume.html');
        }
      },
    },
  ],
  server: {
    port: 60090,
    strictPort: runningInTauri,
    host: tauriDevHost,
    hmr: runningInTauri
      ? {
          protocol: 'ws',
          host: tauriHost || '127.0.0.1',
          port: tauriHost ? 60091 : 60090,
          overlay: true,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'esnext',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
