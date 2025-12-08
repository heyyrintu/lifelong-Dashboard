/**
 * Date utility functions for consistent timezone handling across the application
 * All functions use local timezone (not UTC) for consistency with user expectations
 * and database storage in India Standard Time (IST - UTC+5:30)
 */

/**
 * Parse a date string (YYYY-MM-DD) as a local date at start of day
 * @param dateStr - Date string in format YYYY-MM-DD
 * @returns Date object at 00:00:00 in local timezone
 */
export function parseLocalDateStart(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Parse a date string (YYYY-MM-DD) as a local date at end of day
 * @param dateStr - Date string in format YYYY-MM-DD
 * @returns Date object at 23:59:59.999 in local timezone
 */
export function parseLocalDateEnd(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/**
 * Parse a date string as local date with optional time at end of day
 * @param dateStr - Date string in format YYYY-MM-DD
 * @param endOfDay - If true, returns end of day; otherwise returns start of day
 * @returns Date object in local timezone
 */
export function parseLocalDate(dateStr: string, endOfDay = false): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (endOfDay) {
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Get start date of a month as local date
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Date object at 00:00:00 on first day of month
 */
export function getMonthStart(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

/**
 * Get end date of a month as local date
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Date object at 23:59:59.999 on last day of month
 */
export function getMonthEnd(year: number, month: number): Date {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, lastDay, 23, 59, 59, 999);
}

/**
 * Get start date of a year as local date
 * @param year - Year
 * @returns Date object at 00:00:00 on January 1st
 */
export function getYearStart(year: number): Date {
  return new Date(year, 0, 1, 0, 0, 0, 0);
}

/**
 * Get end date of a year as local date
 * @param year - Year
 * @returns Date object at 23:59:59.999 on December 31st
 */
export function getYearEnd(year: number): Date {
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

/**
 * Format a date for display in India-specific format
 * @param date - Date object or date string
 * @param locale - Locale code (default: 'en-IN')
 * @returns Formatted date string (e.g., "01/11/2024")
 */
export function formatDateForDisplay(
  date: Date | string,
  locale: string = 'en-IN'
): string {
  const dateObj = typeof date === 'string' ? parseLocalDateStart(date) : date;
  return dateObj.toLocaleDateString(locale);
}

/**
 * Format a date for display as ISO string (YYYY-MM-DD)
 * @param date - Date object
 * @returns ISO date string without time portion (using local timezone, not UTC)
 */
export function formatDateAsISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate if a string is a valid date string (YYYY-MM-DD format)
 * @param dateStr - String to validate
 * @returns true if valid date format, false otherwise
 */
export function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);
  
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Additional validation using Date object
  const date = parseLocalDateStart(dateStr);
  return date.getFullYear() === year &&
         date.getMonth() === month - 1 &&
         date.getDate() === day;
}

/**
 * Get the last day of a month
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Last day number of the month
 */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Convert Excel serial date number to Date object
 * Excel stores dates as number of days since 1899-12-30
 * @param serial - Excel serial number
 * @returns Date object
 */
export function excelSerialToDate(serial: number): Date {
  const adjustedSerial = serial <= 60 ? serial : serial - 1; // Account for Excel leap year bug
  const date = new Date(1899, 11, 31 + adjustedSerial);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a date value that could be in multiple formats
 * Supports: YYYY-MM-DD, Excel serial, ISO string, or Date object
 * @param value - Value in any supported format
 * @returns Date object or null if parsing fails
 */
export function parseDateValue(value: string | number | Date): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  if (typeof value === 'number') {
    // Assume Excel serial number
    return excelSerialToDate(value);
  }
  
  if (typeof value === 'string') {
    // Try YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return parseLocalDateStart(value);
    }
    
    // Try ISO format (with time)
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }
  
  return null;
}

/**
 * Get date range for a specific month in YYYY-MM-DD format
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Object with fromDate and toDate as ISO strings
 */
export function getMonthDateRange(year: number, month: number): { fromDate: string; toDate: string } {
  const start = getMonthStart(year, month);
  const end = getMonthEnd(year, month);
  
  return {
    fromDate: formatDateAsISO(start),
    toDate: formatDateAsISO(end),
  };
}

/**
 * Get date range for a specific year in YYYY-MM-DD format
 * @param year - Year
 * @returns Object with fromDate and toDate as ISO strings
 */
export function getYearDateRange(year: number): { fromDate: string; toDate: string } {
  const start = getYearStart(year);
  const end = getYearEnd(year);
  
  return {
    fromDate: formatDateAsISO(start),
    toDate: formatDateAsISO(end),
  };
}

/**
 * Check if a date falls within a range
 * @param date - Date to check
 * @param fromDate - Start of range (inclusive)
 * @param toDate - End of range (inclusive)
 * @returns true if date is within range
 */
export function isDateInRange(date: Date, fromDate: Date, toDate: Date): boolean {
  return date >= fromDate && date <= toDate;
}
