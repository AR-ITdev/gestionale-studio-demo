// Ports of backend/routes/payments.js, cassa.js, balances.js, reports.js and the
// backup/restore endpoints (JSON snapshots instead of SQLite files).
import { DemoDatabase, SCHEMA, TABLE_NAMES, applyAffinity, sqlCompare, sqlLike, sqlSum } from './demoDatabase.js';
import {
  activityBalance, byIdAsc, byIdDesc, customersById, inList, likeContains, normalizedPayments,
  sqlDateParts, sqlTrim, upperOf, yearlyActivity
} from './demoQueries.js';

const ok = (body, status = 200) => ({ status, body });
const fail = (status, error) => ({ status, body: { error } });

export const BACKUP_APP_ID = 'gestionale-studio-demo';

export function listPayments({ db, query }) {
  try {
    const { year, customer_id, q } = query;
    const customers = customersById(db);
    const wantedCustomer = applyAffinity(Number(customer_id), 'INTEGER');
    const rows = normalizedPayments(db).map(payment => {
      const customer = customers.get(payment.payer_customer_id);
      return {
        ...payment,
        customer_name: customer ? customer.name : null,
        customer_code: customer ? customer.customer_code : null,
        parent_code: customer ? customer.parent_code : null,
        tax_id: customer ? customer.tax_id : null
      };
    }).filter(row => {
      if (year && String(year).toLowerCase() !== 'all' && !sqlLike(row.payment_date, `${year}%`)) return false;
      if (customer_id && (wantedCustomer === null || row.payer_customer_id !== wantedCustomer)) return false;
      if (q && ![row.customer_name, row.customer_code, row.parent_code, row.notes]
        .some(value => sqlLike(value, likeContains(q)))) return false;
      return true;
    });
    return ok(rows.sort(byIdDesc));
  } catch (err) {
    return fail(500, err.message);
  }
}

const CASH_DESCRIPTIONS = {
  'SALDO INIZIALE': 'Saldo Iniziale di Cassa',
  ENTRATA: 'Entrata di Cassa',
  USCITA: 'Uscita di Cassa',
  VERSAMENTO: 'Versamento in Banca'
};

export function getCassa({ db, query }) {
  try {
    const { year, month } = query;
    const customers = customersById(db);
    const cashPayments = normalizedPayments(db)
      .filter(payment => payment.payment_method === 'CONTANTI')
      .flatMap(payment => {
        const customer = customers.get(payment.payer_customer_id);
        if (!customer) return [];
        return [{
          unique_id: `PAYMENT_${payment.id}`, date: payment.payment_date,
          description: payment.notes ?? 'Incasso Cliente', subject: customer.name, category: 'INCASSO',
          type: 'IN', amount: payment.amount, payment_method: payment.payment_method
        }];
      });
    const movements = [...db.rows('cash_movements')].sort(byIdAsc).map(movement => {
      const kind = movement.type === null ? null : sqlTrim(upperOf(movement.type));
      return {
        unique_id: `CASH_MOV_${movement.id}`, date: movement.movement_date,
        description: movement.notes ?? CASH_DESCRIPTIONS[kind] ?? 'Movimento di Cassa',
        subject: 'Cassa Generale', category: movement.type, type: kind === 'ENTRATA' ? 'IN' : 'OUT',
        amount: movement.amount, payment_method: 'CONTANTI'
      };
    });
    let rows = [...cashPayments, ...movements];
    if (year) {
      const prefix = month ? `${year}-${String(month).padStart(2, '0')}%` : `${year}%`;
      rows = rows.filter(row => sqlLike(row.date, prefix));
    }
    rows.sort((a, b) => sqlCompare(a.date, b.date) || sqlCompare(a.unique_id, b.unique_id));
    return ok(rows);
  } catch (err) {
    return fail(500, err.message);
  }
}

export function syncBalances({ db }) {
  try {
    const result = db.transaction(() => {
      const candidates = [
        ...db.rows('items').map(item => item.year),
        ...normalizedPayments(db).map(payment => sqlDateParts(payment.payment_date)?.year ?? null),
        ...db.rows('customer_yearly_balances').map(balance => balance.year)
      ].filter(year => year !== null);
      const targetYears = [...new Set(candidates)].sort((a, b) => sqlCompare(b, a)).slice(0, 3);
      if (!targetYears.length) {
        return { success: true, message: 'Nessun anno trovato nel database da sincronizzare.', processedYears: [] };
      }

      db.delete('customer_yearly_balances', row => targetYears.includes(row.year));
      const activity = yearlyActivity(db);
      const customerIds = [...new Set(activity.map(row => row.customer_id))].sort(sqlCompare);
      for (const customerId of customerIds) {
        const history = activity.filter(row => row.customer_id === customerId);
        for (const year of [...targetYears].sort(sqlCompare)) {
          if (!history.some(row => sqlCompare(row.year, year) <= 0)) continue;
          const current = history.find(row => row.year === year);
          const figures = {
            contabilita: current?.contabilita ?? 0, redditi: current?.redditi ?? 0,
            paghe: current?.paghe ?? 0, varie: current?.varie ?? 0,
            incassi: current?.incassi ?? 0, tot_discount: current?.tot_discount ?? 0
          };
          const balance = sqlSum(history.filter(row => sqlCompare(row.year, year) <= 0).map(activityBalance));
          if (Object.values(figures).every(value => value === 0) && balance === 0) continue;
          db.insert('customer_yearly_balances', {
            customer_id: customerId, year, ...figures, balance, notes: 'Sincronizzazione automatica'
          });
        }
      }
      return {
        success: true,
        message: `Sincronizzazione e calcolo saldo verticale completati per gli anni: ${targetYears.join(', ')}.`,
        processedYears: targetYears
      };
    });
    return ok(result);
  } catch (error) {
    console.debug('Errore durante la sincronizzazione SQL dei bilanci annuali:', error);
    return { status: 500, body: { success: false, error: error.message } };
  }
}

