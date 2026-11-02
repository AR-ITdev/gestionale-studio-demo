import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePaghe } from '../hooks/usePaghe';
import { createItemBatch } from '../utils/itemBatch';
import { 
  getClienti, 
  getServices, 
  createService, 
  updateService, 
  getTransactions, 
  updateTransaction 
} from '../services/api';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { BaseGridStructure } from '../layouts/BaseGridStructure';
import { Alert } from './Alert';
import { ConfirmModal } from './ConfirmModal';

/**
 * PagheGeneraleGrid component manages the general payroll services grid structure,
 * enabling transaction period selection, bulk/individual customer row adjustments,
 * dynamic general service management, and tracking of unsaved changes.
 */
export const PagheGeneraleGrid = ({ year = 2026, month = 7, transactionId, onBack, activeTab, setActiveTab, onPeriodChange, onDirtyChange }) => {
  const { setHasUnsaved } = useUnsavedChanges();

  // Determine target year and month from transactionId prop or fallback values
  const targetYear = typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.year || year) : Number(year);
  const targetMonth = typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.month || month) : Number(month);

  const [selectedTransaction, setSelectedTransaction] = useState({ year: targetYear, month: targetMonth });

  if (selectedTransaction.year !== targetYear || selectedTransaction.month !== targetMonth) {
    setSelectedTransaction({ year: targetYear, month: targetMonth });
  }

  const [transactionsList, setTransactionsList] = useState([]);
  const [rowHeights, setRowHeights] = useState({});
  const [isStatusSaving, setIsStatusSaving] = useState(false);

  // Alert state management with a timestamp to force multiple sequential queue triggers
  const [alertData, setAlertData] = useState({ message: '', type: 'success', timestamp: 0 });
  const [confirmModalData, setConfirmModalData] = useState(null);

  const showAlert = (message, type = 'success') => {
    setAlertData({ message, type, timestamp: Date.now() });
  };

  // Callback to track row heights dynamically across grid items
  const handleRowHeightChange = useCallback((customerId, height) => {
    setRowHeights((prev) => ({ ...prev, [customerId]: height }));
  }, []);

  const [globalDrafts, setGlobalDrafts] = useState({});
  const [removedCustomerIds, setRemovedCustomerIds] = useState([]);
  const [addedCustomerIds, setAddedCustomerIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Monitor transaction period changes and reset drafts if period shifts
  const [prevSelectedTransaction, setPrevSelectedTransaction] = useState(selectedTransaction);
  if (prevSelectedTransaction.year !== selectedTransaction.year || prevSelectedTransaction.month !== selectedTransaction.month) {
    setPrevSelectedTransaction(selectedTransaction);
    if (Object.keys(globalDrafts).length > 0 || removedCustomerIds.length > 0 || addedCustomerIds.length > 0) {
      setGlobalDrafts({});
      setRemovedCustomerIds([]);
      setAddedCustomerIds([]);
    }
  }

  // Fetch all PAGHE transactions on mount or period change
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const data = await getTransactions('PAGHE');
        setTransactionsList(Array.isArray(data) ? data : []);
      } catch (err) { console.error("Errore caricamento transazioni:", err); }
    };
    fetchTransactions();
  }, [selectedTransaction]);

  // Identify the transaction object corresponding to the currently selected period
  const currentTransactionObj = useMemo(() => {
    return transactionsList.find(
      (t) => Number(t.year) === Number(selectedTransaction.year) && Number(t.month) === Number(selectedTransaction.month)
    );
  }, [transactionsList, selectedTransaction]);

  // Check whether the current transaction is validated
  const isTransactionValidated = currentTransactionObj?.status === 1 || currentTransactionObj?.status === 'validated' || currentTransactionObj?.is_validated === true || currentTransactionObj?.is_validated === 1;

  // Toggle transaction validation status between active/validated and draft
  const handleToggleStatus = async () => {
    const newStatus = isTransactionValidated ? 0 : 1;
    try {
      setIsStatusSaving(true);
      await updateTransaction('PAGHE', selectedTransaction.year, selectedTransaction.month, { status: newStatus });
      const data = await getTransactions('PAGHE');
      setTransactionsList(Array.isArray(data) ? data : []);
    } catch { 
      showAlert("Errore durante l'aggiornamento dello stato", 'danger'); 
    } finally { 
      setIsStatusSaving(false); 
    }
  };

  const { rowData, replaceRows, loading: itemsLoading, error: loadError, fetchData } = usePaghe(selectedTransaction);

  const [allCustomers, setAllCustomers] = useState([]);
  const [manualCustomerIds, setManualCustomerIds] = useState([]);
  const [customerToAdd, setCustomerToAdd] = useState('');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [newSubcategoryInput, setNewSubcategoryInput] = useState('');
  const [serviceSearchFilter, setServiceSearchFilter] = useState('');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [inlineSubcategoryValue, setInlineSubcategoryValue] = useState('');
  const [draggedServiceId, setDraggedServiceId] = useState(null);

  // Helper to sort services based on their display order configuration
  const sortServices = (servList) => [...servList].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  
  // Filter services related to general payroll categories, excluding payslip (cedolini) services
  const filterGeneraleServices = (servicesList) => (Array.isArray(servicesList) ? servicesList : []).filter(
    (service) => service.category === 'PAGHE' && !(service.subcategory || '').trim().toLowerCase().includes('cedolini')
  );

  // Reload and re-filter general services list from API
  const reloadServices = async () => {
    try {
      const servicesData = await getServices();
      setServices(sortServices(filterGeneraleServices(servicesData)));
    } catch (err) { console.error("Errore caricamento servizi:", err); }
  };

  // Fetch initial customers and services data on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [customersData, servicesData] = await Promise.all([getClienti(), getServices()]);
        setAllCustomers(Array.isArray(customersData) ? customersData : []);
        setServices(sortServices(filterGeneraleServices(servicesData)));
      } catch (err) { console.error("Errore caricamento dati:", err); } finally { setLoading(false); }
    };
    fetchInitialData();
  }, []);

  // Compute active customer IDs currently present in grid row data
  const activeCustomerIdsFromData = useMemo(() => rowData && rowData.length > 0 ? rowData.map((item) => item.customer_id) : [], [rowData]);
  
  // Combine data IDs with manually added customer IDs
  const selectedCustomerIds = useMemo(() => [...new Set([...activeCustomerIdsFromData, ...manualCustomerIds])], [activeCustomerIdsFromData, manualCustomerIds]);
  
  // Filter active services and customers excluding removed ones
  const visibleServices = useMemo(() => services.filter((s) => s.is_active === 1 || s.is_active === true), [services]);
  const visibleCustomers = useMemo(() => {
    const activeIds = selectedCustomerIds.filter(id => !removedCustomerIds.includes(id));
    return allCustomers.filter((c) => activeIds.includes(c.id));
  }, [allCustomers, selectedCustomerIds, removedCustomerIds]);
  const availableCustomers = useMemo(() => {
    const currentActive = selectedCustomerIds.filter(id => !removedCustomerIds.includes(id));
    return allCustomers.filter((c) => !currentActive.includes(c.id));
  }, [allCustomers, selectedCustomerIds, removedCustomerIds]);

  // Map row data items by customer and service key for fast matrix lookups
  const matrixMap = useMemo(() => {
    const map = {};
    (rowData || []).forEach((item) => { map[`${item.customer_id}_${item.service_id}`] = item; });
    return map;
  }, [rowData]);

  // Handle cell value modifications and store changes in global drafts state
  const handleCellDataChange = useCallback((customerId, serviceId, item, values) => {
    setGlobalDrafts((prev) => ({ ...prev, [`${customerId}_${serviceId}`]: { customerId, serviceId, item, values } }));
  }, []);

  // Determine if there are any unpersisted modifications in drafts, additions, or deletions
  const hasUnsavedChanges = Object.keys(globalDrafts).length > 0 || removedCustomerIds.length > 0 || addedCustomerIds.length > 0;

  // Synchronize unsaved changes status with external context and parent callbacks
  useEffect(() => {
    if (onDirtyChange) onDirtyChange(hasUnsavedChanges);
    setHasUnsaved(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange, setHasUnsaved]);

  // Clear all cell quantities and notes across visible customers and services
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
  };

  // Revert all unsaved modifications, drafts, and customer row operations
  const executeCancelChanges = () => {
    setConfirmModalData(null);
    setGlobalDrafts({});
    setRemovedCustomerIds([]);
    setAddedCustomerIds([]);
    setManualCustomerIds([]);
    setResetKey((prev) => prev + 1);
    setHasUnsaved(false);
  };

  // Prompt confirmation dialog before discarding unsaved changes
  const handleCancelChanges = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    if (hasUnsavedChanges) {
      setConfirmModalData({
        title: "Annulla modifiche",
        message: "Annullare tutte le modifiche non salvate?",
        onConfirm: executeCancelChanges
      });
    }
  };

  // Persist all drafts, added rows, and deletions to the backend via API calls
  const handleSaveAllChanges = async (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    if (itemsLoading || loadError) {
      showAlert('Attendi il caricamento dei dati del periodo prima di salvare.', 'danger');
      return;
    }
    try {
      setIsSaving(true);
      const activeYear = Number(selectedTransaction?.year || year);
      const activeMonth = Number(selectedTransaction?.month || month);
      const batch = createItemBatch('PAGHE', activeYear, activeMonth);
      const { addItem, deleteItem, handleCellValueChanged } = batch;

      // Process customer row deletions
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

      // Process cell draft updates, creations, and removals
      for (const draft of Object.values(globalDrafts)) {
        const { customerId, serviceId, values } = draft;
        if (removedCustomerIds.includes(customerId)) continue;
        const parsedPrice = Number(values.price) || 0;
        const parsedQty = Number(values.quantity) || 0;
        const trimmedNote = values.note ? String(values.note).trim() : '';
        const hasValidData = parsedPrice !== 0 || parsedQty !== 0 || trimmedNote !== '';

        const currentItemInDb = (rowData || []).find(r => r.customer_id === customerId && r.service_id === Number(serviceId));

        if (currentItemInDb && !hasValidData) await deleteItem(currentItemInDb.id);
        else if (!currentItemInDb && hasValidData) await addItem({ year: activeYear, month: activeMonth, customer_id: customerId, service_id: Number(serviceId), quantity: parsedQty, price: parsedPrice, custom_data: JSON.stringify({ note: trimmedNote }) });
        else if (currentItemInDb && hasValidData) {
          if (currentItemInDb.price !== parsedPrice) await handleCellValueChanged({ data: currentItemInDb, field: 'price', newValue: parsedPrice });
          if (currentItemInDb.quantity !== parsedQty) await handleCellValueChanged({ data: currentItemInDb, field: 'quantity', newValue: parsedQty });
          
          let currentNote = '';
          try { currentNote = typeof currentItemInDb.custom_data === 'string' ? JSON.parse(currentItemInDb.custom_data || '{}').note || '' : currentItemInDb.custom_data?.note || ''; } catch { currentNote = ''; }
          if (currentNote !== trimmedNote) await handleCellValueChanged({ data: currentItemInDb, field: 'note', newValue: trimmedNote });
        }
      }

      const saved = await batch.commit();
      replaceRows(saved.rows);
      setGlobalDrafts({});
      setRemovedCustomerIds([]);
      setAddedCustomerIds([]);
      setManualCustomerIds([]);
      setResetKey((prev) => prev + 1);
      setHasUnsaved(false);
      showAlert("Modifiche salvate con successo!", 'success');
    } catch { 
      showAlert("Errore durante il salvataggio.", 'danger'); 
    } finally { 
      setIsSaving(false); 
    }
  };

  // Handle removing a customer row from the visible grid view
  const handleRemoveCustomerRow = (customer) => setRemovedCustomerIds((prev) => prev.includes(customer.id) ? prev : [...prev, customer.id]);
  
  // Handle adding a new customer row to the active working set
  const handleAddCustomerRow = () => {
    if (!customerToAdd) return;
    const id = isNaN(Number(customerToAdd)) ? customerToAdd : Number(customerToAdd);
    setManualCustomerIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    setRemovedCustomerIds((prev) => prev.filter(item => item !== id));
    setAddedCustomerIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    setCustomerToAdd('');
  };

  // Create a new dynamic general service item via API
  const handleCreateService = async (e) => {
    e.preventDefault();
    if (!newSubcategoryInput.trim()) return;
    try {
      await createService({ category: 'PAGHE', subcategory: newSubcategoryInput.trim(), is_active: 1, display_order: services.length + 1 });
      setNewSubcategoryInput('');
      await reloadServices();
    } catch (err) { console.error("Errore creazione servizio:", err); }
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
    } catch { reloadServices(); }
  };

  return (
    <>
      {/* Alert notification banner component using timestamp-based key to handle sequential queues */}
      <Alert 
        key={alertData.timestamp}
        message={alertData.message} 
        type={alertData.type} 
      />

      {/* Base grid layout container structuring general payroll rows and service columns */}
      <BaseGridStructure
        loading={loading || itemsLoading}
        loadError={loadError}
        onRetryLoad={() => fetchData().catch(err => showAlert(err.message, 'danger'))}
        onBack={onBack}
        selectedTransaction={selectedTransaction}
        transactionsList={transactionsList}
        hasUnsavedChanges={hasUnsavedChanges}
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
        }}
        handleToggleServiceActive={async (service) => {
          const newActiveState = (service.is_active === 1 || service.is_active === true) ? 0 : 1;
          await updateService(service.id, { ...service, is_active: newActiveState });
          await reloadServices();
        }}
      />

      {/* Confirmation modal for critical actions like discarding unsaved edits */}
      <ConfirmModal
        show={Boolean(confirmModalData)}
        title={confirmModalData?.title}
        message={confirmModalData?.message}
        onConfirm={confirmModalData?.onConfirm || (() => setConfirmModalData(null))}
        onCancel={() => setConfirmModalData(null)}
      />
    </>
  );
};

export default PagheGeneraleGrid;