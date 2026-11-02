import { useState, useEffect, useCallback, useRef } from 'react';
import { getRedditi, createCategoryItem, updateCategoryItem, deleteCategoryItem } from '../services/api';

/**
 * Custom hook to manage income (redditi) state, filtering data by transaction period (year and month),
 * handling request cancellations via AbortController, and executing full CRUD operations for income category items.
 * 
 * @param {Object} selectedTransaction - Object containing the selected year and month filtering criteria.
 * @returns {Object} State values and action handlers for managing income data.
 */
export const useRedditi = (selectedTransaction) => {
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Extract year and month parameters from the selected transaction object
  const year = selectedTransaction?.year;
  const month = selectedTransaction?.month;

  // Reference to track active AbortController instances for ongoing API request cancellation
  const abortControllerRef = useRef(null);

  /**
   * Fetches income records from the backend API for the active year and month.
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
      
      const data = await getRedditi(year, month, undefined, controller.signal);
      
      if (!controller.signal.aborted) {
        setRowData(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && !controller.signal.aborted) {
        console.error("Errore durante il recupero dei dati redditi:", err);
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

  // Effect hook to load initial income data on mount or when year/month changes, handling cleanup and abort signals
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
        
        const data = await getRedditi(year, month, undefined, controller.signal);
        
        if (isMounted && !controller.signal.aborted) {
          setRowData(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && isMounted && !controller.signal.aborted) {
          console.error("Errore durante il recupero dei dati redditi:", err);
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
   * Handles individual cell value updates, formatting payloads properly based on modified fields
   * (e.g., parsing prices, quantities, or embedding notes inside custom_data JSON attributes).
   */
  const handleCellValueChanged = async ({ data, field, newValue }) => {
    try {
      setError(null);
      if (!data || !data.id) {
        console.error("Impossibile aggiornare la cella: ID record mancante.");
        return;
      }

      let payload = {};

      if (field === 'price') {
        payload = { price: Number(newValue) };
      } else if (field === 'quantity') {
        payload = { quantity: Number(newValue) };
      } else if (field === 'note') {
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

      await updateCategoryItem(data.id, payload);

      // Optimistically update local row data state with the new payload values
      setRowData((prevRows) =>
        prevRows.map((row) => {
          if (row.id === data.id) {
            return { ...row, ...payload };
          }
          return row;
        })
      );
    } catch (err) {
      console.error("Errore durante l'aggiornamento della cella:", err);
      setError(err);
      throw err;
    }
  };

  /**
   * Creates a new income item associated with the current category, year, and month, 
   * then refreshes the dataset.
   */
  const addItem = async (newItemData) => {
    try {
      setError(null);
      const payload = {
        ...newItemData,
        category: 'REDDITI',
        year: year,
        month: month
      };
      
      const createdItem = await createCategoryItem(payload);
      await fetchData();
      return createdItem;
    } catch (err) {
      console.error("Errore durante l'aggiunta dell'elemento:", err);
      setError(err);
      throw err;
    }
  };

  /**
   * Deletes an income record by ID and removes it from the local row data state.
   */
  const deleteItem = async (itemId) => {
    try {
      setError(null);
      await deleteCategoryItem(itemId);
      setRowData((prevRows) => prevRows.filter((row) => row.id !== itemId));
    } catch (err) {
      console.error("Errore durante l'eliminazione dell'elemento:", err);
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

export default useRedditi;