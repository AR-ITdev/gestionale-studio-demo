// src/pages/ReportPage.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrailingRouteParam } from '../hooks/useTrailingRouteParam';
import ReportGrid from '../components/ReportGrid';
import Alert from '../components/Alert';
import { GroupSearchInput } from '../components/GroupSearchInput';
import { useClienti } from '../hooks/useClienti';
import { useReportGlobal } from '../hooks/useReportGlobal';
import { syncCustomerYearlyBalances } from '../services/api';
import * as XLSX from 'xlsx';

export const ReportPage = () => {
  // Extract route parameters and navigation utilities
  const cliente = useTrailingRouteParam('cliente');
  const navigate = useNavigate();

  const decodedCliente = cliente || '';
  const initialFilterValue = decodedCliente || '';
  const initialTempValue = decodedCliente || 'ALL';

  // State management for temporary filter inputs and active selected filters
  const [tempFilterValue, setTempFilterValue] = useState(initialTempValue);
  const [selectedFilterValue, setSelectedFilterValue] = useState(initialFilterValue);
  const [isSyncing, setIsSyncing] = useState(Boolean(cliente));
  const [alertData, setAlertData] = useState({ message: '', type: 'success', key: 0 });
  const initialSyncHandled = useRef(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const showAlert = (message, type = 'success') => {
    setAlertData({ message, type, key: Date.now() });
  };

  // Synchronize state when the URL parameter changes
  useEffect(() => {
    queueMicrotask(() => {
      if (cliente !== undefined) {
        setSelectedFilterValue(cliente);
        setTempFilterValue(cliente);
      } else {
        setSelectedFilterValue('');
        setTempFilterValue('ALL');
      }
    });
  }, [cliente]);

  // Fetch customer list data using custom hook
  const { rowData: customers } = useClienti();

  // Compute report filters dynamically based on the selected filter value (supports parent groups and individual customers)
  const reportFilters = useMemo(() => {
    const filters = {};
    if (selectedFilterValue && selectedFilterValue !== 'ALL') {
      if (selectedFilterValue.startsWith('PARENT:')) {
        filters.parent_code = selectedFilterValue.replace('PARENT:', '');
      } else {
        filters.customer_id = Number(selectedFilterValue);
      }
    }
    return filters;
  }, [selectedFilterValue]);

  // Fetch global report data and analysisYear directly from the hook using computed filters
  const { reportData, analysisYear, loading, error: reportError, refetch } = useReportGlobal(reportFilters);
  const currentReportRef = useRef({ cliente, refetch });
  useEffect(() => {
    currentReportRef.current = { cliente, refetch };
  }, [cliente, refetch]);

  useEffect(() => {
    if (reportError) showAlert(`Errore caricamento report: ${reportError.message}`, 'danger');
  }, [reportError]);

  // Synchronize when the report grid is opened directly or from another section.
  useEffect(() => {
    if (cliente === undefined || initialSyncHandled.current) return;

    initialSyncHandled.current = true;
    const synchronizeOnEntry = async () => {
      setIsSyncing(true);
      try {
        await syncCustomerYearlyBalances();
        if (mountedRef.current && currentReportRef.current.cliente !== undefined) {
          await currentReportRef.current.refetch();
        }
      } catch (err) {
        console.error("Errore durante la sincronizzazione del report:", err);
        if (!mountedRef.current) return;
        showAlert(err.message || "Errore durante la sincronizzazione del report.", 'danger');
        if (currentReportRef.current.cliente === cliente) {
          setSelectedFilterValue('');
          setTempFilterValue('ALL');
          navigate('/report', { replace: true });
        }
      } finally {
        if (mountedRef.current) setIsSyncing(false);
      }
    };

    synchronizeOnEntry();
  }, [cliente, navigate, refetch]);

  // Handle confirmation action: triggers backend synchronization, updates selection state, and refetches report data
  const handleConfirmSelection = async () => {
    const targetFilter = tempFilterValue || 'ALL';
    try {
      setIsSyncing(true);
      await syncCustomerYearlyBalances();
      initialSyncHandled.current = true;
      setSelectedFilterValue(targetFilter);
      navigate(`/report/${encodeURIComponent(targetFilter)}`);
      if (targetFilter === (selectedFilterValue || 'ALL')) await refetch();
    } catch (err) {
      console.error("Errore durante la sincronizzazione del report:", err);
      showAlert(err.message || "Errore durante la sincronizzazione del report.", 'danger');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle search application for individual customers or groups without triggering full sync
  const handleApplyCustomerSearch = async () => {
    const targetFilter = tempFilterValue || 'ALL';
    setSelectedFilterValue(targetFilter);
    navigate(`/report/${encodeURIComponent(targetFilter)}`);
    if (targetFilter === (selectedFilterValue || 'ALL')) await refetch();
  };

  // Excel export functionality: builds formatted worksheets with styled headers, custom column widths, and filtered rows
  const handleExportExcel = () => {
    if (!reportData || reportData.length === 0) {
      showAlert('Non ci sono record da esportare per la selezione corrente.', 'danger');
      return;
    }

    try {
      let filteredCustomers = customers;
      if (selectedFilterValue && selectedFilterValue !== 'ALL') {
        if (selectedFilterValue.startsWith('PARENT:')) {
          const pCode = selectedFilterValue.replace('PARENT:', '');
          filteredCustomers = customers.filter(c => c.parent_code === pCode);
        } else {
          const custId = Number(selectedFilterValue);
          filteredCustomers = customers.filter(c => Number(c.id) === custId);
        }
      }

      // Map customers by ID for quick lookup during export preparation
      const customerMap = {};
      customers.forEach(c => {
        customerMap[Number(c.id)] = c;
      });

      const exportRows = [];
      const cellStyles = {};

      // Define table headers for the export file
      const headerRowIdx = 0;
      exportRows.push({
        'Codice Padre': 'CODICE PADRE',
        'Codice Cliente': 'CODICE CLIENTE',
        'Nome Cliente': 'NOME CLIENTE',
        'Saldo Scoperto': 'SALDO SCOPERTO',
        'Data Ultimo Pagamento': 'DATA ULTIMO PAGAMENTO'
      });

      // Apply styles to header row cells (fonts, fills, alignments, and borders)
      for (let c = 0; c <= 4; c++) {
        cellStyles[XLSX.utils.encode_cell({ r: headerRowIdx, c })] = {
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "2C3E50" } },
          alignment: { vertical: 'center', horizontal: c === 3 ? 'right' : c === 4 ? 'center' : 'left' },
          border: {
            top: { style: 'medium', color: { rgb: "198754" } },
            bottom: { style: 'medium', color: { rgb: "198754" } },
            left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
            right: { style: c === 4 ? 'medium' : 'thin', color: { rgb: "198754" } }
          }
        };
      }

      let currentRowIdx = 1;

      // Iterate through filtered customers and compile data rows, omitting negligible balances
      filteredCustomers.forEach((customer) => {
        const customerId = Number(customer.id);
        const reportRow = reportData.find(r => Number(r.id || r.customer_id) === customerId);
        if (!reportRow) return;

        const balanceVal = Number(reportRow.balance || 0);
        // Exclude customers with near-zero balances
        if (Math.abs(balanceVal) <= 0.001) return;

        const matchedCust = customerMap[customerId];
        const parentCode = matchedCust?.parent_code || reportRow.parent_code || '';

        exportRows.push({
          'Codice Padre': parentCode,
          'Codice Cliente': reportRow.code || customer.customer_code || 'N/D',
          'Nome Cliente': reportRow.name || customer.name || 'N/D',
          'Saldo Scoperto': balanceVal,
          'Data Ultimo Pagamento': reportRow.lastPaymentDate || '—'
        });

        const rIdx = currentRowIdx;
        for (let c = 0; c <= 4; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: rIdx, c });
          const isNum = c === 3;
          const isCenter = c === 4;

          // Apply cell styles for data rows including currency formatting for balances
          cellStyles[cellRef] = {
            font: { name: 'Arial', sz: 9.5, color: { rgb: "333333" } },
            fill: { fgColor: { rgb: "FFFFFF" } },
            alignment: { vertical: 'center', horizontal: isNum ? 'right' : isCenter ? 'center' : 'left' },
            border: {
              top: { style: 'thin', color: { rgb: "E0E0E0" } },
              bottom: { style: 'thin', color: { rgb: "E0E0E0" } },
              left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
              right: { style: c === 4 ? 'medium' : 'thin', color: { rgb: "198754" } }
            }
          };

          if (isNum) {
            cellStyles[cellRef].numFmt = '€ #,##0.00';
          }
        }

        currentRowIdx++;
      });

      // Generate workbook, attach sheet, and trigger file download if valid rows exist
      if (exportRows.length > 1) {
        const now = new Date();
        const dateFormatted = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `Report_Insolvenze_${dateFormatted}.xlsx`;

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportRows, { skipHeader: true });

        Object.keys(cellStyles).forEach(ref => {
          if (!ws[ref]) ws[ref] = {};
          ws[ref].s = cellStyles[ref];
        });

        // Set uniform column widths for proper sheet formatting
        ws['!cols'] = [
          { wch: 25 }, // Codice Padre
          { wch: 25 }, // Codice Cliente
          { wch: 25 }, // Nome Cliente
          { wch: 25 }, // Saldo Scoperto
          { wch: 25 }  // Data Ultimo Pagamento
        ];

        XLSX.utils.book_append_sheet(wb, ws, `Insolvenze_${analysisYear}`);
        XLSX.writeFile(wb, fileName);
        showAlert('Esportazione Excel completata.', 'success');
      } else {
        showAlert('Non ci sono record da esportare per la selezione corrente.', 'danger');
      }
    } catch (error) {
      console.error("Errore durante l'esportazione Excel del Report Grid:", error);
      showAlert("Errore durante l'esportazione Excel.", 'danger');
    }
  };

  return (
    <div className="w-100 h-custom-calc d-flex flex-column box-border overflow-hidden bg-light position-relative">
      <Alert message={alertData.message} type={alertData.type} key={alertData.key} />
      {/* Conditional rendering: show initial selection view if no filter is active, otherwise display report grid and toolbar */}
      {!selectedFilterValue ? (
        <div className="row justify-content-center align-items-center py-5 px-3 grow position-relative">
          <div className="col-md-7 col-lg-5 position-relative">
            <div className="card border shadow-sm rounded-0 bg-white p-4 text-center">
              <div className="mb-2 text-primary" style={{ fontSize: '32px' }}>📈</div>
              <h4 className="fw-bold text-dark mb-2" style={{ fontSize: '18px' }}>Area Report e Analisi Debiti Globale</h4>
              <p className="text-secondary mb-4" style={{ fontSize: '13px' }}>
                Seleziona un cliente o gruppo (oppure procedi per tutti) per visualizzare la situazione dell'anno più recente presente nel database.
              </p>

              <div className="d-flex flex-column gap-3 text-start mb-4">
                <div className="bg-light p-3 border">
                  <label className="form-label fw-semibold text-secondary mb-1" style={{ fontSize: '12px' }}>Filtra Cliente o Gruppo:</label>
                  <GroupSearchInput 
                    availableCustomers={customers} 
                    selectedFilterValue={tempFilterValue} 
                    onFilterValueChange={setTempFilterValue} 
                    className="position-relative w-100" 
                    inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle py-2" 
                    inputStyle={{ width: '100%', fontSize: '13px' }} 
                  />
                </div>
              </div>

              <button 
                onClick={handleConfirmSelection} 
                disabled={isSyncing}
                className="btn btn-dark rounded-0 py-2 w-100 fw-bold shadow-none d-flex justify-content-center align-items-center gap-2" 
                style={{ fontSize: '13px' }}
              >
                {isSyncing && (
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                )}
                {isSyncing ? 'Sincronizzazione in corso...' : 'Genera Report'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Top toolbar card with navigation back button, filter input, search action, and export button */}
          <div className="card border shadow-sm bg-white rounded-0 mb-2 shrink-0">
            <div className="card-body p-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button onClick={() => { setSelectedFilterValue(''); setTempFilterValue('ALL'); navigate('/report'); }} className="btn btn-outline-secondary btn-sm rounded-0 py-1 px-2 fw-semibold" style={{ fontSize: '12px', height: '30px' }}>← Indietro</button>

                <div className="d-flex align-items-center gap-1 ms-2">
                  <GroupSearchInput 
                    availableCustomers={customers} 
                    selectedFilterValue={tempFilterValue} 
                    onFilterValueChange={setTempFilterValue} 
                    className="position-relative" 
                    inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle" 
                    inputStyle={{ minWidth: '220px', maxWidth: '320px', fontSize: '12px', height: '30px' }} 
                  />
                  <button onClick={handleApplyCustomerSearch} className="btn btn-sm btn-outline-secondary rounded-0 px-2 py-1 shadow-none" style={{ height: '30px' }} title="Cerca"><i className="bi bi-search"></i></button>
                </div>
              </div>

              {/* Excel export button matching styling guidelines */}
              <button 
                onClick={handleExportExcel} 
                className="btn btn-success btn-sm rounded-0 py-1 px-3 fw-bold shadow-none" 
                style={{ fontSize: '12px', height: '30px' }}
                title="Esporta tutti i dati in Excel"
              >
                📥 Esporta (Excel)
              </button>
            </div>
          </div>

          {/* Main report data grid component receiving structured analysisYear and reportData */}
          <ReportGrid
            reportData={{ analysisYear, data: reportData }}
            customers={customers}
            loading={loading || isSyncing}
          />
        </>
      )}
    </div>
  );
};

export default ReportPage;