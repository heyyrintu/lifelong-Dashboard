'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useDateFilter } from '@/lib/date-filter-context';
import { formatHeaderDateShort } from '@/lib/utils';
import { motion } from 'framer-motion';
import PageHeader from '@/components/common/PageHeader';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Package,
  TrendingUp,
  Box,
  ChevronDown,
  Check,
  Clock,
  Calendar,
  RefreshCw,
  Search,
  ArrowRightLeft,
  Download,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import { authenticatedFetch } from '@/lib/api';

interface FulfillmentRow {
  date: string;
  soQty: number;
  dnQty: number;
  pending: number;
  percentage: number;
}

interface QuickSummaryData {
  inbound: {
    receivedSkuCount: number;
    receivedQty: number;
    receivedCbm: number;
  };
  inventory: {
    inventorySku: number;
    inventoryQty: number;
    inventoryCbm: number;
  };
  outbound: {
    dnSku: number;
    dnQty: number;
    dnTotalCbm: number;
  };
  productCategories: string[];
  fulfillmentTable?: FulfillmentRow[];
}

const downloadFulfillmentExcel = (data: FulfillmentRow[]) => {
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();

  // Prepare data with headers
  const wsData = [
    ['Fulfillment Report'],
    ['Generated on: ' + new Date().toLocaleString()],
    [],
    ['Date', 'SO Qty', 'DN Qty', 'Pending', 'Fulfillment %'],
    ...data.map(row => [
      row.date,
      row.soQty,
      row.dnQty,
      row.pending,
      row.percentage.toFixed(2) + '%'
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Date
    { wch: 12 }, // SO Qty
    { wch: 12 }, // DN Qty
    { wch: 12 }, // Pending
    { wch: 15 }, // Fulfillment %
  ];

  // Merge cells for title
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, // Title row
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, // Date row
  ];

  // Apply styles (cell formatting)
  // Title cell
  ws['A1'] = {
    v: 'Fulfillment Report',
    t: 's',
    s: {
      font: { bold: true, sz: 16, color: { rgb: "4B5563" } },
      alignment: { horizontal: 'center', vertical: 'center' },
      fill: { fgColor: { rgb: "E0E7FF" } }
    }
  };

  // Date cell
  ws['A2'] = {
    v: 'Generated on: ' + new Date().toLocaleString(),
    t: 's',
    s: {
      font: { italic: true, sz: 10, color: { rgb: "6B7280" } },
      alignment: { horizontal: 'center' }
    }
  };

  // Header row styling
  ['A4', 'B4', 'C4', 'D4', 'E4'].forEach(cell => {
    if (ws[cell]) {
      ws[cell].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "6366F1" } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      };
    }
  });

  // Data row styling with conditional formatting based on percentage
  data.forEach((row, index) => {
    const rowNum = index + 5; // Starting from row 5 (0-indexed + 4 header rows + 1)

    // Determine color based on percentage
    let bgColor = 'FFFFFF';
    if (row.percentage >= 100) bgColor = 'D1FAE5'; // Green
    else if (row.percentage >= 90) bgColor = 'DBEAFE'; // Blue
    else if (row.percentage >= 75) bgColor = 'FEF3C7'; // Yellow
    else bgColor = 'FEE2E2'; // Red

    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      const cellRef = col + rowNum;
      if (ws[cellRef]) {
        ws[cellRef].s = {
          fill: { fgColor: { rgb: bgColor } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: 'D1D5DB' } },
            bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
            left: { style: 'thin', color: { rgb: 'D1D5DB' } },
            right: { style: 'thin', color: { rgb: 'D1D5DB' } }
          }
        };

        // Bold numbers in qty columns
        if (col === 'B' || col === 'C' || col === 'D') {
          ws[cellRef].s.font = { bold: true };
        }

        // Percentage column special formatting
        if (col === 'E') {
          ws[cellRef].s.font = { bold: true, color: { rgb: row.percentage >= 90 ? '059669' : 'DC2626' } };
        }
      }
    });
  });

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Fulfillment Report');

  // Generate filename with current date
  const fileName = `Fulfillment_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

  // Download file
  XLSX.writeFile(wb, fileName);
};

export default function SummaryPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QuickSummaryData | null>(null);
  const [fullFulfillmentTable, setFullFulfillmentTable] = useState<FulfillmentRow[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>(['ALL']);
  const [availableWarehouses, setAvailableWarehouses] = useState<string[]>(['ALL']);
  const [availableDates, setAvailableDates] = useState<{ minDate: string; maxDate: string } | null>(null);
  const [selectedFulfillmentDay, setSelectedFulfillmentDay] = useState<'today' | 'yesterday' | '7days'>('today');
  const formatToDDMMYYYY = (dateStr?: string | null): string => {
    if (!dateStr) return '';

    // Already in DD-MM-YYYY format
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
      const monthMap: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
      const monShort = match[2].slice(0, 3);
      const mm = monthMap[monShort] || '01';
      return `${dd}-${mm}-${match[3]}`;
    }

    // Fallback: try parsing with Date
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }

    return dateStr;
  };

  const formatDateUTC = (date: Date): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };


  useEffect(() => {
    fetchSummary();
  }, []);

  const { setLabel: setDateFilterLabel } = useDateFilter();

  const selectedDateRangeLabel = useMemo(() => {
    // Prefer a selected month label (e.g. "Nov 2025")
    if (selectedMonth && selectedMonth !== 'ALL') {
      const [year, month] = selectedMonth.split('-').map(Number);
      if (year && month) {
        // Show the full date range for the selected month in DD-MM-YYYY format using UTC to avoid tz shifts
        const start = new Date(Date.UTC(year, month - 1, 1));
        const end = new Date(Date.UTC(year, month, 0));
        return `${formatHeaderDateShort(formatDateUTC(start))} - ${formatHeaderDateShort(formatDateUTC(end))}`;
      }
      return selectedMonth;
    }

    // If custom date range is selected
    if (fromDate && toDate) {
      if (fromDate === toDate) return formatHeaderDateShort(fromDate);
      return `${formatHeaderDateShort(fromDate)} - ${formatHeaderDateShort(toDate)}`;
    }
    if (fromDate) return `From ${formatHeaderDateShort(fromDate)}`;
    if (toDate) return `Up to ${formatHeaderDateShort(toDate)}`;

    // Fallback to the available data range when no explicit selection
    if (availableDates) return `${formatHeaderDateShort(availableDates.minDate)} - ${formatHeaderDateShort(availableDates.maxDate)}`;

    return 'All Dates';
  }, [fromDate, toDate, selectedMonth, availableDates]);

  // Update the global date filter label for header and other components
  useEffect(() => {
    setDateFilterLabel(selectedDateRangeLabel);
  }, [selectedDateRangeLabel, setDateFilterLabel]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSummary = async (useFilters = false) => {
    try {
      setLoading(true);

      // Build query params
      const buildParams = () => {
        const params = new URLSearchParams();

        if (useFilters) {
          if (selectedMonth && selectedMonth !== 'ALL') {
            const [year, month] = selectedMonth.split('-').map(Number);
            if (year && month) {
              const startDate = new Date(Date.UTC(year, month - 1, 1));
              const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
              params.append('fromDate', formatDateUTC(startDate));
              params.append('toDate', formatDateUTC(endDate));
            }
          } else {
            if (fromDate) params.append('fromDate', fromDate);
            if (toDate) params.append('toDate', toDate);
          }

          if (selectedProductCategories.length > 0) {
            selectedProductCategories.forEach(cat => params.append('productCategory', cat));
          }

          if (selectedWarehouse && selectedWarehouse !== 'ALL') {
            params.append('warehouse', selectedWarehouse);
          }
        }

        return params.toString();
      };

      const queryString = buildParams();

      // Fetch endpoints in parallel (filtered + unfiltered outbound for full monthly trend)
      const [inboundRes, inventoryRes, outboundRes, outboundFullRes] = await Promise.all([
        authenticatedFetch(`/inbound/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        authenticatedFetch(`/inventory/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        authenticatedFetch(`/outbound/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        authenticatedFetch(`/outbound/summary`).catch(() => null),
      ]);

      // Parse responses
      const inboundData = inboundRes?.ok ? await inboundRes.json() : null;
      const inventoryData = inventoryRes?.ok ? await inventoryRes.json() : null;
      const outboundData = outboundRes?.ok ? await outboundRes.json() : null;
      const outboundFullData = outboundFullRes?.ok ? await outboundFullRes.json() : null;

      // Collect product categories, warehouses, and months from all sources
      const categories = new Set<string>();
      const warehouses = new Set<string>();
      const months = new Set<string>();

      if (inboundData?.productCategories) {
        inboundData.productCategories.forEach((c: string) => categories.add(c));
      }
      if (inventoryData?.filters?.availableProductCategories) {
        inventoryData.filters.availableProductCategories.forEach((c: string) => categories.add(c));
      }
      if (outboundData?.productCategories) {
        outboundData.productCategories.forEach((c: string) => categories.add(c));
      }

      if (inboundData?.availableWarehouses) {
        inboundData.availableWarehouses.forEach((w: string) => warehouses.add(w));
      }
      if (inventoryData?.availableWarehouses) {
        inventoryData.availableWarehouses.forEach((w: string) => warehouses.add(w));
      }
      if (outboundData?.availableWarehouses) {
        outboundData.availableWarehouses.forEach((w: string) => warehouses.add(w));
      }

      if (inboundData?.availableMonths) {
        inboundData.availableMonths.forEach((m: string) => months.add(m));
      }
      if (outboundData?.availableMonths) {
        outboundData.availableMonths.forEach((m: string) => months.add(m));
      }

      // Extract available dates from any source and merge to avoid outdated headers when one module lags
      const toUtcTimestamp = (dateStr: string): number | null => {
        const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
          const [, y, m, d] = isoMatch;
          return Date.UTC(Number(y), Number(m) - 1, Number(d));
        }
        const parsed = Date.parse(dateStr);
        return Number.isNaN(parsed) ? null : parsed;
      };

      const mergedDates = [
        inboundData?.availableDates,
        inventoryData?.filters?.availableDateRange,
        outboundData?.availableDateRange,
      ]
        .filter(Boolean)
        .reduce<{ minDate: string | null; maxDate: string | null }>((acc, range) => {
          const typedRange = range as { minDate?: string | null; maxDate?: string | null };

          if (typedRange.minDate) {
            const ts = toUtcTimestamp(typedRange.minDate);
            const accMinTs = acc.minDate ? toUtcTimestamp(acc.minDate) : null;
            if (ts !== null && (accMinTs === null || ts < accMinTs)) {
              acc.minDate = typedRange.minDate;
            }
          }

          if (typedRange.maxDate) {
            const ts = toUtcTimestamp(typedRange.maxDate);
            const accMaxTs = acc.maxDate ? toUtcTimestamp(acc.maxDate) : null;
            if (ts !== null && (accMaxTs === null || ts > accMaxTs)) {
              acc.maxDate = typedRange.maxDate;
            }
          }

          return acc;
        }, { minDate: null, maxDate: null });

      const finalDates = mergedDates.minDate && mergedDates.maxDate
        ? { minDate: mergedDates.minDate, maxDate: mergedDates.maxDate }
        : null;

      setAvailableCategories(Array.from(categories).filter(c => c !== 'ALL'));
      setAvailableWarehouses(['ALL', ...Array.from(warehouses).filter(w => w !== 'ALL')]);
      setAvailableMonths(['ALL', ...Array.from(months).filter(m => m !== 'ALL').sort()]);
      setAvailableDates(finalDates);

      // Combine data
      const summaryData: QuickSummaryData = {
        inbound: {
          receivedSkuCount: inboundData?.cards?.receivedSkuCount || 0,
          receivedQty: inboundData?.cards?.receivedQtyTotal || 0,
          receivedCbm: inboundData?.cards?.totalCbm || 0,
        },
        inventory: {
          inventorySku: inventoryData?.cards?.inboundSkuCount || 0,
          inventoryQty: inventoryData?.cards?.inventoryQtyTotal || 0,
          inventoryCbm: inventoryData?.cards?.totalCbm || 0,
        },
        outbound: {
          dnSku: outboundData?.cards?.dnSku || 0,
          dnQty: outboundData?.cards?.dnQty || 0,
          dnTotalCbm: outboundData?.cards?.dnTotalCbm || 0,
        },
        productCategories: Array.from(categories),
        fulfillmentTable: outboundData?.fulfillmentTable || [],
      };

      setData(summaryData);
      setFullFulfillmentTable(outboundFullData?.fulfillmentTable || outboundData?.fulfillmentTable || []);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchSummary(true);
  };

  const handleReset = () => {
    setFromDate('');
    setToDate('');
    setSelectedMonth('ALL');
    setSelectedWarehouse('ALL');
    setSelectedProductCategories([]);
    fetchSummary(false);
  };

  const toggleProductCategory = (category: string) => {
    setSelectedProductCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const clearAllCategories = () => {
    setSelectedProductCategories([]);
  };

  const selectAllCategories = () => {
    setSelectedProductCategories(availableCategories);
  };

  const getSelectedCategoriesLabel = () => {
    if (selectedProductCategories.length === 0) return 'All Categories';
    if (selectedProductCategories.length === 1) return formatProductCategory(selectedProductCategories[0]);
    return `${selectedProductCategories.length} selected`;
  };

  const formatProductCategory = (category: string): string => {
    const labelMap: Record<string, string> = {
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
    return labelMap[category] || category;
  };

  const formatNumber = (num: number | undefined | null, decimals?: number): string => {
    if (num === undefined || num === null) return '0';
    const value = Number(num);
    if (isNaN(value)) return '0';

    if (decimals !== undefined) {
      return value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    if (Number.isInteger(value)) {
      return value.toLocaleString();
    } else {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  const formatInLakhs = (num: number | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null) return '0 L';
    const value = Number(num);
    if (isNaN(value)) return '0 L';
    const lakhs = value / 100000;
    return `${lakhs.toFixed(decimals)} L`;
  };

  const formatInThousands = (num: number | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null) return '0 K';
    const value = Number(num);
    if (isNaN(value)) return '0 K';
    const thousands = value / 1000;
    return `${thousands.toFixed(decimals)} K`;
  };

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  const formatMonthLabel = (month: string): string => {
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
  };

  const averageFulfillment = useMemo(() => {
    const rows = data?.fulfillmentTable || [];
    if (!rows.length) return 0;
    // Calculate overall fulfillment from total quantities (not average of percentages)
    const totalSoQty = rows.reduce((sum, row) => sum + (row.soQty || 0), 0);
    const totalDnQty = rows.reduce((sum, row) => sum + (row.dnQty || 0), 0);
    return totalSoQty > 0 ? (totalDnQty / totalSoQty) * 100 : 0;
  }, [data?.fulfillmentTable]);

  // Calculate last day fulfillment data based on selected day (today/yesterday/7days)
  const lastDayFulfillment = useMemo(() => {
    const rows = data?.fulfillmentTable || [];
    if (!rows.length) return { percentage: 0, date: '', soQty: 0, dnQty: 0, pending: 0 };

    const now = new Date();

    // Helper function to format date as DD-MM-YYYY
    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    // Helper function to format date as YYYY-MM-DD
    const formatDateISO = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${yyyy}-${mm}-${dd}`;
    };

    // For 7 days, aggregate data from last 7 days
    if (selectedFulfillmentDay === '7days') {
      const dates: string[] = [];
      const datesISO: string[] = [];

      // Generate last 7 days dates
      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        dates.push(formatDate(d));
        datesISO.push(formatDateISO(d));
      }

      // Filter rows for last 7 days
      const matchingRows = rows.filter(row => {
        return dates.includes(row.date) || datesISO.includes(row.date);
      });

      if (matchingRows.length > 0) {
        const totalSoQty = matchingRows.reduce((sum, row) => sum + (row.soQty || 0), 0);
        const totalDnQty = matchingRows.reduce((sum, row) => sum + (row.dnQty || 0), 0);
        const totalPending = matchingRows.reduce((sum, row) => sum + (row.pending || 0), 0);
        const percentage = totalSoQty > 0 ? (totalDnQty / totalSoQty) * 100 : 0;

        const startDate = formatDate(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
        const endDate = formatDate(now);

        return {
          percentage,
          date: `${startDate} - ${endDate}`,
          soQty: totalSoQty,
          dnQty: totalDnQty,
          pending: totalPending,
        };
      }

      return {
        percentage: 0,
        date: 'Last 7 Days',
        soQty: 0,
        dnQty: 0,
        pending: 0
      };
    }

    // For today or yesterday, get single day data
    const targetDate = selectedFulfillmentDay === 'today' ? now : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const targetDateStr = formatDate(targetDate);
    const targetDateStrISO = formatDateISO(targetDate);

    // Find the matching row
    const matchingRow = rows.find(row => {
      return row.date === targetDateStr || row.date === targetDateStrISO;
    });

    if (matchingRow) {
      return {
        percentage: matchingRow.percentage || 0,
        date: matchingRow.date || '',
        soQty: matchingRow.soQty || 0,
        dnQty: matchingRow.dnQty || 0,
        pending: matchingRow.pending || 0,
      };
    }

    // Fallback: if no match found, return empty data with the target date
    return {
      percentage: 0,
      date: targetDateStr,
      soQty: 0,
      dnQty: 0,
      pending: 0
    };
  }, [data?.fulfillmentTable, selectedFulfillmentDay]);

  // Calculate monthly fulfillment rates for line chart
  // Use fullFulfillmentTable so the Monthly Fulfillment chart always shows all months (unfiltered)
  const monthlyFulfillmentData = useMemo((): { month: string; label: string; fulfillmentRate: number; soQty: number; dnQty: number }[] => {
    const rows = fullFulfillmentTable || [];
    if (!rows.length) return [];

    // Group data by month (YYYY-MM)
    const monthlyGroups: Record<string, { soQty: number; dnQty: number; count: number }> = {};

    rows.forEach((row) => {
      // Parse date - supported formats:
      // 1. DD-MM-YYYY (e.g., "07-12-2025") - from backend
      // 2. DD Mon YYYY (e.g., "01 Nov 2025")
      // 3. YYYY-MM-DD (e.g., "2025-11-01")
      let monthKey = '';
      const dateStr = row.date;

      // Try DD-MM-YYYY format first (e.g., "07-12-2025")
      const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (ddmmyyyyMatch) {
        const year = ddmmyyyyMatch[3];
        const month = ddmmyyyyMatch[2].padStart(2, '0');
        monthKey = `${year}-${month}`;
      } else {
        // Try DD Mon YYYY format (e.g., "01 Nov 2025")
        const monthMatch = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
        if (monthMatch) {
          const monthNames: Record<string, string> = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          const year = monthMatch[3];
          const month = monthNames[monthMatch[2]] || '01';
          monthKey = `${year}-${month}`;
        } else {
          // Try YYYY-MM-DD format
          const isoMatch = dateStr.match(/(\d{4})-(\d{2})/);
          if (isoMatch) {
            monthKey = `${isoMatch[1]}-${isoMatch[2]}`;
          }
        }
      }

      if (monthKey) {
        if (!monthlyGroups[monthKey]) {
          monthlyGroups[monthKey] = { soQty: 0, dnQty: 0, count: 0 };
        }
        monthlyGroups[monthKey].soQty += row.soQty || 0;
        monthlyGroups[monthKey].dnQty += row.dnQty || 0;
        monthlyGroups[monthKey].count += 1;
      }
    });

    // Convert to array and calculate fulfillment rate for each month
    const monthlyData = Object.entries(monthlyGroups)
      .map(([month, { soQty, dnQty }]) => ({
        month,
        label: formatMonthLabel(month),
        fulfillmentRate: soQty > 0 ? Math.min(100, (dnQty / soQty) * 100) : 0,
        soQty,
        dnQty
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return monthlyData;
  }, [fullFulfillmentTable]);

  // Calculate current month fulfillment rate
  const currentMonthFulfillment = useMemo(() => {
    const rows = fullFulfillmentTable || [];
    if (!rows.length) return { percentage: 0, month: '', soQty: 0, dnQty: 0 };

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    let totalSoQty = 0;
    let totalDnQty = 0;

    rows.forEach((row) => {
      let monthKey = '';
      const dateStr = row.date;

      // Parse date formats
      const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (ddmmyyyyMatch) {
        const year = ddmmyyyyMatch[3];
        const month = ddmmyyyyMatch[2].padStart(2, '0');
        monthKey = `${year}-${month}`;
      } else {
        const monthMatch = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
        if (monthMatch) {
          const monthNames: Record<string, string> = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
          };
          const year = monthMatch[3];
          const month = monthNames[monthMatch[2]] || '01';
          monthKey = `${year}-${month}`;
        } else {
          const isoMatch = dateStr.match(/(\d{4})-(\d{2})/);
          if (isoMatch) {
            monthKey = `${isoMatch[1]}-${isoMatch[2]}`;
          }
        }
      }

      if (monthKey === currentMonthKey) {
        totalSoQty += row.soQty || 0;
        totalDnQty += row.dnQty || 0;
      }
    });

    const percentage = totalSoQty > 0 ? Math.min(100, (totalDnQty / totalSoQty) * 100) : 0;
    return {
      percentage,
      month: formatMonthLabel(currentMonthKey),
      soQty: totalSoQty,
      dnQty: totalDnQty
    };
  }, [fullFulfillmentTable]);

  return (
    <div>
      {/* Filters Section - Premium Design */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white border-2 border-enterprise-border rounded-2xl p-5 mb-8 shadow-lg hover:shadow-xl transition-all duration-300"
      >
        {/* Decorative gradient blob */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-brandYellow/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end" suppressHydrationWarning={true}>
          {/* Date Range - Unified Control */}
          <div className="md:col-span-2 space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range
            </label>
            <div className="group flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm transition-all hover:border-brandYellow/50 hover:shadow-md focus-within:border-brandYellow focus-within:ring-4 focus-within:ring-brandYellow/10">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSelectedMonth('ALL');
                  }}
                  min={availableDates?.minDate || ''}
                  max={availableDates?.maxDate || ''}
                  className="w-full pl-3 pr-2 py-1.5 bg-transparent text-xs font-semibold text-gray-900 border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer"
                  suppressHydrationWarning={true}
                />
              </div>
              <div className="px-3 text-gray-300">
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </div>
              <div className="relative flex-1">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setSelectedMonth('ALL');
                  }}
                  min={availableDates?.minDate || ''}
                  max={availableDates?.maxDate || ''}
                  className="w-full pl-2 pr-3 py-1.5 bg-transparent text-xs font-semibold text-gray-900 border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer text-right"
                  suppressHydrationWarning={true}
                />
              </div>
            </div>
          </div>

          {/* Month Selector */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Quick Select
            </label>
            <div className="group relative flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm transition-all hover:border-brandYellow/50 hover:shadow-md focus-within:border-brandYellow focus-within:ring-4 focus-within:ring-brandYellow/10">
              <div className="relative flex-1">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    if (e.target.value !== 'ALL') {
                      const [year, month] = e.target.value.split('-').map(Number);
                      if (year && month) {
                        // Format dates in local timezone to avoid timezone shift issues
                        const formatLocalDate = (d: Date) => {
                          const y = d.getFullYear();
                          const m = String(d.getMonth() + 1).padStart(2, '0');
                          const day = String(d.getDate()).padStart(2, '0');
                          return `${y}-${m}-${day}`;
                        };
                        const startDate = new Date(year, month - 1, 1);
                        const endDate = new Date(year, month, 0);
                        setFromDate(formatLocalDate(startDate));
                        setToDate(formatLocalDate(endDate));
                      }
                    }
                  }}
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 outline-none appearance-none transition-all cursor-pointer"
                  suppressHydrationWarning={true}
                >
                  {availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {formatMonthLabel(month)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-400 group-hover:text-brandRed transition-colors">
                <ChevronDown className="h-3.5 w-3.5 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* Warehouse Filter */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">
              <Box className="w-3.5 h-3.5" /> Warehouse
            </label>
            <div className="group relative flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm transition-all hover:border-brandYellow/50 hover:shadow-md focus-within:border-brandYellow focus-within:ring-4 focus-within:ring-brandYellow/10">
              <div className="relative flex-1">
                <select
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 outline-none appearance-none transition-all cursor-pointer"
                  suppressHydrationWarning={true}
                >
                  {availableWarehouses.map((warehouse) => (
                    <option key={warehouse} value={warehouse}>
                      {warehouse}
                    </option>
                  ))}
                </select>
              </div>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-400 group-hover:text-brandYellow transition-colors">
                <ChevronDown className="h-3.5 w-3.5 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* Product Category */}
          <div className="space-y-2 relative" ref={categoryDropdownRef}>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Package className="w-3.5 h-3.5" /> Category
            </label>
            <div className={`group relative flex items-center bg-white border rounded-xl p-1 shadow-sm transition-all duration-200 ${categoryDropdownOpen
              ? 'border-brandYellow ring-4 ring-brandYellow/10 z-20'
              : 'border-gray-200 hover:border-brandYellow/50 hover:shadow-md'
              }`}>
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full pl-3 pr-8 py-1.5 text-left bg-transparent text-xs font-semibold outline-none transition-all duration-200 flex items-center justify-between text-gray-900 cursor-pointer"
                suppressHydrationWarning={true}
              >
                <span className="truncate block">
                  {getSelectedCategoriesLabel()}
                </span>
              </button>
              <div className={`absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none transition-transform duration-300 ${categoryDropdownOpen ? 'rotate-180' : ''}`}>
                <ChevronDown className={`h-3.5 w-3.5 stroke-[3] ${categoryDropdownOpen ? 'text-brandYellow' : 'text-gray-400'}`} />
              </div>
            </div>

            {categoryDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-2xl shadow-gray-200/50 overflow-hidden ring-1 ring-black/5"
              >
                <div className="flex border-b border-gray-100 bg-gray-50/50 p-0.5">
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="flex-1 px-2 py-1.5 text-sm font-bold text-brandYellow hover:bg-brandYellow/10 rounded-md transition-colors"
                  >
                    Select All
                  </button>
                  <div className="w-px bg-gray-200 mx-0.5"></div>
                  <button
                    type="button"
                    onClick={clearAllCategories}
                    className="flex-1 px-2 py-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                  {availableCategories.map((category) => (
                    <label
                      key={category}
                      className="flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                    >
                      <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center transition-all duration-200 ${selectedProductCategories.includes(category)
                        ? 'bg-brandYellow border-brandYellow shadow-sm shadow-brandYellow/30 scale-105'
                        : 'border-gray-300 group-hover:border-brandYellow/50 bg-white'
                        }`}>
                        {selectedProductCategories.includes(category) && (
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        )}
                      </div>
                      <span className={`text-xs transition-colors ${selectedProductCategories.includes(category)
                        ? 'text-gray-900 font-semibold'
                        : 'text-gray-600'
                        }`}>
                        {formatProductCategory(category)}
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedProductCategories.includes(category)}
                        onChange={() => toggleProductCategory(category)}
                        className="sr-only"
                      />
                    </label>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Apply & Reset Buttons */}
          <div className="flex gap-2 items-end">
            <motion.button
              whileHover={{ scale: 1.05, translateY: -2 }}
              whileTap={{ scale: 0.95, translateY: 0 }}
              onClick={handleFilter}
              disabled={loading}
              title="Apply Filter"
              className="h-[36px] px-4 bg-brandYellow text-enterprise-text font-semibold rounded-xl shadow-lg shadow-brandYellow/25 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:bg-brandYellow/90 hover:shadow-brandYellow/40"
              suppressHydrationWarning={true}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-enterprise-text/30 border-t-enterprise-text rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4 stroke-[2.5] text-enterprise-text" />
              )}
              <span className="font-semibold text-xs text-enterprise-text">Filter</span>
            </motion.button>
            {(fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0 || (selectedWarehouse && selectedWarehouse !== 'ALL')) && (
              <motion.button
                whileHover={{ scale: 1.05, translateY: -2, rotate: 180 }}
                whileTap={{ scale: 0.95, translateY: 0 }}
                onClick={handleReset}
                title="Reset Filters"
                className="h-[36px] w-[36px] bg-white/80 backdrop-blur-sm border border-gray-200/50 text-gray-700 rounded-xl transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600 shadow-sm flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        </div>

      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-2xl p-6 animate-pulse">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gray-200 dark:bg-slate-700 rounded-xl"></div>
                <div>
                  <div className="h-5 bg-gray-200 dark:bg-slate-700 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-16"></div>
                </div>
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="p-4 bg-gray-100 dark:bg-slate-700/50 rounded-xl">
                    <div className="h-4 bg-gray-200 dark:bg-slate-600 rounded w-1/2 mb-2"></div>
                    <div className="h-6 bg-gray-200 dark:bg-slate-600 rounded w-1/3"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards Grid */}
      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Inbound Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/40 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            <div className="flex items-center gap-3 mb-4 pl-2">
              <motion.div
                whileHover={{ rotate: -5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <ArrowDownToLine className="w-5 h-5 text-red-600" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Inbound</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Received metrics</p>
              </div>
            </div>

            <div className="space-y-2.5 pl-2">
              {/* Received SKU Count */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Package className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Received SKU</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {formatNumber(data.inbound.receivedSkuCount)}
                </span>
              </motion.div>

              {/* Received Qty */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Received Qty</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {formatInLakhs(data.inbound.receivedQty)}
                </span>
              </motion.div>

              {/* Received CBM */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Box className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Received CBM</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Volume</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {formatInThousands(data.inbound.receivedCbm)}
                </span>
              </motion.div>
            </div>
          </motion.div>

          {/* Inventory Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/40 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:shadow-brandYellow/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandYellow via-brandYellow to-brandYellow/70 rounded-l-2xl" />

            <div className="flex items-center gap-3 mb-4 pl-2">
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
              >
                <Boxes className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Inventory</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Stock metrics</p>
              </div>
            </div>

            <div className="space-y-2.5 pl-2">
              {/* Inventory SKU */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandYellow/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                    <Package className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Inventory SKU</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                  {formatNumber(data.inventory.inventorySku)}
                </span>
              </motion.div>

              {/* Inventory Qty */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandYellow/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Inventory Qty</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                  {formatInLakhs(data.inventory.inventoryQty)}
                </span>
              </motion.div>

              {/* Inventory CBM */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandYellow/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                    <Box className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Inventory CBM</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Volume</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                  {formatInThousands(data.inventory.inventoryCbm)}
                </span>
              </motion.div>
            </div>
          </motion.div>

          {/* Outbound Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/40 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            <div className="flex items-center gap-3 mb-4 pl-2">
              <motion.div
                whileHover={{ rotate: -5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <ArrowUpFromLine className="w-5 h-5 text-red-600" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Outbound</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Delivery metrics</p>
              </div>
            </div>

            <div className="space-y-2.5 pl-2">
              {/* DN SKU */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Package className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">DN SKU</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {formatNumber(data.outbound.dnSku)}
                </span>
              </motion.div>

              {/* DN Qty */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">DN Qty</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {formatInLakhs(data.outbound.dnQty)}
                </span>
              </motion.div>

              {/* DN Total CBM */}
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Box className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">DN Total CBM</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Volume</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {formatInThousands(data.outbound.dnTotalCbm)}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Fulfillment Rate Section - Half Donuts + Line Chart */}
      {!loading && data?.fulfillmentTable && data.fulfillmentTable.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full mb-8 space-y-6"
        >
          {/* Half Donuts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Half Donut Chart - Average Fulfillment */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4, type: "spring", stiffness: 100 }}
              whileHover={{ scale: 1.01, y: -2 }}
              className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/40 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
            >
              {/* Left accent bar with gradient */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

              <div className="flex items-center justify-between mb-4 pl-2 h-20">
                <div className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ rotate: -5, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
                  >
                    <TrendingUp className="w-5 h-5 text-brandRed" />
                  </motion.div>
                  <div>
                    <h3 className="text-lg font-extrabold text-enterprise-text tracking-tight">Overall Fulfillment</h3>
                    <p className="text-xs text-enterprise-textSecondary font-medium">Total DN Qty / Total SO Qty</p>
                  </div>
                </div>
              </div>

              <div className="h-52 relative pl-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Fulfilled', value: Math.min(100, Math.max(0, averageFulfillment)), fill: '#DE1C1C' },
                        { name: 'Gap', value: Math.max(0, 100 - Math.max(0, averageFulfillment)), fill: '#FEA418' },
                      ]}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      <Cell fill="#DE1C1C" />
                      <Cell fill="#FEA418" />
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload as { name: string; value: number };
                          return (
                            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">{item.name}</p>
                              <p className="text-sm text-gray-600 dark:text-slate-400">
                                {item.value.toFixed(2)}%
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 pointer-events-none">
                  <span className="text-3xl font-bold text-brandRed">
                    {averageFulfillment.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500 font-medium">Overall Rate</span>
                </div>
              </div>

              <div className="flex justify-center gap-6 mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brandRed shadow-sm shadow-brandRed/50" />
                  <span className="text-xs text-gray-600">Fulfilled</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brandYellow shadow-sm shadow-brandYellow/50" />
                  <span className="text-xs text-gray-600">Pending</span>
                </div>
              </div>
            </motion.div>

            {/* Current Month Fulfillment - Half Donut */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5, type: "spring", stiffness: 100 }}
              whileHover={{ scale: 1.01, y: -2 }}
              className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/40 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:shadow-brandYellow/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
            >
              {/* Left accent bar with gradient */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandYellow via-brandYellow to-brandYellow/70 rounded-l-2xl" />

              <div className="flex items-center justify-between mb-4 pl-2 h-20">
                <div className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ rotate: 5, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
                  >
                    <Calendar className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
                  </motion.div>
                  <div>
                    <h3 className="text-lg font-extrabold text-enterprise-text tracking-tight">Fulfillment of {currentMonthFulfillment.month}</h3>
                  </div>
                </div>
              </div>

              <div className="h-52 relative pl-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Fulfilled', value: Math.min(100, Math.max(0, currentMonthFulfillment.percentage)), fill: '#FEA418' },
                        { name: 'Gap', value: Math.max(0, 100 - Math.max(0, currentMonthFulfillment.percentage)), fill: '#DE1C1C' },
                      ]}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      <Cell fill="#FEA418" />
                      <Cell fill="#DE1C1C" />
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload as { name: string; value: number };
                          return (
                            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">{item.name}</p>
                              <p className="text-sm text-gray-600 dark:text-slate-400">
                                {item.value.toFixed(2)}%
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 pointer-events-none">
                  <span className="text-3xl font-bold text-brandYellow">
                    {currentMonthFulfillment.percentage.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500 font-medium">Monthly Rate</span>
                </div>
              </div>

              <div className="flex justify-center gap-6 mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brandYellow shadow-sm shadow-brandYellow/50" />
                  <span className="text-xs text-gray-600">Fulfilled</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brandRed shadow-sm shadow-brandRed/50" />
                  <span className="text-xs text-gray-600">Pending</span>
                </div>
              </div>
            </motion.div>

            {/* Daily Fulfillment - Half Donut */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6, type: "spring", stiffness: 100 }}
              whileHover={{ scale: 1.01, y: -2 }}
              className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/40 rounded-2xl p-8 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
            >
              {/* Left accent bar with gradient */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

              <div className="mb-4 pl-2 h-20 flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <motion.div
                    whileHover={{ rotate: -5, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
                  >
                    <Clock className="w-5 h-5 text-brandRed" />
                  </motion.div>
                  <div>
                    <h3 className="text-lg font-extrabold text-enterprise-text tracking-tight">Daily Fulfillment</h3>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {/* Today/Yesterday Toggle Buttons */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setSelectedFulfillmentDay('today')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${selectedFulfillmentDay === 'today'
                        ? 'bg-brandRed text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setSelectedFulfillmentDay('yesterday')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${selectedFulfillmentDay === 'yesterday'
                        ? 'bg-brandRed text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      Yesterday
                    </button>
                    <button
                      onClick={() => setSelectedFulfillmentDay('7days')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${selectedFulfillmentDay === '7days'
                        ? 'bg-brandRed text-white shadow-md'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      7 Days
                    </button>
                  </div>
                  <div className="text-sm font-semibold text-enterprise-textSecondary bg-enterprise-yellowTint px-3 py-1.5 rounded-lg border border-enterprise-border/50">
                    {lastDayFulfillment.date}
                  </div>
                </div>
              </div>

              <div className="h-52 relative pl-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Fulfilled', value: Math.min(100, Math.max(0, lastDayFulfillment.percentage)), fill: '#DE1C1C' },
                        { name: 'Gap', value: Math.max(0, 100 - Math.max(0, lastDayFulfillment.percentage)), fill: '#FEA418' },
                      ]}
                      cx="50%"
                      cy="80%"
                      startAngle={180}
                      endAngle={0}
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      <Cell fill="#DE1C1C" />
                      <Cell fill="#FEA418" />
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload as { name: string; value: number };
                          return (
                            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">{item.name}</p>
                              <p className="text-sm text-gray-600 dark:text-slate-400">
                                {item.value.toFixed(2)}%
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 pointer-events-none">
                  <span className="text-3xl font-bold text-brandRed">
                    {lastDayFulfillment.percentage.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500 font-medium">{selectedFulfillmentDay === 'today' ? "Today's Rate" : selectedFulfillmentDay === 'yesterday' ? "Yesterday's Rate" : "7 Days Rate"}</span>
                </div>
              </div>

              <div className="flex justify-center gap-6 mt-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brandRed shadow-sm shadow-brandRed/50" />
                  <span className="text-xs text-gray-600">Fulfilled</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-brandYellow shadow-sm shadow-brandYellow/50" />
                  <span className="text-xs text-gray-600">Pending</span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Line Chart - Month over Month Fulfillment Rates (Full Width) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7, type: "spring", stiffness: 100 }}
            whileHover={{ scale: 1.005, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/30 rounded-2xl p-6 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            <div className="flex items-center justify-between mb-4 pl-2">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ rotate: 5, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
                >
                  <TrendingUp className="w-5 h-5 text-brandRed" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-extrabold text-enterprise-text tracking-tight">Fulfillment Rate (All Months)</h3>
                  <p className="text-xs text-enterprise-textSecondary font-medium">Monthly trend analysis</p>
                </div>
              </div>
            </div>

            <div className="h-52 relative pl-2">
              {monthlyFulfillmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyFulfillmentData}
                    margin={{ top: 20, right: 20, bottom: 20, left: 10 }}
                  >
                    <defs>
                      <linearGradient id="fulfillmentLineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#DE1C1C" stopOpacity={1} />
                        <stop offset="100%" stopColor="#FEA418" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="fulfillmentAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#DE1C1C" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#FEA418" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      strokeOpacity={0.1}
                      className="text-gray-300 dark:text-slate-700"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      className="text-gray-600 dark:text-slate-400"
                      axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                      tickLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      tickFormatter={(value: number) => `${value}%`}
                      className="text-gray-600 dark:text-slate-400"
                      axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                      tickLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        borderRadius: '12px',
                        padding: '12px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                      }}
                      labelStyle={{ color: '#f1f5f9', fontSize: '12px', fontWeight: '600', marginBottom: '8px' }}
                      itemStyle={{ color: '#f1f5f9', fontSize: '12px' }}
                      formatter={(value: number) => [`${value.toFixed(2)}%`, 'Fulfillment Rate']}
                      cursor={{ stroke: 'rgba(222, 28, 28, 0.3)', strokeWidth: 2 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="fulfillmentRate"
                      stroke="url(#fulfillmentLineGradient)"
                      strokeWidth={3}
                      dot={{
                        fill: '#DE1C1C',
                        stroke: '#ffffff',
                        strokeWidth: 2,
                        r: 5,
                      }}
                      activeDot={{
                        fill: '#DE1C1C',
                        stroke: '#ffffff',
                        strokeWidth: 3,
                        r: 8,
                      }}
                      name="Fulfillment Rate"
                      label={(props) => {
                        const x = typeof props?.x === 'number' ? props.x : Number(props?.x);
                        const y = typeof props?.y === 'number' ? props.y : Number(props?.y);
                        const value = typeof props?.value === 'number' ? props.value : Number(props?.value);

                        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) return null;

                        return (
                          <text x={x} y={y - 10} fill="#374151" fontSize={10} fontWeight="bold" textAnchor="middle">
                            {value.toFixed(2)}%
                          </text>
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-slate-400">
                  <div className="text-center">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Not enough data for monthly trend</p>
                  </div>
                </div>
              )}
            </div>

            {monthlyFulfillmentData.length > 0 && (
              <div className="flex justify-center gap-6 mt-2 pl-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-1 rounded-full bg-gradient-to-r from-brandRed to-brandYellow shadow-sm" />
                  <span className="text-xs text-enterprise-textSecondary font-medium">Fulfillment Rate %</span>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Fulfillment Table */}
      {!loading && data?.fulfillmentTable && data.fulfillmentTable.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full mb-8"
        >
          <div className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/30 rounded-2xl p-6 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10 pl-2">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ rotate: 5, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
                >
                  <TrendingUp className="w-5 h-5 text-brandRed" />
                </motion.div>
                <div>
                  <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Fulfillment Table</h3>
                  <p className="text-xs text-enterprise-textSecondary font-medium">Daily fulfillment breakdown</p>
                </div>
              </div>
              <motion.button
                onClick={() => downloadFulfillmentExcel(data.fulfillmentTable!)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brandRed to-brandYellow hover:from-brandRed/90 hover:to-brandYellow/90 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Download className="w-4 h-4" />
                <span>Download Excel</span>
              </motion.button>
            </div>

            {/* Table Container */}
            <div className="relative pl-2">
              {/* Headers - Sticky at top */}
              <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md pb-2">
                <div className="grid grid-cols-5 gap-4 px-4 py-3 bg-enterprise-redTint/30 backdrop-blur-md backdrop-saturate-150 ring-1 ring-black/5 dark:ring-white/10 rounded-lg border border-enterprise-border text-sm font-bold uppercase tracking-wider text-enterprise-textSecondary">
                  <div className="text-center">Date</div>
                  <div className="text-center">SO Qty</div>
                  <div className="text-center">DN Qty</div>
                  <div className="text-center">Pending Qty</div>
                  <div className="text-center">Percentage</div>
                </div>
              </div>

              {/* Scrollable Data Rows */}
              <motion.div
                className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent"
                variants={{
                  visible: {
                    transition: {
                      staggerChildren: 0.08,
                      delayChildren: 0.1,
                    }
                  }
                }}
                initial="hidden"
                animate="visible"
              >
                {data.fulfillmentTable.map((row, index) => (
                  <motion.div
                    key={row.date}
                    variants={{
                      hidden: {
                        opacity: 0,
                        x: -25,
                        scale: 0.95,
                        filter: "blur(4px)"
                      },
                      visible: {
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        filter: "blur(0px)",
                        transition: {
                          type: "spring",
                          stiffness: 400,
                          damping: 28,
                          mass: 0.6,
                        },
                      },
                    }}
                    className="relative"
                  >
                    <motion.div
                      className="relative bg-white/60 dark:bg-slate-700/40 backdrop-blur-md border border-gray-200/50 dark:border-slate-600/40 rounded-xl p-4 overflow-hidden transition-all duration-200"
                      whileHover={{
                        y: -2,
                        scale: 1.01,
                        transition: { type: "spring", stiffness: 400, damping: 25 }
                      }}
                    >
                      {/* Status gradient overlay based on percentage */}
                      <div
                        className={`absolute inset-0 bg-gradient-to-l ${row.percentage >= 100
                          ? 'from-green-500/20 via-green-500/10 to-transparent'
                          : row.percentage >= 90
                            ? 'from-blue-500/15 via-blue-500/5 to-transparent'
                            : row.percentage >= 75
                              ? 'from-yellow-500/15 via-yellow-500/5 to-transparent'
                              : 'from-red-500/15 via-red-500/5 to-transparent'
                          } pointer-events-none`}
                        style={{
                          backgroundSize: "30% 100%",
                          backgroundPosition: "right",
                          backgroundRepeat: "no-repeat"
                        }}
                      />

                      {/* Grid Content */}
                      <div className="relative grid grid-cols-5 gap-4 items-center text-center">
                        {/* Date */}
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brandRed to-brandYellow flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                            <Calendar className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-gray-900 dark:text-slate-200 font-medium text-sm">
                            {formatToDDMMYYYY(row.date)}
                          </span>
                        </div>

                        {/* SO Qty */}
                        <div className="flex justify-center">
                          <div className="px-3 py-1.5 rounded-lg bg-brandRed/10 border border-brandRed/30 inline-flex items-center justify-center min-w-[5rem]">
                            <span className="text-brandRed dark:text-brandYellow text-sm font-medium font-mono">
                              {formatNumber(row.soQty)}
                            </span>
                          </div>
                        </div>

                        {/* DN Qty */}
                        <div className="flex justify-center">
                          <div className="px-3 py-1.5 rounded-lg bg-brandYellow/10 border border-brandYellow/30 inline-flex items-center justify-center min-w-[5rem]">
                            <span className="text-brandYellow dark:text-brandRed text-sm font-medium font-mono">
                              {formatNumber(row.dnQty)}
                            </span>
                          </div>
                        </div>

                        {/* Pending */}
                        <div className="flex justify-center">
                          <div className={`px-3 py-1.5 rounded-lg inline-flex items-center justify-center min-w-[5rem] ${row.pending === 0
                            ? 'bg-green-500/10 border border-green-500/30'
                            : 'bg-red-500/10 border border-red-500/30'
                            }`}>
                            <span className={`text-sm font-medium font-mono ${row.pending === 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                              }`}>
                              {formatNumber(row.pending)}
                            </span>
                          </div>
                        </div>

                        {/* Percentage */}
                        <div className="flex justify-center">
                          <div className={`px-3 py-1.5 rounded-lg inline-flex items-center justify-center min-w-[5rem] ${row.percentage >= 100
                            ? 'bg-green-500/20 border-2 border-green-500/50'
                            : row.percentage >= 90
                              ? 'bg-blue-500/10 border border-blue-500/30'
                              : row.percentage >= 75
                                ? 'bg-yellow-500/10 border border-yellow-500/30'
                                : 'bg-red-500/10 border border-red-500/30'
                            }`}>
                            <span className={`text-sm font-bold font-mono ${row.percentage >= 100
                              ? 'text-green-600 dark:text-green-400'
                              : row.percentage >= 90
                                ? 'text-blue-600 dark:text-blue-400'
                                : row.percentage >= 75
                                  ? 'text-yellow-600 dark:text-yellow-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                              {row.percentage.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Average Row - Sticky at bottom */}
              <div className="sticky bottom-0 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md pt-4">
                <div className="relative bg-gradient-to-r from-brandRed/10 to-brandYellow/10 dark:from-brandRed/20 dark:to-brandYellow/20 border-2 border-brandRed/50 dark:border-brandYellow/50 rounded-xl p-4 overflow-hidden">
                  {/* Decorative gradient overlay */}
                  <div
                    className="absolute inset-0 bg-gradient-to-l from-brandYellow/10 to-transparent pointer-events-none"
                    style={{
                      backgroundSize: "40% 100%",
                      backgroundPosition: "right",
                      backgroundRepeat: "no-repeat"
                    }}
                  />

                  {/* Grid Content */}
                  <div className="relative grid grid-cols-5 gap-4 items-center text-center">
                    {/* Overall/Total Label */}
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brandRed to-brandYellow flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-lg font-bold text-gray-900 dark:text-slate-100">
                        Overall
                      </span>
                    </div>

                    {/* Total SO Qty */}
                    <div className="flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-brandRed/20 border-2 border-brandRed/50 inline-flex items-center justify-center min-w-[5rem]">
                        <span className="text-brandRed dark:text-brandYellow text-base font-bold font-mono">
                          {formatNumber(data.fulfillmentTable.reduce((sum, row) => sum + row.soQty, 0))}
                        </span>
                      </div>
                    </div>

                    {/* Total DN Qty */}
                    <div className="flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-brandYellow/20 border-2 border-brandYellow/50 inline-flex items-center justify-center min-w-[5rem]">
                        <span className="text-brandYellow dark:text-brandRed text-base font-bold font-mono">
                          {formatNumber(data.fulfillmentTable.reduce((sum, row) => sum + row.dnQty, 0))}
                        </span>
                      </div>
                    </div>

                    {/* Total Pending */}
                    <div className="flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-red-500/20 border-2 border-red-500/50 inline-flex items-center justify-center min-w-[5rem]">
                        <span className="text-red-700 dark:text-red-300 text-base font-bold font-mono">
                          {formatNumber(data.fulfillmentTable.reduce((sum, row) => sum + row.pending, 0))}
                        </span>
                      </div>
                    </div>

                    {/* Overall Percentage */}
                    <div className="flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-green-500/20 border-2 border-green-500/50 inline-flex items-center justify-center min-w-[5rem]">
                        <span className="text-green-700 dark:text-green-300 text-base font-bold font-mono">
                          {averageFulfillment.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* No Data State */}
      {!loading && !data && (
        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-12 mb-8 shadow-sm dark:shadow-none text-center">
          <Boxes className="w-16 h-16 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200 mb-2">No Data Available</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            No data found. Please upload files to see the quick summary.
          </p>
          <a
            href="/upload"
            className="inline-flex items-center px-6 py-3 bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            Upload Files
          </a>
        </div>
      )}
    </div>
  );
}
