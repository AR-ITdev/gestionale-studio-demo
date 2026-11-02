import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TransactionExplorer from '../components/TransactionExplorer';
import RedditiGrid from '../components/RedditiGrid';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import Alert from '../components/Alert';
import ConfirmModal from '../components/ConfirmModal';

/**
 * RedditiPage component handles income-related periodic transaction views and records (Redditi).
 * It dynamically toggles between the TransactionExplorer (for period selection) and 
 * the RedditiGrid (for managing detailed income records).
 */
export const RedditiPage = () => {
  // Retrieve the 'period' route parameter (formatted as YYYY-MM) if specified in URL
  const { period } = useParams();
  const navigate = useNavigate();
  
  // Custom hook to track and manage unsaved form changes to prevent unintended data loss
  const { hasUnsaved, setHasUnsaved } = useUnsavedChanges();

  // Local component state for notification alerts and confirmation dialog modals
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success', key: 0 });
  const [confirmState, setConfirmState] = useState({ show: false, title: '', message: '', onConfirm: null });

  /**
   * Triggers a temporary alert banner message.
   * @param {string} message - The text notification to display
   * @param {string} type - Alert status variant (e.g., 'success', 'danger')
   */
  const showAlert = (message, type = 'success') => setAlertInfo({ message, type, key: Date.now() });
  
  // Closes the active confirmation modal dialog
  const closeConfirm = () => setConfirmState({ show: false, title: '', message: '', onConfirm: null });
  
  // Parse the period route string into individual year and month properties if present
  const selectedTransaction = period ? (() => {
    const [year, month] = period.split('-');
    return { year, month };
  })() : null;

  /**
   * Handles navigation to a specific income transaction period view.
   * @param {Object} transaction - Object containing year and month values
   */
  const handleOpenTransaction = (transaction) => {
    if (transaction && transaction.year && transaction.month) {
      navigate(`/redditi/${transaction.year}-${transaction.month}`);
    }
  };

  /**
   * Handles navigation back to the main overview list, triggering a warning confirmation 
   * modal if there are unsaved modifications.
   */
  const handleBack = () => {
    if (hasUnsaved) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Hai modifiche non salvate. Vuoi davvero uscire?",
        onConfirm: () => {
          closeConfirm();
          setHasUnsaved(false);
          navigate('/redditi');
        }
      });
      return;
    }
    setHasUnsaved(false);
    navigate('/redditi');
  };

  /**
   * Updates the route dynamically when switching between different income periods.
   * @param {Object} newPeriod - Target period containing year and month fields
   */
  const handlePeriodChange = (newPeriod) => {
    if (newPeriod && newPeriod.year && newPeriod.month) {
      navigate(`/redditi/${newPeriod.year}-${newPeriod.month}`);
    }
  };

  // Render the explorer view if no specific period is currently selected in the URL
  if (!selectedTransaction && !period) {
    return (
      <div className="w-100 h-100 d-flex flex-column position-relative">
        <Alert key={alertInfo.key} message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success', key: 0 })} />
        <TransactionExplorer category="REDDITI" onOpenTransaction={handleOpenTransaction} showAlert={showAlert} />
      </div>
    );
  }

  // Render the specific period grid view when a time frame is active
  return (
    <div className="w-100 h-100 d-flex flex-column position-relative">
      <Alert key={alertInfo.key} message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success', key: 0 })} />
      <ConfirmModal show={confirmState.show} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />
      <RedditiGrid 
        category="REDDITI"
        year={selectedTransaction?.year} 
        month={selectedTransaction?.month} 
        onBack={handleBack}
        onPeriodChange={handlePeriodChange}
        showAlert={showAlert}
      />
    </div>
  );
};

export default RedditiPage;