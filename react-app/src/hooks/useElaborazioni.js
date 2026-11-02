// src/hooks/useElaborazioni.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { getElaborazioni } from '../services/api';

/**
 * Custom hook to fetch and manage data processing summaries (elaborazioni) 
 * based on dynamic filter criteria (such as year, customer, or parent code).
 * 
 * @param {Object} filters - Filtering options required to fetch processing data (must include at least a year).
 * @returns {Object} State values (summaryData, loading, error) and a manual refetch trigger function.
 */
export const useElaborazioni = (filters) => {
  // State to store the processed summary response data from the backend
  const [summaryData, setSummaryData] = useState(null);
  
  // State to track whether a fetch operation is currently in progress
  const [loading, setLoading] = useState(false);
  
  // State to store any errors encountered during the API request
  const [error, setError] = useState(null);
  
  const requestIdRef = useRef(0);
  const year = filters?.year;
  const customerId = filters?.customer_id;
  const parentCode = filters?.parent_code;

  const refetch = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!year) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getElaborazioni({
        year, customer_id: customerId, parent_code: parentCode
      });
      const payload = response?.success && response?.data ? response.data : response;
      if (requestId === requestIdRef.current) setSummaryData(payload);
      return payload;
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err);
      throw err;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [year, customerId, parentCode]);

  useEffect(() => {
    refetch().catch(err => console.error('Errore caricamento elaborazioni:', err));
    return () => { requestIdRef.current++; };
  }, [refetch]);

  return {
    summaryData,
    loading,
    error,
    refetch
  };
};

export default useElaborazioni;