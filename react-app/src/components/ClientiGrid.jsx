import {
  useState,
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useCallback
} from "react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useClienti } from "../hooks/useClienti";
import { useUnsavedChanges } from '../context/useUnsavedChanges';
import { getClienti } from "../services/api";
import Alert from "./Alert";
import ConfirmModal from "./ConfirmModal";

// Register all community features and modules for AG Grid
ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Custom live input cell editor component for AG Grid inline editing.
 * Immediately propagates value changes during editing back to component state.
 */
const LiveInputEditor = forwardRef((props, ref) => {
  const [value, setValue] = useState(props.value ?? "");
  const inputRef = useRef(null);

  // Focus input element automatically upon mounting the editor
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Expose grid editor methods via imperative handle hook
  useImperativeHandle(ref, () => ({
    getValue: () => value,
    isCancelAfterEnd: () => false,
  }), [value]);

  const handleChange = (e) => {
    setValue(e.target.value);
  };

  // Trigger live updates on blur when the cell loses focus and value has changed
  const handleBlur = () => {
    if (value === props.value) return;

    if (props.node && props.data && props.colDef) {
      const field = props.colDef.field;
      const updatedData = {
        ...props.data,
        [field]: value
      };

      if (props.onLiveChange) {
        props.onLiveChange(updatedData, field, value);
      }
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="form-control form-control-sm rounded-0 shadow-none border-0 px-1 w-100 h-100 bg-transparent"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});

/**
 * ClientiGrid component manages the customer directory tabular data using AG Grid,
 * supporting global/inline editing, staging deletions, search filtering, and record creation.
 */
const ClientiGrid = () => {
  const {
    rowData: hookRowData,
    createNewClienteDirect,
    fetchData,
    saveClienti
  } = useClienti();

  const { setHasUnsaved } = useUnsavedChanges();

  const [localRowData, setLocalRowData] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isEditingGlobal, setIsEditingGlobal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showModal, setShowModal] = useState(false);

  // State configurations for custom Alerts and Confirmation Modals
  const [alertInfo, setAlertInfo] = useState({ message: '', type: 'success' });
  const [confirmState, setConfirmState] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const showAlert = (message, type = 'success') => {
    setAlertInfo({ message, type });
  };

  const closeConfirm = () => {
    setConfirmState({ show: false, title: '', message: '', onConfirm: null });
  };

  const [newClienteForm, setNewClienteForm] = useState({
    customer_code: "",
    parent_code: "",
    tax_id: "",
    name: ""
  });

  const [parentSearchInput, setParentSearchInput] = useState("");
  const [showParentDropdown, setShowParentDropdown] = useState(false);
  const [parentOptions, setParentOptions] = useState([]);

  // Refs for search debouncing, dropdown element tracking, grid API access, and backdrop dragging
  const parentSearchTimeoutRef = useRef(null);
  const parentDropdownRef = useRef(null);
  const gridRef = useRef();
  const backdropMouseDownTarget = useRef(null);

  // Computes active row data depending on edit session state or server-fetched data
  const rowData = useMemo(() => {
    if (!isEditingGlobal && !hasUnsavedChanges) {
      return hookRowData || [];
    }
    return localRowData;
  }, [hookRowData, localRowData, isEditingGlobal, hasUnsavedChanges]);

  // Close parent code selection dropdown when clicking outside its container
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (parentDropdownRef.current && !parentDropdownRef.current.contains(event.target)) {
        setShowParentDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCloseModal = () => {
    setShowModal(false);
    setHasUnsaved(hasUnsavedChanges || deletedIds.length > 0 || isEditingGlobal);
  };
  
  // Handles ESC key press and backdrop click/drag events to dismiss the modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && showModal) {
        handleCloseModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  const handleBackdropMouseDown = (e) => {
    backdropMouseDownTarget.current = e.target;
  };

  const handleBackdropMouseUp = (e) => {
    if (
      backdropMouseDownTarget.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      handleCloseModal();
    }
    backdropMouseDownTarget.current = null;
  };

  useEffect(() => {
    return () => {
      if (parentSearchTimeoutRef.current) {
        clearTimeout(parentSearchTimeoutRef.current);
      }
    };
  }, []);

  // Prevents accidental window closure or navigation if there are uncommitted changes or active edits
  useEffect(() => {
    const handlebeforeunload = (e) => {
      if (hasUnsavedChanges || deletedIds.length > 0 || showModal || isEditingGlobal) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handlebeforeunload);
    return () => {
      window.removeEventListener("beforeunload", handlebeforeunload);
    };
  }, [hasUnsavedChanges, deletedIds, showModal, isEditingGlobal]);

  const searchTimeoutRef = useRef(null);

  // Executes delayed API search based on input value
  const executeSearch = (value) => {
    setSearchTerm(value);
    setHasUnsaved(false);
    setHasUnsavedChanges(false);
    setDeletedIds([]);
    setIsEditingGlobal(false);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchData(value);
    }, 500);
  };

  // Handles search input changes, prompting for confirmation if unsaved edits exist
  const handleSearchChange = (e) => {
    const value = e.target.value;
    if (hasUnsavedChanges || deletedIds.length > 0 || isEditingGlobal) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Hai modifiche non salvate. Vuoi procedere e perderle?",
        onConfirm: () => {
          closeConfirm();
          executeSearch(value);
        }
      });
      return;
    }
    executeSearch(value);
  };

  // Resets filters and clears search data
  const executeReset = () => {
    setHasUnsaved(false);
    setHasUnsavedChanges(false);
    setDeletedIds([]);
    setIsEditingGlobal(false);
    setSearchTerm("");
    fetchData("");
  };

  const handleReset = () => {
    if (hasUnsavedChanges || deletedIds.length > 0 || isEditingGlobal) {
      setConfirmState({
        show: true,
        title: "Modifiche non salvate",
        message: "Hai modifiche non salvate. Vuoi procedere e perderle?",
        onConfirm: () => {
          closeConfirm();
          executeReset();
        }
      });
      return;
    }
    executeReset();
  };

  // Opens the modal to create a new client and fetches existing parent options
  const handleOpenModal = async () => {
    setNewClienteForm({ customer_code: "", parent_code: "", tax_id: "", name: "" });
    setParentSearchInput("");
    setShowParentDropdown(false);

    try {
      const response = await getClienti("", 100, 0);
      const rawData = Array.isArray(response) ? response : (response?.data || []);
      const filtered = rawData.filter((client) => client.parent_code && String(client.parent_code).trim() !== "");
      setParentOptions(filtered);
    } catch (err) {
      setParentOptions([]);
      console.error(err);
      showAlert("Errore nel recupero dei codici padre.", "error");
    }

    setShowModal(true);
    setHasUnsaved(true);
  };

  // Updates form state values when typing in modal inputs
  const handleModalInputChange = (e) => {
    const { name, value } = e.target;
    setNewClienteForm((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "tax_id") {
        updated.customer_code = value;
      }
      return updated;
    });
  };

  // Handles parent code input search with debounce logic inside the creation modal
  const handleParentInputChange = (e) => {
    const val = e.target.value;
    setParentSearchInput(val);
    setNewClienteForm((prev) => ({ ...prev, parent_code: val }));
    setShowParentDropdown(true);

    if (parentSearchTimeoutRef.current) {
      clearTimeout(parentSearchTimeoutRef.current);
    }

    parentSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await getClienti(val, 100, 0);
        const rawData = Array.isArray(response) ? response : (response?.data || []);
        const filtered = rawData.filter((client) => client.parent_code && String(client.parent_code).trim() !== "");
        setParentOptions(filtered);
      } catch (err) {
        console.error("Errore durante la ricerca dei codici padre:", err);
        setParentOptions([]);
      }
    }, 500);
  };

  // Sets selected parent code option from the dropdown list
  const handleSelectParentOption = (client) => {
    const selectedCode = client.parent_code || "";
    setNewClienteForm((prev) => ({ ...prev, parent_code: selectedCode }));
    setParentSearchInput(selectedCode);
    setShowParentDropdown(false);
  };

  // Handles form submission to save a new customer record directly
  const handleSaveNewCliente = async (e) => {
    e.preventDefault();
    if (!newClienteForm.name.trim() || !newClienteForm.tax_id.trim()) {
      showAlert("Compila almeno Nominativo e CF / P.IVA", "error");
      return;
    }

    const result = await createNewClienteDirect(newClienteForm);

    if (result.success) {
      setShowModal(false);
      setHasUnsaved(hasUnsavedChanges || deletedIds.length > 0 || isEditingGlobal);
      showAlert("Inserimento record avvenuto con successo!", "success");
    } else {
      showAlert(result.message || "Errore durante l'inserimento del record.", "error");
    }
  };

  // Discards active edits and restores original table data state
  const executeCancelEditing = () => {
    if (gridRef.current && gridRef.current.api) {
      gridRef.current.api.stopEditing(true);
    }

    setLocalRowData(hookRowData || []);
    setDeletedIds([]);
    setHasUnsavedChanges(false);
    setIsEditingGlobal(false);
    setHasUnsaved(false);

    setTimeout(() => {
      if (gridRef.current && gridRef.current.api) {
        gridRef.current.api.refreshCells({ force: true });
        gridRef.current.api.redrawRows();
      }
    }, 0);
  };

  const handleCancelEditing = () => {
    const hasDataChanged = JSON.stringify(rowData) !== JSON.stringify(hookRowData);
    const hasDeletions = deletedIds.length > 0;

    if (hasDataChanged || hasDeletions || hasUnsavedChanges) {
      setConfirmState({
        show: true,
        title: "Annulla modifiche",
        message: "Sei sicuro di voler annullare tutte le modifiche apportate?",
        onConfirm: () => {
          closeConfirm();
          executeCancelEditing();
        }
      });
      return;
    }
    executeCancelEditing();
  };

  // Stages a record for deletion by adding its ID to deletedIds array
  const handleStageDelete = useCallback((id) => {
    setLocalRowData((prev) => prev.filter((row) => row.id !== id));
    setDeletedIds((prev) => [...prev, id]);
    setHasUnsavedChanges(true);
    setHasUnsaved(true);
    showAlert("Elemento contrassegnato per l'eliminazione.");
  }, [setHasUnsaved]);

  // Updates specific cells in local state during inline live cell editing
  const handleLiveCellChange = useCallback((updatedData, field, value) => {
    setLocalRowData((prev) =>
      prev.map((row) => (row.id === updatedData.id ? { ...updatedData, [field]: value } : row))
    );
    setHasUnsavedChanges(true);
    setHasUnsaved(true);
  }, [setHasUnsaved]);

  // Handles standard cell value change events from AG Grid
  const onCellValueChanged = useCallback((params) => {
    const updatedData = params.data;
    setLocalRowData((prev) =>
      prev.map((row) => (row.id === updatedData.id ? { ...updatedData } : row))
    );
    setHasUnsavedChanges(true);
    setHasUnsaved(true);
  }, [setHasUnsaved]);

  // Toggles between global edit mode and saving modifications to the server
  const handleEditOrSaveToggle = async () => {
    if (!isEditingGlobal) {
      setLocalRowData(hookRowData || []);
      setIsEditingGlobal(true);
      setHasUnsaved(true);
      setTimeout(() => {
        if (gridRef.current && gridRef.current.api) {
          gridRef.current.api.refreshCells({ force: true });
        }
      }, 0);
    } else {
      if (gridRef.current && gridRef.current.api) {
        gridRef.current.api.stopEditing();
      }
      try {
        setIsSaving(true);

        const result = await saveClienti(rowData, deletedIds);

        if (result.success) {
          setHasUnsavedChanges(false);
          setDeletedIds([]);
          setIsEditingGlobal(false);
          setHasUnsaved(false);
          showAlert(result.message || "Modifica avvenuta con successo!", "success");
          if (gridRef.current && gridRef.current.api) {
            gridRef.current.api.refreshCells({ force: true });
          }
        } else {
          showAlert(result.message || "Errore durante il salvataggio delle modifiche.", "error");
        }
      } catch (e) {
        console.error("Errore durante il salvataggio:", e);
        showAlert("Errore imprevisto durante il salvataggio.", "error");
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Renders action buttons for deleting rows only when global editing is active
  const ActionCellRenderer = useCallback((params) => {
    if (!params.context.isEditingGlobal) return null;
    return (
      <button
        type="button"
        className="btn btn-outline-danger btn-sm border-0 py-0 px-2 rounded-0 shadow-none"
        onClick={() => handleStageDelete(params.data.id)}
        title="Elimina cliente in bozza"
      >
        <i className="bi bi-trash3"></i>
      </button>
    );
  }, [handleStageDelete]);

  // Column definitions for AG Grid
  const colDefs = useMemo(
    () => [
      { field: "id", hide: true },
      {
        field: "parent_code",
        headerName: "Codice Padre",
        width: 160,
        editable: () => isEditingGlobal,
        cellEditor: LiveInputEditor,
        cellEditorParams: { onLiveChange: handleLiveCellChange }
      },
      {
        field: "customer_code",
        headerName: "Codice Cliente",
        width: 160,
        editable: () => isEditingGlobal,
        cellEditor: LiveInputEditor,
        cellEditorParams: { onLiveChange: handleLiveCellChange }
      },
      {
        field: "tax_id",
        headerName: "CF - P.IVA",
        width: 180,
        editable: () => isEditingGlobal,
        cellEditor: LiveInputEditor,
        cellEditorParams: { onLiveChange: handleLiveCellChange }
      },
      {
        field: "name",
        headerName: "Nominativo - Ragione Sociale",
        flex: 2,
        minWidth: 220,
        editable: () => isEditingGlobal,
        cellEditor: LiveInputEditor,
        cellEditorParams: { onLiveChange: handleLiveCellChange }
      },
      {
        headerName: "",
        cellRenderer: ActionCellRenderer,
        width: 60,
        suppressSizeToFit: true,
        sortable: false,
        filter: false,
        suppressMenu: true,
      },
    ],
    [isEditingGlobal, handleLiveCellChange, ActionCellRenderer]
  );

  // Default column configurations applied across all columns
  const defaultColDef = useMemo(
    () => ({
      filter: true,
      sortable: true,
      editable: false,
      singleClickEdit: true,
      resizable: true,
    }),
    []
  );

  const effectiveHasUnsaved = hasUnsavedChanges || deletedIds.length > 0;

  return (
    <div inert={isSaving ? '' : undefined} aria-busy={isSaving} className="container-fluid px-3 py-2 d-flex flex-column h-custom-calc position-relative">

      {/* Custom Alert and Confirmation Modal components */}
      <Alert
        message={alertInfo.message}
        type={alertInfo.type}
        onClose={() => setAlertInfo({ message: '', type: 'success' })}
      />

      <ConfirmModal
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      {/* Header and Toolbar section */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-2 border-bottom shrink-0">
        <div className="d-flex align-items-center gap-2">
          <h4 className="fw-semibold text-dark mb-0 fs-5">Anagrafica Clienti</h4>
          <span className="badge bg-light text-muted border rounded-0 fw-normal">
            {rowData.length} elementi
          </span>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="d-flex gap-1">
            <div className="input-group input-group-sm w-custom-search h-custom-btn">
              <span className="input-group-text bg-white text-muted border-end-0 rounded-0">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                className="form-control form-control-sm border-start-0 ps-0 rounded-0 shadow-none h-100"
                placeholder="Cerca..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            <button
              type="button"
              className="btn btn-outline-light text-secondary border btn-sm rounded-0 d-flex align-items-center justify-content-center w-custom-icon-btn h-custom-btn"
              onClick={handleReset}
              title="Reset filtri"
            >
              <i className="bi bi-arrow-counterclockwise fs-6"></i>
            </button>
          </div>

          <div className="vr mx-1 opacity-25"></div>

          <button
            type="button"
            className="btn btn-dark btn-sm d-flex align-items-center justify-content-center gap-1 rounded-0 shadow-sm w-custom-action-btn h-custom-btn"
            onClick={handleOpenModal}
          >
            <i className="bi bi-plus-lg"></i>
            Nuovo
          </button>

          <div className="d-flex gap-1">
            {isEditingGlobal && !isSaving && (
              <button
                type="button"
                disabled={isSaving}
                className="btn btn-outline-secondary btn-sm d-flex align-items-center justify-content-center gap-1 rounded-0 fw-bold shadow-sm w-custom-action-btn h-custom-btn"
                onClick={handleCancelEditing}
                title="Annulla modifiche"
              >
                <i className="bi bi-x-lg"></i>
                Annulla
              </button>
            )}

            <button
              type="button"
              disabled={isSaving}
              className={`btn btn-sm d-flex align-items-center justify-content-center gap-1 rounded-0 fw-bold shadow-sm w-custom-action-btn h-custom-btn ${isEditingGlobal ? (effectiveHasUnsaved ? "btn-success text-white" : "btn-outline-success") : "btn-outline-dark"
                }`}
              onClick={handleEditOrSaveToggle}
            >
              <i className={`bi ${isSaving ? "spinner-border spinner-border-sm" : (isEditingGlobal ? "bi-check-lg" : "bi-pencil")}`}></i>
              {isEditingGlobal ? (isSaving ? "Salvataggio" : "Salva") : "Modifica"}
              {isEditingGlobal && effectiveHasUnsaved && !isSaving && (
                <span className="badge bg-white text-success ms-1 rounded-pill">!</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* AG Grid container wrapper */}
      <div className="card border rounded-0 shadow-sm overflow-hidden grow d-flex flex-column mb-2">
        <div className="ag-theme-quartz grow min-h-70vh">
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={colDefs}
            context={{ isEditingGlobal }}
            defaultColDef={defaultColDef}
            onCellValueChanged={onCellValueChanged}
            getRowId={(params) => String(params.data.id)}
            rowHeight={38}
            headerHeight={42}
            pagination={true}
            paginationPageSize={500}
            paginationPageSizeSelector={[100, 250, 500]}
          />
        </div>
      </div>

      {/* Create New Client Modal */}
      {showModal && (
        <div
          className="modal show d-block fade show"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onMouseDown={handleBackdropMouseDown}
          onMouseUp={handleBackdropMouseUp}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content border-0 shadow-lg rounded-0">
              <div className="modal-header bg-light py-3 px-4 rounded-0">
                <h6 className="modal-title fw-bold text-dark mb-0">Nuovo Cliente</h6>
                <button type="button" className="btn-close rounded-0 shadow-none" onClick={handleCloseModal}></button>
              </div>

              <form onSubmit={handleSaveNewCliente}>
                <div className="modal-body p-4">
                  <div className="mb-1">
                    <label className="form-label small fw-semibold text-muted">CF - P.IVA *</label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-0 shadow-none"
                      name="tax_id"
                      value={newClienteForm.tax_id}
                      onChange={handleModalInputChange}
                      placeholder="Inserisci Codice Fiscale o Partita IVA"
                      required
                    />
                  </div>

                  <div className="mb-1">
                    <label className="form-label small fw-semibold text-muted">Nominativo / Ragione Sociale *</label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-0 shadow-none"
                      name="name"
                      value={newClienteForm.name}
                      onChange={handleModalInputChange}
                      placeholder="Inserisci denominazione o nome"
                      required
                    />
                  </div>

                  <div className="mb-3 position-relative" ref={parentDropdownRef}>
                    <label className="form-label small fw-semibold text-muted">Codice Padre</label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-0 shadow-none"
                      value={parentSearchInput}
                      onChange={handleParentInputChange}
                      onFocus={async () => {
                        setShowParentDropdown(true);
                        if (parentOptions.length === 0) {
                          try {
                            const response = await getClienti("", 100, 0);
                            const rawData = Array.isArray(response) ? response : (response?.data || []);
                            const filtered = rawData.filter((client) => client.parent_code && String(client.parent_code).trim() !== "");
                            setParentOptions(filtered);
                          } catch (e) {
                            console.error(e);
                            showAlert("Errore nel recupero dei codici padre.", "error");
                          }
                        }
                      }}
                      placeholder="Cerca per codice, P.IVA o ragione sociale..."
                      autoComplete="off"
                    />
                    {showParentDropdown && (
                      <ul
                        className="dropdown-menu show w-100 shadow-sm rounded-0 mt-1 z-1050"
                        style={{ maxHeight: "220px", overflowY: "auto" }}
                      >
                        {parentOptions.length > 0 ? (
                          parentOptions.map((client) => (
                            <li key={client.id || client.customer_code}>
                              <button
                                type="button"
                                className="dropdown-item small py-2 text-wrap"
                                onClick={() => handleSelectParentOption(client)}
                              >
                                <div className="text-dark">
                                  {client.customer_code || "N/D"} - Padre:
                                  <span className="fw-bold">
                                    {client.parent_code ? ` ${client.parent_code}` : ""}
                                  </span>
                                </div>
                                <div className="text-muted fs-11">
                                  {client.tax_id || "N/D"} - {client.name || "N/D"}
                                </div>
                              </button>
                            </li>
                          ))
                        ) : (
                          <li>
                            <span className="dropdown-item-text text-muted small py-2">Nessun cliente trovato con codice padre</span>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-semibold text-muted">Codice Cliente (Generato automaticamente)</label>
                    <input
                      type="text"
                      className="form-control form-control-sm bg-light text-muted rounded-0"
                      name="customer_code"
                      value={newClienteForm.customer_code}
                      readOnly
                    />
                  </div>
                </div>

                <div className="modal-footer bg-light py-2 px-4 border-top-0 rounded-0">
                  <button type="button" className="btn btn-outline-secondary btn-sm px-3 rounded-0" onClick={handleCloseModal}>
                    Annulla
                  </button>
                  <button type="submit" className="btn btn-dark btn-sm px-4 rounded-0">
                    Crea Cliente
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientiGrid;