import { useState, useRef, useEffect, useMemo } from 'react';
import { getCustomersGroupedSearch } from '../services/api';

/**
 * GroupSearchInput component provides a searchable input field with a dropdown 
 * to filter entities by all customers, parent company groups, or individual clients.
 */
export const GroupSearchInput = ({
  selectedFilterValue = '',
  availableCustomers = [],
  onFilterValueChange,
  placeholder = "Tutti i Clienti (Riepilogo Generale)",
  className = "position-relative",
  inputClassName = "form-control form-control-sm rounded-0 shadow-none text-dark border-secondary-subtle",
  inputStyle = { minWidth: '200px', cursor: 'pointer' }
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Data retrieved directly from backend API endpoints
  const [customerOptions, setCustomerOptions] = useState([]);
  const [parentOptions, setParentOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const isOpenRef = useRef(false);
  const dropdownListRef = useRef(null);
  const requestIdRef = useRef(0);
  const knownCustomers = useRef(new Map());
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Flattened options list to handle sequential keyboard navigation across ALL, PARENT, and CUSTOMER items
  const flatOptions = useMemo(() => {
    const list = [{ type: 'ALL', value: 'ALL' }];
    parentOptions.forEach(p => {
      list.push({ type: 'PARENT', value: `PARENT:${p.parent_code}`, data: p });
    });
    customerOptions.forEach(c => {
      list.push({ type: 'CUSTOMER', value: String(c.id), data: c });
    });
    return list;
  }, [parentOptions, customerOptions]);

  // Resets the selected index whenever options change
  useEffect(() => {
    setSelectedIndex(0);
  }, [flatOptions]);

  // Auto-scrolls the dropdown list to keep the selected index visible
  useEffect(() => {
    if (isOpen && dropdownListRef.current) {
      const items = dropdownListRef.current.querySelectorAll('.group-option-item');
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, isOpen]);

  useEffect(() => {
    return () => {
      requestIdRef.current++;
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Descriptive text displayed in the input field when not actively typing
  const displaySelectedText = () => {
    if (!selectedFilterValue) return '';
    if (selectedFilterValue === 'ALL') return 'Tutti i Clienti (Riepilogo Generale)';
    if (selectedFilterValue.startsWith('PARENT:')) {
      const parentCode = selectedFilterValue.replace('PARENT:', '');
      return ` Gruppo Padre: ${parentCode}`;
    }
    const found = availableCustomers.find(c => String(c.id) === String(selectedFilterValue)) ||
      customerOptions.find(c => String(c.id) === String(selectedFilterValue)) ||
      knownCustomers.current.get(String(selectedFilterValue));
    if (!found) return selectedFilterValue;
    const ident = found.customer_code || found.tax_id || found.vat_number || '';
    return `${found.name}${ident ? ` [${ident}]` : ''}`;
  };

  // Backend request to fetch filtered and grouped customers and parent codes
  const fetchGroupedDataFromBackend = async (query) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setSearchError('');
    try {
      const response = await getCustomersGroupedSearch(query);
      if (requestId !== requestIdRef.current) return;
      (response.customers || []).forEach(customer => knownCustomers.current.set(String(customer.id), customer));
      setCustomerOptions(response.customers || []);
      setParentOptions(response.parents || []);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("Errore durante il recupero dei dati raggruppati:", err);
      setSearchError('Impossibile caricare i clienti. Riprova la ricerca.');
      setCustomerOptions([]);
      setParentOptions([]);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  };

  const openDropdown = () => {
    if (isOpenRef.current) return;
    isOpenRef.current = true;

    setIsOpen(true);
    setSearchText('');
    fetchGroupedDataFromBackend('');
  };

  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchText(val);
    if (!isOpenRef.current) openDropdown();
    requestIdRef.current++;
    if (!val) onFilterValueChange('');

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      fetchGroupedDataFromBackend(val);
    }, 300);
  };

  // Handles keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        openDropdown();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < flatOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatOptions.length > 0 && selectedIndex >= 0 && selectedIndex < flatOptions.length) {
        const selected = flatOptions[selectedIndex];
        onFilterValueChange(selected.value);
        setSearchText('');
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={className} ref={containerRef}>
      <input
        type="text"
        className={inputClassName}
        style={inputStyle}
        placeholder={placeholder}
        value={isOpen ? searchText : (displaySelectedText() || searchText)}
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={handleSearchInputChange}
        onKeyDown={handleKeyDown}
      />

      {isOpen && (
        <div
          className="position-absolute top-100 start-0 bg-white border shadow rounded-1 py-1 text-start"
          style={{
            width: 'max-content',
            minWidth: 'clamp(300px, 100%, calc(100vw - 1rem))',
            maxWidth: 'calc(100vw - 1rem)',
            maxHeight: '300px',
            overflowY: 'auto',
            overflowX: 'auto',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 99999
          }}
        >
          {isLoading ? (
            <div className="px-3 py-3 text-muted text-center">
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Ricerca in corso...
            </div>
          ) : searchError ? (
            <div className="px-3 py-2 text-danger" role="alert">{searchError}</div>
          ) : (
            <div ref={dropdownListRef}>
              {flatOptions.map((item, index) => {
                const isHighlighted = index === selectedIndex;

                if (item.type === 'ALL') {
                  const isSelected = selectedFilterValue === 'ALL';
                  return (
                    <div key="all_option" className="border-bottom bg-light pb-1">
                      <div
                        className={`group-option-item px-3 py-2 text-dark ${isSelected ? 'bg-primary text-white' : isHighlighted ? 'bg-light' : 'hover-bg-light'}`}
                        style={{ cursor: 'pointer' }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onFilterValueChange('ALL');
                          setSearchText('');
                          setIsOpen(false);
                        }}
                      >
                        <div className="fw-semibold">
                          👥 Tutti i Clienti (Riepilogo Generale)
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'PARENT') {
                  const p = item.data;
                  const parentCode = p.parent_code;
                  const countChildren = p.children_count;
                  const isSelected = selectedFilterValue === `PARENT:${parentCode}`;
                  const isFirstParent = flatOptions.findIndex(o => o.type === 'PARENT') === index;

                  return (
                    <div key={`parent_${parentCode}`}>
                      {isFirstParent && (
                        <div className="border-bottom bg-light pb-1">
                          <div className="text-muted fw-bold px-3 py-1" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                            📁 Gruppi Corrispondenti (Codici Padre)
                          </div>
                        </div>
                      )}
                      <div
                        className={`group-option-item px-3 py-2 text-dark border-bottom border-light ${isSelected ? 'bg-primary text-white' : isHighlighted ? 'bg-light' : 'hover-bg-light'}`}
                        style={{ cursor: 'pointer' }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onFilterValueChange(`PARENT:${parentCode}`);
                          setSearchText('');
                          setIsOpen(false);
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <span className={`fw-semibold ${isSelected ? 'text-white' : 'text-primary'}`}>
                            Gruppo Padre: {parentCode}
                          </span>
                          <span className={`badge ${isSelected ? 'bg-light text-dark' : 'bg-secondary text-white'}`} style={{ fontSize: '10px' }}>
                            {countChildren} {countChildren === 1 ? 'azienda' : 'aziende'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item.type === 'CUSTOMER') {
                  const cust = item.data;
                  const ident = cust.customer_code || cust.tax_id || cust.vat_number || '';
                  const parentCode = cust.parent_code || cust.parent_customer_code || '';
                  const isSelected = String(selectedFilterValue) === String(cust.id);
                  const isFirstCustomer = flatOptions.findIndex(o => o.type === 'CUSTOMER') === index;

                  return (
                    <div key={`cust_${cust.id}`}>
                      {isFirstCustomer && (
                        <div className="py-1">
                          <div className="text-muted fw-bold px-3 py-1" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                            👤 Singoli Clienti
                          </div>
                        </div>
                      )}
                      <div
                        className={`group-option-item px-3 py-2 text-dark border-bottom border-light ${isSelected ? 'bg-primary text-white' : isHighlighted ? 'bg-light' : 'hover-bg-light'}`}
                        style={{ cursor: 'pointer' }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onFilterValueChange(String(cust.id));
                          setSearchText('');
                          setIsOpen(false);
                        }}
                      >
                        <div className="fw-semibold">{cust.name}</div>
                        {/* Mantenute le classi text-muted/text-primary originali per preservare la leggibilità */}
                        <div className={`d-flex gap-2 small ${isSelected ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '11px' }}>
                          {ident && <span>ID/P.IVA: {ident}</span>}
                          {parentCode && <span className={isSelected ? 'text-white' : 'text-primary'}>Padre: {parentCode}</span>}
                        </div>
                      </div>
                    </div>
                  );
                }

                return null;
              })}

              {flatOptions.length === 1 && customerOptions.length === 0 && parentOptions.length === 0 && searchText && (
                <div className="px-3 py-2 text-muted text-center" style={{ fontSize: '12px' }}>
                  Nessun cliente trovato
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupSearchInput;