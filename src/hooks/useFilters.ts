import { useState } from 'react';
import { DEFAULT_FILTERS, applyFilters, hasActiveFilters } from '../utils/filters';
import type { EnrichedClaim, Filters } from '../types';

export function useFilters(allClaims: EnrichedClaim[]) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = applyFilters(allClaims, filters);
  const active = hasActiveFilters(filters);

  function setPayerFamilies(families: string[]) {
    setFilters((f) => ({ ...f, payerFamilies: families }));
  }

  function setDenialCodes(codes: string[]) {
    setFilters((f) => ({ ...f, denialCodes: codes }));
  }

  function setDeadlineWithin(days: number | null) {
    setFilters((f) => ({ ...f, deadlineWithin: days }));
  }

  function setAmountRange(min: number | null, max: number | null) {
    setFilters((f) => ({ ...f, minAmount: min, maxAmount: max }));
  }

  function setOverdueOnly(value: boolean) {
    setFilters((f) => ({ ...f, overdueOnly: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  return { filters, filtered, active, setFilters, setPayerFamilies, setDenialCodes, setDeadlineWithin, setAmountRange, setOverdueOnly, resetFilters };
}
