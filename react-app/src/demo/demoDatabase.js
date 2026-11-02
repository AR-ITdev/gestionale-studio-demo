// In-memory replica of the original SQLite schema: plain JavaScript tables with the same
// constraints, type affinity, cascades and error messages, so the UI behaves exactly as
// it does against the desktop backend.

export const CATEGORIES = ['PAGHE', 'CONTABILITA', 'REDDITI', 'VARIE'];
export const PAYMENT_METHODS = ['CONTANTI', 'ELETTRONICO', 'SCONTO'];

const categoryCheck = {
  values: CATEGORIES,
  sql: "category IN ('PAGHE', 'CONTABILITA', 'REDDITI', 'VARIE')"
};

const column = (name, affinity, options = {}) => ({ name, affinity, ...options });
const idColumn = () => column('id', 'INTEGER', { primaryKey: true });

export const SCHEMA = {
  customers: {
    columns: [
      idColumn(),
      column('customer_code', 'TEXT', { notNull: true, unique: true }),
      column('parent_code', 'TEXT'),
      column('name', 'TEXT', { notNull: true }),
      column('tax_id', 'TEXT')
    ]
  },
  services: {
    columns: [
      idColumn(),
      column('category', 'TEXT', { notNull: true, check: categoryCheck }),
      column('subcategory', 'TEXT', { notNull: true }),
      column('display_order', 'INTEGER', { notNull: true, defaultValue: 0 }),
      column('is_active', 'NUMERIC', { notNull: true, defaultValue: 1 })
    ]
  },
  transactions: {
    columns: [
      column('category', 'TEXT', { notNull: true, check: categoryCheck }),
      column('year', 'INTEGER', { notNull: true }),
      column('month', 'INTEGER', { notNull: true }),
      column('status', 'NUMERIC', { notNull: true, defaultValue: 0 })
    ],
    uniques: [['category', 'year', 'month']]
  },
  items: {
    columns: [
      idColumn(),
      column('category', 'TEXT', { notNull: true, check: categoryCheck }),
      column('year', 'INTEGER', { notNull: true }),
      column('month', 'INTEGER', { notNull: true }),
      column('customer_id', 'INTEGER', { notNull: true }),
      column('service_id', 'INTEGER', { notNull: true }),
      column('quantity', 'REAL', { notNull: true, defaultValue: 1 }),
      column('price', 'REAL', { notNull: true, defaultValue: 0 }),
      column('custom_data', 'TEXT')
    ],
    foreignKeys: [
      {
        columns: ['category', 'year', 'month'], table: 'transactions',
        references: ['category', 'year', 'month'], onDelete: 'CASCADE', onUpdate: 'CASCADE'
      },
      { columns: ['customer_id'], table: 'customers', references: ['id'], onDelete: 'CASCADE' },
      { columns: ['service_id'], table: 'services', references: ['id'] }
    ]
  },
  customer_yearly_balances: {
    columns: [
      column('customer_id', 'INTEGER', { notNull: true }),
      column('year', 'INTEGER', { notNull: true }),
      column('contabilita', 'REAL', { notNull: true, defaultValue: 0 }),
      column('redditi', 'REAL', { notNull: true, defaultValue: 0 }),
      column('paghe', 'REAL', { notNull: true, defaultValue: 0 }),
      column('varie', 'REAL', { notNull: true, defaultValue: 0 }),
      column('incassi', 'REAL', { notNull: true, defaultValue: 0 }),
      column('tot_discount', 'REAL', { notNull: true, defaultValue: 0 }),
      column('balance', 'REAL', { notNull: true, defaultValue: 0 }),
      column('notes', 'TEXT')
    ],
    uniques: [['customer_id', 'year']],
    foreignKeys: [{ columns: ['customer_id'], table: 'customers', references: ['id'], onDelete: 'CASCADE' }]
  },
  payments: {
    columns: [
      idColumn(),
      column('payer_customer_id', 'INTEGER', { notNull: true }),
      column('payment_date', 'TEXT', { notNull: true }),
      column('amount', 'REAL', { notNull: true }),
      column('payment_method', 'TEXT', {
        notNull: true,
        check: { values: PAYMENT_METHODS, sql: "payment_method IN ('CONTANTI', 'ELETTRONICO', 'SCONTO')" }
      }),
      column('notes', 'TEXT')
    ],
    foreignKeys: [{ columns: ['payer_customer_id'], table: 'customers', references: ['id'], onDelete: 'CASCADE' }]
  },
  cash_movements: {
    columns: [
      idColumn(),
      column('movement_date', 'TEXT', { notNull: true }),
      column('type', 'TEXT', { notNull: true }),
      column('amount', 'REAL', { notNull: true }),
      column('notes', 'TEXT')
    ]
  }
};

export const TABLE_NAMES = Object.keys(SCHEMA);

for (const definition of Object.values(SCHEMA)) {
  definition.columnMap = new Map(definition.columns.map(col => [col.name, col]));
  definition.hasId = definition.columnMap.has('id');
  definition.uniques = [
    ...definition.columns.filter(col => col.unique).map(col => [col.name]),
    ...(definition.uniques || [])
  ];
  definition.foreignKeys = definition.foreignKeys || [];
}

const REFERENCES = TABLE_NAMES.flatMap(child =>
  SCHEMA[child].foreignKeys.map(fk => ({ child, ...fk }))
);

export class DemoSqlError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

const constraintError = message => new DemoSqlError('SQLITE_CONSTRAINT', message);
const mismatchError = () => new DemoSqlError('SQLITE_MISMATCH', 'datatype mismatch');
export const sqlError = message => new DemoSqlError('SQLITE_ERROR', message);

const NUMERIC_TEXT = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

function realToText(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(15)));
}

// SQLite column affinity applied to values bound by node-sqlite3.
export function applyAffinity(value, affinity) {
  if (value === undefined || value === null) return null;
  let bound = value;
  if (typeof bound === 'boolean') bound = bound ? 1 : 0;
  else if (typeof bound === 'bigint') bound = Number(bound);
  else if (typeof bound === 'number') {
    if (Number.isNaN(bound)) return null;
  } else if (typeof bound !== 'string') {
    bound = String(bound);
  }
  if (affinity === 'TEXT') return typeof bound === 'number' ? realToText(bound) : bound;
  if (typeof bound === 'string' && NUMERIC_TEXT.test(bound)) {
    const numeric = Number(bound);
    if (Number.isFinite(numeric)) return numeric;
  }
  return bound;
}

// Numeric value of a stored SQLite value inside arithmetic expressions.
export function sqlNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const match = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(String(value));
  return match ? Number(match[0]) : 0;
}

