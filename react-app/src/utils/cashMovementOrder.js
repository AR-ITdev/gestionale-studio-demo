export function compareCashMovements(a, b) {
  const dateA = a.date || a.movement_date || '';
  const dateB = b.date || b.movement_date || '';
  if (String(dateA).slice(0, 10) === String(dateB).slice(0, 10)) {
    const isOpening = item => {
      const type = String(item.type || item.category || '').toUpperCase().trim();
      return type.includes('SALDO') && type.includes('INIZIALE');
    };
    const openingDifference = Number(isOpening(b)) - Number(isOpening(a));
    if (openingDifference) return openingDifference;
  }
  return new Date(dateA || 0) - new Date(dateB || 0);
}
