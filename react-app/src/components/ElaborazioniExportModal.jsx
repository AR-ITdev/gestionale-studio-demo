// src/components/ElaborazioniExportModal.jsx
import { useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx-js-style';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

/**
 * Narrow print margins (inches), matching Excel's built-in "Narrow" preset.
 */
const NARROW_PRINT_MARGINS = { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

/**
 * xlsx-js-style (like the underlying SheetJS community writer it is based on) does not
 * serialize the `!pageSetup` worksheet property, so landscape orientation and "fit to page"
 * printing cannot be requested through the public API alone. This post-processes the
 * generated .xlsx (which is just a zip of OOXML parts) to inject the missing
 * <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr> and <pageSetup .../> nodes directly into
 * the worksheet XML, right after it has been written by the library.
 */
const applyLandscapeFitToPage = (xlsxArrayBuffer) => {
  const files = unzipSync(new Uint8Array(xlsxArrayBuffer));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetXml = files[sheetPath];
  if (!sheetXml) return xlsxArrayBuffer;

  let xml = strFromU8(sheetXml);

  // Mark the sheet to scale its content to fit the printed page width
  if (!/<sheetPr[\s/>]/.test(xml)) {
    xml = xml.replace(/<dimension\b/, '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension');
  }

  // Force landscape orientation, A4 paper, and fit-to-1-page-wide (unlimited pages tall)
  const pageSetupTag = '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
  if (/<pageSetup\b[^>]*\/>/.test(xml)) {
    xml = xml.replace(/<pageSetup\b[^>]*\/>/, pageSetupTag);
  } else if (/<pageMargins\b[^>]*\/>/.test(xml)) {
    xml = xml.replace(/(<pageMargins\b[^>]*\/>)/, `$1${pageSetupTag}`);
  } else {
    xml = xml.replace('</worksheet>', `${pageSetupTag}</worksheet>`);
  }

  files[sheetPath] = strToU8(xml);
  return zipSync(files, { level: 6 });
};

/**
 * Writes the workbook to disk, applying the print layout fix-up above since
 * XLSX.writeFile would otherwise silently drop the page setup information.
 */
const writeWorkbookWithPrintSetup = (wb, fileName) => {
  const arrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const finalBytes = applyLandscapeFitToPage(arrayBuffer);
  const blob = new Blob([finalBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Mapping object to convert numeric month representations into their Italian full names.
 */
const MONTH_NAMES_MAP = {
  1: 'GENNAIO',
  2: 'FEBBRAIO',
  3: 'MARZO',
  4: 'APRILE',
  5: 'MAGGIO',
  6: 'GIUGNO',
  7: 'LUGLIO',
  8: 'AGOSTO',
  9: 'SETTEMBRE',
  10: 'OTTOBRE',
  11: 'NOVEMBRE',
  12: 'DICEMBRE'
};

/**
 * Mapping object to establish chronological sorting order for months.
 */
const MONTH_ORDER_MAP = {
  'GENNAIO': 1,
  'FEBBRAIO': 2,
  'MARZO': 3,
  'APRILE': 4,
  'MAGGIO': 5,
  'GIUGNO': 6,
  'JULY': 7,
  'LUGLIO': 7,
  'AGOSTO': 8,
  'SETTEMBRE': 9,
  'OTTOBRE': 10,
  'NOVEMBRE': 11,
  'DICEMBRE': 12
};

const CURRENCY_NUM_FORMAT = '"€" #,##0.00';

/**
 * Helper function to retrieve the full uppercase month name from various input formats.
 */
const getMonthFullName = (monthValue) => {
  if (!monthValue) return 'N/D';
  const num = Number(monthValue);
  if (!isNaN(num) && MONTH_NAMES_MAP[num]) {
    return MONTH_NAMES_MAP[num];
  }
  const cleanNum = parseInt(String(monthValue).replace(/\D/g, ''), 10);
  if (MONTH_NAMES_MAP[cleanNum]) {
    return MONTH_NAMES_MAP[cleanNum];
  }
  return String(monthValue).toUpperCase();
};

/**
 * Formats raw date strings into standard numeric Italian format (DD/MM/YYYY).
 */
const formatDateNumeric = (rawDate) => {
  if (!rawDate) return 'N/D';
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return String(rawDate);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Determines custom sorting priority for service categories and subcategories.
 */
const getCustomCategoryPriority = (category, subcategory, customSortRules = null) => {
  const cat = String(category || '').trim().toUpperCase();
  const sub = String(subcategory || '').trim().toUpperCase();

  if (customSortRules && typeof customSortRules === 'function') {
    const customPriority = customSortRules(cat, sub);
    if (customPriority !== undefined && customPriority !== null) {
      return customPriority;
    }
  }

  if (cat.includes('PAGHE')) {
    if (sub.includes('CEDOLIN')) return 2;
    return 1;
  }
  if (cat.includes('CONTABILIT')) return 3;
  if (cat.includes('REDDITI')) return 4;
  return 5;
};

const isCedoliniService = (service) => {
  const category = String(service?.category || '').trim().toUpperCase();
  const subcategory = String(service?.subcategory || '').trim().toUpperCase();
  const name = String(service?.name || '').trim().toUpperCase();

  return category.includes('PAGHE') && (subcategory.includes('CEDOLIN') || name.includes('CEDOLIN'));
};

const normalizeExcelStyleColors = (style) => {
  const fontPalette = {
    '047857': '343A40',
    '0d6efd': '343A40',
    '0f5132': '343A40',
    '2C3E50': '343A40',
    '842029': '343A40',
    b45309: '343A40'
  };
  const fillPalette = {
    '198754': '343A40',
    '4B5563': 'E9ECEF',
    D1E7DD: 'F1F3F5',
    E2E3E5: 'F1F3F5',
    E8F5E9: 'F1F3F5',
    F1F5F9: 'F8F9FA',
    F8D7DA: 'F1F3F5',
    F9FAFB: 'F8F9FA',
    F9FBFB: 'F8F9FA'
  };
  const addAlpha = (color) => {
    if (typeof color?.rgb === 'string' && /^[\da-f]{6}$/i.test(color.rgb)) {
      color.rgb = `FF${color.rgb}`;
    }
  };

  const normalizeColor = (color, palette) => {
    if (typeof color?.rgb === 'string') {
      color.rgb = palette[color.rgb.replace(/^FF/i, '')] || color.rgb;
    }
    addAlpha(color);
  };

  normalizeColor(style.font?.color, fontPalette);
  normalizeColor(style.fill?.fgColor, fillPalette);
  normalizeColor(style.fill?.bgColor, fillPalette);
  Object.values(style.border || {}).forEach((border) => {
    if (border?.color) border.color.rgb = 'FFDDE1E5';
    if (border?.style) border.style = 'thin';
  });

  if (style.alignment) style.alignment.wrapText = true;

  return style;
};

/**
 * ElaborazioniExportModal component handles automated Excel report generation and export
 * for customer data, debits, payments, and yearly balances.
 */
export const ElaborazioniExportModal = ({
  isOpen,
  onClose,
  onExportComplete = null,
  onExportError = null,
  onNoRecords = null,
  exportData = {},
  customSortRules = null,
  customDateSorter = null
}) => {
  // Ref to prevent duplicate exports during the same open lifecycle
  const hasExportedRef = useRef(false);

  const {
    customers = [],
    items = [],
    services = [],
    payments = [],
    transactions = [],
    customersSummary = {},
    currentYear = new Date().getFullYear(),
    previousYear = new Date().getFullYear() - 1,
    contextIdentifier = 'Report'
  } = exportData;

  // Callback function to build and trigger the Excel spreadsheet download
  const handleExportExcel = useCallback(() => {
    try {
      const exportRows = [];
      const merges = [];
      const cellStyles = {};

      customers.forEach((customer) => {
        const customerId = Number(customer.id);

        // Extracting previous period data ("00" / previous year) for the specific customer or globally
        const clientData = customerId ? (customersSummary?.[customerId] || customersSummary?.[String(customerId)] || null) : null;
        const prevPeriodData = clientData?.periods?.["00"] || null;

        const prevContabilita = Number(prevPeriodData?.CONTABILITA || 0);
        const prevRedditi = Number(prevPeriodData?.REDDITI || 0);
        const prevPaghe = Number(prevPeriodData?.PAGHE || 0);
        const prevVarie = Number(prevPeriodData?.VARIE || 0);

        const totalDebitiAnnoPrecedente = prevContabilita + prevRedditi + prevPaghe + prevVarie;
        const totalIncassiAnnoPrecedente = Number(prevPeriodData?.payment || 0);
        const totalScontiAnnoPrecedente = Number(prevPeriodData?.discount || 0);

        const netDebitiPrev = totalDebitiAnnoPrecedente - totalScontiAnnoPrecedente;
        const previousBalance = Number(
          clientData?.previousYearBalance ?? prevPeriodData?.balance ?? (totalIncassiAnnoPrecedente - netDebitiPrev)
        );

        // Filtering items matching the customer and current year
        const customerItems = items.filter((item) => {
          if (Number(item.customer_id) !== customerId || Number(item.year) !== Number(currentYear)) return false;

          const service = services.find((s) => Number(s.id) === Number(item.service_id));
          if (!service) return false;

          const quantity = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const total = quantity * price;
          if (quantity <= 0 || total <= 0) return false;

          const itemMonth = Number(item.month);
          if (isNaN(itemMonth) || itemMonth === null || itemMonth === undefined) return false;

          const matchingTx = transactions.find(t =>
            t.category === service.category &&
            Number(t.year) === Number(currentYear) &&
            Number(t.month) === itemMonth
          );

          if (!matchingTx || (Number(matchingTx.status) !== 1 && matchingTx.status !== true)) {
            return false;
          }

          return true;
        });

        // Mapping unique payments for the customer
        const uniquePaymentsMap = new Map();

        payments.forEach((p) => {
          const payerId = Number(p.payer_customer_id || p.customer_id || p.client_id || 0);
          if (payerId !== customerId) return;

          const transactionStatus = p.status !== undefined ? Number(p.status) : 1;
          if (transactionStatus !== 1) return;

          const rawDate = p.payment_date || p.date || p.created_at || p.data;
          const pYear = rawDate ? new Date(rawDate).getFullYear() : Number(currentYear);
          const compYear = Number(p.competence_year || p.year || pYear);
          if (pYear !== Number(currentYear) && compYear !== Number(currentYear)) return;

          const amount = Number(p.amount || p.total || p.value || 0);
          const discountField = Number(p.discount || p.sconto || 0);
          if (amount <= 0 && discountField <= 0) return;

          const paymentId = p.id || `${rawDate}_${amount}_${discountField}_${p.payment_method || ''}`;
          if (!uniquePaymentsMap.has(paymentId)) {
            uniquePaymentsMap.set(paymentId, p);
          }
        });

        const customerPaymentsRaw = Array.from(uniquePaymentsMap.values());

        if (customerItems.length === 0 && customerPaymentsRaw.length === 0 && Math.abs(previousBalance) <= 0.01) return;

        const startRowIndex = exportRows.length;

        // Customer header rows insertion & cell styling configuration
        exportRows.push({
          'Mese / Data': `RAGIONE SOCIALE: ${customer.name || 'N/D'}`,
          'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '', 'Quantità': '', 'Importo Totale': ''
        });
        merges.push({ s: { r: startRowIndex, c: 0 }, e: { r: startRowIndex, c: 6 } });
        for (let c = 0; c <= 6; c++) {
          cellStyles[XLSX.utils.encode_cell({ r: startRowIndex, c })] = {
            font: { name: 'Arial', sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "198754" } },
            alignment: { vertical: 'center', horizontal: 'left' },
            border: { top: { style: 'medium', color: { rgb: "198754" } }, left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } }, right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } } }
          };
        }

        exportRows.push({
          'Mese / Data': `CODICE CLIENTE: ${customer.customer_code || 'N/D'}`,
          'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '', 'Quantità': '', 'Importo Totale': ''
        });
        merges.push({ s: { r: startRowIndex + 1, c: 0 }, e: { r: startRowIndex + 1, c: 6 } });
        for (let c = 0; c <= 6; c++) {
          cellStyles[XLSX.utils.encode_cell({ r: startRowIndex + 1, c })] = {
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: "333333" } },
            fill: { fgColor: { rgb: "E8F5E9" } },
            alignment: { vertical: 'center', horizontal: 'left' },
            border: { left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } }, right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } } }
          };
        }

        exportRows.push({
          'Mese / Data': `ANNO DI RIFERIMENTO: ${currentYear}`,
          'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '', 'Quantità': '', 'Importo Totale': ''
        });
        merges.push({ s: { r: startRowIndex + 2, c: 0 }, e: { r: startRowIndex + 2, c: 6 } });
        for (let c = 0; c <= 6; c++) {
          cellStyles[XLSX.utils.encode_cell({ r: startRowIndex + 2, c })] = {
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: "333333" } },
            fill: { fgColor: { rgb: "E8F5E9" } },
            alignment: { vertical: 'center', horizontal: 'left' },
            border: { bottom: { style: 'medium', color: { rgb: "198754" } }, left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } }, right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } } }
          };
        }

        let currentRow = startRowIndex + 3;

        // Debits table header
        const debitiHeaderIdx = currentRow;
        exportRows.push({
          'Mese / Data': 'MESE',
          'Servizio / Tipo': 'SERVIZIO / TIPO',
          'Sottoservizio / Metodo': 'SOTTOSERVIZIO',
          'Note': 'NOTE',
          'Importo Unitario': 'IMPORTO UNITARIO',
          'Quantità': 'QUANTITÀ',
          'Importo Totale': 'IMPORTO TOTALE'
        });
        for (let c = 0; c <= 6; c++) {
          cellStyles[XLSX.utils.encode_cell({ r: debitiHeaderIdx, c })] = {
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "2C3E50" } },
            alignment: { vertical: 'center', horizontal: c >= 4 ? 'right' : 'left' },
            border: {
              top: { style: 'thin', color: { rgb: "198754" } },
              bottom: { style: 'medium', color: { rgb: "198754" } },
              left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
              right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
            }
          };
        }
        currentRow++;

        const previousBalanceRow = currentRow;
        const previousBalanceDescription = previousBalance > 0.01
          ? 'CREDITO A FAVORE'
          : previousBalance < -0.01
          ? 'DEBITO RESIDUO'
          : 'NESSUN RESIDUO';
        exportRows.push({
          'Mese / Data': `ANNO PRECEDENTE ${previousYear}`,
          'Servizio / Tipo': 'RESIDUO',
          'Sottoservizio / Metodo': previousBalanceDescription,
          'Note': '',
          'Importo Unitario': '',
          'Quantità': '',
          'Importo Totale': -previousBalance
        });
        for (let c = 0; c <= 6; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: previousBalanceRow, c });
          cellStyles[cellRef] = {
            font: { name: 'Arial', sz: 9.5, bold: true, color: { rgb: previousBalance > 0.01 ? '047857' : previousBalance < -0.01 ? 'b45309' : '475569' } },
            fill: { fgColor: { rgb: 'F1F5F9' } },
            alignment: { vertical: 'center', horizontal: c >= 4 ? 'right' : 'left' },
            border: {
              top: { style: 'thin', color: { rgb: 'CBD5E1' } },
              bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
              left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: '198754' } },
              right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: '198754' } }
            }
          };
          if (c === 6) cellStyles[cellRef].numFmt = CURRENCY_NUM_FORMAT;
        }
        currentRow++;

        const preparedDebiti = [];
        const cedoliniByMonth = new Map();
        let totalCompetenze = -previousBalance;

        customerItems.forEach((item) => {
          const service = services.find((s) => Number(s.id) === Number(item.service_id));
          const quantity = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const total = quantity * price;
          totalCompetenze += total;

          const monthText = getMonthFullName(item.month);
          const defaultSubSort = MONTH_ORDER_MAP[monthText] || 99;
          const subSort = customDateSorter ? customDateSorter(monthText, item) : defaultSubSort;

          if (isCedoliniService(service)) {
            const monthKey = Number(item.month);
            const cedolini = cedoliniByMonth.get(monthKey) || {
              monthText,
              subSort,
              quantity: 0,
              total: 0
            };
            cedolini.quantity += quantity;
            cedolini.total += total;
            cedoliniByMonth.set(monthKey, cedolini);
            return;
          }

          let note = item.notes || '';
          try {
            const parsed = typeof item.custom_data === 'string' ? JSON.parse(item.custom_data || '{}') : (item.custom_data || {});
            if (parsed.note) note = parsed.note;
          } catch (error) {
            console.error("Errore parsing note item:", error);
          }

          preparedDebiti.push({
            priority: getCustomCategoryPriority(service?.category, service?.subcategory, customSortRules),
            subSort,
            row: {
              'Mese / Data': monthText,
              'Servizio / Tipo': service?.category || 'SERVIZIO',
              'Sottoservizio / Metodo': service?.subcategory || service?.name || '',
              'Note': note,
              'Importo Unitario': price,
              'Quantità': quantity,
              'Importo Totale': total
            }
          });
        });

        cedoliniByMonth.forEach((cedolini) => {
          preparedDebiti.push({
            priority: getCustomCategoryPriority('PAGHE', 'CEDOLINI', customSortRules),
            subSort: cedolini.subSort,
            row: {
              'Mese / Data': cedolini.monthText,
              'Servizio / Tipo': 'PAGHE',
              'Sottoservizio / Metodo': 'CEDOLINI',
              'Note': '',
              'Importo Unitario': '',
              'Quantità': cedolini.quantity,
              'Importo Totale': cedolini.total
            }
          });
        });

        preparedDebiti.sort((a, b) => a.subSort !== b.subSort ? a.subSort - b.subSort : a.priority - b.priority);

        preparedDebiti.forEach((item, idx) => {
          const rIdx = currentRow;
          exportRows.push(item.row);
          const rowBg = idx % 2 === 0 ? "FFFFFF" : "F9FBFB";

          for (let c = 0; c <= 6; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c });
            const isNum = c >= 4;
            cellStyles[cellRef] = {
              font: { name: 'Arial', sz: 9.5, color: { rgb: "333333" } },
              fill: { fgColor: { rgb: rowBg } },
              alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
              border: {
                top: { style: 'thin', color: { rgb: "E0E0E0" } },
                bottom: { style: 'thin', color: { rgb: "E0E0E0" } },
                left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
                right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
              }
            };
            if (c === 4 || c === 6) cellStyles[cellRef].numFmt = CURRENCY_NUM_FORMAT;
            else if (c === 5) cellStyles[cellRef].numFmt = '#,##0';
          }
          currentRow++;
        });

        // Competence subtotal row
        const totCompetenzeIdx = currentRow;
        exportRows.push({
          'Mese / Data': '',
          'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '',
          'Quantità': 'TOTALE COMPETENZE:',
          'Importo Totale': totalCompetenze
        });
        merges.push({ s: { r: totCompetenzeIdx, c: 0 }, e: { r: totCompetenzeIdx, c: 4 } });
        for (let c = 0; c <= 6; c++) {
          const cellRef = XLSX.utils.encode_cell({ r: totCompetenzeIdx, c });
          cellStyles[cellRef] = {
            font: { name: 'Arial', sz: 9.5, bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "E8F5E9" } },
            alignment: { vertical: 'center', horizontal: c >= 5 ? 'right' : 'left' },
            border: {
              top: { style: 'medium', color: { rgb: "198754" } },
              bottom: { style: 'medium', color: { rgb: "198754" } },
              left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
              right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
            }
          };
          if (c === 6) cellStyles[cellRef].numFmt = CURRENCY_NUM_FORMAT;
        }
        currentRow++;

        // Payments table header
        const pagamentiHeaderIdx = currentRow;
        exportRows.push({
          'Mese / Data': 'DATA PAGAMENTO',
          'Servizio / Tipo': 'TIPO',
          'Sottoservizio / Metodo': 'METODO',
          'Note': 'NOTE',
          'Importo Unitario': 'IMPORTO UNITARIO',
          'Quantità': 'QUANTITÀ',
          'Importo Totale': 'IMPORTO TOTALE'
        });
        for (let c = 0; c <= 6; c++) {
          cellStyles[XLSX.utils.encode_cell({ r: pagamentiHeaderIdx, c })] = {
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "34495E" } },
            alignment: { vertical: 'center', horizontal: c >= 4 ? 'right' : 'left' },
            border: {
              top: { style: 'medium', color: { rgb: "198754" } },
              bottom: { style: 'medium', color: { rgb: "0d6efd" } },
              left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
              right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
            }
          };
        }
        currentRow++;

        const actualPaymentsList = [];
        const discountPaymentsList = [];
        let totalPagamentiIncasso = 0;
        let totalSconti = 0;

        customerPaymentsRaw.forEach((p) => {
          const method = String(p.payment_method || p.metodo || '').trim().toUpperCase();
          const rawDate = p.payment_date || p.date || p.created_at || p.data;
          const numericDateStr = formatDateNumeric(rawDate);
          const timestamp = rawDate ? new Date(rawDate).getTime() : 0;
          const amount = Number(p.amount || p.total || p.value || 0);
          const discountField = Number(p.discount || p.sconto || 0);

          const isDiscountRecord = method.includes('SCONTO') || discountField > 0;
          const effectiveValue = isDiscountRecord ? (discountField > 0 ? discountField : amount) : amount;

          if (isDiscountRecord && effectiveValue > 0) {
            totalSconti += effectiveValue;
            discountPaymentsList.push({
              timestamp,
              row: {
                'Mese / Data': numericDateStr,
                'Servizio / Tipo': 'PAGAMENTO',
                'Sottoservizio / Metodo': method || 'SCONTO',
                'Note': p.notes || '',
                'Importo Unitario': effectiveValue,
                'Quantità': 1,
                'Importo Totale': effectiveValue
              }
            });
          } else if (!isDiscountRecord && amount > 0) {
            totalPagamentiIncasso += amount;
            actualPaymentsList.push({
              timestamp,
              row: {
                'Mese / Data': numericDateStr,
                'Servizio / Tipo': 'PAGAMENTO',
                'Sottoservizio / Metodo': method || 'ELETTRONICO',
                'Note': p.notes || '',
                'Importo Unitario': amount,
                'Quantità': 1,
                'Importo Totale': amount
              }
            });
          }
        });

        actualPaymentsList.sort((a, b) => a.timestamp - b.timestamp);
        discountPaymentsList.sort((a, b) => a.timestamp - b.timestamp);

        const preparedPayments = [...actualPaymentsList, ...discountPaymentsList];

        preparedPayments.forEach((item, idx) => {
          const rIdx = currentRow;
          exportRows.push(item.row);
          const rowBg = idx % 2 === 0 ? "FFFFFF" : "F9FBFB";

          for (let c = 0; c <= 6; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c });
            const isNum = c >= 4;
            cellStyles[cellRef] = {
              font: { name: 'Arial', sz: 9.5, color: { rgb: "333333" } },
              fill: { fgColor: { rgb: rowBg } },
              alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left' },
              border: {
                top: { style: 'thin', color: { rgb: "E0E0E0" } },
                bottom: { style: 'thin', color: { rgb: "E0E0E0" } },
                left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
                right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
              }
            };
            if (c === 4 || c === 6) cellStyles[cellRef].numFmt = CURRENCY_NUM_FORMAT;
            else if (c === 5) cellStyles[cellRef].numFmt = '#,##0';
          }
          currentRow++;
        });

        // Payments subtotal configuration
        const pagamentiSubtotalConfig = [
          { label: 'TOTALE PAGAMENTI:', val: totalPagamentiIncasso, color: '0d6efd' }
        ];

        if (totalSconti > 0) {
          pagamentiSubtotalConfig.push({ label: 'TOTALE SCONTO:', val: totalSconti, color: 'b45309' });
        }

        pagamentiSubtotalConfig.forEach((subItem, index) => {
          const rIdx = currentRow;
          exportRows.push({
            'Mese / Data': '',
            'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '',
            'Quantità': subItem.label,
            'Importo Totale': subItem.val
          });
          merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 4 } });

          const isLastSubRow = index === pagamentiSubtotalConfig.length - 1;

          for (let c = 0; c <= 6; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c });
            cellStyles[cellRef] = {
              font: { name: 'Arial', sz: 9.5, bold: true, color: { rgb: subItem.color } },
              fill: { fgColor: { rgb: "F1F5F9" } },
              alignment: { vertical: 'center', horizontal: c >= 5 ? 'right' : 'left' },
              border: {
                top: { style: 'thin', color: { rgb: "cbd5e1" } },
                bottom: { style: isLastSubRow ? 'medium' : 'thin', color: { rgb: isLastSubRow ? '198754' : 'cbd5e1' } },
                left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
                right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
              }
            };
            if (c === 6) cellStyles[cellRef].numFmt = CURRENCY_NUM_FORMAT;
          }
          currentRow++;
        });

        currentRow = exportRows.length;

        // Account summary section
        const riepilogoHeaderIdx = currentRow;
        exportRows.push({
          'Mese / Data': '',
          'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '',
          'Quantità': '', 'Importo Totale': ''
        });
        merges.push({ s: { r: riepilogoHeaderIdx, c: 0 }, e: { r: riepilogoHeaderIdx, c: 4 } });
        for (let c = 0; c <= 6; c++) {
          cellStyles[XLSX.utils.encode_cell({ r: riepilogoHeaderIdx, c })] = {
            font: { name: 'Arial', sz: 10, bold: true, color: { rgb: "343A40" } },
            fill: { fgColor: { rgb: "4B5563" } },
            alignment: { vertical: 'center', horizontal: c >= 5 ? 'right' : 'left' },
            border: {
              top: { style: 'medium', color: { rgb: "198754" } },
              bottom: { style: 'medium', color: { rgb: "198754" } },
              left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
              right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
            }
          };
        }
        currentRow++;

        const summaryRowsConfig = [
          { label: 'TOTALE COMPETENZE:', val: totalCompetenze, color: '2C3E50' },
          { label: 'TOTALE PAGAMENTI:', val: totalPagamentiIncasso, color: '0d6efd' }
        ];

        if (totalSconti > 0) {
          summaryRowsConfig.push({ label: 'TOTALE SCONTO:', val: totalSconti, color: 'b45309' });
        }

        const totaleDovuto = totalCompetenze - totalPagamentiIncasso - totalSconti;
        summaryRowsConfig.push({
          label: 'TOTALE DOVUTO:',
          val: totaleDovuto,
          color: totaleDovuto > 0.01 ? '842029' : totaleDovuto < -0.01 ? '0f5132' : '41464b',
          fill: totaleDovuto > 0.01 ? 'F8D7DA' : totaleDovuto < -0.01 ? 'D1E7DD' : 'E2E3E5'
        });

        summaryRowsConfig.forEach((sRow) => {
          const rIdx = currentRow;
          exportRows.push({
            'Mese / Data': '',
            'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '',
            'Quantità': sRow.label,
            'Importo Totale': sRow.val
          });
          merges.push({ s: { r: rIdx, c: 0 }, e: { r: rIdx, c: 4 } });

          for (let c = 0; c <= 6; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: rIdx, c });
            cellStyles[cellRef] = {
              font: { name: 'Arial', sz: 9.5, bold: true, color: { rgb: '343A40' } },
              fill: { fgColor: { rgb: sRow.fill || 'F9FAFB' } },
              alignment: { vertical: 'center', horizontal: c >= 5 ? 'right' : 'left' },
              border: {
                top: { style: 'thin', color: { rgb: "E5E7EB" } },
                bottom: { style: 'thin', color: { rgb: "E5E7EB" } },
                left: { style: c === 0 ? 'medium' : 'thin', color: { rgb: "198754" } },
                right: { style: c === 6 ? 'medium' : 'thin', color: { rgb: "198754" } }
              }
            };
            if (c === 6) cellStyles[cellRef].numFmt = CURRENCY_NUM_FORMAT;
          }
          currentRow++;
        });

        exportRows.push({
          'Mese / Data': '', 'Servizio / Tipo': '', 'Sottoservizio / Metodo': '', 'Note': '', 'Importo Unitario': '', 'Quantità': '', 'Importo Totale': ''
        });
        currentRow++;
      });

