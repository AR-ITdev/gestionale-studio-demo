import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRedditi } from '../hooks/useRedditi';
import { createItemBatch } from '../utils/itemBatch';
import { getClienti, getServices, updateService, createService, getTransactions, updateTransaction } from '../services/api';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { BaseGridStructure } from '../layouts/BaseGridStructure';
import Alert from './Alert';
import ConfirmModal from './ConfirmModal';

/**
 * RedditiGrid component manages the income tax services grid structure,
 * handling period transaction states, dynamic service configuration, customer selections,
 * matrix cell draft updates, and unpersisted changes tracking.
 */
export const RedditiGrid = ({
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

  // Stati per Alert e ConfirmModal personalizzati
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

  // Helper function to initialize transaction year and month from props or transactionId object
  const getInitialTransaction = useCallback(() => {
    if (typeof transactionId === 'object' && transactionId !== null) {
      return {
        year: Number(transactionId.year || year),
        month: Number(transactionId.month || month)
      };
    }
    return { year: Number(year), month: Number(month) };
  }, [transactionId, year, month]);

  const [selectedTransaction, setSelectedTransaction] = useState(getInitialTransaction);
  const [prevPropsKey, setPrevPropsKey] = useState({ year, month, transactionId });

  const targetYear = typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.year || year) : Number(year);
  const targetMonth = typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.month || month) : Number(month);

  // Synchronize internal transaction state when outer props change
  if (prevPropsKey.year !== year || prevPropsKey.month !== month || prevPropsKey.transactionId !== transactionId) {
    setPrevPropsKey({ year, month, transactionId });
    if (selectedTransaction.year !== targetYear || selectedTransaction.month !== targetMonth) {
      setSelectedTransaction({ year: targetYear, month: targetMonth });
    }
  }

  const [transactionsList, setTransactionsList] = useState([]);
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [rowHeights, setRowHeights] = useState({});

  // Callback to track row heights dynamically for responsive rendering
  const handleRowHeightChange = useCallback((customerId, height) => {
    setRowHeights((prev) => ({ ...prev, [customerId]: height }));
  }, []);

  // Fetch all REDDITI transactions on mount or when selected transaction period shifts
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = await getTransactions('REDDITI');
        setTransactionsList(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Errore durante il recupero delle transazioni REDDITI:", error);
      }
    };
    fetchTransactions();
  }, [selectedTransaction]);

  // Identify the active transaction object matching the selected year and month
  const currentTransactionObj = useMemo(() => {
    return transactionsList.find(
      (t) => Number(t.year) === Number(selectedTransaction.year) && Number(t.month) === Number(selectedTransaction.month)
    );
  }, [transactionsList, selectedTransaction]);

  // Determine whether the current transaction period is validated or approved
  const isTransactionValidated = currentTransactionObj?.status === 1 || currentTransactionObj?.status === 'validated' || currentTransactionObj?.is_validated === true || currentTransactionObj?.is_validated === 1;

  // Toggle transaction validation status between active and validated states
  const handleToggleStatus = async () => {
    const newStatus = isTransactionValidated ? 0 : 1;
    try {
      setIsStatusSaving(true);
      await updateTransaction('REDDITI', selectedTransaction.year, selectedTransaction.month, { status: newStatus });
      const data = await getTransactions('REDDITI');
      setTransactionsList(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Errore durante l'aggiornamento dello stato della transazione:", error);
      showAlert("Errore durante l'aggiornamento dello stato", "error");
    } finally {
      setIsStatusSaving(false);
    }
  };

  // Custom hook to fetch and manipulate income tax grid row data
  const { rowData, replaceRows, error: loadError } = useRedditi(selectedTransaction);

  useEffect(() => {
    if (loadError) showAlert(`Errore caricamento dati: ${loadError.message}`, 'error');
  }, [loadError]);

  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [customerToAdd, setCustomerToAdd] = useState('');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [globalDrafts, setGlobalDrafts] = useState({});
  const [removedCustomerIds, setRemovedCustomerIds] = useState([]);
  const [addedCustomerIds, setAddedCustomerIds] = useState([]);
  const [resetKey, setResetKey] = useState(0);

  const [prevSelectedYear, setPrevSelectedYear] = useState(selectedTransaction.year);
  const [prevSelectedMonth, setPrevSelectedMonth] = useState(selectedTransaction.month);

  // Reset drafts and customer modifications when switching transaction periods
  if (prevSelectedYear !== selectedTransaction.year || prevSelectedMonth !== selectedTransaction.month) {
    setPrevSelectedYear(selectedTransaction.year);
    setPrevSelectedMonth(selectedTransaction.month);
    setGlobalDrafts({});
    setRemovedCustomerIds([]);
    setAddedCustomerIds([]);
  }

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [draggedServiceId, setDraggedServiceId] = useState(null);
  const [serviceSearchFilter, setServiceSearchFilter] = useState('');
  const [newSubcategoryInput, setNewSubcategoryInput] = useState('');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [inlineSubcategoryValue, setInlineSubcategoryValue] = useState('');

  // Helper to sort services based on display order configuration
  const sortServices = (servList) => [...servList].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  
  // Filter services belonging strictly to the 'REDDITI' category
  const filterRedditiServices = (servicesList) => (Array.isArray(servicesList) ? servicesList : []).filter((service) => service.category === 'REDDITI');

  // Reload and filter service items from the API backend
  const reloadServices = async () => {
    try {
      const servicesData = await getServices();
      setServices(sortServices(filterRedditiServices(servicesData)));
    } catch (error) {
      console.error("Errore durante il ricaricamento dei servizi REDDITI:", error);
    }
  };

  // Load initial customer records and category services on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [customersData, servicesData] = await Promise.all([getClienti(), getServices()]);
        setAllCustomers(Array.isArray(customersData) ? customersData : []);
        setServices(sortServices(filterRedditiServices(servicesData)));
      } catch (error) {
        console.error('Errore durante il caricamento dei dati iniziali:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const [prevRowData, setPrevRowData] = useState(rowData);
  
  // Synchronize customer IDs when row data changes from backend fetch
  if (rowData !== prevRowData) {
    setPrevRowData(rowData);
    if (rowData && rowData.length > 0) {
      setSelectedCustomerIds(rowData.map((item) => item.customer_id));
    } else {
      setSelectedCustomerIds([]);
    }
  }

  // Memoized filters for active services and visible/available customers
  const visibleServices = useMemo(() => services.filter((service) => service.is_active === 1 || service.is_active === true), [services]);
  const visibleCustomers = useMemo(() => {
    const activeIds = selectedCustomerIds.filter((id) => !removedCustomerIds.includes(id));
    return allCustomers.filter((customer) => activeIds.includes(customer.id));
  }, [allCustomers, selectedCustomerIds, removedCustomerIds]);

  const availableCustomers = useMemo(() => {
    const currentActive = selectedCustomerIds.filter((id) => !removedCustomerIds.includes(id));
    return allCustomers.filter((customer) => !currentActive.includes(customer.id));
  }, [allCustomers, selectedCustomerIds, removedCustomerIds]);

  // Map row items by customer and service key for fast matrix lookups
  const matrixMap = useMemo(() => {
    const map = {};
    (rowData || []).forEach((item) => { map[`${item.customer_id}_${item.service_id}`] = item; });
    return map;
  }, [rowData]);

  // Handle cell edits and store temporary changes in global drafts state
  const handleCellDataChange = useCallback((customerId, serviceId, item, values) => {
    setGlobalDrafts((prev) => ({ ...prev, [`${customerId}_${serviceId}`]: { customerId, serviceId, item, values } }));
  }, []);

  // Determine whether there are unpersisted modifications or row adjustments
  const hasPendingChanges = Object.keys(globalDrafts).length > 0 || removedCustomerIds.length > 0 || addedCustomerIds.length > 0;

  // Notify parent component and context about dirty/unsaved state changes
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(hasPendingChanges);
    setHasUnsaved(hasPendingChanges);
  }, [hasPendingChanges, onDirtyChange, setHasUnsaved]);

  // Revert all unsaved edits and drafts, prompting confirmation if changes exist
  const handleCancelChanges = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();

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
    setResetKey((prev) => prev + 1);
    setHasUnsaved(false);
  };

  // Clear quantities and notes across all visible customer and service matrix cells
  const handleClearQuantitiesAndNotes = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();

    const newDrafts = { ...globalDrafts };
    visibleCustomers.forEach((customer) => {
      visibleServices.forEach((service) => {
        const itemKey = `${customer.id}_${service.id}`;
        const item = matrixMap[itemKey];
        const currentPrice = globalDrafts[itemKey]?.values.price ?? (item?.price ?? 0);
        newDrafts[itemKey] = { customerId: customer.id, serviceId: service.id, item: item || null, values: { price: currentPrice, quantity: 0, note: '' } };
      });
    });
    setGlobalDrafts(newDrafts);
    setResetKey((prev) => prev + 1);
  };

  // Persist all drafts, new customer rows, and deletions to the backend API
  const handleSaveAllChanges = async (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    try {
      setIsSaving(true);
      const activeYear = Number(selectedTransaction?.year || year);
      const activeMonth = Number(selectedTransaction?.month || month);
      const batch = createItemBatch('REDDITI', activeYear, activeMonth);
      const { addItem, deleteItem, handleCellValueChanged } = batch;

      // Process customer removals
      for (const custId of removedCustomerIds) {
        for (const item of (rowData || []).filter((i) => i.customer_id === custId)) await deleteItem(item.id);
      }

      // Process newly added customer rows
      for (const customerId of addedCustomerIds) {
        if (removedCustomerIds.includes(customerId)) continue;
        const hasAnyDraft = Object.keys(globalDrafts).some((key) => key.startsWith(`${customerId}_`));
        if (!hasAnyDraft && !(rowData || []).some((i) => i.customer_id === customerId) && visibleServices.length > 0) {
          await addItem({ year: activeYear, month: activeMonth, customer_id: customerId, quantity: 0, price: 0.0, service_id: visibleServices[0].id, custom_data: JSON.stringify({ note: '' }) });
        }
      }

      // Process cell draft updates, creations, and deletions
      for (const draft of Object.values(globalDrafts)) {
        const { customerId, serviceId, values } = draft;
        if (removedCustomerIds.includes(customerId)) continue;
        const parsedPrice = Number(values.price) || 0;
        const parsedQty = Number(values.quantity) || 0;
        const trimmedNote = values.note ? String(values.note).trim() : '';
        const hasValidData = parsedPrice !== 0 || parsedQty !== 0 || trimmedNote !== '';

        const currentItemInDb = (rowData || []).find(r => r.customer_id === customerId && r.service_id === Number(serviceId));

        if (currentItemInDb && !hasValidData) {
          await deleteItem(currentItemInDb.id);
        } else if (!currentItemInDb && hasValidData) {
          await addItem({ year: activeYear, month: activeMonth, customer_id: customerId, service_id: Number(serviceId), quantity: parsedQty, price: parsedPrice, custom_data: JSON.stringify({ note: trimmedNote }) });
        } else if (currentItemInDb && hasValidData) {
          if (currentItemInDb.price !== parsedPrice) await handleCellValueChanged({ data: currentItemInDb, field: 'price', newValue: parsedPrice });
          if (currentItemInDb.quantity !== parsedQty) await handleCellValueChanged({ data: currentItemInDb, field: 'quantity', newValue: parsedQty });

          let currentNote = '';
          try {
            currentNote = typeof currentItemInDb.custom_data === 'string' 
              ? JSON.parse(currentItemInDb.custom_data || '{}').note || '' 
              : currentItemInDb.custom_data?.note || '';
          } catch (parseError) {
            console.warn("Impossibile parsare custom_data come JSON, procedo con stringa vuota:", parseError);
            currentNote = '';
          }

          if (currentNote !== trimmedNote) {
            await handleCellValueChanged({ data: currentItemInDb, field: 'note', newValue: trimmedNote });
          }
        }
      }

      const saved = await batch.commit();
      replaceRows(saved.rows);
      setGlobalDrafts({});
      setRemovedCustomerIds([]);
      setAddedCustomerIds([]);
      setResetKey((prev) => prev + 1);
      setHasUnsaved(false);
      showAlert("Modifiche salvate con successo!", "success");
    } catch (error) {
      console.error("Errore critico durante il salvataggio complessivo:", error);
      showAlert("Errore durante il salvataggio.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle customer row deletion and addition actions
  const handleRemoveCustomerRow = (customer) => setRemovedCustomerIds((prev) => prev.includes(customer.id) ? prev : [...prev, customer.id]);
  
  const handleAddCustomerRow = () => {
    if (!customerToAdd) return;
    const id = isNaN(Number(customerToAdd)) ? customerToAdd : Number(customerToAdd);

    // Controlla se il cliente è già presente tra quelli visibili nella griglia
    const isAlreadySelected = selectedCustomerIds.includes(id) && !removedCustomerIds.includes(id);
    if (isAlreadySelected) {
      showAlert("Questo cliente è già presente nella griglia.", "warning");
      return;
    }

    if (!selectedCustomerIds.includes(id)) {
      setSelectedCustomerIds((prev) => [...prev, id]);
    }
    setRemovedCustomerIds((prev) => prev.filter((item) => item !== id));
    setAddedCustomerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCustomerToAdd('');
  };

  // Create a new dynamic service item via API
  const handleCreateService = async (e) => {
    e.preventDefault();
    if (!newSubcategoryInput.trim()) return;
    try {
      await createService({ category: 'REDDITI', subcategory: newSubcategoryInput.trim(), is_active: 1, display_order: services.length + 1 });
      setNewSubcategoryInput('');
      await reloadServices();
      showAlert("Servizio creato con successo.", "success");
    } catch (error) {
      console.error("Errore durante la creazione del servizio REDDITI:", error);
      showAlert("Errore durante la creazione del servizio.", "error");
    }
  };

  // Drag-and-drop handlers for service columns reordering
  const handleDragStart = (e, serviceId) => { setDraggedServiceId(serviceId); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
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
      await Promise.all(updatedWithOrder.map((srv) => updateService(srv.id, { ...srv, display_order: srv.display_order })));
    } catch (error) {
      console.error("Errore durante il riordinamento dei servizi, ricaricamento in corso...", error);
      reloadServices();
    }
  };

  return (
    <div className="position-relative h-100 d-flex flex-column">
      {/* Alert notification banner component */}
      <Alert
        message={alertInfo.message}
        type={alertInfo.type}
        onClose={() => setAlertInfo({ message: '', type: 'success' })}
      />

      {/* Confirmation modal component for critical prompt actions */}
      <ConfirmModal
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Base grid structure layout incorporating table rows, headers, and toolbars */}
      <BaseGridStructure
        loading={loading}
        onBack={onBack}
        category="REDDITI"
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
        handleSaveInlineService={async (serv) => {
          if (!inlineSubcategoryValue.trim()) return;
          await updateService(serv.id, { ...serv, subcategory: inlineSubcategoryValue.trim() });
          setEditingServiceId(null);
          setInlineSubcategoryValue('');
          await reloadServices();
          showAlert("Servizio aggiornato.", "success");
        }}
        handleToggleServiceActive={async (serv) => {
          const newActive = (serv.is_active === 1 || serv.is_active === true) ? 0 : 1;
          await updateService(serv.id, { ...serv, is_active: newActive });
          await reloadServices();
        }}
      />
    </div>
  );
};

export default RedditiGrid;