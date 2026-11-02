// Browser-side stand-in for the desktop Express server. Requests addressed to the demo API are
// answered in memory by the ported routes, and the archive is persisted in localStorage.
import { DemoDatabase } from './demoDatabase.js';
import { handleDemoRequest } from './demoServer.js';
import { createSeedDatabase, SEED_VERSION } from './demoSeed.js';

export const DEMO_STORAGE_KEY = 'gestionale-studio-demo:database:v1';

const STORAGE_UNAVAILABLE = 'Il browser non consente di salvare i dati della demo: le modifiche restano valide solo fino alla chiusura della pagina.';
const STORAGE_FULL = 'Spazio di archiviazione del browser esaurito: le ultime modifiche non sono state salvate. Usa "Ripristina demo" per liberare spazio.';

const settings = { storage: undefined, latency: undefined, now: () => new Date() };
const listeners = new Set();
let database = null;
let persistedVersion = -1;
let status = { persistent: true, warning: null };

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const storage = () => (settings.storage === undefined ? defaultStorage() : settings.storage);
const latency = () => settings.latency ?? (typeof window === 'undefined' ? 0 : 80);

function setWarning(warning) {
  if (status.warning === warning) return;
  status = { persistent: !warning, warning };
  for (const listener of listeners) listener(getDemoStatus());
}

function persist() {
  if (database.version === persistedVersion) return;
  const store = storage();
  if (!store) {
    persistedVersion = database.version;
    setWarning(STORAGE_UNAVAILABLE);
    return;
  }
  try {
    store.setItem(DEMO_STORAGE_KEY, JSON.stringify({
      seedVersion: SEED_VERSION,
      savedAt: settings.now().toISOString(),
      snapshot: { tables: database.tables, sequences: database.sequences }
    }));
    persistedVersion = database.version;
    setWarning(null);
  } catch (error) {
    console.warn('Salvataggio della demo nel browser non riuscito:', error);
    setWarning(STORAGE_FULL);
  }
}

function loadStoredDatabase() {
  const store = storage();
  if (!store) return null;
  try {
    const saved = JSON.parse(store.getItem(DEMO_STORAGE_KEY) || 'null');
    if (saved?.seedVersion === SEED_VERSION && saved.snapshot?.tables) return new DemoDatabase(saved.snapshot);
  } catch (error) {
    console.warn('Archivio demo salvato non leggibile: verranno rigenerati i dati dimostrativi.', error);
  }
  return null;
}

function currentDatabase() {
  if (!database) {
    const stored = loadStoredDatabase();
    database = stored || createSeedDatabase(settings.now());
    persistedVersion = stored ? database.version : -1;
    persist();
  }
  return database;
}

// Another tab saved or cleared the archive: reload it on the next request.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', event => {
    if (event.key === DEMO_STORAGE_KEY || event.key === null) database = null;
  });
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createResponse(status, text, type = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': type }),
    async json() {
      if (!text) throw new SyntaxError('Unexpected end of JSON input');
      return JSON.parse(text);
    },
    async text() {
      return text;
    },
    async blob() {
      return new Blob([text], { type });
    }
  };
}

async function readRequest(init) {
  const raw = init.body;
  if (typeof FormData !== 'undefined' && raw instanceof FormData) {
    const file = raw.get('dbFile');
    return { body: {}, upload: file && typeof file.text === 'function' ? { text: await file.text() } : null };
  }
  if (typeof raw === 'string' && raw.trim()) return { body: JSON.parse(raw), upload: null };
  return { body: {}, upload: null };
}

// Drop-in replacement for window.fetch limited to the demo API.
export async function demoFetch(input, init = {}) {
  const signal = init.signal;
  if (signal?.aborted) throw abortError();
  const url = new URL(typeof input === 'string' ? input : input.url, 'http://gestionale.demo');
  const method = String(init.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (key !== '_t' && !Object.hasOwn(query, key)) query[key] = value;
  }

  let result;
  try {
    const { body, upload } = await readRequest(init);
    result = handleDemoRequest(currentDatabase(), { method, path, query, body, upload, now: settings.now });
  } catch (error) {
    result = error instanceof SyntaxError
      ? { status: 400, body: { error: 'Il corpo della richiesta non è un JSON valido.' } }
      : { status: 500, body: { error: error.message } };
  }
  if (database) persist();

  const ms = latency();
  if (ms > 0 || signal) await wait(ms, signal);
  if (result.blob) return createResponse(result.status, result.blob.text, result.blob.type);
  return createResponse(result.status, result.body === undefined ? '' : JSON.stringify(result.body));
}

export function resetDemoData() {
  database = createSeedDatabase(settings.now());
  persistedVersion = -1;
  persist();
  return getDemoStatus();
}

export function getDemoStatus() {
  return { ...status };
}

export function onDemoStatusChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Test hook: swap storage, latency or clock and start again from a fresh in-memory state.
export function configureDemoBackend(options = {}) {
  Object.assign(settings, options);
  database = null;
  persistedVersion = -1;
  status = { persistent: true, warning: null };
}
