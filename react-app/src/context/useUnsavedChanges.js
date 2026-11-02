import { useContext } from 'react';
import { UnsavedChangesContext } from './UnsavedChangesContext';

/**
 * Custom hook to easily consume the UnsavedChangesContext.
 * Provides components access to unsaved state tracking, update functions, and safe navigation.
 * 
 * @returns {Object} The unsaved changes context value containing state and helpers.
 * @throws {Error} Throws an error if used outside of an UnsavedChangesProvider wrapper.
 */
export const useUnsavedChanges = () => {
  const context = useContext(UnsavedChangesContext);
  
  // Ensure the hook is being used within the appropriate context provider scope
  if (!context) {
    throw new Error('useUnsavedChanges deve essere usato all\'interno di un UnsavedChangesProvider');
  }
  
  return context;
};