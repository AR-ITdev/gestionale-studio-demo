const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const src = path.join(__dirname, '..', 'src');
const read = file => fs.readFileSync(path.join(src, file), 'utf8');
function load(file, overrides, globals = {}) {
    const module = { exports: {} };
    const logs = [];
    vm.runInNewContext(transformSync(read(file), {
        format: 'cjs', loader: file.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic'
    }).code, {
        module,
        AbortController, queueMicrotask,
        require: name => overrides[name] || require(name),
        console: { error: (...args) => logs.push(args) },
        ...globals
    });
    return { ...module.exports, logs };
}

function hookHarness(file, name, api) {
    const slots = [];
    const effects = [];
    let cursor = 0;
    let writes = 0;
    const changed = (previous, next) => !previous || next.some((value, index) => !Object.is(value, previous[index]));
    const react = {
        useState: initial => {
            const index = cursor++;
            if (!(index in slots)) slots[index] = initial;
            return [slots[index], value => {
                writes++;
                slots[index] = typeof value === 'function' ? value(slots[index]) : value;
            }];
        },
        useRef: initial => {
            const index = cursor++;
            if (!(index in slots)) slots[index] = { current: initial };
            return slots[index];
        },
        useCallback: (fn, deps) => {
            const index = cursor++;
            if (changed(slots[index]?.deps, deps)) slots[index] = { fn, deps };
            return slots[index].fn;
        },
        useEffect: (fn, deps) => {
            const index = cursor++;
            if (changed(slots[index]?.deps, deps)) {
                effects.push(() => {
                    slots[index]?.cleanup?.();
                    slots[index] = { deps, cleanup: fn() };
                });
            }
        }
    };
    const exports = load(file, { react, '../services/api': api });
    return {
        render: filters => {
            cursor = 0;
            const result = exports[name](filters);
            effects.splice(0).forEach(effect => effect());
            return result;
        },
        unmount: () => slots.forEach(slot => slot?.cleanup?.()),
        writes: () => writes,
        logs: exports.logs
    };
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (id, year = 2026, analysisYear = 2035) => ({
    analysisYear,
    data: [{ id, name: `Cliente ${id}`, balance: -id * 100, year, app: year }]
});

test('report ignores old successes and errors after selection changes', async () => {
    const requests = [];
    const harness = hookHarness('hooks/useReportGlobal.js', 'useReportGlobal', {
        getReportGlobal: filters => {
            const request = { ...deferred(), filters };
            requests.push(request);
            return request.promise;
        }
    });
    harness.render({ customer_id: 1 });
    harness.render({ customer_id: 2 });
    requests[1].resolve(response(2));
    await flush();
    requests[0].resolve(response(1, 2020, 2020));
    await flush();
    let current = harness.render({ customer_id: 2 });
    assert.equal(current.reportData[0].id, 2);
    assert.equal(current.analysisYear, 2035);
    assert.equal(current.loading, false);
    assert.equal(current.error, null);
    harness.render({ parent_code: 'GRUPPO' });
    harness.render({ customer_id: 3 });
    requests[3].resolve(response(3));
    await flush();
    requests[2].reject(new Error('Vecchia richiesta fallita'));
    await flush();
    current = harness.render({ customer_id: 3 });
    assert.equal(current.reportData[0].id, 3);
    assert.equal(current.error, null);
    assert.equal(harness.logs.length, 0);
});

test('obsolete report completion cannot clear loading of the latest manual refresh', async () => {
    const requests = [];
    const harness = hookHarness('hooks/useReportGlobal.js', 'useReportGlobal', {
        getReportGlobal: () => {
            const request = deferred();
            requests.push(request);
            return request.promise;
        }
    });
    const initial = harness.render({ customer_id: 1 });
    const refresh = initial.refetch();
    requests[0].resolve(response(1));
    await flush();
    assert.equal(harness.render({ customer_id: 1 }).loading, true);
    requests[1].reject(new Error('Errore corrente'));
    await refresh;
    const current = harness.render({ customer_id: 1 });
    assert.equal(current.loading, false);
    assert.equal(current.error.message, 'Errore corrente');
    assert.equal(current.reportData.length, 0);
    assert.equal(harness.logs.length, 1);
});

test('report requests resolving or failing after unmount do not update state', async () => {
    for (const fail of [false, true]) {
        const request = deferred();
        const harness = hookHarness('hooks/useReportGlobal.js', 'useReportGlobal', {
            getReportGlobal: () => request.promise
        });
        harness.render({});
        harness.unmount();
        const writes = harness.writes();
        if (fail) request.reject(new Error('Richiesta dopo chiusura'));
        else request.resolve(response(1));
        await flush();
        assert.equal(harness.writes(), writes);
        assert.equal(harness.logs.length, 0);
    }
});

function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const result = find(child, predicate);
        if (result) return result;
    }
    return null;
}

