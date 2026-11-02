import { useState, useRef, useCallback } from 'react';
import { BackButton } from './BackButton';
import { PeriodNavigation } from './PeriodNavigation';
import { CustomerSearchInput } from './CustomerSearchInput';
import { Alert } from './Alert';
import { ConfirmModal } from './ConfirmModal';

/**
 * GridToolbar component provides action buttons, navigation controls, 
 * and search inputs for managing transaction grids, periods, and status.
 */
export const GridToolbar = ({
  onBack,
  selectedTransaction,
  transactionsList,
  hasUnsavedChanges,
  onPeriodChange,
  setSelectedTransaction,
  setGlobalDrafts,
  setRemovedCustomerIds,
  setAddedCustomerIds,
  customerToAdd,
  setCustomerToAdd,
  availableCustomers,
  handleAddCustomerRow,
  handleCancelChanges,
  handleSaveAllChanges,
  isSaving,
  handleClearQuantitiesAndNotes,
  isStatusSaving,
  isTransactionValidated,
  handleToggleStatus,
  setIsServiceModalOpen,
  activeTab,
  setActiveTab
}) => {
  // Local state for displaying alerts and confirmation dialogs
  const [alertData, setAlertData] = useState(null);
  const [confirmModalData, setConfirmModalData] = useState(null);

  // Counter reference used to test and queue identical consecutive alert messages
  const alertCounterRef = useRef(0);
  const triggerAlert = useCallback((message, type = 'success') => {
    alertCounterRef.current += 1;
    const uniqueMessage = message + '\u200B'.repeat(alertCounterRef.current);
    setAlertData({ message: uniqueMessage, type });
  }, []);

  // Handler to close the active alert message
  const handleCloseAlert = () => {
    setAlertData(null);
  };

  // Callback executed when clearing quantities and notes is confirmed
  const confirmClearAction = () => {
    setConfirmModalData(null);
    if (handleClearQuantitiesAndNotes) {
      handleClearQuantitiesAndNotes();
      triggerAlert("Quantità e note azzerate con successo.", 'success');
    }
  };

  // Triggers the confirmation modal before clearing grid data
  const handleTriggerClear = () => {
    setConfirmModalData({
      title: "Conferma Azzeramento",
      message: "Sei sicuro di voler azzerare tutte le quantità e le note di questa transazione? L'operazione potrà essere salvata successivamente."
    });
  };

  return (
    <>
      <Alert 
        message={alertData?.message} 
        type={alertData?.type || 'success'} 
        onClose={handleCloseAlert} 
      />

      <div className="card border shadow-sm bg-white rounded-0">
        <div className="card-body p-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">

          {/* Left Group: Navigation back, period switching, and cross-search customer input */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {onBack && <BackButton onBack={onBack} disabled={isSaving} />}

            <PeriodNavigation
              year={selectedTransaction.year}
              month={selectedTransaction.month}
              selectedTransaction={selectedTransaction}
              transactionsList={transactionsList}
              hasPendingChanges={hasUnsavedChanges}
              disabled={isSaving}
              onPeriodChange={onPeriodChange}
              setSelectedTransaction={setSelectedTransaction}
              setGlobalDrafts={setGlobalDrafts}
              setHasGlobalDirty={() => { }}
              setRemovedCustomerIds={setRemovedCustomerIds}
              setAddedCustomerIds={setAddedCustomerIds}
            />

            <CustomerSearchInput
              availableCustomers={availableCustomers}
              customerToAdd={customerToAdd}
              setCustomerToAdd={setCustomerToAdd}
              handleAddCustomerRow={handleAddCustomerRow}
              placeholder="-- Cerca (nome, codice, p.iva...) --"
              showAddButton={true}
              inputClassName="form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle"
              inputStyle={{ minWidth: '240px', fontSize: '13px', cursor: 'pointer' }}
            />
          </div>

          {/* Right Group: Cancel changes, Save, Clear, Status toggle, Settings, and Tabs */}
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {hasUnsavedChanges && !isSaving && (
              <button
                onClick={handleCancelChanges}
                disabled={isSaving}
                className="btn btn-sm btn-outline-secondary rounded-0 px-3 py-1 fw-bold d-flex align-items-center gap-1 shadow-none"
                style={{ fontSize: '13px', lineHeight: '1.5' }}
                title="Annulla modifiche"
              >
                <i className="bi bi-x-lg"></i> Annulla
              </button>
            )}

            <button
              onClick={handleSaveAllChanges}
              disabled={!hasUnsavedChanges || isSaving}
              className={`btn btn-sm rounded-0 px-3 py-1 fw-bold d-flex align-items-center gap-1 shadow-none ${
                hasUnsavedChanges ? 'btn-success text-white' : 'btn-light text-muted border'
              }`}
              style={{ fontSize: '13px', lineHeight: '1.5' }}
            >
              <i className={`bi ${isSaving ? 'spinner-border spinner-border-sm' : 'bi-save'}`}></i>
              {isSaving ? 'Salvataggio...' : 'Salva'}
              {hasUnsavedChanges && !isSaving && <span className="badge bg-white text-success ms-1 rounded-pill">!</span>}
            </button>

            <button
              onClick={handleTriggerClear}
              disabled={isSaving}
              className="btn btn-sm btn-outline-danger rounded-0 px-2 py-1 d-flex align-items-center gap-1 shadow-none"
              style={{ fontSize: '13px', lineHeight: '1.5', borderColor: '#ced4da' }}
              title="Azzera quantità e note"
            >
              <i className="bi bi-eraser" style={{ fontSize: '13px' }}></i> 
            </button>

            <button
              type="button"
              disabled={isStatusSaving || isSaving}
              onClick={handleToggleStatus}
              className={`btn btn-sm rounded-0 px-3 py-1 d-flex align-items-center justify-content-center shadow-none ${
                isTransactionValidated ? 'btn-success text-white' : 'btn-warning text-dark'
              }`}
              style={{ fontSize: '13px', lineHeight: '1.5', cursor: 'pointer' }}
              title={isTransactionValidated ? "Stato: VALIDATO (Clicca per passare a Bozza)" : "Stato: BOZZA (Clicca per validare)"}
            >
              {isStatusSaving ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              ) : (
                <i className={`bi ${isTransactionValidated ? 'bi-check-circle-fill' : 'bi-pencil-fill'}`} style={{ fontSize: '13px' }}></i>
              )}
            </button>
            
            <button
              disabled={isSaving}
              onClick={() => setIsServiceModalOpen(true)}
              className="btn btn-sm btn-secondary text-white rounded-0 px-3 py-1 fw-bold d-flex align-items-center gap-1 opacity-75 shadow-none"
              style={{ fontSize: '13px', lineHeight: '1.5' }}
            >
              <i className="bi bi-gear"></i>
            </button>

            {setActiveTab && (
              <div className="d-flex bg-light p-1 border border-secondary-subtle rounded-0">
                <button
                  onClick={() => setActiveTab('generale')}
                  disabled={isSaving}
                  className={`btn btn-sm border-0 rounded-0 px-3 fw-bold py-1 d-flex align-items-center gap-1 shadow-none ${activeTab === 'generale' ? 'bg-dark text-white shadow-sm' : 'text-dark'}`}
                  style={{ fontSize: '12px', lineHeight: '1.5' }}
                >
                  <i className="bi bi-grid-3x3-gap"></i> Generale
                </button>
                <button
                  onClick={() => setActiveTab('cedolini')}
                  disabled={isSaving}
                  className={`btn btn-sm border-0 rounded-0 px-3 fw-bold py-1 d-flex align-items-center gap-1 shadow-none ${activeTab === 'cedolini' ? 'bg-dark text-white shadow-sm' : 'text-dark'}`}
                  style={{ fontSize: '12px', lineHeight: '1.5' }}
                >
                  <i className="bi bi-file-earmark-text"></i> Cedolini
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      <ConfirmModal
        show={Boolean(confirmModalData)}
        title={confirmModalData?.title}
        message={confirmModalData?.message}
        onConfirm={confirmClearAction}
        onCancel={() => setConfirmModalData(null)}
      />
    </>
  );
};

export default GridToolbar;