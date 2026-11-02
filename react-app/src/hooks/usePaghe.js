import { useState, useEffect, useCallback, useRef } from 'react';
import { getPaghe, updatePaghe, createPaghe, deletePaghe as deletePagheApi } from '../services/api';

const formatRows = rows => rows.map(item => {
  let custom;
  try {
    custom = typeof item.custom_data === 'string'
      ? JSON.parse(item.custom_data || '{}')
      : (item.custom_data || {});
  } catch {
    custom = {};
  }
  return { ...item, note: custom.note || '' };
});

/**
 * Custom hook to manage payroll (paghe) records, fetching data based on transaction periods,
 * handling cell updates (including custom JSON attributes like notes), and full CRUD lifecycle operations.
 * 
 * @param {Object|number} transactionId - Transaction identifier object containing year and month properties.
 * @returns {Object} State values and mutation methods for managing payroll items.
 */
export const usePaghe = (transactionId) => {
  const [rowData, setRowData] = useState([]);
  const [loadedPeriod, setLoadedPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  // Safely extract year and month properties from the transactionId object parameter
  const year = typeof transactionId === 'object' ? transactionId?.year : null;
  const month = typeof transactionId === 'object' ? transactionId?.month : null;

  // ------------------------------------------------------------------
  // DATA FETCHING
  // ------------------------------------------------------------------
  const fetchData = useCallback(async (search = "") => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getPaghe(year, month, search);
      if (requestId !== requestIdRef.current) return;
      if (!Array.isArray(data)) throw new Error('Risposta dati paghe non valida.');
      setRowData(formatRows(data));
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Errore recupero paghe:", err);
      setRowData([]);
      setError(err);
      throw err;
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadedPeriod({ year, month });
        setLoading(false);
      }
    }
  }, [year, month]);

  // ------------------------------------------------------------------
  // CELL / RECORD UPDATE HANDLER
  // ------------------------------------------------------------------
  const handleCellValueChanged = async (params) => {
    const { data, field, newValue } = params;
    let payload = { [field]: newValue };

    // Special handling if the modified field is specifically the "note" column
    if (field === "note") {
      let custom;
      try {
        custom = typeof data.custom_data === 'string'
          ? JSON.parse(data.custom_data || "{}")
          : (data.custom_data || {});
      } catch {
        custom = {};
      }
      
      custom.note = newValue;
      payload = { custom_data: JSON.stringify(custom) };
    }

    try {
      await updatePaghe(data.id, payload);
      await fetchData();
    } catch (err) {
      console.error("Errore aggiornamento voce paghe:", err);
      throw err;
    }
  };

  // ------------------------------------------------------------------
  // NEW ITEM CREATION
  // ------------------------------------------------------------------
  const addItem = async (customItemData = {}) => {
    let customDataStr = '{}';

    if (customItemData.custom_data) {
      customDataStr = typeof customItemData.custom_data === 'object'
        ? JSON.stringify(customItemData.custom_data)
        : customItemData.custom_data;
    } else if (customItemData.note !== undefined) {
      customDataStr = JSON.stringify({ note: customItemData.note });
    }

    const newItem = {
      year: customItemData.year || year,
      month: customItemData.month || month,
      customer_id: customItemData.customer_id,
      service_id: customItemData.service_id,
      quantity: customItemData.quantity ?? 1,
      price: customItemData.price ?? 0.0,
      custom_data: customDataStr,
      ...customItemData
    };

    try {
      await createPaghe(newItem);
      await fetchData();
    } catch (err) {
      console.error("Errore inserimento voce paghe:", err);
      throw err;
    }
  };

  // ------------------------------------------------------------------
  // RECORD DELETION
  // ------------------------------------------------------------------
  const deleteItem = async (id) => {
    try {
      await deletePagheApi(id);
      await fetchData();
    } catch (err) {
      console.error("Errore eliminazione voce paghe:", err);
      throw err;
    }
  };

  const removeItem = async (id) => {
    if (window.confirm("Vuoi davvero eliminare questa voce dalle paghe?")) {
      return await deleteItem(id);
    }
  };

  // Effect hook to load initial payroll data on mount or when year/month filters change
  useEffect(() => {
    fetchData().catch(() => {
      // The current failure is exposed through error and logged by fetchData.
    });

    // Cleanup function to prevent state updates after component unmounts
    return () => {
      requestIdRef.current++;
    };
  }, [fetchData]);

  const isCurrentPeriod = loadedPeriod?.year === year && loadedPeriod?.month === month;
  return { 
    rowData: isCurrentPeriod ? rowData : [],
    loading: loading || !isCurrentPeriod,
    error: isCurrentPeriod ? error : null,
    replaceRows: rows => {
      requestIdRef.current++;
      setRowData(formatRows(rows));
      setLoadedPeriod({ year, month });
      setLoading(false);
      setError(null);
    },
    handleCellValueChanged, 
    addItem, 
    deleteItem, 
    removeItem, 
    deletePaghe: deleteItem, 
    fetchData 
  };
};

export default usePaghe;