import { useMemo } from 'react';

/**
 * PeriodNavigation component provides a period switcher control (previous/next months)
 * based on available transaction items, handling URL history updates and prompting
 * confirmation when unsaved changes exist.
 */
export const PeriodNavigation = ({
  year,
  month,
  selectedTransaction,
  transactionsList,
  hasPendingChanges,
  disabled = false,
  onPeriodChange,
  setSelectedTransaction,
  setGlobalDrafts,
  setHasGlobalDirty,
  setRemovedCustomerIds,
  setAddedCustomerIds,
  onConfirmModal // Optional custom modal support if provided
}) => {
  // Determine active display year and month from selected transaction or fallback props
  const activeDisplayYear = Number(selectedTransaction?.year || year);
  const activeDisplayMonth = Number(selectedTransaction?.month || month);

  // Compute previous and next available transaction periods from the transactions list
  const { prevTransaction, nextTransaction } = useMemo(() => {
    if (!Array.isArray(transactionsList) || transactionsList.length === 0) {
      return { prevTransaction: null, nextTransaction: null };
    }

    const currentVal = activeDisplayYear * 12 + activeDisplayMonth;
    const uniqueMap = new Map();
    transactionsList.forEach((t) => {
      const y = Number(t.year);
      const m = Number(t.month);
      if (!isNaN(y) && !isNaN(m)) {
        uniqueMap.set(`${y}-${m}`, { year: y, month: m });
      }
    });

    const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
      return (a.year * 12 + a.month) - (b.year * 12 + b.month);
    });

    let exactIndex = sorted.findIndex(
      (t) => t.year === activeDisplayYear && t.month === activeDisplayMonth
    );

    let prev = null;
    let next = null;

    if (exactIndex !== -1) {
      if (exactIndex > 0) prev = sorted[exactIndex - 1];
      if (exactIndex < sorted.length - 1) next = sorted[exactIndex + 1];
    } else {
      for (let i = 0; i < sorted.length; i++) {
        const val = sorted[i].year * 12 + sorted[i].month;
        if (val < currentVal) {
          prev = sorted[i];
        } else if (val > currentVal) {
          next = sorted[i];
          break;
        }
      }
    }

    return { prevTransaction: prev, nextTransaction: next };
  }, [transactionsList, activeDisplayYear, activeDisplayMonth]);

  // Execute period transition by clearing drafts, updating URL, and setting state
  const executeNavigation = (targetYear, targetMonth) => {
    setGlobalDrafts({});
    setHasGlobalDirty(false);
    setRemovedCustomerIds([]);
    setAddedCustomerIds([]);
    setSelectedTransaction({ year: targetYear, month: targetMonth });
    if (onPeriodChange) onPeriodChange({ year: targetYear, month: targetMonth });
  };

  // Common navigation handler checking for pending unsaved changes before switching periods
  const commonNavigationLogic = (targetYear, targetMonth) => {
    if (disabled) return false;
    if (hasPendingChanges) {
      if (typeof onConfirmModal === 'function') {
        onConfirmModal({
          title: 'Modifiche non salvate',
          message: 'Hai modifiche non salvate. Vuoi cambiare periodo?',
          onConfirm: () => executeNavigation(targetYear, targetMonth)
        });
        return false;
      } else {
        if (!window.confirm('Hai modifiche non salvate. Vuoi cambiare periodo?')) return false;
      }
    }
    executeNavigation(targetYear, targetMonth);
    return true;
  };

  const hasPrev = Boolean(prevTransaction);
  const hasNext = Boolean(nextTransaction);

  return (
    <div className="btn-group btn-group-sm rounded-0" role="group" style={{ fontSize: '12px' }}>
      {/* Previous period navigation button */}
      <button
        type="button"
        onClick={() => prevTransaction && commonNavigationLogic(prevTransaction.year, prevTransaction.month)}
        disabled={disabled || !hasPrev}
        className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${hasPrev ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`}
        style={{ fontSize: '12px', lineHeight: '1.5' }}
        title={hasPrev ? `Mese precedente (${String(prevTransaction.month).padStart(2, '0')}/${prevTransaction.year})` : "Nessun dato precedente"}
      >
        <i className="bi bi-chevron-left" />
      </button>

      {/* Current period display badge */}
      <button
        type="button"
        className="btn btn-sm btn-light text-dark fw-bold border border-secondary-subtle rounded-0 px-3 py-1 shadow-none d-flex align-items-center gap-1"
        style={{ fontSize: '13px', lineHeight: '1.5', cursor: 'default', minWidth: '85px' }}
      >
        <i className="bi bi-file-earmark-text text-secondary" style={{ fontSize: '11px' }} />
        <span>{String(activeDisplayMonth).padStart(2, '0')}/{activeDisplayYear}</span>
      </button>

      {/* Next period navigation button */}
      <button
        type="button"
        onClick={() => nextTransaction && commonNavigationLogic(nextTransaction.year, nextTransaction.month)}
        disabled={disabled || !hasNext}
        className={`btn btn-sm rounded-0 px-2 py-1 shadow-none ${hasNext ? 'btn-outline-secondary text-dark border' : 'btn-light text-muted border opacity-50'}`}
        style={{ fontSize: '12px', lineHeight: '1.5' }}
        title={hasNext ? `Mese successivo (${String(nextTransaction.month).padStart(2, '0')}/${nextTransaction.year})` : "Nessun dato successivo"}
      >
        <i className="bi bi-chevron-right" />
      </button>
    </div>
  );
};

export default PeriodNavigation;