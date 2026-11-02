// Port of backend/tests/historicalBalances.test.cjs and paymentDates.test.cjs: the same
// fixtures and expectations, run against the in-browser demo backend instead of SQLite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const XLSX = require('xlsx-js-style');
const { loadDemo, createCaller } = require('./loadDemo.cjs');

function loadComponent(name, overrides = {}, globals = {}) {
    const file = path.join(__dirname, '..', 'src', 'components', `${name}.jsx`);
    const source = transformSync(fs.readFileSync(file, 'utf8'), {
        loader: 'jsx', jsx: 'automatic', format: 'cjs'
    }).code;
    const module = { exports: {} };
    vm.runInNewContext(source, {
        module,
        require: name => overrides[name] || (name.startsWith('./') ? new Proxy({}, { get: () => () => null }) : require(name)),
        console, ...globals
    }, { filename: file });
    return module.exports[name];
}

const Grid = loadComponent('ElaborazioniGrid');

function gridRows(data, customers, services, filter = '1', year = 2027) {
    const html = renderToStaticMarkup(React.createElement(Grid, {
        items: data.items, payments: data.payments, customers, services,
        customersSummary: data.customersSummary, backendAggregated: data.aggregated,
        yearlyBalancesMap: data.yearlyBalancesMap, selectedYear: year, selectedFilterValue: filter
    }));
    return [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map(match =>
        [...match[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)]
            .map(cell => cell[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    );
}

async function exportSheet(data, customers, services, transactions, year = 2027) {
    let blob;
    let completed = false;
    let failed = false;
    const Export = loadComponent('ElaborazioniExportModal', {
        react: { useCallback: fn => fn, useRef: () => ({ current: false }), useEffect: fn => fn() }
    }, {
        Blob,
        URL: { createObjectURL: value => { blob = value; return 'test-url'; }, revokeObjectURL() {} },
        document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } },
        setTimeout: fn => { fn(); return 1; }, clearTimeout() {}
    });
    Export({
        isOpen: true,
        onExportComplete: () => { completed = true; },
        onExportError: () => { failed = true; },
        exportData: {
            customers, services, transactions, items: data.items, payments: data.payments,
            customersSummary: data.customersSummary, currentYear: year, previousYear: year - 1
        }
    });
    assert.equal(failed, false);
    assert.equal(completed, true);
    const workbook = XLSX.read(Buffer.from(await blob.arrayBuffer()), { type: 'buffer', cellNF: true });
    return workbook.Sheets[workbook.SheetNames[0]];
}

const insertAll = (db, table, rows) => rows.forEach(row => db.insert(table, row));
const rowsOf = (db, table, filter = () => true) => db.rows(table).filter(filter).map(row => ({ ...row }));

test('historical ledger survives sparse years, stale cached balances and customers without recent activity', async t => {
    const demo = loadDemo();
    const db = new demo.DemoDatabase();
    insertAll(db, 'customers', [
        { id: 1, customer_code: 'A', name: 'Attivo', parent_code: 'GRUPPO' },
        { id: 2, customer_code: 'B', name: 'Solo storico', parent_code: 'GRUPPO' },
        { id: 3, customer_code: 'C', name: 'Credito', parent_code: 'ALTRO' }
    ]);
    db.insert('services', { id: 1, category: 'VARIE', subcategory: 'Servizio' });
    insertAll(db, 'transactions', [[2020, 1, 1], [2021, 1, 1], [2026, 1, 1], [2027, 2, 1], [2035, 1, 1], [2019, 1, 0]]
        .map(([year, month, status]) => ({ category: 'VARIE', year, month, status })));
    insertAll(db, 'items', [
        [1, 2020, 1, 100], [1, 2021, 1, 20], [1, 2026, 1, 40], [1, 2027, 2, 30],
        [1, 2035, 1, 10], [2, 2020, 1, 90], [3, 2026, 1, 10], [1, 2019, 1, 999]
    ].map(([customer_id, year, month, price]) => ({
        customer_id, service_id: 1, category: 'VARIE', year, month, quantity: 1, price
    })));
    insertAll(db, 'payments', [
        [1, '2022-01-01', 15, 'CONTANTI'], [1, '2022-01-01', 5, 'SCONTO'],
        [1, '2026-01-01', 10, 'CONTANTI'], [1, '2026-01-01', 5, 'SCONTO'],
        [1, '2027-03-01', 7, 'ELETTRONICO'], [2, '2035-01-01', 90, 'CONTANTI'],
        [3, '2020-01-01', 50, 'ELETTRONICO']
    ].map(([payer_customer_id, payment_date, amount, payment_method]) => ({
        payer_customer_id, payment_date, amount, payment_method
    })));
    insertAll(db, 'customer_yearly_balances', [
        { customer_id: 1, year: 2021, varie: 20, balance: -20 },
        { customer_id: 2, year: 2020, varie: 90, balance: -90 }
    ]);
    const call = createCaller(demo, db);
    const get = query => {
        const response = call('GET', query);
        assert.equal(response.status, 200);
        return response.body;
    };
    const sync = () => {
        const response = call('POST', '/customer-yearly-balances/sync');
        assert.equal(response.status, 200);
        return response.body;
    };
    const customers = rowsOf(db, 'customers');
    const services = rowsOf(db, 'services');
    const transactions = rowsOf(db, 'transactions');

    await t.test('reads the real opening balance even before synchronization', () => {
        const { data } = get('/elaborazioni?year=2027&customer_id=1');
        assert.equal(data.customersSummary[1].previousYearBalance, -125);
        assert.equal(data.customersSummary[1].periods['00'].VARIE, 40);
        assert.equal(data.customersSummary[1].periods['00'].payment, 10);
        assert.equal(data.customersSummary[1].periods['00'].discount, 5);
        assert.equal(data.yearlyBalancesMap[1].balance, -148);
    });
    await t.test('only writes three target years and retains historical-only debt and credit', () => {
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.deepEqual(sync().processedYears, [2035, 2027, 2026]);
            const rows = rowsOf(db, 'customer_yearly_balances', row => row.year === 2027)
                .sort((a, b) => a.customer_id - b.customer_id);
            assert.deepEqual(rows.map(row => row.balance), [-148, -90, 40]);
            assert.equal(rows[1].varie, 0);
            assert.equal(rowsOf(db, 'customer_yearly_balances', row => row.customer_id === 1 && row.year === 2021)[0].balance, -20);
        }
        const report = get('/reports/global?year=2027');
        assert.equal(report.data.find(customer => customer.id === 2).balance, -90);
    });
    await t.test('actual grid shows annual categories separately and adds current movements only once', () => {
        const { data } = get('/elaborazioni?year=2027&customer_id=1');
        const rows = gridRows(data, customers, services);
        assert.equal(rows.find(row => row[0] === 'Varie')[1], '\u20ac 40,00');
        const balanceRow = rows.find(row => /Saldo/.test(row[0]));
        assert.match(balanceRow[1], /- \u20ac 125,00/);
        assert.match(balanceRow[2], /- \u20ac 125,00/);
        assert.match(balanceRow[3], /- \u20ac 155,00/);
        assert.match(balanceRow[4], /- \u20ac 148,00/);
        assert.match(balanceRow[13], /- \u20ac 148,00/);
    });
    await t.test('general and group summaries include inactive historical debt without leaking other customers', () => {
        const { data } = get('/elaborazioni?year=2027');
        assert.equal(data.previousYearBalance, -175);
        assert.equal(data.previousYearMacroAreas.VARIE, 50);
        const rows = gridRows(data, customers, services, 'ALL');
        assert.match(rows.find(row => /Saldo/.test(row[0]))[1], /- \u20ac 175,00/);
        assert.match(rows.find(row => /Saldo/.test(row[0]))[13], /- \u20ac 198,00/);
        const group = get('/elaborazioni?year=2027&parent_code=GRUPPO').data;
        assert.equal(group.previousYearBalance, -215);
        assert.deepEqual(Object.keys(group.customersSummary).sort(), ['1', '2']);
        const historical = get('/elaborazioni?year=2027&customer_id=2').data;
        assert.equal(historical.customersSummary[2].previousYearBalance, -90);
        assert.equal(historical.customersSummary[2].periods['00'].VARIE, 0);
        assert.equal(historical.yearlyBalancesMap[2].balance, -90);
    });
    await t.test('empty calendar gaps carry the debt without relabeling old competences as last-year activity', () => {
        const { data } = get('/elaborazioni?year=2030&customer_id=1');
        assert.equal(data.previousYearBalance, -148);
        assert.equal(data.customersSummary[1].periods['00'].VARIE, 0);
        const rows = gridRows(data, customers, services, '1', 2030);
        assert.equal(rows.find(row => row[0] === 'Varie')[1], '\u2014');
        assert.match(rows.find(row => /Saldo/.test(row[0]))[13], /- \u20ac 148,00/);
    });
    await t.test('missing or emptied groups retain the full response shape without exposing other customers', () => {
        db.insert('customers', { id: 4, customer_code: 'D', name: 'Ex membro', parent_code: 'VUOTO' });
        db.update('customers', { parent_code: 'ALTRO' }, row => row.id === 4);
        for (const parent of ['INESISTENTE', 'VUOTO']) {
            const { data } = get(`/elaborazioni?year=2027&parent_code=${parent}`);
            assert.deepEqual(data.items, []);
            assert.deepEqual(data.payments, []);
            assert.deepEqual(data.customers, {});
            assert.deepEqual(data.customersSummary, {});
            assert.deepEqual(data.yearlyBalancesMap, {});
            assert.ok(Object.values(data.yearlyBalancesSummary).every(value => value === 0));
            assert.equal(data.previousYearBalance, 0);
            assert.equal(data.previousYearPayments, 0);
            assert.equal(data.previousYearDiscounts, 0);
            for (const months of Object.values(data.macroAreasSummary)) {
                assert.equal(Object.keys(months).length, 12);
                assert.ok(Object.values(months).every(value => value === 0));
            }
            assert.ok(Object.values(data.paymentsSummary).every(month => month.total === 0));
            assert.ok(Object.values(data.discountsSummary).every(value => value === 0));
            assert.deepEqual(data.aggregated.yearlyBalancesSummary, data.yearlyBalancesSummary);
        }
        assert.notEqual(get('/elaborazioni?year=2027').data.previousYearBalance, 0);
        const group = get('/elaborazioni?year=2027&parent_code=GRUPPO').data;
        assert.deepEqual(Object.keys(group.customersSummary).sort(), ['1', '2']);
    });
    await t.test('actual Excel export uses cumulative opening debt and preserves numerical currency totals', async () => {
        const { data } = get('/elaborazioni?year=2027&customer_id=1');
        const sheet = await exportSheet(data, [customers[0]], services, transactions);
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const dueIndex = rows.findIndex(row => row[5] === 'TOTALE DOVUTO:');
        assert.equal(rows[dueIndex][6], 148);
        assert.equal(sheet[`G${dueIndex + 1}`].t, 'n');
        assert.match(sheet[`G${dueIndex + 1}`].z, /0\.00/);
        assert.match(sheet[`G${dueIndex + 1}`].z, /\u20ac/);
        const old = get('/elaborazioni?year=2030&customer_id=2').data;
        const oldSheet = await exportSheet(old, [customers[1]], services, transactions, 2030);
        const oldRows = XLSX.utils.sheet_to_json(oldSheet, { header: 1 });
        assert.equal(oldRows.find(row => row[5] === 'TOTALE DOVUTO:')[6], 90);
    });
    await t.test('settled historical debt is removed from later carry-only rows on resync', () => {
        db.insert('payments', { payer_customer_id: 2, payment_date: '2026-12-31', amount: 90, payment_method: 'CONTANTI' });
        sync();
        assert.equal(rowsOf(db, 'customer_yearly_balances', row => row.customer_id === 2 && row.year === 2027).length, 0);
        assert.equal(get('/elaborazioni?year=2027&customer_id=2').data.previousYearBalance, 0);
    });
    await t.test('editing an old confirmed charge repairs recent balances instead of trusting the stale historical cache', () => {
        db.update('items', { price: 150 }, row => row.customer_id === 1 && row.year === 2020);
        sync();
        assert.equal(rowsOf(db, 'customer_yearly_balances', row => row.customer_id === 1 && row.year === 2027)[0].balance, -198);
        const { data } = get('/elaborazioni?year=2027&customer_id=1');
        assert.equal(data.previousYearBalance, -175);
        assert.equal(data.customersSummary[1].periods['00'].VARIE, 40);
        assert.equal(data.yearlyBalancesMap[1].balance, -198);
    });
});
