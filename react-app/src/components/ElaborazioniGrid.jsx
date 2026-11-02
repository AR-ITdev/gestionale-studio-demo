// src/components/ElaborazioniGrid.jsx
import { useState, useMemo } from 'react';
import { ElaborazioniDetailModal } from './ElaborazioniDetailModal';
import { PagamentiFormModal } from './PagamentiFormModal';
import { ElaborazioniExportModal } from './ElaborazioniExportModal';

/**
 * Predefined macro areas used for categorizing services and financial summaries.
 */
const MACRO_AREAS = [
  { id: 'CONTABILITA', name: 'Contabilità', color: 'bg-light text-dark', customBg: '#f0f7ff', accent: '#3b82f6' },
  { id: 'REDDITI', name: 'Redditi', color: 'bg-light text-dark', customBg: '#f0fdf4', accent: '#22c55e' },
  { id: 'PAGHE', name: 'Paghe', color: 'bg-light text-dark', customBg: '#fffbeb', accent: '#f59e0b' },
  { id: 'VARIE', name: 'Varie', color: 'bg-light text-dark', customBg: '#f9fafb', accent: '#6b7280' }
];

/**
 * Formats numeric amounts into currency strings with custom signs and color classes if needed.
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
 * ElaborazioniGrid component renders the main grid view for processing items,
 * grouped by macro areas, months, and filtered by customer or company groups.
 */
