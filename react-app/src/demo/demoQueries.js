// Shared query building blocks: JavaScript equivalents of the SQL fragments reused by the
// original backend routes (normalized payment dates, yearly activity, joined item rows).
import { sqlCompare, sqlNumber, sqlSum, sqlText } from './demoDatabase.js';

const pad = value => String(value).padStart(2, '0');

export const asciiUpper = text => text.replace(/[a-z]/g, char => char.toUpperCase());
export const asciiLower = text => text.replace(/[A-Z]/g, char => char.toLowerCase());
export const sqlTrim = text => text.replace(/^ +| +$/g, '');
export const upperOf = value => (value === null || value === undefined ? null : asciiUpper(sqlText(value)));

export const keyOf = (...values) => JSON.stringify(values.map(value => (value === undefined ? null : value)));

// `x IN (?, ?, ...)` with bound JavaScript numbers (NaN binds as NULL and never matches).
export const inList = (value, list) => list.some(entry => !Number.isNaN(entry) && entry === value);

export const byIdAsc = (a, b) => sqlCompare(a.id, b.id);
export const byIdDesc = (a, b) => sqlCompare(b.id, a.id);

// Legacy payments stored local-midnight timestamps in a TEXT column.
export function normalizePaymentDate(value) {
  if (value === null || value === undefined) return null;
  const text = sqlText(value);
  if (text.length === 13 && /^[0-9]+$/.test(text)) {
    const date = new Date(Number(text));
    return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(text)) return text.slice(0, 10);
  return value;
}

export function normalizedPayments(db) {
  return [...db.rows('payments')].sort(byIdAsc).map(payment => ({
    id: payment.id,
    payer_customer_id: payment.payer_customer_id,
    payment_date: normalizePaymentDate(payment.payment_date),
    amount: payment.amount,
    payment_method: payment.payment_method,
    notes: payment.notes
  }));
}

// Year and month extracted by strftime() from a normalized `YYYY-MM-DD` date.
export function sqlDateParts(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export const strftimeYear = value => {
  const parts = sqlDateParts(value);
  return parts ? String(parts.year).padStart(4, '0') : null;
};

const product = (a, b) => {
  const left = sqlNumber(a);
  const right = sqlNumber(b);
  return left === null || right === null ? null : left * right;
};

export const itemAmount = item => product(item.quantity, item.price);

export function confirmedPeriods(db) {
  return new Set(db.rows('transactions')
    .filter(transaction => transaction.status === 1)
    .map(transaction => keyOf(transaction.category, transaction.year, transaction.month)));
}

export const isConfirmedItem = (item, confirmed) => confirmed.has(keyOf(item.category, item.year, item.month));

export const servicesById = db => new Map(db.rows('services').map(service => [service.id, service]));
export const customersById = db => new Map(db.rows('customers').map(customer => [customer.id, customer]));

// Balances are derived from the ledger, never from a previously cached balance.
export function yearlyActivity(db) {
  const services = servicesById(db);
  const confirmed = confirmedPeriods(db);
  const activity = [];
  for (const item of [...db.rows('items')].sort(byIdAsc)) {
    const service = services.get(item.service_id);
    if (!service || !isConfirmedItem(item, confirmed)) continue;
    const category = upperOf(service.category);
    const amount = itemAmount(item);
    activity.push({
      customer_id: item.customer_id,
      year: item.year,
      contabilita: category === 'CONTABILITA' ? amount : 0,
      redditi: category === 'REDDITI' ? amount : 0,
      paghe: category === 'PAGHE' ? amount : 0,
      varie: category === 'VARIE' ? amount : 0,
      incassi: 0,
      tot_discount: 0
    });
  }
  for (const payment of normalizedPayments(db)) {
    const parts = sqlDateParts(payment.payment_date);
    if (payment.payer_customer_id === null || !parts) continue;
    const method = payment.payment_method === null ? null : asciiUpper(sqlTrim(sqlText(payment.payment_method)));
    activity.push({
      customer_id: payment.payer_customer_id,
      year: parts.year,
      contabilita: 0, redditi: 0, paghe: 0, varie: 0,
      incassi: method !== null && method !== 'SCONTO' ? payment.amount : 0,
      tot_discount: method === 'SCONTO' ? payment.amount : 0
    });
  }

  const groups = new Map();
  for (const row of activity) {
    const key = keyOf(row.customer_id, row.year);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const fields = ['contabilita', 'redditi', 'paghe', 'varie', 'incassi', 'tot_discount'];
  return [...groups.values()]
    .map(rows => ({
      customer_id: rows[0].customer_id,
      year: rows[0].year,
      ...Object.fromEntries(fields.map(field => [field, sqlSum(rows.map(row => row[field] ?? 0))]))
    }))
    .sort((a, b) => sqlCompare(a.customer_id, b.customer_id) || sqlCompare(a.year, b.year));
}

export const activityBalance = row =>
  row.incassi + row.tot_discount - row.contabilita - row.redditi - row.paghe - row.varie;

// SELECT i.*, s.subcategory, c.name AS customer_name ... LEFT JOIN services/customers.
export function joinedItems(db, filter = () => true) {
  const services = servicesById(db);
  const customers = customersById(db);
  return db.rows('items').filter(filter).map(item => {
    const service = services.get(item.service_id);
    const customer = customers.get(item.customer_id);
    return { ...item, subcategory: service ? service.subcategory : null, customer_name: customer ? customer.name : null };
  });
}

export const likeContains = term => `%${term}%`;
