import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { useVarie } from '../hooks/useVarie';
import { createItemBatch } from '../utils/itemBatch';
import { getClienti, getServices, createService, updateService, getTransactions, updateTransaction } from '../services/api';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { GridToolbar } from './GridToolbar';
import { ServiceManagementModal } from './ServiceManagementModal';
import { ConfirmModal } from './ConfirmModal';
import { Alert } from './Alert'; // Import del componente Alert

/**
 * Reactive custom editor for Notes, Quantity, and Price, retaining partially typed numeric text.
 */
const LiveInputEditor = (props) => {
  const [value, setValue] = useState(props.value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleChange = (e) => {
    let newVal = e.target.value;
    
    if (props.colDef.field === 'quantity' || props.colDef.field === 'price') {
      newVal = newVal.replace(/[^0-9.,]/g, '');
    }

    setValue(newVal);
    const field = props.colDef.field;
    const isNumeric = field === 'quantity' || field === 'price';
    const parsed = isNumeric ? Number(newVal.replace(',', '.')) : newVal;
    const processedVal = isNumeric && isNaN(parsed) ? 0 : parsed;
    props.onValueChange(processedVal);
    
    if (props.node && props.data) {
      if (props.onLiveChange) {
        props.onLiveChange(props.data, field, processedVal);
      }
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="form-control form-control-sm rounded-0 shadow-none border-0 px-1 h-100 w-100 bg-transparent"
      value={value}
      onChange={handleChange}
    />
  );
};


/**
 * Editor component integrating datalist autocomplete with backend search and synchronization.
 */
const ServiceDatalistEditor = (props) => {
  const [value, setValue] = useState(props.value ?? '');
  const [suggestions, setSuggestions] = useState(props.services || []);
  const inputRef = useRef(null);
  
  const datalistId = useId();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleChange = async (e) => {
    const newVal = e.target.value;
    setValue(newVal);
    props.onValueChange(newVal);

    if (props.node && props.data) {
      const matched = suggestions.find(s => (s.subcategory || '').toLowerCase() === newVal.toLowerCase());
      const serviceId = matched ? matched.id : null;

      if (props.onServiceChange) {
        props.onServiceChange(props.data, newVal, serviceId);
      }
    }

    try {
      const latestData = await getServices();
      const filtered = (Array.isArray(latestData) ? latestData : []).filter(
        (service) => service.category === 'VARIE' && (service.is_active === 1 || service.is_active === true)
      );
      setSuggestions(filtered);
    } catch (err) {
      console.error("Errore recupero servizi da backend durante la digitazione:", err);
    }
  };

  return (
    <>
      <style>{`
        datalist#${datalistId} {
          max-height: 180px;
          overflow-y: auto;
        }
      `}</style>
      <input
        ref={inputRef}
        type="text"
        list={datalistId}
        className="form-control form-control-sm rounded-0 shadow-none border-0 px-1 h-100 w-100 bg-transparent"
        value={value}
        onChange={handleChange}
      />
      <datalist id={datalistId}>
        {suggestions.map((s) => (
          <option key={s.id} value={s.subcategory} />
        ))}
      </datalist>
    </>
  );
};

/**
 * Isolated subcomponent managing column sorting controls and multi-select checkbox filters.
 */
const ColumnFilterMenu = ({
  title,
  uniqueValues,
  selectedValuesFilter,
  sortOrder,
  setSortOrder,
  handleSelectAllCheckbox,
  handleToggleCheckbox,
  isAllSelected,
  menuRef,
  renderLabel
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return uniqueValues;
    const query = searchTerm.toLowerCase();
    return uniqueValues.filter(item => {
      const labelText = renderLabel ? renderLabel(item) : String(item);
      return labelText.toLowerCase().includes(query);
    });
  }, [uniqueValues, searchTerm, renderLabel]);

  return (
    <div
      ref={menuRef}
      className="position-absolute bg-white border shadow-lg rounded py-2 mt-1 text-start"
      style={{ top: '100%', left: '0', minWidth: '240px', maxWidth: '300px', zIndex: 99999 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1 text-muted fs-11 fw-bold text-uppercase border-bottom mb-1">Ordinamento</div>
      <button
        type="button"
        className={`dropdown-item fs-12 px-3 py-1 text-dark d-flex align-items-center justify-content-between ${sortOrder === 'asc' ? 'bg-light fw-bold' : ''}`}
        onClick={() => setSortOrder('asc')}
      >
        <span>Crescente (A-Z)</span>
        {sortOrder === 'asc' && <i className="bi bi-check text-primary"></i>}
      </button>
      <button
        type="button"
        className={`dropdown-item fs-12 px-3 py-1 text-dark d-flex align-items-center justify-content-between ${sortOrder === 'desc' ? 'bg-light fw-bold' : ''}`}
        onClick={() => setSortOrder('desc')}
      >
        <span>Decrescente (Z-A)</span>
        {sortOrder === 'desc' && <i className="bi bi-check text-primary"></i>}
      </button>

      <div className="px-3 py-1 text-muted fs-11 fw-bold text-uppercase border-bottom mt-2 mb-1 d-flex justify-content-between align-items-center">
        <span>Filtra {title}</span>
        <button
          type="button"
          className="btn btn-link btn-sm p-0 text-decoration-none fs-11"
          onClick={() => handleSelectAllCheckbox(!isAllSelected)}
        >
          {isAllSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
        </button>
      </div>

      <div className="px-3 mb-2">
        <div className="input-group input-group-sm">
          <span className="input-group-text bg-light border-end-0 fs-11">
            <i className="bi bi-search"></i>
          </span>
          <input
            type="text"
            className="form-control form-control-sm border-start-0 shadow-none fs-12"
            placeholder={`Cerca ${title.toLowerCase()}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          {searchTerm && (
            <button
              type="button"
              className="btn btn-outline-secondary border border-start-0 bg-white fs-11"
              onClick={() => setSearchTerm('')}
            >
              <i className="bi bi-x"></i>
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-1 overflow-auto" style={{ maxHeight: '160px' }}>
        {filteredItems.length === 0 ? (
          <div className="text-muted fs-12 text-center py-2">Nessun elemento trovato</div>
        ) : (
          filteredItems.map(item => {
            const keyId = item.id !== undefined ? String(item.id) : String(item);
            const isChecked = selectedValuesFilter === null || selectedValuesFilter.includes(keyId);
            const labelText = renderLabel ? renderLabel(item) : String(item);

            return (
              <div key={keyId} className="form-check my-1">
                <input
                  className="form-check-input shadow-none cursor-pointer"
                  type="checkbox"
                  id={`filter-col-${title}-${keyId}`}
                  checked={isChecked}
                  onChange={() => handleToggleCheckbox(keyId)}
                />
                <label className="form-check-label fs-12 text-dark cursor-pointer text-truncate w-100" htmlFor={`filter-col-${title}-${keyId}`} title={labelText}>
                  {labelText || '(Vuoto)'}
                </label>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/**
 * Main VarieGrid component rendering the AG Grid table interface for miscellaneous transactions,
 * managing cell edits, filters, local state tracking, and backend data synchronization.
 */
export const VarieGrid = ({
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
  const gridRef = useRef(null);

  // Stato per gestire gli alert
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success' });

  const showAlert = useCallback((text, type = 'success') => {
    setAlertInfo({
      message: text,
      type
    });
  }, []);

  const targetYear = useMemo(() => {
    return typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.year || year) : Number(year);
  }, [transactionId, year]);

  const targetMonth = useMemo(() => {
    return typeof transactionId === 'object' && transactionId !== null ? Number(transactionId.month || month) : Number(month);
  }, [transactionId, month]);

  const selectedTransaction = useMemo(() => ({
    year: targetYear,
    month: targetMonth
  }), [targetYear, targetMonth]);

  const [transactionsList, setTransactionsList] = useState([]);
  const [isStatusSaving, setIsStatusSaving] = useState(false);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const [serviceSearchFilter, setServiceSearchFilter] = useState('');
  const [newSubcategoryInput, setNewSubcategoryInput] = useState('');
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [inlineSubcategoryValue, setInlineSubcategoryValue] = useState('');

  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [praticaMenuOpen, setPraticaMenuOpen] = useState(false);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);

  const [customerSortOrder, setCustomerSortOrder] = useState(() => localStorage.getItem('varie_grid_customer_sort') || 'asc');
  const [praticaSortOrder, setPraticaSortOrder] = useState(() => localStorage.getItem('varie_grid_pratica_sort') || 'asc');
  const [noteSortOrder, setNoteSortOrder] = useState(() => localStorage.getItem('varie_grid_note_sort') || 'asc');

  const [selectedCustomerIdsFilter, setSelectedCustomerIdsFilter] = useState(null);
  const [selectedPraticaFilter, setSelectedPraticaFilter] = useState(null);
  const [selectedNoteFilter, setSelectedNoteFilter] = useState(null);

  const customerMenuRef = useRef(null);
  const praticaMenuRef = useRef(null);
  const noteMenuRef = useRef(null);

  const initialLoadComplete = useRef(false);
  const knownIds = useRef(new Set());
  const [sessionNewIds, setSessionNewIds] = useState(() => new Set());

  useEffect(() => {
    localStorage.setItem('varie_grid_customer_sort', customerSortOrder);
    localStorage.setItem('varie_grid_pratica_sort', praticaSortOrder);
    localStorage.setItem('varie_grid_note_sort', noteSortOrder);
  }, [customerSortOrder, praticaSortOrder, noteSortOrder]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerMenuRef.current && !customerMenuRef.current.contains(event.target)) setCustomerMenuOpen(false);
      if (praticaMenuRef.current && !praticaMenuRef.current.contains(event.target)) setPraticaMenuOpen(false);
      if (noteMenuRef.current && !noteMenuRef.current.contains(event.target)) setNoteMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchTransactions = async () => {
      try {
        const data = await getTransactions('VARIE');
        if (isMounted) {
          setTransactionsList(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Errore caricamento transazioni per navigazione varie:", err);
      }
    };
    fetchTransactions();
    return () => { isMounted = false; };
  }, [selectedTransaction]);

  const currentTransactionObj = useMemo(() => {
    return transactionsList.find(
      (t) => Number(t.year) === Number(selectedTransaction.year) && Number(t.month) === Number(selectedTransaction.month)
    );
  }, [transactionsList, selectedTransaction]);

  const isTransactionValidated = currentTransactionObj?.status === 1 || currentTransactionObj?.status === 'validated' || currentTransactionObj?.is_validated === true || currentTransactionObj?.is_validated === 1;

  const handleToggleStatus = async () => {
    const newStatus = isTransactionValidated ? 0 : 1;
    try {
      setIsStatusSaving(true);
      await updateTransaction('VARIE', selectedTransaction.year, selectedTransaction.month, { status: newStatus });
      const data = await getTransactions('VARIE');
      setTransactionsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Errore durante l'aggiornamento dello stato varie:", err);
      showAlert("Errore durante l'aggiornamento dello stato del documento.", "error");
    } finally {
      setIsStatusSaving(false);
    }
  };

  const {
    rowData: rawRowData,
    replaceRows,
    error: loadError
  } = useVarie(selectedTransaction);

  useEffect(() => {
    if (loadError) showAlert(`Errore caricamento dati: ${loadError.message}`, 'error');
  }, [loadError]);

  const [allCustomers, setAllCustomers] = useState([]);
  const [customerToAdd, setCustomerToAdd] = useState('');
  const [services, setServices] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const [localRowData, setLocalRowData] = useState([]);
  const localRowDataRef = useRef([]);
  useEffect(() => {
    localRowDataRef.current = localRowData;
  }, [localRowData]);

  const [deletedIds, setDeletedIds] = useState([]);
  const [manualRows, setManualRows] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const prevPeriodRef = useRef({ year: targetYear, month: targetMonth });
  useEffect(() => {
    if (prevPeriodRef.current.year !== targetYear || prevPeriodRef.current.month !== targetMonth) {
      prevPeriodRef.current = { year: targetYear, month: targetMonth };
      setLocalRowData([]);
      setManualRows([]);
      setDeletedIds([]);
      setHasUnsavedChanges(false);

      initialLoadComplete.current = false;
      knownIds.current.clear();
      setSessionNewIds(new Set());
    }
  }, [targetYear, targetMonth]);

  const sortServices = (servList) =>
    [...servList].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const filterVarieServices = (servicesList) =>
    (Array.isArray(servicesList) ? servicesList : []).filter((service) => service.category === 'VARIE');

  const fetchServicesAndCustomers = useCallback(async () => {
    try {
      const [customersData, servicesData] = await Promise.all([getClienti(), getServices()]);
      setAllCustomers(Array.isArray(customersData) ? customersData : []);
      setServices(sortServices(filterVarieServices(servicesData)));
    } catch (err) {
      console.error('Errore caricamento dati varie:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      try {
        const [customersData, servicesData] = await Promise.all([getClienti(), getServices()]);
        if (isMounted) {
          setAllCustomers(Array.isArray(customersData) ? customersData : []);
          setServices(sortServices(filterVarieServices(servicesData)));
        }
      } catch (err) {
        console.error('Errore caricamento dati varie:', err);
      }
    };
    loadInitialData();
    return () => { isMounted = false; };
  }, []);

  const mapDbRowToLocal = useCallback((item) => {
    const customer = allCustomers.find((c) => c.id === item.customer_id) || { name: 'Cliente Sconosciuto' };
    const matchedService = services.find((s) => Number(s.id) === Number(item.service_id));
    const subcategory = matchedService?.subcategory || '';

    let note = '';
    if (item.custom_data) {
      try {
        const parsed = typeof item.custom_data === 'string' ? JSON.parse(item.custom_data) : item.custom_data;
        if (parsed && typeof parsed === 'object') {
          if (parsed.note) note = parsed.note;
        }
      } catch (parseError) {
        console.error("Errore di parsing JSON custom_data:", parseError);
      }
    }

    return {
      rowKey: `db-${item.id}`,
      id: item.id,
      isManual: false,
      customer,
      customerId: item.customer_id,
      service_id: item.service_id,
      subcategory,
      note,
      quantity: item.quantity ?? 0,
      price: item.price ?? 0,
      item
    };
  }, [allCustomers, services]);

  const prevRawRowDataRef = useRef(rawRowData);
  useEffect(() => {
    if (!rawRowData || !Array.isArray(rawRowData)) return;
    if (prevRawRowDataRef.current === rawRowData) return;
    prevRawRowDataRef.current = rawRowData;

    if (!initialLoadComplete.current) {
      rawRowData.forEach(r => knownIds.current.add(r.id));
      initialLoadComplete.current = true;
    } else {
      setSessionNewIds(prev => {
        const nextSet = new Set(prev);
        rawRowData.forEach(r => {
          if (!knownIds.current.has(r.id)) {
            nextSet.add(r.id);
            knownIds.current.add(r.id);
          }
        });
        return nextSet;
      });
    }

    const existingByKey = new Map(localRowDataRef.current.map((row) => [row.rowKey, row]));
    const merged = rawRowData.map((item) => {
      const rowKey = `db-${item.id}`;
      return existingByKey.get(rowKey) || mapDbRowToLocal(item);
    });

    setLocalRowData(merged);
    setDeletedIds([]);
  }, [rawRowData, mapDbRowToLocal, hasUnsavedChanges]);

  const handleSetCustomerSortOrder = useCallback((val) => { 
    setSessionNewIds(new Set()); 
    setCustomerSortOrder(val); 
  }, []);

  const handleSetPraticaSortOrder = useCallback((val) => { 
    setSessionNewIds(new Set()); 
    setPraticaSortOrder(val); 
  }, []);

  const handleSetNoteSortOrder = useCallback((val) => { 
    setSessionNewIds(new Set()); 
    setNoteSortOrder(val); 
  }, []);

  const visibleServices = useMemo(() => {
    return services.filter((service) => service.is_active === 1 || service.is_active === true);
  }, [services]);

  const handleLiveCellChange = useCallback((updatedData, field, value) => {
    if (updatedData.isManual) {
      setManualRows((prev) =>
        prev.map((row) => (row.rowKey === updatedData.rowKey ? { ...row, [field]: value } : row))
      );
    } else {
      setLocalRowData((prev) =>
        prev.map((row) => (row.rowKey === updatedData.rowKey ? { ...row, [field]: value } : row))
      );
    }
    setHasUnsavedChanges(true);
  }, []);

  const handleServiceCellChange = useCallback((updatedData, subcategoryVal, serviceIdVal) => {
    const patch = {
      subcategory: subcategoryVal,
      service_id: serviceIdVal
    };

    if (updatedData.isManual) {
      setManualRows((prev) =>
        prev.map((row) => (row.rowKey === updatedData.rowKey ? { ...row, ...patch } : row))
      );
    } else {
      setLocalRowData((prev) =>
        prev.map((row) => (row.rowKey === updatedData.rowKey ? { ...row, ...patch } : row))
      );
    }
    setHasUnsavedChanges(true);
  }, []);

  const onCellValueChanged = (params) => {
    handleLiveCellChange(params.data, params.colDef.field, params.newValue);
  };

  const handleStageDelete = (row) => {
    if (!row.isManual) {
      setDeletedIds((prev) => [...prev, row.id]);
    }
    setLocalRowData((prev) => prev.filter((r) => r.rowKey !== row.rowKey));
    setManualRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey));
    setHasUnsavedChanges(true);
  };

  const handleClearQuantitiesAndNotes = () => {
    setLocalRowData((prev) =>
      prev.map((r) => ({ ...r, quantity: 0, note: '' }))
    );
    setManualRows((prev) =>
      prev.map((r) => ({ ...r, quantity: 0, note: '' }))
    );
    setHasUnsavedChanges(true);
  };

  const handleAddCustomerRow = () => {
    if (!customerToAdd) return;
    const customerId = isNaN(Number(customerToAdd)) ? customerToAdd : Number(customerToAdd);
    const customer = allCustomers.find((c) => c.id === customerId) || { name: 'Nuovo Cliente' };
    const newManualRowKey = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const newRow = {
      rowKey: newManualRowKey,
      id: newManualRowKey,
      isManual: true,
      customer,
      customerId,
      service_id: null,
      subcategory: '',
      note: '',
      quantity: 0,
      price: 0,
      item: null
    };

    setManualRows((prev) => [newRow, ...prev]);
    setHasUnsavedChanges(true);
    setCustomerToAdd('');
  };

  const combinedTableRows = useMemo(() => {
    return [...manualRows, ...localRowData];
  }, [manualRows, localRowData]);

  const uniqueGridCustomers = useMemo(() => {
    const map = new Map();
    combinedTableRows.forEach(row => {
      if (row.customer && row.customer.id) {
        map.set(String(row.customer.id), row.customer);
      }
    });
    return Array.from(map.values());
  }, [combinedTableRows]);

  const uniqueGridPratiche = useMemo(() => {
    const set = new Set();
    combinedTableRows.forEach(row => {
      set.add(row.subcategory || '');
    });
    return Array.from(set).sort();
  }, [combinedTableRows]);

  const uniqueGridNotes = useMemo(() => {
    const set = new Set();
    combinedTableRows.forEach(row => {
      set.add(row.note || '');
    });
    return Array.from(set).sort();
  }, [combinedTableRows]);

  const isAllCustomersSelected = selectedCustomerIdsFilter === null || (Array.isArray(selectedCustomerIdsFilter) && uniqueGridCustomers.every(c => selectedCustomerIdsFilter.includes(String(c.id))));
  const isAllPraticheSelected = selectedPraticaFilter === null || (Array.isArray(selectedPraticaFilter) && uniqueGridPratiche.every(p => selectedPraticaFilter.includes(p)));
  const isAllNotesSelected = selectedNoteFilter === null || (Array.isArray(selectedNoteFilter) && uniqueGridNotes.every(n => selectedNoteFilter.includes(n)));

  const handleToggleCustomerCheckbox = useCallback((customerId) => {
    const stringId = String(customerId);
    setSelectedCustomerIdsFilter(prev => {
      let currentList = prev === null ? uniqueGridCustomers.map(c => String(c.id)) : [...prev];
      if (currentList.includes(stringId)) {
        currentList = currentList.filter(id => id !== stringId);
      } else {
        currentList.push(stringId);
      }
      return currentList;
    });
  }, [uniqueGridCustomers]);

  const handleSelectAllCustomers = useCallback((select) => {
    setSelectedCustomerIdsFilter(select ? null : []);
  }, []);

  const handleTogglePraticaCheckbox = useCallback((praticaVal) => {
    setSelectedPraticaFilter(prev => {
      let currentList = prev === null ? [...uniqueGridPratiche] : [...prev];
      if (currentList.includes(praticaVal)) {
        currentList = currentList.filter(p => p !== praticaVal);
      } else {
        currentList.push(praticaVal);
      }
      return currentList;
    });
  }, [uniqueGridPratiche]);

  const handleSelectAllPratiche = useCallback((select) => {
    setSelectedPraticaFilter(select ? null : []);
  }, []);

  const handleToggleNoteCheckbox = useCallback((noteVal) => {
    setSelectedNoteFilter(prev => {
      let currentList = prev === null ? [...uniqueGridNotes] : [...prev];
      if (currentList.includes(noteVal)) {
        currentList = currentList.filter(n => n !== noteVal);
      } else {
        currentList.push(noteVal);
      }
      return currentList;
    });
  }, [uniqueGridNotes]);

  const handleSelectAllNotes = useCallback((select) => {
    setSelectedNoteFilter(select ? null : []);
  }, []);

  const sessionNewIdsArray = useMemo(() => Array.from(sessionNewIds), [sessionNewIds]);

  const filteredTableRows = useMemo(() => {
    let filteredManual = [...manualRows];
    if (selectedCustomerIdsFilter !== null) {
      filteredManual = filteredManual.filter((row) => {
        const custId = row.customer?.id || row.customerId;
        return selectedCustomerIdsFilter.includes(String(custId));
      });
    }
    if (selectedPraticaFilter !== null) {
      filteredManual = filteredManual.filter((row) => selectedPraticaFilter.includes(row.subcategory || ''));
    }
    if (selectedNoteFilter !== null) {
      filteredManual = filteredManual.filter((row) => selectedNoteFilter.includes(row.note || ''));
    }

    let list = [...localRowData];

    if (selectedCustomerIdsFilter !== null) {
      list = list.filter((row) => {
        const custId = row.customer?.id || row.customerId;
        return selectedCustomerIdsFilter.includes(String(custId));
      });
    }

    if (selectedPraticaFilter !== null) {
      list = list.filter((row) => {
        const subcat = row.subcategory || '';
        return selectedPraticaFilter.includes(subcat);
      });
    }

    if (selectedNoteFilter !== null) {
      list = list.filter((row) => {
        const n = row.note || '';
        return selectedNoteFilter.includes(n);
      });
    }

    list.sort((a, b) => {
      const isNewA = sessionNewIdsArray.includes(a.id) || a.isManual;
      const isNewB = sessionNewIdsArray.includes(b.id) || b.isManual;
      
      if (isNewA && !isNewB) return -1;
      if (!isNewA && isNewB) return 1;

      const nameA = (a.customer?.name || '').toLowerCase();
      const nameB = (b.customer?.name || '').toLowerCase();
      if (nameA !== nameB) {
        return customerSortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }

      const pratA = (a.subcategory || '').toLowerCase();
      const pratB = (b.subcategory || '').toLowerCase();
      if (pratA !== pratB) {
        return praticaSortOrder === 'asc' ? pratA.localeCompare(pratB) : pratB.localeCompare(pratA);
      }

      const noteA = (a.note || '').toLowerCase();
      const noteB = (b.note || '').toLowerCase();
      if (noteA !== noteB) {
        return noteSortOrder === 'asc' ? noteA.localeCompare(noteB) : noteB.localeCompare(noteA);
      }

      return 0;
    });

    return [...filteredManual, ...list];
  }, [
    manualRows,
    localRowData, 
    selectedCustomerIdsFilter, 
    selectedPraticaFilter, 
    selectedNoteFilter,
    customerSortOrder, 
    praticaSortOrder, 
    noteSortOrder,
    sessionNewIdsArray
  ]);

  const effectiveHasUnsaved = hasUnsavedChanges || deletedIds.length > 0 || manualRows.length > 0;

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(effectiveHasUnsaved);
    setHasUnsaved(effectiveHasUnsaved);
  }, [effectiveHasUnsaved, onDirtyChange, setHasUnsaved]);

  // Gestione dell'azione "Annulla" con controllo modale
  const handleCancelChanges = () => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.stopEditing(true);
    }
    if (effectiveHasUnsaved) {
      setIsConfirmModalOpen(true);
      return;
    }
    executeCancelChanges();
  };

  // Funzione reale di reset dati eseguita dopo la conferma positiva del modale
  const executeCancelChanges = () => {
    setHasUnsavedChanges(false);
    setDeletedIds([]);
    setManualRows([]);
    if (rawRowData && Array.isArray(rawRowData)) {
      const mapped = rawRowData.map((item) => {
        const customer = allCustomers.find((c) => c.id === item.customer_id) || { name: 'Cliente Sconosciuto' };
        const matchedService = services.find((s) => Number(s.id) === Number(item.service_id));
        const subcategory = matchedService?.subcategory || '';

        let note = '';
        if (item.custom_data) {
          try {
            const parsed = typeof item.custom_data === 'string' ? JSON.parse(item.custom_data) : item.custom_data;
            if (parsed && typeof parsed === 'object') {
              if (parsed.note) note = parsed.note;
            }
          } catch (parseError) {
            console.error("Errore di parsing JSON custom_data:", parseError);
          }
        }
        return {
          rowKey: `db-${item.id}`,
          id: item.id,
          isManual: false,
          customer,
          customerId: item.customer_id,
          service_id: item.service_id,
          subcategory,
          note,
          quantity: item.quantity ?? 0,
          price: item.price ?? 0,
          item
        };
      });
      setLocalRowData(mapped);
    }
    setHasUnsaved(false);
    setIsConfirmModalOpen(false);
    showAlert("Modifiche annullate con successo.", "success"); // Alert annullo operazione
  };

  const handleSaveAllChanges = async () => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.stopEditing();
    }

    try {
      setIsSaving(true);
      const activeYear = Number(selectedTransaction?.year || year);
      const activeMonth = Number(selectedTransaction?.month || month);
      const batch = createItemBatch('VARIE', activeYear, activeMonth);
      const { addItem, deleteItem, handleCellValueChanged: hookHandleCellValueChanged } = batch;

      const latestServicesData = await getServices();
      const currentServicesList = sortServices(filterVarieServices(latestServicesData));

      const resolveServiceForSubcat = async (subcatName) => {
        const rawTrimmed = (subcatName || '').trim();
        const normalizedInput = rawTrimmed.replace(/\s+/g, ' ');
        if (!normalizedInput) return null;

        let found = currentServicesList.find(
          (s) => (s.subcategory || '').trim().toLowerCase() === normalizedInput.toLowerCase()
        );
        if (found) return found.id;

        const ref = batch.addService({
          category: 'VARIE',
          subcategory: normalizedInput,
          is_active: 1,
          display_order: currentServicesList.length + 1
        });

        currentServicesList.push({ id: ref, subcategory: normalizedInput });
        return ref;
      };

      for (const idToRemove of deletedIds) {
        await deleteItem(idToRemove);
      }

      const newItemIndexes = [];
      for (const mRow of manualRows) {
        const targetServiceId = await resolveServiceForSubcat(mRow.subcategory);
        const res = await addItem({
          year: activeYear,
          month: activeMonth,
          customer_id: mRow.customerId,
          service_id: typeof targetServiceId === 'string' ? null : targetServiceId,
          quantity: Number(mRow.quantity || 0),
          price: Number(mRow.price || 0),
          custom_data: JSON.stringify({
            note: mRow.note || ''
          })
        });
        newItemIndexes.push(res.operationIndex);
        if (typeof targetServiceId === 'string') batch.setServiceReference(res.operationIndex, targetServiceId);
      }

      for (const row of localRowData) {
        if (row.isManual) continue;
        const currentItemInDb = (rawRowData || []).find((r) => String(r.id) === String(row.id));
        if (!currentItemInDb) continue;

        const targetServiceId = await resolveServiceForSubcat(row.subcategory);
        
        const buildCustomData = () => {
          return JSON.stringify({
            note: row.note || ''
          });
        };

        if (currentItemInDb.price !== Number(row.price)) {
          await hookHandleCellValueChanged({ data: currentItemInDb, field: 'price', newValue: Number(row.price) });
        }
        if (currentItemInDb.quantity !== Number(row.quantity)) {
          await hookHandleCellValueChanged({ data: currentItemInDb, field: 'quantity', newValue: Number(row.quantity) });
        }
        if (typeof targetServiceId === 'string') {
          await hookHandleCellValueChanged({ data: currentItemInDb, field: 'service_id', newValue: null });
        } else if (currentItemInDb.service_id !== (targetServiceId ? Number(targetServiceId) : null)) {
          await hookHandleCellValueChanged({ data: currentItemInDb, field: 'service_id', newValue: targetServiceId ? Number(targetServiceId) : null });
        }

        const newCustomDataStr = buildCustomData();
        if (currentItemInDb.custom_data !== newCustomDataStr) {
          await hookHandleCellValueChanged({ data: currentItemInDb, field: 'custom_data', newValue: newCustomDataStr });
        }
        if (typeof targetServiceId === 'string') batch.setItemServiceReference(currentItemInDb.id, targetServiceId);
      }

      const saved = await batch.commit();
      const newlyAddedKeys = newItemIndexes.map(index => saved.results[index].id);
      setServices(sortServices(filterVarieServices(saved.services)));
      replaceRows(saved.rows);
      setHasUnsavedChanges(false);
      setDeletedIds([]);
      setManualRows([]);
      setHasUnsaved(false);

      if (newlyAddedKeys.length > 0) {
        setSessionNewIds(prev => {
          const next = new Set(prev);
          newlyAddedKeys.forEach(id => {
            next.add(id);
            knownIds.current.add(id);
          });
          return next;
        });
      }

      showAlert("Modifiche salvate con successo.", "success"); // Alert salvataggio riuscito
    } catch (e) {
      console.error('Errore durante il salvataggio varie:', e);
      showAlert("Errore durante il salvataggio delle modifiche.", "error"); // Alert errore salvataggio
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    const trimmed = newSubcategoryInput.trim();
    if (!trimmed) return;
    try {
      await createService({
        category: 'VARIE',
        subcategory: trimmed,
        is_active: 1,
        display_order: services.length + 1
      });
      setNewSubcategoryInput('');
      await fetchServicesAndCustomers();
    } catch (err) {
      console.error("Errore creazione servizio:", err);
      showAlert("Errore durante la creazione del servizio.", "error");
    }
  };

  const handleSaveInlineService = async (serv) => {
    const trimmed = inlineSubcategoryValue.trim();
    if (!trimmed) return;
    try {
      await updateService(serv.id, {
        subcategory: trimmed,
        category: 'VARIE',
        is_active: serv.is_active,
        display_order: serv.display_order
      });
      setEditingServiceId(null);
      setInlineSubcategoryValue('');
      await fetchServicesAndCustomers();
    } catch (err) {
      console.error("Errore aggiornamento inline servizio:", err);
      showAlert("Errore durante l'aggiornamento del servizio.", "error");
    }
  };

  const handleToggleServiceActive = async (serv) => {
    try {
      const nextActiveState = !(serv.is_active === 1 || serv.is_active === true);
      await updateService(serv.id, {
        subcategory: serv.subcategory,
        category: 'VARIE',
        is_active: nextActiveState ? 1 : 0,
        display_order: serv.display_order
      });
      await fetchServicesAndCustomers();
    } catch (err) {
      console.error("Errore cambio stato servizio:", err);
      showAlert("Errore durante il cambio di stato del servizio.", "error");
    }
  };

  const colDefs = useMemo(() => [
    {
      headerName: "Azienda",
      field: "customer",
      flex: 1.6,
      sortable: false,
      filter: false,
      editable: false,
      headerComponent: () => {
        const isFilteredOrSorted = selectedCustomerIdsFilter !== null || customerSortOrder !== 'asc';
        return (
          <div className="d-flex align-items-center justify-content-between px-2 py-1 position-relative w-100 h-100" style={{ overflow: 'visible' }}>
            <span className="text-truncate fw-bold">Azienda</span>
            <div className="d-flex align-items-center gap-1">
              {isFilteredOrSorted && (
                <button
                  type="button"
                  className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomerIdsFilter(null);
                    handleSetCustomerSortOrder('asc');
                    setCustomerMenuOpen(false);
                  }}
                  title="Azzera filtro e ordinamento Azienda"
                >
                  <i className="bi bi-x-circle-fill fs-12 text-muted"></i>
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                onClick={(e) => { e.stopPropagation(); setCustomerMenuOpen(prev => !prev); }}
                title="Filtri e ordinamento Azienda"
              >
                <i className={`bi bi-funnel-fill fs-12 ${selectedCustomerIdsFilter !== null ? 'text-primary' : ''}`}></i>
                <i className="bi bi-caret-down-fill fs-10 ms-1"></i>
              </button>
            </div>

            {customerMenuOpen && (
              <ColumnFilterMenu
                title="Azienda"
                uniqueValues={uniqueGridCustomers}
                selectedValuesFilter={selectedCustomerIdsFilter}
                sortOrder={customerSortOrder}
                setSortOrder={handleSetCustomerSortOrder}
                handleSelectAllCheckbox={handleSelectAllCustomers}
                handleToggleCheckbox={handleToggleCustomerCheckbox}
                isAllSelected={isAllCustomersSelected}
                menuRef={customerMenuRef}
                renderLabel={(c) => c.name}
              />
            )}
          </div>
        );
      },
      cellRenderer: (params) => {
        const row = params.data;
        if (!row || !row.customer) return null;
        const customer = row.customer;
        
        const identifier = customer.customer_code || customer.tax_id || customer.vat_number || '';
        const parentCode = customer.parent_code || customer.parent_id || customer.codice_padre || '';

        return (
          <div className="d-flex justify-content-between align-items-start gap-2 w-100 py-1">
            <div className="text-truncate w-100">
              <div className="fw-semibold text-dark text-truncate fs-13 lh-sm">
                {customer.name}
              </div>
              <div className="text-muted text-truncate fs-11 lh-sm">
                codice: {identifier || '-'}
              </div>
              <div className="text-muted text-truncate fs-11 lh-sm">
                padre: {parentCode || '-'}
              </div>
            </div>
            <div className="d-flex align-items-center gap-1 shrink-0 pt-1">
              <button
                type="button"
                onClick={() => handleStageDelete(row)}
                className="btn btn-link btn-sm p-0 text-danger text-decoration-none lh-1"
                title="Rimuovi riga"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        );
      }
    },
    {
      headerName: "Pratica",
      field: "subcategory",
      flex: 1.2,
      sortable: false,
      filter: false,
      editable: true,
      cellEditor: ServiceDatalistEditor,
      cellEditorParams: { services: visibleServices, onServiceChange: handleServiceCellChange },
      headerComponent: () => {
        const isFilteredOrSorted = selectedPraticaFilter !== null || praticaSortOrder !== 'asc';
        return (
          <div className="d-flex align-items-center justify-content-between px-2 py-1 position-relative w-100 h-100" style={{ overflow: 'visible' }}>
            <span className="text-truncate fw-bold">Pratica</span>
            <div className="d-flex align-items-center gap-1">
              {isFilteredOrSorted && (
                <button
                  type="button"
                  className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPraticaFilter(null);
                    handleSetPraticaSortOrder('asc');
                    setPraticaMenuOpen(false);
                  }}
                  title="Azzera filtro e ordinamento Pratica"
                >
                  <i className="bi bi-x-circle-fill fs-12 text-muted"></i>
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                onClick={(e) => { e.stopPropagation(); setPraticaMenuOpen(prev => !prev); }}
                title="Filtri e ordinamento Pratica"
              >
                <i className={`bi bi-funnel-fill fs-12 ${selectedPraticaFilter !== null ? 'text-primary' : ''}`}></i>
                <i className="bi bi-caret-down-fill fs-10 ms-1"></i>
              </button>
            </div>

            {praticaMenuOpen && (
              <ColumnFilterMenu
                title="Pratica"
                uniqueValues={uniqueGridPratiche}
                selectedValuesFilter={selectedPraticaFilter}
                sortOrder={praticaSortOrder}
                setSortOrder={handleSetPraticaSortOrder}
                handleSelectAllCheckbox={handleSelectAllPratiche}
                handleToggleCheckbox={handleTogglePraticaCheckbox}
                isAllSelected={isAllPraticheSelected}
                menuRef={praticaMenuRef}
              />
            )}
          </div>
        );
      }
    },
    {
      headerName: "Note",
      field: "note",
      flex: 1.4,
      sortable: false,
      filter: false,
      editable: true,
      cellEditor: LiveInputEditor,
      cellEditorParams: { onLiveChange: handleLiveCellChange },
      headerComponent: () => {
        const isFilteredOrSorted = selectedNoteFilter !== null || noteSortOrder !== 'asc';
        return (
          <div className="d-flex align-items-center justify-content-between px-2 py-1 position-relative w-100 h-100" style={{ overflow: 'visible' }}>
            <span className="text-truncate fw-bold">Note</span>
            <div className="d-flex align-items-center gap-1">
              {isFilteredOrSorted && (
                <button
                  type="button"
                  className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNoteFilter(null);
                    handleSetNoteSortOrder('asc');
                    setNoteMenuOpen(false);
                  }}
                  title="Azzera filtro e ordinamento Note"
                >
                  <i className="bi bi-x-circle-fill fs-12 text-muted"></i>
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm p-0 border-0 bg-transparent text-secondary d-flex align-items-center"
                onClick={(e) => { e.stopPropagation(); setNoteMenuOpen(prev => !prev); }}
                title="Filtri e ordinamento Note"
              >
                <i className={`bi bi-funnel-fill fs-12 ${selectedNoteFilter !== null ? 'text-primary' : ''}`}></i>
                <i className="bi bi-caret-down-fill fs-10 ms-1"></i>
              </button>
            </div>

            {noteMenuOpen && (
              <ColumnFilterMenu
                title="Note"
                uniqueValues={uniqueGridNotes}
                selectedValuesFilter={selectedNoteFilter}
                sortOrder={noteSortOrder}
                setSortOrder={handleSetNoteSortOrder}
                handleSelectAllCheckbox={handleSelectAllNotes}
                handleToggleCheckbox={handleToggleNoteCheckbox}
                isAllSelected={isAllNotesSelected}
                menuRef={noteMenuRef}
              />
            )}
          </div>
        );
      }
    },
    {
      headerName: "Qty",
      field: "quantity",
      flex: 0.6,
      sortable: false,
      filter: false,
      editable: true,
      cellClass: 'text-center',
      cellEditor: LiveInputEditor,
      cellEditorParams: { onLiveChange: handleLiveCellChange }
    },
    {
      headerName: "Importo",
      field: "price",
      flex: 1.0,
      sortable: false,
      filter: false,
      editable: true,
      cellEditor: LiveInputEditor,
      cellEditorParams: { onLiveChange: handleLiveCellChange },
      valueFormatter: (params) => {
        const val = params.value;
        return val !== undefined && val !== null && val !== '' ? `€ ${Number(val).toFixed(2)}` : '';
      }
    }
  ], [
    visibleServices, 
    handleServiceCellChange, 
    handleLiveCellChange, 
    customerMenuOpen, praticaMenuOpen, noteMenuOpen,
    selectedCustomerIdsFilter, selectedPraticaFilter, selectedNoteFilter,
    customerSortOrder, praticaSortOrder, noteSortOrder,
    uniqueGridCustomers, uniqueGridPratiche, uniqueGridNotes,
    isAllCustomersSelected, isAllPraticheSelected, isAllNotesSelected,
    handleToggleCustomerCheckbox, handleSelectAllCustomers,
    handleTogglePraticaCheckbox, handleSelectAllPratiche,
    handleToggleNoteCheckbox, handleSelectAllNotes, 
    handleSetPraticaSortOrder, handleSetCustomerSortOrder, handleSetNoteSortOrder
  ]);

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: false,
    filter: false,
    editable: true,
    singleClickEdit: true,
  }), []);

  return (
    <div inert={isSaving ? '' : undefined} aria-busy={isSaving} className="d-flex flex-column gap-3 px-3 py-2 h-custom-calc">
      <style>{`
        .ag-header-cell {
          overflow: visible !important;
        }
        .ag-header-cell-label {
          overflow: visible !important;
        }
      `}</style>

      <div className="d-flex align-items-center justify-content-between">
        <div className="grow w-100">
          <GridToolbar
            onBack={onBack}
            selectedTransaction={selectedTransaction}
            transactionsList={transactionsList}
            hasUnsavedChanges={effectiveHasUnsaved}
            onPeriodChange={(y, m) => { if (onPeriodChange) onPeriodChange(y, m); }}
            setSelectedTransaction={() => {}}
            setGlobalDrafts={() => {}}
            setRemovedCustomerIds={() => {}}
            setAddedCustomerIds={() => {}}
            customerToAdd={customerToAdd}
            setCustomerToAdd={setCustomerToAdd}
            availableCustomers={allCustomers}
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
            setIsServiceModalOpen={setIsServiceModalOpen}
          />
        </div>
      </div>

      <div className="card border rounded-0 shadow-sm overflow-visible bg-white h-100">
        <div className="ag-theme-quartz h-100">
          <AgGridReact
            ref={gridRef}
            rowData={filteredTableRows}
            columnDefs={colDefs}
            defaultColDef={defaultColDef}
            rowHeight={64}
            headerHeight={42}
            getRowId={(params) => params.data.rowKey}
            onCellValueChanged={onCellValueChanged}
            singleClickEdit={true}
          />
        </div>
      </div>

      <ServiceManagementModal
        isOpen={isServiceModalOpen}
        onClose={() => setIsServiceModalOpen(false)}
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
        category="VARIE"
      />

      <ConfirmModal
        show={isConfirmModalOpen}
        title="Conferma Annullamento"
        message="Sei sicuro di voler annullare tutte le modifiche non salvate?"
        onCancel={() => setIsConfirmModalOpen(false)}
        onConfirm={executeCancelChanges}
      />

      {/* Component Alert */}
      <Alert message={alertInfo.message} type={alertInfo.type} />
    </div>
  );
};

export default VarieGrid;