export function reportGlobal({ db, query, now }) {
  try {
    const { year, customer_id, parent_code } = query;
    const balances = db.rows('customer_yearly_balances');
    let targetYear;
    if (year) {
      targetYear = Number(year);
    } else {
      const maxYear = balances.reduce((max, row) => (max === null || sqlCompare(row.year, max) > 0 ? row.year : max), null);
      targetYear = maxYear ? maxYear : now().getFullYear();
    }

    const wantedId = applyAffinity(Number(customer_id), 'INTEGER');
    const customers = [...db.rows('customers')].sort(byIdAsc).filter(c => {
      if (customer_id) return wantedId !== null && c.id === wantedId;
      if (parent_code) return c.parent_code === parent_code;
      return true;
    });
    if (customers.length === 0) return ok({ analysisYear: targetYear, data: [] });

    const reportMap = {};
    customers.forEach(c => {
      reportMap[c.id] = {
        id: c.id, code: c.customer_code || 'N/D', name: c.name || 'Cliente Sconosciuto',
        year: targetYear, app: targetYear,
        contabilita: 0, redditi: 0, paghe: 0, varie: 0,
        totalDebt: 0, totalDiscount: 0, totalPaid: 0, balance: 0,
        notes: null, lastPaymentDate: null, lastPaymentRaw: 0
      };
    });
    const customerIds = customers.map(c => c.id);

    let selected;
    if (year) {
      const wantedYear = applyAffinity(Number(year), 'INTEGER');
      selected = balances.filter(b => wantedYear !== null && b.year === wantedYear && customerIds.includes(b.customer_id));
    } else {
      const latest = new Map();
      for (const b of balances) {
        if (!customerIds.includes(b.customer_id)) continue;
        const current = latest.get(b.customer_id);
        if (current === undefined || sqlCompare(b.year, current) > 0) latest.set(b.customer_id, b.year);
      }
      selected = balances.filter(b => latest.has(b.customer_id) && b.year === latest.get(b.customer_id));
    }

    selected.forEach(b => {
      const target = reportMap[b.customer_id];
      if (target) {
        const contab = Number(b.contabilita || 0);
        const red = Number(b.redditi || 0);
        const pag = Number(b.paghe || 0);
        const vars = Number(b.varie || 0);
        target.year = Number(b.year);
        target.app = Number(b.year);
        target.contabilita = contab;
        target.redditi = red;
        target.paghe = pag;
        target.varie = vars;
        target.totalDebt = contab + red + pag + vars;
        target.totalDiscount = Number(b.tot_discount || 0);
        target.totalPaid = Number(b.incassi || 0);
        target.balance = Number(b.balance || 0);
        target.notes = b.notes || null;
      }
    });

    const lastDates = new Map();
    for (const payment of normalizedPayments(db)) {
      if (!inList(payment.payer_customer_id, customerIds) || payment.payment_date === null) continue;
      const current = lastDates.get(payment.payer_customer_id);
      if (current === undefined || sqlCompare(payment.payment_date, current) > 0) {
        lastDates.set(payment.payer_customer_id, payment.payment_date);
      }
    }
    lastDates.forEach((lastDate, cid) => {
      const target = reportMap[cid];
      if (target && lastDate) {
        const pDate = new Date(lastDate);
        if (!isNaN(pDate.getTime())) {
          target.lastPaymentRaw = pDate.getTime();
          target.lastPaymentDate = pDate.toLocaleDateString('it-IT');
        }
      }
    });

    return ok({ analysisYear: targetYear, data: Object.values(reportMap) });
  } catch (err) {
    return fail(500, err.message);
  }
}

export function createBackup(db, now) {
  return {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: now().toISOString(),
    ...db.toSnapshot()
  };
}

// Rebuilds a database from a backup, enforcing every constraint of the schema.
export function databaseFromBackup(backup) {
  if (!backup || typeof backup !== 'object' || backup.app !== BACKUP_APP_ID ||
    !backup.tables || typeof backup.tables !== 'object') {
    throw new Error('il file non è un backup valido di questa demo.');
  }
  const restored = new DemoDatabase();
  for (const table of TABLE_NAMES) {
    const rows = backup.tables[table] ?? [];
    if (!Array.isArray(rows)) throw new Error(`tabella ${table} non valida.`);
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`riga non valida in ${table}.`);
      const data = Object.fromEntries(SCHEMA[table].columns
        .filter(col => Object.hasOwn(row, col.name)).map(col => [col.name, row[col.name]]));
      restored.insert(table, data);
    }
    const storedSequence = Number(backup.sequences?.[table]);
    if (Number.isInteger(storedSequence) && storedSequence > restored.sequences[table]) {
      restored.sequences[table] = storedSequence;
    }
  }
  return restored;
}
