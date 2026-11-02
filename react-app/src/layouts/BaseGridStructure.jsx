import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ServiceManagementModal } from '../components/ServiceManagementModal';
import { GridToolbar } from '../components/GridToolbar';
import { Alert } from '../components/Alert';

/**
 * Reusable standard grid cell component handling individual service entries 
 * for a specific customer, including price, quantity, and resizable note fields.
 */
const StandardGridCell = React.memo(({ customer, service, item, rowHeight, onRowHeightChange, onCellDataChange, disabled }) => {
  // Helper function to extract note values from various possible data structures or custom_data JSON attributes
  const getNoteValue = useCallback((data) => {
    if (!data) return '';
    if (typeof data.note === 'string') return data.note;
    if (!data.custom_data) return '';
    try {
      const parsed = typeof data.custom_data === 'string' ? JSON.parse(data.custom_data) : data.custom_data;
      return parsed.note || '';
    } catch {
      return '';
    }
  }, []);

  const extPrice = item && item.price !== undefined && item.price !== null ? item.price : '';
  const extQty = item && item.quantity !== undefined && item.quantity !== null ? item.quantity : '';
  const extNote = getNoteValue(item);

  const [price, setPrice] = useState(extPrice);
  const [quantity, setQuantity] = useState(extQty);
  const [note, setNote] = useState(extNote);

  const textareaRef = useRef(null);

  const [prevItem, setPrevItem] = useState(item);
  if (prevItem !== item) {
    setPrevItem(item);
    setPrice(extPrice);
    setQuantity(extQty);
    setNote(extNote);
  }

  // Handles dynamic mouse-drag vertical resizing of the grid row
  const handleMouseDown = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const startHeight = textarea.offsetHeight;

    const onMouseMove = () => {
      if (!textarea) return;
      const currentHeight = textarea.offsetHeight;
      if (currentHeight !== startHeight) {
        onRowHeightChange(customer.id, `${currentHeight}px`);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Handles field value changes and propagates updates upstream via callback
  const handleChange = (field, val) => {
    let newPrice = price;
    let newQty = quantity;
    let newNote = note;

    if (field === 'price') {
      setPrice(val);
      newPrice = val;
    }
    if (field === 'quantity') {
      setQuantity(val);
      newQty = val;
    }
    if (field === 'note') {
      setNote(val);
      newNote = val;
    }

    onCellDataChange(customer.id, service.id, item, {
      price: newPrice,
      quantity: newQty,
      note: newNote
    });
  };

  const isPriceEmpty = price === '' || price === null || price === undefined || Number(price) === 0;
  const isQtyEmpty = quantity === '' || quantity === null || quantity === undefined || Number(quantity) === 0;
  const isNoteEmpty = !note || String(note).trim() === '';

  return (
    <td className="p-0 border-bottom border-end align-middle bg-white min-h-64px h-auto">
      <div className="d-flex flex-column h-100">
        <div className="d-flex border-bottom h-cell-top w-100">
          <div className={`input-group input-group-sm rounded-0 border-0 border-end grow h-100 w-55 ${isPriceEmpty ? 'bg-light' : 'bg-white'}`}>
            <span className={`input-group-text border-0 rounded-0 px-1 fs-12 ${isPriceEmpty ? 'bg-light text-muted' : 'bg-white text-dark'}`}>€</span>
            <input
              disabled={disabled}
              type="number"
              step="0.01"
              value={price === 0 ? '' : price}
              onChange={(e) => handleChange('price', e.target.value)}
              className={`form-control form-control-sm px-1 py-0 rounded-0 shadow-none text-center border-0 text-dark h-100 fs-12 ${isPriceEmpty ? 'bg-light text-muted' : 'bg-white'}`}
              title="Prezzo (€)"
            />
          </div>
          <input
            disabled={disabled}
            type="number"
            min="0"
            placeholder="qty"
            value={quantity === 0 ? '' : quantity}
            onChange={(e) => handleChange('quantity', e.target.value)}
            className={`form-control form-control-sm px-1 py-0 rounded-0 shadow-none text-center border-0 text-dark h-100 fs-12 w-45 ${isQtyEmpty ? 'bg-light text-muted' : 'bg-white'}`}
            title="Quantità"
          />
        </div>
        <textarea
          disabled={disabled}
          ref={textareaRef}
          placeholder="note"
          value={note}
          onChange={(e) => handleChange('note', e.target.value)}
          onMouseDown={handleMouseDown}
          className={`form-control form-control-sm px-1 py-1 rounded-0 shadow-none border-0 border-top text-dark fs-11 resize-vertical lh-sm ${isNoteEmpty ? 'bg-light text-muted' : 'bg-white'}`}
          style={{
            minHeight: '35px',
            height: rowHeight || '35px'
          }}
        />
      </div>
    </td>
  );
});

/**
 * Unified filter dropdown component providing sorting, customer filtering, 
 * and service column visibility toggles.
 */
const UnifiedFilterDropdown = ({
  menuRef,
  sortOrder,
  handleSetSortOrder,
  isAllSelected,
  handleSelectAllCheckbox,
  visibleCustomers,
  selectedCustomerIdsFilter,
  handleToggleCustomerCheckbox,
  visibleServices,
  hiddenServiceIds,
  handleToggleColumnVisibility,
  handleShowAllColumns,
  handleHideAllColumns
}) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  // Memoized filter for customer list based on search query
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return visibleCustomers;
    const query = customerSearch.toLowerCase();
    return visibleCustomers.filter(c => (c.name || '').toLowerCase().includes(query));
  }, [visibleCustomers, customerSearch]);

  // Memoized filter for service columns based on search query
  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return visibleServices;
    const query = serviceSearch.toLowerCase();
    return visibleServices.filter(s => (s.subcategory || '').toLowerCase().includes(query));
  }, [visibleServices, serviceSearch]);

  return (
    <div
      ref={menuRef}
      className="position-absolute bg-white border shadow rounded py-2 mt-1 z-3 text-start"
      style={{ top: '100%', left: '0', width: '560px', maxWidth: '90vw' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="row g-0 px-2">
        {/* SEZIONE SINISTRA: CLIENTI */}
        <div className="col-6 pe-2 border-end">
          <div className="px-1 py-1 text-muted fs-11 fw-bold text-uppercase border-bottom mb-1">Ordinamento</div>
          <button
            type="button"
            className={`dropdown-item fs-12 px-2 py-1 text-dark d-flex align-items-center justify-content-between rounded ${sortOrder === 'asc' ? 'bg-light fw-bold' : ''}`}
            onClick={() => handleSetSortOrder('asc')}
          >
            <span>Crescente (A-Z)</span>
            {sortOrder === 'asc' && <i className="bi bi-check text-primary"></i>}
          </button>
          <button
            type="button"
            className={`dropdown-item fs-12 px-2 py-1 text-dark d-flex align-items-center justify-content-between rounded ${sortOrder === 'desc' ? 'bg-light fw-bold' : ''}`}
            onClick={() => handleSetSortOrder('desc')}
          >
            <span>Decrescente (Z-A)</span>
            {sortOrder === 'desc' && <i className="bi bi-check text-primary"></i>}
          </button>

          <div className="px-1 py-1 text-muted fs-11 fw-bold text-uppercase border-bottom mt-2 mb-1 d-flex justify-content-between align-items-center">
            <span>Filtra Clienti</span>
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-decoration-none fs-11"
              onClick={() => handleSelectAllCheckbox(!isAllSelected)}
            >
              {isAllSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
            </button>
          </div>

          <div className="mb-2">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 fs-11">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                className="form-control form-control-sm border-start-0 shadow-none fs-12"
                placeholder="Cerca cliente..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
              {customerSearch && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border border-start-0 bg-white fs-11"
                  onClick={() => setCustomerSearch('')}
                >
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>
          </div>

          <div className="py-1 overflow-auto" style={{ maxHeight: '160px' }}>
            {filteredCustomers.length === 0 ? (
              <div className="text-muted fs-12 text-center py-2">Nessun cliente trovato</div>
            ) : (
              filteredCustomers.map(c => {
                const isChecked = selectedCustomerIdsFilter === null || selectedCustomerIdsFilter.includes(String(c.id));
                return (
                  <div key={c.id} className="form-check my-1">
                    <input
                      className="form-check-input shadow-none cursor-pointer"
                      type="checkbox"
                      id={`filter-cust-${c.id}`}
                      checked={isChecked}
                      onChange={() => handleToggleCustomerCheckbox(c.id)}
                    />
                    <label className="form-check-label fs-12 text-dark cursor-pointer text-truncate w-100" htmlFor={`filter-cust-${c.id}`} title={c.name}>
                      {c.name}
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SEZIONE DESTRA: COLONNE SERVIZI */}
        <div className="col-6 ps-2">
          <div className="px-1 py-1 text-muted fs-11 fw-bold text-uppercase border-bottom mb-1 d-flex justify-content-between align-items-center">
            <span>Visibilità Colonne</span>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none fs-11"
                onClick={handleShowAllColumns}
              >
                Mostra tutti
              </button>
              <span className="text-muted">|</span>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none fs-11 text-danger"
                onClick={handleHideAllColumns}
              >
                Nascondi tutti
              </button>
            </div>
          </div>

          <div className="mb-2">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 fs-11">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                className="form-control form-control-sm border-start-0 shadow-none fs-12"
                placeholder="Cerca servizio..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {serviceSearch && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border border-start-0 bg-white fs-11"
                  onClick={() => setServiceSearch('')}
                >
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>
          </div>

          <div className="py-1 overflow-auto" style={{ maxHeight: '196px' }}>
            {filteredServices.length === 0 ? (
              <div className="text-muted fs-12 text-center py-2">Nessun servizio trovato</div>
            ) : (
              filteredServices.map(service => {
                const isVisible = !hiddenServiceIds.includes(String(service.id));
                return (
                  <div key={service.id} className="form-check my-1">
                    <input
                      className="form-check-input shadow-none cursor-pointer"
                      type="checkbox"
                      id={`col-vis-${service.id}`}
                      checked={isVisible}
                      onChange={() => handleToggleColumnVisibility(service.id)}
                    />
                    <label className="form-check-label fs-12 text-dark cursor-pointer text-truncate w-100" htmlFor={`col-vis-${service.id}`} title={service.subcategory}>
                      {service.subcategory}
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Base grid structure component rendering the main matrix layout, managing toolbars,
 * customer filters, sorting rules, service visibility, and modal dialogs.
 */
export const BaseGridStructure = ({
  loading,
  loadError,
  onRetryLoad,
  onBack,
  selectedTransaction,
  transactionsList,
  hasUnsavedChanges,
  onPeriodChange,
  setSelectedTransaction,
  setGlobalDrafts,
  setRemovedCustomerIds,
  setAddedCustomerIds,
  customerToAdd,
  setCustomerToAdd,
  availableCustomers,
  handleAddCustomerRow,
  handleCancelChanges,
  handleSaveAllChanges,
  isSaving,
  handleClearQuantitiesAndNotes,
  isStatusSaving,
  isTransactionValidated,
  handleToggleStatus,
  activeTab,
  setActiveTab,
  customerSearchInputComponent,
  visibleServices,
  visibleCustomers,
  matrixMap,
  globalDrafts,
  resetKey,
  rowHeights,
  handleRowHeightChange,
  handleCellDataChange,
  handleRemoveCustomerRow,
  handleDragStart,
  handleDragOver,
  handleDrop,
  category,
  isServiceModalOpen,
  setIsServiceModalOpen,
  services,
  serviceSearchFilter,
  setServiceSearchFilter,
  newSubcategoryInput,
  setNewSubcategoryInput,
  handleCreateService,
  editingServiceId,
  setEditingServiceId,
  inlineSubcategoryValue,
  setInlineSubcategoryValue,
  handleSaveInlineService,
  handleToggleServiceActive
}) => {
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [alertData, setAlertData] = useState(null);

  const handleCloseAlert = useCallback(() => {
    setAlertData(null);
  }, []);

  const showAlert = useCallback((message, type = 'success') => {
    setAlertData({ message, type });
  }, []);

  // Initialize sorting order state from local storage or default to ascending
  const [sortOrder, setSortOrder] = useState(() => {
    return localStorage.getItem('grid_customer_sort') || 'asc';
  });

  const [selectedCustomerIdsFilter, setSelectedCustomerIdsFilter] = useState(null);
  const [hiddenServiceIds, setHiddenServiceIds] = useState([]);

  // Persist sorting preference in localStorage on update
  useEffect(() => {
    localStorage.setItem('grid_customer_sort', sortOrder);
  }, [sortOrder]);

  const menuRef = useRef(null);

  // Close filter menu when clicking outside component bounds
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setCustomerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSetSortOrder = (order) => {
    setManualTopCustomerIds([]);
    setSortOrder(order);
  };

  const handleToggleCustomerCheckbox = (customerId) => {
    const stringId = String(customerId);
    setSelectedCustomerIdsFilter(prev => {
      let currentList = prev === null ? visibleCustomers.map(c => String(c.id)) : [...prev];
      if (currentList.includes(stringId)) {
        currentList = currentList.filter(id => id !== stringId);
      } else {
        currentList.push(stringId);
      }
      return currentList;
    });
  };

  const handleSelectAllCheckbox = (select) => {
    if (select) {
      setSelectedCustomerIdsFilter(null);
    } else {
      setSelectedCustomerIdsFilter([]);
    }
  };

  const handleToggleColumnVisibility = (serviceId) => {
    const stringId = String(serviceId);
    setHiddenServiceIds(prev => {
      if (prev.includes(stringId)) {
        return prev.filter(id => id !== stringId);
      } else {
        return [...prev, stringId];
      }
    });
  };

  const handleShowAllColumns = () => {
    setHiddenServiceIds([]);
  };

  const handleHideAllColumns = () => {
    setHiddenServiceIds(visibleServices.map(s => String(s.id)));
  };

  // Memoized list of active columns excluding hidden service IDs
  const activeDisplayedServices = useMemo(() => {
    return visibleServices.filter(s => !hiddenServiceIds.includes(String(s.id)));
  }, [visibleServices, hiddenServiceIds]);

  const [manualTopCustomerIds, setManualTopCustomerIds] = useState([]);
  const prevVisibleCustomersRef = useRef(visibleCustomers);

  // Track newly added customers to position them at the top of the grid list
  useEffect(() => {
    if (visibleCustomers && prevVisibleCustomersRef.current) {
      const prevIds = new Set(prevVisibleCustomersRef.current.map(c => c.id));
      const newlyAdded = visibleCustomers.filter(c => !prevIds.has(c.id));

      if (newlyAdded.length > 0) {
        setManualTopCustomerIds(prev => [...newlyAdded.map(c => c.id), ...prev]);
      }
    }
    prevVisibleCustomersRef.current = visibleCustomers;
  }, [visibleCustomers]);

  /**
   * Protected customer addition wrapper preventing duplicate entries in the grid table.
   */
  const handleProtectedAddCustomer = () => {
    if (!customerToAdd) return;

    const customerIdToAdd = typeof customerToAdd === 'object' && customerToAdd !== null ? customerToAdd.id : customerToAdd;
    const isAlreadyPresent = visibleCustomers.some(c => String(c.id) === String(customerIdToAdd));

    if (isAlreadyPresent) {
      setAlertData({ message: "Il cliente è già presente nella tabella.", type: 'warning' });
      return;
    }

    if (handleAddCustomerRow) {
      handleAddCustomerRow();
    }
  };

  // Memoized and processed customer list applying filters, manual sorting, and alphabetical ordering
  const processedCustomers = useMemo(() => {
    let list = [...visibleCustomers];

    if (selectedCustomerIdsFilter !== null) {
      list = list.filter(c => selectedCustomerIdsFilter.includes(String(c.id)));
    }

    list.sort((a, b) => {
      const indexA = manualTopCustomerIds.indexOf(a.id);
      const indexB = manualTopCustomerIds.indexOf(b.id);

      const isManualA = indexA !== -1;
      const isManualB = indexB !== -1;

      if (isManualA && isManualB) {
        return indexA - indexB;
      }
      if (isManualA) return -1;
      if (isManualB) return 1;

      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
      if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [visibleCustomers, selectedCustomerIdsFilter, sortOrder, manualTopCustomerIds]);

  const isAllSelected = selectedCustomerIdsFilter === null || (Array.isArray(selectedCustomerIdsFilter) && visibleCustomers.every(c => selectedCustomerIdsFilter.includes(String(c.id))));

  if (loadError && !loading) {
    return (
      <div className="alert alert-danger rounded-0" role="alert">
        <p>Impossibile caricare i dati del periodo: {loadError.message}</p>
        <button className="btn btn-sm btn-outline-secondary rounded-0 me-2" onClick={onBack}>Indietro</button>
        <button className="btn btn-sm btn-dark rounded-0" onClick={onRetryLoad}>Riprova</button>
      </div>
    );
  }

  if (loading) {
    return <div className="d-flex justify-content-center align-items-center p-5 text-muted small">Caricamento...</div>;
  }

  const hasActiveFiltersOrHiddenCols = selectedCustomerIdsFilter !== null || hiddenServiceIds.length > 0 || sortOrder !== 'asc';

  return (
    <div inert={isSaving ? '' : undefined} aria-busy={isSaving} className="d-flex flex-column gap-3 px-3 py-2 h-custom-calc position-relative">
      <Alert
        message={alertData?.message}
        type={alertData?.type || 'success'}
        onClose={handleCloseAlert}
      />

      <GridToolbar
        onBack={onBack}
        selectedTransaction={selectedTransaction}
        transactionsList={transactionsList}
        hasUnsavedChanges={hasUnsavedChanges}
        onPeriodChange={onPeriodChange}
        setSelectedTransaction={setSelectedTransaction}
        setGlobalDrafts={setGlobalDrafts}
        setRemovedCustomerIds={setRemovedCustomerIds}
        setAddedCustomerIds={setAddedCustomerIds}
        customerToAdd={customerToAdd}
        setCustomerToAdd={setCustomerToAdd}
        availableCustomers={availableCustomers}
        handleAddCustomerRow={handleProtectedAddCustomer}
        handleCancelChanges={handleCancelChanges}
        handleSaveAllChanges={handleSaveAllChanges}
        isSaving={isSaving}
        handleClearQuantitiesAndNotes={handleClearQuantitiesAndNotes}
        isStatusSaving={isStatusSaving}
        isTransactionValidated={isTransactionValidated}
        handleToggleStatus={handleToggleStatus}
        setIsServiceModalOpen={setIsServiceModalOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        customerSearchInputComponent={customerSearchInputComponent}
      />

      <div className="card border shadow-sm rounded-0 overflow-hidden bg-white">
        <div className="table-responsive ag-theme-quartz" style={{ overflowX: 'auto', overflowY: 'visible', transform: 'translateZ(0)' }}>
          <table className="table table-bordered table-sm mb-0 align-middle fs-13">
            <thead>
              <tr className="table-light">
                <th className="position-sticky top-0 start-0 bg-light border-bottom border-end p-0 fw-bold text-dark w-col-azienda z-10 align-middle" style={{ left: 0, zIndex: 4 }}>
                  <div className="d-flex align-items-center justify-content-between px-3 py-2 position-relative" style={{ minHeight: '38px' }}>
                    <span className="text-truncate">Azienda / Cliente</span>
                    <div className="d-flex align-items-center gap-1">
                      {hasActiveFiltersOrHiddenCols && (
                        <button
                          type="button"
                          className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerIdsFilter(null);
                            setHiddenServiceIds([]);
                            setSortOrder('asc');
                            setCustomerMenuOpen(false);
                          }}
                          title="Azzera filtri, colonne nascoste e ordinamento"
                        >
                          <i className="bi bi-x-circle-fill fs-12 text-muted"></i>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomerMenuOpen(prev => !prev);
                        }}
                        title="Filtri, ordinamento e gestione colonne"
                      >
                        <i className={`bi bi-funnel-fill fs-12 ${hasActiveFiltersOrHiddenCols ? 'text-primary' : ''}`}></i>
                        <i className="bi bi-caret-down-fill fs-10 ms-1"></i>
                      </button>
                    </div>

                    {customerMenuOpen && (
                      <UnifiedFilterDropdown
                        menuRef={menuRef}
                        sortOrder={sortOrder}
                        handleSetSortOrder={handleSetSortOrder}
                        isAllSelected={isAllSelected}
                        handleSelectAllCheckbox={handleSelectAllCheckbox}
                        visibleCustomers={visibleCustomers}
                        selectedCustomerIdsFilter={selectedCustomerIdsFilter}
                        handleToggleCustomerCheckbox={handleToggleCustomerCheckbox}
                        visibleServices={visibleServices}
                        hiddenServiceIds={hiddenServiceIds}
                        handleToggleColumnVisibility={handleToggleColumnVisibility}
                        handleShowAllColumns={handleShowAllColumns}
                        handleHideAllColumns={handleHideAllColumns}
                      />
                    )}
                  </div>
                </th>
                {activeDisplayedServices.map((service) => {
                  return (
                    <th
                      key={service.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, service.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, service.id)}
                      className="position-sticky top-0 bg-light border-bottom border-end p-2 text-center text-dark position-relative min-w-service cursor-grab z-3"
                      title="Trascina per riordinare la colonna"
                      style={{ zIndex: 2 }}
                    >
                      <div className="d-flex align-items-center justify-content-center gap-1 overflow-hidden h-100">
                        <i className="bi bi-grip-vertical text-muted shrink-0 fs-12"></i>
                        <span className="fs-12">{service.subcategory}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {processedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={activeDisplayedServices.length + 1} className="text-center py-5 text-muted bg-white small">
                    Nessun cliente trovato con i filtri applicati.
                  </td>
                </tr>
              ) : (
                processedCustomers.map((customer) => {
                  const identifier = customer.customer_code || customer.tax_id || customer.vat_number || '';
                  const parentCode = customer.parent_code || customer.parent_id || customer.codice_padre || '';
                  const currentRowHeight = rowHeights[customer.id];

                  return (
                    <tr key={customer.id}>
                      <td className="position-sticky start-0 bg-white border-bottom border-end px-3 text-dark min-h-64px h-auto" style={{ left: 0, zIndex: 1 }}>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="text-truncate w-100">
                            <div className="fw-semibold text-dark text-truncate fs-13">
                              {customer.name || '-'}
                            </div>
                            <div className="text-muted text-truncate fs-11">
                              Codice: {identifier || '-'}
                            </div>
                            <div className="text-muted text-truncate fs-11">
                              Padre: {parentCode || '-'}
                            </div>
                          </div>
                          <button onClick={() => handleRemoveCustomerRow(customer)} className="btn btn-link btn-sm p-0 text-danger text-decoration-none lh-1 shrink-0" title="Rimuovi riga" >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      </td>
                      {activeDisplayedServices.map((service) => {
                        const itemKey = `${customer.id}_${service.id}`;
                        const item = matrixMap[itemKey];
                        const draft = globalDrafts[itemKey];
                        const effectiveItem = draft ? { ...item, ...draft.values } : item;

                        return (
                          <StandardGridCell
                            key={`cell-${resetKey}-${selectedTransaction.year}-${selectedTransaction.month}-${itemKey}`}
                            customer={customer}
                            service={service}
                            item={effectiveItem}
                            disabled={isSaving}
                            rowHeight={currentRowHeight}
                            onRowHeightChange={handleRowHeightChange}
                            onCellDataChange={handleCellDataChange}
                          />
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ServiceManagementModal
        isOpen={isServiceModalOpen}
        isCedolini={activeTab === 'cedolini'}
        onClose={async () => {
          setIsServiceModalOpen(false);
          if (setEditingServiceId) setEditingServiceId(null);
          if (setServiceSearchFilter) setServiceSearchFilter('');
          if (setNewSubcategoryInput) {
            setNewSubcategoryInput(activeTab === 'cedolini' ? 'Cedolini ' : '');
          }
        }}
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
        showAlert={showAlert}
        category={category}
      />
    </div>
  );
};

export default BaseGridStructure;