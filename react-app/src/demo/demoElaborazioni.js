// Port of backend/routes/elaborazioni.js: the SQL queries are emulated, the aggregation
// logic below is kept identical to the original route.
import { sqlCompare, sqlSum, sqlText } from './demoDatabase.js';
import {
  activityBalance, byIdAsc, confirmedPeriods, inList, isConfirmedItem, itemAmount, keyOf,
  normalizedPayments, sqlDateParts, sqlTrim, strftimeYear, servicesById, yearlyActivity
} from './demoQueries.js';

function groupBy(rows, keyFields, build) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(...keyFields.map(field => row[field]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(build).sort((a, b) => {
    for (const field of keyFields) {
      const difference = sqlCompare(a[field], b[field]);
      if (difference) return difference;
    }
    return 0;
  });
}

function loadElaborazioniData(db, targetYear, hasCustomerFilter, targetCustomerIds) {
  const services = servicesById(db);
  const confirmed = confirmedPeriods(db);
  const customerFilter = customerId => !hasCustomerFilter || inList(customerId, targetCustomerIds);

  const joined = [...db.rows('items')].sort(byIdAsc).flatMap(item => {
    const service = services.get(item.service_id);
    if (!service || item.year !== targetYear || !isConfirmedItem(item, confirmed)) return [];
    if (!customerFilter(item.customer_id)) return [];
    return [{ item, service }];
  });
  const items = joined.map(({ item, service }) => ({
    ...item, category: service.category, service_name: service.subcategory, subcategory: service.subcategory
  }));

  const groupedItems = groupBy(
    joined.map(({ item, service }) => ({
      customer_id: item.customer_id, category: service.category, month: item.month,
      amount: itemAmount({ quantity: item.quantity ?? 0, price: item.price ?? 0 })
    })),
    ['customer_id', 'category', 'month'],
    rows => ({ customer_id: rows[0].customer_id, category: rows[0].category, month: rows[0].month, total_amount: sqlSum(rows.map(row => row.amount)) })
  ).map(({ customer_id, category, month, total_amount }) => ({ customer_id, category, month, total_amount }));

  const yearText = String(targetYear);
  const payments = normalizedPayments(db).filter(payment =>
    strftimeYear(payment.payment_date) === yearText && customerFilter(payment.payer_customer_id));

  const groupedPayments = groupBy(
    payments.map(payment => ({
      customer_id: payment.payer_customer_id,
      payment_month: sqlDateParts(payment.payment_date).month,
      method: payment.payment_method === null ? null : sqlTrim(sqlText(payment.payment_method)),
      amount: payment.amount
    })),
    ['customer_id', 'payment_month', 'method'],
    rows => ({ customer_id: rows[0].customer_id, payment_month: rows[0].payment_month, method: rows[0].method, total_amount: sqlSum(rows.map(row => row.amount)) })
  );

  const yearlyBalancesRows = yearlyActivity(db)
    .filter(row => sqlCompare(row.year, targetYear) <= 0 && !Number.isNaN(targetYear) && customerFilter(row.customer_id))
    .map(row => ({ ...row, balance: activityBalance(row) }));

  return { items, groupedItems, payments, groupedPayments, yearlyBalancesRows };
}

export function getElaborazioni(db, query, now) {
  try {
    const { year, customer_id, parent_code } = query;
    const targetYear = year ? Number(year) : now().getFullYear();
    const hasCustomerFilter = Boolean(parent_code || customer_id);

    let targetCustomerIds = [];
    if (parent_code) {
        const children = [...db.rows('customers')].sort(byIdAsc).filter(c => c.parent_code === parent_code);
        targetCustomerIds = children.map(c => Number(c.id));
    } else if (customer_id) {
        targetCustomerIds = [Number(customer_id)];
    }

    const { items, groupedItems, payments, groupedPayments, yearlyBalancesRows } =
      loadElaborazioniData(db, targetYear, hasCustomerFilter, targetCustomerIds);

    const customersBreakdown = {};
    const activeCustIds = hasCustomerFilter ? targetCustomerIds : [...new Set([...items.map(i => i.customer_id), ...payments.map(p => p.payer_customer_id)])];

    activeCustIds.forEach(custId => {
        customersBreakdown[custId] = {
            macroAreasSummary: { CONTABILITA: {}, REDDITI: {}, PAGHE: {}, VARIE: {} },
            paymentsSummary: {},
            discountsSummary: {},
            previousYearMacroAreas: { CONTABILITA: 0, REDDITI: 0, PAGHE: 0, VARIE: 0 },
            previousYearPayments: 0,
            previousYearDiscounts: 0,
            previousYearBalance: 0
        };
        for (let m = 1; m <= 12; m++) {
            const mKey = String(m).padStart(2, '0');
            customersBreakdown[custId].paymentsSummary[mKey] = { contanti: 0, elettronico: 0, altro: 0, total: 0 };
            customersBreakdown[custId].discountsSummary[mKey] = 0;
            Object.keys(customersBreakdown[custId].macroAreasSummary).forEach(area => {
                customersBreakdown[custId].macroAreasSummary[area][mKey] = 0;
            });
        }
    });

    groupedItems.forEach(row => {
        const custId = row.customer_id;
        if (!customersBreakdown[custId]) {
            customersBreakdown[custId] = {
                macroAreasSummary: { CONTABILITA: {}, REDDITI: {}, PAGHE: {}, VARIE: {} },
                paymentsSummary: {},
                discountsSummary: {}
            };
            for (let m = 1; m <= 12; m++) {
                const mKey = String(m).padStart(2, '0');
                customersBreakdown[custId].paymentsSummary[mKey] = { contanti: 0, elettronico: 0, altro: 0, total: 0 };
                customersBreakdown[custId].discountsSummary[mKey] = 0;
                Object.keys(customersBreakdown[custId].macroAreasSummary).forEach(area => {
                    customersBreakdown[custId].macroAreasSummary[area][mKey] = 0;
                });
            }
        }
        const cat = String(row.category || '').toUpperCase();
        const monthKey = String(row.month).padStart(2, '0');
        const total = Number(row.total_amount) || 0;

        if (customersBreakdown[custId].macroAreasSummary[cat]) {
            customersBreakdown[custId].macroAreasSummary[cat][monthKey] = total;
        }
    });

    groupedPayments.forEach(row => {
        const custId = row.customer_id;
        if (!custId || !row.payment_month) return;
        if (!customersBreakdown[custId]) {
            customersBreakdown[custId] = {
                macroAreasSummary: { CONTABILITA: {}, REDDITI: {}, PAGHE: {}, VARIE: {} },
                paymentsSummary: {},
                discountsSummary: {}
            };
            for (let m = 1; m <= 12; m++) {
                const mKey = String(m).padStart(2, '0');
                customersBreakdown[custId].paymentsSummary[mKey] = { contanti: 0, elettronico: 0, altro: 0, total: 0 };
                customersBreakdown[custId].discountsSummary[mKey] = 0;
            }
        }
        const monthKey = String(row.payment_month).padStart(2, '0');
        const method = String(row.method || '').toUpperCase();
        const amount = Number(row.total_amount) || 0;

        if (customersBreakdown[custId].paymentsSummary[monthKey]) {
            if (method === 'SCONTO') {
                customersBreakdown[custId].discountsSummary[monthKey] = (customersBreakdown[custId].discountsSummary[monthKey] || 0) + amount;
            } else {
                customersBreakdown[custId].paymentsSummary[monthKey].total += amount;
                if (method.includes('CONTANT')) {
                    customersBreakdown[custId].paymentsSummary[monthKey].contanti += amount;
                } else {
                    customersBreakdown[custId].paymentsSummary[monthKey].elettronico += amount;
                }
            }
        }
    });

    const macroAreasSummary = { CONTABILITA: {}, REDDITI: {}, PAGHE: {}, VARIE: {} };
    const paymentsSummary = {};
    const discountsSummary = {};

    for (let m = 1; m <= 12; m++) {
        const mKey = String(m).padStart(2, '0');
        paymentsSummary[mKey] = { contanti: 0, elettronico: 0, altro: 0, total: 0 };
        discountsSummary[mKey] = 0;
        Object.keys(macroAreasSummary).forEach(area => { macroAreasSummary[area][mKey] = 0; });
    }

    Object.values(customersBreakdown).forEach(cData => {
        Object.keys(cData.macroAreasSummary || {}).forEach(cat => {
            Object.keys(cData.macroAreasSummary[cat] || {}).forEach(mKey => {
                macroAreasSummary[cat][mKey] = (macroAreasSummary[cat][mKey] || 0) + cData.macroAreasSummary[cat][mKey];
            });
        });
        Object.keys(cData.paymentsSummary || {}).forEach(mKey => {
            paymentsSummary[mKey].total += cData.paymentsSummary[mKey].total;
            paymentsSummary[mKey].contanti += cData.paymentsSummary[mKey].contanti;
            paymentsSummary[mKey].elettronico += cData.paymentsSummary[mKey].elettronico;
        });
        Object.keys(cData.discountsSummary || {}).forEach(mKey => {
            discountsSummary[mKey] = (discountsSummary[mKey] || 0) + cData.discountsSummary[mKey];
        });
    });

    return buildResponse({
      targetYear, activeCustIds, groupedItems, groupedPayments, yearlyBalancesRows, items, payments,
      customersBreakdown, macroAreasSummary, paymentsSummary, discountsSummary
    });
  } catch (err) {
    console.debug('Errore elaborazioni summary backend con GROUP BY:', err);
    return { status: 500, body: { success: false, error: err.message } };
  }
}

function buildResponse({
  targetYear, activeCustIds, groupedItems, groupedPayments, yearlyBalancesRows, items, payments,
  customersBreakdown, macroAreasSummary, paymentsSummary, discountsSummary
}) {
    const prevYear = targetYear - 1;

    const yearlyBalancesMap = {};
    let yearlyBalancesSummary = { contabilita: 0, redditi: 0, paghe: 0, varie: 0, incassi: 0, tot_discount: 0, balance: 0 };

    const previousYearMacroAreas = { CONTABILITA: 0, REDDITI: 0, PAGHE: 0, VARIE: 0 };
    let previousYearPayments = 0;
    let previousYearDiscounts = 0;
    let previousYearBalance = 0;

    const customersSummary = {};

    activeCustIds.forEach(custId => {
        customersSummary[custId] = { periods: {}, previousYearBalance: 0 };
        for (let m = 0; m <= 12; m++) {
            const mKey = String(m).padStart(2, '0');
            customersSummary[custId].periods[mKey] = {
                CONTABILITA: 0,
                REDDITI: 0,
                PAGHE: 0,
                VARIE: 0,
                payment: 0,
                discount: 0
            };
        }
    });

    yearlyBalancesRows.forEach(row => {
        const custId = Number(row.customer_id);
        if (!customersSummary[custId]) {
            customersSummary[custId] = { periods: {}, previousYearBalance: 0 };
            for (let m = 0; m <= 12; m++) {
                customersSummary[custId].periods[String(m).padStart(2, '0')] = {
                    CONTABILITA: 0, REDDITI: 0, PAGHE: 0, VARIE: 0, payment: 0, discount: 0
                };
            }
        }
        if (Number(row.year) < targetYear) {
            customersSummary[custId].previousYearBalance += Number(row.balance || 0);
            previousYearBalance += Number(row.balance || 0);
        }

        if (Number(row.year) === Number(targetYear)) {
            yearlyBalancesMap[custId] = row;
            yearlyBalancesSummary.contabilita += Number(row.contabilita || 0);
            yearlyBalancesSummary.redditi += Number(row.redditi || 0);
            yearlyBalancesSummary.paghe += Number(row.paghe || 0);
            yearlyBalancesSummary.varie += Number(row.varie || 0);
            yearlyBalancesSummary.incassi += Number(row.incassi || 0);
            yearlyBalancesSummary.tot_discount += Number(row.tot_discount || 0);
            yearlyBalancesSummary.balance += Number(row.balance || 0);
        }

        if (Number(row.year) === Number(prevYear)) {
            previousYearMacroAreas.CONTABILITA += Number(row.contabilita || 0);
            previousYearMacroAreas.REDDITI += Number(row.redditi || 0);
            previousYearMacroAreas.PAGHE += Number(row.paghe || 0);
            previousYearMacroAreas.VARIE += Number(row.varie || 0);
            previousYearPayments += Number(row.incassi || 0);
            previousYearDiscounts += Number(row.tot_discount || 0);

            customersSummary[custId].periods["00"] = {
                CONTABILITA: Number(row.contabilita || 0),
                REDDITI: Number(row.redditi || 0),
                PAGHE: Number(row.paghe || 0),
                VARIE: Number(row.varie || 0),
                payment: Number(row.incassi || 0),
                discount: Number(row.tot_discount || 0)
            };
        }
    });

    Object.entries(customersSummary).forEach(([custId, customer]) => {
        customer.periods["00"].balance = customer.previousYearBalance;
        if (!yearlyBalancesMap[custId] && customer.previousYearBalance !== 0) {
            yearlyBalancesMap[custId] = {
                customer_id: Number(custId), year: targetYear,
                contabilita: 0, redditi: 0, paghe: 0, varie: 0, incassi: 0, tot_discount: 0, balance: 0
            };
        }
    });
    Object.entries(yearlyBalancesMap).forEach(([custId, row]) => {
        row.balance += customersSummary[custId].previousYearBalance;
    });
    yearlyBalancesSummary.balance += previousYearBalance;

    groupedItems.forEach(row => {
        const custId = row.customer_id;
        const cat = String(row.category || '').toUpperCase();
        const monthKey = String(row.month).padStart(2, '0');
        const total = Number(row.total_amount) || 0;

        if (!customersSummary[custId]) {
            customersSummary[custId] = { periods: {} };
            for (let m = 0; m <= 12; m++) {
                customersSummary[custId].periods[String(m).padStart(2, '0')] = { CONTABILITA: 0, REDDITI: 0, PAGHE: 0, VARIE: 0, payment: 0, discount: 0 };
            }
        }
        if (customersSummary[custId].periods[monthKey]) {
            customersSummary[custId].periods[monthKey][cat] = total;
        }
    });

    groupedPayments.forEach(row => {
        const custId = row.customer_id;
        if (!custId || !row.payment_month) return;
        const monthKey = String(row.payment_month).padStart(2, '0');
        const method = String(row.method || '').toUpperCase();
        const amount = Number(row.total_amount) || 0;

        if (!customersSummary[custId]) {
            customersSummary[custId] = { periods: {} };
            for (let m = 0; m <= 12; m++) {
                customersSummary[custId].periods[String(m).padStart(2, '0')] = { CONTABILITA: 0, REDDITI: 0, PAGHE: 0, VARIE: 0, payment: 0, discount: 0 };
            }
        }
        if (customersSummary[custId].periods[monthKey]) {
            if (method === 'SCONTO') {
                customersSummary[custId].periods[monthKey].discount += amount;
            } else {
                customersSummary[custId].periods[monthKey].payment += amount;
            }
        }
    });

    return {
        status: 200,
        body: {
            success: true,
            data: {
                items,
                payments,
                yearlyBalancesMap,
                yearlyBalancesSummary,
                customers: customersBreakdown,
                customersSummary,
                aggregated: {
                    macroAreasSummary,
                    paymentsSummary,
                    discountsSummary,
                    yearlyBalancesSummary,
                    previousYearMacroAreas,
                    previousYearPayments,
                    previousYearDiscounts,
                    previousYearBalance
                },
                macroAreasSummary,
                paymentsSummary,
                discountsSummary,
                previousYearMacroAreas,
                previousYearPayments,
                previousYearDiscounts,
                previousYearBalance
            }
        }
    };
}
