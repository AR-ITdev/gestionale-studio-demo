// src/pages/ElaborazioniPage.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrailingRouteParam } from '../hooks/useTrailingRouteParam';
import ElaborazioniGrid from '../components/ElaborazioniGrid';
import { GroupSearchInput } from '../components/GroupSearchInput';
import { ElaborazioniExportModal } from '../components/ElaborazioniExportModal';
import { PagamentiFormModal } from '../components/PagamentiFormModal';
import Alert from '../components/Alert';
import ConfirmModal from '../components/ConfirmModal';
import BackButton from '../components/BackButton';

import { useClienti } from '../hooks/useClienti';
import { useServices } from '../hooks/useServices';
import { useTransactions } from '../hooks/useTransactions';
import { useElaborazioni } from '../hooks/useElaborazioni';
import {
  getPayments,
  savePayments,
  getTransactions,
  updatePayment,
  deletePayment,
  syncCustomerYearlyBalances,
  updateCategoryItem,
  createCategoryItem,
  deleteCategoryItem
} from '../services/api';

/**
 * ElaborazioniPage Component
 * 
 * Main page component responsible for managing processing records, tracking yearly balances,
 * filtering transactions/payments by customer or corporate group, and handling data exports.
 * It features a selection landing view when no specific filter is active, and switches to a 
 * comprehensive interactive grid view once a target context is chosen.
 */
export const ElaborazioniPage = () => {
  // Extract route parameters for year and customer filtering context
  const { anno } = useParams();
  const cliente = useTrailingRouteParam('cliente');
  const navigate = useNavigate();

  const currentYearNum = new Date().getFullYear();

  // Resolve selected year and filter context from URL parameters with robust fallbacks
  const selectedYear = anno ? Number(anno) : currentYearNum;
  const selectedFilterValue = cliente || '';

  // Local state management for temporary filters, year boundaries, and UI visibility modals
  const [tempFilterValue, setTempFilterValue] = useState(selectedFilterValue || 'ALL');
  const [filterText, setFilterText] = useState('');
  const [availableYears, setAvailableYears] = useState([currentYearNum, currentYearNum - 1, currentYearNum - 2]);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [paymentDefaultTarget, setPaymentDefaultTarget] = useState('');
  const [isInitialSyncing, setIsInitialSyncing] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);

  // Global alert notification banner state
  const [alertData, setAlertData] = useState({ message: '', type: 'success', key: 0 });

  // Utility helper to trigger alert messages across actions
  const showAlert = useCallback((message, type = 'success') => {
    setAlertData({ message, type, key: Date.now() });
  }, []);

  // Fetch base definitions for customers, services, transactions, and payment hooks
  const serviceFilters = useMemo(() => ({}), []);
  const { rowData: customers } = useClienti();
  const { services = [], loading: servicesLoading, error: servicesError, refetchServices } = useServices(serviceFilters);

  const transactionOptions = useMemo(() => ({ status: 1 }), []);
  const { transactions = [] } = useTransactions(transactionOptions);


  // React-safe derivation pattern to update state when URL properties change, avoiding cascading render linter warnings
  const [prevSelectedFilter, setPrevSelectedFilter] = useState(selectedFilterValue);
  if (selectedFilterValue !== prevSelectedFilter) {
    setPrevSelectedFilter(selectedFilterValue);
    setTempFilterValue(selectedFilterValue || 'ALL');
  }

  // Dynamic fetch handler to discover active available years from transaction and payment histories
  const fetchElaborazioniYears = useCallback(async () => {
    try {
      const yearsSet = new Set([currentYearNum]);
      const transactionsRes = await getTransactions({ status: 1 }).catch(() => []);
      (Array.isArray(transactionsRes) ? transactionsRes : (transactionsRes?.data || [])).forEach(tx => {
        if (tx.year) yearsSet.add(Number(tx.year));
      });

      const paymentsRes = await getPayments().catch(() => []);
      (Array.isArray(paymentsRes) ? paymentsRes : (paymentsRes?.data || [])).forEach(p => {
        const rawDate = p.date || p.payment_date || p.created_at;
        const cy = p.competence_year || (rawDate ? new Date(rawDate).getFullYear() : null);
        if (cy) yearsSet.add(Number(cy));
      });

      const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
      setAvailableYears(prev => (JSON.stringify(prev) !== JSON.stringify(sortedYears) ? sortedYears : prev));
      return sortedYears;
    } catch {
      const fallback = [currentYearNum, currentYearNum - 1, currentYearNum - 2, currentYearNum - 3];
      setAvailableYears(prev => (JSON.stringify(prev) !== JSON.stringify(fallback) ? fallback : prev));
      return fallback;
    }
  }, [currentYearNum]);

  // Safely trigger initial year list population on component mount
  useEffect(() => {
    let isMounted = true;
    const loadYears = async () => {
      if (isMounted) {
        await fetchElaborazioniYears();
      }
    };
    loadYears();
    return () => {
      isMounted = false;
    };
  }, [fetchElaborazioniYears]);

  // Compute navigation constraints for moving across historical and future years
  const minAvailableYear = availableYears.length > 0 ? Math.min(...availableYears) : currentYearNum - 5;
  const maxAvailableYear = availableYears.length > 0 ? Math.max(...availableYears) : currentYearNum + 5;

  const canGoPrev = Number(selectedYear) > minAvailableYear;
  const canGoNext = Number(selectedYear) < maxAvailableYear;

  const handlePrevYear = () => { if (canGoPrev) handleYearChange(Number(selectedYear) - 1); };
  const handleNextYear = () => { if (canGoNext) handleYearChange(Number(selectedYear) + 1); };

  // Parse specific customer ID if filtering by an individual client
  const customerId = useMemo(() => {
    if (!selectedFilterValue || selectedFilterValue.startsWith('PARENT:') || selectedFilterValue === 'ALL') return null;
    return Number(selectedFilterValue);
  }, [selectedFilterValue]);

  // Parse corporate parent group code if filtering by parent company category
  const parentCode = useMemo(() => {
    if (!selectedFilterValue || !selectedFilterValue.startsWith('PARENT:')) return null;
    return selectedFilterValue.replace('PARENT:', '');
  }, [selectedFilterValue]);

  // Build filter payload parameters for data queries
  const summaryFilters = useMemo(() => ({
    year: selectedYear,
    customer_id: customerId || undefined,
    parent_code: parentCode || undefined
  }), [selectedYear, customerId, parentCode]);

  // Fetch core summary and aggregate data using the custom elaborazioni hook
  const { summaryData, loading: summaryLoading, error: summaryError, refetch: fetchSummaryData } = useElaborazioni(summaryFilters);

  useEffect(() => {
    if (summaryError && !refreshPending) showAlert(`Errore caricamento elaborazioni: ${summaryError.message}`, 'danger');
  }, [summaryError, refreshPending, showAlert]);

  useEffect(() => {
    setRefreshPending(false);
  }, [selectedYear, selectedFilterValue]);

  // Perform automated customer yearly balance synchronization when entering a specific client context view
  useEffect(() => {
    let isMounted = true;
    if (selectedFilterValue) {
      const performInitialSyncAndFetch = async () => {
        try {
          setIsInitialSyncing(true);
          await syncCustomerYearlyBalances(selectedYear);
          if (isMounted) {
            await fetchSummaryData();
          }
        } catch (err) {
          console.error("Error during initial synchronization process:", err);
          if (isMounted) showAlert(`Errore sincronizzazione: ${err.message}`, 'danger');
        } finally {
          if (isMounted) {
            setIsInitialSyncing(false);
          }
        }
      };
      performInitialSyncAndFetch();
    }
    return () => {
      isMounted = false;
    };
  }, [selectedYear, selectedFilterValue, fetchSummaryData]);

  // Determine active filtering context configuration (All clients, parent group, or single client)
  const filteredContext = useMemo(() => {
    if (!selectedFilterValue || selectedFilterValue === 'ALL') return { type: 'ALL', targetCustomerIds: [], targetParents: [] };
    if (selectedFilterValue.startsWith('PARENT:')) {
      const parentCodeVal = selectedFilterValue.replace('PARENT:', '');
      const childIds = customers.filter(c => c.parent_code === parentCodeVal).map(c => Number(c.id));
      return { type: 'PARENT', targetCustomerIds: childIds, targetParents: [parentCodeVal] };
    }
    const custId = Number(selectedFilterValue);
    const matchedCust = customers.find(c => Number(c.id) === custId);
    return { type: 'CUSTOMERS', targetCustomerIds: matchedCust ? [custId] : [], matchingCustomers: matchedCust ? [matchedCust] : [] };
  }, [selectedFilterValue, customers]);

  // Resolve human-readable name for the current active selection context target
  const getCurrentTargetContextName = () => {
    if (!selectedFilterValue || selectedFilterValue === 'ALL') return 'ALL';
    if (selectedFilterValue.startsWith('PARENT:')) return selectedFilterValue;
    const found = customers.find(c => Number(c.id) === Number(selectedFilterValue));
    return found ? (found.name || found.ragione_sociale || String(selectedFilterValue)) : 'ALL';
  };

  // Modal handlers for recording new payments
  const handleOpenAddPayment = (specificTargetName = '') => {
    setPaymentDefaultTarget(specificTargetName || getCurrentTargetContextName());
    setIsPaymentModalOpen(true);
  };

  const handleClosePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPaymentDefaultTarget('');
  };

  const handleSavePaymentData = async (paymentPayload) => {
    if (await handleSavePayment(paymentPayload)) handleClosePaymentModal();
  };

  // Trigger manual backend synchronization of yearly balances across records
  const handleConfirmSync = async () => {
    try {
      setIsSyncModalOpen(false);
      const response = await syncCustomerYearlyBalances(selectedYear);
      await fetchSummaryData();

      let successMsg = "Synchronization completed successfully!";
      if (typeof response === 'string') successMsg = response;
      else if (response?.message) successMsg = response.message;
      else if (response?.data?.message) successMsg = response.data.message;

      showAlert(successMsg, "success");
    } catch (err) {
      console.error("Synchronization error:", err);
      showAlert(err.message || "An error occurred during synchronization.", "danger");
    }
  };

  // Prepare structured payload required for data and spreadsheet export modals
  const currentExportData = useMemo(() => {
    const targetCustomers = customers.filter(customer => {
      const cId = Number(customer.id);
      if (filteredContext.type === 'ALL') return true;
      return filteredContext.targetCustomerIds.includes(cId);
    });

    let contextLabel = 'General Summary (All Customers)';
    let contextIdentifier = 'General_Summary';

    if (filteredContext.type === 'PARENT') {
      const pCode = selectedFilterValue?.replace('PARENT:', '') || '';
      contextLabel = `Corporate Group / Parent: ${pCode}`;
      contextIdentifier = `Group_${pCode}`;
    } else if (filteredContext.type === 'CUSTOMERS' && filteredContext.matchingCustomers.length > 0) {
      const cust = filteredContext.matchingCustomers[0];
      contextLabel = `Customer: ${cust.name} [${cust.customer_code || 'N/A'}]`;
      contextIdentifier = cust.name;
    }

    return {
      customers: targetCustomers,
      items: summaryData?.items || [],
      services,
      payments: summaryData?.payments || [],
      transactions,
      customersSummary: summaryData?.customersSummary || {},
      backendAggregated: summaryData?.aggregated || null,
      currentYear: selectedYear,
      previousYear: selectedYear - 1,
      contextLabel,
      contextIdentifier
    };
  }, [customers, summaryData, services, transactions, selectedYear, filteredContext, selectedFilterValue]);

  const refreshAfterMutation = async (successMessage) => {
    try {
      await fetchSummaryData();
      setRefreshPending(false);
      showAlert(successMessage, 'success');
    } catch (err) {
      console.error('Errore aggiornamento riepilogo dopo una modifica salvata:', err);
      setRefreshPending(true);
      showAlert(`Modifica salvata, ma impossibile aggiornare il riepilogo: ${err.message}`, 'danger');
    }
    return true;
  };

  // Payment mutation handlers
  const handleSavePayment = async (paymentPayload) => {
    try {
      await savePayments(paymentPayload);
    } catch (err) {
      console.error("Error saving payment:", err);
      showAlert("An error occurred while saving the payment.", "danger");
      return false;
    }
    return refreshAfterMutation("Payment successfully saved!");
  };

  // Item modification and inline update handlers for processing rows
  const handleUpdateItem = async (itemId, updatedFields) => {
    try {
      const targetItem = (summaryData?.items || []).find(i => Number(i.id) === Number(itemId));
      if (!targetItem) {
        throw new Error(`Elemento non trovato nel riepilogo: ${itemId}`);
      }

      let customDataObj = {};
      try {
        customDataObj = typeof targetItem.custom_data === 'string'
          ? JSON.parse(targetItem.custom_data || '{}')
          : (targetItem.custom_data || {});
      } catch { /* ignore */ }

      if (updatedFields.note !== undefined) {
        customDataObj.note = updatedFields.note;
        customDataObj.notes = updatedFields.note;
      }

      const fieldsToUpdate = {
        category: targetItem.category,
        year: targetItem.year,
        month: targetItem.month,
        customer_id: targetItem.customer_id,
        service_id: targetItem.service_id,
        quantity: updatedFields.quantity !== undefined ? Number(updatedFields.quantity) : Number(targetItem.quantity),
        price: updatedFields.price !== undefined ? Number(updatedFields.price) : Number(targetItem.price),
        custom_data: JSON.stringify(customDataObj)
      };

      await updateCategoryItem(itemId, fieldsToUpdate);
    } catch (err) {
      console.error("Error updating item element:", err);
      showAlert("An error occurred while updating the item.", "danger");
      return false;
    }
    return refreshAfterMutation("Item successfully updated!");
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await deleteCategoryItem(itemId);
    } catch (err) {
      console.error("Error deleting item element:", err);
      showAlert("An error occurred while deleting the item.", "danger");
      return false;
    }
    return refreshAfterMutation("Item successfully deleted!");
  };

  const handleAddItem = async (newItemPayload) => {
    try {
      const payloadToSend = {
        category: newItemPayload.category,
        year: Number(newItemPayload.year || selectedYear),
        month: newItemPayload.month ? Number(newItemPayload.month) : null,
        customer_id: Number(newItemPayload.customer_id),
        service_id: Number(newItemPayload.service_id),
        quantity: Number(newItemPayload.quantity) || 1,
        price: Number(newItemPayload.price) || 0,
        custom_data: JSON.stringify({ note: newItemPayload.note || newItemPayload.notes || '' })
      };

      await createCategoryItem(payloadToSend);
    } catch (err) {
      console.error("Error adding service item:", err);
      showAlert("An error occurred while adding the service.", "danger");
      return false;
    }
    return refreshAfterMutation("Service item successfully added!");
  };

  const handleUpdatePayment = async (paymentId, payload) => {
    try {
      await updatePayment(paymentId, payload);
    } catch (err) {
      console.error("Error updating payment record:", err);
      showAlert("An error occurred while updating the payment.", "danger");
      return false;
    }
    return refreshAfterMutation("Payment successfully updated!");
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await deletePayment(paymentId);
    } catch (err) {
      console.error("Error deleting payment record:", err);
      showAlert("An error occurred while deleting the payment.", "danger");
      return false;
    }
    return refreshAfterMutation("Payment successfully deleted!");
  };

  // Route navigation helper handlers for changing search criteria and timeline years
  const handleConfirmSelection = () => {
    const targetFilter = tempFilterValue || 'ALL';
    navigate(`/elaborazioni/${selectedYear}/${encodeURIComponent(targetFilter)}`);
  };

  const handleYearChange = (newYear) => {
    if (selectedFilterValue) {
      navigate(`/elaborazioni/${newYear}/${encodeURIComponent(selectedFilterValue)}`);
    } else {
      navigate(`/elaborazioni/${newYear}`);
    }
  };

  const handleApplyCustomerSearch = () => {
    const targetFilter = tempFilterValue || 'ALL';
    navigate(`/elaborazioni/${selectedYear}/${encodeURIComponent(targetFilter)}`);
  };

  return (
    <div className="w-100 h-custom-calc d-flex flex-column box-border overflow-hidden bg-light position-relative">
      <Alert message={alertData.message} type={alertData.type} key={alertData.key} />
      {refreshPending && (
        <div role="status" className="alert alert-danger rounded-0 m-3 d-flex align-items-center justify-content-between gap-3">
          <span>Modifica salvata. Il riepilogo visualizzato non &egrave; aggiornato.</span>
          <button type="button" className="btn btn-sm btn-outline-danger rounded-0" disabled={summaryLoading}
            onClick={() => refreshAfterMutation('Riepilogo aggiornato.')}>
            {summaryLoading ? 'Aggiornamento...' : 'Riprova aggiornamento'}
          </button>
        </div>
      )}

      {/* Conditional landing selector view if no client context is selected yet */}
      {!selectedFilterValue ? (
        <div className="row justify-content-center align-items-center py-5 px-3 grow position-relative">
          <div className="col-md-7 col-lg-5 position-relative">
            <div className="card border shadow-sm rounded-0 bg-white p-4 text-center">
              <div className="mb-2 text-primary" style={{ fontSize: '32px' }}>📊</div>
              <h4 className="fw-bold text-dark mb-2" style={{ fontSize: '18px' }}>Area Elaborazioni</h4>
              <p className="text-secondary mb-4" style={{ fontSize: '13px' }}>Seleziona l'anno di riferimento e scegli un cliente o un gruppo dal menu a tendina.<br/> Clicca su conferma per aprire la griglia principale.</p>

              <div className="d-flex flex-column gap-3 text-start mb-4">
                <div className="bg-light p-3 border">
                  <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '12px' }}>Anno di riferimento:</label>
                  <select value={selectedYear} onChange={(e) => handleYearChange(Number(e.target.value))} className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle fw-bold text-dark py-2" style={{ width: '100%', fontSize: '13px' }}>
                    {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <div className="bg-light p-3 border">
                  <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '12px' }}>Cliente / Gruppo:</label>
                  <GroupSearchInput availableCustomers={customers} selectedFilterValue={tempFilterValue} onFilterValueChange={setTempFilterValue} className="position-relative w-100" inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle py-2" inputStyle={{ width: '100%', fontSize: '13px' }} />
                </div>
              </div>

              <button onClick={handleConfirmSelection} className="btn btn-dark rounded-0 py-2 w-100 fw-bold shadow-none" style={{ fontSize: '13px' }}>Conferma</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Top action toolbar header container for active grid view */}
          <div className="card border shadow-sm bg-white rounded-0 mb-2 shrink-0">
            <div className="card-body p-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <BackButton onBack={() => navigate(-1)} />

                <div className="btn-group btn-group-sm rounded-0 ms-1" role="group">
                  <button type="button" onClick={handlePrevYear} disabled={!canGoPrev} className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${canGoPrev ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`} style={{ fontSize: '12px', height: '30px' }}><i className="bi bi-chevron-left"></i></button>
                  <button type="button" className="btn btn-sm btn-light text-dark fw-bold border border-secondary-subtle rounded-0 px-3 py-1 shadow-none" style={{ fontSize: '13px', cursor: 'default', minWidth: '60px', height: '30px' }}>{selectedYear}</button>
                  <button type="button" onClick={handleNextYear} disabled={!canGoNext} className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${canGoNext ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`} style={{ fontSize: '12px', height: '30px' }}><i className="bi bi-chevron-right"></i></button>
                </div>

                <div className="d-flex align-items-center gap-1 ms-2">
                  <GroupSearchInput availableCustomers={customers} selectedFilterValue={tempFilterValue} onFilterValueChange={setTempFilterValue} className="position-relative" inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle" inputStyle={{ minWidth: '220px', maxWidth: '320px', fontSize: '12px', height: '30px' }} />
                  <button onClick={handleApplyCustomerSearch} className="btn btn-sm btn-outline-secondary rounded-0 px-2 py-1 shadow-none" style={{ height: '30px' }} title="Search"><i className="bi bi-search"></i></button>
                </div>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button onClick={() => handleOpenAddPayment()} className="btn btn-primary btn-sm rounded-0 py-1 px-3 fw-bold shadow-none" style={{ fontSize: '12px', height: '30px' }}>➕ Aggiungi Pagamento</button>
                <button disabled={servicesLoading || Boolean(servicesError)} onClick={() => setIsExportModalOpen(true)} className="btn btn-success btn-sm rounded-0 py-1 px-3 fw-bold shadow-none" style={{ fontSize: '12px', height: '30px' }}>📥 Export (Excel)</button>
                <button onClick={() => setIsSyncModalOpen(true)} className="btn btn-outline-primary btn-sm rounded-0 py-1 px-3 fw-bold shadow-none d-flex align-items-center gap-1" style={{ fontSize: '12px', height: '30px' }} title="Synchronize Balances"><i className="bi bi-arrow-repeat"></i> Sync</button>
              </div>
            </div>
          </div>

          {/* Main detailed processing data table / grid component */}
          {servicesError ? (
            <div className="alert alert-danger rounded-0" role="alert">
              <p>Impossibile caricare i servizi: {servicesError.message}</p>
              <button className="btn btn-sm btn-dark rounded-0" onClick={refetchServices}>Riprova</button>
            </div>
          ) : <ElaborazioniGrid
            items={summaryData?.items || []}
            services={services}
            customers={customers}
            payments={summaryData?.payments || []}
            transactions={transactions}
            backendAggregated={summaryData?.aggregated || null}
            customersSummary={summaryData?.customersSummary || {}}
            selectedYear={selectedYear}
            availableYears={availableYears}
            fetchYearsFn={fetchElaborazioniYears}
            selectedFilterValue={selectedFilterValue}
            filterText={filterText}
            onFilterTextChange={setFilterText}
            onSavePayment={handleSavePayment}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onAddItem={handleAddItem}
            onUpdatePayment={handleUpdatePayment}
            onDeletePayment={handleDeletePayment}
            showAlert={showAlert}
            loading={summaryLoading || isInitialSyncing || servicesLoading}
          />}
        </>
      )}

      {/* Modals for export generation, payment entry, and balance sync confirmation */}
      <ElaborazioniExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExportComplete={() => showAlert('Esportazione Excel completata.', 'success')}
        onExportError={() => showAlert("Errore durante l'esportazione Excel.", 'danger')}
        onNoRecords={() => showAlert('Non ci sono record da esportare per la selezione corrente.', 'danger')}
        exportData={currentExportData}
      />
      <PagamentiFormModal isOpen={isPaymentModalOpen} onClose={handleClosePaymentModal} onSave={handleSavePaymentData} editingPayment={null} allCustomers={customers} defaultCustomerName={paymentDefaultTarget} showAlert={showAlert} />

      <ConfirmModal
        show={isSyncModalOpen}
        title="Confirm Synchronization"
        message={`Are you sure you want to run the automatic synchronization and recalculation of yearly balances for ${selectedYear}?`}
        onConfirm={handleConfirmSync}
        onCancel={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
};

export default ElaborazioniPage;