// src/components/ReportGrid.jsx
import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Format numeric amount into localized currency string representation with custom or automatic sign.
 */
const formatCurrency = (amount, customSign = null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '€ 0,00';
  const num = Number(amount);
  const absVal = Math.abs(num);
  const fixed = absVal.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  let signPrefix = '';
  if (customSign) signPrefix = customSign;
  else if (num < 0) signPrefix = '-';

  return `€ ${signPrefix}${formattedInteger},${decimalPart}`;
};

// Module-level in-memory variables to persist sorting and zero-balance filter
// during SPA navigation (cleared only on F5, no localStorage).
let inMemorySortConfig = {
  field: 'balance',
  direction: 'asc'
};
let inMemoryShowZeroBalance = false;

/**
 * ReportGrid component manages the insolvency and pending collections analysis view,
 * offering color-coded risk assessment status, sorting, zero-balance toggling, and pagination.
 */
export const ReportGrid = ({
  reportData = [], // Può essere l'array diretto, l'oggetto strutturato { analysisYear, data }, o l'hook di stato
  customers = [],
  loading = false
}) => {
  const navigate = useNavigate();

  const [sortConfig, setSortConfig] = useState(inMemorySortConfig);
  const [showZeroBalance, setShowZeroBalance] = useState(inMemoryShowZeroBalance);
  const [rowsPerPage, setRowsPerPage] = useState(500);
  const [currentPage, setCurrentPage] = useState(1);

  // Estrae in modo sicuro l'anno di analisi e l'effettivo array di dati gestendo tutte le possibili strutture
  const { analysisYear, actualReportData } = useMemo(() => {
    // Se reportData è un oggetto wrapper proveniente dall'API: { analysisYear: 2026, data: [...] }
    if (reportData && !Array.isArray(reportData)) {
      const resolvedYear = reportData.analysisYear || reportData.year;
      const resolvedData = reportData.data || [];
      
      return {
        analysisYear: Number(resolvedYear) || new Date().getFullYear(),
        actualReportData: Array.isArray(resolvedData) ? resolvedData : []
      };
    }
    
    // Fallback se reportData è direttamente un array
    return {
      analysisYear: new Date().getFullYear(),
      actualReportData: Array.isArray(reportData) ? reportData : []
    };
  }, [reportData]);

  // Create a fast lookup map for customer records by ID
  const customerMap = useMemo(() => {
    const map = {};
    customers.forEach(c => {
      map[Number(c.id)] = c;
    });
    return map;
  }, [customers]);

  // Helper to compute risk and status indicators for each customer report row (memoized with useCallback)
  const getRowStatuses = useCallback((row) => {
    const finalBalance = Number(row.balance || 0);
    const absBalance = Math.abs(finalBalance);

    let paymentYear = null;
    if (row.lastPaymentRaw) {
      paymentYear = new Date(row.lastPaymentRaw).getFullYear();
    } else if (row.lastPaymentDate) {
      const parts = row.lastPaymentDate.split('/');
      if (parts.length === 3) {
        paymentYear = parseInt(parts[2], 10);
      }
    }

    // 1. Balance risk status (red/yellow thresholds)
    let balanceStatus = 'none';
    if (absBalance > 1000) {
      balanceStatus = 'red';
    } else if (absBalance > 500) {
      balanceStatus = 'yellow';
    }

    // 2. Last payment date recency status (basato sull'anno contabile ufficiale)
    let dateStatus = 'none';
    if (paymentYear === null) {
      dateStatus = 'yellow';
    } else {
      const diffYears = analysisYear - paymentYear;
      if (diffYears >= 2) {
        dateStatus = 'red';
      } else if (diffYears === 1) {
        dateStatus = 'yellow';
      }
    }

    // 3. Overall client row status combining balance and date factors
    let clientStatus = 'none';
    if (balanceStatus === 'red' && dateStatus === 'red') {
      clientStatus = 'red';
    } else if (balanceStatus === 'yellow' && dateStatus === 'yellow') {
      clientStatus = 'yellow';
    }

    let dateTimestamp = 0;
    if (row.lastPaymentRaw) {
      dateTimestamp = row.lastPaymentRaw;
    } else if (row.lastPaymentDate) {
      const parts = row.lastPaymentDate.split('/');
      if (parts.length === 3) {
        dateTimestamp = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
      }
    }

    return {
      calculatedBalance: finalBalance,
      paymentYear,
      dateTimestamp,
      balanceStatus,
      dateStatus,
      clientStatus
    };
  }, [analysisYear]);

  // Handle column header clicks to update sorting configuration
  const handleSort = (field) => {
    setSortConfig((prevConfig) => {
      let newConfig;
      if (prevConfig.field === field) {
        newConfig = { field, direction: prevConfig.direction === 'asc' ? 'desc' : 'asc' };
      } else {
        newConfig = { field, direction: 'asc' };
      }
      inMemorySortConfig = newConfig; // Persist in session RAM memory
      return newConfig;
    });
    setCurrentPage(1);
  };

  // Compute sorted and status-enriched report dataset
  const sortedReportData = useMemo(() => {
    const colorPriority = { red: 3, yellow: 2, none: 1 };

    return actualReportData
      .map(row => ({
        ...row,
        ...getRowStatuses(row)
      }))
      .sort((a, b) => {
        if (sortConfig.field === 'client') {
          const pA = colorPriority[a.clientStatus];
          const pB = colorPriority[b.clientStatus];
          if (pA !== pB) {
            return sortConfig.direction === 'asc' ? pB - pA : pA - pB;
          }
          return sortConfig.direction === 'asc' 
            ? a.name.localeCompare(b.name) 
            : b.name.localeCompare(a.name);
        }

        if (sortConfig.field === 'balance') {
          return sortConfig.direction === 'asc' 
            ? a.calculatedBalance - b.calculatedBalance 
            : b.calculatedBalance - a.calculatedBalance;
        } 
        
        if (sortConfig.field === 'date') {
          if (a.dateTimestamp === 0 && b.dateTimestamp !== 0) return 1;
          if (b.dateTimestamp === 0 && a.dateTimestamp !== 0) return -1;

          return sortConfig.direction === 'asc' 
            ? a.dateTimestamp - b.dateTimestamp 
            : b.dateTimestamp - a.dateTimestamp;
        }

        return 0;
      });
  }, [actualReportData, sortConfig, getRowStatuses]);

  // Filter report rows based on zero-balance visibility toggle
  const filteredReportData = useMemo(() => {
    return sortedReportData.filter(row => {
      const isZero = Math.abs(row.calculatedBalance) <= 0.001;
      if (!showZeroBalance && isZero) return false;
      return true;
    });
  }, [sortedReportData, showZeroBalance]);

  // Calculate cumulative sum of filtered balances
  const totalBalanceSum = useMemo(() => {
    return filteredReportData.reduce((acc, row) => acc + Number(row.calculatedBalance || 0), 0);
  }, [filteredReportData]);

  // Pagination calculation metrics
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredReportData.length / rowsPerPage));
  }, [filteredReportData.length, rowsPerPage]);

  const safeCurrentPage = useMemo(() => {
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * rowsPerPage;
    return filteredReportData.slice(start, start + rowsPerPage);
  }, [filteredReportData, safeCurrentPage, rowsPerPage]);

  const startItemIndex = filteredReportData.length > 0 ? (safeCurrentPage - 1) * rowsPerPage + 1 : 0;
  const endItemIndex = Math.min(safeCurrentPage * rowsPerPage, filteredReportData.length);

  // Render sorting arrow icon based on active configuration
  const renderSortIcon = (field) => {
    if (sortConfig.field !== field) {
      return <i className="bi bi-arrow-down-up ms-1 text-muted opacity-50" style={{ fontSize: '10px' }}></i>;
    }
    return sortConfig.direction === 'asc' 
      ? <i className="bi bi-sort-alpha-down ms-1 text-dark fw-bold" style={{ fontSize: '12px' }}></i>
      : <i className="bi bi-sort-alpha-up-alt ms-1 text-dark fw-bold" style={{ fontSize: '12px' }}></i>;
  };

  // Get descriptive label for current sort direction
  const getSortLabelDescription = () => {
    if (sortConfig.field === 'client') {
      return sortConfig.direction === 'asc' ? 'Colore (Rosso in cima) / Nome' : 'Colore (Nessuno in cima) / Nome';
    }
    if (sortConfig.field === 'balance') {
      return sortConfig.direction === 'asc' ? 'Debito Maggiore' : 'Debito Minore';
    }
    return sortConfig.direction === 'asc' ? 'Pagamento Più Remoto' : 'Pagamento Più Recente';
  };

  // Color styles for risk alert indicators
  const redStyle = { backgroundColor: '#fde8e8', color: '#9b1c1c' };
  const yellowStyle = { backgroundColor: '#fef3c7', color: '#92400e' };

  // Legend tooltip explanation text
  const legendTooltipText = 
    "GUIDA AI COLORI:\n\n" +
    "🔴 ROSSO (Critico)\n" +
    "• Saldo scoperto superiore a € 1.000\n" +
    "• Oppure ultimo pagamento risalente a più di 2 anni fa\n" +
    "• (La riga del Cliente diventa rossa se entrambe le condizioni sono critiche)\n\n" +
    "🟡 GIALLO (Attenzione)\n" +
    "• Saldo scoperto compreso tra € 500 e € 1.000\n" +
    "• Oppure ultimo pagamento nell'anno precedente / assente\n" +
    "• (La riga del Cliente diventa gialla se entrambe le condizioni sono di attenzione)";

  return (
    <div className="card border shadow-sm rounded-0 bg-white mb-2 h-100 d-flex flex-column overflow-hidden">
      {/* Card header controls with title, legend tooltip, and filters */}
      <div className="card-header bg-light py-1 px-3 d-flex justify-content-between align-items-center border-bottom rounded-0 flex-nowrap gap-3 text-nowrap" style={{ minHeight: '38px', overflowX: 'auto' }}>
        <div className="d-flex align-items-center gap-3">
          <h6 className="m-0 fw-bold text-dark text-truncate" style={{ fontSize: '12px' }}>
            Analisi Insolvenze e Incassi Pendenti (Riferimento DB: {analysisYear})
          </h6>
          <span 
            className="badge bg-white text-secondary border rounded-0 fw-normal py-1 px-2 text-nowrap" 
            style={{ fontSize: '11px', cursor: 'help' }}
            title={legendTooltipText}
          >
            <i className="bi bi-info-circle me-1 text-primary"></i>Legenda Colori
          </span>
        </div>

        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center m-0">
            <div className="form-check form-check-inline m-0 d-flex align-items-center">
              <input
                type="checkbox"
                className="form-check-input rounded-0 shadow-none border-secondary-subtle m-0"
                id="showZeroBalanceChk"
                checked={showZeroBalance}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowZeroBalance(val);
                  inMemoryShowZeroBalance = val; // Persist in session RAM memory
                  setCurrentPage(1);
                }}
                style={{ cursor: 'pointer', width: '13px', height: '13px' }}
              />
              <label className="form-check-label text-dark user-select-none ps-1 m-0 lh-1" htmlFor="showZeroBalanceChk" style={{ fontSize: '11px', cursor: 'pointer' }}>
                Mostra saldo a 0
              </label>
            </div>
          </div>

          <span className="badge bg-white text-dark border rounded-0 fw-normal py-1 px-2 text-nowrap" style={{ fontSize: '11px' }}>
            Ordinamento: <strong className="text-dark">{getSortLabelDescription()}</strong>
          </span>
        </div>
      </div>

      {/* Main flexible table container with loading overlay */}
      <div className="card-body p-0 d-flex flex-column grow position-relative overflow-hidden">
        {loading && (
          <div className="position-absolute w-100 h-100 d-flex justify-content-center align-items-center bg-white bg-opacity-75" style={{ zIndex: 5 }}>
            <div className="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
            <span className="text-secondary fw-semibold" style={{ fontSize: '12px' }}>Analisi posizioni debitorie...</span>
          </div>
        )}

        <div className="table-responsive grow overflow-auto m-0">
          <table className="table table-bordered table-hover table-sm mb-0 align-middle" style={{ fontSize: '12px' }}>
            <thead className="table-light text-uppercase sticky-top" style={{ fontSize: '11px', zIndex: 1 }}>
              <tr style={{ height: '32px' }}>
                <th 
                  onClick={() => handleSort('client')}
                  className="py-1 px-3 text-start text-secondary user-select-none" 
                  style={{ width: '42%', cursor: 'pointer' }}
                  title="Clicca per ordinare per colore o nome cliente"
                >
                  <span>Cliente / Azienda</span>
                  {renderSortIcon('client')}
                </th>
                
                <th 
                  onClick={() => handleSort('balance')}
                  className="py-1 px-3 text-end text-secondary user-select-none" 
                  style={{ width: '30%', cursor: 'pointer' }}
                  title="Clicca per ordinare per ammontare del debito"
                >
                  <span>Saldo Scoperto</span>
                  {renderSortIcon('balance')}
                </th>

                <th 
                  onClick={() => handleSort('date')}
                  className="py-1 px-3 text-center text-secondary user-select-none" 
                  style={{ width: '23%', cursor: 'pointer' }}
                  title="Clicca per ordinare per data dell'ultimo pagamento"
                >
                  <span>Data Ultimo Pagamento</span>
                  {renderSortIcon('date')}
                </th>

                <th className="py-1 px-2 text-center text-secondary border-start" style={{ width: '55px' }} title="Vai alle elaborazioni">
                  <span>Vai</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-4 text-muted">Nessun dato disponibile nel report.</td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const matchedCust = customerMap[Number(row.id)];
                  const parentCode = matchedCust?.parent_code || row.parent_code;
                  
                  const balanceStyle = row.balanceStatus === 'red' ? redStyle : row.balanceStatus === 'yellow' ? yellowStyle : {};
                  const dateStyle = row.dateStatus === 'red' ? redStyle : row.dateStatus === 'yellow' ? yellowStyle : {};
                  const clientStyle = row.clientStatus === 'red' ? redStyle : row.clientStatus === 'yellow' ? yellowStyle : {};
                  
                  return (
                    <tr key={row.id} style={{ height: '40px' }}>
                      <td className="py-1 px-3 align-middle" style={clientStyle}>
                        <div className="d-flex align-items-center text-truncate gap-2" style={{ fontSize: '12px' }}>
                          <span className="fw-bold">{row.name}</span>
                          <span className="opacity-50">|</span>
                          <span className="opacity-75">Cod: {row.code}</span>
                          {parentCode && (
                            <>
                              <span className="opacity-50">|</span>
                              <span className="opacity-75">Padre: {parentCode}</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-1 px-3 text-end align-middle" style={balanceStyle}>
                        <span className="fw-bold" style={{ fontSize: '12px' }}>
                          {formatCurrency(row.calculatedBalance)}
                        </span>
                      </td>

                      <td className="py-1 px-3 text-center align-middle" style={dateStyle}>
                        {row.lastPaymentDate ? (
                          <span className="fw-semibold" style={{ fontSize: '12px' }}>
                            {row.lastPaymentDate}
                          </span>
                        ) : (
                          <span className="opacity-75" style={{ fontSize: '11px' }}>—</span>
                        )}
                      </td>

                      <td className="py-1 px-2 text-center align-middle bg-white border-start">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark rounded-0 px-2 py-0 shadow-none d-inline-flex align-items-center justify-content-center"
                          onClick={() => {
                            const anno = row.app || analysisYear;
                            const cliente = row.id;
                            navigate(`/elaborazioni/${encodeURIComponent(anno)}/${encodeURIComponent(cliente)}`);
                          }}
                          title="Vai alle elaborazioni del cliente"
                          style={{ fontSize: '12px', height: '24px' }}
                        >
                          <i className="bi bi-arrow-right"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cumulative total balances sum footer row */}
      {!loading && filteredReportData.length > 0 && (
        <div className="bg-secondary-subtle border-top border-dark p-2 px-3 d-flex flex-wrap justify-content-between align-items-center text-uppercase fw-bold text-dark shrink-0" style={{ fontSize: '12px', letterSpacing: '0.3px' }}>
          <div>TOTALE COMPLESSIVO SALDI:</div>
          <div>
            <span className={totalBalanceSum < 0 ? 'text-danger' : 'text-dark'}>
              {formatCurrency(totalBalanceSum)}
            </span>
          </div>
        </div>
      )}

      {/* Pagination controls footer bar */}
      <div className="bg-light border-top p-2 px-3 d-flex flex-wrap justify-content-end align-items-center gap-3 shrink-0 small text-secondary" style={{ fontSize: '13px' }}>
        <div className="d-flex align-items-center gap-2">
          <span>Page Size:</span>
          <select
            className="form-select form-select-sm rounded-0 shadow-none border bg-white"
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            style={{ width: '75px', height: '28px', fontSize: '13px' }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
            <option value={500}>500</option>
          </select>
        </div>

        <div className="px-2 fw-medium text-dark">
          {startItemIndex} to {endItemIndex} of {filteredReportData.length}
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
  );
};

export default ReportGrid;