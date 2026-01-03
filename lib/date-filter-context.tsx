'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { formatHeaderDateShort } from '@/lib/utils';

interface DateFilterContextValue {
  // Label for display
  label: string;
  setLabel: (label: string) => void;
  
  // Universal filter values
  fromDate: string;
  toDate: string;
  selectedMonth: string;
  selectedProductCategories: string[];
  selectedWarehouse: string;
  
  // Setters
  setFromDate: (date: string) => void;
  setToDate: (date: string) => void;
  setSelectedMonth: (month: string) => void;
  setSelectedProductCategories: (categories: string[]) => void;
  setSelectedWarehouse: (warehouse: string) => void;
  
  // Helper to set date range with month selection
  setMonthWithDates: (month: string, availableDates?: { minDate: string; maxDate: string } | null) => void;
  
  // Reset filters
  resetFilters: () => void;
}

const DateFilterContext = createContext<DateFilterContextValue | undefined>(undefined);

// Format a Date into YYYY-MM-DD in local time
const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Compute default month (current month) range
const getCurrentMonthDefaults = () => {
  const today = new Date();
  const year = today.getFullYear();
  const monthIndex = today.getMonth(); // zero-based
  const monthValue = String(monthIndex + 1).padStart(2, '0');
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0);

  return {
    month: `${year}-${monthValue}`,
    from: formatLocalDate(startDate),
    to: formatLocalDate(endDate),
  };
};

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const currentMonth = getCurrentMonthDefaults();

  const [label, setLabel] = useState<string>('All Dates');
  const [fromDate, setFromDate] = useState<string>(currentMonth.from);
  const [toDate, setToDate] = useState<string>(currentMonth.to);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth.month);
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('ALL');

  // Helper function to set month and automatically update date range
  const setMonthWithDates = useCallback((month: string, availableDates?: { minDate: string; maxDate: string } | null) => {
    setSelectedMonth(month);
    if (month === 'ALL') {
      // When "ALL" is selected, set the date range to cover all available data
      if (availableDates?.minDate && availableDates?.maxDate) {
        setFromDate(availableDates.minDate);
        setToDate(availableDates.maxDate);
      }
    } else {
      // When a specific month is selected, set the date range for that month
      const [year, monthNum] = month.split('-').map(Number);
      if (year && monthNum) {
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 0);
        setFromDate(formatLocalDate(startDate));
        setToDate(formatLocalDate(endDate));
      }
    }
  }, []);

  // Reset all filters to defaults
  const resetFilters = useCallback(() => {
    const defaults = getCurrentMonthDefaults();
    setFromDate(defaults.from);
    setToDate(defaults.to);
    setSelectedMonth(defaults.month);
    setSelectedProductCategories([]);
    setSelectedWarehouse('ALL');
    setLabel('All Dates');
  }, []);

  // Compute label whenever filter values change
  const formatDateUTC = (date: Date): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Update label based on current filters
  const computedLabel = useMemo(() => {
    if (selectedMonth && selectedMonth !== 'ALL') {
      const [year, month] = selectedMonth.split('-').map(Number);
      if (year && month) {
        const start = new Date(Date.UTC(year, month - 1, 1));
        const end = new Date(Date.UTC(year, month, 0));
        return `${formatHeaderDateShort(formatDateUTC(start))} - ${formatHeaderDateShort(formatDateUTC(end))}`;
      }
      return selectedMonth;
    }
    if (fromDate && toDate) {
      if (fromDate === toDate) return formatHeaderDateShort(fromDate);
      return `${formatHeaderDateShort(fromDate)} - ${formatHeaderDateShort(toDate)}`;
    }
    if (fromDate) return `From ${formatHeaderDateShort(fromDate)}`;
    if (toDate) return `Up to ${formatHeaderDateShort(toDate)}`;
    return 'All Dates';
  }, [fromDate, toDate, selectedMonth]);

  // Custom setFromDate that clears month selection
  const handleSetFromDate = useCallback((date: string) => {
    setFromDate(date);
    setSelectedMonth('ALL');
  }, []);

  // Custom setToDate that clears month selection
  const handleSetToDate = useCallback((date: string) => {
    setToDate(date);
    setSelectedMonth('ALL');
  }, []);

  const value = useMemo(() => ({
    label: computedLabel,
    setLabel,
    fromDate,
    toDate,
    selectedMonth,
    selectedProductCategories,
    selectedWarehouse,
    setFromDate: handleSetFromDate,
    setToDate: handleSetToDate,
    setSelectedMonth,
    setSelectedProductCategories,
    setSelectedWarehouse,
    setMonthWithDates,
    resetFilters,
  }), [
    computedLabel,
    fromDate,
    toDate,
    selectedMonth,
    selectedProductCategories,
    selectedWarehouse,
    handleSetFromDate,
    handleSetToDate,
    setMonthWithDates,
    resetFilters,
  ]);

  return (
    <DateFilterContext.Provider value={value}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error('useDateFilter must be used within a DateFilterProvider');
  return ctx;
}
