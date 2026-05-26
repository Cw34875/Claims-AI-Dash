import { useState } from 'react';
import { DEFAULT_FILTERS, applyFilters } from '../utils/filters';
import type { EnrichedClaim, Filters } from '../types';

export function useFilters(allClaims: EnrichedClaim[]) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const filtered = applyFilters(allClaims, filters);

  function setPayerFamilies(families: string[]) {
    setFilters((f) => ({ ...f, payerFamilies: families }));
  }

  function setDenialCodes(codes: string[]) {
    setFilters((f) => ({ ...f, denialCodes: codes }));
  }

  function setStatuses(statuses: string[]) {
    setFilters((f) => ({ ...f, statuses }));
  }

  function setDeadlineWithin(days: number | null) {
    setFilters((f) => ({ ...f, deadlineWithin: days }));
  }

  function setOverdueOnly(value: boolean) {
    setFilters((f) => ({ ...f, overdueOnly: value }));
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  return { filters, filtered, setPayerFamilies, setDenialCodes, setStatuses, setDeadlineWithin, setOverdueOnly, resetFilters };
}
