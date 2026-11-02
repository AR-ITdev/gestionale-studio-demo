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

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'CassaGrid.jsx'), 'utf8');
const start = source.indexOf('  const fetchCashData = useCallback(async () => {');
const end = source.indexOf('  }, [selectedYear]);', start) + '  }, [selectedYear]);'.length;
assert.ok(start >= 0 && end > start);

function harness(overrides = {}) {
    const calls = { items: null, error: null, customers: null };
    const requestRef = { current: 0 };
    const context = {
        useCallback: fn => fn,
        useRef: () => requestRef,
        cashDataRequestRef: requestRef,
        selectedYear: 2026,
        getFriendlyErrorMessage: error => error?.message || String(error),
        compareCashMovements: orderModule.exports.compareCashMovements,
        getCassaMovements: async () => [{ id: 1, date: '2026-01-01', type: 'ENTRATA', amount: 20 }],
        getPayments: async () => [{ id: 2, payment_date: '2026-01-02', payment_method: 'CONTANTI', amount: 30 }],
        getClienti: async () => [{ id: 4, name: 'Cliente' }],
        setItems: value => { calls.items = value; },
        setError: value => { calls.error = value; },
        setCustomersMap: value => { calls.customers = value; },
        console: { warn: (...args) => { calls.warning = args; } },
        ...overrides
    };
    vm.runInNewContext(source.slice(start, end) + '\nthis.run = fetchCashData;', context);
    return { calls, run: context.run, setYear: value => { context.selectedYear = value; } };
}

test('cash grid displays a specific error and no partial totals when cash payments fail', async () => {
    const { calls, run } = harness({
        getPayments: async () => { throw new Error('Server non raggiungibile'); }
    });
    await run();
    assert.match(calls.error, /pagamenti.*Server non raggiungibile/i);
    assert.equal(calls.items.length, 0);
    assert.equal(calls.customers.size, 0);
});

test('cash grid rejects malformed responses instead of treating them as empty complete data', async () => {
    for (const [failedPart, overrides] of [
        ['movimenti di cassa', { getCassaMovements: async () => ({ error: 'offline' }) }],
        ['pagamenti', { getPayments: async () => ({ error: 'offline' }) }]
    ]) {
        const { calls, run } = harness(overrides);
        await run();
        assert.match(calls.error, new RegExp(failedPart, 'i'));
        assert.equal(calls.items.length, 0);
        assert.equal(calls.customers.size, 0);
    }
});

test('cash grid rejects failed movement requests and leaves no partial rows', async () => {
    for (const overrides of [
        { getCassaMovements: async () => { throw new Error('offline'); } }
    ]) {
        const { calls, run } = harness(overrides);
        await run();
        assert.match(calls.error, /movimenti di cassa/i);
        assert.equal(calls.items.length, 0);
    }
});

test('cash grid keeps complete financial rows when the optional customer directory fails or is malformed', async () => {
    for (const getClienti of [
        async () => { throw new Error('Anagrafica offline'); },
        async () => null
    ]) {
        const { calls, run } = harness({ getClienti });
        await run();
        assert.equal(calls.error, null);
        assert.equal(calls.items.length, 2);
        assert.equal(calls.customers.size, 0);
        assert.match(calls.warning[0], /anagrafica clienti/i);
    }
});

test('complete cash response merges only cash payments and clears previous error', async () => {
    const { calls, run } = harness({
        setError: value => { calls.error = value; },
        getPayments: async () => [
            { id: 2, payment_date: '2026-01-02', payment_method: 'CONTANTI', amount: 30 },
            { id: 3, payment_date: '2026-01-03', payment_method: 'ELETTRONICO', amount: 500 }
        ]
    });
    calls.error = 'previous error';
    await run();
    assert.equal(calls.error, null);
    assert.deepEqual(Array.from(calls.items, item => item.source), ['CASSA', 'PAYMENT']);
    assert.equal(calls.items[1].amount, 30);
    assert.equal(calls.customers.get('4').name, 'Cliente');
});

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

test('late cash requests for a previous year cannot replace current rows or errors', async () => {
    const requests = [];
    const movementRequest = year => {
        const request = deferred();
        requests.push({ kind: 'movement', year, ...request });
        return request.promise;
    };
    const paymentRequest = year => {
        const request = deferred();
        requests.push({ kind: 'payment', year, ...request });
        return request.promise;
    };
    const { calls, run, setYear } = harness({
        getCassaMovements: ({ year }) => movementRequest(year),
        getPayments: ({ year }) => paymentRequest(year),
        getClienti: async () => []
    });
    const oldYearLoad = run();
    setYear(2027);
    calls.items = null;
    const newYearLoad = run();
    for (const request of requests.filter(entry => entry.year === 2027)) {
        request.resolve(request.kind === 'movement'
            ? [{ id: 2027, date: '2027-01-01', type: 'ENTRATA', amount: 20 }]
            : [{ id: 2027, payment_date: '2027-01-02', payment_method: 'CONTANTI', amount: 30 }]);
    }
    await newYearLoad;
    assert.deepEqual(Array.from(calls.items, row => row.id), ['mov-2027', 'pay-2027']);
    for (const request of requests.filter(entry => entry.year === 2026)) {
        request.reject(new Error('Risposta obsoleta'));
    }
    await oldYearLoad;
    assert.deepEqual(Array.from(calls.items, row => row.id), ['mov-2027', 'pay-2027']);
    assert.equal(calls.error, null);
});
