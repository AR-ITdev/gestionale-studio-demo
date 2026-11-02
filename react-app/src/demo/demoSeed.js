// Deterministic generator of the fictional demo archive: two years and a few months of
// periods, charges, payments and petty-cash movements, ending with the current month.
import { DemoDatabase } from './demoDatabase.js';
import { CASH_EXPENSES, DEMO_CUSTOMERS, MONTH_NAMES, SERVICE_CATALOGUE } from './demoSeedData.js';
import { syncBalances } from './demoRoutesFinance.js';

export const SEED_VERSION = 1;

const SCHEDULE = {
  PAGHE: () => true,
  CONTABILITA: () => true,
  REDDITI: month => [3, 5, 6, 7, 9, 11].includes(month),
  VARIE: month => [1, 2, 4, 6, 8, 10, 12].includes(month)
};
const CEDOLINI = ['Cedolini Ordinari', 'Cedolini Apprendisti', 'Cedolini Collaboratori', 'Cedolini Colf e badanti'];
const COMPANY_KINDS = ['srl', 'snc', 'sas', 'ditta'];
const VARIE_EXTRAS = {
  company: ['Visura camerale', 'Pratica SUAP', 'Rinnovo firma digitale', 'Consulenza straordinaria',
    'Invio telematico', 'Registrazione contratto di locazione'],
  private: ['Registrazione contratto di locazione', 'Pratica di successione', 'Consulenza straordinaria',
    'Invio telematico', 'Rinnovo firma digitale']
};
const VARIE_NOTES = {
  'Pratica SUAP': 'SCIA variazione attività',
  'Registrazione contratto di locazione': 'Contratto ad uso abitativo',
  'Consulenza straordinaria': 'Verifica preliminare',
  'Pratica di successione': 'Dichiarazione di successione'
};
const OPENING_CASH = 850;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (value, size = 2) => String(value).padStart(size, '0');
const isoDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
const round2 = value => Math.round(value * 100) / 100;
const roundHalf = value => Math.round(value * 2) / 2;
const monthKey = (year, month) => year * 12 + month - 1;

