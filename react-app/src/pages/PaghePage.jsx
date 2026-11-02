import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TransactionExplorer from '../components/TransactionExplorer';
import PagheGeneraleGrid from '../components/PagheGeneraleGrid';
import PagheCedoliniGrid from '../components/PagheCedoliniGrid';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import Alert from '../components/Alert';
import ConfirmModal from '../components/ConfirmModal';

/**
 * PaghePage component manages payroll periods, navigation between general payroll views 
 * and payslips views, and handles unsaved changes protection across tabs and periods.
 */
export const PaghePage = () => {
  // Extract URL parameters for period (YYYY-MM) and active tab view
  const { period, tab } = useParams();
  const navigate = useNavigate();
  
  // Hook to track and manage unsaved changes status
  const { hasUnsaved, setHasUnsaved } = useUnsavedChanges();

  // Component local state for alert banners and confirmation modals
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success', key: 0 });
  const [confirmState, setConfirmState] = useState({ show: false, title: '', message: '', onConfirm: null });

  // Helper function to trigger alert notifications
  const showAlert = (message, type = 'success') => setAlertInfo({ message, type, key: Date.now() });
  
  // Helper function to close confirmation dialogs
  const closeConfirm = () => setConfirmState({ show: false, title: '', message: '', onConfirm: null });

  // Determine the active tab view, defaulting to 'generale'
  const activeTab = (tab === 'cedolini') ? 'cedolini' : 'generale';

  // Render TransactionExplorer if no period is selected in the URL
  if (!period) {
    const handleOpenTransaction = (transaction) => {
      navigate(`/paghe/${transaction.year}-${String(transaction.month).padStart(2, '0')}/generale`);
    };

    return (
      <div className="w-100 h-100 d-flex flex-column position-relative">
        <Alert key={alertInfo.key} message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success', key: 0 })} />
        <TransactionExplorer category="PAGHE" onOpenTransaction={handleOpenTransaction} showAlert={showAlert} />
      </div>
    );
  }

  // Parse year and month from the period route parameter string
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  /**
   * Handles navigation back to the main payroll list view, 
   * displaying a confirmation prompt if there are unsaved changes.
   */
  const handleBack = () => {
    if (hasUnsaved) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Hai modifiche non salvate. Vuoi davvero uscire e perderle?",
        onConfirm: () => {
          closeConfirm();
          setHasUnsaved(false);
          navigate('/paghe');
        }
      });
      return;
    }
    setHasUnsaved(false);
    navigate('/paghe');
  };

  /**
   * Handles switching between different payroll periods, 
   * warning the user via confirmation modal if unsaved changes exist.
   */
  const handlePeriodChange = (newPeriod) => {
    const formattedMonth = String(newPeriod.month).padStart(2, '0');
    if (hasUnsaved) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Hai modifiche non salvate. Se cambi periodo, le modifiche andranno perse. Vuoi procedere?",
        onConfirm: () => {
          closeConfirm();
          setHasUnsaved(false);
          navigate(`/paghe/${newPeriod.year}-${formattedMonth}/${activeTab}`);
        }
      });
      return;
    }
    navigate(`/paghe/${newPeriod.year}-${formattedMonth}/${activeTab}`);
  };

  /**
   * Handles switching between tabs (generale vs cedolini) within the same period,
   * prompting confirmation if modifications are pending.
   */
  const handleTabSwitch = (newTab) => {
    if (newTab === activeTab) return;
    if (hasUnsaved) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Hai modifiche non salvate in questa sezione. Se cambi tab le modifiche andranno perse. Vuoi procedere?",
        onConfirm: () => {
          closeConfirm();
          setHasUnsaved(false);
          navigate(`/paghe/${period}/${newTab}`);
        }
      });
      return;
    }
    setHasUnsaved(false);
    navigate(`/paghe/${period}/${newTab}`);
  };

  return (
    <div className="w-100 h-100 d-flex flex-column position-relative">
      {/* Global Alert Notification Component */}
      <Alert key={alertInfo.key} message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ message: '', type: 'success', key: 0 })} />
      
      {/* Global Confirmation Modal Component */}
      <ConfirmModal show={confirmState.show} title={confirmState.title} message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={closeConfirm} />

      {/* Conditionally render either general payroll grid or payslips grid based on activeTab */}
      {activeTab === 'generale' ? (
        <PagheGeneraleGrid year={year} month={month} onBack={handleBack} activeTab={activeTab} setActiveTab={handleTabSwitch} onPeriodChange={handlePeriodChange} showAlert={showAlert} />
      ) : (
        <PagheCedoliniGrid year={year} month={month} onBack={handleBack} activeTab={activeTab} setActiveTab={handleTabSwitch} onPeriodChange={handlePeriodChange} showAlert={showAlert} />
      )}
    </div>
  );
};

export default PaghePage;