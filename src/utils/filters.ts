import type { EnrichedClaim, Filters } from '../types';

export const DEFAULT_FILTERS: Filters = {
  payerFamilies: [],
  denialCodes: [],
  minAmount: null,
  maxAmount: null,
  deadlineWithin: null,
  overdueOnly: false,
};

export function applyFilters(claims: EnrichedClaim[], filters: Filters): EnrichedClaim[] {
  return claims.filter((c) => {
    if (filters.payerFamilies.length > 0 && !filters.payerFamilies.includes(c.payerFamily)) return false;
    if (filters.denialCodes.length > 0 && (!c.denialCode || !filters.denialCodes.includes(c.denialCode))) return false;
    if (filters.minAmount !== null && c.recoverability < filters.minAmount) return false;
    if (filters.maxAmount !== null && c.recoverability > filters.maxAmount) return false;
    if (filters.overdueOnly) {
      if (c.deadlineDays === null || c.deadlineDays >= 0) return false;
    }
    if (filters.deadlineWithin !== null) {
      if (c.deadlineDays === null || c.deadlineDays > filters.deadlineWithin) return false;
    }
    return true;
  });
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.payerFamilies.length > 0 ||
    filters.denialCodes.length > 0 ||
    filters.minAmount !== null ||
    filters.maxAmount !== null ||
    filters.deadlineWithin !== null ||
    filters.overdueOnly
  );
}