// SQLite ordering between storage classes: NULL < numbers < text.
export function sqlCompare(a, b) {
  const rank = value => (value === null || value === undefined ? 0 : typeof value === 'number' ? 1 : 2);
  const difference = rank(a) - rank(b);
  if (difference) return difference;
  if (a === null || a === undefined) return 0;
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function sqlText(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? realToText(value) : String(value);
}

const asciiLower = text => text.replace(/[A-Z]/g, char => char.toLowerCase());

// LIKE operator: ASCII case-insensitive with % and _ wildcards; NULL never matches.
export function sqlLike(value, pattern) {
  if (value === null || value === undefined || pattern === null || pattern === undefined) return false;
  const text = asciiLower(sqlText(value));
  const source = asciiLower(String(pattern)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${source}$`, 's').test(text);
}

// SUM() with the compensated summation used by modern SQLite releases.
export function sqlSum(values) {
  let sum = 0;
  let compensation = 0;
  let count = 0;
  for (const raw of values) {
    const value = sqlNumber(raw);
    if (value === null) continue;
    count++;
    const total = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value) ? (sum - total) + value : (value - total) + sum;
    sum = total;
  }
  return count ? sum + compensation : null;
}

const keyOf = values => JSON.stringify(values.map(value => (value === undefined ? null : value)));
const hasNull = values => values.some(value => value === null || value === undefined);

export class DemoDatabase {
  constructor(snapshot) {
    this.tables = {};
    this.sequences = {};
    this.owned = null;
    this.version = 0;
    for (const table of TABLE_NAMES) {
      this.tables[table] = [];
      this.sequences[table] = 0;
    }
    if (snapshot) this.loadTrusted(snapshot);
  }

  loadTrusted(snapshot) {
    for (const table of TABLE_NAMES) {
      const rows = (snapshot.tables?.[table] || []).map(row => ({ ...row }));
      this.tables[table] = rows;
      const maxId = SCHEMA[table].hasId ? rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) : 0;
      this.sequences[table] = Math.max(Number(snapshot.sequences?.[table]) || 0, maxId);
    }
    this.version++;
  }

  toSnapshot() {
    return {
      tables: Object.fromEntries(TABLE_NAMES.map(table => [table, this.tables[table].map(row => ({ ...row }))])),
      sequences: { ...this.sequences }
    };
  }

  definition(table) {
    const definition = SCHEMA[table];
    if (!definition) throw sqlError(`no such table: ${table}`);
    return definition;
  }

  rows(table) {
    this.definition(table);
    return this.tables[table];
  }

  requireColumn(table, name) {
    if (!this.definition(table).columnMap.has(name)) throw sqlError(`no such column: ${name}`);
  }

  // Copy-on-write snapshot: a failed unit of work restores every table untouched.
  transaction(work) {
    const savedTables = { ...this.tables };
    const savedSequences = { ...this.sequences };
    const savedVersion = this.version;
    const outerOwned = this.owned;
    this.owned = new Set();
    try {
      const result = work();
      if (outerOwned) for (const table of this.owned) outerOwned.add(table);
      this.owned = outerOwned;
      return result;
    } catch (error) {
      this.tables = savedTables;
      this.sequences = savedSequences;
      this.version = savedVersion;
      this.owned = outerOwned;
      throw error;
    }
  }

  // Inside a transaction, the first write to a table works on a private copy of its rows.
  writable(table) {
    if (this.owned && !this.owned.has(table)) {
      this.tables[table] = [...this.tables[table]];
      this.owned.add(table);
    }
    return this.tables[table];
  }

  insert(table, data) {
    const definition = this.definition(table);
    for (const key of Object.keys(data)) {
      if (!definition.columnMap.has(key)) throw sqlError(`table ${table} has no column named ${key}`);
    }
    const row = {};
    for (const col of definition.columns) {
      row[col.name] = Object.hasOwn(data, col.name)
        ? applyAffinity(data[col.name], col.affinity)
        : (col.defaultValue ?? null);
    }
    let lastID;
    let explicitId = false;
    if (definition.hasId) {
      if (row.id === null) {
        row.id = this.sequences[table] + 1;
      } else if (!Number.isInteger(row.id)) {
        throw mismatchError();
      } else {
        explicitId = true;
      }
      lastID = row.id;
    } else {
      lastID = this.sequences[table] + 1;
    }
    // Every check runs before the single mutation below, so a failed insert changes nothing.
    this.validateRow(table, row, null);
    this.checkUniques(table, row, this.tables[table], explicitId);
    this.checkParents(table, row);
    this.writable(table).push(row);
    this.sequences[table] = Math.max(this.sequences[table], lastID);
    this.version++;
    return { lastID, changes: 1, row };
  }

  update(table, data, predicate) {
    const definition = this.definition(table);
    const keys = Object.keys(data);
    for (const key of keys) this.requireColumn(table, key);
    return this.transaction(() => {
      const values = Object.fromEntries(keys.map(key =>
        [key, applyAffinity(data[key], definition.columnMap.get(key).affinity)]));
      const idChanged = definition.hasId && Object.hasOwn(values, 'id');
      if (idChanged && !Number.isInteger(values.id)) throw mismatchError();
      const rows = this.tables[table];
      const changed = [];
      const next = rows.map(row => {
        if (!predicate(row)) return row;
        const updated = { ...row, ...values };
        changed.push({ before: row, after: updated });
        return updated;
      });
      if (!changed.length) return { changes: 0 };
      const checksUniques = idChanged || definition.uniques.some(columns => columns.some(name => keys.includes(name)));
      const checksParents = definition.foreignKeys.some(fk => fk.columns.some(name => keys.includes(name)));
      for (const { after } of changed) {
        this.validateRow(table, after, keys);
        if (checksUniques) this.checkUniques(table, after, next, idChanged);
        if (checksParents) this.checkParents(table, after);
      }
      this.tables[table] = next;
      this.owned.add(table);
      this.propagateParentUpdates(table, changed);
      if (idChanged) this.sequences[table] = Math.max(this.sequences[table], values.id);
      this.version++;
      return { changes: changed.length };
    });
  }

  delete(table, predicate) {
    this.definition(table);
    return this.transaction(() => {
      const doomed = this.tables[table].filter(predicate);
      if (!doomed.length) return { changes: 0 };
      const doomedSet = new Set(doomed);
      this.tables[table] = this.tables[table].filter(row => !doomedSet.has(row));
      this.owned.add(table);
      const references = REFERENCES.filter(reference => reference.table === table);
      for (const reference of references.filter(ref => ref.onDelete === 'CASCADE')) {
        const keys = new Set(doomed.map(row => keyOf(reference.references.map(name => row[name]))));
        this.delete(reference.child, child => {
          const values = reference.columns.map(name => child[name]);
          return !hasNull(values) && keys.has(keyOf(values));
        });
      }
      for (const reference of references.filter(ref => ref.onDelete !== 'CASCADE')) {
        this.assertNoChildren(reference, doomed);
      }
      this.version++;
      return { changes: doomed.length };
    });
  }

  validateRow(table, row, changedKeys) {
    const { columns } = SCHEMA[table];
    const relevant = changedKeys ? columns.filter(col => changedKeys.includes(col.name)) : columns;
    for (const col of relevant) {
      if (col.notNull && row[col.name] === null) {
        throw constraintError(`NOT NULL constraint failed: ${table}.${col.name}`);
      }
    }
    for (const col of relevant) {
      if (col.check && row[col.name] !== null && !col.check.values.includes(row[col.name])) {
        throw constraintError(`CHECK constraint failed: ${col.check.sql}`);
      }
    }
  }

  checkUniques(table, row, rows, checkId) {
    const definition = SCHEMA[table];
    if (checkId && rows.some(other => other !== row && other.id === row.id)) {
      throw constraintError(`UNIQUE constraint failed: ${table}.id`);
    }
    for (const columns of definition.uniques) {
      const values = columns.map(name => row[name]);
      if (hasNull(values)) continue;
      const key = keyOf(values);
      if (rows.some(other => other !== row && keyOf(columns.map(name => other[name])) === key)) {
        throw constraintError(`UNIQUE constraint failed: ${columns.map(name => `${table}.${name}`).join(', ')}`);
      }
    }
  }

  checkParents(table, row) {
    for (const fk of SCHEMA[table].foreignKeys) {
      const values = fk.columns.map(name => row[name]);
      if (hasNull(values)) continue;
      const parentColumns = SCHEMA[fk.table].columnMap;
      const wanted = values.map((value, index) =>
        applyAffinity(value, parentColumns.get(fk.references[index]).affinity));
      const exists = this.tables[fk.table].some(parent =>
        fk.references.every((name, index) => parent[name] === wanted[index]));
      if (!exists) throw constraintError('FOREIGN KEY constraint failed');
    }
  }

  assertNoChildren(reference, parents) {
    const keys = new Set(parents.map(row => keyOf(reference.references.map(name => row[name]))));
    const orphan = this.tables[reference.child].some(child => {
      const values = reference.columns.map(name => child[name]);
      return !hasNull(values) && keys.has(keyOf(values));
    });
    if (orphan) throw constraintError('FOREIGN KEY constraint failed');
  }

  propagateParentUpdates(table, changed) {
    for (const reference of REFERENCES.filter(ref => ref.table === table)) {
      const moved = changed.filter(({ before, after }) =>
        keyOf(reference.references.map(name => before[name])) !== keyOf(reference.references.map(name => after[name])));
      if (!moved.length) continue;
      if (reference.onUpdate !== 'CASCADE') {
        this.assertNoChildren(reference, moved.map(({ before }) => before));
        continue;
      }
      for (const { before, after } of moved) {
        const oldKey = keyOf(reference.references.map(name => before[name]));
        const replacement = Object.fromEntries(reference.columns.map((name, index) =>
          [name, after[reference.references[index]]]));
        this.update(reference.child, replacement, child => keyOf(reference.columns.map(name => child[name])) === oldKey);
      }
    }
  }
}
