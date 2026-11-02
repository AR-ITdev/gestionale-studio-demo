import { useState, useEffect, useCallback, useRef } from 'react';
import { getVarie, createVarie, updateVarie, deleteVarie } from '../services/api';

/**
 * Custom hook to manage miscellaneous ("varie") accounting records, filtering data by 
 * transaction period (year and month), supporting request cancellation via AbortController, 
 * and handling full CRUD lifecycle operations.
 * 
 * @param {Object} selectedTransaction - Object containing the selected year and month parameters.
 * @returns {Object} State values and mutation handlers for managing miscellaneous items.
 */
export const useVarie = (selectedTransaction) => {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Extract year and month criteria from the selected transaction object
  const year = selectedTransaction?.year;
  const month = selectedTransaction?.month;

  // Reference to track active AbortController instances for ongoing API requests cancellation
  const abortControllerRef = useRef(null);

  /**
   * Fetches miscellaneous records from the backend API for the active year and month.
   * Automatically aborts any prior pending requests to prevent race conditions.
   */
  const fetchData = useCallback(async () => {
    if (!year || !month) {
      setRowData([]);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      const data = await getVarie(year, month, undefined, controller.signal);
      
      if (!controller.signal.aborted) {
        setRowData(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        console.error("Errore nel recupero degli elementi Varie:", err);
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

  // Effect hook to trigger initial data loading on mount or period change, handling cleanup and abort signals
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      if (!year || !month) {
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
        const data = await getVarie(year, month, undefined, controller.signal);
        
        if (isMounted && !controller.signal.aborted) {
          setRowData(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && isMounted && !controller.signal.aborted) {
          console.error("Errore nel recupero degli elementi Varie:", err);
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

    // Cleanup function to flag component as unmounted and abort active requests
    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [year, month]);

  /**
   * Handles individual cell updates, formatting payloads properly (e.g., embedding notes 
   * inside custom_data JSON structures if the modified field is "note").
   */
  const handleCellValueChanged = async ({ data, field, newValue }) => {
    try {
      setError(null);
      
      let payload = { [field]: newValue };

      // Se la struttura dati delle varie prevede "note" dentro custom_data
      if (field === 'note') {
        let customDataObj = {};
        try {
          customDataObj = typeof data.custom_data === 'string' 
            ? JSON.parse(data.custom_data || '{}') 
            : (data.custom_data || {});
        } catch {
          customDataObj = {};
        }
        
        customDataObj.note = newValue;
        payload = { custom_data: JSON.stringify(customDataObj) };
      }

      const updated = await updateVarie(data.id, payload);
      
      // Optimistically update local row data state with updated values
      setRowData((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, ...payload, ...updated } : item))
      );
      return updated;
    } catch (err) {
      console.error("Errore aggiornamento cella Varie:", err);
      setError(err);
      throw err;
    }
  };

  /**
   * Creates a new miscellaneous item tied to the active year and month, then refreshes dataset.
   */
  const addItem = async (newItemData) => {
    try {
      setError(null);
      const created = await createVarie({
        ...newItemData,
        year: year,
        month: month
      });
      await fetchData();
      return created;
    } catch (err) {
      console.error("Errore aggiunta elemento Varie:", err);
      setError(err);
      throw err;
    }
  };

  /**
   * Deletes a miscellaneous record by ID and removes it optimistically from the local state list.
   */
  const deleteItem = async (itemId) => {
    try {
      setError(null);
      await deleteVarie(itemId);
      setRowData((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      console.error("Errore eliminazione elemento Varie:", err);
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
    fetchData,
    handleCellValueChanged,
    addItem,
    deleteItem,
  };
};

export default useVarie;