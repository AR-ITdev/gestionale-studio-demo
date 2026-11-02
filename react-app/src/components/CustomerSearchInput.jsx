import { useState, useRef, useEffect, useMemo } from 'react';
import { getClienti } from '../services/api';

/**
 * CustomerSearchInput component provides an interactive search input with an asynchronous
 * dropdown list to find, filter, and select customers by name, code, or VAT number.
 */
export const CustomerSearchInput = ({
  availableCustomers = [],
  customerToAdd,
  setCustomerToAdd,
  handleAddCustomerRow,
  placeholder = "-- Cerca (nome, codice, p.iva...) --",
  showAddButton = true,
  inputClassName = "form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle",
  inputStyle = { minWidth: '240px', fontSize: '13px', cursor: 'pointer' }
}) => {
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0, width: 0 });
  const [customerOptions, setCustomerOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const customerInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isOpenRef = useRef(false); // Synchronous ref to prevent double triggers (focus + click)
  const dropdownListRef = useRef(null);

  // Synchronizes the ref with the open state
  useEffect(() => {
    isOpenRef.current = isCustomerDropdownOpen;
  }, [isCustomerDropdownOpen]);

  // Resets the selected index when customer options change
  useEffect(() => {
    setSelectedIndex(0);
  }, [customerOptions]);

  // Auto-scrolls the dropdown list to keep the selected index visible
  useEffect(() => {
    if (isCustomerDropdownOpen && dropdownListRef.current) {
      const items = dropdownListRef.current.querySelectorAll('.customer-option-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isCustomerDropdownOpen]);

  // Cleans up the debounce timeout on component unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Computes the display name and extra identification details for the currently selected customer
  const selectedCustomerName = useMemo(() => {
    if (!customerToAdd) return '';
    const allKnown = [...(availableCustomers || []), ...customerOptions];
    const found = allKnown.find(c => String(c.id) === String(customerToAdd));
    if (!found) return '';
    const ident = found.customer_code || found.tax_id || found.vat_number || '';
    const parent = found.parent_code || found.parent_customer_code || '';
    let details = [];
    if (ident) details.push(ident);
    if (parent) details.push(`Padre: ${parent}`);
    return `${found.name}${details.length > 0 ? ` (${details.join(' - ')})` : ''}`;
  }, [customerToAdd, availableCustomers, customerOptions]);

  // Asynchronously fetches customers list matching the search query from the backend API
  const fetchCustomersFromBackend = async (query) => {
    setIsLoading(true);
    try {
      const response = await getClienti(query, 50, 0);
      const data = Array.isArray(response) ? response : (response?.data || []);
      setCustomerOptions(data);
    } catch (err) {
      console.error("Errore durante il recupero dei clienti:", err);
      setCustomerOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Opens the customer dropdown menu and calculates absolute positioning coordinates
  const openCustomerDropdown = () => {
    if (isOpenRef.current) return; // Prevents rapid double execution (focus + click)
    isOpenRef.current = true;

    if (customerInputRef.current) {
      const rect = customerInputRef.current.getBoundingClientRect();
      setDropdownCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 320)
      });
    }
    setIsCustomerDropdownOpen(true);
    setCustomerSearchText('');
    // Initial data fetch from backend when the dropdown opens
    fetchCustomersFromBackend('');
  };

  // Handles input value changes and triggers debounced backend searches
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setCustomerSearchText(val);
    if (!isOpenRef.current) openCustomerDropdown();
    if (!val) setCustomerToAdd('');

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce timer for asynchronous backend searches
    searchTimeoutRef.current = setTimeout(() => {
      fetchCustomersFromBackend(val);
    }, 300);
  };

  // Handles keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
  const handleKeyDown = (e) => {
    if (!isCustomerDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        openCustomerDropdown();
      } else if (e.key === 'Enter') {
        // Secondo invio (menu chiuso): se c'è un cliente selezionato, attiva l'aggiunta
        if (customerToAdd && handleAddCustomerRow) {
          e.preventDefault();
          handleAddCustomerRow();
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < customerOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (customerOptions.length > 0 && selectedIndex >= 0 && selectedIndex < customerOptions.length) {
        const cust = customerOptions[selectedIndex];
        setCustomerToAdd(cust.id);
        setCustomerSearchText('');
        setIsCustomerDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsCustomerDropdownOpen(false);
    }
  };

  // Closes the dropdown menu when clicking outside the input or dropdown element
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerInputRef.current && !customerInputRef.current.contains(e.target)) {
        const dropdownEl = document.getElementById('customer-search-dropdown-menu');
        if (dropdownEl && !dropdownEl.contains(e.target)) {
          setIsCustomerDropdownOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="d-flex align-items-center gap-1 position-relative">
      <input
        type="text"
        ref={customerInputRef}
        className={inputClassName}
        style={inputStyle}
        placeholder={placeholder}
        value={isCustomerDropdownOpen ? customerSearchText : (selectedCustomerName || customerSearchText)}
        onFocus={openCustomerDropdown}
        onClick={openCustomerDropdown}
        onChange={handleSearchInputChange}
        onKeyDown={handleKeyDown}
      />

      {showAddButton && handleAddCustomerRow && (
        <button
          onClick={handleAddCustomerRow}
          disabled={!customerToAdd}
          className={`btn btn-sm rounded-0 px-3 py-1 fw-bold d-flex align-items-center gap-1 shadow-none ${customerToAdd ? 'btn-primary' : 'btn-dark text-white opacity-50'}`}
          style={{ fontSize: '13px', lineHeight: '1.5' }}
        >
          <i className="bi bi-plus-lg"></i>
        </button>
      )}

      {isCustomerDropdownOpen && (
        <div 
          id="customer-search-dropdown-menu"
          ref={dropdownListRef}
          className="position-fixed bg-white border shadow rounded-1 py-1"
          style={{
            top: `${dropdownCoords.top}px`,
            left: `${dropdownCoords.left}px`,
            width: `${dropdownCoords.width}px`,
            maxHeight: '260px',
            overflowY: 'auto',
            fontSize: '12px',
            zIndex: 99999
          }}
        >
          {isLoading ? (
            <div className="px-3 py-3 text-muted text-center">
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Caricamento in corso...
            </div>
          ) : customerOptions.length === 0 ? (
            <div className="px-3 py-2 text-muted text-center">Nessun cliente trovato</div>
          ) : (
            customerOptions.map((cust, index) => {
              const ident = cust.customer_code || cust.tax_id || cust.vat_number || '';
              const parentCode = cust.parent_code || cust.parent_customer_code || '';
              const isSelected = String(customerToAdd) === String(cust.id);
              const isHighlighted = index === selectedIndex;
              
              return (
                <div
                  key={cust.id}
                  className={`customer-option-item px-3 py-2 text-dark border-bottom border-light ${
                    isSelected ? 'bg-primary text-white' : isHighlighted ? 'bg-light' : 'hover-bg-light'
                  }`}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCustomerToAdd(cust.id);
                    setCustomerSearchText('');
                    setIsCustomerDropdownOpen(false);
                  }}
                >
                  <div className="fw-semibold text-truncate">{cust.name}</div>
                  {/* Mantenuto text-muted per preservare i colori originali senza sbiadire */}
                  <div className={`d-flex gap-2 small ${isSelected ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '11px' }}>
                    {ident && <span>ID/P.IVA: {ident}</span>}
                    {parentCode && <span>Padre: {parentCode}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default CustomerSearchInput;