test('report keeps each customer balance year and Vai navigates to that year', async () => {
    const harness = hookHarness('hooks/useReportGlobal.js', 'useReportGlobal', {
        getReportGlobal: async () => response(1, 2026, 2035)
    });
    harness.render({});
    await flush();
    const current = harness.render({});
    assert.equal(current.reportData[0].year, 2026);
    assert.equal(current.reportData[0].app, 2026);
    assert.equal(current.analysisYear, 2035);
    const routes = [];
    const { ReportGrid } = load('components/ReportGrid.jsx', {
        react: { useState: initial => [initial, () => {}], useMemo: fn => fn(), useCallback: fn => fn },
        'react-router-dom': { useNavigate: () => route => routes.push(route) }
    });
    const tree = ReportGrid({ reportData: { analysisYear: current.analysisYear, data: current.reportData } });
    find(tree, node => node.props?.title === 'Vai alle elaborazioni del cliente').props.onClick();
    assert.deepEqual(routes, ['/elaborazioni/2026/1']);
});

test('changing report selection does not refetch with previous customer filters', async () => {
    const source = read('pages/ReportPage.jsx');
    const start = source.indexOf('  const handleConfirmSelection = async () => {');
    const end = source.indexOf('  // Excel export functionality', start);
    for (const selectedFilterValue of ['1', '2']) {
        const calls = [];
        const context = {
            selectedFilterValue, tempFilterValue: '2',
            initialSyncHandled: { current: false },
            syncCustomerYearlyBalances: async () => calls.push('sync'),
            setIsSyncing() {}, setSelectedFilterValue: value => calls.push(`select:${value}`),
            navigate: route => calls.push(route), refetch: async () => calls.push('refetch'),
            console
        };
        vm.runInNewContext(source.slice(start, end) + '\nthis.confirm = handleConfirmSelection; this.apply = handleApplyCustomerSearch;', context);
        await context.confirm();
        assert.equal(calls.includes('refetch'), selectedFilterValue === '2');
        calls.length = 0;
        await context.apply();
        assert.equal(calls.includes('refetch'), selectedFilterValue === '2');
    }
});

test('first all-customer report reloads the synchronized payment without leaving the page', async () => {
    const source = read('pages/ReportPage.jsx');
    const start = source.indexOf('  const handleConfirmSelection = async () => {');
    const end = source.indexOf('  // Excel export functionality', start);
    for (const selectedFilterValue of ['', 'ALL']) {
        const sync = deferred();
        let savedPayment = 0;
        let reads = 0;
        const harness = hookHarness('hooks/useReportGlobal.js', 'useReportGlobal', {
            getReportGlobal: async () => {
                reads++;
                return {
                    analysisYear: 2026,
                    data: [{ id: 1, balance: -500 + savedPayment, totalPaid: savedPayment }]
                };
            }
        });
        harness.render({});
        await flush();
        const initial = harness.render({});
        assert.equal(initial.reportData[0].balance, -500);
        const context = {
            selectedFilterValue, tempFilterValue: 'ALL',
            initialSyncHandled: { current: false },
            syncCustomerYearlyBalances: async () => {
                await sync.promise;
                savedPayment = 100;
            },
            setIsSyncing() {}, setSelectedFilterValue() {}, navigate() {},
            refetch: initial.refetch,
            showAlert: message => assert.fail(message),
            console
        };
        vm.runInNewContext(source.slice(start, end) + '\nthis.confirm = handleConfirmSelection;', context);
        const confirmation = context.confirm();
        assert.equal(reads, 1, 'must wait for synchronization before reloading');
        sync.resolve();
        await confirmation;
        const current = harness.render({});
        assert.equal(reads, 2, 'unchanged effective filters still require a fresh read');
        assert.equal(current.reportData[0].totalPaid, 100);
        assert.equal(current.reportData[0].balance, -400);
        assert.equal(current.loading, false);
    }
});

test('updated SheetJS preserves report export columns, balances, filters and worksheet layout', () => {
    const XLSX = require('xlsx');
    const source = read('pages/ReportPage.jsx');
    const start = source.indexOf('  const handleExportExcel = () => {');
    const end = source.indexOf('\n  return (', start);
    for (const selectedFilterValue of ['ALL', '1', 'PARENT:P1']) {
        let workbook;
        let fileName;
        const alerts = [];
        const context = {
            XLSX: { ...XLSX, writeFile: (book, name) => { workbook = book; fileName = name; } },
            selectedFilterValue, analysisYear: 2026,
            customers: [
                { id: 1, customer_code: 'C1', name: 'Cliente Uno', parent_code: 'P1' },
                { id: 2, customer_code: 'C2', name: 'Cliente Due', parent_code: 'P2' },
                { id: 3, customer_code: 'C3', name: 'Saldo Zero', parent_code: 'P1' }
            ],
            reportData: [
                { id: 1, code: 'C1', name: 'Cliente Uno', balance: -400, lastPaymentDate: '24/10/2026' },
                { id: 2, code: 'C2', name: 'Cliente Due', balance: 125.5 },
                { id: 3, code: 'C3', name: 'Saldo Zero', balance: 0 }
            ],
            showAlert: (message, type) => alerts.push({ message, type }),
            console
        };
        vm.runInNewContext(source.slice(start, end) + '\nthis.exportReport = handleExportExcel;', context);
        context.exportReport();
        assert.equal(alerts[0].type, 'success');
        assert.match(fileName, /^Report_Insolvenze_\d{4}\.\d{2}\.\d{2}\.xlsx$/);
        assert.equal(workbook.SheetNames[0], 'Insolvenze_2026');
        const sheet = workbook.Sheets.Insolvenze_2026;
        assert.equal(sheet['!cols'].length, 5);
        assert.ok(sheet['!cols'].every(column => column.wch === 25));
        assert.equal(sheet.D2.t, 'n');
        assert.equal(sheet.D2.v, -400);
        assert.equal(sheet.A1.s.font.bold, true);
        const roundTrip = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
        const rows = XLSX.utils.sheet_to_json(roundTrip.Sheets.Insolvenze_2026, { header: 1 });
        assert.deepEqual(rows[0], ['CODICE PADRE', 'CODICE CLIENTE', 'NOME CLIENTE', 'SALDO SCOPERTO', 'DATA ULTIMO PAGAMENTO']);
        assert.deepEqual(rows[1], ['P1', 'C1', 'Cliente Uno', -400, '24/10/2026']);
        assert.equal(rows.length, selectedFilterValue === 'ALL' ? 3 : 2);
        if (selectedFilterValue === 'ALL') assert.equal(rows[2][3], 125.5);
    }
});

