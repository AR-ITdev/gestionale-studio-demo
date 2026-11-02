import { useState, useEffect, useCallback, useRef } from 'react';
import { getClienti, saveBatch } from '../services/api';

/**
 * Custom hook to manage client (clienti) data state, pagination parameters,
 * API requests, error parsing, and batch or direct CRUD operations.
 * 
 * @returns {Object} State values and action handlers for managing client records.
 */
export const useClienti = () => {
    const [rowData, setRowData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);
    const applySavedCustomers = saved => {
        requestIdRef.current++;
        setRowData(saved.customers);
        setError(null);
        setLoading(false);
    };

    /**
     * Fetches client records from the backend API, supporting optional search terms,
     * pagination limits, and page offsets.
     */
    const fetchData = useCallback(async (searchTerm = "", currentPage = null, limit = null) => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);
        try {
            const offset = (currentPage && limit) ? (currentPage - 1) * limit : null;
            const response = await getClienti(searchTerm, limit, offset);
            const data = Array.isArray(response) ? response : (response?.data || []);
            if (requestId === requestIdRef.current) setRowData([...data]);
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            console.error("ERRORE CRITICO NELLA FETCH:", err);
            setError(err);
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, []);

    /**
     * Parses API errors into user-friendly messages, specifically checking 
     * for unique constraints or duplicate entry conflicts.
     */
    const parseApiError = (err, defaultMessage) => {
        const errorMsg = err?.response?.data?.message || err?.message || String(err);
        const lowerMsg = errorMsg.toLowerCase();

        if (lowerMsg.includes("duplicate entry") || lowerMsg.includes("unique constraint")) {
            return "Errore: Valore già registrato nel sistema.";
        }
        return err?.response?.data?.message || defaultMessage;
    };

    /**
     * Creates a new client directly and refreshes the client table data upon success.
     */
    const createNewClienteDirect = async (nuovoCliente) => {
        try {
            setError(null);
            const saved = await saveBatch([{ table: 'customers', method: 'POST', data: nuovoCliente }], { readCustomers: true });
            applySavedCustomers(saved);
            return { success: true };
        } catch (err) {
            setError(err);
            const errorMessage = parseApiError(err, "Impossibile creare il cliente.");
            return { success: false, message: errorMessage };
        }
    };

    /**
     * Updates a single existing client by ID and refreshes the data list.
     */
    const editSingleCliente = async (id, payload) => {
        try {
            setError(null);
            const saved = await saveBatch([{ table: 'customers', method: 'PUT', id, data: payload }], { readCustomers: true });
            applySavedCustomers(saved);
            return { success: true };
        } catch (err) {
            setError(err);
            const errorMessage = parseApiError(err, "Impossibile aggiornare il cliente.");
            return { success: false, message: errorMessage };
        }
    };

    /**
     * Deletes a client record by ID and refreshes the list.
     */
    const removeCliente = async (id) => {
        try {
            setError(null);
            const saved = await saveBatch([{ table: 'customers', method: 'DELETE', id }], { readCustomers: true });
            applySavedCustomers(saved);
            return { success: true };
        } catch (err) {
            setError(err);
            const errorMessage = parseApiError(err, "Impossibile eliminare il cliente.");
            return { success: false, message: errorMessage };
        }
    };

    /**
     * Performs a batch save operation, processing item deletions and updates sequentially
     * before reloading the complete client dataset.
     */
    const saveClienti = async (currentRows, deletedIds = []) => {
        try {
            setError(null);
            const operations = deletedIds.map(id => ({ table: 'customers', method: 'DELETE', id }));
            for (const row of currentRows) {
                if (deletedIds.includes(row.id)) continue;
                operations.push({ table: 'customers', method: 'PUT', id: row.id, data: {
                    customer_code: row.customer_code,
                    parent_code: row.parent_code,
                    tax_id: row.tax_id,
                    name: row.name
                } });
            }

            const saved = await saveBatch(operations, { readCustomers: true });
            applySavedCustomers(saved);
            return { success: true, message: "Tutti i dati sono stati salvati con successo!" };
        } catch (err) {
            console.error("Errore durante il salvataggio:", err);
            setError(err);
            const userFriendlyMessage = parseApiError(err, "Errore durante il salvataggio dei dati.");
            return { success: false, message: userFriendlyMessage };
        }
    };

    // Automatically trigger initial data fetching safely using queueMicrotask on mount
    useEffect(() => {
        let active = true;
        queueMicrotask(() => {
            if (active) fetchData();
        });
        return () => {
            active = false;
            requestIdRef.current++;
        };
    }, [fetchData]);

    return {
        rowData,
        setRowData,
        loading,
        error,
        createNewClienteDirect,
        editSingleCliente,
        removeCliente,
        fetchData,
        saveClienti
    };
};

export default useClienti;