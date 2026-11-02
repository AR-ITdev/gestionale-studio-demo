import { demoFetch } from '../demo/demoBackend.js';

// Demo build: every request is answered in the browser by the simulated backend in ../demo.
const BASE_URL = 'http://gestionale.demo/api';

const apiFetch = async (endpoint, options = {}) => {
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.append('_t', Date.now().toString());

  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  };

  const response = await demoFetch(url.toString(), config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.error || errorData.message || `Errore HTTP (${response.status})`);
    err.response = { data: errorData };
    throw err;
  }

  if (response.status === 204) return true;
  return await response.json();
};

export const saveBatch = (operations, options = {}) => apiFetch('/batch', {
  method: 'POST',
  body: JSON.stringify({ operations, ...options })
});

export const savePayments = (payments) => {
  const records = Array.isArray(payments) ? payments : [payments];
  return saveBatch(records.map(({ customer_name, ...data }) => ({
    table: 'payments', method: 'POST', data
  })));
};

// --- SERVICES ---
export const getServices = (category) => apiFetch(category ? `/services?category=${encodeURIComponent(category)}` : '/services');
export const createService = (data) => apiFetch('/services', { method: 'POST', body: JSON.stringify(data) });
export const updateService = (id, data) => apiFetch(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteService = (id) => apiFetch(`/services/${id}`, { method: 'DELETE' });

// --- CLIENTS ---
export const getClienti = (searchTerm, limit, offset) => {
  const params = new URLSearchParams();
  if (searchTerm) params.append('q', searchTerm);
  if (limit != null) params.append('limit', limit);
  if (offset != null) params.append('offset', offset);
  return apiFetch(`/clienti?${params.toString()}`);
};
export const getCustomersGroupedSearch = (searchTerm) => {
  const params = new URLSearchParams();
  if (searchTerm) params.append('q', searchTerm);
  return apiFetch(`/customers/search-grouped?${params.toString()}`);
};
export const createCliente = (data) => apiFetch('/clienti', { method: 'POST', body: JSON.stringify(data) });
export const updateCliente = (id, data) => apiFetch(`/clienti/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCliente = (id) => apiFetch(`/clienti/${id}`, { method: 'DELETE' });

// --- ITEMS & CATEGORIES ---
export const getCategoryItems = (category, year, month, searchTerm) => {
  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (year != null) params.append('year', year);
  if (month != null) params.append('month', month);
  if (searchTerm) params.append('q', searchTerm);
  return apiFetch(`/items?${params.toString()}`);
};
export const createCategoryItem = (data) => apiFetch('/items', { method: 'POST', body: JSON.stringify(data) });
export const updateCategoryItem = (id, data) => apiFetch(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCategoryItem = (id) => apiFetch(`/items/${id}`, { method: 'DELETE' });

// --- TRANSACTIONS ---
export const getTransactions = (filters) => {
  if (typeof filters === 'string') {
    return apiFetch(filters ? `/transactions?category=${encodeURIComponent(filters)}` : '/transactions');
  }
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.year != null && filters.year !== 'all') params.append('year', filters.year);
  
  if (filters?.status != null && filters.status !== 'all') {
    const statusNum = Number(filters.status);
    if (!isNaN(statusNum)) {
      params.append('status', statusNum);
    }
  }

  if (filters?.q) params.append('q', filters.q);
  
  return apiFetch(`/transactions?${params.toString()}`);
};
export const createTransaction = (data) => apiFetch('/transactions', { method: 'POST', body: JSON.stringify(data) });
export const updateTransaction = (cat, y, m, data) => apiFetch(`/transactions/${cat}/${y}/${m}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTransaction = (cat, y, m) => apiFetch(`/transactions/${cat}/${y}/${m}`, { method: 'DELETE' });

export const duplicateTransaction = (transaction, targetYear, targetMonth) =>
  apiFetch(`/transactions/${transaction.category}/${transaction.year}/${transaction.month}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ year: targetYear, month: targetMonth })
  });

// --- PAGHE ---
export const getPaghe = (year, month, searchTerm) => {
  const params = new URLSearchParams();
  if (year != null) params.append('year', year);
  if (month != null) params.append('month', month);
  if (searchTerm) params.append('q', searchTerm);
  return apiFetch(`/paghe?${params.toString()}`);
};
export const createPaghe = (data) => apiFetch('/paghe', { method: 'POST', body: JSON.stringify(data) });
export const updatePaghe = (id, data) => apiFetch(`/paghe/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePaghe = (id) => apiFetch(`/paghe/${id}`, { method: 'DELETE' });

// --- CONTABILITA ---
export const getContabilita = (year, month, searchTerm, signal) => {
  const params = new URLSearchParams();
  if (year != null) params.append('year', year);
  if (month != null) params.append('month', month);
  if (searchTerm) params.append('q', searchTerm);
  return apiFetch(`/contabilita?${params.toString()}`, { signal });
};
export const createContabilita = (data) => apiFetch('/contabilita', { method: 'POST', body: JSON.stringify(data) });
export const updateContabilita = (id, data) => apiFetch(`/contabilita/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteContabilita = (id) => apiFetch(`/contabilita/${id}`, { method: 'DELETE' });

// --- REDDITI ---
export const getRedditi = (year, month, searchTerm, signal) => {
  const params = new URLSearchParams();
  if (year != null) params.append('year', year);
  if (month != null) params.append('month', month);
  if (searchTerm) params.append('q', searchTerm);
  return apiFetch(`/redditi?${params.toString()}`, { signal });
};
export const createRedditi = (data) => apiFetch('/redditi', { method: 'POST', body: JSON.stringify(data) });
export const updateRedditi = (id, data) => apiFetch(`/redditi/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteRedditi = (id) => apiFetch(`/redditi/${id}`, { method: 'DELETE' });

// --- VARIE ---
export const getVarie = (year, month, searchTerm, signal) => {
  const params = new URLSearchParams();
  if (year != null) params.append('year', year);
  if (month != null) params.append('month', month);
  if (searchTerm) params.append('q', searchTerm);
  return apiFetch(`/varie?${params.toString()}`, { signal });
};
export const createVarie = (data) => apiFetch('/varie', { method: 'POST', body: JSON.stringify(data) });
export const updateVarie = (id, data) => apiFetch(`/varie/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteVarie = (id) => apiFetch(`/varie/${id}`, { method: 'DELETE' });

// --- CASSA ---
export const getCassaMovements = (filters) => {
  const params = new URLSearchParams();
  if (typeof filters === 'object' && filters !== null) {
    if (filters.year != null) params.append('year', filters.year);
    if (filters.month != null) params.append('month', filters.month);
    if (filters.startDate) params.append('start_date', filters.startDate);
    if (filters.endDate) params.append('end_date', filters.endDate);
    if (filters.types) params.append('types', filters.types);
  } else if (filters != null) {
    params.append('year', filters);
  }
  return apiFetch(`/cash-movements?${params.toString()}`);
};
export const createCashMovement = (data) => apiFetch('/cash-movements', { method: 'POST', body: JSON.stringify(data) });
export const updateCashMovement = (id, data) => apiFetch(`/cash-movements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCashMovement = (id) => apiFetch(`/cash-movements/${id}`, { method: 'DELETE' });

// --- PAYMENTS ---
export const getPayments = (filters) => {
  const params = new URLSearchParams();
  if (typeof filters === 'object' && filters !== null) {
    if (filters.year != null && String(filters.year).toLowerCase() !== 'all') params.append('year', filters.year);
    if (filters.customer_id != null) params.append('customer_id', filters.customer_id);
    if (filters.parent_code != null) params.append('parent_code', filters.parent_code);
    if (filters.q) params.append('q', filters.q);
  } else if (filters != null) {
    params.append('q', filters);
  }
  return apiFetch(`/payments?${params.toString()}`);
};
export const createPayment = (data) => apiFetch('/payments', { method: 'POST', body: JSON.stringify(data) });
export const updatePayment = (id, data) => apiFetch(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePayment = (id) => apiFetch(`/payments/${id}`, { method: 'DELETE' });

// --- ELABORAZIONI ---
export const getElaborazioni = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.year != null) params.append('year', filters.year);
  if (filters.customer_id != null) params.append('customer_id', filters.customer_id);
  if (filters.parent_code != null) params.append('parent_code', filters.parent_code);
  return apiFetch(`/elaborazioni?${params.toString()}`);
};

// --- REPORTS ---
export const getReportGlobal = (params) => {
  const queryParams = new URLSearchParams();
  if (typeof params === 'object' && params !== null) {
    if (params.year != null);
    if (params.customer_id != null) queryParams.append('customer_id', params.customer_id);
    if (params.parent_code != null) queryParams.append('parent_code', params.parent_code);
  }
  return apiFetch(`/reports/global?${queryParams.toString()}`);
};

// --- CUSTOMER YEARLY BALANCES SYNC ---
export const syncCustomerYearlyBalances = () => apiFetch('/customer-yearly-balances/sync', {
  method: 'POST'
});

// --- BACKUP & RESTORE ---
export const downloadDatabaseBackup = async () => {
  const response = await demoFetch(`${BASE_URL}/backup-db`);
  if (!response.ok) throw new Error("Errore nel download del backup");
  return await response.blob();
};

// Il backup della demo è un file JSON che viene letto e validato interamente nel browser.
export const restoreDatabase = async (formData) => {
    const response = await demoFetch(`${BASE_URL}/restore-db`, {
        method: 'POST',
        body: formData,
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Errore nel ripristino");
    return data;
};

// Funzione richiamata dal pulsante o dall'evento di upload del file di backup
export const handleRestoreAction = async (fileInput) => {
    try {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            alert("Seleziona prima un file di backup della demo (.json).");
            return;
        }

        const formData = new FormData();
        formData.append('dbFile', fileInput.files[0]);

        // Esegue il ripristino tramite il backend simulato
        const result = await restoreDatabase(formData);
        
        alert(result.message || "Backup demo ripristinato con successo!");

        // Ricarica completamente la pagina/app per pulire la cache e visualizzare subito i nuovi dati
        window.location.reload();

    } catch (error) {
        console.error("Errore durante il ripristino:", error);
        alert("Errore: " + error.message);
    }
};