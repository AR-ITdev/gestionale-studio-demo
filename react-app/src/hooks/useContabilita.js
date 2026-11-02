import { useState, useEffect, useCallback, useRef } from 'react';
import { getContabilita, createContabilita, updateContabilita, deleteContabilita } from '../services/api';

/**
 * Custom hook to manage accounting (contabilità) data state, transaction period filters (year and month),
 * request cancellation using AbortController, and full CRUD operations.
 * 
 * @param {Object} selectedTransaction - Object containing the selected year and month parameters.
 * @returns {Object} State values and mutation handlers for accounting data management.
 */
export const useContabilita = (selectedTransaction) => {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Extract and normalize numeric year and month filters from the selected transaction object
  const year = selectedTransaction?.year ? Number(selectedTransaction.year) : null;
  const month = selectedTransaction?.month ? Number(selectedTransaction.month) : null;

  // Reference to hold active AbortController instances for ongoing API requests cancellation
  const abortControllerRef = useRef(null);

  /**
   * Fetches accounting records from the API for the specified year and month.
   * Automatically aborts any previous pending requests to prevent race conditions.
   */
  const fetchData = useCallback(async () => {
    if (!year || !month || isNaN(year) || isNaN(month)) {
      setRowData([]);
      return;
    }

    // Abort any prior ongoing fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      
      const data = await getContabilita(year, month, undefined, controller.signal);
      
      if (!controller.signal.aborted) {
        setRowData(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        console.error('Errore durante il recupero dei dati di contabilità filtrati:', err);
        setError(err);
        setRowData([]);
        throw err;
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [year, month]);

  // Effect hook to trigger initial data loading and handle cleanup/aborts on unmount or filter changes
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      if (!year || !month || isNaN(year) || isNaN(month)) {
        if (isMounted) setRowData([]);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (isMounted) {
          setLoading(true);
          setError(null);
        }
        
        const data = await getContabilita(year, month, undefined, controller.signal);
        
        if (isMounted && !controller.signal.aborted) {
          setRowData(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && isMounted && !controller.signal.aborted) {
          console.error('Errore durante il recupero dei dati di contabilità filtrati:', err);
          setError(err);
          setRowData([]);
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    // Cleanup function to mark component as unmounted and abort active requests
    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [year, month]);

  /**
   * Handles individual cell updates, formatting payloads properly based on field types
   * (e.g., parsing prices, quantities, or embedding notes inside custom_data JSON structures).
   */
  const handleCellValueChanged = async (params) => {
    const { data, field, newValue } = params;
    if (!data || !data.id) return;

    let payload = {};

    if (field === 'price') {
      payload = { price: Number(newValue) };
    } else if (field === 'quantity') {
      payload = { quantity: Number(newValue) };
    } else if (field === 'note') {
      let currentCustomData;
      try {
        currentCustomData = typeof data.custom_data === 'string'
          ? JSON.parse(data.custom_data || '{}')
          : (data.custom_data || {});
      } catch {
        currentCustomData = {};
      }

      payload = {
        custom_data: JSON.stringify({
          ...currentCustomData,
          note: newValue
        })
      };
    } else {
      payload = { [field]: newValue };
    }

    try {
      setError(null);
      await updateContabilita(data.id, payload);
      setRowData((prevRows) =>
        prevRows.map((row) => (row.id === data.id ? { ...row, ...payload } : row))
      );
    } catch (err) {
      console.error('Errore durante l\'aggiornamento della cella:', err);
      setError(err);
      throw err;
    }
  };

  /**
   * Creates a new accounting record item for the current period and refreshes the data list.
   */
  const addItem = async (newItemData) => {
    try {
      setError(null);
      const response = await createContabilita({
        year: Number(year),
        month: Number(month),
        ...newItemData
      });
      await fetchData();
      return response;
    } catch (err) {
      console.error('Errore durante l\'aggiunta dell\'elemento:', err);
      setError(err);
      throw err;
    }
  };

  /**
   * Deletes an accounting item by ID and removes it optimistically from the local row data state.
   */
  const deleteItem = async (itemId) => {
    try {
      setError(null);
      await deleteContabilita(itemId);
      setRowData((prevRows) => prevRows.filter((row) => row.id !== itemId));
    } catch (err) {
      console.error('Errore durante la cancellazione dell\'elemento:', err);
      setError(err);
      throw err;
    }
  };

  return {
    rowData,
    replaceRows: rows => {
      abortControllerRef.current?.abort();
      setRowData(rows);
      setError(null);
      setLoading(false);
    },
    loading,
    error,
    handleCellValueChanged,
    addItem,
    deleteItem,
    fetchData
  };
};

export default useContabilita;