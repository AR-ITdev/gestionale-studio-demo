import { useState, useEffect, useRef, useMemo } from 'react';

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
 * PagamentiFormModal component provides a modal form to create or edit 
 * customer payments and discounts, featuring an interactive customer search dropdown 
 * with full keyboard navigation support.
 */
export const PagamentiFormModal = ({
  isOpen,
  onClose,
  onSave,
  editingPayment,
  allCustomers,
  defaultCustomerName = '',
  showAlert // Existing alert component function
}) => {
  // State for managing the selected customer in the modal input
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0, width: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  
  // Ref to track the target of mousedown events on the backdrop for safe closing
  const backdropMouseDownTarget = useRef(null);

  // Ref for the customer search input element to calculate dropdown dimensions
  const customerInputRef = useRef(null);
  const dropdownListRef = useRef(null);

  // Form data state containing payment details
  const [modalFormData, setModalFormData] = useState({
    date: '',
    amount: '',
    discount_amount: '',
    payment_method: '',
    notes: '',
    payer_customer_id: '',
    customer_name: ''
  });

  // Resets the selected index whenever filtered customers change
  useEffect(() => {
    setSelectedIndex(0);
  }, [customerSearchText, defaultCustomerName]);

  // Auto-scrolls the dropdown list to keep the selected index visible
  useEffect(() => {
    if (isCustomerDropdownOpen && dropdownListRef.current) {
      const items = dropdownListRef.current.querySelectorAll('.customer-modal-option-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isCustomerDropdownOpen]);

  /**
   * Effect to initialize or reset form fields when opening the modal,
   * switching between edit mode and creation mode, or applying default customer context.
   */
  useEffect(() => {
    queueMicrotask(() => {
      if (editingPayment) {
        const payCustId = editingPayment.payer_customer_id || editingPayment.customer_id;
        const payCustName = editingPayment.customer_name || editingPayment.name || editingPayment.ragione_sociale || editingPayment.subject || '';
        const payDate = editingPayment.date || editingPayment.payment_date || editingPayment.created_at || '';
        const method = String(editingPayment.payment_method || editingPayment.method || '').toUpperCase();

        const isDiscountRow = method.includes('SCONTO');

        setSelectedCustomerForModal(payCustName);
        setModalFormData({
          date: getLocalDateInputValue(payDate),
          amount: isDiscountRow ? '' : (editingPayment.amount || ''),
          discount_amount: isDiscountRow ? (editingPayment.amount || '') : '',
          payment_method: isDiscountRow ? '' : (editingPayment.payment_method || editingPayment.method || ''),
          notes: editingPayment.notes || editingPayment.description || '',
          payer_customer_id: payCustId || '',
          customer_name: payCustName
        });
      } else {
        let initialDisplayName = defaultCustomerName;
        let initialCustId = '';

        if (defaultCustomerName) {
          const isParentQuery = defaultCustomerName.toUpperCase().startsWith('PARENT:');
          
          if (!isParentQuery) {
            const cleanTarget = defaultCustomerName.toLowerCase().trim();
            const foundCust = allCustomers.find(c => {
              const cId = String(c.id || '').toLowerCase().trim();
              const cCode = String(c.customer_code || c.code || '').toLowerCase().trim();
              const cName = String(c.name || c.ragione_sociale || '').toLowerCase().trim();
              return cId === cleanTarget || cCode === cleanTarget || cName === cleanTarget;
            });

            if (foundCust) {
              initialDisplayName = foundCust.name || foundCust.ragione_sociale || `Cliente #${foundCust.id}`;
              initialCustId = foundCust.id;
            }
          } else {
            initialDisplayName = defaultCustomerName.replace(/^PARENT:/i, '').trim();
          }
        }

        setSelectedCustomerForModal(initialDisplayName);
        setModalFormData({
          date: getLocalDateInputValue(),
          amount: '',
          discount_amount: '',
          payment_method: '',
          notes: '',
          payer_customer_id: initialCustId,
          customer_name: initialDisplayName
        });
      }
    });
  }, [editingPayment, defaultCustomerName, allCustomers]);

  /**
   * Memoized filter for customers matching search query text 
   * and default parent/customer parameters.
   */
  const filteredCustomers = useMemo(() => {
    const rawQuery = (customerSearchText || '').toLowerCase().trim();
    let baseCustomers = allCustomers;

    if (defaultCustomerName) {
      const isParentQuery = defaultCustomerName.toUpperCase().startsWith('PARENT:');
      const targetValue = isParentQuery 
        ? defaultCustomerName.replace(/^PARENT:/i, '').trim().toLowerCase() 
        : defaultCustomerName.toLowerCase().trim();

      if (isParentQuery) {
        baseCustomers = allCustomers.filter(c => {
          const cParent = String(c.parent_code || c.codice_padre || '').trim().toLowerCase();
          return cParent === targetValue;
        });
      } else {
        const parentCust = allCustomers.find(c => {
          const name = (c.name || c.ragione_sociale || '').toLowerCase().trim();
          const code = (c.customer_code || '').toLowerCase().trim();
          return name === targetValue || code === targetValue;
        });
        
        if (parentCust) {
          const pCode = (parentCust.customer_code || parentCust.code || '').toLowerCase().trim();
          const pId = parentCust.id;
          baseCustomers = allCustomers.filter(c => {
            const cId = c.id;
            const cParent = (c.parent_code || c.codice_padre || '').toLowerCase().trim();
            const cCode = (c.customer_code || c.code || '').toLowerCase().trim();
            return cId === pId || cCode === targetValue || cParent === pCode || cParent === targetValue;
          });
        }
      }
    }

    if (!rawQuery) return baseCustomers;
    const keywords = rawQuery.split(/\s+/).filter(Boolean);

    return baseCustomers.filter(cust => {
      const name = (cust.name || cust.ragione_sociale || '').toLowerCase();
      const companyName = (cust.company_name || '').toLowerCase();
      const customerCode = (cust.customer_code || '').toLowerCase();
      const parentCode = (cust.parent_code || '').toLowerCase();
      const taxId = (cust.tax_id || '').toLowerCase();
      const vatNumber = (cust.vat_number || '').toLowerCase();

      return keywords.every(kw =>
        name.includes(kw) || companyName.includes(kw) || customerCode.includes(kw) || parentCode.includes(kw) || taxId.includes(kw) || vatNumber.includes(kw)
      );
    });
  }, [allCustomers, customerSearchText, defaultCustomerName]);

  /**
   * Effect to handle keyboard events (ESC, Arrow navigation, and Enter selection)
   * and click-outside listeners to close the customer autocomplete dropdown.
   */
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!isOpen) return;

      // Gestione globale del tasto ESC se il dropdown non è attivo o per chiudere la modale
      if (e.key === 'Escape') {
        if (savingRef.current) return;
        if (isCustomerDropdownOpen) {
          setIsCustomerDropdownOpen(false);
          e.stopPropagation();
          return;
        }
        onClose();
      }
    };

    const handleClickOutside = (e) => {
      if (customerInputRef.current && !customerInputRef.current.contains(e.target)) {
        const dropdownEl = document.getElementById('customer-search-dropdown-menu-modal');
        if (dropdownEl && !dropdownEl.contains(e.target)) {
          setIsCustomerDropdownOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isCustomerDropdownOpen, onClose]);

  // Gestione specifica della tastiera sull'input di ricerca cliente (Frecce e Invio)
  const handleCustomerInputKeyDown = (e) => {
    if (!isCustomerDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        openCustomerDropdown();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filteredCustomers.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCustomers.length > 0 && selectedIndex >= 0 && selectedIndex < filteredCustomers.length) {
        const cust = filteredCustomers[selectedIndex];
        const custName = cust.name || cust.ragione_sociale || `Cliente #${cust.id}`;
        setSelectedCustomerForModal(custName);
        setModalFormData((prev) => ({ ...prev, payer_customer_id: cust.id }));
        setCustomerSearchText('');
        setIsCustomerDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsCustomerDropdownOpen(false);
    }
  };

  /**
   * Computes position coordinates relative to the customer input box
   * and opens the custom autocomplete dropdown menu.
   */
  const openCustomerDropdown = () => {
    if (customerInputRef.current) {
      const rect = customerInputRef.current.getBoundingClientRect();
      setDropdownCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 300)
      });
    }
    setIsCustomerDropdownOpen(true);
    setCustomerSearchText('');
  };

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e) => {
    if (savingRef.current) return;
    if (
      backdropMouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose();
    }
    backdropMouseDownTarget.current = null;
  };

  if (!isOpen) return null;

  const hasValidAmount = modalFormData.amount !== '' && !isNaN(parseFloat(modalFormData.amount)) && parseFloat(modalFormData.amount) > 0;

  /**
   * Handles form submission, validating required fields, matching customer IDs,
   * and constructing payloads for standard payments or discount records.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    
    const mainAmount = parseFloat(modalFormData.amount) || 0;
    const discountAmount = parseFloat(modalFormData.discount_amount) || 0;
    const paymentDate = modalFormData.date;

    if (mainAmount <= 0 && discountAmount <= 0) {
      if (showAlert) {
        showAlert("È obbligatorio compilare almeno uno tra 'Importo (€)' e 'Importo Sconto (€)'.", "danger");
      }
      return;
    }

    let resolvedCustId = modalFormData.payer_customer_id
      ? Number(modalFormData.payer_customer_id)
      : null;
    const resolvedCustName = String(selectedCustomerForModal || '').trim().toLowerCase();

    const matches = allCustomers.filter((customer) => {
      const name = (customer.name || customer.ragione_sociale || customer.customer_name || customer.subject || '').toLowerCase().trim();
      return name === resolvedCustName;
    });

    if (!resolvedCustId && matches.length === 1) {
      const found = matches[0];
      resolvedCustId = found.id ?? found.customer_id ?? found.payer_customer_id ?? null;
    }
    if (!resolvedCustId || !Number.isFinite(Number(resolvedCustId))) {
      showAlert?.("Seleziona un cliente valido dall'elenco prima di salvare.", "danger");
      return;
    }

    const payments = [];
    if (editingPayment) {
      const isEditingDiscount = String(editingPayment.payment_method || editingPayment.method || '').toUpperCase().includes('SCONTO');

      if (isEditingDiscount) {
        const discountPayload = {
          payer_customer_id: resolvedCustId,
          payment_date: paymentDate,
          amount: discountAmount > 0 ? discountAmount : mainAmount,
          payment_method: 'SCONTO',
          notes: modalFormData.notes || null,
          customer_name: selectedCustomerForModal
        };
        payments.push(discountPayload);
      } else {
        const primaryPayload = {
          payer_customer_id: resolvedCustId,
          payment_date: paymentDate,
          amount: mainAmount > 0 ? mainAmount : discountAmount,
          payment_method: modalFormData.payment_method || 'ELETTRONICO',
          notes: modalFormData.notes || null,
          customer_name: selectedCustomerForModal
        };
        payments.push(primaryPayload);
      }
    } else {
      if (mainAmount > 0) {
        const primaryPayload = {
          payer_customer_id: resolvedCustId,
          payment_date: paymentDate,
          amount: mainAmount,
          payment_method: modalFormData.payment_method || 'ELETTRONICO',
          notes: modalFormData.notes || null,
          customer_name: selectedCustomerForModal
        };
        payments.push(primaryPayload);
      }

      if (discountAmount > 0) {
        const discountPayload = {
          payer_customer_id: resolvedCustId,
          payment_date: paymentDate,
          amount: discountAmount,
          payment_method: 'SCONTO',
          notes: modalFormData.notes ? `Sconto - ${modalFormData.notes}` : 'Sconto applicato',
          customer_name: selectedCustomerForModal
        };
        payments.push(discountPayload);
      }
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave(payments.length === 1 ? payments[0] : payments, editingPayment?.id);
    } catch (error) {
      console.error('Errore salvataggio pagamento:', error);
      showAlert?.(error.message || 'Errore durante il salvataggio del pagamento.', 'danger');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Modal backdrop container */}
      <div
        className="modal show d-block"
        tabIndex="-1"
        style={{
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 1050
        }}
        onMouseDown={handleBackdropMouseDown}
        onMouseUp={handleBackdropMouseUp}
      >
        <div 
          className="modal-dialog modal-dialog-centered"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content rounded-0 border shadow">
            <div className="modal-header bg-light py-2">
              <h6
                className="modal-title fw-bold text-secondary"
                style={{ fontSize: '14px' }}
              >
                {editingPayment ? 'Modifica Pagamento / Sconto' : 'Nuovo Pagamento'}
              </h6>
              <button
                type="button"
                className="btn-close shadow-none"
                onClick={onClose}
                disabled={isSaving}
                style={{ fontSize: '11px' }}
              />
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body p-3">
                {/* Customer selection input field */}
                <div className="mb-3 position-relative">
                  <label
                    className="form-label fw-semibold text-secondary mb-1"
                    style={{ fontSize: '11px' }}
                  >
                    Cliente / Soggetto *
                  </label>
                  <input
                    type="text"
                    ref={customerInputRef}
                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                    value={isCustomerDropdownOpen ? customerSearchText : selectedCustomerForModal}
                    onFocus={openCustomerDropdown}
                    onClick={openCustomerDropdown}
                    onChange={(e) => {
                      setSelectedCustomerForModal(e.target.value);
                      setCustomerSearchText(e.target.value);
                      setModalFormData((prev) => ({ ...prev, payer_customer_id: '' }));
                      if (!isCustomerDropdownOpen) openCustomerDropdown();
                    }}
                    onKeyDown={handleCustomerInputKeyDown}
                    required
                  />
                </div>

                {/* Date input field */}
                <div className="mb-3">
                  <label
                    className="form-label fw-semibold text-secondary mb-1"
                    style={{ fontSize: '11px' }}
                  >
                    Data Pagamento *
                  </label>
                  <input
                    type="date"
                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                    value={modalFormData.date}
                    onChange={(e) => {
                      const val = e.target.value;
                      setModalFormData((prev) => ({
                        ...prev,
                        date: val
                      }));
                    }}
                    required
                  />
                </div>

                {/* Main payment amount input field */}
                <div className="mb-3">
                  <label
                    className="form-label fw-semibold text-secondary mb-1"
                    style={{ fontSize: '11px' }}
                  >
                    Importo (€) 
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                    placeholder="0.00"
                    value={modalFormData.amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setModalFormData((prev) => ({
                        ...prev,
                        amount: val,
                        payment_method: (!val || parseFloat(val) <= 0) ? '' : (prev.payment_method || 'ELETTRONICO')
                      }));
                    }}
                  />
                </div>

                {/* Discount amount input field */}
                <div className="mb-3">
                  <label
                    className="form-label fw-semibold text-secondary mb-1"
                    style={{ fontSize: '11px' }}
                  >
                    Importo Sconto (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                    placeholder="0.00"
                    value={modalFormData.discount_amount}
                    onChange={(e) =>
                      setModalFormData((prev) => ({
                        ...prev,
                        discount_amount: e.target.value
                      }))
                    }
                  />
                </div>

                {/* Payment method selection dropdown */}
                <div className="mb-3">
                  <label
                    className="form-label fw-semibold text-secondary mb-1"
                    style={{ fontSize: '11px' }}
                  >
                    Metodo di Pagamento {hasValidAmount && '*'}
                  </label>
                  <select
                    className={`form-select form-select-sm rounded-0 shadow-none border-secondary-subtle ${!hasValidAmount ? 'bg-light text-muted' : ''}`}
                    value={modalFormData.payment_method}
                    onChange={(e) =>
                      setModalFormData((prev) => ({
                        ...prev,
                        payment_method: e.target.value
                      }))
                    }
                    disabled={!hasValidAmount}
                    required={hasValidAmount}
                  >
                    <option value="">-- Seleziona metodo --</option>
                    <option value="ELETTRONICO">Elettronico</option>
                    <option value="CONTANTI">Contanti</option>
                  </select>
                </div>

                {/* Notes and description text area */}
                <div className="mb-3">
                  <label
                    className="form-label fw-semibold text-secondary mb-1"
                    style={{ fontSize: '11px' }}
                  >
                    Note / Descrizione
                  </label>
                  <textarea
                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                    rows="2"
                    value={modalFormData.notes}
                    onChange={(e) =>
                      setModalFormData((prev) => ({
                        ...prev,
                        notes: e.target.value
                      }))
                    }
                    placeholder="Note aggiuntive..."
                  />
                </div>
              </div>

              {/* Modal footer action buttons */}
              <div className="modal-footer bg-light py-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary rounded-0 px-3 shadow-none"
                  onClick={onClose}
                  disabled={isSaving}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-sm btn-primary rounded-0 px-3 shadow-none"
                >
                  Salva Pagamento
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Floating customer autocomplete dropdown menu */}
      {isCustomerDropdownOpen && (
        <div
          id="customer-search-dropdown-menu-modal"
          ref={dropdownListRef}
          className="position-fixed bg-white border shadow rounded-1 py-1"
          style={{
            top: `${dropdownCoords.top}px`,
            left: `${dropdownCoords.left}px`,
            width: `${dropdownCoords.width}px`,
            maxHeight: '260px',
            overflowY: 'auto',
            fontSize: '12px',
            zIndex: 1060
          }}
        >
          {filteredCustomers.length === 0 ? (
            <div className="px-3 py-2 text-muted text-center">Nessun cliente o gruppo trovato</div>
          ) : (
            filteredCustomers.map((cust, index) => {
              const custName = cust.name || cust.ragione_sociale || `Cliente #${cust.id}`;
              const custCode = cust.customer_code || '';
              const parentCode = cust.parent_code || '';
              const ident = cust.tax_id || cust.vat_number || '';
              const isSelected = selectedCustomerForModal.toLowerCase().trim() === custName.toLowerCase().trim();
              const isHighlighted = index === selectedIndex;

              return (
                <div
                  key={cust.id || custName}
                  className={`customer-modal-option-item px-3 py-2 border-bottom border-light ${
                    isSelected ? 'bg-primary text-white' : isHighlighted ? 'bg-light' : ''
                  }`}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedCustomerForModal(custName);
                    setModalFormData((prev) => ({ ...prev, payer_customer_id: cust.id }));
                    setCustomerSearchText('');
                    setIsCustomerDropdownOpen(false);
                  }}
                >
                  <div className="fw-semibold text-truncate">
                    {parentCode && <span className="badge bg-secondary me-1" style={{ fontSize: '10px' }}>Padre: {parentCode}</span>}
                    {custName}
                  </div>
                  <div className={`small ${isSelected ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '11px', display: 'flex', gap: '8px' }}>
                    {custCode && <span>Codice: <strong>{custCode}</strong></span>}
                    {ident && <span>P.IVA/CF: {ident}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </>
  );
};

export default PagamentiFormModal;