test('payroll price, quantity and note updates reject on API failure', async () => {
    for (const field of ['price', 'quantity', 'note']) {
        const failure = new Error(`Errore ${field}`);
        const harness = hookHarness('hooks/usePaghe.js', 'usePaghe', {
            getPaghe: async () => [],
            updatePaghe: async () => { throw failure; }
        });
        const hook = harness.render({ year: 2026, month: 1 });
        await assert.rejects(hook.handleCellValueChanged({ data: { id: 1 }, field, newValue: 10 }), error => error === failure);
    }
});

test('payroll successful updates preserve payloads and refresh failures reject', async () => {
    let payload;
    let failRefresh = false;
    const harness = hookHarness('hooks/usePaghe.js', 'usePaghe', {
        getPaghe: async () => {
            if (failRefresh) throw new Error('Errore rilettura');
            return [{ id: 1, price: 10, quantity: 2, custom_data: '{"note":"Nuova nota"}' }];
        },
        updatePaghe: async (id, value) => { payload = value; }
    });
    const hook = harness.render({ year: 2026, month: 1 });
    await hook.handleCellValueChanged({
        data: { id: 1, custom_data: '{"existing":"preserved"}' }, field: 'note', newValue: 'Nuova nota'
    });
    assert.deepEqual(JSON.parse(payload.custom_data), { existing: 'preserved', note: 'Nuova nota' });
    assert.equal(harness.render({ year: 2026, month: 1 }).rowData[0].note, 'Nuova nota');
    failRefresh = true;
    await assert.rejects(hook.handleCellValueChanged({ data: { id: 1 }, field: 'price', newValue: 20 }), /Errore rilettura/);
});

test('all matrix grids commit once, retain drafts on failure and use committed rows without refetch', async () => {
    for (const grid of ['ContabilitaGrid', 'RedditiGrid', 'PagheGeneraleGrid', 'PagheCedoliniGrid']) {
      for (const fail of [false, true]) {
        const source = read(`components/${grid}.jsx`);
        const start = source.indexOf('  const handleSaveAllChanges = async (e) => {');
        const end = source.indexOf('\n  //', start);
        const calls = { cleared: false, alerts: [], operations: [], replaced: null };
        const savedRows = [{ id: 1, price: 20, quantity: 2, custom_data: '{"note":"Nuova"}' }];
        const { createItemBatch } = load('utils/itemBatch.js', { '../services/api': {
            saveBatch: async operations => {
                calls.operations.push(operations);
                if (fail) throw new Error('Errore commit');
                return { rows: savedRows };
            }
        } });
        const noop = () => {};
        const context = {
            year: 2026, month: 1, selectedTransaction: { year: 2026, month: 1 },
            itemsLoading: false, loadError: null,
            removedCustomerIds: [], addedCustomerIds: [],
            globalDrafts: { cell: { customerId: 1, serviceId: 1, values: { price: 20, quantity: 2, note: 'Nuova' } } },
            rowData: [{ id: 1, customer_id: 1, service_id: 1, price: 10, quantity: 1, custom_data: '{"preserved":true}' }],
            createItemBatch, replaceRows: rows => { calls.replaced = rows; },
            fetchData: async () => assert.fail('No additional read after commit'),
            setIsSaving: noop, setRemovedCustomerIds: noop, setAddedCustomerIds: noop,
            setManualCustomerIds: noop, setSelectedCustomerIds: noop, setResetKey: noop, setHasUnsaved: noop,
            setGlobalDrafts: () => { calls.cleared = true; },
            showAlert: (message, type) => calls.alerts.push(type),
            setAlertData: value => calls.alerts.push(value.type),
            console: { error() {}, warn() {} }
        };
        vm.runInNewContext(source.slice(start, end) + '\nthis.run = handleSaveAllChanges;', context);
        await context.run();
        assert.equal(calls.operations.length, 1, grid);
        assert.equal(calls.operations[0].length, 1, grid);
        assert.deepEqual(JSON.parse(JSON.stringify(calls.operations[0][0].data)), {
            price: 20, quantity: 2, custom_data: '{"preserved":true,"note":"Nuova"}'
        });
        assert.equal(calls.cleared, !fail, grid);
        assert.equal(calls.replaced, fail ? null : savedRows, grid);
        assert.deepEqual(calls.alerts, [fail ? (grid === 'ContabilitaGrid' || grid === 'RedditiGrid' ? 'error' : 'danger') : 'success']);
      }
    }
});

