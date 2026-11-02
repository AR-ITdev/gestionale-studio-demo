// src/pages/DashboardPage.jsx
import { useRef, useState, useEffect } from 'react';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { downloadDatabaseBackup, restoreDatabase, getClienti, getCassaMovements, getPayments, syncCustomerYearlyBalances } from '../services/api';
import Alert from '../components/Alert';
import GroupSearchInput from '../components/GroupSearchInput';

const DashboardPage = () => {
  const { safeNavigate } = useUnsavedChanges();
  const fileInputRef = useRef(null);

  const [isDatabaseActive, setIsDatabaseActive] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false); // <-- AGGIUNTO QUI LO STATO MANCANTE
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success' });

  const currentYear = new Date().getFullYear();
  const [allCustomers, setAllCustomers] = useState([]);
  const [availableYears, setAvailableYears] = useState([currentYear]);

  // Filtri rapidi per i 3 box superiori
  const [elaborazioniYear, setElaborazioniYear] = useState(currentYear);
  const [elaborazioniCustomer, setElaborazioniCustomer] = useState('ALL');

  const [pagamentiYear, setPagamentiYear] = useState(currentYear);
  const [pagamentiCustomer, setPagamentiCustomer] = useState('ALL');

  const [reportCustomer, setReportCustomer] = useState('ALL');

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [custRes, cashRes, payRes] = await Promise.allSettled([
          getClienti(),
          getCassaMovements(),
          getPayments()
        ]);

        if (custRes.status === 'fulfilled') {
          const list = Array.isArray(custRes.value) ? custRes.value : (custRes.value?.data || []);
          setAllCustomers(list);
        }

        const yearsSet = new Set([currentYear]);
        if (cashRes.status === 'fulfilled') {
          const data = Array.isArray(cashRes.value) ? cashRes.value : (cashRes.value?.data || []);
          data.forEach(item => {
            const y = new Date(item.date || item.movement_date || item.created_at).getFullYear();
            if (!isNaN(y)) yearsSet.add(y);
          });
        }
        if (payRes.status === 'fulfilled') {
          const data = Array.isArray(payRes.value) ? payRes.value : (payRes.value?.data || []);
          data.forEach(item => {
            const y = new Date(item.payment_date || item.date || item.created_at).getFullYear();
            if (!isNaN(y)) yearsSet.add(y);
          });
        }
        setAvailableYears(Array.from(yearsSet).sort((a, b) => b - a));
      } catch (err) {
        console.error("Errore caricamento metadati dashboard:", err);
      }
    };
    fetchMetadata();
  }, [currentYear]);

  const triggerAlert = (message, type = 'success') => {
    setAlertInfo({ message: '', type });
    setTimeout(() => {
      setAlertInfo({ message, type });
    }, 10);
  };

