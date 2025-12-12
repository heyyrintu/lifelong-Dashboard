'use client';

import React, { createContext, useContext, useState } from 'react';

interface DateFilterContextValue {
  label: string;
  setLabel: (label: string) => void;
}

const DateFilterContext = createContext<DateFilterContextValue | undefined>(undefined);

export function DateFilterProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = useState<string>('All Dates');

  return (
    <DateFilterContext.Provider value={{ label, setLabel }}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error('useDateFilter must be used within a DateFilterProvider');
  return ctx;
}
