const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const orderModule = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'cashMovementOrder.js'), 'utf8'), {
    format: 'cjs'
}).code, { module: orderModule });
const { compareCashMovements } = orderModule.exports;

// Exercise the actual closure without mounting React or connecting to a real database.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'CassaPage.jsx'), 'utf8');
const start = source.indexOf('  const executeCarryOver = async () => {');
const end = source.indexOf('  // Triggers confirmation dialog', start);
assert.ok(start >= 0 && end > start);

const movements = [
    { type: 'SALDO INIZIALE', movement_date: '2026-01-01', amount: 100 },
    { type: 'ENTRATA', movement_date: '2026-02-01', amount: 20 },
    { type: 'USCITA', movement_date: '2026-03-01', amount: 10 },
    { type: 'VERSAMENTO', movement_date: '2026-04-01', amount: 5 }
];
const payments = [
    { payment_date: '2026-05-01', payment_method: 'CONTANTI', amount: 30 },
    { payment_date: '2026-05-01', payment_method: 'ELETTRONICO', amount: 500 },
    { payment_date: '2025-05-01', payment_method: 'CONTANTI', amount: 500 }
];

function harness(overrides = {}) {
    const calls = { creates: [], updates: [], alerts: [], navigations: [], confirmation: null };
    const context = {
        year: 2026,
        compareCashMovements,
        closeConfirm: () => {},
        getCassaMovements: async ({ year }) => year === 2026 ? movements : [],
        getPayments: async () => payments,
        createCashMovement: async (payload) => calls.creates.push(payload),
        updateCashMovement: async (id, payload) => calls.updates.push({ id, payload }),
        showAlert: (message, type) => calls.alerts.push({ message, type }),
        setConfirmState: state => { calls.confirmation = state; },
        setRefreshTrigger: () => {},
        setCassaTempYear: () => {},
        setNavTempYear: () => {},
        setYear: () => {},
        navigate: route => calls.navigations.push(route),
        ...overrides
    };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + '\nthis.run = executeCarryOver;', context);
    return { calls, run: context.run };
}

test('closing uses the full year and only cash payments; January 1 movements are not overwritten', async () => {
    const { calls, run } = harness({
        getCassaMovements: async ({ year }) => year === 2026 ? movements : [
            { id: 7, type: 'ENTRATA', movement_date: '2027-01-01', amount: 99 }
        ]
    });
    await run();
    assert.equal(calls.creates.length, 1);
    assert.equal(calls.creates[0].amount, 135);
    assert.equal(calls.creates[0].movement_date, '2027-01-01');
    assert.equal(calls.creates[0].type, 'SALDO INIZIALE');
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.confirmation, null);
});

test('a real opening balance is updated only after confirmation', async () => {
    const { calls, run } = harness({
        getCassaMovements: async ({ year }) => year === 2026 ? { data: movements } : [
            { id: 7, type: 'ENTRATA', movement_date: '2027-01-01', amount: 99 },
            { id: 8, type: 'SALDO INIZIALE', movement_date: '2027-01-01', amount: 10 }
        ],
        getPayments: async () => ({ data: payments })
    });
    await run();
    assert.equal(calls.creates.length, 0);
    assert.equal(calls.updates.length, 0);
    await calls.confirmation.onConfirm();
    assert.equal(calls.updates[0].id, 8);
    assert.equal(calls.updates[0].payload.amount, 135);
});

for (const failure of ['movements', 'payments', 'next-year', 'invalid-movements', 'invalid-payments', 'invalid-next-year']) {
    test(`closing aborts without writing on ${failure} failure`, async () => {
        const { calls, run } = harness({
            getCassaMovements: async ({ year }) => {
                if ((year === 2026 && failure === 'movements') || (year === 2027 && failure === 'next-year')) {
                    throw new Error('Errore simulato');
                }
                if ((year === 2026 && failure === 'invalid-movements') || (year === 2027 && failure === 'invalid-next-year')) {
                    return {};
                }
                return year === 2026 ? movements : [];
            },
            getPayments: async () => {
                if (failure === 'payments') throw new Error('Errore simulato');
                return failure === 'invalid-payments' ? {} : payments;
            }
        });
        await run();
        assert.equal(calls.creates.length + calls.updates.length, 0);
        assert.equal(calls.navigations.length, 0);
        assert.equal(calls.confirmation, null);
        assert.equal(calls.alerts.at(-1).type, 'danger');
    });
}

