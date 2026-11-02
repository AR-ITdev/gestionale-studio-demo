import { useEffect, useState } from 'react';
import { getDemoStatus, onDemoStatusChange, resetDemoData } from '../demo/demoBackend';

const clearExplorerState = () => {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('explorer_')) sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage may be unavailable (e.g. privacy mode): nothing to clear.
  }
};

export const DemoResetButton = () => {
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = () => {
    const confirmed = window.confirm(
      'Ripristinare i dati dimostrativi iniziali?\nTutte le modifiche fatte in questa demo andranno perse.'
    );
    if (!confirmed) return;
    setIsResetting(true);
    resetDemoData();
    clearExplorerState();
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      disabled={isResetting}
      className="btn btn-sm btn-outline-warning rounded-0 d-flex align-items-center gap-1 ms-auto text-nowrap fw-bold"
      style={{ fontSize: '0.75em', lineHeight: 1, padding: 'calc(0.5rem - var(--bs-btn-border-width))' }}
      title="Rigenera l’archivio dimostrativo iniziale"
    >
      <i className="bi bi-arrow-counterclockwise"></i> Ripristina demo
    </button>
  );
};

export const DemoStorageWarning = () => {
  const [status, setStatus] = useState(getDemoStatus);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setStatus(getDemoStatus());
    return onDemoStatusChange(next => {
      setStatus(next);
      setDismissed(false);
    });
  }, []);

  if (!status.warning || dismissed) return null;
  return (
    <div role="alert" className="alert alert-warning rounded-0 border-0 border-bottom d-flex align-items-center gap-2 mb-0 py-2 px-3 flex-shrink-0 small">
      <i className="bi bi-exclamation-triangle-fill"></i>
      <span className="flex-grow-1">{status.warning}</span>
      <button type="button" className="btn-close" aria-label="Chiudi avviso" onClick={() => setDismissed(true)} />
    </div>
  );
};
