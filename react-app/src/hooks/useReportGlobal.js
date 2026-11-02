// src/hooks/useReportGlobal.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { getReportGlobal } from '../services/api';

/**
 * Custom hook to fetch and manage global financial or customer report data 
 * based on filter parameters (customer ID, parent code, and year), 
 * safely normalizing backend response fields and analysis year.
 * 
 * @param {Object} filters - Filtering criteria containing customer_id, parent_code, and year.
 * @returns {Object} State values (reportData, analysisYear, loading, error) and a refetch function.
 */
export const useReportGlobal = (filters) => {
  const [reportData, setReportData] = useState([]);
  const [analysisYear, setAnalysisYear] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  // Extract filter parameters safely
  const customerId = filters?.customer_id;
  const parentCode = filters?.parent_code;
  const year = filters?.year;

  /**
   * Fetches global report records from the backend API using current filters,
   * normalizes fields, and handles data mapping for UI consumption.
   */
  const fetchReport = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await getReportGlobal({
        customer_id: customerId,
        parent_code: parentCode,
        year: year
      });
      if (requestId !== requestIdRef.current) return;

      let rawList = [];
      let resolvedYear = new Date().getFullYear();

      if (response && !Array.isArray(response) && response.data) {
        rawList = Array.isArray(response.data) ? response.data : [];
        if (response.analysisYear) {
          resolvedYear = Number(response.analysisYear);
        }
      } else if (Array.isArray(response)) {
        rawList = response;
      }

      setAnalysisYear(resolvedYear);
      
      // Safe mapping: intercept any possible backend key variant for balance and attributes
      const formattedData = rawList.map((item) => {
        const rawBalance = item.balance ?? item.saldo ?? item.total_balance ?? item.amount ?? 0;

        return {
          id: item.id || item.customer_id,
          code: item.code || item.customer_code || 'N/D',
          name: item.name || item.ragione_sociale || 'Cliente Sconosciuto',
          year: Number(item.year || item.app || resolvedYear),
          app: Number(item.app || item.year || resolvedYear),
          balance: Number(rawBalance),
          contabilita: Number(item.contabilita || 0),
          redditi: Number(item.redditi || 0),
          paghe: Number(item.paghe || 0),
          varie: Number(item.varie || 0),
          totalDebt: Number(item.totalDebt || 0),
          totalDiscount: Number(item.totalDiscount || 0),
          totalPaid: Number(item.totalPaid || 0),
          notes: item.notes || null,
          lastPaymentDate: item.lastPaymentDate || item.last_payment_date || null,
          lastPaymentRaw: item.lastPaymentRaw || item.last_payment_raw || 0
        };
      });

      setReportData(formattedData);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Errore durante il recupero del report globale:", err);
      setError(err);
      setReportData([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [customerId, parentCode, year]);

  useEffect(() => {
    fetchReport();
    return () => {
      requestIdRef.current++;
    };
  }, [fetchReport]);

  return {
    reportData,
    analysisYear,
    loading,
    error,
    refetch: fetchReport
  };
};

export default useReportGlobal;