// Finalizing workbook, applying styles, columns width, and writing output file
      if (exportRows.length > 0) {
        const now = new Date();
        const dateFormatted = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
        
        let fileName = '';
        
        // Single client
        if (customers.length === 1) {
          const currentCustomer = customers[0] || {};
          const rawClientName = currentCustomer.name || 'Cliente';
          const rawClientCode = currentCustomer.customer_code || currentCustomer.code || 'N_D';

          const safeClientName = String(rawClientName).trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
          const safeClientCode = String(rawClientCode).trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');

          fileName = `${dateFormatted}_${safeClientName}_${safeClientCode}.xlsx`;
        } else {
          // Group Clients
          const safeIdentifier = String(contextIdentifier).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
          fileName = `${dateFormatted}_${safeIdentifier}.xlsx`;
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportRows, { skipHeader: true });

        ws['!merges'] = merges;
        const minColumnWidths = [14, 16, 17, 14, 18, 21, 18];
        const maxColumnWidths = [24, 28, 28, 40, 20, 26, 22];
        const mergedCells = new Set();
        merges.forEach(({ s, e }) => {
          for (let column = s.c; column <= e.c; column++) {
            mergedCells.add(`${s.r}:${column}`);
          }
        });

        const columnWidths = minColumnWidths.map((minWidth, columnIndex) => {
          let width = minWidth;
          exportRows.forEach((row, rowIndex) => {
            if (mergedCells.has(`${rowIndex}:${columnIndex}`)) return;
            const value = Object.values(row)[columnIndex];
            if (value === null || value === undefined || value === '') return;

            const isCurrency = columnIndex === 4 || columnIndex === 6;
            const text = typeof value === 'number'
              ? `${value.toLocaleString('it-IT', { minimumFractionDigits: isCurrency ? 2 : 0, maximumFractionDigits: 2 })}${isCurrency ? ' €' : ''}`
              : String(value);
            width = Math.max(width, text.length + 2);
          });

          return Math.min(width, maxColumnWidths[columnIndex]);
        });

        ws['!cols'] = columnWidths.map((wch) => ({ wch }));
        ws['!rows'] = exportRows.map((row, rowIndex) => {
          let lineCount = 1;
          Object.values(row).forEach((value, columnIndex) => {
            if (value === null || value === undefined || value === '') return;
            const merge = merges.find(({ s }) => s.r === rowIndex && s.c === columnIndex);
            const availableWidth = merge
              ? columnWidths.slice(merge.s.c, merge.e.c + 1).reduce((total, width) => total + width, 0)
              : columnWidths[columnIndex];
            lineCount = Math.max(lineCount, Math.ceil(String(value).length / availableWidth));
          });

          const firstCell = String(row['Mese / Data'] || '');
          if (firstCell.startsWith('RAGIONE SOCIALE:')) return { hpt: 25 };
          if (firstCell === 'MESE' || firstCell === 'DATA PAGAMENTO' || firstCell.startsWith('RIEPILOGO CONTO')) return { hpt: 22 };
          if (!firstCell && !row['Servizio / Tipo'] && !row['Quantità'] && !row['Importo Totale']) return { hpt: 8 };
          return { hpt: Math.min(60, Math.max(19, lineCount * 15 + 4)) };
        });

        Object.keys(cellStyles).forEach(ref => {
          if (!ws[ref]) ws[ref] = {};
          ws[ref].s = normalizeExcelStyleColors(cellStyles[ref]);
          if (cellStyles[ref].numFmt) {
            ws[ref].z = cellStyles[ref].numFmt;
          }
        });

        // Define the print area over the full data range and apply narrow margins
        // so the sheet prints exactly as laid out, without manual setup in Excel.
        ws['!margins'] = NARROW_PRINT_MARGINS;
        const sheetName = `Riepilogo_${currentYear}`;
        const absoluteDataRange = ws['!ref'].replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
        wb.Workbook = wb.Workbook || {};
        wb.Workbook.Names = wb.Workbook.Names || [];
        wb.Workbook.Names.push({ Name: '_xlnm.Print_Area', Sheet: 0, Ref: `'${sheetName}'!${absoluteDataRange}` });

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        writeWorkbookWithPrintSetup(wb, fileName);
        onExportComplete?.();
      } else if (onNoRecords) {
        onNoRecords();
      }
    } catch (error) {
      console.error("Errore durante l'esportazione Excel:", error);
      onExportError?.();
    } finally {
      if (onClose) onClose();
    }
  }, [customers, items, services, payments, transactions, customersSummary, currentYear, previousYear, contextIdentifier, customSortRules, customDateSorter, onClose, onExportComplete, onExportError, onNoRecords]);

  // Automatically triggers Excel generation when the component mounts or opens
  useEffect(() => {
    if (isOpen && !hasExportedRef.current) {
      hasExportedRef.current = true;
      const timer = setTimeout(() => {
        handleExportExcel();
      }, 0);
      return () => clearTimeout(timer);
    } else if (!isOpen) {
      hasExportedRef.current = false;
    }
  }, [isOpen, handleExportExcel]);

  return null;
};

export default ElaborazioniExportModal;