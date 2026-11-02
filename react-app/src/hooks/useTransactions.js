import { useState, useEffect, useCallback, useMemo } from 'react';
import { getTransactions } from '../services/api';

/**
 * Custom hook to fetch and manage financial transactions data based on filters,
 * handling loading states, errors, data sorting, and navigational helpers (next/previous periods).
 * 
 * @param {Object} [filters={}] - Optional filter criteria for fetching transactions.
 * @returns {Object} State values (transactions, loading, error) and utility functions (refreshTransactions, getNextOrPrev).
 */
export const useTransactions = (filters = {}) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize stringified filters to reliably track object dependency changes in effects
  const filtersString = useMemo(() => JSON.stringify(filters), [filters]);

  /**
   * Fetches transaction items from the backend API using current filter parameters.
   * Wrapped in useCallback for referential stability.
   */
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTransactions(filters);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Errore nel recupero transazioni:", err);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Effect hook to load initial transaction data on mount or when filters change, using a mounted guard
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        if (isMounted) {
          setLoading(true);
          setError(null);
        }
        const data = await getTransactions(filters);
        if (isMounted) {
          setTransactions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Errore nel recupero transazioni:", err);
          setError(err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialData();

    // Cleanup function to prevent state updates on unmounted components
    return () => {
      isMounted = false;
    };
  }, [filtersString, filters]);

  /**
   * Helper function to find the next or previous chronological transaction period 
   * relative to a given year and month.
   * 
   * @param {number|string} currentYear - The current transaction year.
   * @param {number|string} currentMonth - The current transaction month.
   * @param {string} [direction='next'] - Navigation direction ('next' or 'prev').
   * @returns {Object|null} The target transaction object, or null if none exists.
   */
  const getNextOrPrev = useCallback((currentYear, currentMonth, direction = 'next') => {
    if (!transactions.length) return null;

    // Sort transactions chronologically by year and month
    const sorted = [...transactions].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    // Locate the index of the currently active transaction period
    const currentIndex = sorted.findIndex(
      item => Number(item.year) === Number(currentYear) && Number(item.month) === Number(currentMonth)
    );

    if (currentIndex === -1) return null;

    // Determine the target index based on the direction argument
    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    return (targetIndex >= 0 && targetIndex < sorted.length) ? sorted[targetIndex] : null;
  }, [transactions]);

  return {
    transactions,
    loading,
    error,
    refreshTransactions: fetchTransactions,
    getNextOrPrev
  };
};

export default useTransactions;