// Port of backend/tests/paymentDates.test.cjs. The demo schema enforces the original foreign
// keys, so the customers referenced by later fixtures are created before they are used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadDemo, createCaller } = require('./loadDemo.cjs');

test('payment dates remain consistent across reads without changing stored records', () => {
    const demo = loadDemo();
    const db = new demo.DemoDatabase();
    db.insert('customers', { id: 1, name: 'Cliente', customer_code: 'C1', parent_code: 'P1', tax_id: 'T1' });
    const timestamp = String(new Date(2026, 6, 15).getTime());
    const records = [
        [1, '2026-07-15', 10, 'ELETTRONICO'],
        [2, timestamp, 20, 'CONTANTI'],
        [3, '2026-07-15T23:59:00', 5, 'SCONTO'],
        [4, '2025-12-31', 7, 'CONTANTI'],
        [5, String(new Date(2026, 0, 1).getTime()), 3, 'CONTANTI']
    ];
    for (const [id, payment_date, amount, payment_method] of records) {
        db.insert('payments', { id, payer_customer_id: 1, payment_date, amount, payment_method, notes: 'Test' });
    }
    const call = createCaller(demo, db);
    const get = path => {
        const response = call('GET', path);
        assert.equal(response.status, 200);
        return response.body;
    };
    const sync = () => assert.equal(call('POST', '/customer-yearly-balances/sync').status, 200);
    const balanceOf = (customerId, year) => db.rows('customer_yearly_balances')
        .filter(row => row.customer_id === customerId && row.year === year);

    const payments = get('/payments?year=2026');
    assert.deepEqual(payments.map(p => p.id), [5, 3, 2, 1]);
    assert.equal(payments.find(p => p.id === 2).payment_date, '2026-07-15');
    assert.equal(payments.find(p => p.id === 3).payment_date, '2026-07-15');
    assert.equal(payments.find(p => p.id === 5).payment_date, '2026-01-01');
    assert.equal(payments[0].customer_name, 'Cliente');
    assert.equal(get('/payments?year=ALL').length, 5);
    assert.equal(get('/payments?year=2026&customer_id=999').length, 0);
    assert.equal(get('/payments?year=2026&q=C1').length, 4);
    const cash = get('/cassa?year=2026&month=7');
    assert.equal(cash.length, 1);
    assert.equal(cash[0].unique_id, 'PAYMENT_2');
    assert.equal(cash[0].date, '2026-07-15');
    sync();
    const [balance] = db.rows('customer_yearly_balances').filter(row => row.year === 2026);
    assert.equal(balance.incassi, 33);
    assert.equal(balance.tot_discount, 5);
    const processing = get('/elaborazioni?year=2026&customer_id=1');
    assert.equal(processing.data.payments.length, 4);
    assert.equal(processing.data.customersSummary[1].periods['07'].payment, 30);
    assert.equal(processing.data.customersSummary[1].periods['07'].discount, 5);
    const report = get('/reports/global?year=2026');
    assert.equal(report.data[0].totalPaid, 33);
    assert.equal(report.data[0].totalDiscount, 5);
    assert.equal(report.data[0].lastPaymentRaw, new Date('2026-07-15').getTime());

    const normalized = demo.normalizedPayments(db).filter(row => demo.strftimeYear(row.payment_date) === '2026');
    assert.equal(normalized.reduce((sum, row) => sum + row.amount, 0), 38);
    assert.equal(normalized.map(row => row.payment_date).sort().at(-1), '2026-07-15');
    assert.equal(db.rows('payments').find(row => row.id === 2).payment_date, timestamp);

    db.insert('customers', { id: 2, name: 'Storico', customer_code: 'C2' });
    db.insert('customers', { id: 3, name: 'Recente', customer_code: 'C3' });
    db.insert('services', { id: 1, category: 'VARIE', subcategory: 'Test' });
    for (const year of [2022, 2023, 2024, 2025]) {
        db.insert('transactions', { category: 'VARIE', year, month: 1, status: 1 });
    }
    for (const [year, price] of [[2022, 100], [2023, 10], [2024, 10], [2025, 10]]) {
        db.insert('items', { customer_id: 2, service_id: 1, category: 'VARIE', year, month: 1, quantity: 1, price });
    }
    db.insert('customer_yearly_balances', { customer_id: 2, year: 2022, varie: 100, balance: -100, notes: 'Storico' });
    db.insert('customer_yearly_balances', { customer_id: 2, year: 2023, varie: 10, balance: -110, notes: 'Storico' });
    for (let i = 0; i < 2; i++) {
        sync();
        assert.equal(balanceOf(2, 2025)[0].balance, -130);
    }
    db.delete('customer_yearly_balances', row => row.customer_id === 2);
    sync();
    assert.equal(balanceOf(2, 2025)[0].balance, -130);
    db.insert('payments', { id: 6, payer_customer_id: 2, payment_date: '2022-06-01', amount: 15, payment_method: 'SCONTO', notes: 'Storico' });
    db.insert('payments', { id: 7, payer_customer_id: 2, payment_date: '2022-06-01', amount: 5, payment_method: 'ELETTRONICO', notes: 'Storico' });
    db.insert('transactions', { category: 'VARIE', year: 2026, month: 1, status: 1 });
    db.insert('transactions', { category: 'VARIE', year: 2035, month: 1, status: 1 });
    db.insert('items', { customer_id: 3, service_id: 1, category: 'VARIE', year: 2026, month: 1, quantity: 1, price: 100 });
    db.insert('items', { customer_id: 3, service_id: 1, category: 'VARIE', year: 2035, month: 1, quantity: 1, price: 20 });
    db.delete('customer_yearly_balances', row => row.customer_id === 2);
    sync();
    assert.equal(balanceOf(2, 2025)[0].balance, -110);
    assert.equal(balanceOf(3, 2035)[0].balance, -120);
});
