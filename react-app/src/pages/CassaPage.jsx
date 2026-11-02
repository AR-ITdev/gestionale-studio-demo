import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CassaGrid from '../components/CassaGrid';
import PagamentiClientiGrid from '../components/PagamentiClientiGrid';
import PagamentiFormModal from '../components/PagamentiFormModal';
import GroupSearchInput from '../components/GroupSearchInput';
import { BackButton } from '../components/BackButton';
import Alert from '../components/Alert';
import ConfirmModal from '../components/ConfirmModal';
import { useTrailingRouteParam } from '../hooks/useTrailingRouteParam';
import { compareCashMovements } from '../utils/cashMovementOrder';
import { savePayments, createCashMovement, updatePayment, updateCashMovement, getCassaMovements, getPayments, getClienti } from '../services/api';

const getLocalDateInputValue = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getLocalDateInputValue();
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * CassaPage component manages cash movements, client payments, year-end balance carry-overs,
 * and data filtering by year and customer.
 */
export const CassaPage = () => {
  // Extract route parameters for persistent navigation states
  const { year: urlYear, view: urlView } = useParams();
  const urlCustomerName = useTrailingRouteParam('customerName');
  const navigate = useNavigate();
  const location = useLocation();

  // Define temporal boundaries and initial states
  const currentYear = new Date().getFullYear();
  const initialYear = urlYear && urlYear !== 'ALL' ? Number(urlYear) : currentYear;

  // Determine initial view based on route parameters or pathname
  const initialView = urlView === 'movimentazione'
    ? 'CASSA'
    : (urlView === 'pagamenti' || location.pathname.includes('/pagamenti'))
      ? 'TRANSAZIONI'
      : null;

  // Local state for temporary year and filter values before navigation submission
  const [cassaTempYear, setCassaTempYear] = useState(initialYear);
  const [pagamentiTempYear, setPagamentiTempYear] = useState(initialYear);
  const [pagamentiTempFilterValue, setPagamentiTempFilterValue] = useState('ALL');

  const [navTempYear, setNavTempYear] = useState(initialYear);
  const [navTempFilterValue, setNavTempFilterValue] = useState('');

  // Active filters and views applied to data grids
  const [year, setYear] = useState(initialYear);
  const [selectedFilterValue, setSelectedFilterValue] = useState('');
  const [activeView, setActiveView] = useState(initialView);

  // Entities and modal management states
  const [allCustomers, setAllCustomers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFormSaving, setIsFormSaving] = useState(false);
  const formSavingRef = useRef(false);
  const [modalType, setModalType] = useState('CASH');
  const [editingItem, setEditingItem] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Available years collected dynamically from records
  const [availableCashYears, setAvailableCashYears] = useState([currentYear]);
  const [availablePaymentYears, setAvailablePaymentYears] = useState([currentYear]);

  // Centralized alert and confirmation modal states
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success' });
  const [confirmState, setConfirmState] = useState({ show: false, title: '', message: '', onConfirm: null });

  // Ref to track mouse down target on custom backdrop clicks
  const modalMouseDownTarget = useRef(null);

  /**
   * Triggers a temporary alert banner message.
   * @param {string} message - Text to display
   * @param {string} type - Alert variant (e.g., 'success', 'danger')
   */
  const showAlert = useCallback((message, type = 'success') => {
    setAlertInfo({ message: '', type: 'success' });
    setTimeout(() => {
      setAlertInfo({ message, type });
    }, 50);
  }, []);

  // Closes the confirmation dialog modal
  const closeConfirm = () => setConfirmState({ show: false, title: '', message: '', onConfirm: null });

  // Fetch initial cash movements, payments, and customers on component mount
  useEffect(() => {
    const fetchDataInit = async () => {
      try {
        const [cashRes, payRes, custRes] = await Promise.allSettled([
          getCassaMovements(),
          getPayments(),
          getClienti()
        ]);

        const cashYearsSet = new Set([currentYear]);
        const payYearsSet = new Set([currentYear]);

        // Extract available years from cash movements
        if (cashRes.status === 'fulfilled') {
          const cashData = Array.isArray(cashRes.value) ? cashRes.value : (cashRes.value?.data || []);
          cashData.forEach(item => {
            const rawDate = item.date || item.movement_date || item.created_at;
            if (rawDate) {
              const y = new Date(rawDate).getFullYear();
              if (!isNaN(y)) cashYearsSet.add(y);
            }
          });
        }

        // Extract available years from payment records
        if (payRes.status === 'fulfilled') {
          const payData = Array.isArray(payRes.value) ? payRes.value : (payRes.value?.data || []);
          payData.forEach(item => {
            const rawDate = item.payment_date || item.date || item.created_at;
            if (rawDate) {
              const y = new Date(rawDate).getFullYear();
              if (!isNaN(y)) payYearsSet.add(y);
            }
          });
        }

        // Populate customer list state
        if (custRes.status === 'fulfilled') {
          const customersList = Array.isArray(custRes.value) ? custRes.value : (custRes.value?.data || []);
          setAllCustomers(customersList);
        }

        setAvailableCashYears(Array.from(cashYearsSet).sort((a, b) => b - a));
        setAvailablePaymentYears(Array.from(payYearsSet).sort((a, b) => b - a));

        // Sync route parameters with local states if available
        if (urlYear && urlYear !== 'ALL') {
          setCassaTempYear(Number(urlYear));
          setPagamentiTempYear(Number(urlYear));
          setNavTempYear(Number(urlYear));
        }

        if (urlCustomerName) {
          const value = urlCustomerName.trim();
          setSelectedFilterValue(value);
          setPagamentiTempFilterValue(value);
          setNavTempFilterValue(value);
        }
      } catch (err) {
        console.error('Errore nel recupero dei dati iniziali:', err);
      }
    };

    fetchDataInit();
  }, [currentYear, urlYear, urlCustomerName]);

  // Compute year bounds for navigation constraints
  const currentAvailableYears = activeView === 'CASSA' ? availableCashYears : availablePaymentYears;
  const minAvailableYear = currentAvailableYears.length > 0 ? Math.min(...currentAvailableYears) : currentYear - 5;
  const maxAvailableYear = currentAvailableYears.length > 0 ? Math.max(...currentAvailableYears) : currentYear + 5;

  const canGoPrev = Number(navTempYear) > minAvailableYear;
  const canGoNext = Number(navTempYear) < maxAvailableYear;

  /**
   * Handles year transitions and updates URL routing accordingly.
   * @param {number} targetYear - The year to navigate to
   */
  const handleYearChange = (targetYear) => {
    setNavTempYear(targetYear);
    setYear(targetYear);
    const normalizedValue = selectedFilterValue ? encodeURIComponent(selectedFilterValue) : '';

    if (activeView === 'CASSA') {
      navigate(`/cassa/${targetYear}/movimentazione`);
    } else if (activeView === 'TRANSAZIONI') {
      const filterPath = normalizedValue ? `/${normalizedValue}` : '';
      navigate(`/cassa/${targetYear}/pagamenti${filterPath}`);
    } else {
      navigate(`/cassa/${targetYear}`);
    }
  };

  const handlePrevYear = () => {
    if (canGoPrev) handleYearChange(Number(navTempYear) - 1);
  };

  const handleNextYear = () => {
    if (canGoNext) handleYearChange(Number(navTempYear) + 1);
  };

  // Applies customer or group search filter for transactions view
  const handleApplyCustomerSearch = () => {
    setSelectedFilterValue(navTempFilterValue);
    const normalizedValue = navTempFilterValue ? encodeURIComponent(navTempFilterValue) : '';
    const filterPath = normalizedValue ? `/${normalizedValue}` : '';
    navigate(`/cassa/${year}/pagamenti${filterPath}`);
  };

  // Resets active view back to main options menu
  const handleBackToIndex = () => {
    setActiveView(null);
    navigate(`/cassa`);
  };

  // Opens the creation or editing modal for cash movements or payments
  const handleOpenCreate = (type, itemToEdit = null) => {
    setModalType(type);
    setEditingItem(itemToEdit);
    setIsModalOpen(true);
  };

  /**
   * Calculates closing balance for the current year and carries it over as initial balance for the next year.
   */
  const executeCarryOver = async () => {
    closeConfirm();
    const nextYear = Number(year) + 1;
    try {
      const [movementsRes, paymentsRes] = await Promise.all([
        getCassaMovements({ year }),
        getPayments({ year })
      ]);

      const readRecords = (response, label) => {
        const records = Array.isArray(response) ? response : response?.data;
        if (!Array.isArray(records)) {
          throw new Error(`Risposta non valida per ${label}: chiusura anno interrotta.`);
        }
        return records;
      };
      const cashData = readRecords(movementsRes, 'i movimenti di cassa');
      const paymentsData = readRecords(paymentsRes, 'i pagamenti');

      const normalizedMovements = cashData.map(mov => ({
        date: mov.date || mov.movement_date,
        type: String(mov.type || mov.category || '').toUpperCase().trim(),
        amount: Number(mov.amount) || 0
      }));

      // Filter and normalize cash-based payments for integration into balance calculation
      const normalizedPayments = paymentsData
        .filter(pay => {
          const rawDate = pay.payment_date || pay.date || pay.created_at;
          if (rawDate) {
            const payYear = new Date(rawDate).getFullYear();
            if (payYear !== Number(year)) return false;
          }
          return String(pay.payment_method || pay.method || '').trim().toUpperCase() === 'CONTANTI';
        })
        .map(pay => ({
          date: pay.payment_date || pay.date || pay.created_at,
          type: 'INCASSO',
          amount: Number(pay.amount) || 0
        }));

      const combined = [...normalizedMovements, ...normalizedPayments];
      combined.sort(compareCashMovements);

      let runningBalance = 0;
      combined.forEach(item => {
        const isSaldoIniziale = item.type.includes('SALDO') && item.type.includes('INIZIALE');
        const isUscita = item.type.includes('USCITA') || item.type.includes('VERSAMENTO') || item.type.includes('OUT');
        if (isSaldoIniziale) runningBalance = item.amount;
        else if (isUscita) runningBalance -= item.amount;
        else runningBalance += item.amount;
      });

      const finalSaldo = runningBalance;
      const targetDateStr = `${nextYear}-01-01`;

      const nextYearRes = await getCassaMovements({ year: nextYear });
      const nextYearData = readRecords(nextYearRes, "i movimenti dell'anno successivo");

      const existingSaldoIniziale = nextYearData.find(item => {
        const t = String(item.type || item.category || '').toUpperCase().trim();
        return t.includes('SALDO') && t.includes('INIZIALE');
      });

      if (existingSaldoIniziale) {
        setConfirmState({
          show: true,
          title: "Aggiorna Saldo Iniziale",
          message: `Esiste già un saldo iniziale per il ${nextYear} (€ ${existingSaldoIniziale.amount}). Vuoi aggiornarlo con il nuovo calcolo (€ ${finalSaldo.toFixed(2)})?`,
          onConfirm: async () => {
            closeConfirm();
            try {
              await updateCashMovement(existingSaldoIniziale.id, {
                movement_date: targetDateStr,
                type: 'SALDO INIZIALE',
                amount: finalSaldo,
                notes: `Riporto saldo cassa anno precedente (${year})`
              });
              showAlert(`Saldo iniziale del ${nextYear} aggiornato con successo!`, 'success');
              setRefreshTrigger(prev => prev + 1);
              setCassaTempYear(nextYear);
              setNavTempYear(nextYear);
              setYear(nextYear);
              navigate(`/cassa/${nextYear}/movimentazione`);
            } catch (err) {
              showAlert("Errore durante la chiusura dell'anno: " + (err.message || err), 'danger');
            }
          }
        });
        return;
      }

      await createCashMovement({
        movement_date: targetDateStr,
        type: 'SALDO INIZIALE',
        amount: finalSaldo,
        notes: `Riporto saldo cassa anno precedente (${year})`
      });

      showAlert(`Anno chiuso con successo! Creato saldo iniziale di € ${finalSaldo.toFixed(2)} per il ${nextYear}.`, 'success');
      setRefreshTrigger(prev => prev + 1);
      setCassaTempYear(nextYear);
      setNavTempYear(nextYear);
      setYear(nextYear);
      navigate(`/cassa/${nextYear}/movimentazione`);
    } catch (err) {
      showAlert("Errore durante la chiusura dell'anno: " + (err.message || err), 'danger');
    }
  };

  // Triggers confirmation dialog before executing year closing and balance carry-over
  const handleCloseAndCarryOverYear = () => {
    const nextYear = Number(year) + 1;
    setConfirmState({
      show: true,
      title: "Chiusura Anno Cassa",
      message: `Vuoi calcolare il saldo finale del ${year} (inclusi i pagamenti in contanti) e riportarlo come "SALDO INIZIALE" al 01/01/${nextYear}?`,
      onConfirm: executeCarryOver
    });
  };

  /**
   * Handles form submission for creating or updating payments and cash movements.
   * @param {Object} formData - Form input values
   */
  const handleSaveForm = async (formData) => {
    if (formSavingRef.current) return false;
    formSavingRef.current = true;
    setIsFormSaving(true);
    try {
      if (modalType === 'PAYMENT') {
        if (!editingItem) {
          await savePayments(formData);
        } else {
        let custId = formData.payer_customer_id || null;
        if (!custId && formData.customer_name) {
          const targetName = formData.customer_name.toLowerCase().trim();
          const found = allCustomers.find(c => (c.name || c.ragione_sociale || '').toLowerCase().trim() === targetName);
          if (found) custId = found.id ?? found.customer_id ?? null;
        }

        const paymentDate = formData.date || formData.payment_date;
        const payload = {
          payment_date: paymentDate,
          amount: Number(formData.amount) || 0,
          payment_method: formData.payment_method || 'BONIFICO',
          notes: formData.notes || formData.description || null,
          payer_customer_id: custId
        };

          await updatePayment(editingItem.id, payload);
        }
      } else {
        const payload = {
          movement_date: formData.date || formData.movement_date,
          amount: Number(formData.amount) || 0,
          type: formData.category || formData.type || 'USCITA',
          notes: formData.notes || formData.description || null
        };

        if (editingItem && editingItem.id) {
          await updateCashMovement(editingItem.originalId || editingItem.id, payload);
        } else {
          await createCashMovement(payload);
        }
      }

      setIsModalOpen(false);
      setEditingItem(null);
      setRefreshTrigger(prev => prev + 1);
      showAlert("Operazione completata con successo!", "success");
      return true;
    } catch (err) {
      showAlert(`Errore durante il salvataggio: ${err.message || err}`, "danger");
      return false;
    } finally {
      formSavingRef.current = false;
      setIsFormSaving(false);
    }
  };

  return (
    <div className="h-custom-calc d-flex flex-column overflow-hidden position-relative">
      <Alert message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success' })} />
      <ConfirmModal show={confirmState.show} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />

      {/* Header bar when viewing Cash Movements */}
      {activeView === 'CASSA' && (
        <div className="card border shadow-sm bg-white rounded-0 mb-2 shrink-0">
          <div className="card-body p-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <BackButton onBack={handleBackToIndex} />
              <h5 className="m-0 fw-bold text-dark" style={{ fontSize: '15px' }}>Cassa</h5>

              <div className="btn-group btn-group-sm rounded-0 ms-1" role="group">
                <button type="button" onClick={handlePrevYear} disabled={!canGoPrev} className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${canGoPrev ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`} style={{ fontSize: '12px' }}><i className="bi bi-chevron-left"></i></button>
                <button type="button" className="btn btn-sm btn-light text-dark fw-bold border border-secondary-subtle rounded-0 px-3 py-1 shadow-none" style={{ fontSize: '13px', cursor: 'default', minWidth: '60px' }}>{navTempYear}</button>
                <button type="button" onClick={handleNextYear} disabled={!canGoNext} className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${canGoNext ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`} style={{ fontSize: '12px' }}><i className="bi bi-chevron-right"></i></button>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button onClick={handleCloseAndCarryOverYear} className="btn btn-sm btn-outline-dark rounded-0 px-3 py-1 fw-bold shadow-none">🔒 Chiudi e Riporta Saldo</button>
              <button onClick={() => handleOpenCreate('CASH')} className="btn btn-sm btn-dark rounded-0 px-3 py-1 fw-bold shadow-none">+ Nuovo Movimento</button>
            </div>
          </div>
        </div>
      )}

      {/* Header bar when viewing Client Transactions / Payments */}
      {activeView === 'TRANSAZIONI' && (
        <div className="card border shadow-sm bg-white rounded-0 mb-2 shrink-0">
          <div className="card-body p-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <BackButton onBack={handleBackToIndex} />
              <h5 className="m-0 fw-bold text-dark" style={{ fontSize: '15px' }}>Gestione Pagamenti</h5>

              <div className="btn-group btn-group-sm rounded-0 ms-1" role="group">
                <button type="button" onClick={handlePrevYear} disabled={!canGoPrev} className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${canGoPrev ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`} style={{ fontSize: '12px' }}><i className="bi bi-chevron-left"></i></button>
                <button type="button" className="btn btn-sm btn-light text-dark fw-bold border border-secondary-subtle rounded-0 px-3 py-1 shadow-none" style={{ fontSize: '13px', cursor: 'default', minWidth: '60px' }}>{navTempYear}</button>
                <button type="button" onClick={handleNextYear} disabled={!canGoNext} className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${canGoNext ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`} style={{ fontSize: '12px' }}><i className="bi bi-chevron-right"></i></button>
              </div>

              <div className="d-flex align-items-center gap-1 ms-2">
                <GroupSearchInput availableCustomers={allCustomers} selectedFilterValue={navTempFilterValue} onFilterValueChange={setNavTempFilterValue} placeholder="Cerca cliente o gruppo..." inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle" inputStyle={{ minWidth: '220px', fontSize: '13px' }} />
                <button onClick={handleApplyCustomerSearch} className="btn btn-sm btn-outline-secondary rounded-0 px-2 py-1 shadow-none" title="Cerca cliente"><i className="bi bi-search"></i></button>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button onClick={() => handleOpenCreate('PAYMENT')} className="btn btn-sm btn-dark rounded-0 px-3 py-1 fw-bold shadow-none">+ Nuovo Pagamento</button>
            </div>
          </div>
        </div>
      )}

      {/* Main landing selector menu when no view is active */}
      {!activeView ? (
        <div className="row justify-content-center py-5 px-3 grow position-relative">
          <div className="col-md-11 col-lg-10 position-relative" style={{ zIndex: 1 }}>
            <h4 className="fw-bold text-dark mb-2 text-center" style={{ fontSize: '22px' }}>Gestione Contabile Cassa</h4>
            <p className="text-secondary text-center mb-5" style={{ fontSize: '14px' }}>Seleziona la sezione e i parametri desiderati, quindi conferma per visualizzare la griglia.</p>

            <div className="row g-4 px-2">
              <div className="col-md-6">
                <div className="card border shadow-sm rounded-0 bg-white p-4 h-100 d-flex flex-column justify-content-between">
                  <div>
                    <div className="fw-bold mb-2 text-dark" style={{ fontSize: '16px' }}>💵 
                    Cassa</div>
                    <div className="text-secondary mb-4" style={{ fontSize: '13px' }}>Gestione fisica del contante (Entrate, Uscite, Versamenti, Saldo).</div>
                    <div className="mb-4 bg-light p-3 border">
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '12px' }}>Anno di riferimento:</label>
                      <select value={cassaTempYear} onChange={(e) => setCassaTempYear(Number(e.target.value))} className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle fw-bold text-dark py-2" style={{ fontSize: '13px' }}>
                        {availableCashYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={() => { setActiveView('CASSA'); setYear(cassaTempYear); setNavTempYear(cassaTempYear); navigate(`/cassa/${cassaTempYear}/movimentazione`); }} className="btn btn-dark rounded-0 py-2 w-100 fw-bold shadow-none d-flex justify-content-between align-items-center px-3" style={{ fontSize: '13px' }}>
                    <span>Visualizza Cassa</span><span>→</span>
                  </button>
                </div>
              </div>

              <div className="col-md-6">
                <div className="card border shadow-sm rounded-0 bg-white p-4 h-100 d-flex flex-column justify-content-between">
                  <div>
                    <div className="fw-bold mb-2 text-dark" style={{ fontSize: '16px' }}>💳 Pagamenti</div>
                    <div className="text-secondary mb-4" style={{ fontSize: '13px' }}>Elenco completo dei pagamenti filtrabili per cliente/gruppo e anno.</div>
                    <div className="mb-3 bg-light p-3 border">
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '12px' }}>Anno di riferimento:</label>
                      <select value={pagamentiTempYear} onChange={(e) => setPagamentiTempYear(Number(e.target.value))} className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle fw-bold text-dark mb-3 py-2" style={{ fontSize: '13px' }}>
                        {availablePaymentYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '12px' }}>Cliente / Gruppo:</label>
                      <GroupSearchInput availableCustomers={allCustomers} selectedFilterValue={pagamentiTempFilterValue} onFilterValueChange={setPagamentiTempFilterValue} placeholder="Cerca cliente o gruppo..." inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle py-2" inputStyle={{ width: '100%', fontSize: '13px' }} />
                    </div>
                  </div>
                  <button onClick={() => { setActiveView('TRANSAZIONI'); setYear(pagamentiTempYear); setNavTempYear(pagamentiTempYear); setSelectedFilterValue(pagamentiTempFilterValue); setNavTempFilterValue(pagamentiTempFilterValue); navigate(`/cassa/${pagamentiTempYear}/pagamenti${pagamentiTempFilterValue ? `/${encodeURIComponent(pagamentiTempFilterValue)}` : ''}`); }} className="btn btn-dark rounded-0 py-2 w-100 fw-bold shadow-none d-flex justify-content-between align-items-center px-3" style={{ fontSize: '13px' }}>
                    <span>Visualizza Pagamenti</span><span>→</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grow overflow-hidden d-flex flex-column h-100">
          {activeView === 'CASSA' ? (
            <CassaGrid
              year={year}
              key={`cassa-${year}-${refreshTrigger}`}
              onRefresh={() => setRefreshTrigger(prev => prev + 1)}
              showAlert={showAlert}
              onEditMovement={(item) => handleOpenCreate('CASH', item)}
            />
          ) : (
            <PagamentiClientiGrid
              initialYear={year}
              initialCustomerName={selectedFilterValue}
              key={`trans-${year}-${selectedFilterValue || 'all'}-${refreshTrigger}`}
              onRefresh={() => setRefreshTrigger(prev => prev + 1)}
              showAlert={showAlert}
              onEditPayment={(item) => handleOpenCreate('PAYMENT', item)}
            />
          )}
        </div>
      )}

      {/* Modal dialog rendering for creating or editing payments / cash movements */}
      {isModalOpen && (
        modalType === 'PAYMENT' ? (
          <PagamentiFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveForm} editingPayment={editingItem} allCustomers={allCustomers} initialYear={year} currentYear={currentYear} defaultCustomerName={selectedFilterValue} showAlert={showAlert}/>
        ) : (
          <div
            className="modal show d-block"
            tabIndex="-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
            onMouseDown={(e) => {
              modalMouseDownTarget.current = e.target;
            }}
            onMouseUp={(e) => {
              if (!formSavingRef.current && modalMouseDownTarget.current === e.currentTarget && e.target === e.currentTarget) {
                setIsModalOpen(false);
              }
              modalMouseDownTarget.current = null;
            }}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content rounded-0 border shadow">
                <div className="modal-header bg-light py-2">
                  <h6 className="modal-title fw-bold text-secondary" style={{ fontSize: '14px' }}>{editingItem ? 'Modifica Movimento' : 'Nuovo Movimento'}</h6>
                  <button type="button" disabled={isFormSaving} className="btn-close shadow-none" onClick={() => setIsModalOpen(false)} style={{ fontSize: '11px' }} />
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveForm({ date: e.target.elements.movDate.value, type: e.target.elements.movType.value, amount: e.target.elements.movAmount.value, notes: e.target.elements.movNotes.value });
                }}>
                  <fieldset disabled={isFormSaving} className="border-0 p-0 m-0" aria-busy={isFormSaving}>
                  <div className="modal-body p-3">
                    <div className="mb-3">
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '11px' }}>Data Movimento *</label>
                      <input type="date" name="movDate" defaultValue={getLocalDateInputValue(editingItem?.date || editingItem?.movement_date || new Date())} className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle" required />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '11px' }}>Tipo Movimento *</label>
                      <select name="movType" defaultValue={editingItem?.type || 'USCITA'} className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle">
                        <option value="USCITA">Uscita</option><option value="ENTRATA">Entrata</option><option value="VERSAMENTO">Versamento</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '11px' }}>Importo (€) *</label>
                      <input type="number" step="0.01" name="movAmount" defaultValue={editingItem?.amount || ''} className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle" placeholder="0.00" required />
                    </div>
                    <div className="mb-3">
                      <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '11px' }}>Note / Descrizione</label>
                      <textarea name="movNotes" defaultValue={editingItem?.notes || ''} className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle" rows="2" placeholder="Note aggiuntive..." />
                    </div>
                  </div>
                  <div className="modal-footer bg-light py-2">
                    <button type="button" className="btn btn-sm btn-outline-secondary rounded-0 px-3 shadow-none" onClick={() => setIsModalOpen(false)}>Annulla</button>
                    <button type="submit" className="btn btn-sm btn-primary rounded-0 px-3 shadow-none">{isFormSaving ? 'Salvataggio...' : 'Salva Movimento'}</button>
                  </div>
                  </fieldset>
                </form>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default CassaPage;