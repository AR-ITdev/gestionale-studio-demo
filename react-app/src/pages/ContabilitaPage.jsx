import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TransactionExplorer from '../components/TransactionExplorer';
import ContabilitaGrid from '../components/ContabilitaGrid';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import Alert from '../components/Alert';
import ConfirmModal from '../components/ConfirmModal';

/**
 * ContabilitaPage component manages accounting sections and periodic transaction views.
 * It conditionally renders either the TransactionExplorer for period selection or the 
 * ContabilitaGrid for detailed accounting data management.
 */
export const ContabilitaPage = () => {
  // Extract route parameter 'period' (formatted as YYYY-MM) if present
  const { period } = useParams();
  const navigate = useNavigate();
  
  // Custom hook state to track and handle unsaved changes across forms
  const { hasUnsaved, setHasUnsaved } = useUnsavedChanges();

  // State for alert notifications and confirmation modal dialogs
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success', key: 0 });
  const [confirmState, setConfirmState] = useState({ show: false, title: '', message: '', onConfirm: null });

  /**
   * Triggers a temporary notification alert message.
   * @param {string} message - Text content to display
   * @param {string} type - Alert severity variant (e.g., 'success', 'danger')
   */
  const showAlert = (message, type = 'success') => setAlertInfo({ message, type, key: Date.now() });
  
  // Closes the confirmation dialog modal
  const closeConfirm = () => setConfirmState({ show: false, title: '', message: '', onConfirm: null });
  
  // Parse the period route parameter into year and month objects if available
  const selectedTransaction = period ? (() => {
    const [year, month] = period.split('-');
    return { year, month };
  })() : null;

  /**
   * Handles opening a specific accounting period view.
   * @param {Object} transaction - Object containing year and month properties
   */
  const handleOpenTransaction = (transaction) => {
    if (transaction && transaction.year && transaction.month) {
      navigate(`/contabilita/${transaction.year}-${transaction.month}`);
    }
  };

  /**
   * Handles navigation back to the main accounting list view,
   * prompting the user via confirmation modal if there are unsaved changes.
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
          navigate('/contabilita');
        }
      });
      return;
    }
    setHasUnsaved(false);
    navigate('/contabilita');
  };

  /**
   * Updates the route when switching accounting periods dynamically.
   * @param {Object} newPeriod - Target period object containing year and month
   */
  const handlePeriodChange = (newPeriod) => {
    if (newPeriod && newPeriod.year && newPeriod.month) {
      navigate(`/contabilita/${newPeriod.year}-${newPeriod.month}`);
    }
  };

  // Render the transaction explorer when no specific period is selected in the URL
  if (!selectedTransaction && !period) {
    return (
      <div className="w-100 h-100 d-flex flex-column position-relative">
        <Alert key={alertInfo.key} message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success', key: 0 })} />
        <TransactionExplorer category="CONTABILITA" onOpenTransaction={handleOpenTransaction} showAlert={showAlert} />
      </div>
    );
  }

  // Render the detailed accounting grid when a period is actively selected
  return (
    <div className="w-100 h-100 d-flex flex-column position-relative">
      <Alert key={alertInfo.key} message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success', key: 0 })} />
      <ConfirmModal show={confirmState.show} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />
      <ContabilitaGrid 
        category="CONTABILITA"
        year={selectedTransaction?.year} 
        month={selectedTransaction?.month} 
        onBack={handleBack}
        onPeriodChange={handlePeriodChange}
        showAlert={showAlert}
      />
    </div>
  );
};

export default ContabilitaPage;