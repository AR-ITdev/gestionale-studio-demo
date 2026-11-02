import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactions } from '../hooks/useTransactions';
import { ConfirmModal } from './ConfirmModal';
import {
  updateTransaction,
  deleteTransaction,
  duplicateTransaction,
  createTransaction,
  getTransactions
} from '../services/api';

// Italian month names mapping for rendering and formatting labels
const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

// Display category labels dictionary
const CATEGORY_LABELS = {
  PAGHE: 'Paghe',
  CONTABILITA: 'Contabilità',
  REDDITI: 'Redditi',
  VARIE: 'Varie'
};

/**
 * Maps numeric status value to its corresponding friendly label.
 */
const getStatusLabel = (statusValue) => {
  const numVal = Number(statusValue);
  if (numVal === 1) return 'Convalidato';
  if (numVal === 0) return 'In Bozza';
  return `Stato ${statusValue}`;
};

/**
 * Parses error objects to return user-friendly messages for database or network failures.
 */
const getFriendlyErrorMessage = (err, defaultMsg = "Errore durante l'operazione.") => {
  const message = err?.message || String(err || '');
  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes('unique') ||
    lowerMsg.includes('constraint') ||
    lowerMsg.includes('already exists') ||
    lowerMsg.includes('duplicat') ||
    lowerMsg.includes('PRIMARY KEY')
  ) {
    return "Esiste già una testata per questo mese e anno in archivio. Impossibile creare duplicati per lo stesso periodo.";
  }

  if (lowerMsg.includes('network') || lowerMsg.includes('failed to fetch')) {
    return "Errore di connessione al server. Verifica la tua connessione e riprova.";
  }

  return message || defaultMsg;
};

/**
 * TransactionExplorer component manages financial transaction headers (testate) 
 * across different categories, offering filtering by year/status, grid/table views, 
 * context menus, and CRUD operations.
 */
export const TransactionExplorer = ({ category = 'PAGHE', onOpenTransaction, showAlert }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [rawTransactions, setRawTransactions] = useState([]);

  // Session storage keys for persistent filter states per category
  const storageYearKey = `explorer_year_${category}`;
  const storageStatusKey = `explorer_status_${category}`;
  const storageViewKey = `explorer_view_${category}`;

  // Initialize year filter state from session storage or default to 'all'
  const [yearFilter, setYearFilter] = useState(() => {
    const saved = sessionStorage.getItem(storageYearKey);
    return saved !== null ? saved : 'all';
  });

  // Initialize status filter state from session storage or default to 'all'
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = sessionStorage.getItem(storageStatusKey);
    return saved !== null ? saved : 'all';
  });

  // Initialize view mode state ('grid' or 'table') from session storage
  const [viewMode, setViewMode] = useState(() => {
    return sessionStorage.getItem(storageViewKey) || 'grid';
  });

  // Modal control states and form input values for year and month
  const [modalState, setModalState] = useState(null);
  const [formInputYear, setFormInputYear] = useState('');
  const [formInputMonth, setFormInputMonth] = useState('');

  // Ref to track mousedown on the backdrop to prevent false clicks during drag interactions
  const backdropMouseDownTarget = useRef(null);

  // Handle ESC key press to close active creation/rename modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && modalState && modalState.type !== 'delete') {
        setModalState(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalState]);

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e) => {
    if (
      backdropMouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      setModalState(null);
    }
    backdropMouseDownTarget.current = null;
  };

  // Fetch raw transaction metadata list from backend API
  const fetchRawData = useCallback(async () => {
    try {
      const data = await getTransactions(category);
      if (Array.isArray(data)) {
        setRawTransactions(data);
      }
    } catch (err) {
      console.error("Errore nel recupero dei metadati:", err);
    }
  }, [category]);

  useEffect(() => {
    let ignore = false;
    const loadRawData = async () => {
      try {
        const data = await getTransactions(category);
        if (!ignore && Array.isArray(data)) {
          setRawTransactions(data);
        }
      } catch (err) {
        console.error("Errore nel recupero dei metadati:", err);
      }
    };
    loadRawData();
    return () => {
      ignore = true;
    };
  }, [category]);

  // Extract unique available years sorted in descending order
  const allYears = useMemo(() => {
    const years = rawTransactions.map(item => Number(item.year));
    return [...new Set(years)].sort((a, b) => b - a);
  }, [rawTransactions]);

  // Validate effective year filter against available years list
  const effectiveYearFilter = useMemo(() => {
    if (yearFilter === 'all') return 'all';
    if (allYears.length > 0 && !allYears.includes(Number(yearFilter))) {
      return 'all';
    }
    return yearFilter;
  }, [yearFilter, allYears]);

  // Extract unique status codes available within the filtered year scope
  const allStatuses = useMemo(() => {
    const filteredByYear = effectiveYearFilter === 'all'
      ? rawTransactions
      : rawTransactions.filter(item => Number(item.year) === Number(effectiveYearFilter));

    const statuses = filteredByYear.map(item => Number(item.status));
    return [...new Set(statuses)].sort((a, b) => a - b);
  }, [rawTransactions, effectiveYearFilter]);

  // Validate effective status filter against available status list
  const effectiveStatusFilter = useMemo(() => {
    if (statusFilter === 'all') return 'all';
    if (allStatuses.length > 0 && !allStatuses.includes(Number(statusFilter))) {
      return 'all';
    }
    return statusFilter;
  }, [statusFilter, allStatuses]);

  // Construct transaction query options object for custom hook
  const transactionOptions = useMemo(() => ({
    category,
    year: effectiveYearFilter,
    status: effectiveStatusFilter,
    q: searchTerm
  }), [category, effectiveYearFilter, effectiveStatusFilter, searchTerm]);

  const {
    transactions = [],
    loading,
    refreshTransactions
  } = useTransactions(transactionOptions);

  const [contextMenu, setContextMenu] = useState(null);
  const categoryLabel = CATEGORY_LABELS[category] || category;

  // Close custom context menu on outside global clicks
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleYearChange = (val) => {
    setYearFilter(val);
    sessionStorage.setItem(storageYearKey, val);
  };

  const handleStatusChange = (val) => {
    setStatusFilter(val);
    sessionStorage.setItem(storageStatusKey, val);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    sessionStorage.setItem(storageViewKey, mode);
  };

  // Reset all search terms and filters to default state
  const handleResetFilters = () => {
    setSearchTerm('');
    handleStatusChange('all');
    if (allYears.length > 0) {
      handleYearChange(allYears[0].toString());
    } else {
      handleYearChange('all');
    }
  };

  // Open modal to create a new transaction header initialized with current year/month
  const openCreateModal = () => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    setFormInputYear(String(currentYear));
    setFormInputMonth(String(currentMonth));
    setModalState({ type: 'create' });
  };

  // Helper to reload transactions and raw data after mutations (creates, updates, deletes)
  const reloadDataAfterMutation = async (targetYear = null) => {
    if (targetYear) {
      handleYearChange(targetYear.toString());
    }
    await refreshTransactions();
    await fetchRawData();
  };

  // Execute creation of a new transaction header with validation checks
  const executeCreate = async () => {
    const year = parseInt(formInputYear, 10);
    const month = parseInt(formInputMonth, 10);

    if (isNaN(year) || year < 2000 || year > 2200) {
      if (showAlert) showAlert("Inserisci un anno valido.", "danger");
      return;
    }
    if (isNaN(month) || month < 1 || month > 12) {
      if (showAlert) showAlert("Inserisci un mese valido compreso tra 1 e 12.", "danger");
      return;
    }

    try {
      await createTransaction({ category, year, month, status: 0 });
      setModalState(null);
      await reloadDataAfterMutation(year);
      if (showAlert) showAlert(`Testata di ${categoryLabel} (${year}/${String(month).padStart(2, '0')}) creata con successo.`, "success");
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "Errore durante la creazione della testata sul database.");
      if (showAlert) showAlert(friendlyMsg, "danger");
    }
  };

  // Duplicate an existing transaction header for the next chronological month/year
  const handleDuplicate = async (transaction) => {
    setContextMenu(null);
    let nextMonth = transaction.month + 1;
    let nextYear = transaction.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    try {
      if (typeof duplicateTransaction === 'function') {
        await duplicateTransaction(transaction, nextYear, nextMonth);
      } else {
        await createTransaction({ category, year: nextYear, month: nextMonth, status: transaction.status || 0 });
      }
      await reloadDataAfterMutation(nextYear);
      if (showAlert) showAlert(`Testata duplicata con successo per il periodo ${nextYear}/${String(nextMonth).padStart(2, '0')}.`, "success");
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "Errore durante la duplicazione della testata.");
      if (showAlert) showAlert(friendlyMsg, "danger");
    }
  };

  const openRenameModal = (transaction) => {
    setContextMenu(null);
    setFormInputYear(String(transaction.year));
    setFormInputMonth(String(transaction.month));
    setModalState({ type: 'rename', transaction });
  };

  // Execute renaming/moving of a transaction header by duplicating and removing the old one
  const executeRename = async () => {
    const { transaction } = modalState;
    const newYear = parseInt(formInputYear, 10);
    const newMonth = parseInt(formInputMonth, 10);

    if (isNaN(newYear) || newYear < 2000 || newYear > 2200) {
      if (showAlert) showAlert("Anno non valido.", "danger");
      return;
    }
    if (isNaN(newMonth) || newMonth < 1 || newMonth > 12) {
      if (showAlert) showAlert("Mese non valido.", "danger");
      return;
    }

    if (Number(transaction.year) === newYear && Number(transaction.month) === newMonth) {
      setModalState(null);
      return;
    }

    try {
      if (typeof duplicateTransaction === 'function') {
        await duplicateTransaction(transaction, newYear, newMonth);
      } else {
        await createTransaction({ category, year: newYear, month: newMonth, status: transaction.status || 0 });
      }
      await deleteTransaction(category, transaction.year, transaction.month);
      setModalState(null);
      await reloadDataAfterMutation(newYear);
      if (showAlert) showAlert("Testata rinominata / spostata con successo.", "success");
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "Errore durante la rinomina della testata.");
      if (showAlert) showAlert(friendlyMsg, "danger");
    }
  };

  const filteredTransactions = transactions;

  // Handle right-click context menu event on transaction items
  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, transaction: item });
  };

  // Open transaction detail view or navigate to its specific route URL
  const handleOpen = (transaction) => {
    setContextMenu(null);
    if (onOpenTransaction) {
      onOpenTransaction(transaction);
    } else {
      const formattedMonth = String(transaction.month).padStart(2, '0');
      navigate(`/${category.toLowerCase()}/${transaction.year}-${formattedMonth}`);
    }
  };

  // Toggle transaction confirmation status between validated (1) and draft (0)
  const handleToggleStatus = async (transaction) => {
    setContextMenu(null);
    const newStatus = Number(transaction.status) === 1 ? 0 : 1;
    try {
      await updateTransaction(category, transaction.year, transaction.month, { status: newStatus });
      await reloadDataAfterMutation();
      if (showAlert) showAlert(`Stato aggiornato a "${getStatusLabel(newStatus)}" con successo.`, "success");
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "Errore durante l'aggiornamento dello stato.");
      if (showAlert) showAlert(friendlyMsg, "danger");
    }
  };

  const openDeleteModal = (item) => {
    setContextMenu(null);
    const nomeMese = MESI[item.month - 1] || item.month;
    setModalState({
      type: 'delete',
      transaction: item,
      message: `Sei sicuro di voler eliminare la testata di ${categoryLabel} di ${nomeMese} ${item.year}? Verranno eliminate anche tutte le voci collegate.`
    });
  };

  // Execute deletion of a transaction header and all its associated child rows
  const executeDelete = async () => {
    const item = modalState.transaction;
    try {
      await deleteTransaction(category, item.year, item.month);
      setModalState(null);
      await reloadDataAfterMutation();
      if (showAlert) showAlert("Testata eliminata con successo.", "success");
    } catch (err) {
      const friendlyMsg = getFriendlyErrorMessage(err, "Errore durante la cancellazione.", "danger");
      if (showAlert) showAlert(friendlyMsg, "danger");
    }
  };

  // Show loading spinner while initial data fetch is pending
  if (loading && (!transactions || transactions.length === 0)) {
    return (
      <div className="container-fluid px-3 py-4 text-dark fw-semibold">
        <i className="spinner-border spinner-border-sm me-2"></i> Caricamento archivio testate {categoryLabel.toLowerCase()}...
      </div>
    );
  }

  return (
    <div className="container-fluid px-3 py-2 d-flex flex-column user-select-none h-custom-calc position-relative">
      {/* Top action bar containing filters, search box, create button, and view mode toggles */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-3 pb-2 border-bottom shrink-0">
        <h4 className="m-0 text-dark fw-bold fs-5 d-flex align-items-center gap-2">
          <i className="bi bi-folder2-open text-dark"></i> Archivio {categoryLabel}
        </h4>

        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Year filter dropdown selection */}
          <select
            className="form-select form-select-sm rounded-0 shadow-none text-dark border w-year-select fs-13"
            value={effectiveYearFilter}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            <option value="all">Tutti gli anni</option>
            {allYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          {/* Status filter dropdown selection */}
          <select
            className="form-select form-select-sm rounded-0 shadow-none text-dark border w-status-select fs-13"
            value={effectiveStatusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="all">Tutti gli stati</option>
            {allStatuses.map((st) => (
              <option key={st} value={st}>
                {getStatusLabel(st)}
              </option>
            ))}
          </select>

          {/* Search filter input field */}
          <div className="position-relative w-search-box">
            <input
              type="text"
              placeholder={`Cerca...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control form-control-sm rounded-0 ps-4 pe-4 shadow-none text-dark border"
            />
            <i className="bi bi-search position-absolute text-dark start-0 top-50 translate-middle-y ms-2 fs-12"></i>
          </div>

          {/* Reset filters button */}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary rounded-0 text-dark border d-flex align-items-center justify-content-center w-reset-btn"
            onClick={handleResetFilters}
            title="Ripristina filtri"
          >
            <i className="bi bi-arrow-counterclockwise fs-6"></i>
          </button>
          <div className="vr mx-1"></div>
          {/* Create new transaction header button */}
          <button
            type="button"
            className="btn btn-sm btn-dark rounded-0 d-flex align-items-center gap-1 px-2"
            onClick={openCreateModal}
          >
            <i className="bi bi-plus-lg"></i> <span className="d-none d-md-inline">Nuovo</span>
          </button>
          <div className="vr mx-1"></div>

          {/* View mode toggle button group (Grid vs Table) */}
          <div className="btn-group btn-group-sm rounded-0" role="group">
            <button
              type="button"
              className={`btn rounded-0 ${viewMode === 'grid' ? 'btn-dark text-white' : 'btn-outline-secondary text-dark border'}`}
              onClick={() => handleViewModeChange('grid')}
            >
              <i className="bi bi-grid"></i>
            </button>
            <button
              type="button"
              className={`btn rounded-0 ${viewMode === 'table' ? 'btn-dark text-white' : 'btn-outline-secondary text-dark border'}`}
              onClick={() => handleViewModeChange('table')}
            >
              <i className="bi bi-list-ul"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Main content viewport container displaying grid or table views */}
      <div className="grow min-h-0 ag-theme-quartz-2 overflow-auto scrollbar-thin">
        {filteredTransactions.length === 0 && (
          <div className="text-center py-5 text-dark">
            <i className="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
            <p className="mb-3">Nessuna testata trovata nel database.</p>
          </div>
        )}

        {/* Grid view layout mode */}
        {viewMode === 'grid' && filteredTransactions.length > 0 && (
          <div className="d-flex flex-wrap gap-3">
            {filteredTransactions.map((item) => {
              const monthFormatted = String(item.month).padStart(2, '0');
              const fileName = `${categoryLabel}_${item.year}_${monthFormatted}`;
              const isConvalidato = Number(item.status) === 1;

              return (
                <div
                  key={`${category}-${item.year}-${item.month}`}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  onDoubleClick={() => handleOpen(item)}
                  className="card rounded-0 p-2 text-center bg-white shadow-sm position-relative border grid-card-item cursor-pointer"
                >
                  <div className={`position-absolute top-0 end-0 m-1 rounded-0 d-flex align-items-center justify-content-center shadow-sm grid-badge ${isConvalidato ? 'bg-success text-white' : 'bg-warning text-dark'}`}>
                    {isConvalidato ? <i className="bi bi-check fw-bold fs-6"></i> : <i className="bi bi-pencil fs-7"></i>}
                  </div>
                  <div className="py-2">
                    <i className="bi bi-file-earmark-text text-secondary file-icon-lg"></i>
                  </div>
                  <div className="mt-1 fs-7 fw-bold text-dark text-break">
                    {item.year}-{monthFormatted}
                  </div>
                  <div className="text-secondary text-break mt-1 fs-10 lh-sm">
                    {fileName}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table view layout mode */}
        {viewMode === 'table' && filteredTransactions.length > 0 && (
          <div className="table-responsive bg-white shadow-sm border">
            <table className="table table-hover table-sm align-middle mb-0 text-dark">
              <thead className="table-light border-bottom">
                <tr>
                  <th className="py-2 px-3 fw-bold">Riferimento DB</th>
                  <th className="py-2 px-3 fw-bold">Anno</th>
                  <th className="py-2 px-3 fw-bold">Mese</th>
                  <th className="py-2 px-3 fw-bold text-center w-custom-state">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((item) => {
                  const nomeMese = MESI[item.month - 1] || item.month;
                  const monthFormatted = String(item.month).padStart(2, '0');
                  const fileName = `${categoryLabel}_${item.year}_${monthFormatted}`;
                  const isConvalidato = Number(item.status) === 1;

                  return (
                    <tr
                      key={`${category}-${item.year}-${item.month}`}
                      onContextMenu={(e) => handleContextMenu(e, item)}
                      onDoubleClick={() => handleOpen(item)}
                      className="cursor-pointer"
                    >
                      <td className="py-2 px-3 fw-semibold">
                        <i className="bi bi-file-earmark-text text-secondary me-2"></i>
                        {fileName}
                      </td>
                      <td className="py-2 px-3">{item.year}</td>
                      <td className="py-2 px-3">{nomeMese}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`badge rounded-0 fs-11 px-2 py-1 ${isConvalidato ? 'bg-success text-white' : 'bg-warning text-dark'}`}>
                          {isConvalidato ? 'Convalidato' : 'Bozza'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating context menu popup activated on right-click */}
      {contextMenu && (
        <div
          className="dropdown-menu show rounded-0 shadow-lg py-1 bg-white border position-fixed z-1050 w-context-menu fs-13"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button disabled={!contextMenu.transaction} onClick={() => handleOpen(contextMenu.transaction)} className="dropdown-item d-flex align-items-center gap-2 py-2 text-dark fw-semibold">
            <i className="bi bi-folder2-open text-dark"></i> <strong>Apri Dettaglio</strong>
          </button>
          <button disabled={!contextMenu.transaction} onClick={() => handleToggleStatus(contextMenu.transaction)} className="dropdown-item d-flex align-items-center gap-2 py-2 text-dark fw-semibold">
            {Number(contextMenu.transaction?.status) === 1 ? <><i className="bi bi-pencil-square text-dark"></i> Riporta in Bozza</> : <><i className="bi bi-check-circle text-dark"></i> Convalida</>}
          </button>
          <button disabled={!contextMenu.transaction} onClick={() => handleDuplicate(contextMenu.transaction)} className="dropdown-item d-flex align-items-center gap-2 py-2 text-dark fw-semibold">
            <i className="bi bi-files text-dark"></i> Duplica...
          </button>
          <button disabled={!contextMenu.transaction} onClick={() => openRenameModal(contextMenu.transaction)} className="dropdown-item d-flex align-items-center gap-2 py-2 text-dark fw-semibold">
            <i className="bi bi-pencil text-dark"></i> Rinomina...
          </button>
          <div className="dropdown-divider my-1 opacity-25"></div>
          <button disabled={!contextMenu.transaction} onClick={() => openDeleteModal(contextMenu.transaction)} className="dropdown-item d-flex align-items-center gap-2 py-2 text-danger fw-semibold">
            <i className="bi bi-trash"></i> Elimina
          </button>
        </div>
      )}

      {/* Modal dialog for creating or renaming transaction headers */}
      {modalState && modalState.type !== 'delete' && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onMouseDown={handleBackdropMouseDown}
          onMouseUp={handleBackdropMouseUp}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-0 border shadow">

              {/* Avvolgiamo tutto in un tag form per gestire l'Invio nativamente */}
              <form onSubmit={(e) => {
                e.preventDefault();
                if (modalState.type === 'create') {
                  executeCreate();
                } else if (modalState.type === 'rename') {
                  executeRename();
                }
              }}>
                <div className="modal-header py-2 bg-light border-bottom">
                  <h6 className="modal-title fw-bold text-dark">
                    {modalState.type === 'create' && 'Crea Nuovo Documento'}
                    {modalState.type === 'rename' && 'Rinomina / Sposta Documento'}
                  </h6>
                  <button type="button" className="btn-close shadow-none" onClick={() => setModalState(null)}></button>
                </div>

                <div className="modal-body bg-white py-3">
                  <div className="d-flex flex-column gap-3">
                    <div>
                      <label className="form-label text-dark small fw-bold mb-1">Anno:</label>
                      <input
                        type="number"
                        className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-dark"
                        value={formInputYear}
                        onChange={(e) => setFormInputYear(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="form-label text-dark small fw-bold mb-1">Mese (1 - 12):</label>
                      <input
                        type="number"
                        className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-dark"
                        value={formInputMonth}
                        onChange={(e) => setFormInputMonth(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer py-2 bg-light border-top">
                  {/* Il pulsante Annulla mantiene type="button" per non intercettare l'Invio */}
                  <button type="button" className="btn btn-sm btn-secondary rounded-0 px-3" onClick={() => setModalState(null)}>
                    Annulla
                  </button>

                  {modalState.type === 'create' && (
                    <button type="submit" className="btn btn-sm btn-dark rounded-0 px-3 fw-bold">
                      Crea
                    </button>
                  )}

                  {modalState.type === 'rename' && (
                    <button type="submit" className="btn btn-sm btn-dark rounded-0 px-3 fw-bold">
                      Salva
                    </button>
                  )}
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal for delete actions */}
      <ConfirmModal
        show={modalState?.type === 'delete'}
        title="Conferma Eliminazione"
        message={modalState?.message}
        onConfirm={executeDelete}
        onCancel={() => setModalState(null)}
      />
    </div>
  );
};

export default TransactionExplorer;