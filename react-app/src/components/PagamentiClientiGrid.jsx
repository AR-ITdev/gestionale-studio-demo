import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getPayments,
  deletePayment,
  getClienti,
} from '../services/api';
import ConfirmModal from './ConfirmModal'; // <-- Importa il componente ConfirmModal

// Module-level variables to persist filter states across component unmounts/remounts.
let globalSelectedMethods = [];
let globalDateFrom = '';
let globalDateTo = '';
let globalDateSortOrder = 'desc';

/**
 * PagamentiClientiGrid component displays, filters, and manages customer payments data,
 * featuring pagination, sorting, method filters, and date range restrictions.
 */
export const PagamentiClientiGrid = ({
  initialCustomerName,
  initialYear = new Date().getFullYear(),
  onRefresh,
  showAlert,
  onEditPayment
}) => {
  const selectedYear = initialYear;
  const [payments, setPayments] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  const alertRef = useRef(showAlert);
  useEffect(() => { alertRef.current = showAlert; }, [showAlert]);
  const [error, setError] = useState(null);

  // State for controlling the deletion confirmation modal
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Pagination states
  const [rowsPerPage, setRowsPerPage] = useState(500);
  const [currentPage, setCurrentPage] = useState(1);

  // Initialize local states with global session values
  const [selectedMethods, setSelectedMethods] = useState(globalSelectedMethods);
  const [dateFrom, setDateFrom] = useState(globalDateFrom);
  const [dateTo, setDateTo] = useState(globalDateTo);
  const [dateSortOrder, setDateSortOrder] = useState(globalDateSortOrder);

  // Synchronize local states with global module variables on update
  useEffect(() => { globalSelectedMethods = selectedMethods; }, [selectedMethods]);
  useEffect(() => { globalDateFrom = dateFrom; }, [dateFrom]);
  useEffect(() => { globalDateTo = dateTo; }, [dateTo]);
  useEffect(() => { globalDateSortOrder = dateSortOrder; }, [dateSortOrder]);

  const decodedCustomerFilter = useMemo(() => {
    return String(initialCustomerName || '').trim();
  }, [initialCustomerName]);

  const getCustomerDisplayName = useCallback((customer) => {
    if (!customer) return '';
    return customer.name || customer.ragione_sociale || customer.customer_name || customer.subject || '';
  }, []);

  const getCustomerId = useCallback((customer) => {
    if (!customer) return null;
    return customer.id ?? customer.customer_id ?? customer.payer_customer_id ?? null;
  }, []);

  const isAllFilter = useMemo(() => decodedCustomerFilter.toUpperCase() === 'ALL', [decodedCustomerFilter]);
  const isParentFilter = useMemo(() => decodedCustomerFilter.toUpperCase().startsWith('PARENT:'), [decodedCustomerFilter]);
  const parentCodeValue = useMemo(() => {
    if (!isParentFilter) return '';
    return decodedCustomerFilter.replace(/^PARENT:/i, '').trim().toLowerCase();
  }, [isParentFilter, decodedCustomerFilter]);

  const selectedCustomerFromPath = useMemo(() => {
    if (!decodedCustomerFilter || isAllFilter || isParentFilter || !allCustomers.length) return null;
    const query = decodedCustomerFilter.toLowerCase();
    return allCustomers.find((customer) => {
      const name = getCustomerDisplayName(customer).toLowerCase().trim();
      const code = String(customer.customer_code || customer.code || customer.codice || '').toLowerCase().trim();
      const id = String(getCustomerId(customer) ?? '').toLowerCase().trim();
      return name === query || code === query || id === query;
    }) || null;
  }, [allCustomers, decodedCustomerFilter, isAllFilter, isParentFilter, getCustomerDisplayName, getCustomerId]);

  // Fetch payments and customers data from API endpoints
  const fetchData = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const [payData, custData] = await Promise.all([
        getPayments({ year: selectedYear }),
        getClienti()
      ]);
      if (requestId !== requestIdRef.current) return false;

      const payArray = Array.isArray(payData) ? payData : payData?.data || [];
      const custArray = Array.isArray(custData) ? custData : custData?.data || [];

      const filtered = payArray.filter((pay) => {
        if (String(selectedYear).toUpperCase() === 'ALL') return true;
        const rawDate = pay.date || pay.payment_date || pay.created_at;
        if (!rawDate) return true;
        return String(rawDate).slice(0, 4) === String(selectedYear);
      });

      setPayments(filtered);
      setAllCustomers(custArray);
      return true;
    } catch (err) {
      if (requestId !== requestIdRef.current) return false;
      const errMsg = err.message || 'Errore nel caricamento dei dati';
      setError(errMsg);
      if (alertRef.current) alertRef.current(errMsg, 'danger');
      return false;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchData(false);
    return () => { requestIdRef.current += 1; };
  }, [fetchData]);

  const getCustomerName = useCallback(
    (pay) => pay.customer_name || pay.name || pay.ragione_sociale || pay.subject || 'Cliente non specificato',
    []
  );

  const getCustomerCode = useCallback((pay) => pay.customer_code || pay.code || '', []);
  const getParentCode = useCallback((pay) => pay.parent_code || pay.codice_padre || '', []);

  const handleMethodCheckboxChange = (methodVal) => {
    setSelectedMethods(prev => {
      const updated = prev.includes(methodVal)
        ? prev.filter(m => m !== methodVal)
        : [...prev, methodVal];
      return updated;
    });
    setCurrentPage(1);
  };

  // Filter and sort payments based on customer, payment method, date range, and sorting rules
  const filteredPayments = useMemo(() => {
    const matchingIds = new Set();
    if (isParentFilter) {
      allCustomers.forEach(c => {
        const cId = getCustomerId(c);
        const cParent = String(c.parent_code || c.codice_padre || '').trim().toLowerCase();
        const cCode = String(c.customer_code || c.code || '').trim().toLowerCase();
        if ((cParent === parentCodeValue || cCode === parentCodeValue) && cId) matchingIds.add(String(cId));
      });
    }
    const filtered = payments.filter((pay) => {
      const payCustId = pay.payer_customer_id || pay.customer_id;
      const name = getCustomerName(pay).toLowerCase().trim();
      const code = getCustomerCode(pay).toLowerCase().trim();
      const parentCode = getParentCode(pay).toLowerCase().trim();

      let matchesCustomer = true;

      if (decodedCustomerFilter) {
        if (isAllFilter) {
          matchesCustomer = true;
        } else if (isParentFilter) {
          const matchesId = payCustId && matchingIds.has(String(payCustId));
          const matchesParentCode = parentCode === parentCodeValue || code === parentCodeValue;
          matchesCustomer = matchesId || matchesParentCode;
        } else if (selectedCustomerFromPath) {
          const selectedId = String(getCustomerId(selectedCustomerFromPath));
          matchesCustomer = String(payCustId) === selectedId;
        } else {
          const query = decodedCustomerFilter.toLowerCase().trim();
          matchesCustomer = name === query || code === query || parentCode === query;
        }
      }

      const method = (pay.payment_method || pay.method || '').toLowerCase();
      const matchesMethod = selectedMethods.length === 0 || selectedMethods.some(m => method.includes(m.toLowerCase()));

      const payDate = String(pay.date || pay.payment_date || pay.created_at || '').slice(0, 10);
      let matchesDateRange = !(dateFrom || dateTo) || Boolean(payDate);

      if (payDate) {
        if (dateFrom && payDate < dateFrom) matchesDateRange = false;
        if (dateTo && payDate > dateTo) matchesDateRange = false;
      }

      return matchesCustomer && matchesMethod && matchesDateRange;
    });

    filtered.sort((a, b) => {
      const dateA = new Date(a.date || a.payment_date || a.created_at || 0);
      const dateB = new Date(b.date || b.payment_date || b.created_at || 0);
      return dateSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  }, [
    payments,
    decodedCustomerFilter,
    isAllFilter,
    isParentFilter,
    parentCodeValue,
    selectedCustomerFromPath,
    selectedMethods,
    dateFrom,
    dateTo,
    allCustomers,
    getCustomerId,
    getCustomerName,
    getCustomerCode,
    getParentCode,
    dateSortOrder
  ]);

  // Safe pagination calculations
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredPayments.length / rowsPerPage));
  }, [filteredPayments.length, rowsPerPage]);

  const safeCurrentPage = useMemo(() => {
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  const paginatedPayments = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage;
    return filteredPayments.slice(start, start + rowsPerPage);
  }, [filteredPayments, safeCurrentPage, rowsPerPage]);

  const startItemIndex = filteredPayments.length > 0 ? (safeCurrentPage - 1) * rowsPerPage + 1 : 0;
  const endItemIndex = Math.min(safeCurrentPage * rowsPerPage, filteredPayments.length);

  const totals = useMemo(() => {
    return filteredPayments.reduce(
      (acc, curr) => {
        acc.totalAmount += Number(curr.amount) || 0;
        return acc;
      },
      { totalAmount: 0 }
    );
  }, [filteredPayments]);

  // Open confirmation modal for deleting a specific payment record
  const handleConfirmDeleteClick = (pay) => {
    setPaymentToDelete(pay);
    setIsConfirmModalOpen(true);
  };

  // Execute payment deletion via API call
  const handleConfirmDelete = async () => {
    if (!paymentToDelete) return;
    try {
      await deletePayment(paymentToDelete.id);
      const refreshed = await fetchData(true);
      if (!refreshed) return;
      if (onRefresh) onRefresh();
      if (showAlert) showAlert('Pagamento eliminato con successo', 'success');
    } catch (err) {
      const errMsg = 'Errore durante la cancellazione: ' + (err.message || err);
      if (showAlert) showAlert(errMsg, 'danger');
      else alert(errMsg);
    } finally {
      setIsConfirmModalOpen(false);
      setPaymentToDelete(null);
    }
  };

  const handleOpenEdit = (pay) => {
    if (onEditPayment) {
      onEditPayment(pay);
    }
  };

  const formatEuro = val => {
    const num = Number(val || 0);
    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `€ ${parts.join(',')}`;
  };

  const getMethodBadgeClass = (methodStr) => {
    const m = String(methodStr || '').toUpperCase().trim();
    if (m.includes('CONTANTI')) return 'bg-primary-subtle text-primary border-primary-subtle';
    if (m.includes('SCONTO')) return 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
    if (m.includes('ELETTRONICO') || m.includes('BONIFICO') || m.includes('POS') || m.includes('CARTA')) return 'bg-success-subtle text-success border-success-subtle';
    return 'bg-light text-dark border-secondary-subtle';
  };

  if (loading) {
    return <div className="p-3 text-muted" style={{ fontSize: '13px' }}>Caricamento pagamenti in corso...</div>;
  }

  const availableMethods = [
    { label: 'Contanti', value: 'CONTANTI' },
    { label: 'Elettronico', value: 'ELETTRONICO' },
    { label: 'Sconto', value: 'SCONTO' }
  ];

  return (
    <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      {error && <div className="alert alert-danger rounded-0 p-2 mb-2" style={{ fontSize: '13px' }}>{error}</div>}

        <div className="card border shadow-sm rounded-0 bg-white grow d-flex flex-column overflow-hidden mb-0 h-100 min-h-0">
          
          <div className="bg-light border-bottom p-2 px-3 d-flex flex-wrap justify-content-between align-items-center gap-3 shrink-0">
            <div className="d-flex align-items-center flex-wrap gap-3">
              <span className="text-uppercase text-muted fw-bold" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>Filtra Metodo:</span>
              <div className="d-flex align-items-center flex-wrap gap-3">
                {availableMethods.map(m => (
                  <div key={m.value} className="form-check form-check-inline m-0">
                    <input
                      type="checkbox"
                      className="form-check-input rounded-0 shadow-none border-secondary-subtle"
                      id={`method-chk-${m.value}`}
                      checked={selectedMethods.includes(m.value)}
                      onChange={() => handleMethodCheckboxChange(m.value)}
                      style={{ cursor: 'pointer', width: '14px', height: '14px', marginTop: '1px' }}
                    />
                    <label className="form-check-label text-dark user-select-none ps-1" htmlFor={`method-chk-${m.value}`} style={{ fontSize: '12px', cursor: 'pointer' }}>
                      {m.label}
                    </label>
                  </div>
                ))}
              </div>
              {selectedMethods.length > 0 && (
                <button
                  onClick={() => { setSelectedMethods([]); setCurrentPage(1); }}
                  className="btn btn-link btn-sm p-0 text-decoration-none text-secondary ms-1"
                  style={{ fontSize: '11px' }}
                  title="Resetta filtri metodo"
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
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle bg-white"
                  style={{ width: '120px', fontSize: '12px', height: '28px' }}
                />
                <span className="text-muted" style={{ fontSize: '11px' }}>—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle bg-white"
                  style={{ width: '120px', fontSize: '12px', height: '28px' }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
                  className="btn btn-sm btn-outline-secondary rounded-0 py-0 px-1 d-flex align-items-center justify-content-center bg-white"
                  style={{ fontSize: '10px', height: '28px', width: '24px' }}
                  title="Pulisci date"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="table-responsive m-0 grow h-100" style={{ overflowY: 'auto' }}>
            {decodedCustomerFilter && !isAllFilter && filteredPayments.length === 0 ? (
              <div className="card border border-warning shadow-sm rounded-0 bg-white p-4 text-center my-2 grow d-flex flex-column justify-content-center align-items-center">
                <div className="text-warning display-6 mb-2">⚠️</div>
                <h5 className="fw-bold text-dark" style={{ fontSize: '16px' }}>
                  Nessun pagamento trovato per {isParentFilter ? `il gruppo padre "${parentCodeValue.toUpperCase()}"` : `"${selectedCustomerFromPath ? getCustomerDisplayName(selectedCustomerFromPath) : decodedCustomerFilter}"`}
                </h5>
                <p className="text-secondary mb-0" style={{ fontSize: '13px' }}>
                  Il cliente o gruppo selezionato non ha registrato pagamenti con i filtri correnti.
                </p>
              </div>
            ) : (
            <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
              <thead className="table-light border-bottom text-uppercase" style={{ position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#f8f9fa', fontSize: '11px', letterSpacing: '0.3px' }}>
                <tr>
                  <th 
                    className="py-2 px-3 text-secondary border-end" 
                    style={{ width: '130px', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setDateSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    title="Clicca per invertire l'ordinamento"
                  >
                    Data <span style={{ fontSize: '10px' }}>{dateSortOrder === 'asc' ? '▲' : '▼'}</span>
                  </th>
                  <th className="py-2 px-3 text-secondary border-end">Cliente / Ragione Sociale / Codice</th>
                  <th className="py-2 px-3 text-secondary border-end">Note / Descrizione</th>
                  <th className="py-2 px-3 text-secondary border-end text-center" style={{ width: '150px' }}>Metodo</th>
                  <th className="py-2 px-3 text-end text-success border-end" style={{ width: '120px' }}>Importo</th>
                  <th className="py-2 px-3 text-center text-secondary" style={{ width: '80px' }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayments.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-4 text-muted">Nessun pagamento trovato per i filtri selezionati.</td>
                  </tr>
                ) : (
                  paginatedPayments.map((pay, idx) => {
                    const customerName = getCustomerName(pay);
                    const customerCode = getCustomerCode(pay);
                    const parentCode = getParentCode(pay);
                    const payDate = pay.date || pay.payment_date || pay.created_at || '';

                    return (
                      <tr key={pay.id || idx}>
                        <td className="py-2 px-3 border-end text-nowrap text-secondary">{payDate || '-'}</td>
                        <td className="py-2 px-3 border-end fw-medium">
                          <span className="text-dark fw-bold">{customerName}</span>
                          <div className="d-flex gap-2 text-muted">
                            {customerCode && <span>Codice: <span className="text-secondary">{customerCode}</span></span>}
                            {parentCode && <span>Padre: <span className="text-secondary">{parentCode}</span></span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 border-end text-secondary" style={{ width: '25%' }}>{pay.notes || pay.description || '-'}</td>
                        <td className="py-2 px-3 border-end text-center">
                          <span className={`badge border rounded-0 px-2 py-1 ${getMethodBadgeClass(pay.payment_method || pay.method)}`} style={{ fontSize: '11px', fontWeight: '500' }}>
                            {pay.payment_method || pay.method || 'ELETTRONICO'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-end border-end fw-bold text-success">
                          {formatEuro(pay.amount)}
                        </td>
                        <td className="px-3 text-center">
                          <div className="d-flex justify-content-center gap-1">
                            <button onClick={() => handleOpenEdit(pay)} className="btn btn-sm btn-light border rounded-0 shadow-none" title="Modifica" style={{ fontSize: '11px', padding: '2px 6px' }}>
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button onClick={() => handleConfirmDeleteClick(pay)} className="btn btn-sm btn-light border rounded-0 shadow-none" title="Elimina" style={{ fontSize: '11px', padding: '2px 6px' }}>
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            )}
          </div>

          <div className="bg-secondary-subtle border-top border-dark p-2 px-3 d-flex justify-content-between align-items-center text-uppercase fw-bold text-dark shrink-0" style={{ fontSize: '12px', letterSpacing: '0.3px' }}>
            <div>TOTALE PAGAMENTI FILTRATI:</div>
            <div className="text-success">{formatEuro(totals.totalAmount)}</div>
          </div>

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
              {startItemIndex} to {endItemIndex} of {filteredPayments.length}
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

      {/* Confirmation modal for payment deletion */}
      <ConfirmModal
        show={isConfirmModalOpen}
        title="Conferma eliminazione"
        message="Sei sicuro di voler eliminare questo pagamento? L'operazione non è reversibile."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setIsConfirmModalOpen(false);
          setPaymentToDelete(null);
        }}
      />
    </div>
  );
};

export default PagamentiClientiGrid;