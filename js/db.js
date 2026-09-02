// IndexedDB ラッパー。localStorage へのフォールバック付き（録音Blobは保存不可）。
const DB_NAME = 'eigomimi';
const DB_VERSION = 1;

export const STORES = {
  progress: { keyPath: 'itemId' },
  sessions: { keyPath: 'id', autoIncrement: true, indexes: [['date', 'date'], ['itemId', 'itemId']] },
  repCounts: { keyPath: 'key' },           // key = `${date}|${sound}`
  wordReps: { keyPath: 'word' },
  quizLog: { keyPath: 'id', autoIncrement: true, indexes: [['date', 'date'], ['itemId', 'itemId']] },
  weakWords: { keyPath: 'word' },
  recordings: { keyPath: 'id', autoIncrement: true, indexes: [['date', 'date'], ['itemId', 'itemId'], ['word', 'word']] },
  wordAudio: { keyPath: 'key' },           // key = `${word}|${speaker}`
  trackAudio: { keyPath: 'key' },          // key = `${speaker}-${track}`
  settings: { keyPath: 'key' },
};

let dbPromise = null;
let fallback = false;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      fallback = true;
      return resolve(null);
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: def.keyPath, autoIncrement: !!def.autoIncrement });
          (def.indexes || []).forEach(([idx, path]) => store.createIndex(idx, path));
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { fallback = true; console.warn('IndexedDB を開けません。localStorage で動作します。', req.error); resolve(null); };
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbPromise;
}

// ---- localStorage fallback (小さなデータのみ) ----
const LS_PREFIX = 'eigomimi:';
function lsRead(store) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + store) || '[]'); } catch { return []; }
}
function lsWrite(store, arr) {
  localStorage.setItem(LS_PREFIX + store, JSON.stringify(arr));
}
function keyOf(store, obj) { return obj[STORES[store].keyPath]; }

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    try { result = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
}

export class StorageError extends Error {
  constructor(msg, cause) { super(msg); this.name = 'StorageError'; this.cause = cause; }
}

function wrapErr(e) {
  if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || e)))) {
    return new StorageError('保存容量が不足しています。古い録音を削除してください。', e);
  }
  return e instanceof Error ? e : new StorageError(String(e));
}

export async function get(store, key) {
  const db = await openDB();
  if (!db) return lsRead(store).find(o => keyOf(store, o) === key) || null;
  return tx(db, store, 'readonly', s => s.get(key)).then(r => r ?? null);
}

export async function getAll(store) {
  const db = await openDB();
  if (!db) return lsRead(store);
  return tx(db, store, 'readonly', s => s.getAll());
}

export async function getAllByIndex(store, index, value) {
  const db = await openDB();
  if (!db) return lsRead(store).filter(o => o[index] === value);
  return tx(db, store, 'readonly', s => s.index(index).getAll(value));
}

export async function put(store, obj) {
  const db = await openDB();
  try {
    if (!db) {
      if (obj.blob instanceof Blob) throw new StorageError('この環境では録音を保存できません（IndexedDB 利用不可）');
      const arr = lsRead(store);
      const def = STORES[store];
      if (def.autoIncrement && obj.id == null) obj.id = (arr.reduce((m, o) => Math.max(m, o.id || 0), 0) + 1);
      const i = arr.findIndex(o => keyOf(store, o) === keyOf(store, obj));
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      lsWrite(store, arr);
      return keyOf(store, obj);
    }
    return await tx(db, store, 'readwrite', s => s.put(obj));
  } catch (e) { throw wrapErr(e); }
}

export async function del(store, key) {
  const db = await openDB();
  if (!db) { lsWrite(store, lsRead(store).filter(o => keyOf(store, o) !== key)); return; }
  return tx(db, store, 'readwrite', s => s.delete(key));
}

export async function clear(store) {
  const db = await openDB();
  if (!db) { lsWrite(store, []); return; }
  return tx(db, store, 'readwrite', s => s.clear());
}

export async function count(store) {
  const db = await openDB();
  if (!db) return lsRead(store).length;
  return tx(db, store, 'readonly', s => s.count());
}

// ---- settings helpers ----
export async function getSetting(key, def) {
  const r = await get('settings', key);
  return r ? r.value : def;
}
export async function setSetting(key, value) {
  return put('settings', { key, value });
}

// ---- storage estimate ----
export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch { /* ignore */ }
  return { usage: null, quota: null };
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}

export function isFallback() { return fallback; }

// ---- export / import ----
const EXPORT_STORES = ['progress', 'sessions', 'repCounts', 'wordReps', 'quizLog', 'weakWords', 'settings'];

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'audio/webm' });
}

export async function exportAll({ includeRecordings = false } = {}) {
  const out = { app: 'eigomimi', schema: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const s of EXPORT_STORES) out.data[s] = await getAll(s);
  const recs = await getAll('recordings');
  out.data.recordings = [];
  for (const r of recs) {
    const { blob, ...meta } = r;
    if (includeRecordings && blob instanceof Blob) {
      meta.audioBase64 = await blobToBase64(blob);
      meta.mime = blob.type || meta.mime;
    }
    out.data.recordings.push(meta);
  }
  return out;
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new StorageError('JSON の形式が正しくありません');
  if (obj.app !== 'eigomimi') throw new StorageError('このアプリのバックアップファイルではありません');
  if (typeof obj.schema !== 'number' || obj.schema > 1) throw new StorageError('未対応のバックアップ形式（schema ' + obj.schema + '）です');
  if (!obj.data || typeof obj.data !== 'object') throw new StorageError('data が見つかりません');
  for (const s of EXPORT_STORES) {
    if (obj.data[s] != null && !Array.isArray(obj.data[s])) throw new StorageError(`data.${s} が配列ではありません`);
  }
  return true;
}

// mode: 'replace' | 'merge'
export async function importAll(obj, { mode = 'merge' } = {}) {
  validateBackup(obj);
  const stats = {};
  for (const s of EXPORT_STORES) {
    const rows = obj.data[s] || [];
    if (mode === 'replace') await clear(s);
    let n = 0;
    for (const row of rows) {
      if (row == null || typeof row !== 'object') continue;
      if (STORES[s].keyPath !== 'id' && row[STORES[s].keyPath] == null) continue;
      await put(s, row); n++;
    }
    stats[s] = n;
  }
  // recordings: メタのみ、または音声付き
  const recs = obj.data.recordings || [];
  if (mode === 'replace') await clear('recordings');
  let nr = 0;
  for (const r of recs) {
    if (!r || typeof r !== 'object') continue;
    const { audioBase64, ...meta } = r;
    if (audioBase64) {
      try { meta.blob = base64ToBlob(audioBase64, meta.mime); } catch { continue; }
    } else {
      meta.missingAudio = true;
    }
    if (mode === 'merge') delete meta.id; // 衝突回避
    await put('recordings', meta); nr++;
  }
  stats.recordings = nr;
  return stats;
}

export async function wipeAll() {
  for (const s of Object.keys(STORES)) await clear(s);
}
