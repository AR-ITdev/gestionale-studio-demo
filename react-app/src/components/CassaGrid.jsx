import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getCassaMovements,
  getPayments,
  deleteCashMovement,
  getClienti,
} from '../services/api';
import ConfirmModal from './ConfirmModal';
import { compareCashMovements } from '../utils/cashMovementOrder';

// Global variables to persist filter states across component remounts
let globalSelectedTypes = [];
let globalStartDate = '';
let globalEndDate = '';
let globalDateSortOrder = 'desc';

/**
 * Normalizes error objects into user-friendly localized messages.
 */
const getFriendlyErrorMessage = (err, defaultMsg = "Errore durante l'operazione.") => {
  const message = err?.message || String(err || '');
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('network') || lowerMsg.includes('failed to fetch')) {
    return "Errore di connessione al server. Verifica la tua connessione e riprova.";
  }

  return message || defaultMsg;
};

/**
 * CassaGrid component renders a tabular view of cash movements and cash-based payments,
 * including filters, running balance calculations, totals, and pagination.
 */
export const CassaGrid = ({ year = new Date().getFullYear(), onRefresh, showAlert, onEditMovement }) => {
  const selectedYear = year;
  const [items, setItems] = useState([]);
  const [customersMap, setCustomersMap] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cashDataRequestRef = useRef(0);

  // State management for confirmation dialog modals
  const [confirmState, setConfirmState] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const closeConfirm = () => {
    setConfirmState({ show: false, title: '', message: '', onConfirm: null });
  };

  const [rowsPerPage, setRowsPerPage] = useState(500);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter and sorting states synchronized with global persistent variables
  const [selectedTypes, setSelectedTypes] = useState(globalSelectedTypes);
  const [startDate, setStartDate] = useState(globalStartDate);
  const [endDate, setEndDate] = useState(globalEndDate);
  const [dateSortOrder, setDateSortOrder] = useState(globalDateSortOrder);

  useEffect(() => { globalSelectedTypes = selectedTypes; }, [selectedTypes]);
  useEffect(() => { globalStartDate = startDate; }, [startDate]);
  useEffect(() => { globalEndDate = endDate; }, [endDate]);
  useEffect(() => { globalDateSortOrder = dateSortOrder; }, [dateSortOrder]);

  // Predefined filter options available for cash movement categories
  const availableTypes = [
    { label: 'Saldo Iniziale', value: 'SALDO INIZIALE' },
    { label: 'Incasso', value: 'INCASSO' },
    { label: 'Versamento', value: 'VERSAMENTO' },
    { label: 'Uscita', value: 'USCITA' },
    { label: 'Entrata', value: 'ENTRATA' }
  ];

  /**
   * Fetches cash movements, payment records, and customer directory data in parallel,
   * normalizes and merges them into a unified chronological array.
   */
  const fetchCashData = useCallback(async () => {
    const requestId = ++cashDataRequestRef.current;
    try {
      const results = await Promise.allSettled([
        getCassaMovements({ year: selectedYear }),
        getPayments({ year: selectedYear }),
        getClienti()
      ]);

      if (requestId !== cashDataRequestRef.current) return;

      const labels = ['movimenti di cassa', 'pagamenti'];
      const failures = results.slice(0, 2).flatMap((result, index) => {
        if (result.status === 'rejected') return [`${labels[index]}: ${getFriendlyErrorMessage(result.reason)}`];
        const records = Array.isArray(result.value) ? result.value : result.value?.data;
        return Array.isArray(records) ? [] : [`${labels[index]}: risposta dati non valida`];
      });
      if (failures.length > 0) {
        throw new Error(`Impossibile caricare tutti i dati della cassa. ${failures.join('; ')}`);
      }

      const [movementsResult, paymentsResult, customersRes] = results;
      const movementsRes = movementsResult.value;
      const paymentsRes = paymentsResult.value;
      const cashArray = Array.isArray(movementsRes) ? movementsRes : movementsRes.data;
      const paymentsArray = Array.isArray(paymentsRes) ? paymentsRes : paymentsRes.data;
      const custData = customersRes.status === 'fulfilled'
        ? (Array.isArray(customersRes.value) ? customersRes.value : customersRes.value?.data)
        : null;

      // Build customer lookup map by ID (both numeric and string keys)
      const map = new Map();
      if (Array.isArray(custData)) {
        custData.forEach(c => {
          map.set(c.id, c);
          map.set(String(c.id), c);
        });
      } else {
        console.warn('Impossibile caricare l’anagrafica clienti della cassa; verranno mostrati i nomi disponibili nei movimenti.');
      }
      setCustomersMap(map);

      // Normalize standard manual cash movements
      const normalizedMovements = cashArray.map(mov => ({
        ...mov,
        id: `mov-${mov.id}`,
        originalId: mov.id,
        date: mov.date || mov.movement_date,
        source: 'CASSA'
      }));

      // Filter and normalize cash-based payments to include them in the grid
      const cashPayments = paymentsArray
        .filter(pay => {
          const rawDate = pay.payment_date || pay.date || pay.created_at;
          if (rawDate && selectedYear !== 'ALL') {
            const payYear = new Date(rawDate).getFullYear();
            if (payYear !== Number(selectedYear)) return false;
          }
          const method = String(pay.payment_method || pay.method || '').trim().toUpperCase();
          return method === 'CONTANTI';
        })
        .map(pay => ({
          ...pay,
          id: `pay-${pay.id}`,
          originalId: pay.id,
          date: pay.payment_date || pay.date || pay.created_at,
          type: 'INCASSO',
          amount: Number(pay.amount || pay.total || pay.payment_amount || 0),
          notes: pay.notes || pay.description || '',
          source: 'PAYMENT',
          payer_customer_id: pay.payer_customer_id || pay.customer_id
        }));

      // Combine and sort chronologically for balance calculation
      const combined = [...normalizedMovements, ...cashPayments];
      combined.sort(compareCashMovements);

      if (requestId === cashDataRequestRef.current) {
        setItems(combined);
        setError(null);
      }
    } catch (err) {
      if (requestId === cashDataRequestRef.current) {
        setError(err.message || 'Errore nel caricamento dei dati di cassa e pagamenti');
        setItems([]);
        setCustomersMap(new Map());
      }
    }
  }, [selectedYear]);

  // Initial data loading effect on mount or when selected year changes
  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (isMounted) setLoading(true);
      await fetchCashData();
      if (isMounted) setLoading(false);
    };
    loadData();
    return () => { isMounted = false; };
  }, [fetchCashData]);

  // Handles switching filter checkboxes for movement types and resets pagination
  const handleTypeCheckboxChange = (typeVal) => {
    setSelectedTypes(prev => {
      const nextTypes = prev.includes(typeVal)
        ? prev.filter(t => t !== typeVal)
        : [...prev, typeVal];
      return nextTypes;
    });
    setCurrentPage(1);
  };

  // Filter items based on active type checkboxes and date range criteria
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const type = String(item.type || item.category || '').toLowerCase();
      const itemDate = item.date ? String(item.date).substring(0, 10) : '';

      const matchesType = selectedTypes.length === 0 || selectedTypes.some(t => type.includes(t.toLowerCase()));

      let matchesDateRange = true;
      if (startDate && itemDate < startDate) matchesDateRange = false;
      if (endDate && itemDate > endDate) matchesDateRange = false;

      return matchesType && matchesDateRange;
    });
  }, [items, selectedTypes, startDate, endDate]);

  // Compute running balance, total incomes, and total expenses sequentially
  const calculatedRows = useMemo(() => {
    const sortedForCalc = [...filteredItems].sort(compareCashMovements);

    const saldoInizialeItem = sortedForCalc.find(item => {
      const typeStr = String(item.type || item.category || '').toUpperCase().trim();
      return typeStr.includes('SALDO') && typeStr.includes('INIZIALE');
    });
    const saldoIniziale = saldoInizialeItem ? (parseFloat(saldoInizialeItem.amount) || 0) : 0;

    const initialAcc = {
      rows: [],
      totEntrate: 0,
      totUscite: 0,
      runningBalance: saldoIniziale
    };

    const finalAcc = sortedForCalc.reduce((acc, item) => {
      const typeStr = String(item.type || item.category || '').toUpperCase().trim();
      const amount = parseFloat(item.amount) || 0;

      const isSaldoIniziale = typeStr.includes('SALDO') && typeStr.includes('INIZIALE');
      const isUscita = typeStr.includes('USCITA') || typeStr.includes('VERSAMENTO') || typeStr.includes('OUT');
      const isEntrata = typeStr.includes('ENTRATA') || typeStr.includes('INCASSO') || typeStr.includes('IN') || (!isSaldoIniziale && !isUscita);

      let entrata = 0;
      let uscita = 0;
      let newBalance = acc.runningBalance;
      let newTotEntrate = acc.totEntrate;
      let newTotUscite = acc.totUscite;

      if (isSaldoIniziale) {
        newBalance = amount;
      } else if (isUscita) {
        uscita = amount;
        newTotUscite += uscita;
        newBalance -= uscita;
      } else if (isEntrata) {
        entrata = amount;
        newTotEntrate += entrata;
        newBalance += entrata;
      }

      const processedRow = {
        ...item,
        entrata: isSaldoIniziale ? 0 : entrata,
        uscita,
        saldoProgressivo: newBalance
      };

      return {
        rows: [...acc.rows, processedRow],
        totEntrate: newTotEntrate,
        totUscite: newTotUscite,
        runningBalance: newBalance
      };
    }, initialAcc);

    let calculatedRowsArray = finalAcc.rows;
    calculatedRowsArray.sort((a, b) => {
      return dateSortOrder === 'asc' ? compareCashMovements(a, b) : compareCashMovements(b, a);
    });

    const saldoFinale = saldoIniziale + finalAcc.totEntrate - finalAcc.totUscite;

    return {
      rows: calculatedRowsArray,
      saldoIniziale,
      totEntrate: finalAcc.totEntrate,
      totUscite: finalAcc.totUscite,
      saldoFinale
    };
  }, [filteredItems, dateSortOrder]);

  const totals = useMemo(() => ({
    saldoIniziale: calculatedRows.saldoIniziale,
    totEntrate: calculatedRows.totEntrate,
    totUscite: calculatedRows.totUscite,
    saldoFinale: calculatedRows.saldoFinale
  }), [calculatedRows]);

  const rows = calculatedRows.rows;

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(rows.length / rowsPerPage));
  }, [rows.length, rowsPerPage]);

  const safeCurrentPage = useMemo(() => {
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  // Slice rows for current pagination window
  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, safeCurrentPage, rowsPerPage]);

  const startItemIndex = rows.length > 0 ? (safeCurrentPage - 1) * rowsPerPage + 1 : 0;
  const endItemIndex = Math.min(safeCurrentPage * rowsPerPage, rows.length);

  // Handles deletion of manual cash entries with confirmation prompt
  const handleDelete = async item => {
    if (item.source === 'PAYMENT') {
      if (showAlert) showAlert("Questo incasso deriva dalla sezione Pagamenti ed è di sola consultazione.", "danger");
      return;
    }

    setConfirmState({
      show: true,
      title: "Conferma Eliminazione",
      message: "Sei sicuro di voler eliminare questo movimento di cassa?",
      onConfirm: async () => {
        closeConfirm();
        try {
          await deleteCashMovement(item.originalId);
          await fetchCashData();
          if (onRefresh) onRefresh();
          if (showAlert) showAlert("Movimento eliminato con successo.", "success");
        } catch (err) {
          const friendlyMsg = getFriendlyErrorMessage(err, "Errore durante la cancellazione del movimento.");
          if (showAlert) showAlert(friendlyMsg, "danger");
        }
      }
    });
  };

  // Handles editing action for editable manual movements
  const handleEditClick = item => {
    if (item.source === 'PAYMENT') {
      if (showAlert) showAlert("Gli incassi da pagamenti possono essere consultati ma non modificati direttamente da qui.", "danger");
      return;
    }

    if (onEditMovement) {
      onEditMovement(item);
    }
  };

  // Formats numbers into localized Euro currency representations
  const formatEuro = val => {
    const num = Number(val || 0);
    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `€ ${parts.join(',')}`;
  };

  // Returns matching UI badge styles depending on movement category type
  const getTypeBadgeClass = (typeStr) => {
    const t = String(typeStr || '').toUpperCase().trim();
    if (t.includes('INCASSO')) return 'bg-primary-subtle text-primary border-primary-subtle';
    if (t.includes('ENTRATA')) return 'bg-success-subtle text-success border-success-subtle';
    if (t.includes('USCITA')) return 'bg-danger-subtle text-danger border-danger-subtle';
    if (t.includes('VERSAMENTO')) return 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
    if (t.includes('SALDO')) return 'bg-secondary-subtle text-secondary border-secondary-subtle';
    return 'bg-light text-dark border-secondary-subtle';
  };

  if (loading) {
    return <div className="p-3 text-muted" style={{ fontSize: '13px' }}>Caricamento movimenti e contanti...</div>;
  }

  return (
    <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>

      <ConfirmModal
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {error && <div className="alert alert-danger rounded-0 p-2 mb-2" style={{ fontSize: '13px' }}>{error}</div>}

      <div className="card border shadow-sm rounded-0 bg-white grow d-flex flex-column overflow-hidden mb-0 h-100 min-h-0">

        {/* Filters Toolbar */}
        <div className="bg-light border-bottom p-2 px-3 d-flex flex-wrap justify-content-between align-items-center gap-3 shrink-0">
          <div className="d-flex align-items-center flex-wrap gap-3">
            <span className="text-uppercase text-muted fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>Filtra Tipologia:</span>
            <div className="d-flex align-items-center flex-wrap gap-3">
              {availableTypes.map(t => (
                <div key={t.value} className="form-check form-check-inline m-0">
                  <input
                    type="checkbox"
                    className="form-check-input rounded-0 shadow-none border-secondary-subtle"
                    id={`type-chk-${t.value}`}
                    checked={selectedTypes.includes(t.value)}
                    onChange={() => handleTypeCheckboxChange(t.value)}
                    style={{ cursor: 'pointer', width: '14px', height: '14px', marginTop: '1px' }}
                  />
                  <label className="form-check-label text-dark user-select-none ps-1" htmlFor={`type-chk-${t.value}`} style={{ fontSize: '12px', cursor: 'pointer' }}>
                    {t.label}
                  </label>
                </div>
              ))}
            </div>
            {selectedTypes.length > 0 && (
              <button
                onClick={() => { setSelectedTypes([]); setCurrentPage(1); }}
                className="btn btn-link btn-sm p-0 text-decoration-none text-secondary ms-1"
                style={{ fontSize: '11px' }}
                title="Resetta filtri tipologia"
              >
                [Reset]
              </button>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 border-start ps-3">
            <span className="text-uppercase text-muted fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>Periodo:</span>
            <div className="d-flex align-items-center gap-1">
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle bg-white"
                style={{ width: '120px', fontSize: '12px', height: '28px' }}
              />
              <span className="text-muted" style={{ fontSize: '11px' }}>—</span>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle bg-white"
                style={{ width: '120px', fontSize: '12px', height: '28px' }}
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); setCurrentPage(1); }}
                className="btn btn-sm btn-outline-secondary rounded-0 py-0 px-1 d-flex align-items-center justify-content-center bg-white"
                style={{ fontSize: '10px', height: '28px', width: '24px' }}
                title="Pulisci date"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Data Table View */}
        <div className="table-responsive m-0 grow h-100" style={{ overflowY: 'auto' }}>
          <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
            <thead className="table-light border-bottom text-uppercase" style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#f8f9fa', fontSize: '11px', letterSpacing: '0.3px' }}>
              <tr>
                <th
                  className="py-2 px-3 text-secondary border-end"
                  style={{ width: '130px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setDateSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title="Clicca per ordinare in modo crescente o decrescente"
                >
                  Data <span style={{ fontSize: '10px' }}>{dateSortOrder === 'asc' ? '▲' : '▼'}</span>
                </th>
                <th className="py-2 px-3 text-secondary border-end">Ragione Sociale / Note</th>
                <th className="py-2 px-3 text-secondary border-end" style={{ width: '150px' }}>Tipo Movimento</th>
                <th className="py-2 px-3 text-end text-success border-end" style={{ width: '120px' }}>Entrata (+)</th>
                <th className="py-2 px-3 text-end text-danger border-end" style={{ width: '120px' }}>Uscita (-)</th>
                <th className="py-2 px-3 text-end text-dark border-end bg-body-secondary fw-bold" style={{ width: '130px' }}>Saldo Cassa</th>
                <th className="py-2 px-3 text-center text-secondary" style={{ width: '80px' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-muted">Nessun movimento trovato per l'anno {selectedYear}.</td>
                </tr>
              ) : (
                paginatedRows.map(row => (
                  <tr key={row.id}>
                    <td className="py-2 px-3 border-end text-nowrap text-secondary">{row.date}</td>

                    <td className="py-2 px-3 border-end fw-medium">
                      {row.source === 'CASSA' ? (
                        <span className="text-secondary">{row.notes || row.description || '-'}</span>
                      ) : (
                        (() => {
                          const custId = row.payer_customer_id || row.customer_id;
                          const customer = customersMap.get(Number(custId)) || customersMap.get(String(custId));
                          const customerName = customer ? (customer.name || customer.ragione_sociale || `Cliente #${custId}`) : (row.customer_name || `Cliente #${custId || 'Sconosciuto'}`);
                          const notes = row.notes || row.description;

                          return (
                            <div>
                              <span className="text-primary fw-bold">{customerName} &nbsp;</span>
                              {notes && notes.trim() !== '' && (
                                <span className="text-muted fs-12">({notes})</span>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </td>

                    <td className="py-2 px-3 border-end text-center">
                      <span className={`badge border rounded-0 px-2 py-1 ${getTypeBadgeClass(row.type || row.category)}`} style={{ fontSize: '11px', fontWeight: '500' }}>
                        {row.type || row.category || 'MOVIMENTO'}
                      </span>
                    </td>

                    <td className={`py-2 px-3 text-end border-end fw-semibold ${row.entrata ? 'text-success' : 'text-muted'}`}>
                      {row.entrata ? formatEuro(row.entrata) : '-'}
                    </td>
                    <td className={`py-2 px-3 text-end border-end fw-semibold ${row.uscita ? 'text-danger' : 'text-muted'}`}>
                      {row.uscita ? formatEuro(row.uscita) : '-'}
                    </td>
                    <td className={`py-2 px-3 text-end border-end fw-bold bg-body-tertiary ${row.saldoProgressivo < 0 ? 'text-danger' : 'text-dark'}`}>
                      {formatEuro(row.saldoProgressivo)}
                    </td>
                    <td className="px-3 text-center fs-9">
                      {row.source === 'CASSA' ? (
                        <div className="d-flex justify-content-center gap-1">
                          <button onClick={() => handleEditClick(row)} className="btn btn-sm btn-light border rounded-0 shadow-none fs-10" title="Modifica">
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button onClick={() => handleDelete(row)} className="btn btn-sm btn-light border rounded-0 shadow-none fs-10" title="Elimina">
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                      ) : (<></>)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Summary Footer */}
        <div className="bg-secondary-subtle border-top border-dark p-2 px-3 d-flex flex-wrap justify-content-between align-items-center text-uppercase fw-bold text-dark shrink-0" style={{ fontSize: '12px', letterSpacing: '0.3px' }}>
          <div>TOTALI ANNO {selectedYear}:</div>
          <div className="d-flex align-items-center gap-4">
            <div>Entrate: <span className="text-success">{formatEuro(totals.totEntrate)}</span></div>
            <div>Uscite: <span className="text-danger">{formatEuro(totals.totUscite)}</span></div>
            <div>Saldo Finale: <span className={totals.saldoFinale < 0 ? 'text-danger' : 'text-dark'}>{formatEuro(totals.saldoFinale)}</span></div>
          </div>
        </div>

        {/* Pagination Controls Footer */}
        <div className="bg-light border-top p-2 px-3 d-flex flex-wrap justify-content-end align-items-center gap-3 shrink-0 small text-secondary" style={{ fontSize: '13px' }}>
          <div className="d-flex align-items-center gap-2">
            <span>Page Size:</span>
            <select
              className="form-select form-select-sm rounded-0 shadow-none border bg-white"
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              style={{ width: '75px', height: '28px', fontSize: '13px' }}
            >
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div className="px-2 fw-medium text-dark">
            {startItemIndex} to {endItemIndex} of {rows.length}
          </div>

          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-link p-0 text-secondary text-decoration-none shadow-none"
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              style={{ opacity: safeCurrentPage === 1 ? 0.3 : 1 }}
              title="Prima pagina"
            >
              &#124;&lt;
            </button>
            <button
              type="button"
              className="btn btn-sm btn-link p-0 text-secondary text-decoration-none shadow-none"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={safeCurrentPage === 1}
              style={{ opacity: safeCurrentPage === 1 ? 0.3 : 1 }}
              title="Pagina precedente"
            >
              &lt;
            </button>

            <div className="d-flex align-items-center gap-1 px-1">
              <span>Page</span>
              <input
                type="text"
                className="form-control form-control-sm text-center rounded-0 shadow-none border bg-white"
                value={safeCurrentPage}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    setCurrentPage(val);
                  }
                }}
                style={{ width: '40px', height: '28px', fontSize: '13px' }}
              />
              <span>of {totalPages || 1}</span>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-link p-0 text-secondary text-decoration-none shadow-none"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={safeCurrentPage >= totalPages}
              style={{ opacity: safeCurrentPage >= totalPages ? 0.3 : 1 }}
              title="Pagina successiva"
            >
              &gt;
            </button>
            <button
              type="button"
              className="btn btn-sm btn-link p-0 text-secondary text-decoration-none shadow-none"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage >= totalPages}
              style={{ opacity: safeCurrentPage >= totalPages ? 0.3 : 1 }}
              title="Ultima pagina"
            >
              &gt;&#124;
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

export default CassaGrid;