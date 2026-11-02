// src/components/ElaborazioniDetailModal.jsx
import { useState, useEffect, useRef } from 'react';

/**
 * Formats a numeric amount into a localized currency string with custom signs and color styling.
 */
const formatCurrency = (amount, customSign = null, customColorClass = null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '€ 0,00';

  const absVal = Math.abs(Number(amount));
  const fixed = absVal.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  let signPrefix = '';
  if (customSign) {
    signPrefix = customSign;
  } else if (Number(amount) < 0) {
    signPrefix = '-';
  }

  const formattedStr = `€ ${formattedInteger},${decimalPart}`;
  if (signPrefix) {
    return <span className={customColorClass || ''}>{signPrefix} {formattedStr}</span>;
  }
  return formattedStr;
};

/**
 * ElaborazioniDetailModal component displays a detailed modal window for managing
 * and editing debits, discounts, items, or payment details.
 */
export const ElaborazioniDetailModal = ({
  detailModal,
  onClose,
  onUpdateItem,
  onUpdatePayment
}) => {
  const [editingRowId, setEditingRowId] = useState(null);
  const [tempRowData, setTempRowData] = useState({});

  const [editingDiscountId, setEditingDiscountId] = useState(null);
  const [tempDiscountData, setTempDiscountData] = useState({});

  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [tempPaymentData, setTempPaymentData] = useState({});

  const [itemOverrides, setItemOverrides] = useState({});
  const [discountOverrides, setDiscountOverrides] = useState({});
  const [paymentOverrides, setPaymentOverrides] = useState({});

  // Ref to track mousedown target on the modal backdrop to handle clicks outside
  const backdropMouseDownTarget = useRef(null);

  // Handles closing the modal on pressing the Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && detailModal?.isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [detailModal?.isOpen, onClose]);

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e) => {
    if (
      backdropMouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose();
    }
    backdropMouseDownTarget.current = null;
  };

  // Returns null if the detail modal is not open
  if (!detailModal?.isOpen) return null;

  // Prepares editable items mapping raw data with local overrides and parsed notes
  const rawItems = detailModal.items || [];
  const editableItems = rawItems.map(item => {
    let noteVal = item.note || item.notes || '';
    if (!noteVal && item.custom_data) {
      try {
        const parsed = typeof item.custom_data === 'string' ? JSON.parse(item.custom_data) : item.custom_data;
        noteVal = parsed?.note || parsed?.notes || '';
      } catch  {
        // Ignore JSON parsing errors
      }
    }
    const baseItem = { ...item, note: noteVal, notes: noteVal };
    return itemOverrides[item.id] ? { ...baseItem, ...itemOverrides[item.id] } : baseItem;
  });

  // Prepares editable discounts mapping raw data with formatted input dates and overrides
  const rawDiscounts = detailModal.discounts || [];
  const editableDiscounts = rawDiscounts.map(d => {
    const baseDisc = {
      ...d,
      rawDateForInput: d.payment_date || d.date ? (d.payment_date || d.date).split('T')[0] : new Date().toISOString().split('T')[0]
    };
    return discountOverrides[d.id] ? { ...baseDisc, ...discountOverrides[d.id] } : baseDisc;
  });

  // Prepares editable payments mapping raw data with dates and overrides
  const rawPayments = detailModal.payments || [];
  const editablePayments = rawPayments.map(p => {
    const basePay = {
      ...p,
      rawDateForInput: p.payment_date || p.date ? (p.payment_date || p.date).split('T')[0] : new Date().toISOString().split('T')[0]
    };
    return paymentOverrides[p.id] ? { ...basePay, ...paymentOverrides[p.id] } : basePay;
  });

  // Initializes inline editing for an item row
  const handleStartEdit = (item) => {
    if (item.isSnapshot) return;
    setEditingRowId(item.id);
    setTempRowData({
      note: item.note !== undefined && item.note !== null ? item.note : (item.notes || ''),
      quantity: item.quantity !== undefined ? item.quantity : 1,
      price: item.price !== undefined ? item.price : 0
    });
  };

  const handleTempFieldChange = (field, value) => {
    setTempRowData(prev => ({ ...prev, [field]: value }));
  };

  // Saves inline item modifications and updates overrides state
  const handleSaveEdit = async (itemId) => {
    const q = tempRowData.quantity === '' ? 0 : Number(tempRowData.quantity);
    const p = tempRowData.price === '' ? 0 : Number(tempRowData.price);
    const noteVal = tempRowData.note !== undefined ? tempRowData.note : '';

    const originalItem = editableItems.find((i) => i.id === itemId);
    let existingCustomData = {};
    if (originalItem?.custom_data) {
      try {
        existingCustomData = typeof originalItem.custom_data === 'string'
          ? JSON.parse(originalItem.custom_data)
          : originalItem.custom_data;
      } catch {
        existingCustomData = {};
      }
    }

    const updatedCustomData = {
      ...existingCustomData,
      note: noteVal,
      notes: noteVal
    };

    const payload = { 
      quantity: q, 
      price: p, 
      total: q * p,
      note: noteVal,
      notes: noteVal,
      custom_data: JSON.stringify(updatedCustomData),
      category: detailModal.category || originalItem?.category
    };

    if (onUpdateItem && await onUpdateItem(itemId, payload) === false) return;

    setItemOverrides(prev => ({
      ...prev,
      [itemId]: { 
        quantity: q, 
        price: p, 
        note: noteVal, 
        notes: noteVal, 
        total: q * p, 
        custom_data: JSON.stringify(updatedCustomData) 
      }
    }));
    setEditingRowId(null);
  };

  // Initializes inline editing for a discount row
  const handleStartEditDiscount = (disc) => {
    if (disc.isSnapshot) return;
    setEditingDiscountId(disc.id);
    setTempDiscountData({
      notes: disc.notes || disc.note || '',
      amount: disc.effectiveAmount || disc.effectiveDiscount || disc.amount || 0,
      payment_date: disc.rawDateForInput || ''
    });
  };

  const handleTempDiscountChange = (field, value) => {
    setTempDiscountData(prev => ({ ...prev, [field]: value }));
  };

  // Saves inline discount modifications and updates overrides state
  const handleSaveEditDiscount = async (discId) => {
    const amount = tempDiscountData.amount === '' ? 0 : Number(tempDiscountData.amount);
    const notesVal = tempDiscountData.notes;
    const payment_date = tempDiscountData.payment_date;

    const payload = { amount, notes: notesVal, payment_date, payment_method: 'SCONTO' };
    if (onUpdatePayment && await onUpdatePayment(discId, payload) === false) return;

    const targetDisc = editableDiscounts.find(d => d.id === discId);
    const formattedDateObj = payment_date ? new Date(payment_date).toLocaleDateString('it-IT') : targetDisc?.formattedDate;

    setDiscountOverrides(prev => ({
      ...prev,
      [discId]: {
        effectiveAmount: amount,
        amount,
        notes: notesVal,
        payment_date,
        rawDateForInput: payment_date,
        formattedDate: formattedDateObj
      }
    }));
    setEditingDiscountId(null);
  };

  // Initializes inline editing for a payment row
  const handleStartEditPayment = (pay) => {
    if (pay.isSnapshot) return;
    setEditingPaymentId(pay.id);
    setTempPaymentData({
      notes: pay.notes || pay.note || '',
      amount: pay.effectiveAmount || pay.effectiveDiscount || pay.amount || 0,
      payment_method: pay.payment_method || pay.method || 'ELETTRONICO',
      payment_date: pay.rawDateForInput || ''
    });
  };

  const handleTempPaymentChange = (field, value) => {
    setTempPaymentData(prev => ({ ...prev, [field]: value }));
  };

  // Saves inline payment modifications and updates overrides state
  const handleSaveEditPayment = async (payId) => {
    const amount = tempPaymentData.amount === '' ? 0 : Number(tempPaymentData.amount);
    const notesVal = tempPaymentData.notes;
    const payment_method = tempPaymentData.payment_method;
    const payment_date = tempPaymentData.payment_date;

    const payload = { amount, notes: notesVal, payment_method, payment_date };
    if (onUpdatePayment && await onUpdatePayment(payId, payload) === false) return;

    const targetPay = editablePayments.find(p => p.id === payId);
    const formattedDateObj = payment_date ? new Date(payment_date).toLocaleDateString('it-IT') : targetPay?.formattedDate;

    setPaymentOverrides(prev => ({
      ...prev,
      [payId]: {
        effectiveAmount: amount,
        amount,
        notes: notesVal,
        method: payment_method,
        payment_method,
        payment_date,
        rawDateForInput: payment_date,
        formattedDate: formattedDateObj
      }
    }));
    setEditingPaymentId(null);
  };

  // Computes aggregate totals for debits and discounts
  const totalDebitsSum = editableItems.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  const totalDiscountsSum = editableDiscounts.reduce((acc, curr) => acc + (Number(curr.effectiveAmount || curr.effectiveDiscount || curr.amount) || 0), 0);

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div 
        className="bg-white rounded-0 p-4 shadow border d-flex flex-column justify-content-between" 
        style={{ width: '980px', height: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Modal header with title and close button */}
          <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h5 className="m-0 fw-bold text-dark" style={{ fontSize: '15px' }}>Dettaglio — {detailModal.title}</h5>
            <button
              onClick={onClose}
              className="btn-close shadow-none"
              aria-label="Close"
            ></button>
          </div>

          <div style={{ height: '340px', overflowY: 'auto' }}>
            {detailModal.type === 'debits_and_discounts' && (
              <div className="d-flex flex-column gap-4">
                <div className="p-3 bg-light border rounded-0 d-flex justify-content-between align-items-center">
                  <span className="fw-bold text-dark" style={{ fontSize: '14px' }}>📋 Totale Debiti Complessivo:</span>
                  <span className="fw-bold text-dark fs-5">{formatCurrency(totalDebitsSum)}</span>
                </div>

                {editableDiscounts.length > 0 && (
                  <div>
                    <div className="fw-bold mb-2 text-dark" style={{ fontSize: '13px' }}>🏷️ Dettaglio Sconti Applicati</div>
                    <table className="table table-sm table-hover align-middle mb-0 border" style={{ fontSize: '13px' }}>
                      <thead className="table-light">
                        <tr style={{ height: '32px' }}>
                          <th className="py-2 px-3 text-start text-secondary fw-bold" style={{ width: '28%' }}>Cliente</th>
                          <th className="py-2 px-3 text-start text-secondary fw-bold" style={{ width: '25%' }}>Note</th>
                          <th className="py-2 px-2 text-center text-secondary fw-bold" style={{ width: '18%' }}>Data</th>
                          <th className="py-2 px-3 text-end text-secondary fw-bold" style={{ width: '15%' }}>Importo Sconto</th>
                          <th className="py-2 px-2 text-center text-secondary fw-bold" style={{ width: '14%' }}>Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableDiscounts.map((disc, idx) => {
                          const isEditing = editingDiscountId === disc.id;
                          const currentNotes = isEditing ? tempDiscountData.notes : (disc.notes || disc.note || '');
                          const currentAmount = isEditing ? tempDiscountData.amount : (disc.effectiveAmount || disc.effectiveDiscount || disc.amount);
                          const currentDate = isEditing ? tempDiscountData.payment_date : (disc.rawDateForInput || '');

                          return (
                            <tr key={disc.id || idx} style={{ height: '38px' }}>
                              <td className="py-2 px-3 fw-semibold text-dark">{disc.customerName}</td>
                              <td className="py-2 px-3">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                                    value={currentNotes}
                                    onChange={(e) => handleTempDiscountChange('notes', e.target.value)}
                                    style={{ fontSize: '12px' }}
                                  />
                                ) : (
                                  <span className="text-muted" style={{ fontSize: '12px' }}>{currentNotes || '—'}</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-center"
                                    value={currentDate}
                                    onChange={(e) => handleTempDiscountChange('payment_date', e.target.value)}
                                    style={{ fontSize: '11px', width: '130px', margin: '0 auto' }}
                                  />
                                ) : (
                                  <span className="text-secondary">{disc.formattedDate}</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-end">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-end"
                                    value={currentAmount}
                                    onChange={(e) => handleTempDiscountChange('amount', e.target.value)}
                                    style={{ fontSize: '12px', width: '90px', marginLeft: 'auto' }}
                                  />
                                ) : (
                                  <span className="fw-bold text-dark">{formatCurrency(currentAmount)}</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {disc.isSnapshot ? (
                                  <span className="badge bg-light text-secondary border rounded-0" style={{ fontSize: '10px' }}>Chiusura Anno Prec.</span>
                                ) : isEditing ? (
                                  <div className="d-flex justify-content-center gap-1">
                                    <button
                                      onClick={() => handleSaveEditDiscount(disc.id)}
                                      className="btn btn-success btn-sm rounded-0 py-1 px-2 shadow-none"
                                      title="Salva"
                                    >
                                      <i className="bi bi-check-lg"></i>
                                    </button>
                                    <button
                                      onClick={() => setEditingDiscountId(null)}
                                      className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 shadow-none"
                                      title="Annulla"
                                    >
                                      <i className="bi bi-x-lg"></i>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="d-flex justify-content-center gap-1">
                                    <button
                                      onClick={() => handleStartEditDiscount(disc)}
                                      className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 shadow-none"
                                      title="Modifica"
                                    >
                                      <i className="bi bi-pencil-fill"></i>
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {detailModal.type === 'items' && (
              <table className="table table-sm table-hover align-middle mb-0 border" style={{ fontSize: '13px' }}>
                <thead className="table-light">
                  <tr style={{ height: '32px' }}>
                    <th className="py-2 px-3 text-start text-secondary fw-bold" style={{ width: '28%' }}>Servizio / Azienda</th>
                    <th className="py-2 px-3 text-start text-secondary fw-bold" style={{ width: '25%' }}>Note</th>
                    <th className="py-2 px-2 text-center text-secondary fw-bold" style={{ width: '10%' }}>Q.tà</th>
                    <th className="py-2 px-2 text-end text-secondary fw-bold" style={{ width: '12%' }}>Prezzo Uni.</th>
                    <th className="py-2 px-3 text-end text-secondary fw-bold" style={{ width: '12%' }}>Totale</th>
                    <th className="py-2 px-2 text-center text-secondary fw-bold" style={{ width: '13%' }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {editableItems.map((item, idx) => {
                    const isEditing = editingRowId === item.id;
                    const currentNote = isEditing ? tempRowData.note : (item.note !== undefined && item.note !== null ? item.note : (item.notes || ''));
                    const currentQty = isEditing ? tempRowData.quantity : item.quantity;
                    const currentPrice = isEditing ? tempRowData.price : item.price;
                    const currentTotal = isEditing ? (Number(tempRowData.quantity || 0) * Number(tempRowData.price || 0)) : item.total;

                    return (
                      <tr key={item.id || idx} style={{ height: '38px' }}>
                        <td className="py-2 px-3">
                          <div className="fw-semibold text-dark">{item.serviceName}</div>
                          {item.customerName && <div className="text-primary" style={{ fontSize: '11px' }}>{item.customerName}</div>}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                              value={currentNote}
                              onChange={(e) => handleTempFieldChange('note', e.target.value)}
                              style={{ fontSize: '12px' }}
                            />
                          ) : (
                            <span className="text-muted" style={{ fontSize: '12px' }}>{currentNote || '—'}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isEditing ? (
                            <input
                              type="number"
                              step="any"
                              className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-center"
                              value={currentQty}
                              onChange={(e) => handleTempFieldChange('quantity', e.target.value)}
                              style={{ fontSize: '12px', width: '60px', margin: '0 auto' }}
                            />
                          ) : (
                            <span className="text-secondary">{currentQty}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-end">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-end"
                              value={currentPrice}
                              onChange={(e) => handleTempFieldChange('price', e.target.value)}
                              style={{ fontSize: '12px', width: '80px', marginLeft: 'auto' }}
                            />
                          ) : (
                            <span className="text-secondary">{formatCurrency(currentPrice)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-end fw-bold text-dark">{formatCurrency(currentTotal)}</td>
                        <td className="py-2 px-2 text-center">
                          {item.isSnapshot ? (
                            <span className="badge bg-light text-secondary border rounded-0" style={{ fontSize: '10px' }}>Chiusura Anno Prec.</span>
                          ) : isEditing ? (
                            <div className="d-flex justify-content-center gap-1">
                              <button
                                onClick={() => handleSaveEdit(item.id)}
                                className="btn btn-success btn-sm rounded-0 py-1 px-2 shadow-none"
                                title="Salva"
                              >
                                <i className="bi bi-check-lg"></i>
                              </button>
                              <button
                                onClick={() => setEditingRowId(null)}
                                className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 shadow-none"
                                title="Annulla"
                              >
                                <i className="bi bi-x-lg"></i>
                              </button>
                            </div>
                          ) : (
                            <div className="d-flex justify-content-center gap-1">
                              <button
                                onClick={() => handleStartEdit(item)}
                                className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 shadow-none"
                                title="Modifica"
                              >
                                <i className="bi bi-pencil-fill"></i>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {detailModal.type === 'payments' && (
              <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '13px' }}>
                <thead className="table-light">
                  <tr style={{ height: '32px' }}>
                    <th className="py-2 px-3 text-start text-secondary fw-bold" style={{ width: '28%' }}>Cliente / Pagante</th>
                    <th className="py-2 px-3 text-start text-secondary fw-bold" style={{ width: '25%' }}>Metodo / Note</th>
                    <th className="py-2 px-2 text-center text-secondary fw-bold" style={{ width: '15%' }}>Data Pag.</th>
                    <th className="py-2 px-3 text-end text-secondary fw-bold" style={{ width: '15%' }}>Importo</th>
                    <th className="py-2 px-2 text-center text-secondary fw-bold" style={{ width: '17%' }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {editablePayments.map((p, idx) => {
                    const isEditing = editingPaymentId === p.id;
                    const currentNotes = isEditing ? tempPaymentData.notes : (p.notes || p.note || '');
                    const currentMethod = isEditing ? tempPaymentData.payment_method : (p.method || p.payment_method || 'ELETTRONICO');
                    const currentAmount = isEditing ? tempPaymentData.amount : (p.effectiveAmount || p.effectiveDiscount || p.amount);
                    const currentDate = isEditing ? tempPaymentData.payment_date : (p.rawDateForInput || '');

                    return (
                      <tr key={p.id || idx} style={{ height: '38px' }}>
                        <td className="py-2 px-3 fw-semibold text-dark">
                          {p.customerName}
                          {p.isDuplicateFromCurrentYear && (
                            <span className="ms-2 badge bg-light text-secondary border rounded-0" style={{ fontSize: '10px' }}>
                              Incasso Anno Corrente
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <div className="d-flex flex-column gap-1">
                              <select
                                className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle"
                                value={currentMethod}
                                onChange={(e) => handleTempPaymentChange('payment_method', e.target.value)}
                                style={{ fontSize: '11px' }}
                              >
                                <option value="ELETTRONICO">ELETTRONICO</option>
                                <option value="CONTANTI">CONTANTI</option>
                              </select>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle"
                                value={currentNotes}
                                onChange={(e) => handleTempPaymentChange('notes', e.target.value)}
                                placeholder="Note..."
                                style={{ fontSize: '11px' }}
                              />
                            </div>
                          ) : (
                            <span className="text-muted" style={{ fontSize: '12px' }}>
                              {currentMethod} {currentNotes ? `(${currentNotes})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {isEditing ? (
                            <input
                              type="date"
                              className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-center"
                              value={currentDate}
                              onChange={(e) => handleTempPaymentChange('payment_date', e.target.value)}
                              style={{ fontSize: '11px', width: '130px', margin: '0 auto' }}
                            />
                          ) : (
                            <span className="text-secondary">{p.formattedDate}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-end">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-end"
                              value={currentAmount}
                              onChange={(e) => handleTempPaymentChange('amount', e.target.value)}
                              style={{ fontSize: '12px', width: '90px', marginLeft: 'auto' }}
                            />
                          ) : (
                            <span className="fw-bold text-dark">{formatCurrency(currentAmount)}</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {p.isSnapshot ? (
                            <span className="badge bg-light text-secondary border rounded-0" style={{ fontSize: '10px' }}>Chiusura Anno Prec.</span>
                          ) : isEditing ? (
                            <div className="d-flex justify-content-center gap-1">
                              <button
                                onClick={() => handleSaveEditPayment(p.id)}
                                className="btn btn-success btn-sm rounded-0 py-1 px-2 shadow-none"
                                title="Salva"
                              >
                                <i className="bi bi-check-lg"></i>
                              </button>
                              <button
                                onClick={() => setEditingPaymentId(null)}
                                className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 shadow-none"
                                title="Annulla"
                              >
                                <i className="bi bi-x-lg"></i>
                              </button>
                            </div>
                          ) : (
                            <div className="d-flex justify-content-center gap-1">
                              <button
                                onClick={() => handleStartEditPayment(p)}
                                className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 shadow-none"
                                title="Modifica"
                              >
                                <i className="bi bi-pencil-fill"></i>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal footer showing summary totals depending on view type */}
        <div className="d-flex justify-content-between align-items-center pt-3 border-top fw-bold text-dark flex-wrap gap-2" style={{ fontSize: '13px' }}>
          {detailModal.type === 'debits_and_discounts' ? (
            <div className="d-flex gap-4 flex-wrap">
              <span>Totale Debiti: <span className="text-danger ms-1">{formatCurrency(totalDebitsSum)}</span></span>
              <span>Totale Sconti: <span className="text-dark ms-1">{formatCurrency(totalDiscountsSum)}</span></span>
            </div>
          ) : detailModal.type === 'payments' ? (
            <div className="d-flex gap-4 flex-wrap">
              <span>Totale Incassi: <span className="text-success ms-1">
                {formatCurrency(editablePayments.reduce((acc, curr) => acc + (Number(curr.effectiveAmount || curr.effectiveDiscount || curr.amount) || 0), 0))}
              </span></span>
            </div>
          ) : (
            <span>Totale Complessivo: <span className="text-danger ms-2">{formatCurrency(totalDebitsSum)}</span></span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ElaborazioniDetailModal;