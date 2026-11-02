const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function harness() {
    const module = { exports: {} };
    const states = [];
    const effects = [];
    let slot = 0;
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ServiceManagementModal.jsx'), 'utf8'), {
        loader: 'jsx', jsx: 'automatic', format: 'cjs'
    }).code, {
        module,
        require: name => name === 'react' ? {
            useRef: () => ({ current: null }),
            useState: initial => {
                const index = slot++;
                if (!(index in states)) states[index] = initial;
                return [states[index], value => { states[index] = value; }];
            },
            useEffect: effect => effects.push(effect)
        } : require(name),
        window: { addEventListener() {}, removeEventListener() {} },
        alert: () => { throw new Error('Native blocking alerts must not be used'); }
    });
    const props = {
        isOpen: true,
        services: [
            { id: 1, subcategory: 'Servizio', is_active: 1 },
            { id: 2, subcategory: 'Altro', is_active: 1 }
        ],
        serviceSearchFilter: '', newSubcategoryInput: '', inlineSubcategoryValue: '',
        setNewSubcategoryInput: value => { props.newSubcategoryInput = value; },
        setInlineSubcategoryValue: value => { props.inlineSubcategoryValue = value; },
        handleCreateService: () => { calls.creates++; },
        handleSaveInlineService: () => { calls.edits++; },
        showAlert: (message, type) => { calls.alerts.push({ message, type }); },
        category: 'PAGHE'
    };
    const calls = { creates: 0, edits: 0, alerts: [] };
    const render = () => {
        slot = 0;
        effects.length = 0;
        const tree = module.exports.ServiceManagementModal(props);
        effects.forEach(effect => effect());
        return tree;
    };
    return { props, calls, render };
}

function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
        const result = find(child, predicate);
        if (result) return result;
    }
    return null;
}

test('duplicate creation sends a nonblocking alert and permits an immediate valid retry', () => {
    const { props, calls, render } = harness();
    props.newSubcategoryInput = '  SERVIZIO  ';
    find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(calls.creates, 0);
    assert.deepEqual(calls.alerts, [{ message: 'Esiste già un servizio con questo nome!', type: 'danger' }]);
    assert.equal(find(render(), node => node.props?.role === 'alert'), null);
    find(render(), node => node.type === 'input' && node.props.placeholder === 'Nome nuovo servizio...').props.onChange({ target: { value: 'Nuovo servizio' } });
    find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(calls.creates, 1);
});

test('duplicate rename permits a corrected retry and still excludes the edited service itself', () => {
    const { props, calls, render } = harness();
    props.editingServiceId = 1;
    props.inlineSubcategoryValue = ' ALTRO ';
    find(render(), node => node.props?.title === 'Salva').props.onClick();
    assert.equal(calls.edits, 0);
    assert.deepEqual(calls.alerts, [{ message: 'Esiste già un servizio con questo nome!', type: 'danger' }]);
    assert.equal(find(render(), node => node.props?.role === 'alert'), null);
    find(render(), node => node.type === 'input' && node.props.autoFocus).props.onChange({ target: { value: 'Servizio' } });
    find(render(), node => node.props?.title === 'Salva').props.onClick();
    assert.equal(calls.edits, 1);
});

test('closing clears duplicate errors and preserves Cedolini prefix validation', () => {
    const { props, calls, render } = harness();
    props.isCedolini = true;
    props.services = [{ id: 1, subcategory: 'Cedolini Ordinari', is_active: 1 }];
    props.newSubcategoryInput = 'Cedolini Ordinari';
    find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(calls.alerts.length, 1);
    props.isOpen = false;
    assert.equal(render(), null);
    props.isOpen = true;
    props.newSubcategoryInput = 'Cedolini ';
    find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(calls.creates, 0);
    props.newSubcategoryInput = 'Cedolini Straordinari';
    find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(calls.creates, 1);
    assert.equal(calls.alerts.length, 1);
});
