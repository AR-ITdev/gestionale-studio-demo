import { saveBatch } from '../services/api';

export const createItemBatch = (category, year, month) => {
  const operations = [];
  const updates = new Map();
  const addItem = data => {
    const operationIndex = operations.length;
    operations.push({ table: 'items', method: 'POST', data: { category, year, month, ...data } });
    return { operationIndex };
  };
  const deleteItem = id => operations.push({ table: 'items', method: 'DELETE', id });
  const handleCellValueChanged = ({ data, field, newValue }) => {
    let payload;
    if (field === 'note') {
      let custom;
      try {
        custom = typeof data.custom_data === 'string' ? JSON.parse(data.custom_data || '{}') : (data.custom_data || {});
      } catch {
        custom = {};
      }
      payload = { custom_data: JSON.stringify({ ...custom, note: newValue }) };
    } else {
      payload = { [field]: newValue };
    }
    const existing = updates.get(data.id);
    if (existing) Object.assign(existing.data, payload);
    else {
      const operation = { table: 'items', method: 'PUT', id: data.id, data: payload };
      operations.push(operation);
      updates.set(data.id, operation);
    }
  };
  const addService = data => {
    const ref = `service-${operations.length}`;
    operations.push({ table: 'services', method: 'POST', data, ref });
    return ref;
  };
  const setServiceReference = (operationIndex, serviceRef) => {
    operations[operationIndex].serviceRef = serviceRef;
  };
  const setItemServiceReference = (id, serviceRef) => {
    const operation = updates.get(id);
    operation.serviceRef = serviceRef;
  };
  return {
    addItem, deleteItem, handleCellValueChanged, addService, setServiceReference, setItemServiceReference,
    commit: () => saveBatch(operations, { period: { category, year, month } })
  };
};
