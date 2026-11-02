import { useState, useEffect, useMemo, useCallback } from 'react';
import { useContabilita } from '../hooks/useContabilita';
import { createItemBatch } from '../utils/itemBatch';
import {
  getClienti,
  getServices,
  updateService,
  createService,
  getTransactions,
  updateTransaction
} from '../services/api';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { BaseGridStructure } from '../layouts/BaseGridStructure';
import Alert from './Alert';
import ConfirmModal from './ConfirmModal';

/**
 * ContabilitaGrid component manages the accounting grid view, handling customer data,
 * accounting services, transaction period states, draft modifications, and status validations.
 */
export const ContabilitaGrid = ({
  year = 2026,
  month = 7,
  transactionId,
  onBack,
  activeTab,
  setActiveTab,
  onPeriodChange,
  onDirtyChange
}) => {
  const { setHasUnsaved } = useUnsavedChanges();

  // States for custom Alert and ConfirmModal notifications
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success' });
  const [confirmState, setConfirmState] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const showAlert = (message, type = 'success') => {
    setAlertInfo({ message, type });
  };

  const closeConfirm = () => {
    setConfirmState({ show: false, title: '', message: '', onConfirm: null });
  };

  // Determines the initial transaction period object from props or transactionId parameter
  const getInitialTransaction = () => {
    if (typeof transactionId === 'object' && transactionId !== null) {
      return {
        year: Number(transactionId.year || year),
        month: Number(transactionId.month || month)
      };
    }
    return { year: Number(year), month: Number(month) };
  };

  const [selectedTransaction, setSelectedTransaction] = useState(getInitialTransaction);

  const targetYear = typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.year || year) : Number(year);
  const targetMonth = typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.month || month) : Number(month);

  if (selectedTransaction.year !== targetYear || selectedTransaction.month !== targetMonth) {
    setSelectedTransaction({ year: targetYear, month: targetMonth });
  }

  const [transactionsList, setTransactionsList] = useState([]);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [rowHeights, setRowHeights] = useState({});

  // Tracks and updates dynamic row heights mapped by customer ID
  const handleRowHeightChange = useCallback((customerId, height) => {
    setRowHeights((prev) => {
      if (prev[customerId] === height) return prev;
      return { ...prev, [customerId]: height };
    });
  }, []);

  const [globalDrafts, setGlobalDrafts] = useState({});
  const [removedCustomerIds, setRemovedCustomerIds] = useState([]);
  const [addedCustomerIds, setAddedCustomerIds] = useState([]);
  const [resetKey, setResetKey] = useState(0);

  // Automatically clears local drafts and tracking lists when the selected period changes
  const [prevSelectedTransaction, setPrevSelectedTransaction] = useState(selectedTransaction);
  if (prevSelectedTransaction.year !== selectedTransaction.year || prevSelectedTransaction.month !== selectedTransaction.month) {
    setPrevSelectedTransaction(selectedTransaction);
    if (Object.keys(globalDrafts).length > 0 || removedCustomerIds.length > 0 || addedCustomerIds.length > 0) {
      setGlobalDrafts({});
      setRemovedCustomerIds([]);
      setAddedCustomerIds([]);
    }
  }

  // Fetches accounting transactions list when the selected transaction period changes
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = await getTransactions('CONTABILITA');
        setTransactionsList(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Errore caricamento transazioni per navigazione contabilità:", err);
      }
    };
    fetchTransactions();
  }, [selectedTransaction]);

  // Finds the transaction object matching the currently selected year and month
  const currentTransactionObj = useMemo(() => {
    return transactionsList.find(
      (t) => Number(t.year) === Number(selectedTransaction.year) && Number(t.month) === Number(selectedTransaction.month)
    );
  }, [transactionsList, selectedTransaction]);

  // Evaluates whether the current transaction status is validated
  const isTransactionValidated = currentTransactionObj?.status === 1 || currentTransactionObj?.status === 'validated' || currentTransactionObj?.is_validated === true || currentTransactionObj?.is_validated === 1;

  // Toggles the validation status of the current accounting transaction
  const handleToggleStatus = async () => {
    const newStatus = isTransactionValidated ? 0 : 1;
    try {
      setIsStatusSaving(true);
      await updateTransaction('CONTABILITA', selectedTransaction.year, selectedTransaction.month, { status: newStatus });
      const data = await getTransactions('CONTABILITA');
      setTransactionsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Errore durante l'aggiornamento dello stato contabilità:", err);
      showAlert("Errore durante l'aggiornamento dello stato del documento", "error");
    } finally {
      setIsStatusSaving(false);
    }
  };

  const {
    rowData,
    replaceRows,
    error: loadError
  } = useContabilita(selectedTransaction);

  useEffect(() => {
    if (loadError) showAlert(`Errore caricamento dati: ${loadError.message}`, 'error');
  }, [loadError]);

  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [customerToAdd, setCustomerToAdd] = useState('');
  const dateFilter = '';

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [draggedServiceId, setDraggedServiceId] = useState(null);

  const [serviceSearchFilter, setServiceSearchFilter] = useState('');
  const [newSubcategoryInput, setNewSubcategoryInput] = useState('');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [inlineSubcategoryValue, setInlineSubcategoryValue] = useState('');

  // Sorts services based on their display order configuration
  const sortServices = (servList) =>
    [...servList].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );

  // Filters services matching the 'CONTABILITA' category
  const filterContabilitaServices = (servicesList) =>
    (Array.isArray(servicesList) ? servicesList : []).filter(
      (service) => service.category === 'CONTABILITA'
    );

  // Reloads accounting services from API and updates sorted state
  const reloadServices = async () => {
    try {
      const servicesData = await getServices();
      setServices(sortServices(filterContabilitaServices(servicesData)));
    } catch (err) {
      console.error("Errore ricaricamento servizi contabilità:", err);
    }
  };

  // Initial data loading for customers and services on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [customersData, servicesData] = await Promise.all([
          getClienti(),
          getServices()
        ]);

        setAllCustomers(Array.isArray(customersData) ? customersData : []);
        setServices(sortServices(filterContabilitaServices(servicesData)));
      } catch (err) {
        console.error('Errore caricamento dati contabilità:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Extracts active customer IDs from current row data
  const activeCustomerIdsFromData = useMemo(() => {
    if (rowData && rowData.length > 0) {
      return rowData.map((item) => item.customer_id);
    }
    return [];
  }, [rowData]);

  // Filters services to display only active ones
  const visibleServices = useMemo(() => {
    return services.filter(
      (service) => service.is_active === 1 || service.is_active === true
    );
  }, [services]);

  // Computes visible customers combining data rows, selections, additions, and filtering out removed items
  const visibleCustomers = useMemo(() => {
    const baseIds = activeCustomerIdsFromData.length > 0 ? activeCustomerIdsFromData : [];
    const combinedIds = Array.from(new Set([...baseIds, ...selectedCustomerIds, ...addedCustomerIds]));
    const activeIds = combinedIds.filter((id) => !removedCustomerIds.includes(id));

    const filtered = allCustomers.filter((customer) => {
      if (!activeIds.includes(customer.id)) return false;
      if (!dateFilter) return true;
      const customerDateStr = customer.created_at || customer.data || '';
      return customerDateStr.includes(dateFilter);
    });

    return filtered.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [allCustomers, selectedCustomerIds, removedCustomerIds, addedCustomerIds, activeCustomerIdsFromData, dateFilter]);

  // Computes available customers that can be added to the current grid view
  const availableCustomers = useMemo(() => {
    const currentActive = selectedCustomerIds.length > 0
      ? selectedCustomerIds.filter((id) => !removedCustomerIds.includes(id))
      : activeCustomerIdsFromData.filter((id) => !removedCustomerIds.includes(id));
    return allCustomers.filter((customer) => !currentActive.includes(customer.id));
  }, [allCustomers, selectedCustomerIds, removedCustomerIds, activeCustomerIdsFromData]);

  // Creates a fast lookup map for row items indexed by customer and service ID combination
  const matrixMap = useMemo(() => {
    const map = {};
    (rowData || []).forEach((item) => {
      map[`${item.customer_id}_${item.service_id}`] = item;
    });
    return map;
  }, [rowData]);

  // Handles updating cell draft values in local state
  const handleCellDataChange = useCallback(
    (customerId, serviceId, item, values) => {
      setGlobalDrafts((prev) => ({
        ...prev,
        [`${customerId}_${serviceId}`]: {
          customerId,
          serviceId,
          item,
          values
        }
      }));
    },
    []
  );

  // Checks whether there are uncommitted changes (drafts, additions, or deletions)
  const hasPendingChanges =
    Object.keys(globalDrafts).length > 0 ||
    removedCustomerIds.length > 0 ||
    addedCustomerIds.length > 0;

  // Notifies parent components and global state when pending changes status changes
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(hasPendingChanges);
    }
    setHasUnsaved(hasPendingChanges);
  }, [hasPendingChanges, onDirtyChange, setHasUnsaved]);

  // Cancels all pending changes after user confirmation
  const handleCancelChanges = (e) => {
    if (e && e.currentTarget) {
      e.currentTarget.blur();
    }

    if (hasPendingChanges) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Sei sicuro di voler annullare tutte le modifiche non salvate?",
        onConfirm: () => {
          closeConfirm();
          setGlobalDrafts({});
          setRemovedCustomerIds([]);
          setAddedCustomerIds([]);
          setSelectedCustomerIds([]);
          setResetKey((prev) => prev + 1);
          setHasUnsaved(false);
          showAlert("Modifiche annullate.", "success");
        }
      });
      return;
    }
    setGlobalDrafts({});
    setRemovedCustomerIds([]);
    setAddedCustomerIds([]);
    setSelectedCustomerIds([]);
    setResetKey((prev) => prev + 1);
    setHasUnsaved(false);
  };

  // Clears all quantities and notes across visible customer and service cells
  const handleClearQuantitiesAndNotes = (e) => {
    if (e && e.currentTarget) {
      e.currentTarget.blur();
    }

    const newDrafts = { ...globalDrafts };

    visibleCustomers.forEach((customer) => {
      visibleServices.forEach((service) => {
        const itemKey = `${customer.id}_${service.id}`;
        const item = matrixMap[itemKey];
        const currentDraft = globalDrafts[itemKey];

        const currentPrice = currentDraft
          ? currentDraft.values.price
          : (item && item.price !== undefined && item.price !== null ? item.price : 0);

        const updatedItem = item ? {
          ...item,
          custom_data: JSON.stringify({ note: '' }),
          quantity: 0
        } : {
          customer_id: customer.id,
          service_id: service.id,
          price: currentPrice,
          quantity: 0,
          custom_data: JSON.stringify({ note: '' })
        };

        newDrafts[itemKey] = {
          customerId: customer.id,
          serviceId: service.id,
          item: updatedItem,
          values: {
            price: currentPrice,
            quantity: 0,
            note: ''
          }
        };
      });
    });

    setGlobalDrafts(newDrafts);
    setResetKey((prev) => prev + 1);
  };

  // Persists all pending changes, deletions, and additions to the database backend
  const handleSaveAllChanges = async (e) => {
    if (e && e.currentTarget) {
      e.currentTarget.blur();
    }

    try {
      setIsSaving(true);
      const activeYear = Number(selectedTransaction?.year || year);
      const activeMonth = Number(selectedTransaction?.month || month);
      const batch = createItemBatch('CONTABILITA', activeYear, activeMonth);
      const { addItem, deleteItem, handleCellValueChanged } = batch;

      for (const custId of removedCustomerIds) {
        const customerItems = (rowData || []).filter((item) => item.customer_id === custId);
        for (const item of customerItems) {
          if (item && item.id) {
            await deleteItem(item.id);
          }
        }
      }

      for (const customerId of addedCustomerIds) {
        if (removedCustomerIds.includes(customerId)) continue;
        const hasAnyDraft = Object.keys(globalDrafts).some((key) => key.startsWith(`${customerId}_`));
        const hasExistingRow = (rowData || []).some((item) => item.customer_id === customerId);

        if (!hasAnyDraft && !hasExistingRow && visibleServices.length > 0) {
          const firstService = visibleServices[0];
          await addItem({
            year: activeYear,
            month: activeMonth,
            customer_id: customerId,
            quantity: 0,
            price: 0.0,
            service_id: firstService.id,
            custom_data: JSON.stringify({ note: '' })
          });
        }
      }

      const draftEntries = Object.values(globalDrafts);
      for (const draft of draftEntries) {
        const { customerId, serviceId, values } = draft;

        if (removedCustomerIds.includes(customerId)) continue;

        const { price: newPrice, quantity: newQty, note: newNote } = values;

        const parsedPrice = (newPrice === '' || newPrice === null || isNaN(newPrice)) ? 0 : Number(newPrice);
        const parsedQty = (newQty === '' || newQty === null || isNaN(newQty)) ? 0 : Number(newQty);
        const trimmedNote = newNote !== undefined && newNote !== null ? String(newNote).trim() : '';

        const hasValidData = parsedPrice !== 0 || parsedQty !== 0 || trimmedNote !== '';

        const currentItemInDb = (rowData || []).find(
          r => r.customer_id === customerId && r.service_id === Number(serviceId)
        );

        if (currentItemInDb && !hasValidData) {
          await deleteItem(currentItemInDb.id);
        } else if (!currentItemInDb && hasValidData) {
          await addItem({
            year: activeYear,
            month: activeMonth,
            customer_id: customerId,
            service_id: Number(serviceId),
            quantity: parsedQty,
            price: parsedPrice,
            custom_data: JSON.stringify({ note: trimmedNote })
          });
        } else if (currentItemInDb && hasValidData) {
          if (currentItemInDb.price !== parsedPrice) {
            await handleCellValueChanged({ data: currentItemInDb, field: 'price', newValue: parsedPrice });
          }
          if (currentItemInDb.quantity !== parsedQty) {
            await handleCellValueChanged({ data: currentItemInDb, field: 'quantity', newValue: parsedQty });
          }

          let currentNote = '';
          try {
            currentNote = typeof currentItemInDb.custom_data === 'string'
              ? JSON.parse(currentItemInDb.custom_data || '{}').note || ''
              : currentItemInDb.custom_data?.note || '';
          } catch (parseErr) {
            console.error("Errore parsing custom_data:", parseErr);
          }

          if (currentNote !== trimmedNote) {
            await handleCellValueChanged({
              data: currentItemInDb,
              field: 'note',
              newValue: trimmedNote
            });
          }
        }
      }

      const saved = await batch.commit();
      replaceRows(saved.rows);

      setGlobalDrafts({});
      setRemovedCustomerIds([]);
      setAddedCustomerIds([]);
      setSelectedCustomerIds([]);
      setResetKey((prev) => prev + 1);
      setHasUnsaved(false);

      showAlert("Modifiche salvate con successo nel database!", "success");
    } catch (e) {
      console.error('Errore durante il salvataggio contabilità:', e);
      showAlert("Errore durante il salvataggio delle modifiche.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Stages a customer row for removal from the grid view
  const handleRemoveCustomerRow = (customer) => {
    setRemovedCustomerIds((prev) => (prev.includes(customer.id) ? prev : [...prev, customer.id]));
    setSelectedCustomerIds((prev) => prev.filter((id) => id !== customer.id));
    setAddedCustomerIds((prev) => prev.filter((id) => id !== customer.id));

    setGlobalDrafts((prev) => {
      const newDrafts = { ...prev };
      Object.keys(newDrafts).forEach((key) => {
        if (key.startsWith(`${customer.id}_`)) {
          delete newDrafts[key];
        }
      });
      return newDrafts;
    });
  };

  // Adds a customer row to the active grid view
  const handleAddCustomerRow = () => {
    if (!customerToAdd) return;

    const id = isNaN(Number(customerToAdd)) ? customerToAdd : Number(customerToAdd);

    if (!selectedCustomerIds.includes(id)) {
      setSelectedCustomerIds((prev) => [...prev, id]);
    }
    setRemovedCustomerIds((prev) => prev.filter((item) => item !== id));
    setAddedCustomerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCustomerToAdd('');
  };

  // Creates a new accounting service category subcategory item
  const handleCreateService = async (e) => {
    e.preventDefault();
    if (!newSubcategoryInput.trim()) return;

    try {
      await createService({
        category: 'CONTABILITA',
        subcategory: newSubcategoryInput.trim(),
        is_active: 1,
        display_order: services.length + 1
      });
      setNewSubcategoryInput('');
      await reloadServices();
      showAlert("Servizio creato con successo.", "success");
    } catch (err) {
      console.error("Errore creazione servizio contabilità:", err);
      showAlert("Errore durante la creazione del servizio.", "error");
    }
  };

  // Toggles active state for a specific accounting service
  const handleToggleServiceActive = async (serv) => {
    const newActive = serv.is_active === 1 || serv.is_active === true ? 0 : 1;
    try {
      await updateService(serv.id, {
        ...serv,
        is_active: newActive
      });
      await reloadServices();
    } catch (err) {
      console.error("Errore aggiornamento stato servizio contabilità:", err);
    }
  };

  // Saves inline service name updates
  const handleSaveInlineService = async (serv) => {
    if (!inlineSubcategoryValue.trim()) return;
    try {
      await updateService(serv.id, {
        ...serv,
        subcategory: inlineSubcategoryValue.trim()
      });
      setEditingServiceId(null);
      setInlineSubcategoryValue('');
      await reloadServices();
      showAlert("Servizio aggiornato.", "success");
    } catch (err) {
      console.error("Errore modifica nome servizio contabilità:", err);
      showAlert("Errore durante la modifica del servizio.", "error");
    }
  };

  // Handles drag start event for column/service reordering
  const handleDragStart = (e, serviceId) => {
    setDraggedServiceId(serviceId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Handles dropping reordered services and persists the new order
  const handleDrop = async (e, targetServiceId) => {
    e.preventDefault();
    if (draggedServiceId === null || draggedServiceId === targetServiceId) return;

    const draggedIndex = services.findIndex((s) => s.id === draggedServiceId);
    const targetIndex = services.findIndex((s) => s.id === targetServiceId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newServices = [...services];
    const [movedItem] = newServices.splice(draggedIndex, 1);
    newServices.splice(targetIndex, 0, movedItem);

    const updatedWithOrder = newServices.map((srv, idx) => ({ ...srv, display_order: idx + 1 }));
    setServices(updatedWithOrder);
    setDraggedServiceId(null);

    try {
      await Promise.all(
        updatedWithOrder.map((srv) => updateService(srv.id, { ...srv, display_order: srv.display_order }))
      );
    } catch (err) {
      console.error("Errore salvataggio ordine colonne contabilità:", err);
      reloadServices();
    }
  };

  return (
    <div className="position-relative h-100 d-flex flex-column">
      {/* Alert notification component */}
      <Alert
        message={alertInfo.message}
        type={alertInfo.type}
        onClose={() => setAlertInfo({ message: '', type: 'success' })}
      />

      {/* Confirmation modal component */}
      <ConfirmModal
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Base grid layout structure component rendering accounting data and tools */}
      <BaseGridStructure
        loading={loading}
        onBack={onBack}
        category="CONTABILITA"
        selectedTransaction={selectedTransaction}
        transactionsList={transactionsList}
        hasUnsavedChanges={hasPendingChanges}
        onPeriodChange={(y, m) => {
          setSelectedTransaction({ year: Number(y), month: Number(m) });
          if (onPeriodChange) onPeriodChange(y, m);
        }}
        setSelectedTransaction={setSelectedTransaction}
        setGlobalDrafts={setGlobalDrafts}
        setRemovedCustomerIds={setRemovedCustomerIds}
        setAddedCustomerIds={setAddedCustomerIds}
        customerToAdd={customerToAdd}
        setCustomerToAdd={setCustomerToAdd}
        availableCustomers={availableCustomers}
        handleAddCustomerRow={handleAddCustomerRow}
        handleCancelChanges={handleCancelChanges}
        handleSaveAllChanges={handleSaveAllChanges}
        isSaving={isSaving}
        handleClearQuantitiesAndNotes={handleClearQuantitiesAndNotes}
        isStatusSaving={isStatusSaving}
        isTransactionValidated={isTransactionValidated}
        handleToggleStatus={handleToggleStatus}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        visibleServices={visibleServices}
        visibleCustomers={visibleCustomers}
        matrixMap={matrixMap}
        globalDrafts={globalDrafts}
        resetKey={resetKey}
        rowHeights={rowHeights}
        handleRowHeightChange={handleRowHeightChange}
        handleCellDataChange={handleCellDataChange}
        handleRemoveCustomerRow={handleRemoveCustomerRow}
        handleDragStart={handleDragStart}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        isServiceModalOpen={isServiceModalOpen}
        setIsServiceModalOpen={setIsServiceModalOpen}
        services={services}
        serviceSearchFilter={serviceSearchFilter}
        setServiceSearchFilter={setServiceSearchFilter}
        newSubcategoryInput={newSubcategoryInput}
        setNewSubcategoryInput={setNewSubcategoryInput}
        handleCreateService={handleCreateService}
        editingServiceId={editingServiceId}
        setEditingServiceId={setEditingServiceId}
        inlineSubcategoryValue={inlineSubcategoryValue}
        setInlineSubcategoryValue={setInlineSubcategoryValue}
        handleSaveInlineService={handleSaveInlineService}
        handleToggleServiceActive={handleToggleServiceActive}
        isCedolini={false}
      />
    </div>
  );
};

export default ContabilitaGrid;