test('empty quantity cells provide the qty placeholder without replacing entered quantities', () => {
    const source = read('layouts/BaseGridStructure.jsx');
    const quantityInput = source.match(/<input\b[\s\S]*?\/>/g)?.find(input => input.includes("handleChange('quantity', e.target.value)"));
    assert.ok(quantityInput);
    assert.match(quantityInput, /placeholder="qty"/);
    assert.match(quantityInput, /value=\{quantity === 0 \? '' : quantity\}/);
    assert.match(quantityInput, /type="number"/);
});

test('payroll hides previous-period rows before loading and clears failed or malformed reads', async () => {
    const requests = [];
    const harness = hookHarness('hooks/usePaghe.js', 'usePaghe', {
        getPaghe: (year, month) => {
            const request = { ...deferred(), year, month };
            requests.push(request);
            return request.promise;
        }
    });
    harness.render({ year: 2026, month: 1 });
    requests[0].resolve([{ id: 11, custom_data: '{"note":"January"}' }]);
    await flush();
    assert.equal(harness.render({ year: 2026, month: 1 }).rowData[0].id, 11);
    let current = harness.render({ year: 2026, month: 2 });
    assert.equal(current.rowData.length, 0);
    assert.equal(current.loading, true);
    requests[1].reject(new Error('February failed'));
    await flush();
    current = harness.render({ year: 2026, month: 2 });
    assert.equal(current.rowData.length, 0);
    assert.equal(current.loading, false);
    assert.match(current.error.message, /February failed/);
    const retry = current.fetchData();
    requests[2].resolve([{ id: 22, custom_data: '{}' }]);
    await retry;
    current = harness.render({ year: 2026, month: 2 });
    assert.equal(current.error, null);
    assert.equal(current.rowData[0].id, 22);
    const malformed = current.fetchData();
    requests[3].resolve({});
    await assert.rejects(malformed, /Risposta dati paghe non valida/);
    assert.equal(harness.render({ year: 2026, month: 2 }).rowData.length, 0);
    harness.render({ year: 2026, month: 3 });
    harness.render({ year: 2026, month: 4 });
    requests[5].resolve([{ id: 44 }]);
    await flush();
    requests[4].reject(new Error('Obsolete March'));
    await flush();
    current = harness.render({ year: 2026, month: 4 });
    assert.equal(current.rowData[0].id, 44);
    assert.equal(current.error, null);
    const pending = current.fetchData();
    harness.unmount();
    const writes = harness.writes();
    requests[6].resolve([{ id: 55 }]);
    await pending;
    assert.equal(harness.writes(), writes);
});

test('both payroll grids reject saves while period data is pending or failed', async () => {
    for (const grid of ['PagheGeneraleGrid', 'PagheCedoliniGrid']) {
        const source = read(`components/${grid}.jsx`);
        const start = source.indexOf('  const handleSaveAllChanges = async (e) => {');
        const end = source.indexOf('\n  //', start);
        for (const pending of [true, false]) {
            const alerts = [];
            const context = {
                itemsLoading: pending, loadError: pending ? null : new Error('Read failed'),
                showAlert: (...args) => alerts.push(args),
                setAlertData: value => alerts.push(value),
                createItemBatch: () => assert.fail('Cannot save unloaded period')
            };
            vm.runInNewContext(source.slice(start, end) + '\nthis.save = handleSaveAllChanges;', context);
            await context.save();
            assert.equal(alerts.length, 1, grid);
        }
        assert.match(source, /loading=\{loading \|\| itemsLoading\}/);
        assert.match(source, /loadError=\{loadError\}/);
        assert.match(source, /onRetryLoad=/);
    }
});

test('service hook uses the API category string and equivalent filters do not trigger repeated loads', async () => {
    const calls = [];
    const harness = hookHarness('hooks/useServices.js', 'useServices', {
        getServices: async category => {
            calls.push(category);
            return [{ id: 1, category: category || 'PAGHE' }];
        }
    });
    harness.render({});
    await flush();
    let current = harness.render({});
    assert.equal(calls.length, 1);
    assert.equal(calls[0], undefined);
    assert.equal(current.services.length, 1);
    harness.render({ category: { value: 'PAGHE' } });
    await flush();
    current = harness.render({ category: 'PAGHE' });
    assert.equal(calls.length, 2);
    assert.equal(calls[1], 'PAGHE');
    await current.refetchServices();
    assert.equal(calls[2], 'PAGHE');
});

test('customer route parameters decode once and preserve literal percent escapes', () => {
    for (const code of ['GRUPPO 100%', 'A%20B', 'A/B', 'A%2FB']) {
        for (const prefix of ['/report/', '/elaborazioni/2026/', '/cassa/2026/pagamenti/']) {
            const value = `PARENT:${code}`;
            const router = {
                useParams: () => ({ cliente: value.replace(/%2F/g, '/'), customerName: value.replace(/%2F/g, '/') }),
                useLocation: () => ({ pathname: `${prefix}${encodeURIComponent(value)}/` })
            };
            const { useTrailingRouteParam } = load('hooks/useTrailingRouteParam.js', { 'react-router-dom': router });
            assert.equal(useTrailingRouteParam(prefix.startsWith('/cassa') ? 'customerName' : 'cliente'), value);
        }
    }
    const { useTrailingRouteParam, logs } = load('hooks/useTrailingRouteParam.js', {
        'react-router-dom': {
            useParams: () => ({ cliente: 'GRUPPO 100%' }),
            useLocation: () => ({ pathname: '/report/GRUPPO%20100%' })
        }
    });
    assert.equal(useTrailingRouteParam('missing'), undefined);
    assert.equal(useTrailingRouteParam('cliente'), 'GRUPPO%20100%');
    assert.equal(logs.length, 1);
});

test('report and elaborazioni preserve customer route text in API filters', () => {
    for (const name of ['ReportPage', 'ElaborazioniPage']) {
        for (const code of ['GRUPPO 100%', 'A%20B', 'A/B', 'A%2FB']) {
            let filters;
            const componentNames = ['ReportGrid', 'Alert', 'GroupSearchInput', 'ElaborazioniGrid',
                'ElaborazioniExportModal', 'PagamentiFormModal', 'ConfirmModal', 'BackButton'];
            const component = { __esModule: true, default: () => null };
            componentNames.forEach(key => { component[key] = () => null; });
            const overrides = {
                react: {
                    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
                    useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
                    useRef: value => ({ current: value })
                },
                'react-router-dom': {
                    useParams: () => ({ cliente: `PARENT:${code}`, anno: '2026' }),
                    useNavigate: () => () => {}
                },
                '../hooks/useTrailingRouteParam': { useTrailingRouteParam: () => `PARENT:${code}` },
                '../hooks/useClienti': { useClienti: () => ({ rowData: [] }) },
                '../hooks/useServices': { useServices: () => ({ services: [] }) },
                '../hooks/useTransactions': { useTransactions: () => ({ transactions: [] }) },
                '../hooks/useReportGlobal': { useReportGlobal: value => {
                    filters = value;
                    return { reportData: [], refetch() {} };
                } },
                '../hooks/useElaborazioni': { useElaborazioni: value => {
                    filters = value;
                    return { summaryData: null, refetch() {} };
                } },
                '../services/api': {}
            };
            for (const dependency of componentNames) {
                overrides[`../components/${dependency}`] = component;
            }
            const page = load(`pages/${name}.jsx`, overrides)[name];
            assert.doesNotThrow(() => page(), `${name}: ${code}`);
            assert.equal(filters.parent_code, code, name);
        }
    }
});

test('entry report synchronization refreshes the latest selection and does nothing after unmount', async () => {
    const source = read('pages/ReportPage.jsx');
    const start = source.indexOf('  // Synchronize when the report grid');
    const end = source.indexOf('  // Handle confirmation action', start);
    for (const unmount of [false, true]) {
        const sync = deferred();
        let finished;
        const calls = [];
        const context = {
            useEffect: fn => { finished = fn(); },
            cliente: '1', initialSyncHandled: { current: false },
            mountedRef: { current: true },
            currentReportRef: { current: { cliente: '1', refetch: async () => calls.push('old') } },
            syncCustomerYearlyBalances: () => sync.promise,
            refetch: () => assert.fail('Must not use captured refetch'),
            setIsSyncing: value => calls.push(value),
            showAlert: message => assert.fail(message), navigate() {}, console
        };
        vm.runInNewContext(source.slice(start, end), context);
        context.currentReportRef.current = { cliente: 'ALL', refetch: async () => calls.push('latest') };
        context.mountedRef.current = !unmount;
        sync.resolve();
        await flush();
        assert.equal(calls.includes('old'), false);
        assert.equal(calls.includes('latest'), !unmount);
        assert.equal(calls.at(-1), unmount ? true : false);
        assert.equal(finished, undefined);
    }
});

test('cash movement form blocks duplicate submissions and permits retry after failure', async () => {
    const source = read('pages/CassaPage.jsx');
    const start = source.indexOf('  const handleSaveForm = async (formData) => {');
    const end = source.indexOf('\n  return (', start);
    for (const fail of [false, true]) {
        const request = deferred();
        const calls = [];
        const context = {
            formSavingRef: { current: false }, setIsFormSaving() {},
            modalType: 'CASH', editingItem: null,
            createCashMovement: payload => { calls.push(payload); return request.promise; },
            setIsModalOpen() {}, setEditingItem() {}, setRefreshTrigger() {}, showAlert() {}
        };
        vm.runInNewContext(source.slice(start, end) + '\nthis.save = handleSaveForm;', context);
        const first = context.save({ date: '2026-10-24', amount: '10', type: 'USCITA', notes: 'test' });
        assert.equal(await context.save({ amount: '10' }), false);
        assert.equal(calls.length, 1);
        if (fail) request.reject(new Error('Save failed'));
        else request.resolve();
        assert.equal(await first, !fail);
        assert.equal(context.formSavingRef.current, false);
        context.createCashMovement = async () => { calls.push('retry'); };
        assert.equal(await context.save({ amount: '10' }), true);
        assert.equal(calls.length, 2);
    }
    assert.match(source, /<fieldset disabled=\{isFormSaving\}/);
    assert.match(source, /!formSavingRef.current && modalMouseDownTarget/);
});

test('grid save boundaries make all grid actions inert only while saving without changing layout elements', () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    const React = require('react');
    for (const file of ['layouts/BaseGridStructure.jsx', 'components/VarieGrid.jsx', 'components/ClientiGrid.jsx']) {
        const opening = read(file).match(/<div inert=\{isSaving[^>]*>/)?.[0];
        assert.ok(opening, file);
        const module = { exports: {} };
        vm.runInNewContext(transformSync(
            `export const Boundary = ({isSaving}) => (${opening}<input /><button>Save</button></div>);`,
            { format: 'cjs', loader: 'jsx', jsx: 'automatic' }
        ).code, { module, require });
        const saving = renderToStaticMarkup(React.createElement(module.exports.Boundary, { isSaving: true }));
        const idle = renderToStaticMarkup(React.createElement(module.exports.Boundary, { isSaving: false }));
        assert.match(saving, /inert=""/, file);
        assert.match(saving, /aria-busy="true"/, file);
        assert.doesNotMatch(idle, /inert=/, file);
    }
});

test('elaborazioni mutations distinguish rejected writes from committed writes with failed refreshes', async () => {
    const source = read('pages/ElaborazioniPage.jsx');
    const start = source.indexOf('  const refreshAfterMutation = async');
    const end = source.indexOf('\n  // Route navigation', start);
    const handlers = [
        ['handleSavePayment', [{ amount: 100 }]],
        ['handleUpdateItem', [1, { price: 100, note: 'New' }]],
        ['handleDeleteItem', [1]],
        ['handleAddItem', [{ category: 'REDDITI', customer_id: 1, service_id: 2, price: 100 }]],
        ['handleUpdatePayment', [1, { amount: 100 }]],
        ['handleDeletePayment', [1]]
    ];
    for (const [handler, args] of handlers) {
        for (const failure of ['write', 'refresh', null]) {
            const calls = { writes: 0, reads: 0, pending: false, alerts: [], errors: [] };
            let failRefresh = failure === 'refresh';
            const write = async () => {
                calls.writes++;
                if (failure === 'write') throw new Error('Write rejected');
            };
            const context = {
                selectedYear: 2026,
                summaryData: { items: [{ id: 1, price: 20, quantity: 1, custom_data: '{"preserved":true}' }] },
                savePayments: write, updateCategoryItem: write, deleteCategoryItem: write,
                createCategoryItem: write, updatePayment: write, deletePayment: write,
                fetchSummaryData: async () => {
                    calls.reads++;
                    if (failRefresh) throw new Error('Refresh failed');
                },
                setRefreshPending: value => { calls.pending = value; },
                showAlert: (message, type) => calls.alerts.push({ message, type }),
                console: { error: (...args) => calls.errors.push(args) }
            };
            vm.runInNewContext(source.slice(start, end) +
                `\nthis.run=${handler};this.retry=refreshAfterMutation;`, context);
            assert.equal(await context.run(...args), failure !== 'write', `${handler}: ${failure}`);
            assert.equal(calls.writes, 1);
            assert.equal(calls.reads, failure === 'write' ? 0 : 1);
            assert.equal(calls.pending, failure === 'refresh');
            assert.equal(calls.alerts[0].type, failure ? 'danger' : 'success');
            if (failure === 'refresh') {
                assert.match(calls.alerts[0].message, /Modifica salvata/);
                assert.equal(calls.errors.length, 1);
                await context.retry('Riepilogo aggiornato.');
                assert.equal(calls.pending, true);
                assert.equal(calls.writes, 1, 'Retry must not repeat the committed mutation');
                failRefresh = false;
                await context.retry('Riepilogo aggiornato.');
                assert.equal(calls.pending, false);
                assert.equal(calls.writes, 1);
                assert.equal(calls.reads, 3);
            }
        }
    }
});
test('elaborazioni refetch waits for data and ignores obsolete responses and unmounts', async () => {
    const requests = [];
    const harness = hookHarness('hooks/useElaborazioni.js', 'useElaborazioni', {
        getElaborazioni: filters => {
            const request = { ...deferred(), filters };
            requests.push(request);
            return request.promise;
        }
    });
    harness.render({ year: 2026, customer_id: 1 });
    const hook = harness.render({ year: 2026, customer_id: 2 });
    let finished = false;
    const refresh = hook.refetch().then(() => { finished = true; });
    await flush();
    assert.equal(finished, false);
    requests[2].resolve({ items: [{ id: 2 }] });
    await refresh;
    requests[0].resolve({ items: [{ id: 1 }] });
    requests[1].reject(new Error('Obsolete'));
    await flush();
    const current = harness.render({ year: 2026, customer_id: 2 });
    assert.equal(current.summaryData.items[0].id, 2);
    assert.equal(current.error, null);
    const failed = current.refetch();
    requests[3].reject(new Error('Current failure'));
    await assert.rejects(failed, /Current failure/);
    assert.equal(harness.render({ year: 2026, customer_id: 2 }).error.message, 'Current failure');
    const pending = current.refetch();
    harness.unmount();
    const writes = harness.writes();
    requests[4].resolve({ items: [] });
    await pending;
    assert.equal(harness.writes(), writes);
});