test('failed confirmed update is reported without success or navigation', async () => {
    const { calls, run } = harness({
        getCassaMovements: async ({ year }) => year === 2026 ? movements : [
            { id: 8, type: 'SALDO INIZIALE', amount: 10 }
        ],
        updateCashMovement: async () => { throw new Error('Errore aggiornamento'); }
    });
    await run();
    await calls.confirmation.onConfirm();
    assert.equal(calls.alerts.at(-1).type, 'danger');
    assert.equal(calls.navigations.length, 0);
});

test('empty but valid datasets allow a zero opening balance', async () => {
    const { calls, run } = harness({
        getCassaMovements: async () => [],
        getPayments: async () => []
    });
    await run();
    assert.equal(calls.creates[0].amount, 0);
});

const gridSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'CassaGrid.jsx'), 'utf8');
const gridStart = gridSource.indexOf('  const calculatedRows = useMemo(() => {');
const gridEnd = gridSource.indexOf('  const totals = useMemo', gridStart);
function calculateGrid(filteredItems, dateSortOrder = 'asc') {
    const context = { filteredItems, dateSortOrder, compareCashMovements, useMemo: fn => fn() };
    vm.runInNewContext(gridSource.slice(gridStart, gridEnd) + '\nthis.result = calculatedRows;', context);
    return context.result;
}

test('opening balance precedes same-day cash movements regardless of insertion order in grid and closure', async () => {
    const opening = { type: 'SALDO INIZIALE', date: '2026-01-01', amount: 100 };
    const income = { type: 'ENTRATA', date: '2026-01-01', amount: 20 };
    const expense = { type: 'USCITA', date: '2026-01-01', amount: 5 };
    const payment = { type: 'INCASSO', date: '2026-01-01', amount: 30 };
    for (const records of [
        [income, expense, opening],
        [opening, expense, income],
        [expense, opening, income]
    ]) {
        const grid = calculateGrid([...records, payment]);
        assert.equal(grid.rows[0].type, 'SALDO INIZIALE');
        assert.equal(grid.rows[0].saldoProgressivo, 100);
        assert.equal(grid.saldoFinale, 145);
        assert.equal(grid.rows.at(-1).saldoProgressivo, 145);
        const descending = calculateGrid([...records, payment], 'desc');
        assert.equal(descending.rows.find(row => row.type === 'INCASSO').saldoProgressivo, 145);
        assert.equal(descending.rows.at(-1).type, 'SALDO INIZIALE');
        assert.equal(descending.rows.at(-1).saldoProgressivo, 100);
        assert.equal(descending.saldoFinale, 145);
        const { calls, run } = harness({
            getCassaMovements: async ({ year }) => year === 2026 ? records : [],
            getPayments: async () => [{ payment_date: payment.date, amount: 30, payment_method: 'CONTANTI' }]
        });
        await run();
        assert.equal(calls.creates[0].amount, 145);
    }
});

test('calendar-day opening priority also applies to timestamps without changing other dates', () => {
    const records = [
        { type: 'ENTRATA', date: '2026-01-01T00:00:00', amount: 20 },
        { type: 'SALDO INIZIALE', date: '2026-01-01T12:00:00', amount: 100 },
        { type: 'USCITA', date: '2026-01-02', amount: 10 }
    ];
    const result = calculateGrid(records);
    assert.equal(result.rows[0].type, 'SALDO INIZIALE');
    assert.equal(result.rows.at(-1).saldoProgressivo, 110);
    assert.equal(result.saldoFinale, 110);
});

test('cash display totals still follow the supplied filtered subset', () => {
    const result = calculateGrid([{ type: 'ENTRATA', date: '2026-01-01', amount: 20 }]);
    assert.equal(result.saldoIniziale, 0);
    assert.equal(result.totEntrate, 20);
    assert.equal(result.saldoFinale, 20);
});
