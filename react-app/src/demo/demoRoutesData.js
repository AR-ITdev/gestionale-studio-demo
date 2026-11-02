// Ports of backend/routes/batch.js, customers.js, items.js, transactions.js and the
// universal table handler of system.js.
import { CATEGORIES, SCHEMA, applyAffinity, sqlCompare, sqlError, sqlLike, sqlText } from './demoDatabase.js';
import { byIdAsc, byIdDesc, joinedItems, likeContains } from './demoQueries.js';

const ok = (body, status = 200) => ({ status, body });
const fail = (status, error) => ({ status, body: { error } });
const idMatcher = id => {
  const wanted = applyAffinity(id, 'INTEGER');
  return row => wanted !== null && row.id === wanted;
};

const BATCH_COLUMNS = {
  customers: ['customer_code', 'parent_code', 'name', 'tax_id'],
  services: ['category', 'subcategory', 'display_order', 'is_active'],
  items: ['category', 'year', 'month', 'customer_id', 'service_id', 'quantity', 'price', 'custom_data'],
  payments: ['payer_customer_id', 'payment_date', 'amount', 'payment_method', 'notes']
};

export function batch({ db, body }) {
  try {
    const operations = body.operations;
    if (!Array.isArray(operations)) throw new Error('Elenco operazioni mancante.');
    const period = body.period;
    if (period && (!CATEGORIES.includes(period.category) ||
      !Number.isInteger(period.year) || !Number.isInteger(period.month))) {
      throw new Error('Periodo di lettura non valido.');
    }
    for (const operation of operations) {
      if (!operation || !Object.hasOwn(BATCH_COLUMNS, operation.table) ||
        !['POST', 'PUT', 'DELETE'].includes(operation.method)) {
        throw new Error('Operazione di salvataggio non valida.');
      }
      if (operation.method !== 'POST' && !Number.isInteger(operation.id)) {
        throw new Error('Identificativo operazione non valido.');
      }
      if (operation.method !== 'DELETE' && (!operation.data ||
        !Object.keys(operation.data).length ||
        Object.keys(operation.data).some(key => !BATCH_COLUMNS[operation.table].includes(key)))) {
        throw new Error('Campi di salvataggio non validi.');
      }
      if (operation.serviceRef !== undefined && (operation.table !== 'items' || operation.method === 'DELETE')) {
        throw new Error('Riferimento servizio non valido.');
      }
    }
    const saved = db.transaction(() => {
      const results = [];
      const references = new Map();
      for (const operation of operations) {
        const { table, method, id } = operation;
        const data = { ...operation.data };
        // Newly created VARIE services can be referenced within the same commit.
        if (operation.serviceRef !== undefined) {
          if (!references.has(operation.serviceRef)) throw new Error('Servizio non trovato nel salvataggio.');
          data.service_id = references.get(operation.serviceRef);
        }
        let result;
        if (method === 'POST') {
          const inserted = db.insert(table, data);
          result = { id: inserted.lastID, changes: inserted.changes };
        } else if (method === 'PUT') {
          result = { id, changes: db.update(table, data, row => row.id === id).changes };
        } else {
          result = { id, changes: db.delete(table, row => row.id === id).changes };
        }
        if (operation.ref !== undefined) {
          if (table !== 'services' || method !== 'POST' || references.has(operation.ref)) {
            throw new Error('Riferimento servizio non valido.');
          }
          references.set(operation.ref, result.id);
        }
        results.push(result);
      }
      const rows = period
        ? joinedItems(db, item => item.category === period.category && item.year === period.year && item.month === period.month)
          .sort(byIdDesc)
        : undefined;
      const services = period?.category === 'VARIE' ? [...db.rows('services')].sort(byIdDesc) : undefined;
      const customers = body.readCustomers ? [...db.rows('customers')].sort(byIdDesc) : undefined;
      return { results, rows, services, customers };
    });
    return ok({ success: true, ...saved });
  } catch (error) {
    console.debug('Errore salvataggio multiplo:', error);
    return fail(400, error.message);
  }
}

export function searchGroupedCustomers({ db, query }) {
  const q = String(query.q || '').trim();
  const searchTerm = `%${q.toLowerCase()}%`;
  const all = [...db.rows('customers')].sort(byIdAsc);
  const matchesMember = c => sqlLike(c.name, searchTerm) || sqlLike(c.customer_code, searchTerm) || sqlLike(c.tax_id, searchTerm);

  const customers = all
    .filter(c => !q || matchesMember(c) || sqlLike(c.parent_code, searchTerm))
    .slice(0, 50)
    .map(({ id, customer_code, parent_code, name, tax_id }) => ({ id, customer_code, parent_code, name, tax_id }));

  const groups = new Map();
  for (const customer of all) {
    if (customer.parent_code === null || sqlText(customer.parent_code) === '') continue;
    if (!groups.has(customer.parent_code)) groups.set(customer.parent_code, []);
    groups.get(customer.parent_code).push(customer);
  }
  const parents = [...groups.entries()]
    .filter(([parentCode, members]) => !q || sqlLike(parentCode, searchTerm) || members.some(matchesMember))
    .map(([parent_code, members]) => ({ parent_code, children_count: members.length }))
    .sort((a, b) => sqlCompare(a.parent_code, b.parent_code))
    .slice(0, 50);

  return ok({ parents, customers });
}

export function listItems({ db, query }) {
  try {
    const { category, year, month, q } = query;
    const wantedYear = applyAffinity(Number(year), 'INTEGER');
    const wantedMonth = applyAffinity(Number(month), 'INTEGER');
    const rows = joinedItems(db).filter(row => {
      if (category && row.category !== category) return false;
      if (year && month && (row.year !== wantedYear || row.month !== wantedMonth)) return false;
      if (q && !sqlLike(row.customer_name, likeContains(q)) && !sqlLike(row.subcategory, likeContains(q))) return false;
      return true;
    });
    return ok(rows.sort(byIdDesc));
  } catch (err) {
    return fail(500, err.message);
  }
}

export function createItem({ db, body }) {
  try {
    const { category = 'PAGHE', year, month, customer_id, service_id, quantity = 1, price = 0, custom_data } = body;
    const customDataStr = typeof custom_data === 'object' && custom_data !== null
      ? JSON.stringify(custom_data)
      : (custom_data || '');
    const result = db.insert('items', {
      category, year, month, customer_id, service_id, quantity, price, custom_data: customDataStr
    });
    return ok({ id: result.lastID, ...body }, 201);
  } catch (err) {
    console.debug("Errore durante l'inserimento item:", err);
    return fail(400, err.message);
  }
}

export function updateItem({ db, params, body }) {
  try {
    const updates = { ...body };
    if (updates.custom_data && typeof updates.custom_data === 'object') {
      updates.custom_data = JSON.stringify(updates.custom_data);
    }
    if (Object.keys(updates).length === 0) return ok({ success: true });
    db.update('items', updates, idMatcher(params.id));
    return ok({ success: true });
  } catch (err) {
    return fail(500, err.message);
  }
}

export function deleteItem({ db, params }) {
  try {
    db.delete('items', idMatcher(params.id));
    return ok({ success: true });
  } catch (err) {
    return fail(500, err.message);
  }
}
