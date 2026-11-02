import { useState, useEffect, useCallback } from 'react';
import { getServices } from '../services/api';

/**
 * Custom hook to fetch and manage services data based on dynamic and normalized filters,
 * handling loading states, errors, and providing a refetch utility.
 * 
 * @param {Object} [filters={}] - Initial filtering options for services.
 * @returns {Object} State values (services, loading, error) and refetchServices function.
 */
export const useServices = (filters = {}) => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Normalizziamo i filtri per evitare che un oggetto passato per errore 
  // (es. category come oggetto intero) diventi "[object Object]" nell'URL
  const categoryValue = filters?.category;
  const category = categoryValue && typeof categoryValue === 'object'
    ? (categoryValue.id || categoryValue.value || categoryValue.name || undefined)
    : (categoryValue || undefined);

  /**
   * Fetches services list from the backend API using the normalized filters.
   * Wrapped in useCallback for referential stability.
   */
  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getServices(category);
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Errore durante il recupero dei servizi:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [category]);

  // Effect hook to load initial services data on mount or when filter values change, using a mounted guard
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        if (isMounted) {
          setLoading(true);
          setError(null);
        }
        const data = await getServices(category);
        if (isMounted) {
          setServices(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Errore durante il recupero dei servizi:", err);
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
  }, [category]);

  return {
    services,
    loading,
    error,
    refetchServices: fetchServices
  };
};

export default useServices;