// Moves a weekend day to the nearest working day in the given direction.
function workingDay(year, month, day, direction = 1) {
  let current = day;
  for (;;) {
    const weekday = new Date(Date.UTC(year, month - 1, current)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return current;
    current += direction;
  }
}

function chargePaghe({ active, month, add, chance }) {
  for (const customer of active) {
    const [ordinari, apprendisti, collaboratori, colf] = customer.staff;
    const total = ordinari + apprendisti + collaboratori + colf;
    if (!total) continue;
    customer.staff.forEach((count, index) => {
      if (!count) return;
      let quantity = count;
      if (chance(0.15)) quantity = Math.max(1, quantity + (chance(0.5) ? 1 : -1));
      if (index === 0 && month === 12) add(customer, CEDOLINI[0], quantity * 2, 'Comprese tredicesime');
      else add(customer, CEDOLINI[index], quantity);
    });
    const employer = ordinari + apprendisti + collaboratori > 0;
    if (employer) add(customer, 'Elaborazione F24');
    if (employer && chance(0.12)) add(customer, 'Comunicazioni UniLav', chance(0.3) ? 2 : 1);
    if (month === 3) add(customer, 'Certificazione Unica', total);
    if (month === 2 && ordinari + apprendisti > 0) add(customer, 'Autoliquidazione INAIL');
    if (month === 10 && employer) add(customer, 'Modello 770');
    if (month === 12 && ordinari + apprendisti >= 3) add(customer, 'Gestione TFR');
  }
}

function chargeContabilita({ active, month, add }) {
  for (const customer of active) {
    if (customer.kind === 'privato') continue;
    add(customer, customer.regime === 'ordinaria' ? 'Contabilità ordinaria' : 'Contabilità semplificata');
    if (customer.kind === 'associazione') continue;
    if (customer.regime === 'ordinaria' || month % 3 === 0) add(customer, 'Liquidazione IVA');
    if (customer.retail) add(customer, 'Registrazione corrispettivi');
    if ([2, 5, 9, 11].includes(month)) add(customer, 'Comunicazione LIPE');
    if (month === 4) add(customer, 'Dichiarazione IVA annuale');
    if (month === 5 && customer.kind === 'srl') add(customer, "Bilancio d'esercizio");
  }
}

function chargeRedditi({ active, month, add }) {
  for (const customer of active) {
    const { kind } = customer;
    if (month === 3 && customer.isee) add(customer, 'ISEE');
    if (month === 5 && kind === 'privato') add(customer, 'Modello 730');
    if (month === 6 && kind === 'ditta') add(customer, 'Redditi Persone Fisiche');
    if ((month === 6 || month === 11) && customer.imu) {
      add(customer, 'Calcolo IMU', 1, month === 6 ? 'Acconto IMU' : 'Saldo IMU');
    }
    if (month === 7 && (kind === 'snc' || kind === 'sas')) {
      add(customer, 'Redditi Società di Persone');
      add(customer, 'Dichiarazione IRAP');
    }
    if (month === 9 && kind === 'srl') {
      add(customer, 'Redditi Società di Capitali');
      add(customer, 'Dichiarazione IRAP');
    }
  }
}

function chargeVarie({ active, month, add, chance, pick, random }) {
  if (month === 6) {
    for (const customer of active) {
      if (COMPANY_KINDS.includes(customer.kind)) add(customer, 'Diritto annuale CCIAA');
    }
    return;
  }
  const count = 2 + Math.floor(random() * 3);
  for (let index = 0; index < count; index++) {
    const customer = pick(active);
    const subcategory = pick(customer.kind === 'privato' ? VARIE_EXTRAS.private : VARIE_EXTRAS.company);
    const quantity = subcategory === 'Visura camerale' && chance(0.3) ? 2 : 1;
    add(customer, subcategory, quantity, VARIE_NOTES[subcategory] || '');
  }
}

const CHARGERS = { PAGHE: chargePaghe, CONTABILITA: chargeContabilita, REDDITI: chargeRedditi, VARIE: chargeVarie };

function customerWindow(profile, firstYear, currentYear) {
  let start = monthKey(firstYear, 1);
  if (profile.since === -1) start = monthKey(currentYear - 1, 4);
  if (profile.since === 0) start = monthKey(currentYear, 1);
  const end = profile.until === -1 ? monthKey(currentYear - 1, 6) : Infinity;
  return { start, end };
}

export function createSeedDatabase(now = new Date()) {
  const random = mulberry32(20240607);
  const chance = probability => random() < probability;
  const pick = list => list[Math.floor(random() * list.length)];
  const between = (min, max) => min + random() * (max - min);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const today = isoDate(currentYear, currentMonth, now.getDate());
  const firstYear = currentYear - 2;
  const periods = [];
  for (let year = firstYear; year <= currentYear; year++) {
    const lastMonth = year === currentYear ? currentMonth : 12;
    for (let month = 1; month <= lastMonth; month++) periods.push({ year, month, key: monthKey(year, month) });
  }
  const draftKey = monthKey(currentYear, currentMonth);

  const db = new DemoDatabase();
  const serviceIds = new Map();
  const basePrices = new Map();
  for (const [category, services] of Object.entries(SERVICE_CATALOGUE)) {
    services.forEach(([subcategory, price, active = true], index) => {
      const { lastID } = db.insert('services', {
        category, subcategory, display_order: index + 1, is_active: active ? 1 : 0
      });
      serviceIds.set(`${category}|${subcategory}`, lastID);
      basePrices.set(lastID, price);
    });
  }

  const customers = DEMO_CUSTOMERS.map((profile, index) => {
    const code = `${profile.kind === 'privato' ? 'CF' : 'PI'}-DEMO-${pad(index + 1, 3)}`;
    const { lastID } = db.insert('customers', {
      customer_code: code, parent_code: profile.group || '', name: profile.name, tax_id: code
    });
    return {
      ...profile,
      ...customerWindow(profile, firstYear, currentYear),
      id: lastID,
      staff: profile.staff || [0, 0, 0, 0],
      regime: profile.regime || (profile.kind === 'privato' || profile.kind === 'srl' ? 'ordinaria' : 'semplificata'),
      factor: 0.9 + random() * 0.3
    };
  });

  // Confirmed charges per customer and month, the basis of the simulated payments.
  const charges = new Map();
  for (const { year, month, key } of periods) {
    const draft = key === draftKey;
    const active = customers.filter(customer => customer.start <= key && key <= customer.end);
    for (const category of Object.keys(SCHEDULE)) {
      if (!SCHEDULE[category](month)) continue;
      db.insert('transactions', { category, year, month, status: draft ? 0 : 1 });
      const used = new Set();
      const add = (customer, subcategory, quantity = 1, note = '') => {
        const serviceId = serviceIds.get(`${category}|${subcategory}`);
        const usage = `${customer.id}|${serviceId}`;
        if (used.has(usage) || quantity <= 0) return;
        used.add(usage);
        const price = roundHalf(basePrices.get(serviceId) * customer.factor * (1 + 0.02 * (year - firstYear)));
        db.insert('items', {
          category, year, month, customer_id: customer.id, service_id: serviceId,
          quantity, price, custom_data: JSON.stringify({ note })
        });
        if (!draft) {
          const chargeKey = `${customer.id}|${key}`;
          charges.set(chargeKey, (charges.get(chargeKey) || 0) + quantity * price);
        }
      };
      if (active.length) CHARGERS[category]({ active, month, add, chance, pick, random });
    }
  }

  const payments = [];
  for (const customer of customers) {
    const [method, cadence, ratio] = customer.pay;
    let pending = 0;
    for (const { year, month, key } of periods) {
      pending = round2(pending + (charges.get(`${customer.id}|${key}`) || 0));
      const due = (key - monthKey(firstYear, 1) + 1) % cadence === 0;
      if (key === draftKey || key > customer.end + 1 || !due || pending < 1) continue;
      const payYear = month === 12 ? year + 1 : year;
      const payMonth = month === 12 ? 1 : month + 1;
      const date = isoDate(payYear, payMonth, workingDay(payYear, payMonth, 5 + Math.floor(random() * 18)));
      if (date > today) continue;
      const discount = chance(0.05) ? round2(pending * 0.05) : 0;
      const paidWith = method === 'MISTO' ? (chance(0.5) ? 'CONTANTI' : 'ELETTRONICO') : method;
      const share = (pending - discount) * ratio;
      const amount = paidWith === 'CONTANTI' && ratio < 1 ? Math.floor(share) : round2(share);
      if (amount <= 0) continue;
      const label = `${MONTH_NAMES[month - 1]} ${year}`;
      payments.push({
        payer_customer_id: customer.id, payment_date: date, amount, payment_method: paidWith,
        notes: `${ratio >= 1 ? 'Saldo' : 'Acconto'} competenze ${label}`
      });
      if (discount) {
        payments.push({
          payer_customer_id: customer.id, payment_date: date, amount: discount,
          payment_method: 'SCONTO', notes: 'Sconto concordato'
        });
      }
      pending = round2(pending - amount - discount);
    }
  }
  payments.sort((a, b) => a.payment_date.localeCompare(b.payment_date) || a.payer_customer_id - b.payer_customer_id);
  for (const payment of payments) db.insert('payments', payment);

  const cashIncome = new Map();
  for (const payment of payments) {
    if (payment.payment_method !== 'CONTANTI') continue;
    const [year, month] = payment.payment_date.split('-').map(Number);
    const key = monthKey(year, month);
    cashIncome.set(key, round2((cashIncome.get(key) || 0) + payment.amount));
  }

  // Year-end carry-overs follow the same rule as the "Chiusura anno" button in CassaPage.
  const movements = [{
    movement_date: isoDate(firstYear, 1, 1), type: 'SALDO INIZIALE', amount: OPENING_CASH, notes: 'Saldo iniziale cassa'
  }];
  let balance = OPENING_CASH;
  for (const { year, month, key } of periods) {
    if (month === 1 && year > firstYear) {
      movements.push({
        movement_date: isoDate(year, 1, 1), type: 'SALDO INIZIALE', amount: balance,
        notes: `Riporto saldo cassa anno precedente (${year - 1})`
      });
    }
    const monthly = [];
    const expenses = 1 + Math.floor(random() * 3);
    for (let index = 0; index < expenses; index++) {
      const [label, min, max] = pick(CASH_EXPENSES);
      const day = workingDay(year, month, 2 + Math.floor(random() * 24));
      monthly.push({ movement_date: isoDate(year, month, day), type: 'USCITA', amount: roundHalf(between(min, max)), notes: label });
    }
    if (chance(0.25)) {
      const day = workingDay(year, month, 2 + Math.floor(random() * 24));
      monthly.push({
        movement_date: isoDate(year, month, day), type: 'ENTRATA',
        amount: roundHalf(between(20, 80)), notes: 'Rimborso spese anticipate'
      });
    }
    for (const movement of monthly) {
      if (movement.movement_date > today) continue;
      movements.push(movement);
      balance = round2(balance + (movement.type === 'USCITA' ? -movement.amount : movement.amount));
    }
    balance = round2(balance + (cashIncome.get(key) || 0));
    const depositDate = isoDate(year, month, workingDay(year, month, 28, -1));
    if (balance > 1500 && depositDate <= today) {
      const amount = Math.floor((balance - 500) / 100) * 100;
      movements.push({ movement_date: depositDate, type: 'VERSAMENTO', amount, notes: 'Versamento in banca' });
      balance = round2(balance - amount);
    }
  }
  movements.sort((a, b) => a.movement_date.localeCompare(b.movement_date));
  for (const movement of movements) db.insert('cash_movements', movement);

  const sync = syncBalances({ db });
  if (sync.status !== 200) throw new Error(`Seed demo non valido: ${sync.body?.error || 'errore sconosciuto'}`);
  return db;
}
