// Utility functions for date and month formatting

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Formats a month string (YYYY-MM) to a human-readable format
 * @param month - Month string in format "YYYY-MM" or "ALL"
 * @returns Formatted month label (e.g., "Jan'25" or "All Months")
 */
export function formatMonthLabel(month: string): string {
  if (month === 'ALL') return 'All Months';

  const match = month.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const [, yearStr, monthStr] = match;
    const monthIndex = parseInt(monthStr, 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      const shortYear = yearStr.slice(2);
      return `${MONTH_LABELS[monthIndex]}'${shortYear}`;
    }
  }

  return month;
}
