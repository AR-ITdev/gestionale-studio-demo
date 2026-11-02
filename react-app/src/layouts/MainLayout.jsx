import { Outlet, useLocation } from 'react-router-dom';
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { DemoResetButton, DemoStorageWarning } from '../components/DemoControls';

/**
 * MainLayout component serving as the application shell, providing a top navigation bar 
 * with route-aware active state handling and a main content viewport area using React Router Outlet.
 */
const MainLayout = () => {
  // Hook to retrieve the current URL location object for route matching
  const location = useLocation();
  
  // Custom hook to handle safe navigation when there are potential unsaved changes in forms
  const { safeNavigate } = useUnsavedChanges();

  /**
   * Helper function to dynamically compute CSS classes for navigation buttons.
   * Ensures the active tab remains highlighted even on sub-routes (e.g., /paghe/2026-07).
   * 
   * @param {string} path - The target route path associated with the button
   * @returns {string} The concatenated Bootstrap CSS class string
   */
  const getNavBtnClass = (path) => {
    // Check if the current route matches the button path precisely for root, or via prefix for others
    const isActive = path === '/' 
      ? location.pathname === '/' 
      : location.pathname.startsWith(path);

    return `btn btn-sm rounded-0 d-flex align-items-center justify-content-center gap-2 px-3 py-2 text-nowrap border-0 ${
      isActive 
        ? "bg-primary text-white fw-bold shadow-sm" 
        : "bg-dark text-white fw-bold shadow-sm"
    }`;
  };

  return (
    <div className="dvh-100 bg-light d-flex flex-column overflow-hidden">
      {/* Scoped CSS styles for custom navbar button hover transitions */}
      <style>{`
        .navbar .btn:not(.bg-primary):hover {
          background-color: #343a40 !important;
          color: #ffffff !important;
        }
        .navbar .btn.bg-primary:hover {
          background-color: #0b5ed7 !important;
          color: #ffffff !important;
        }
      `}</style>

      {/* TOP NAVIGATION BAR (Fixed height, non-shrinkable shell header) */}
      <nav className="bg-dark px-3 py-2 shadow-sm border-bottom border-secondary shrink-0" style={{ overflowX: 'auto' }}>
        <div className="d-flex align-items-center justify-content-start gap-1 mx-auto" style={{ maxWidth: '1400px' }}>
          {/* Navigation items utilizing safeNavigate to prevent data loss on unsaved changes */}
          <button onClick={() => safeNavigate("/")} className={getNavBtnClass("/")}>
            <i className="bi bi-speedometer2"></i> Dashboard
          </button>
          <button onClick={() => safeNavigate("/clienti")} className={getNavBtnClass("/clienti")}>
            <i className="bi bi-people"></i> Anagrafiche
          </button>
          <button onClick={() => safeNavigate("/paghe")} className={getNavBtnClass("/paghe")}>
            <i className="bi bi-wallet2"></i> Paghe
          </button>
          <button onClick={() => safeNavigate("/contabilita")} className={getNavBtnClass("/contabilita")}>
            <i className="bi bi-journal-text"></i> Contabilità
          </button>
          <button onClick={() => safeNavigate("/redditi")} className={getNavBtnClass("/redditi")}>
            <i className="bi bi-file-earmark-text"></i> Redditi
          </button>
          <button onClick={() => safeNavigate("/varie")} className={getNavBtnClass("/varie")}>
            <i className="bi bi-pin"></i> Varie
          </button>
          <button onClick={() => safeNavigate("/cassa")} className={getNavBtnClass("/cassa")}>
            <i className="bi bi-cash-stack"></i> Cassa
          </button>
          <button onClick={() => safeNavigate("/elaborazioni")} className={getNavBtnClass("/elaborazioni")}>
            <i className="bi bi-gear"></i> Elaborazioni
          </button>
          <button onClick={() => safeNavigate("/report")} className={getNavBtnClass("/report")}>
            <i className="bi bi-graph-up"></i> Report
          </button>
          <DemoResetButton />
        </div>
      </nav>

      <DemoStorageWarning />

      {/* MAIN CONTENT VIEWPORT (Dynamically expands to fill remaining vertical viewport space up to 100vh) */}
      <div className="grow d-flex flex-column overflow-hidden p-3 h-100">
        {/* React Router Outlet to render nested child routes dynamically */}
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;