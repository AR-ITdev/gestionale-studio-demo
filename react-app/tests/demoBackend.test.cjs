// Demo-only behaviour: fictional seed archive, fetch replacement, browser persistence,
// JSON backup/restore and reset.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadDemo, quietly } = require('./loadDemo.cjs');

const NOW = new Date(2026, 4, 20, 10, 30);
const TODAY = '2026-05-20';

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); }
    };
}

function setup(options = {}) {
    const demo = loadDemo(['../utils/cashMovementOrder.js']);
    const storage = options.storage === undefined ? memoryStorage() : options.storage;
    demo.configureDemoBackend({ storage, latency: 0, now: () => NOW, ...options, storage });
    const request = async (url, init = {}) => {
        const response = await demo.demoFetch(`http://gestionale.demo/api${url}`, init);
        const text = await response.text();
        return {
            status: response.status,
            ok: response.ok,
            type: response.headers.get('Content-Type'),
            text,
            body: text && response.headers.get('Content-Type') === 'application/json' ? JSON.parse(text) : undefined
        };
    };
    const json = (method, url, body) => request(url, {
        method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { demo, storage, request, json };
}

const seedCustomerCount = demo => demo.createSeedDatabase(NOW).rows('customers').length;

test('seed archive is fictional, deterministic and coherent with the reference date', () => {
    const demo = loadDemo();
    const first = demo.createSeedDatabase(NOW);
    const serialized = JSON.stringify(first.toSnapshot());
    assert.equal(JSON.stringify(demo.createSeedDatabase(NOW).toSnapshot()), serialized);
    assert.ok(serialized.length < 1.5 * 1024 * 1024, `seed too large: ${serialized.length} bytes`);

    const customers = first.rows('customers');
    assert.ok(customers.length >= 15);
    for (const customer of customers) {
        assert.match(customer.tax_id, /^(CF|PI)-DEMO-\d{3}$/);
        assert.equal(customer.customer_code, customer.tax_id);
    }

    const transactions = first.rows('transactions');
    assert.deepEqual([...new Set(transactions.map(row => row.year))].sort(), [2024, 2025, 2026]);
    for (const row of transactions) {
        const current = row.year === 2026 && row.month === 5;
        assert.equal(row.status, current ? 0 : 1, `${row.category} ${row.month}/${row.year}`);
        assert.ok(row.year < 2026 || row.month <= 5);
    }
    for (const category of ['PAGHE', 'CONTABILITA']) {
        assert.ok(transactions.some(row => row.category === category && row.year === 2026 && row.month === 5));
    }
    for (const category of demo.CATEGORIES) {
        assert.ok(first.rows('items').some(item => item.category === category), `no items for ${category}`);
    }
    assert.ok(first.rows('payments').length > 0);
    assert.ok(first.rows('payments').every(row => row.payment_date <= TODAY));
    assert.ok(first.rows('cash_movements').every(row => row.movement_date <= TODAY));
    const balanceYears = new Set(first.rows('customer_yearly_balances').map(row => row.year));
    for (const year of [2024, 2025, 2026]) assert.ok(balanceYears.has(year), `no balances for ${year}`);
});

test('seed adapts to any reference date, including year boundaries', () => {
    const demo = loadDemo();
    for (const date of [new Date(2027, 0, 3), new Date(2026, 11, 31, 23, 59)]) {
        const db = demo.createSeedDatabase(date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const drafts = db.rows('transactions').filter(row => row.status === 0);
        assert.ok(drafts.length > 0);
        assert.ok(drafts.every(row => row.year === year && row.month === month));
        const today = `${year}-${String(month).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        assert.ok(db.rows('payments').every(row => row.payment_date <= today));
        assert.ok(db.rows('cash_movements').every(row => row.movement_date <= today));
    }
});

test('seeded cash openings match the year-end closing computed by the Cassa page', async () => {
    const { demo, request } = setup();
    for (const year of [2024, 2025]) {
        const movements = (await request(`/cash-movements?year=${year}`)).body;
        const payments = (await request(`/payments?year=${year}`)).body;
        const combined = [
            ...movements.map(row => ({ date: row.movement_date, type: row.type.toUpperCase().trim(), amount: Number(row.amount) })),
            ...payments.filter(row => new Date(row.payment_date).getFullYear() === year && row.payment_method === 'CONTANTI')
                .map(row => ({ date: row.payment_date, type: 'INCASSO', amount: Number(row.amount) }))
        ].sort(demo.compareCashMovements);
        let running = 0;
        for (const item of combined) {
            if (item.type.includes('SALDO') && item.type.includes('INIZIALE')) running = item.amount;
            else if (item.type.includes('USCITA') || item.type.includes('VERSAMENTO')) running -= item.amount;
            else running += item.amount;
        }
        assert.ok(running >= 0, `negative cash at the end of ${year}`);
        const opening = (await request(`/cash-movements?year=${year + 1}`)).body
            .find(row => row.type === 'SALDO INIZIALE' && row.movement_date === `${year + 1}-01-01`);
        assert.ok(opening, `missing opening balance for ${year + 1}`);
        assert.equal(Math.round(opening.amount * 100), Math.round(running * 100));
        assert.equal(opening.notes, `Riporto saldo cassa anno precedente (${year})`);
    }
});

test('every endpoint used by the pages answers on the seeded archive', async () => {
    const { request, json } = setup();
    const urls = [
        '/customers', '/services', '/transactions?category=PAGHE&year=2026', '/transactions?category=VARIE&year=all',
        '/paghe?year=2026&month=4', '/contabilita?year=2025&month=12', '/items?category=REDDITI&year=2025&month=6',
        '/payments?year=2026', '/payments?year=ALL', '/cassa?year=2026&month=4', '/cash-movements?year=2026',
        '/customers/search-grouped?q=demo', '/elaborazioni?year=2025', '/elaborazioni?year=2026&customer_id=1',
        '/reports/global?year=2025', '/clienti?q=Demo', '/varie?year=2026&month=4', '/customers?limit=5&offset=5&_t=1'
    ];
    for (const url of urls) {
        const response = await request(url);
        assert.equal(response.status, 200, `${url}: ${response.text}`);
    }
    assert.equal((await request('/customers?limit=5&offset=5')).body.length, 5);
    const report = (await request('/reports/global?year=2025')).body;
    assert.ok(report.data.length > 0);
    assert.equal((await json('POST', '/customer-yearly-balances/sync')).status, 200);
    assert.equal((await request('/non/esiste/affatto')).status, 404);
});

test('CRUD through demoFetch reproduces server errors and survives a page reload', async () => {
    const { demo, storage, json, request } = setup();
    const created = await json('POST', '/clienti', { customer_code: 'NUOVO-01', name: 'Nuovo Cliente Demo', tax_id: 'PI-DEMO-999' });
    assert.equal(created.status, 201);
    assert.ok(Number.isInteger(created.body.id));
    const duplicate = await quietly(() => json('POST', '/clienti', { customer_code: 'NUOVO-01', name: 'Copia' }));
    assert.equal(duplicate.status, 500);
    assert.match(duplicate.body.error, /UNIQUE constraint failed: customers\.customer_code/);
    const missing = await quietly(() => json('POST', '/clienti', { customer_code: 'NUOVO-02' }));
    assert.equal(missing.status, 500);
    assert.match(missing.body.error, /NOT NULL constraint failed: customers\.name/);
    assert.equal((await json('PUT', `/clienti/${created.body.id}`, { name: 'Cliente Rinominato' })).status, 200);

    demo.configureDemoBackend({ storage });
    const reloaded = (await request('/clienti?q=NUOVO-01')).body;
    assert.deepEqual(reloaded.map(row => row.name), ['Cliente Rinominato']);
    assert.equal((await json('DELETE', `/clienti/${created.body.id}`)).status, 200);
    demo.configureDemoBackend({ storage });
    assert.equal((await request('/clienti?q=NUOVO-01')).body.length, 0);
    assert.equal((await request('/clienti')).body.length, seedCustomerCount(demo));
});

test('batch saves are atomic and leave the stored archive untouched on failure', async () => {
    const { demo, storage, json, request } = setup();
    await request('/clienti');
    const before = storage.getItem(demo.DEMO_STORAGE_KEY);
    const failed = await quietly(() => json('POST', '/batch', {
        operations: [
            { table: 'customers', method: 'POST', data: { customer_code: 'BATCH-1', name: 'Primo' } },
            { table: 'customers', method: 'POST', data: { customer_code: 'BATCH-1', name: 'Secondo' } }
        ],
        readCustomers: true
    }));
    assert.equal(failed.status, 400);
    assert.match(failed.body.error, /UNIQUE constraint failed/);
    assert.equal(storage.getItem(demo.DEMO_STORAGE_KEY), before);
    assert.equal((await request('/clienti?q=BATCH-1')).body.length, 0);

    const saved = await json('POST', '/batch', {
        operations: [
            { table: 'services', method: 'POST', data: { category: 'VARIE', subcategory: 'Servizio batch' }, ref: 'nuovo' },
            { table: 'items', method: 'POST', serviceRef: 'nuovo',
                data: { category: 'VARIE', year: 2026, month: 4, customer_id: 1, quantity: 2, price: 35 } }
        ],
        period: { category: 'VARIE', year: 2026, month: 4 },
        readCustomers: true
    });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.results.length, 2);
    const serviceId = saved.body.results[0].id;
    assert.ok(saved.body.rows.some(row => row.service_id === serviceId && row.price === 35));
    assert.ok(saved.body.services.some(service => service.id === serviceId));
    assert.equal(saved.body.customers.length, seedCustomerCount(demo));
    assert.notEqual(storage.getItem(demo.DEMO_STORAGE_KEY), before);
});

test('periods can be duplicated, validated and deleted with their items', async () => {
    const { json, request } = setup();
    const source = (await request('/paghe?year=2026&month=5')).body;
    assert.ok(source.length > 0);
    const duplicated = await json('POST', '/transactions/PAGHE/2026/5/duplicate', { year: 2026, month: 6 });
    assert.equal(duplicated.status, 201, duplicated.text);
    assert.equal((await request('/paghe?year=2026&month=6')).body.length, source.length);
    const again = await quietly(() => json('POST', '/transactions/PAGHE/2026/5/duplicate', { year: 2026, month: 6 }));
    assert.equal(again.status, 400);
    assert.equal((await request('/paghe?year=2026&month=6')).body.length, source.length);

    assert.equal((await json('PUT', '/transactions/PAGHE/2026/6', { status: 1 })).status, 200);
    const periods = (await request('/transactions?category=PAGHE&year=2026')).body;
    assert.equal(periods.find(row => row.month === 6).status, 1);
    assert.deepEqual(periods.slice(0, 2).map(row => row.month), [6, 5]);

    assert.equal((await json('DELETE', '/transactions/PAGHE/2026/6')).status, 200);
    assert.equal((await request('/paghe?year=2026&month=6')).body.length, 0);
    assert.ok(!(await request('/transactions?category=PAGHE&year=2026')).body.some(row => row.month === 6));
    const conflict = await json('POST', '/transactions', { category: 'PAGHE', year: 2026, month: 5 });
    assert.equal(conflict.status, 400);
});

test('malformed bodies and aborted requests behave like a real network call', async () => {
    const { demo, request } = setup();
    const invalid = await request('/clienti', { method: 'POST', body: '{non valido' });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.error, /JSON valido/);

    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(demo.demoFetch('/api/clienti', { signal: aborted.signal }), { name: 'AbortError' });

    demo.configureDemoBackend({ latency: 40 });
    const pending = new AbortController();
    const call = demo.demoFetch('/api/clienti', { signal: pending.signal });
    setTimeout(() => pending.abort(), 5);
    await assert.rejects(call, { name: 'AbortError' });
    const slow = await demo.demoFetch('/api/services?_t=42');
    assert.equal(slow.status, 200);
    assert.ok((await slow.json()).length > 0);
});

test('storage problems are reported once and cleared when saving works again', async () => {
    let full = true;
    const backing = memoryStorage();
    const flaky = {
        getItem: key => backing.getItem(key),
        setItem: (key, value) => {
            if (full) throw new Error('QuotaExceededError');
            backing.setItem(key, value);
        }
    };
    const { demo, json, request } = setup({ storage: flaky });
    const updates = [];
    const unsubscribe = demo.onDemoStatusChange(state => updates.push(state));
    await quietly(() => request('/clienti'));
    assert.match(demo.getDemoStatus().warning, /esaurito/);
    assert.equal(demo.getDemoStatus().persistent, false);
    await quietly(() => request('/services'));
    assert.equal(updates.length, 1);

    full = false;
    assert.equal((await json('PUT', '/clienti/1', { name: 'Cliente salvato' })).status, 200);
    assert.deepEqual(demo.getDemoStatus(), { persistent: true, warning: null });
    assert.equal(updates.length, 2);
    unsubscribe();
    assert.match(backing.getItem(demo.DEMO_STORAGE_KEY), /Cliente salvato/);

    const offline = setup({ storage: null });
    assert.equal((await offline.request('/clienti')).status, 200);
    assert.match(offline.demo.getDemoStatus().warning, /chiusura della pagina/);
});

test('unreadable or outdated stored archives are replaced by a fresh seed', async () => {
    const outdated = JSON.stringify({ seedVersion: -1, snapshot: { tables: { customers: [] } } });
    for (const stored of ['{non json', outdated]) {
        const { demo, storage, request } = setup();
        storage.setItem(demo.DEMO_STORAGE_KEY, stored);
        const customers = await quietly(() => request('/clienti'));
        assert.equal(customers.body.length, seedCustomerCount(demo));
        assert.equal(JSON.parse(storage.getItem(demo.DEMO_STORAGE_KEY)).seedVersion, demo.SEED_VERSION);
    }
});

test('JSON backups round-trip and invalid files never alter the archive', async () => {
    const { demo, storage, json, request } = setup();
    const backup = await request('/backup-db');
    assert.equal(backup.status, 200);
    assert.equal(backup.type, 'application/json');
    const parsed = JSON.parse(backup.text);
    assert.equal(parsed.app, 'gestionale-studio-demo');
    const counts = Object.fromEntries(Object.entries(parsed.tables).map(([table, rows]) => [table, rows.length]));

    assert.equal((await json('DELETE', '/clienti/1')).status, 200);
    assert.ok((await request('/clienti')).body.length < counts.customers);
    const upload = text => {
        const form = new FormData();
        form.append('dbFile', new Blob([text], { type: 'application/json' }), 'backup_demo.json');
        return request('/restore-db', { method: 'POST', body: form });
    };
    const restored = await upload(backup.text);
    assert.equal(restored.status, 200, restored.text);
    assert.match(restored.body.message, /ripristinato/);
    demo.configureDemoBackend({ storage });
    assert.equal((await request('/clienti')).body.length, counts.customers);
    assert.equal((await request('/payments?year=ALL')).body.length, counts.payments);
    const created = await json('POST', '/clienti', { customer_code: 'DOPO-RIPRISTINO', name: 'Nuovo' });
    assert.ok(created.body.id > Math.max(...parsed.tables.customers.map(row => row.id)));

    const snapshot = storage.getItem(demo.DEMO_STORAGE_KEY);
    const broken = JSON.parse(backup.text);
    broken.tables.customers[1].customer_code = broken.tables.customers[0].customer_code;
    const orphan = JSON.parse(backup.text);
    orphan.tables.items[0].customer_id = 99999;
    for (const text of ['non è json', JSON.stringify({ app: 'altro', tables: {} }), JSON.stringify(broken), JSON.stringify(orphan)]) {
        const response = await quietly(() => upload(text));
        assert.equal(response.status, 500, text.slice(0, 40));
        assert.match(response.body.error, /^Ripristino non completato: /);
        assert.equal(storage.getItem(demo.DEMO_STORAGE_KEY), snapshot);
    }
    const empty = await request('/restore-db', { method: 'POST', body: new FormData() });
    assert.equal(empty.status, 400);
});

test('resetting the demo restores the original fictional archive', async () => {
    const { demo, storage, json, request } = setup();
    for (const id of [1, 2, 3]) assert.equal((await json('DELETE', `/clienti/${id}`)).status, 200);
    assert.equal((await request('/clienti')).body.length, seedCustomerCount(demo) - 3);
    assert.deepEqual(demo.resetDemoData(), { persistent: true, warning: null });
    const expected = JSON.stringify(demo.createSeedDatabase(NOW).toSnapshot().tables);
    assert.equal(JSON.stringify(JSON.parse(storage.getItem(demo.DEMO_STORAGE_KEY)).snapshot.tables), expected);
    demo.configureDemoBackend({ storage });
    assert.equal((await request('/clienti')).body.length, seedCustomerCount(demo));
});
