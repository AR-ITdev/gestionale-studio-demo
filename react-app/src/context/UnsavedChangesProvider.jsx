import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UnsavedChangesContext } from './UnsavedChangesContext';
import { ConfirmModal } from '../components/ConfirmModal';

/**
 * UnsavedChangesProvider component wraps parts of the application to globally track 
 * and manage unsaved changes states, preventing data loss on browser tab closes 
 * or internal route transitions.
 */
export const UnsavedChangesProvider = ({ children }) => {
  // State to track whether there are pending unsaved changes in the current view
  const [hasUnsaved, setHasUnsaved] = useState(false);
  
  // State to store the target navigation path while waiting for user confirmation
  const [pendingPath, setPendingPath] = useState(null);
  
  const navigate = useNavigate();
  const location = useLocation();

  // Protect against accidental browser tab closing or page refreshing with active unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = ''; // Required by modern browsers to trigger the native confirmation dialog
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsaved]);

  /**
   * Safely attempts to navigate to a target path. If unsaved changes exist,
   * it intercepts the navigation, stores the target path, and triggers a confirmation modal.
   */
  const safeNavigate = (targetPath) => {
    if (location.pathname === targetPath) return;

    if (hasUnsaved) {
      setPendingPath(targetPath);
      return; // Interrupt immediate navigation to open the confirmation modal
    }

    navigate(targetPath);
  };

  /**
   * Handles confirmation from the user to discard changes and proceed 
   * to the previously blocked target path.
   */
  const handleConfirmLeave = () => {
    const path = pendingPath;
    setPendingPath(null);
    setHasUnsaved(false);
    if (path) {
      navigate(path);
    }
  };

  /**
   * Handles cancellation of the navigation attempt, keeping the user 
   * on the current page with their unsaved changes intact.
   */
  const handleCancelLeave = () => {
    setPendingPath(null);
  };

  return (
    <UnsavedChangesContext.Provider value={{ hasUnsaved, setHasUnsaved, safeNavigate }}>
      {children}
      
      {/* Confirmation modal rendered globally when a navigation attempt is intercepted */}
      <ConfirmModal
        show={Boolean(pendingPath)}
        title="Modifiche non salvate"
        message="Hai modifiche non salvate o una sessione di modifica attiva. Vuoi procedere e perderle?"
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
      />
    </UnsavedChangesContext.Provider>
  );
};

export default UnsavedChangesProvider;