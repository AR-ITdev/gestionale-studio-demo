import { createContext } from 'react';
/**
 * Context object used globally across the application to track and manage 
 * the state of unsaved changes, preventing accidental navigation or data loss.
 */
export const UnsavedChangesContext = createContext(null);