export const ElaborazioniGrid = ({
  items = [],
  services = [],
  customers = [],
  payments = [],
  transactions = [],
  backendAggregated = null,
  yearlyBalancesMap = {},
  customersSummary = {},
  selectedYear,
  selectedFilterValue,
  onSavePayment,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  onUpdatePayment,
  onDeletePayment,
  showAlert,
  loading = false
}) => {
  // State management for payment creation modal and form target
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentDefaultTarget, setPaymentDefaultTarget] = useState('');

  // State management for export modal and context data payload
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalData, setExportModalData] = useState({
    customers: [],
    contextLabel: '',
    contextIdentifier: ''
  });

  const year = Number(selectedYear) || new Date().getFullYear();
  const prevYearNum = year - 1;

  // Memoized months array configuration for table columns
  const MONTHS = useMemo(() => {
    return [
      { key: '01', monthNum: 1, label: 'Gen' },
      { key: '02', monthNum: 2, label: 'Feb' },
      { key: '03', monthNum: 3, label: 'Mar' },
      { key: '04', monthNum: 4, label: 'Apr' },
      { key: '05', monthNum: 5, label: 'Mag' },
      { key: '06', monthNum: 6, label: 'Giu' },
      { key: '07', monthNum: 7, label: 'Lug' },
      { key: '08', monthNum: 8, label: 'Ago' },
      { key: '09', monthNum: 9, label: 'Set' },
      { key: '10', monthNum: 10, label: 'Ott' },
      { key: '11', monthNum: 11, label: 'Nov' },
      { key: '12', monthNum: 12, label: 'Dic' }
    ];
  }, []);

  // State configuration for details drill-down modal
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    title: '',
    type: 'items',
    items: [],
    payments: [],
    discounts: [],
    category: null,
    monthKey: null,
    monthNum: null,
    targetCustomerId: null
  });

  // Memoized calculation for filtering context based on selection (ALL, PARENT, or CUSTOMER)
  const filteredContext = useMemo(() => {
    if (!selectedFilterValue || selectedFilterValue === 'ALL') {
      return { type: 'ALL', targetCustomerIds: [], targetParents: [] };
    }

    if (selectedFilterValue.startsWith('PARENT:')) {
      const parentCode = selectedFilterValue.replace('PARENT:', '');
      const childIds = customers
        .filter(c => c.parent_code === parentCode)
        .map(c => Number(c.id));
      return { type: 'PARENT', targetCustomerIds: childIds, targetParents: [parentCode] };
    }

    const customerId = Number(selectedFilterValue);
    const matchedCust = customers.find(c => Number(c.id) === customerId);
    return {
      type: 'CUSTOMERS',
      targetCustomerIds: matchedCust ? [customerId] : [],
      matchingCustomers: matchedCust ? [matchedCust] : []
    };
  }, [selectedFilterValue, customers]);

  // Handler to open the payment creation modal
  const handleOpenAddPayment = (specificTargetName = '') => {
    setPaymentDefaultTarget(specificTargetName);
    setIsPaymentModalOpen(true);
  };

  // Handler to close the payment creation modal
  const handleClosePaymentModal = () => {
    setIsPaymentModalOpen(false);
    setPaymentDefaultTarget('');
  };

  // Handler to save payment data through props callback
  const handleSavePaymentData = async (paymentPayload) => {
    if (onSavePayment && await onSavePayment(paymentPayload) === false) return false;
    handleClosePaymentModal();
    return true;
  };

  // Handler to open export modal for a single customer view
  const handleOpenExportSingleCustomer = (customerObj, tableTitle) => {
    setExportModalData({
      customers: [customerObj],
      contextLabel: tableTitle,
      contextIdentifier: customerObj.customer_code || customerObj.name || 'Cliente'
    });
    setIsExportModalOpen(true);
  };

  // Handler to open export modal for general or group view
  const handleOpenExportGeneral = () => {
    const targetCusts = filteredContext.type === 'PARENT'
      ? customers.filter(c => filteredContext.targetParents.includes(c.parent_code))
      : filteredContext.type === 'CUSTOMERS'
      ? filteredContext.matchingCustomers
      : customers;

    let generalContextLabel = 'Riepilogo Generale (Tutti i Clienti)';
    let generalContextIdentifier = 'Riepilogo_Generale';

    if (filteredContext.type === 'PARENT') {
      const pCode = selectedFilterValue?.replace('PARENT:', '') || '';
      generalContextLabel = `Gruppo Aziendale / Padre: ${pCode}`;
      generalContextIdentifier = `Gruppo_${pCode}`;
    }

    setExportModalData({
      customers: targetCusts,
      contextLabel: generalContextLabel,
      contextIdentifier: generalContextIdentifier
    });
    setIsExportModalOpen(true);
  };

  // Wrapped actions for item and payment modifications
  const wrappedUpdateItem = async (itemId, updatedFields) => {
    if (onUpdateItem) return await onUpdateItem(itemId, updatedFields);
  };

  const wrappedDeleteItem = async (itemId) => {
    if (onDeleteItem) return await onDeleteItem(itemId);
  };

  const wrappedAddItem = async (payload) => {
    if (onAddItem) return await onAddItem(payload);
  };

  const wrappedUpdatePayment = async (paymentId, payload) => {
    if (onUpdatePayment) return await onUpdatePayment(paymentId, payload);
  };

  const wrappedDeletePayment = async (paymentId) => {
    if (onDeletePayment) return await onDeletePayment(paymentId);
  };

  /**
   * Renders an individual financial table per customer or general view.
   */
  const renderSingleTable = (targetCustomerIds, tableTitle = null, tableTargetName = '', customerObj = null) => {
    const cellDetailsMap = {};
    const paymentsDetailsMap = {};
    const discountsDetailsMap = {};
    const singleCustId = targetCustomerIds.length === 1 ? targetCustomerIds[0] : null;

    paymentsDetailsMap['00'] = [];
    discountsDetailsMap['00'] = [];

    MONTHS.forEach(m => {
      paymentsDetailsMap[m.key] = [];
      discountsDetailsMap[m.key] = [];
    });

    // Process and map item details matching target customer IDs and years
    items.forEach((item) => {
      if (targetCustomerIds.length > 0 && !targetCustomerIds.includes(Number(item.customer_id))) return;

      const service = services.find((s) => Number(s.id) === Number(item.service_id));
      if (!service) return;

      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const total = quantity * price;
      if (quantity <= 0 || total <= 0) return;

      const category = service.category;
      const itemYear = Number(item.year);
      const itemMonth = Number(item.month);

      let monthKey = null;
      if (itemYear === Number(year) && !isNaN(itemMonth) && itemMonth >= 1 && itemMonth <= 12) {
        monthKey = String(itemMonth).padStart(2, '0');
      } else if (itemYear === Number(prevYearNum)) {
        monthKey = '00';
      }

      if (!monthKey) return;

      const key = `${category}_${monthKey}`;
      if (!cellDetailsMap[key]) cellDetailsMap[key] = [];

      let noteVal = item.note || item.notes || '';
      const itemCustomer = customers.find(c => Number(c.id) === Number(item.customer_id));

      cellDetailsMap[key].push({
        ...item,
        serviceName: service.subcategory || service.name || 'Servizio',
        customerName: itemCustomer?.name || '',
        note: noteVal,
        notes: noteVal,
        quantity,
        price,
        total,
        category: service.category
      });
    });

    const clientData = singleCustId 
      ? (customersSummary?.[singleCustId] || customersSummary?.[String(singleCustId)] || null)
      : null;

    /**
     * Helper function to resolve cell amounts by period key and category.
     */
/**
     * Helper function to resolve cell amounts by period key and category.
     */
    const getCellByPeriod = (category, periodKey) => {
      const catKey = String(category || '').toUpperCase();

      if (clientData) {
        return Number(clientData?.periods?.[periodKey]?.[catKey] || 0);
      }
      
      if (periodKey === "00") {
        if (singleCustId) {
          const cellItems = cellDetailsMap[`${catKey}_00`] || [];
          return cellItems.reduce((sum, item) => sum + item.total, 0);
        }
        return Number(backendAggregated?.previousYearMacroAreas?.[catKey] || 0);
      }
      
      if (!singleCustId && backendAggregated?.macroAreasSummary?.[catKey]?.[periodKey] !== undefined) {
        return Number(backendAggregated.macroAreasSummary[catKey][periodKey]);
      }

      const cellItems = cellDetailsMap[`${catKey}_${periodKey}`] || [];
      return cellItems.reduce((sum, item) => sum + item.total, 0);
    };

    const getPrevYearCellValue = (category) => getCellByPeriod(category, "00");

    let prevYearTotalDebits = 0;
    MACRO_AREAS.forEach((area) => {
      prevYearTotalDebits += getPrevYearCellValue(area.id);
    });

let prevYearDiscounts = clientData?.periods?.["00"]?.discount !== undefined
      ? Number(clientData.periods["00"].discount)
      : (singleCustId 
          ? (discountsDetailsMap["00"] || []).reduce((sum, p) => sum + Number(p.effectiveDiscount || p.discount || 0), 0)
          : Number(backendAggregated?.previousYearDiscounts || 0));

    let prevYearIncassi = clientData?.periods?.["00"]?.payment !== undefined
      ? Number(clientData.periods["00"].payment)
      : (singleCustId 
          ? (paymentsDetailsMap["00"] || []).reduce((sum, p) => sum + Number(p.effectiveAmount || p.amount || 0), 0)
          : Number(backendAggregated?.previousYearPayments || 0));

    /**
     * Retrieve previous year balance correctly checking yearlyBalancesMap, clientData, or backendAggregated root properties.
     */
const prevYearSaldo = (() => {
  // Se stiamo renderizzando una tabella per un singolo cliente/figlio:
  if (singleCustId) {
    // 1. Controlla prima nei dati specifici del cliente (customersSummary)
    if (clientData?.previousYearBalance !== undefined) return Number(clientData.previousYearBalance);
    if (clientData?.periods?.["00"]?.balance !== undefined) return Number(clientData.periods["00"].balance);

    // 2. Controlla nella mappa annuale filtrando per ID
    const mapToUse = yearlyBalancesMap && Object.keys(yearlyBalancesMap).length > 0 
      ? yearlyBalancesMap 
      : (backendAggregated?.yearlyBalancesMap || {});

    const previousRecord = mapToUse?.[singleCustId] || mapToUse?.[String(singleCustId)];
    if (Number(previousRecord?.year) === prevYearNum && previousRecord.balance !== undefined) {
      return Number(previousRecord.balance);
    }

    // 3. Se non ha un bilancio salvato, calcolalo dai movimenti specifici di questo cliente
    const netDebt = prevYearTotalDebits - prevYearDiscounts;
    return prevYearIncassi - netDebt;
  }

  // Altrimenti (se è il riepilogo generale di tutto il sistema), usa i totali aggregati globali:
  if (backendAggregated?.previousYearBalance !== undefined) {
    return Number(backendAggregated.previousYearBalance);
  }
  if (backendAggregated?.aggregated?.previousYearBalance !== undefined) {
    return Number(backendAggregated.aggregated.previousYearBalance);
  }
  if (backendAggregated?.balance !== undefined) {
    return Number(backendAggregated.balance);
  }

  return 0;
})();

    const hasAnyPrevYearDiscount = prevYearDiscounts > 0;

    const totalsByMonth = {};
    MONTHS.forEach((m) => {
      let sum = 0;
      MACRO_AREAS.forEach((area) => { sum += getCellByPeriod(area.id, m.key); });
      totalsByMonth[m.key] = sum;
    });

    const paymentsByMonth = {};
    const discountsByMonth = {};

    MONTHS.forEach(m => {
      paymentsByMonth[m.key] = 0;
      discountsByMonth[m.key] = 0;
    });

    // Process payment records and group them by month or previous year period
    payments.forEach(p => {
      const payerId = Number(p.payer_customer_id || p.customer_id || 0);
      if (targetCustomerIds.length > 0 && payerId > 0 && !targetCustomerIds.includes(payerId)) return;

      const rawDate = p.payment_date || p.date || p.created_at;
      if (!rawDate) return;

      let paymentDate;
      if (typeof rawDate === 'string' && rawDate.includes('/')) {
        const parts = rawDate.split('/');
        if (parts.length === 3) {
          paymentDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
      }
      if (!paymentDate) {
        paymentDate = new Date(rawDate);
      }

      if (isNaN(paymentDate.getTime())) return;

      const pYear = paymentDate.getFullYear();
      const amount = Number(p.amount || p.total || 0);
      const discount = Number(p.discount || p.sconto || 0);
      const method = String(p.payment_method || '').trim().toUpperCase();

      const paymentCustomer = customers.find(c => Number(c.id) === payerId);
      const enrichedPayment = {
        ...p,
        customerName: paymentCustomer?.name || 'Cliente',
        formattedDate: paymentDate.toLocaleDateString('it-IT'),
        effectiveAmount: amount,
        effectiveDiscount: discount,
        method
      };

      if (pYear === Number(year)) {
        const targetKey = String(paymentDate.getMonth() + 1).padStart(2, '0');
        if (method === 'SCONTO') {
          const discountVal = amount > 0 ? amount : discount;
          if (discountVal > 0) {
            discountsByMonth[targetKey] = (discountsByMonth[targetKey] || 0) + discountVal;
            discountsDetailsMap[targetKey].push(enrichedPayment);
          }
        } else {
          if (amount > 0) {
            paymentsByMonth[targetKey] = (paymentsByMonth[targetKey] || 0) + amount;
            paymentsDetailsMap[targetKey].push(enrichedPayment);
          }
          if (discount > 0) {
            discountsByMonth[targetKey] = (discountsByMonth[targetKey] || 0) + discount;
            discountsDetailsMap[targetKey].push(enrichedPayment);
          }
        }
      } else if (pYear === Number(prevYearNum)) {
        const targetKey = "00";
        if (method === 'SCONTO') {
          const discountVal = amount > 0 ? amount : discount;
          if (discountVal > 0) {
            discountsDetailsMap[targetKey].push(enrichedPayment);
          }
        } else {
          if (amount > 0) {
            paymentsDetailsMap[targetKey].push(enrichedPayment);
          }
          if (discount > 0) {
            discountsDetailsMap[targetKey].push(enrichedPayment);
          }
        }
      }
    });

    MONTHS.forEach(m => {
      if (clientData?.periods?.[m.key]) {
        const pVal = Number(clientData.periods[m.key].payment || 0);
        const dVal = Number(clientData.periods[m.key].discount || 0);
        if (pVal > 0) paymentsByMonth[m.key] = pVal;
        if (dVal > 0) discountsByMonth[m.key] = dVal;
      } else if (backendAggregated?.paymentsSummary?.[m.key]?.total > 0 && !singleCustId) {
        paymentsByMonth[m.key] = backendAggregated.paymentsSummary[m.key].total;
      }
    });

    /**
     * Calculate running balance per month starting from prevYearSaldo through December progression.
     */
    const saldoByMonth = {};
    let runningBalance = prevYearSaldo;

    MONTHS.forEach((m) => {
      const monthDebt = totalsByMonth[m.key] || 0;
      const monthDisc = discountsByMonth[m.key] || 0;
      const monthIncassi = paymentsByMonth[m.key] || 0;
      const netDebt = monthDebt - monthDisc;

      runningBalance = runningBalance + monthIncassi - netDebt;
      saldoByMonth[m.key] = runningBalance;
    });

    const hasAnyDiscount = MONTHS.some(m => (discountsByMonth[m.key] || 0) > 0);

    // Event handler when clicking a specific macro area cell to view detail modal
    const handleMacroAreaCellClick = (area, periodKey, periodLabel) => {
      const key = `${area.id}_${periodKey}`;
      const cellItems = cellDetailsMap[key] || [];
      const val = getCellByPeriod(area.id, periodKey);

      if (val <= 0 && cellItems.length === 0) return;

      setDetailModal({
        isOpen: true,
        title: `${tableTitle ? tableTitle + ' — ' : ''}${area.name} (${periodLabel})`,
        type: 'items',
        items: cellItems,
        payments: [],
        discounts: [],
        category: area.id,
        monthKey: periodKey,
        targetCustomerId: singleCustId
      });
    };

    // Event handler when clicking debits summary cell
    const handleDebitsCellClick = (periodKey, periodLabel) => {
      const allPeriodItems = [];
      MACRO_AREAS.forEach(area => {
        const itemsForArea = cellDetailsMap[`${area.id}_${periodKey}`] || [];
        allPeriodItems.push(...itemsForArea);
      });

      const periodDiscounts = discountsDetailsMap[periodKey] || [];
      const totalPeriodDebt = periodKey === '00' ? prevYearTotalDebits : (totalsByMonth[periodKey] || 0);
      const totalPeriodDisc = periodKey === '00' ? prevYearDiscounts : (discountsByMonth[periodKey] || 0);

      if (totalPeriodDebt <= 0 && totalPeriodDisc <= 0 && allPeriodItems.length === 0 && periodDiscounts.length === 0) return;

      setDetailModal({
        isOpen: true,
        title: `${tableTitle ? tableTitle + ' — ' : ''}Debiti e Sconti (${periodLabel})`,
        type: 'debits_and_discounts',
        items: allPeriodItems,
        discounts: periodDiscounts,
        payments: [],
        category: 'DEBITI',
        monthKey: periodKey,
        targetCustomerId: singleCustId
      });
    };

    // Event handler when clicking payments summary cell
    const handlePaymentsCellClick = (periodKey, periodLabel) => {
      const periodPayments = paymentsDetailsMap[periodKey] || [];
      const totalPeriodIncassi = periodKey === '00' ? prevYearIncassi : (paymentsByMonth[periodKey] || 0);

      if (totalPeriodIncassi <= 0 && periodPayments.length === 0) return;

      setDetailModal({
        isOpen: true,
        title: `${tableTitle ? tableTitle + ' — ' : ''}Totale Incassi (${periodLabel})`,
        type: 'payments',
        items: [],
        discounts: [],
        payments: periodPayments,
        category: 'INCASSI',
        monthKey: periodKey,
        targetCustomerId: singleCustId
      });
    };

    return (
      <div key={tableTitle || 'general'} className="card border shadow-sm rounded-0 bg-white mb-2">
        <div className="card-header bg-light py-1 px-2 d-flex align-items-center justify-content-between flex-wrap gap-2 border-bottom rounded-0">
          <div className="fw-semibold text-dark ps-2 border-start border-primary border-3 text-truncate" style={{ fontSize: '12px' }}>
            {tableTitle || 'Riepilogo Generale (Tutti i Clienti)'}
          </div>
          <div className="d-flex align-items-center gap-1">
            <button
              onClick={() => handleOpenAddPayment(tableTargetName)}
              className="btn btn-outline-primary btn-sm rounded-0 py-0 px-2 fw-semibold shadow-none"
              style={{ fontSize: '11px', height: '24px' }}
            >
              ➕ Aggiungi Pagamento
            </button>
            {customerObj ? (
              <button
                onClick={() => handleOpenExportSingleCustomer(customerObj, tableTitle)}
                className="btn btn-outline-success btn-sm rounded-0 py-0 px-2 fw-semibold shadow-none"
                style={{ fontSize: '11px', height: '24px' }}
              >
                📥 Esporta (Excel)
              </button>
            ) : (
              <button
                onClick={handleOpenExportGeneral}
                className="btn btn-outline-success btn-sm rounded-0 py-0 px-2 fw-semibold shadow-none"
                style={{ fontSize: '11px', height: '24px' }}
              >
                📥 Esporta (Excel)
              </button>
            )}
          </div>
        </div>

        <div className="card-body p-0">
          <table className="table table-bordered table-sm mb-0 align-middle" style={{ fontSize: '11px', tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '120px' }} />
              <col style={{ width: '75px' }} />
              {MONTHS.map((m) => (<col key={m.key} style={{ width: '70px' }} />))}
            </colgroup>
            <thead className="table-light border-bottom text-uppercase" style={{ fontSize: '10.5px' }}>
              <tr style={{ height: '30px' }}>
                <th className="py-1 px-2 text-start text-secondary fw-bold border-end text-truncate">Macro Area</th>
                <th className="py-1 px-1 text-center text-secondary fw-bold text-nowrap border-end">{prevYearNum}</th>
                {MONTHS.map((m) => (
                  <th key={m.key} className="py-1 px-1 text-center text-secondary fw-bold text-nowrap border-end">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MACRO_AREAS.map((area) => {
                const prevVal = getPrevYearCellValue(area.id);

                return (
                  <tr key={area.id} style={{ height: '30px' }}>
                    <td style={{ backgroundColor: area.customBg, borderLeft: `4px solid ${area.accent}` }} className="py-1 px-2 fw-semibold text-dark text-truncate border-end">
                      {area.name}
                    </td>
                    <td
                      style={{ cursor: 'default', fontWeight: prevVal > 0 ? '600' : 'normal', color: prevVal > 0 ? '#374151' : '#9ca3af' }}
                      className="py-1 px-1 text-end text-nowrap border-end"
                    >
                      {prevVal > 0 ? formatCurrency(prevVal) : '—'}
                    </td>
                    {MONTHS.map((m) => {
                      const val = getCellByPeriod(area.id, m.key);
                      return (
                        <td
                          key={m.key}
                          onClick={() => val > 0 && handleMacroAreaCellClick(area, m.key, m.label)}
                          onMouseEnter={(e) => { if (val > 0) e.currentTarget.style.backgroundColor = '#eef2ff'; }}
                          onMouseLeave={(e) => { if (val > 0) e.currentTarget.style.backgroundColor = 'transparent'; }}
                          style={{ 
                            cursor: val > 0 ? 'pointer' : 'default', 
                            fontWeight: val > 0 ? '600' : 'normal', 
                            color: val > 0 ? '#2563eb' : '#9ca3af', 
                            transition: val > 0 ? 'background-color 0.15s ease-in-out' : 'none' 
                          }}
                          className="py-1 px-1 text-end text-nowrap border-end"
                        >
                          {val > 0 ? formatCurrency(val) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {(() => {
                return (
                  <tr style={{ height: (hasAnyDiscount || hasAnyPrevYearDiscount) ? '38px' : '30px' }}>
                    <td className="py-1 px-2 text-danger text-truncate align-middle border-end">
                      <div className="fw-bold">Tot. Debiti</div>
                      {(hasAnyDiscount || hasAnyPrevYearDiscount) && <div className="fw-bold" style={{ fontSize: '9.5px', color: '#b45309' }}>Sconto</div>}
                    </td>
                    <td
                      style={{ cursor: 'default' }}
                      className="py-1 px-1 text-end text-nowrap align-middle border-end"
                    >
                      <div className="text-danger fw-bold">{prevYearTotalDebits > 0 ? formatCurrency(prevYearTotalDebits) : '—'}</div>
                      {hasAnyPrevYearDiscount && <div className="fw-bold" style={{ fontSize: '9.5px', color: '#b45309' }}>{prevYearDiscounts > 0 ? formatCurrency(prevYearDiscounts) : '—'}</div>}
                    </td>
                    {MONTHS.map((m) => {
                      const val = totalsByMonth[m.key] || 0;
                      const discVal = discountsByMonth[m.key] || 0;
                      const hasData = val > 0 || discVal > 0;
                      return (
                        <td
                          key={m.key}
                          onClick={() => hasData && handleDebitsCellClick(m.key, m.label)}
                          onMouseEnter={(e) => { if (hasData) e.currentTarget.style.backgroundColor = '#fff5f5'; }}
                          onMouseLeave={(e) => { if (hasData) e.currentTarget.style.backgroundColor = 'transparent'; }}
                          style={{ 
                            cursor: hasData ? 'pointer' : 'default', 
                            transition: hasData ? 'background-color 0.15s ease-in-out' : 'none' 
                          }}
                          className="py-1 px-1 text-end text-nowrap align-middle border-end"
                        >
                          <div className="text-danger fw-bold">{val > 0 ? formatCurrency(val) : '—'}</div>
                          {hasAnyDiscount && <div className="fw-bold" style={{ fontSize: '9.5px', color: '#b45309' }}>{discVal > 0 ? formatCurrency(discVal) : '—'}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              {(() => {
                return (
                  <tr style={{ height: '30px' }}>
                    <td className="py-1 px-2 text-truncate align-middle border-end">
                      <div className="fw-bold text-success">Tot. Incassi</div>
                    </td>
                    <td
                      style={{ cursor: 'default' }}
                      className="py-1 px-1 text-end text-nowrap align-middle border-end"
                    >
                      <div className="fw-bold text-success">{prevYearIncassi > 0 ? formatCurrency(prevYearIncassi) : '—'}</div>
                    </td>
                    {MONTHS.map((m) => {
                      const incassoVal = paymentsByMonth[m.key] || 0;
                      return (
                        <td
                          key={m.key}
                          onClick={() => incassoVal > 0 && handlePaymentsCellClick(m.key, m.label)}
                          onMouseEnter={(e) => { if (incassoVal > 0) e.currentTarget.style.backgroundColor = '#f0fdf4'; }}
                          onMouseLeave={(e) => { if (incassoVal > 0) e.currentTarget.style.backgroundColor = 'transparent'; }}
                          style={{ 
                            cursor: incassoVal > 0 ? 'pointer' : 'default', 
                            transition: incassoVal > 0 ? 'background-color 0.15s ease-in-out' : 'none' 
                          }}
                          className="py-1 px-1 text-end text-nowrap border-end"
                        >
                          <div className="fw-bold text-success">{incassoVal > 0 ? formatCurrency(incassoVal) : '—'}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })()}

              <tr className="fw-bold" style={{ height: '30px' }}>
                <td className="py-1 px-2 text-dark text-truncate align-middle border-end">Saldo</td>
                {(() => {
                  const isNegative = prevYearSaldo < 0;
                  return (
                    <td key="prev-saldo" style={{ backgroundColor: isNegative ? '#f8d7da' : '#d1e7dd', cursor: 'default' }} className="py-1 px-1 text-end text-nowrap align-middle text-dark border-end">
                      <div>{formatCurrency(prevYearSaldo, isNegative ? '-' : '+', 'text-dark')}</div>
                    </td>
                  );
                })()}
                {MONTHS.map((m) => {
                  const saldoVal = saldoByMonth[m.key] || 0;
                  const isNegative = saldoVal < 0;
                  return (
                    <td key={m.key} style={{ backgroundColor: isNegative ? '#f8d7da' : '#d1e7dd' }} className="py-1 px-1 text-end text-nowrap align-middle text-dark border-end">
                      <div>{formatCurrency(saldoVal, isNegative ? '-' : '+', 'text-dark')}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="h-custom-calc d-flex flex-column gap-1 overflow-hidden py-2 bg-light grow" style={{ boxSizing: 'border-box' }}>
      {loading && (
        <div className="position-absolute top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center bg-white bg-opacity-75" style={{ zIndex: 10 }}>
          <div className="spinner-border text-primary spinner-border-sm" role="status">
            <span className="visually-hidden">Caricamento in corso...</span>
          </div>
        </div>
      )}

      <div className="grow overflow-auto min-vh-0 d-flex flex-column gap-2 pe-1">
        {filteredContext.type === 'PARENT' ? (
          filteredContext.targetCustomerIds.length > 0 ? (
            customers
              .filter(c => filteredContext.targetParents.includes(c.parent_code))
              .map((child) => renderSingleTable([Number(child.id)], `Azienda Figlia: ${child.name} [${child.customer_code || ''}]`, child.name, child))
          ) : <div className="p-3 text-center text-muted bg-white border rounded-0 shadow-sm" style={{ fontSize: '13px' }}>Nessuna azienda trovata.</div>
        ) : filteredContext.type === 'CUSTOMERS' ? (
          filteredContext.matchingCustomers.length > 0 ? (
            filteredContext.matchingCustomers.map((cust) => renderSingleTable([Number(cust.id)], `Cliente: ${cust.name} [${cust.customer_code || ''}]`, cust.name, cust))
          ) : <div className="p-3 text-center text-muted bg-white border rounded-0 shadow-sm" style={{ fontSize: '13px' }}>Nessun cliente trovato.</div>
        ) : (
          renderSingleTable([], 'Riepilogo Generale (Tutti le Aziende/Clienti)', '', null)
        )}
      </div>

      <ElaborazioniDetailModal
        detailModal={detailModal}
        onClose={() => setDetailModal({ isOpen: false, title: '', type: 'items', items: [], payments: [], discounts: [] })}
        currentYear={year}
        services={services}
        customers={customers}
        onUpdateItem={wrappedUpdateItem}
        onDeleteItem={wrappedDeleteItem}
        onAddItem={wrappedAddItem}
        onUpdatePayment={wrappedUpdatePayment}
        onDeletePayment={wrappedDeletePayment}
      />

      <PagamentiFormModal
        showAlert={showAlert}
        isOpen={isPaymentModalOpen}
        onClose={handleClosePaymentModal}
        onSave={handleSavePaymentData}
        editingPayment={null}
        allCustomers={customers}
        defaultCustomerName={paymentDefaultTarget}
      />

      <ElaborazioniExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExportComplete={() => showAlert?.('Esportazione Excel completata.', 'success')}
        onExportError={() => showAlert?.("Errore durante l'esportazione Excel.", 'danger')}
        onNoRecords={() => showAlert?.('Non ci sono record da esportare per la selezione corrente.', 'danger')}
        exportData={{
          customers: exportModalData.customers,
          items,
          services,
          payments,
          transactions,
          customersSummary,
          backendAggregated,
          currentYear: year,
          previousYear: prevYearNum,
          contextLabel: exportModalData.contextLabel,
          contextIdentifier: exportModalData.contextIdentifier
        }}
      />
    </div>
  );
};

export default ElaborazioniGrid;