const handleBackup = async () => {
    try {
      const blob = await downloadDatabaseBackup();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Generiamo data e ora coerenti con il backend
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');

      a.download = `backup_demo_${dateStr}_${timeStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      triggerAlert("Backup completato con successo.", "success");
    } catch (error) {
      console.error(error);
      triggerAlert("Errore durante la creazione del backup.", "danger");
    }
  };

  const handleRestoreClick = () => setConfirmingRestore(true);
  const handleCancelRestore = () => setConfirmingRestore(false);
  const handleConfirmRestoreExecution = () => {
    setConfirmingRestore(false);
    fileInputRef.current.click();
  };

  const handleFileChange = async (event) => {
    if (isRestoring) return;
    const file = event.target.files[0];
    if (!file) return;

    setIsRestoring(true);
    const formData = new FormData();
    formData.append('dbFile', file);

    try {
      await restoreDatabase(formData);
      triggerAlert("Backup ripristinato con successo. L'applicazione verrà ricaricata.", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error(error);
      triggerAlert(error.message || "Errore durante il ripristino del database.", "danger");
      setIsRestoring(false);
    } finally {
      event.target.value = null;
    }
  };

  // I 6 moduli centrali di gestione interna dello studio
  const groupInternalModules = [
    { title: "Anagrafiche", path: "/clienti", icon: "bi-people", color: "#2563eb" },
    { title: "Cassa", path: `/cassa/${currentYear}/movimentazione`, icon: "bi-cash-stack", color: "#0d9488" },
    { title: "Paghe", path: "/paghe", icon: "bi-wallet2", color: "#059669" },
    { title: "Contabilità", path: "/contabilita", icon: "bi-journal-text", color: "#d97706" },
    { title: "Redditi", path: "/redditi", icon: "bi-file-earmark-text", color: "#7c3aed" },
    { title: "Varie", path: "/varie", icon: "bi-pin", color: "#db2777" },
  ];

  return (
    <div className="container-fluid py-3 px-4 h-custom-calc d-flex flex-column overflow-hidden bg-light">
      <Alert message={alertInfo.message} type={alertInfo.type} />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="d-none"
        accept=".json,application/json"
        disabled={isRestoring}
      />

      {/* Intestazione */}
      <div className="py-2.5 px-3 mb-3 bg-white border border-secondary-subtle rounded-0 shadow-sm d-flex align-items-center justify-content-between shrink-0">
        <div>
          <h1 className="h5 mb-0 text-dark fw-bold py-3">Gestionale Studio · Demo</h1>
          <p className=" text-secondary fs-13">Nota: per questa demo sia i dati sia alcune strutture dati sono stati alterati rispetto al progetto originario.</p>
        </div>
        <div className="text-end">
        </div>
      </div>

      <div className="grow d-flex flex-column gap-3 pb-2">

        <div>

          <div className="row g-3">

            {/* Box 1: Elaborazioni */}
            <div className="col-md-4">
              <div className="card border border-secondary-subtle shadow-sm rounded-0 bg-white h-100">
                <div className="card-body p-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2.5 mb-2">
                      <div className="p-2 rounded-0 d-flex align-items-center justify-content-center bg-light text-indigo border border-light-subtle" style={{ width: '32px', height: '32px', color: '#4f46e5' }}>
                        <i className="bi bi-gear fs-5"></i>
                      </div>
                      <span className="fw-bold text-dark fs-13"> &nbsp; Elaborazioni</span>
                    </div>

                    <div className="bg-light p-2 border mb-1">
                      <div className="d-flex flex-wrap gap-1 align-items-end ">
                        <div style={{ flex: '1 0 75px', minWidth: '75px' }}>
                          <label className="form-label text-secondary fs-11">Anno</label>
                          <select
                            value={elaborazioniYear}
                            onChange={(e) => setElaborazioniYear(Number(e.target.value))}
                            className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle fw-bold text-dark px-1.5 fs-12 w-100"
                          >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>

                        <div style={{ flex: '1 1 170px', minWidth: '170px' }}>
                          <label className="form-label text-secondary mb-1.5 fs-11">Cliente / Gruppo</label>
                          <GroupSearchInput
                            availableCustomers={allCustomers}
                            selectedFilterValue={elaborazioniCustomer}
                            onFilterValueChange={setElaborazioniCustomer}
                            inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle py-1 px-1.5 fs-12 w-100"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      try {
                        await syncCustomerYearlyBalances(elaborazioniYear);
                      } catch (err) {
                        console.error("Errore sincronizzazione elaborazioni:", err);
                      }
                      safeNavigate(`/elaborazioni/${elaborazioniYear}/${encodeURIComponent(elaborazioniCustomer || 'ALL')}`);
                    }}
                    className="btn btn-outline-dark btn-sm rounded-0 fw-bold px-3 py-1.5 shadow-sm d-flex align-items-center justify-content-between w-100 mt-1 fs-12 "
                  >
                    <span>Apri Sezione</span>
                    <i className="bi bi-arrow-right"></i>
                  </button>
                </div>
              </div>
            </div>

            {/* Box 2: Pagamenti */}
            <div className="col-md-4">
              <div className="card border border-secondary-subtle shadow-sm rounded-0 bg-white h-100">
                <div className="card-body p-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2.5 mb-2">
                      <div className="p-2 rounded-0 d-flex align-items-center justify-content-center bg-light border border-light-subtle" style={{ width: '32px', height: '32px', color: '#0284c7' }}>
                        <i className="bi bi-credit-card fs-5"></i>
                      </div>
                      <span className="fw-bold text-dark fs-12"> &nbsp; Pagamenti</span>
                    </div>

                    <div className="bg-light p-2 border mb-1">
                      <div className="d-flex flex-wrap gap-1 align-items-end ">
                        <div style={{ flex: '1 0 75px', minWidth: '75px' }}>
                          <label className="form-label text-secondary fs-11">Anno</label>
                          <select
                            value={pagamentiYear}
                            onChange={(e) => setPagamentiYear(Number(e.target.value))}
                            className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle fw-bold text-dark px-1.5 fs-12 w-100"
                          >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: '1 1 170px', minWidth: '170px' }}>
                          <label className="form-label text-secondary mb-1.5 fs-11">Cliente / Gruppo</label>
                          <GroupSearchInput
                            availableCustomers={allCustomers}
                            selectedFilterValue={pagamentiCustomer}
                            onFilterValueChange={setPagamentiCustomer}
                            inputClassName="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle py-1 px-1.5 fs-12 w-100"
                            inputStyle={{ minWidth: '100%', fontSize: '12px', cursor: 'pointer' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const targetPath = pagamentiCustomer ? `/${encodeURIComponent(pagamentiCustomer)}` : '';
                      safeNavigate(`/cassa/${pagamentiYear}/pagamenti${targetPath}`);
                    }}
                    className="btn btn-outline-dark btn-sm rounded-0 fw-bold px-3 py-1.5 shadow-sm d-flex align-items-center justify-content-between w-100 mt-1 fs-12"
                  >
                    <span>Apri Sezione</span>
                    <i className="bi bi-arrow-right"></i>
                  </button>
                </div>
              </div>
            </div>

            {/* Box 3: Report */}
            <div className="col-md-4">
              <div className="card border border-secondary-subtle shadow-sm rounded-0 bg-white h-100">
                <div className="card-body p-3 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2.5 mb-2">
                      <div className="p-2 rounded-0 d-flex align-items-center justify-content-center bg-light border border-light-subtle" style={{ width: '32px', height: '32px', color: '#ea580c' }}>
                        <i className="bi bi-graph-up fs-5"></i>
                      </div>
                      <span className="fw-bold text-dark fs-12"> &nbsp; Report</span>
                    </div>

                    <div className="bg-light p-2 border mb-1">
                      <label className="form-label text-secondary mb-1.5 fs-11">Cliente / Gruppo</label>
                      <GroupSearchInput
                        availableCustomers={allCustomers}
                        selectedFilterValue={reportCustomer}
                        onFilterValueChange={setReportCustomer}
                        inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle py-1 px-1.5 mt-1 fs-12 w-100"
                        inputStyle={{ minWidth: '100%', fontSize: '12px', cursor: 'pointer' }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const targetVal = reportCustomer && reportCustomer !== 'ALL' ? encodeURIComponent(reportCustomer) : 'ALL';
                      safeNavigate(`/report/${targetVal}`);
                    }}
                    className="btn btn-outline-dark btn-sm rounded-0 fw-bold px-3 py-1.5 shadow-sm d-flex align-items-center justify-content-between w-100 mt-1 fs-12"
                  >
                    <span>Apri Sezione</span>
                    <i className="bi bi-arrow-right"></i>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 2. SEZIONE CENTRALE: I 6 BOX DISPOSTI SULLA STESSA RIGA */}
        <div>
          <div className="row g-2 my-3">
            {groupInternalModules.map((area, index) => (
              <div className="col-lg col-md-4 col-sm-6" key={index}>
                <div className="card border border-secondary-subtle shadow-sm rounded-0 bg-white h-100">
                  <div className="card-body p-3 d-flex flex-column justify-content-between min-h-64px">
                    <div className="d-flex align-items-center gap-2.5 mb-2.5">
                      <div className="p-1.5 rounded-0 d-flex align-items-center justify-content-center shrink-0 bg-light border border-light-subtle mb-2" style={{ color: area.color, width: '28px', height: '28px' }}>
                        <i className={`bi ${area.icon} fs-6`}></i>
                      </div>
                      <span className="fw-semibold text-dark text-truncate fs-12 fw-bold" title={area.title}>&nbsp; {area.title}</span>
                    </div>
                    <button
                      onClick={() => safeNavigate(area.path)}
                      className="btn btn-outline-dark btn-sm rounded-0 fw-bold px-2.5 py-1 shadow-sm d-flex align-items-center justify-content-between w-100 fs-11 "
                    >
                      <span>Accedi</span>
                      <i className="bi bi-arrow-right"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 3. SEZIONE IN BASSO A DESTRA: IL 1 BOX ISOLATO (Archivio Dati) */}
      <div className="d-flex ms-auto mt-auto shrink-0 pt-2">
        <div 
          className={`card shadow-sm rounded-0 db-card-hover ${isDatabaseActive ? 'border-dark' : 'border border-secondary-subtle bg-body-secondary'}`} 
          style={{ width: '320px', height: '100px' }}
        >
          <div className="card-body p-2.5 d-flex flex-column justify-content-between h-100">
            {isDatabaseActive ? (
              <>
                <div className="d-flex align-items-center justify-content-between mb-1">
                  <div className="d-flex align-items-center gap-2">
                    <div className="p-1.5 rounded-0 d-flex align-items-center justify-content-center bg-light border border-light-subtle text-info" style={{ width: '28px', height: '28px' }}>
                      <i className="bi bi-database fs-6"></i>
                    </div>
                    <span className="fw-bold text-dark fs-13">Archivio Dati</span>
                  </div>
                  <button
                    onClick={() => {
                      setIsDatabaseActive(false);
                      setConfirmingRestore(false);
                    }}
                    className="btn btn-sm btn-link text-dark p-0 fs-13"
                    title="Chiudi"
                  >
                    <i className="bi bi-gear-fill"></i>
                  </button>
                </div>

                {confirmingRestore ? (
                  <div className="px-1.5 py-1 px-2 rounded-0">
                    <p className="text-danger fw-semibold mb-1 fs-10">
                      Sovrascrivere i dati correnti?
                    </p>
                    <div className="d-flex gap-2">
                      <button onClick={handleConfirmRestoreExecution} className="btn btn-danger btn-sm rounded-0 w-50 py-0 fs-10">Conferma</button>
                      <button onClick={handleCancelRestore} className="btn btn-outline-secondary btn-sm rounded-0 w-50 py-0 fs-10">Annulla</button>
                    </div>
                  </div>
                ) : (
                  <div className="d-flex gap-2">
                    <button onClick={handleBackup} className="btn btn-outline-dark btn-sm rounded-0 w-50 py-1 fw-bold fs-12" title="Backup" disabled={isRestoring}>
                      <i className="bi bi-download me-1"></i> Backup
                    </button>
                    <button onClick={handleRestoreClick} className="btn btn-outline-danger btn-sm rounded-0 w-50 py-1 fw-bold fs-12" title="Ripristina" disabled={isRestoring}>
                      <i className="bi bi-upload me-1"></i> Ripristina
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="d-flex align-items-center justify-content-center h-100">
                <button
                  onClick={() => {
                    setIsDatabaseActive(true);
                    setConfirmingRestore(false);
                  }}
                  className="btn btn-link p-0 d-flex align-items-center justify-content-center w-100 fs-3 text-secondary"
                  title="Configurazione Archivio"
                >
                  <i className="bi bi-gear-fill"></i>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default DashboardPage;