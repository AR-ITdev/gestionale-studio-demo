// Ports of backend/routes/transactions.js and of the universal `/:table[/:id]` handler.
import { SCHEMA, applyAffinity, sqlCompare, sqlError, sqlLike, sqlText } from './demoDatabase.js';
import { byIdAsc, byIdDesc, joinedItems, likeContains } from './demoQueries.js';

const ok = (body, status = 200) => ({ status, body });
const fail = (status, error) => ({ status, body: { error } });

const transactionMatcher = (category, year, month) => {
  const wanted = [applyAffinity(category, 'TEXT'), applyAffinity(year, 'INTEGER'), applyAffinity(month, 'INTEGER')];
  return row => wanted.every(value => value !== null) &&
    row.category === wanted[0] && row.year === wanted[1] && row.month === wanted[2];
};

export function listTransactions({ db, query }) {
  try {
    const { category, year, status, q } = query;
    const wantedYear = applyAffinity(Number(year), 'INTEGER');
    const statusCode = (status === 'convalidato' || status === '1' || status === 1) ? 1 : 0;
    const rows = db.rows('transactions').filter(row => {
      if (category && row.category !== category) return false;
      if (year && year !== 'all' && (wantedYear === null || row.year !== wantedYear)) return false;
      if (status && status !== 'all' && row.status !== statusCode) return false;
      if (q && !sqlLike(sqlText(row.year), likeContains(q)) && !sqlLike(sqlText(row.month), likeContains(q)) &&
        !sqlLike(row.category, likeContains(q))) return false;
      return true;
    });
    const sorted = rows.map(row => ({ ...row }))
      .sort((a, b) => sqlCompare(b.year, a.year) || sqlCompare(b.month, a.month));
    return ok(sorted);
  } catch (err) {
    return fail(500, err.message);
  }
}

export function createTransaction({ db, body }) {
  try {
    const { category = 'PAGHE', year, month, status = 0 } = body;
    db.insert('transactions', { category, year, month, status });
    return ok({ category, year, month, status }, 201);
  } catch {
    return fail(400, 'Il file per questo settore e mese/anno esiste già o i dati non sono validi.');
  }
}

export function duplicateTransaction({ db, params, body }) {
  try {
    const { category, year: sourceYear, month: sourceMonth } = params;
    const { year: targetYear, month: targetMonth } = body;
    if (!sourceYear || !sourceMonth || !targetYear || !targetMonth) {
      return fail(400, 'Parametri di origine o destinazione mancanti.');
    }
    const newYear = Number(targetYear);
    const newMonth = Number(targetMonth);
    db.transaction(() => {
      db.insert('transactions', { category, year: newYear, month: newMonth, status: 0 });
      const matches = transactionMatcher(category, Number(sourceYear), Number(sourceMonth));
      const sources = [...db.rows('items')].sort(byIdAsc).filter(matches);
      for (const item of sources) {
        db.insert('items', {
          category: item.category, year: newYear, month: newMonth, customer_id: item.customer_id,
          service_id: item.service_id, quantity: item.quantity, price: item.price, custom_data: item.custom_data
        });
      }
    });
    return ok({ category, year: newYear, month: newMonth, status: 0 }, 201);
  } catch (err) {
    console.debug('Errore durante la duplicazione della transazione:', err);
    return fail(400, err.message || 'Impossibile duplicare il file/transazione.');
  }
}

export function updateTransaction({ db, params, body }) {
  try {
    const { category = 'PAGHE', year, month } = params;
    const { status } = body;
    db.update('transactions', { status }, transactionMatcher(category, year, month));
    return ok({ success: true, category, year, month, status });
  } catch (err) {
    return fail(500, err.message);
  }
}

export function deleteTransaction({ db, params }) {
  try {
    const { category = 'PAGHE', year, month } = params;
    db.delete('transactions', transactionMatcher(category, year, month));
    return ok({ success: true, category, year, month });
  } catch (err) {
    return fail(500, err.message);
  }
}

const TABLE_MAP = {
  clienti: 'customers',
  customers: 'customers',
  services: 'services',
  transactions: 'transactions',
  items: 'items',
  payments: 'payments',
  'payment-allocations': 'payment_allocations',
  payment_allocations: 'payment_allocations',
  'cash-movements': 'cash_movements',
  cash_movements: 'cash_movements',
  paghe: 'items',
  contabilita: 'items',
  redditi: 'items',
  varie: 'items'
};

const SEARCH_COLUMNS = {
  customers: ['name', 'customer_code', 'tax_id', 'parent_code'],
  services: ['category', 'subcategory'],
  cash_movements: ['notes', 'type']
};

const CATEGORY_ALIASES = { paghe: 'PAGHE', contabilita: 'CONTABILITA', redditi: 'REDDITI', varie: 'VARIE' };

// SQLite resolves table names case-insensitively.
function resolveTable(name) {
  const mapped = TABLE_MAP[name] || name;
  const lower = mapped.toLowerCase();
  return Object.hasOwn(SCHEMA, lower) ? lower : mapped;
}

function sqlInteger(value) {
  const bound = applyAffinity(value, 'INTEGER');
  if (!Number.isInteger(bound)) throw new DemoMismatch();
  return bound;
}

class DemoMismatch extends Error {
  constructor() {
    super('SQLITE_MISMATCH: datatype mismatch');
  }
}

function universalGet(db, dbTable, implicitCategory, query) {
  const { q: searchQuery, category: categoryQuery, year: yearQuery, month: monthQuery, limit, offset } = query;
  const activeCategory = categoryQuery || implicitCategory;
  let rows;
  if (dbTable === 'items') {
    const wantedYear = applyAffinity(Number(yearQuery), 'INTEGER');
    const wantedMonth = applyAffinity(Number(monthQuery), 'INTEGER');
    rows = joinedItems(db, item => {
      if (activeCategory && item.category !== activeCategory) return false;
      if (yearQuery && (wantedYear === null || item.year !== wantedYear)) return false;
      if (monthQuery && (wantedMonth === null || item.month !== wantedMonth)) return false;
      return true;
    });
  } else {
    db.rows(dbTable);
    rows = db.rows(dbTable).map(row => ({ ...row }));
    if (yearQuery && dbTable === 'cash_movements') {
      const prefix = monthQuery ? `${yearQuery}-${String(monthQuery).padStart(2, '0')}` : `${yearQuery}`;
      rows = rows.filter(row => sqlLike(row.movement_date, `${prefix}%`));
    }
  }
  if (searchQuery) {
    const columns = SEARCH_COLUMNS[dbTable] || [];
    if (columns.length > 0) {
      rows = rows.filter(row => columns.some(column => sqlLike(row[column], likeContains(searchQuery))));
    }
  }
  db.requireColumn(dbTable, 'id');
  rows.sort(byIdDesc);
  if (!limit && offset) throw sqlError('near "OFFSET": syntax error');
  if (limit) {
    const count = sqlInteger(Number(limit));
    const skip = offset ? Math.max(0, sqlInteger(Number(offset))) : 0;
    rows = count < 0 ? rows.slice(skip) : rows.slice(skip, skip + count);
  }
  return rows;
}

export function universal({ db, method, params, query, body }) {
  const { table, id } = params;
  const dbTable = resolveTable(table);
  const implicitCategory = CATEGORY_ALIASES[table.toLowerCase()];
  try {
    if (method === 'GET') {
      try {
        return ok(universalGet(db, dbTable, implicitCategory, query));
      } catch (err) {
        console.debug('Errore query GET:', err);
        return fail(500, err.message);
      }
    }
    if (method === 'POST') {
      if (implicitCategory && !body.category) body.category = implicitCategory;
      if (Object.keys(body).length === 0) return fail(400, 'Corpo della richiesta vuoto.');
      try {
        const result = db.insert(dbTable, body);
        return ok({ id: result.lastID, ...body }, 201);
      } catch (err) {
        console.debug('Errore query POST:', err);
        return fail(500, err.message);
      }
    }
    if (method === 'PUT') {
      if (!id) return fail(400, 'ID mancante nella richiesta PUT.');
      if (Object.keys(body).length === 0) return ok({ success: true });
      try {
        db.rows(dbTable);
        for (const key of Object.keys(body)) db.requireColumn(dbTable, key);
        db.requireColumn(dbTable, 'id');
        const wanted = applyAffinity(id, 'INTEGER');
        db.update(dbTable, body, row => wanted !== null && row.id === wanted);
        return ok({ success: true, id, ...body });
      } catch (err) {
        console.debug('Errore query PUT:', err);
        return fail(500, err.message);
      }
    }
    if (method === 'DELETE') {
      if (!id) return fail(400, 'ID mancante nella richiesta DELETE.');
      try {
        db.requireColumn(dbTable, 'id');
        const wanted = applyAffinity(id, 'INTEGER');
        db.delete(dbTable, row => wanted !== null && row.id === wanted);
        return ok({ success: true, id });
      } catch (err) {
        console.debug('Errore query DELETE:', err);
        return fail(500, err.message);
      }
    }
    return { status: 404, body: {} };
  } catch (err) {
    console.debug('Errore nel gestore universale:', err);
    return fail(500, err.message);
  }
}
