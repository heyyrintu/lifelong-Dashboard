/**
 * Shared formatting utilities for the Lifelong Dashboard
 * Centralized to avoid code duplication across pages
 */

// Month labels for display
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// Product category label mapping
export const CATEGORY_LABELS: Record<string, string> = {
    'ALL': 'All Categories',
    'EDEL': 'EDEL',
    'HOME_AND_KITCHEN': 'Home & Kitchen',
    'ELECTRONICS': 'Electronics',
    'HEALTH_AND_PERSONAL_CARE': 'Health & Personal Care',
    'AUTOMOTIVE_AND_TOOLS': 'Automotive & Tools',
    'TOYS_AND_GAMES': 'Toys & Games',
    'BRAND_PRIVATE_LABEL': 'Brand Private Label',
    'OTHERS': 'Others',
};

/**
 * Format a number with optional decimal places
 * Uses locale formatting for thousands separators
 */
export function formatNumber(num: number | string | undefined | null, decimals?: number): string {
    if (num === undefined || num === null || num === '') return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';

    if (decimals !== undefined) {
        return value.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }

    if (Number.isInteger(value)) {
        return value.toLocaleString();
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format a number in Lakhs (Indian numbering system - 1 Lakh = 100,000)
 */
export function formatInLakhs(num: number | string | undefined | null, decimals: number = 2): string {
    if (num === undefined || num === null || num === '') return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    const lakhs = value / 100000;
    return lakhs.toFixed(decimals);
}

/**
 * Format a number in Lakhs with 'L' suffix
 */
export function formatQuantityInLakhs(num: number | undefined | null, decimals: number = 2): string {
    if (num === undefined || num === null) return '0L';
    const value = Number(num);
    if (isNaN(value)) return '0L';
    const lakhs = value / 100000;
    return `${lakhs.toFixed(decimals)}L`;
}

/**
 * Format quantity smartly: if < 1L show in K (thousands), if >= 1L show in L (lakhs)
 */
export function formatQuantitySmartKL(num: number | undefined | null, decimals: number = 2): string {
    if (num === undefined || num === null) return '0K';
    const value = Number(num);
    if (isNaN(value)) return '0K';
    const lakhs = value / 100000;

    if (lakhs < 1) {
        // Show in thousands (K)
        const thousands = value / 1000;
        return `${thousands.toFixed(decimals)}K`;
    }
    // Show in lakhs (L)
    return `${lakhs.toFixed(decimals)}L`;
}

/**
 * Format a number in Thousands with 'K' suffix
 */
export function formatInThousands(num: number | string | undefined | null, decimals: number = 2): string {
    if (num === undefined || num === null || num === '') return '0 K';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0 K';
    return `${(value / 1000).toFixed(decimals)} K`;
}

/**
 * Format CBM values for chart display (in thousands with 'k' suffix)
 */
export function formatCbmForChart(num: number | string | undefined | null): string {
    if (num === undefined || num === null || num === '') return '0k';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0k';
    const thousands = value / 1000;
    const formatted = thousands.toFixed(1);
    return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted}k`;
}

/**
 * Convert date string to DD-MM-YYYY format
 */
export function formatToDDMMYYYY(dateStr?: string | null): string {
    if (!dateStr) return '';

    // Already in DD-MM-YYYY format
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) return dateStr;

    // Handle DD-MM-YYYY with single digits
    let match = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
        const dd = String(match[1]).padStart(2, '0');
        const mm = String(match[2]).padStart(2, '0');
        return `${dd}-${mm}-${match[3]}`;
    }

    // Handle YYYY-MM-DD
    match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        const dd = String(match[3]).padStart(2, '0');
        const mm = String(match[2]).padStart(2, '0');
        return `${dd}-${mm}-${match[1]}`;
    }

    // Handle DD Mon YYYY (e.g., 01 Nov 2025)
    match = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
    if (match) {
        const dd = String(match[1]).padStart(2, '0');
        const monthMap: Record<string, string> = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
            Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
        };
        const monShort = match[2].slice(0, 3);
        const mm = monthMap[monShort] || '01';
        return `${dd}-${mm}-${match[3]}`;
    }

    // Parse as UTC to avoid timezone issues
    const isoStr = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z';
    const d = new Date(isoStr);
    if (!Number.isNaN(d.getTime())) {
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}-${month}-${year}`;
    }

    return dateStr;
}

/**
 * Format a Date object to YYYY-MM-DD string (UTC)
 */
export function formatDateUTC(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format a Date object to YYYY-MM-DD string (local)
 */
export function formatDateLocal(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format product category code to display label
 */
export function formatProductCategory(category: string): string {
    return CATEGORY_LABELS[category] || category;
}

/**
 * Format backend month value (e.g. 2025-11) to display label like Nov'25
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

/**
 * Format chart axis labels - convert "Aug 2025" to "Aug'25"
 */
export function formatAxisLabel(label: string): string {
    const match = label.match(/^([A-Za-z]{3}) (\d{4})$/);
    if (match) {
        const [, month, year] = match;
        return `${month}'${year.slice(2)}`;
    }
    return label;
}

/**
 * Get ISO week number for a date
 */
export function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get the start date of a specific week in a year
 */
export function getWeekStart(year: number, week: number): Date {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7 - firstDayOfYear.getDay();
    return new Date(year, 0, 1 + daysOffset);
}

/**
 * Check if a date range matches a specific month
 * Returns the month key (YYYY-MM) if it matches, null otherwise
 */
export function getMonthFromDateRange(from: string, to: string): string | null {
    if (!from || !to) return null;

    try {
        const startDate = new Date(from);
        const endDate = new Date(to);

        // Check if both dates are in the same month and year
        if (startDate.getFullYear() === endDate.getFullYear() &&
            startDate.getMonth() === endDate.getMonth()) {

            // Check if fromDate is the 1st of the month
            const isFirstDay = startDate.getDate() === 1;

            // Check if toDate is the last day of the month
            const lastDay = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
            const isLastDay = endDate.getDate() === lastDay;

            if (isFirstDay && isLastDay) {
                const year = startDate.getFullYear();
                const month = String(startDate.getMonth() + 1).padStart(2, '0');
                return `${year}-${month}`;
            }
        }
    } catch (error) {
        console.error('Error parsing dates:', error);
    }

    return null;
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'An unknown error occurred';
}
