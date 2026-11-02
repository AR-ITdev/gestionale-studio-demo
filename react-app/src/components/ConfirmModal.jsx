import { useEffect, useRef } from "react";

/**
 * ConfirmModal component renders a reusable confirmation dialog overlay
 * with custom title, message, confirmation, and cancellation actions.
 */
export const ConfirmModal = ({ show, title = "Conferma", message, onConfirm, onCancel }) => {
  // Ref to track mousedown target on the backdrop to prevent false dismissals during drag actions
  const backdropMouseDownTarget = useRef(null);

  // Handles the ESC key press event to dismiss the confirmation modal if visible
useEffect(() => {
    const handleKeyDown = (e) => {
      if (!show) return;
      
      if (e.key === "Escape" && onCancel) {
        onCancel();
      } else if (e.key === "Enter" && onConfirm) {
        e.preventDefault();
        onConfirm();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [show, onConfirm, onCancel]);

  // Records the target element where the mouse click started on the backdrop
  const handleBackdropMouseDown = (e) => {
    backdropMouseDownTarget.current = e.target;
  };

  // Closes the modal only if the mouse down and mouse up events both occurred on the backdrop element itself
  const handleBackdropMouseUp = (e) => {
    if (
      backdropMouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget &&
      onCancel
    ) {
      onCancel();
    }
    backdropMouseDownTarget.current = null;
  };

  // Return null early if the modal is not set to be shown
  if (!show) return null;

  return (
    <div 
      className="modal show d-block fade show" 
      tabIndex="-1" 
      style={{ 
        backgroundColor: "rgba(0, 0, 0, 0.5)", 
        zIndex: 1060 
      }}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      {/* Modal dialog wrapper centered on screen, preventing click propagation to backdrop */}
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow-lg rounded-0">
          
          {/* Modal header containing the icon, title, and close button */}
          <div className="modal-header bg-light py-2 px-3 rounded-0">
            <h6 className="modal-title fw-bold text-dark mb-0 fs-6">
              <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
              {title}
            </h6>
            <button type="button" className="btn-close rounded-0 shadow-none" onClick={onCancel}></button>
          </div>

          {/* Modal body displaying the warning message text */}
          <div className="modal-body p-3 text-secondary" style={{ fontSize: '13px' }}>
            {message}
          </div>

          {/* Modal footer with action buttons for canceling or confirming the action */}
          <div className="modal-footer bg-light py-2 px-3 border-top-0 rounded-0">
            <button type="button" className="btn btn-outline-secondary btn-sm px-3 rounded-0" onClick={onCancel}>
              Annulla
            </button>
            <button type="button" className="btn btn-dark btn-sm px-4 rounded-0" onClick={onConfirm}>
              Conferma
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;