test('period arrows delegate routing without changing the application file and honor unsaved edits', () => {
    const periodChanges = [];
    const { PeriodNavigation } = load('components/PeriodNavigation.jsx', {
        react: { useMemo: fn => fn() }
    }, { window: { history: { pushState: () => assert.fail('Must not change file URL') } } });
    let confirmation;
    const noop = () => {};
    const tree = PeriodNavigation({
        year: 2026, month: 1, transactionsList: [{ year: 2026, month: 1 }, { year: 2026, month: 2 }],
        hasPendingChanges: true, onPeriodChange: period => periodChanges.push(period),
        setSelectedTransaction: noop, setGlobalDrafts: noop, setHasGlobalDirty: noop,
        setRemovedCustomerIds: noop, setAddedCustomerIds: noop,
        onConfirmModal: data => { confirmation = data; }
    });
    const next = tree.props.children.find(child => child.props?.title?.startsWith('Mese successivo'));
    next.props.onClick();
    assert.equal(periodChanges.length, 0);
    confirmation.onConfirm();
    assert.deepEqual(JSON.parse(JSON.stringify(periodChanges)), [{ year: 2026, month: 2 }]);
});

test('payment form submits payment and discount once and prevents repeated saves while pending', async () => {
    const source = read('components/PagamentiFormModal.jsx');
    const start = source.indexOf('  const handleSubmit = async (e) => {');
    const end = source.indexOf('\n  return (', start);
    const request = deferred();
    const calls = [];
    const alerts = [];
    const context = {
        savingRef: { current: false }, setIsSaving() {},
        modalFormData: { amount: '100', discount_amount: '10', date: '2026-07-01',
            payer_customer_id: 1, payment_method: 'CONTANTI', notes: 'Nota' },
        selectedCustomerForModal: 'Cliente', allCustomers: [{ id: 1, name: 'Cliente' }],
        editingPayment: null, onSave: data => { calls.push(data); return request.promise; },
        showAlert: (...args) => alerts.push(args), console: { error() {} }
    };
    vm.runInNewContext(source.slice(start, end) + '\nthis.submit = handleSubmit;', context);
    const first = context.submit({ preventDefault() {} });
    await context.submit({ preventDefault() {} });
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])).map(record => [record.amount, record.payment_method, record.notes]),
        [[100, 'CONTANTI', 'Nota'], [10, 'SCONTO', 'Sconto - Nota']]);
    assert.equal(context.savingRef.current, true);
    request.reject(new Error('Save failed'));
    await first;
    assert.equal(context.savingRef.current, false);
    assert.equal(alerts.length, 1);
    context.editingPayment = { id: 4, payment_method: 'SCONTO' };
    context.onSave = async (data, id) => {
        assert.equal(id, 4);
        assert.equal(data.amount, 10);
        assert.equal(data.payment_method, 'SCONTO');
    };
    await context.submit({ preventDefault() {} });
});

test('group search ignores obsolete results and retains selected customer names outside current results', async () => {
    const source = read('components/GroupSearchInput.jsx');
    const start = source.indexOf('  const fetchGroupedDataFromBackend = async');
    const end = source.indexOf('\n  const openDropdown', start);
    const requests = [];
    const state = { customers: [], parents: [], loading: false, error: '' };
    const context = {
        requestIdRef: { current: 0 }, knownCustomers: { current: new Map() },
        setIsLoading: value => { state.loading = value; },
        setSearchError: value => { state.error = value; },
        setCustomerOptions: value => { state.customers = value; },
        setParentOptions: value => { state.parents = value; },
        getCustomersGroupedSearch: () => { const pending = deferred(); requests.push(pending); return pending.promise; },
        console: { error() {} }
    };
    vm.runInNewContext(source.slice(start, end) + '\nthis.fetch = fetchGroupedDataFromBackend;', context);
    const old = context.fetch('old');
    const current = context.fetch('new');
    requests[1].resolve({ customers: [{ id: 123, name: 'Selected', customer_code: 'ABC' }], parents: [] });
    await current;
    requests[0].reject(new Error('Obsolete'));
    await old;
    assert.equal(state.customers[0].id, 123);
    assert.equal(state.error, '');
    const reset = context.fetch('');
    requests[2].resolve({ customers: [], parents: [] });
    await reset;
    Object.assign(context, { selectedFilterValue: '123', customerOptions: state.customers, availableCustomers: [] });
    const labelStart = source.indexOf('  const displaySelectedText =');
    const labelEnd = source.indexOf('\n  // Backend request', labelStart);
    vm.runInNewContext(source.slice(labelStart, labelEnd) + '\nthis.label = displaySelectedText;', context);
    assert.equal(context.label(), 'Selected [ABC]');
});

