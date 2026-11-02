// Request dispatcher replicating the Express route order of backend/server.cjs.
// Route failures that the desktop server printed on its terminal are logged with
// console.debug, so handled validation errors do not appear as browser errors.
import { getElaborazioni } from './demoElaborazioni.js';
import {
  batch, createItem, deleteItem, listItems, searchGroupedCustomers, updateItem
} from './demoRoutesData.js';
import {
  createBackup, databaseFromBackup, getCassa, listPayments, reportGlobal, syncBalances
} from './demoRoutesFinance.js';
import {
  createTransaction, deleteTransaction, duplicateTransaction, listTransactions, universal, updateTransaction
} from './demoRoutesTables.js';

function backup({ db, now }) {
  return { status: 200, blob: { text: JSON.stringify(createBackup(db, now), null, 2), type: 'application/json' } };
}

function restore({ db, upload }) {
  if (!upload) return { status: 400, body: { error: 'Nessun file di database caricato.' } };
  try {
    let parsed;
    try {
      parsed = JSON.parse(upload.text);
    } catch {
      throw new Error('il file selezionato non contiene un backup JSON leggibile.');
    }
    const restored = databaseFromBackup(parsed);
    db.loadTrusted(restored.toSnapshot());
    return {
      status: 200,
      body: { success: true, message: 'Backup demo ripristinato con successo! Ricaricamento in corso...' }
    };
  } catch (error) {
    console.debug('Errore ripristino database:', error);
    return { status: 500, body: { error: 'Ripristino non completato: ' + error.message } };
  }
}

const ROUTES = [
  ['POST', 'batch', batch],
  ['GET', 'customers/search-grouped', searchGroupedCustomers],
  ['GET', 'transactions', listTransactions],
  ['POST', 'transactions', createTransaction],
  ['POST', 'transactions/:category/:year/:month/duplicate', duplicateTransaction],
  ['PUT', 'transactions/:category/:year/:month', updateTransaction],
  ['PUT', 'transactions/:year/:month', updateTransaction],
  ['DELETE', 'transactions/:category/:year/:month', deleteTransaction],
  ['DELETE', 'transactions/:year/:month', deleteTransaction],
  ['GET', 'items', listItems],
  ['POST', 'items', createItem],
  ['PUT', 'items/:id', updateItem],
  ['DELETE', 'items/:id', deleteItem],
  ['GET', 'payments', listPayments],
  ['GET', 'cassa', getCassa],
  ['GET', 'elaborazioni', ({ db, query, now }) => getElaborazioni(db, query, now)],
  ['GET', 'reports/global', reportGlobal],
  ['POST', 'customer-yearly-balances/sync', syncBalances],
  ['GET', 'backup-db', backup],
  ['POST', 'restore-db', restore],
  ['ALL', ':table', universal],
  ['ALL', ':table/:id', universal]
].map(([method, pattern, handler]) => ({ method, segments: pattern.split('/'), handler }));

function matchRoute(route, method, segments) {
  if (route.method !== 'ALL' && route.method !== method) return null;
  if (route.segments.length !== segments.length) return null;
  const params = {};
  for (let index = 0; index < segments.length; index++) {
    const expected = route.segments[index];
    if (expected.startsWith(':')) params[expected.slice(1)] = segments[index];
    else if (expected !== segments[index]) return null;
  }
  return params;
}

// Handles one API call against the in-memory database and returns `{ status, body | blob }`.
export function handleDemoRequest(db, { method, path, query = {}, body = {}, upload = null, now = () => new Date() }) {
  const segments = path.split('/').filter(Boolean).map(segment => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  for (const route of ROUTES) {
    const params = matchRoute(route, method, segments);
    if (params) return route.handler({ db, method, params, query, body, upload, now });
  }
  return { status: 404, body: {} };
}
