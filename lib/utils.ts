import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format a date string into a header-friendly short format
// Example: 2025-11-01 -> 1st Nov'25
export function formatHeaderDateShort(dateStr?: string | null): string {
  if (!dateStr) return '';

  // Helper for ordinal suffix
  const ordinal = (d: number) => {
    if (d % 100 >= 11 && d % 100 <= 13) return 'th';
    const r = d % 10;
    if (r === 1) return 'st';
    if (r === 2) return 'nd';
    if (r === 3) return 'rd';
    return 'th';
  };

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Try common formats
  let day: number | null = null;
  let monthIndex: number | null = null;
  let year: number | null = null;

  // DD-MM-YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    day = parseInt(ddmmyyyy[1], 10);
    monthIndex = parseInt(ddmmyyyy[2], 10) - 1;
    year = parseInt(ddmmyyyy[3], 10);
  }

  // DD Mon YYYY e.g., 01 Nov 2025
  const ddMonYYYY = !day && dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (ddMonYYYY) {
    day = parseInt(ddMonYYYY[1], 10);
    const mon = ddMonYYYY[2].slice(0,3);
    monthIndex = MONTHS.indexOf(mon);
    year = parseInt(ddMonYYYY[3], 10);
  }

  // YYYY-MM-DD (strict)
  const isoDate = !day && dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    year = parseInt(isoDate[1], 10);
    monthIndex = parseInt(isoDate[2], 10) - 1;
    day = parseInt(isoDate[3], 10);
  }

  // fallback: try Date parsing
  if (day === null) {
    try {
      const isoStr = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z';
      const d = new Date(isoStr);
      if (!Number.isNaN(d.getTime())) {
        day = d.getUTCDate();
        monthIndex = d.getUTCMonth();
        year = d.getUTCFullYear();
      }
    } catch {
      // ignore
    }
  }

  if (day === null || monthIndex === null || year === null) return dateStr;

  const shortYear = String(year).slice(2);
  return `${day}${ordinal(day)} ${MONTHS[monthIndex]}'${shortYear}`;
}