test('VARIE stages new services and manual rows in one commit without clearing failed edits', async () => {
    const source = read('components/VarieGrid.jsx');
    const start = source.indexOf('  const handleSaveAllChanges = async () => {');
    const end = source.indexOf('\n  const handleCreateService', start);
    for (const fail of [false, true]) {
        const calls = { operations: null, cleared: false, replaced: false, alerts: [] };
        const { createItemBatch } = load('utils/itemBatch.js', { '../services/api': {
            saveBatch: async operations => {
                calls.operations = operations;
                if (fail) throw new Error('Commit failed');
                return { rows: [], services: [], results: operations.map((_, i) => ({ id: i + 100 })) };
            }
        } });
        const noop = () => {};
        const context = {
            createItemBatch, gridRef: { current: null }, year: 2026, month: 7,
            selectedTransaction: { year: 2026, month: 7 },
            getServices: async () => [], sortServices: list => list, filterVarieServices: list => list,
            deletedIds: [], manualRows: [{ customerId: 1, subcategory: 'Nuova', price: 25, quantity: 2, note: 'Nota' }],
            localRowData: [{ id: 1, customerId: 1, subcategory: 'Nuova', price: 25, quantity: 2, note: 'Nota' }],
            rawRowData: [{ id: 1, customer_id: 1, service_id: 2, price: 10, quantity: 1, custom_data: '{}' }],
            setIsSaving: noop, setServices: noop, setDeletedIds: noop, setManualRows: noop, setHasUnsaved: noop,
            setHasUnsavedChanges: () => { calls.cleared = true; },
            replaceRows: () => { calls.replaced = true; },
            setSessionNewIds: updater => updater(new Set()), knownIds: { current: new Set() },
            showAlert: (message, type) => calls.alerts.push(type), console: { error() {} }
        };
        vm.runInNewContext(source.slice(start, end) + '\nthis.run = handleSaveAllChanges;', context);
        await context.run();
        assert.equal(calls.operations.length, 3);
        assert.equal(calls.operations[0].table, 'services');
        assert.equal(calls.operations[1].serviceRef, calls.operations[0].ref);
        assert.equal(calls.operations[2].serviceRef, calls.operations[0].ref);
        assert.equal(calls.cleared, !fail);
        assert.equal(calls.replaced, !fail);
        assert.deepEqual(calls.alerts, [fail ? 'error' : 'success']);
    }
});

test('customer mutations use committed snapshots and reject failed batches without a second read', async () => {
    const initial = deferred();
    const calls = [];
    let fail = false;
    const harness = hookHarness('hooks/useClienti.js', 'useClienti', {
        getClienti: () => initial.promise,
        saveBatch: async (operations, options) => {
            calls.push({ operations, options });
            if (fail) throw new Error('Commit rejected');
            return { customers: [{ id: 1, name: 'Updated' }] };
        }
    });
    const hook = harness.render();
    await flush();
    const edited = await hook.editSingleCliente(1, { name: 'Updated' });
    assert.equal(edited.success, true);
    initial.resolve([{ id: 1, name: 'Old' }]);
    await flush();
    assert.equal(harness.render().rowData[0].name, 'Updated');
    fail = true;
    const result = await hook.saveClienti([{ id: 1, name: 'New', customer_code: 'A' }], [2]);
    assert.equal(result.success, false);
    assert.equal(harness.render().rowData[0].name, 'Updated');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1].operations)).map(operation => [operation.method, operation.id]),
        [['DELETE', 2], ['PUT', 1]]);
    assert.equal(calls[1].options.readCustomers, true);
});

test('period hooks cancel previous requests and do not overwrite committed data with obsolete errors', async () => {
    for (const name of ['Contabilita', 'Redditi', 'Varie']) {
        const requests = [];
        const harness = hookHarness(`hooks/use${name}.js`, `use${name}`, {
            [`get${name}`]: (year, month, query, signal) => {
                const request = { ...deferred(), signal };
                requests.push(request);
                return request.promise;
            }
        });
        harness.render({ year: 2026, month: 1 });
        const hook = harness.render({ year: 2026, month: 2 });
        assert.equal(requests[0].signal.aborted, true);
        requests[0].reject(new Error('Obsolete error'));
        requests[1].resolve([{ id: 2 }]);
        await flush();
        assert.equal(harness.render({ year: 2026, month: 2 }).rowData[0].id, 2);
        const loading = hook.fetchData();
        hook.replaceRows([{ id: 3 }]);
        requests[2].reject(new Error('Old request after commit'));
        await loading;
        const current = harness.render({ year: 2026, month: 2 });
        assert.equal(current.rowData[0].id, 3);
        assert.equal(current.error, null);
        assert.equal(current.loading, false);
        assert.equal(harness.logs.length, 0);
    }
});
