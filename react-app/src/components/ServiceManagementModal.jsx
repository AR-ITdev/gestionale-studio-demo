import { useEffect, useRef, useState } from 'react';

/**
 * ServiceManagementModal component handles the management, filtering, creation, 
 * inline editing, and status toggling of specific service subcategories.
 */
export const ServiceManagementModal = ({
  isOpen,
  onClose,
  services,
  serviceSearchFilter,
  setServiceSearchFilter,
  newSubcategoryInput,
  setNewSubcategoryInput,
  handleCreateService,
  editingServiceId,
  setEditingServiceId,
  inlineSubcategoryValue,
  setInlineSubcategoryValue,
  handleSaveInlineService,
  handleToggleServiceActive,
  showAlert,
  category,
  isCedolini = false
}) => {
  // Ref to track mousedown on the backdrop and prevent false triggers during drag actions
  const backdropMouseDownTarget = useRef(null);

  // Handle ESC key press to close the modal window
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e) => {
    if (
      backdropMouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget &&
      onClose
    ) {
      onClose();
    }
    backdropMouseDownTarget.current = null;
  };

  // Automatically manage default prefix insertion when opening the modal for "Cedolini"
  useEffect(() => {
    if (isOpen && isCedolini) {
      if (!newSubcategoryInput || !newSubcategoryInput.startsWith('Cedolini')) {
        setNewSubcategoryInput('Cedolini ');
      }
    }
  }, [isOpen, isCedolini, newSubcategoryInput, setNewSubcategoryInput]);

  if (!isOpen) return null;

  // Filter service items based on search input value (case-insensitive)
  const filteredModalServices = !serviceSearchFilter.trim()
    ? services
    : services.filter(s => (s.subcategory || '').toLowerCase().includes(serviceSearchFilter.toLowerCase()));

  // Protected submit handler for new service creation with duplicate name validation
  const onSubmitCreate = (e) => {
    e.preventDefault();
    const trimmedInput = newSubcategoryInput.trim();
    if (!trimmedInput || (isCedolini && trimmedInput === 'Cedolini')) return;

    // Check if a service with the exact same name already exists (case-insensitive)
    const exists = services.some(
      s => (s.subcategory || '').trim().toLowerCase() === trimmedInput.toLowerCase()
    );

    if (exists) {
      showAlert("Esiste già un servizio con questo nome!", "danger");
      return;
    }

    handleCreateService(e);
  };

  // Protected inline save handler with duplicate name validation (excluding current editing item)
  const onSaveInline = (serv) => {
    const trimmedValue = inlineSubcategoryValue.trim();
    if (!trimmedValue) return;

    // Check duplicates while excluding the service currently being edited
    const exists = services.some(
      s => s.id !== serv.id && (s.subcategory || '').trim().toLowerCase() === trimmedValue.toLowerCase()
    );

    if (exists) {
      showAlert("Esiste già un servizio con questo nome!", "danger");
      return;
    }

    handleSaveInlineService(serv);
  };

  // Determine dynamic modal title based on the category type
  const getModalTitle = () => {
    if (category === 'CONTABILITA') return 'Gestione Servizi Contabilità';
    if (category === 'REDDITI') return 'Gestione Servizi Redditi';
    return isCedolini ? 'Gestione Servizi Cedolini' : 'Gestione Servizi Paghe';
  };

  return (
    <div 
      className="modal show d-block" 
      tabIndex="-1" 
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content rounded-0 border shadow">
          <div className="modal-header py-2 bg-light border-bottom">
            <h6 className="modal-title fw-bold text-dark">
              {getModalTitle()}
            </h6>
            <button
              type="button"
              className="btn-close shadow-none"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body d-flex flex-column gap-3 bg-white">
            {/* Search input group to filter existing services */}
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white rounded-0 border-secondary-subtle">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                placeholder="Cerca nome servizio..."
                value={serviceSearchFilter}
                onChange={(e) => setServiceSearchFilter(e.target.value)}
                className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-dark"
              />
              {serviceSearchFilter && (
                <button className="btn btn-dark rounded-0" onClick={() => setServiceSearchFilter('')} type="button">
                  <i className="bi bi-x"></i>
                </button>
              )}
            </div>

            {/* Scrollable list container for filtered services */}
            <div
              className="list-group list-group-flush border border-secondary-subtle rounded-0"
              style={{ height: '300px', minHeight: '300px', overflowY: 'auto' }}
            >
              {filteredModalServices.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted small">
                  Nessun servizio trovato.
                </div>
              ) : (
                filteredModalServices.map((serv) => {
                  const isEditingThis = editingServiceId === serv.id;
                  const isActive = serv.is_active === 1 || serv.is_active === true;
                  return (
                    <div key={serv.id} className="list-group-item d-flex justify-content-between align-items-center py-2 px-3 border-bottom-0 border-top border-secondary-subtle bg-white">
                      <div className="grow me-3">
                        {isEditingThis ? (
                          <input
                            type="text"
                            value={inlineSubcategoryValue}
                            onChange={(e) => {
                              setInlineSubcategoryValue(e.target.value);
                            }}
                            className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-dark"
                            autoFocus
                          />
                        ) : (
                          <span className={`small ${isActive ? 'text-dark fw-semibold' : 'text-muted'}`}>
                            {isCedolini && !serv.subcategory.toLowerCase().startsWith('cedolini')
                              ? `Cedolini ${serv.subcategory}`
                              : serv.subcategory}
                          </span>
                        )}
                      </div>

                      {/* Action buttons for inline editing and active state toggling */}
                      <div className="d-flex gap-2 shrink-0">
                        {isEditingThis ? (
                          <div className="d-flex gap-1">
                            <button
                              type="button"
                              onClick={() => onSaveInline(serv)}
                              className="btn btn-sm btn-success py-0 px-2 rounded-0 fw-bold text-white"
                              title="Salva"
                              style={{ fontSize: '11px' }}
                            >
                              <i className="bi bi-check"></i>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingServiceId(null); setInlineSubcategoryValue(''); }}
                              className="btn btn-sm btn-secondary py-0 px-2 rounded-0 text-white"
                              title="Annulla"
                              style={{ fontSize: '11px' }}
                            >
                              <i className="bi bi-x"></i>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setEditingServiceId(serv.id); setInlineSubcategoryValue(serv.subcategory); }}
                            className="btn btn-sm btn-outline-secondary py-0 px-2 rounded-0"
                            title="Modifica"
                            style={{ fontSize: '11px' }}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleServiceActive(serv)}
                          className={`btn btn-sm py-0 px-2 rounded-0 text-white ${isActive ? 'btn-primary' : 'btn-danger'}`}
                          style={{ fontSize: '11px' }}
                        >
                          {isActive ? 'Attivo' : 'Disattivo'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Form for adding a new service item */}
            <form onSubmit={onSubmitCreate} className="d-flex gap-2">
              <input
                type="text"
                placeholder={isCedolini ? "Nome nuovo servizio cedolini..." : "Nome nuovo servizio..."}
                value={newSubcategoryInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (isCedolini) {
                    if (!val.startsWith("Cedolini ")) {
                      setNewSubcategoryInput("Cedolini ");
                    } else {
                      setNewSubcategoryInput(val);
                    }
                  } else {
                    setNewSubcategoryInput(val);
                  }
                }}
                className="form-control form-control-sm rounded-0 shadow-none border-secondary-subtle text-dark"
                required
              />
              <button type="submit" className="btn btn-sm btn-dark rounded-0 px-3 fw-bold text-nowrap">
                <i className="bi bi-plus-lg me-1"></i> Aggiungi Servizio
              </button>
            </form>
          </div>
          <div className="modal-footer py-2 bg-light border-top">
            <button type="button" className="btn btn-sm btn-secondary rounded-0 px-3" onClick={onClose}>
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceManagementModal;