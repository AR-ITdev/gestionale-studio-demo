import { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Renders an individual toast alert item with entrance/exit animations.
 * Handles auto-dismissal timers and clean up phases.
 */
const AlertItem = ({ alert, onRemove }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation on next animation frame
    const rafId = requestAnimationFrame(() => {
      setVisible(true);
    });

    // Start fade out transition before removing the alert
    const fadeTimer = setTimeout(() => {
      setVisible(false);
    }, 2700);

    // Trigger removal callback after transition completes
    const removeTimer = setTimeout(() => {
      onRemove(alert.id);
    }, 3000);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [alert.id, onRemove]);

  const isSuccess = alert.type === 'success';
  // Strip any zero-width space characters from the message string prior to display
  const cleanMessage = alert.message ? alert.message.replace(/\u200B/g, '') : '';

  return (
    <div
      className={`alert shadow rounded-0 d-flex align-items-center justify-content-between mb-0 ${
        isSuccess ? 'alert-success border-success' : 'alert-danger border-danger'
      }`}
      style={{
        minWidth: '320px',
        maxWidth: '450px',
        fontSize: '13px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease-in-out',
        pointerEvents: 'auto',
      }}
      role="alert"
    >
      <div className="d-flex align-items-center gap-2">
        <i
          className={`bi ${
            isSuccess ? 'bi-check-circle-fill text-success' : 'bi-exclamation-triangle-fill text-danger'
          }`}
          style={{ fontSize: '16px' }}
        ></i>
        <div>
          <strong>{isSuccess ? 'Successo:' : 'Attenzione:'}</strong> {cleanMessage}
        </div>
      </div>
      <button
        type="button"
        className="btn-close shadow-none"
        onClick={() => {
          setVisible(false);
          setTimeout(() => onRemove(alert.id), 300);
        }}
        aria-label="Close"
        style={{ fontSize: '11px' }}
      ></button>
    </div>
  );
};

/**
 * Container component that manages a queue of floating alerts/notifications.
 * Positions them at the bottom-right corner of the viewport.
 */
export const Alert = ({ message, type = 'success', onClose }) => {
  const [alerts, setAlerts] = useState([]);
  const nextIdRef = useRef(1);

  // Append new incoming alerts to the active queue state
  useEffect(() => {
    if (!message) return;

    const id = nextIdRef.current++;
    const newAlert = {
      id,
      message,
      type,
      time: Date.now()
    };

    setAlerts((prev) => [...prev, newAlert]);
  }, [message, type]);

  // Remove specific alert from state by its identifier, then let the parent
  // know so it can reset its own message state back to empty. Without this,
  // the parent's message prop never changes value on repeated identical
  // alerts, so the effect above would never re-fire for the same text.
  const handleRemove = useCallback((id) => {
    setAlerts((prev) => prev.filter((item) => item.id !== id));
    onClose?.();
  }, [onClose]);

  if (alerts.length === 0) return null;

  return (
    <div
      className="position-fixed bottom-0 end-0 m-3 d-flex flex-column gap-2"
      style={{ zIndex: 9999, pointerEvents: 'none' }}
    >
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} onRemove={handleRemove} />
      ))}
    </div>
  );
};

export default Alert;