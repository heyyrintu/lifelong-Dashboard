'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { authenticatedFetch } from '@/lib/api';
import { useDateFilter } from '@/lib/date-filter-context';
import { motion } from 'framer-motion';
import { formatHeaderDateShort } from '@/lib/utils';
import {
  formatNumber,
  formatInLakhs,
  formatQuantityInLakhs,
  formatQuantitySmartKL,
  formatAxisLabel,
  formatMonthLabel,
  getErrorMessage,
} from '@/lib/formatters';
import { ArrowDownToLine, Package, Clock, TrendingUp, CheckCircle, AlertCircle, Download, ChevronDown, Check, Calendar, ArrowRightLeft, Search, RefreshCw, Box, Truck } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
} from 'recharts';

interface InboundCardMetrics {
  invoiceSkuCount: number;
  receivedSkuCount: number;
  invoiceQtyTotal: number;
  receivedQtyTotal: number;
  goodQtyTotal: number;
  totalCbm: number;
  vehicleCount: number;
}

interface TimeSeriesPoint {
  key: string;
  label: string;
  edelReceivedQty: number;
  receivedQty: number;
  totalCbm: number;
  edelTotalCbm: number;
  startDate: string;
  endDate: string;
}

interface TimeSeriesData {
  granularity: 'month' | 'week' | 'day';
  points: TimeSeriesPoint[];
}

interface DayData {
  date: string;
  label: string;
  receivedQty: number;
  totalCbm: number;
  edelReceivedQty: number;
  edelTotalCbm: number;
}

interface SummaryTotals {
  totalReceivedQty: number;
  totalCbm: number;
  totalEdelReceivedQty: number;
  totalEdelTotalCbm: number;
  dayData: DayData[];
}

interface ProductCategoryTableRow {
  category: string;
  skuCount: number;
  receivedQty: number;
  totalCbm: number;
}

interface InboundSummaryResponse {
  cards: InboundCardMetrics;
  availableDates: {
    minDate: string | null;
    maxDate: string | null;
  };
  availableMonths: string[];
  productCategories: string[];
  timeSeries: TimeSeriesData;
  summaryTotals: SummaryTotals;
  categoryTable: ProductCategoryTableRow[];
}

// Memoized Legend components - moved outside to prevent re-renders
const QtyLegend = React.memo(() => (
  <div className="flex justify-end gap-4 text-xs font-semibold">
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
      <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm" />
      <span className="text-gray-700 dark:text-slate-300">EDEL Received Qty</span>
    </div>
    <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
      <div className="w-3 h-3 rounded bg-gradient-to-br from-red-500 to-red-600 shadow-sm" />
      <span className="text-gray-700 dark:text-slate-300">Received Qty</span>
    </div>
  </div>
));
QtyLegend.displayName = 'QtyLegend';

const CbmLegend = React.memo(() => (
  <div className="flex justify-end gap-4 text-xs font-semibold">
    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
      <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm" />
      <span className="text-gray-700 dark:text-slate-300">EDEL CBM</span>
    </div>
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200/50 dark:border-amber-800/50">
      <div className="w-3 h-3 rounded bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm" />
      <span className="text-gray-700 dark:text-slate-300">Total CBM</span>
    </div>
  </div>
));
CbmLegend.displayName = 'CbmLegend';

export default function InboundPage() {
  const [summaryData, setSummaryData] = useState<InboundSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [chartData, setChartData] = useState<TimeSeriesData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const { setLabel: setDateFilterLabel } = useDateFilter();

  const formatDateUTC = (date: Date): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const selectedDateRangeLabel = useMemo(() => {
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
    if (summaryData?.availableDates) return `${formatHeaderDateShort(summaryData.availableDates.minDate)} - ${formatHeaderDateShort(summaryData.availableDates.maxDate)}`;
    return 'All Dates';
  }, [fromDate, toDate, selectedMonth, summaryData?.availableDates]);

  useEffect(() => {
    setDateFilterLabel(selectedDateRangeLabel);
  }, [selectedDateRangeLabel, setDateFilterLabel]);

  // Helper function to check if date range matches a specific month
  const getMonthFromDateRange = (from: string, to: string): string | null => {
    if (!from || !to) return null;

    try {
      const startDate = new Date(from);
      const endDate = new Date(to);

      // Check if both dates are in the same month and year
      if (startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth()) {

        // Check if startDate is the 1st of the month
        const isFirstDay = startDate.getDate() === 1;

        // Check if endDate is the last day of the month
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
  };


  // Combine initial data fetch to avoid duplicate API calls
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setChartLoading(true);

        const params = new URLSearchParams();
        params.append('timeGranularity', timeGranularity);

        const response = await authenticatedFetch(`/inbound/summary?${params.toString()}`);

        if (!response.ok) {
          if (response.status === 404) {
            setSummaryData(null);
            setChartData(null);
            return;
          }
          throw new Error('Failed to fetch data');
        }

        const result: InboundSummaryResponse = await response.json();
        setSummaryData(result);
        setChartData(result.timeSeries);
      } catch (err: unknown) {
        console.error('Initial data fetch error:', getErrorMessage(err));
        setSummaryData(null);
        setChartData(null);
      } finally {
        setLoading(false);
        setChartLoading(false);
      }
    };

    fetchInitialData();
  }, []);

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

  const fetchChartData = async (granularity: 'month' | 'week' | 'day') => {
    try {
      setChartLoading(true);
      const params = new URLSearchParams();
      params.append('timeGranularity', granularity);

      // For week and day granularities, apply filters
      // For month granularity, show all months (no filters)
      if (granularity !== 'month') {
        if (selectedMonth && selectedMonth !== 'ALL') {
          params.append('month', selectedMonth);
        } else {
          if (fromDate) params.append('fromDate', fromDate);
          if (toDate) params.append('toDate', toDate);
        }
        if (selectedProductCategories.length > 0) {
          selectedProductCategories.forEach(cat => params.append('productCategory', cat));
        }
      }

      const response = await authenticatedFetch(`/inbound/summary?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const result: InboundSummaryResponse = await response.json();
      setChartData(result.timeSeries);
    } catch (err: unknown) {
      console.error('Chart data fetch error:', getErrorMessage(err));
      setChartData(null);
    } finally {
      setChartLoading(false);
    }
  };

  const fetchSummary = async (useFilters = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (useFilters) {
        if (selectedMonth && selectedMonth !== 'ALL') {
          params.append('month', selectedMonth);
        } else {
          if (fromDate) params.append('fromDate', fromDate);
          if (toDate) params.append('toDate', toDate);
        }
        if (selectedProductCategories.length > 0) {
          selectedProductCategories.forEach(cat => params.append('productCategory', cat));
        }
      }
      params.append('timeGranularity', timeGranularity);

      const url = `/inbound/summary${params.toString() ? '?' + params.toString() : ''}`;
      const response = await authenticatedFetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          // No data found
          setSummaryData(null);
          return;
        }
        throw new Error('Failed to fetch summary');
      }

      const result: InboundSummaryResponse = await response.json();
      setSummaryData(result);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
      setSummaryData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchSummary(true);
    // Refresh chart data with current granularity and filters
    fetchChartData(timeGranularity);
  };

  const handleReset = () => {
    setFromDate('');
    setToDate('');
    setSelectedMonth('ALL');
    setSelectedProductCategories([]);
    fetchSummary();
    // Refresh chart data with current granularity (will show all data for month, filtered for week/day)
    fetchChartData(timeGranularity);
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
    const allCategories = (summaryData?.productCategories || []).filter(c => c !== 'ALL');
    setSelectedProductCategories(allCategories);
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

  const handleTimeGranularityChange = (granularity: 'month' | 'week' | 'day') => {
    setTimeGranularity(granularity);
    // Small delay to ensure state updates complete
    setTimeout(() => fetchChartData(granularity), 10);
  };

  // Chart click handler - uses runtime type guards for safety
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChartClick = (data: Record<string, unknown> | null) => {
    if (!data) return;

    const activePayload = data.activePayload as Array<{ payload: Record<string, unknown> }> | undefined;
    if (!activePayload || !activePayload[0]) return;

    // Per user request: exclude month granularity clicking
    if (timeGranularity === 'month') return;

    const payload = activePayload[0].payload;
    const startDate = payload.startDate as string | undefined;
    const endDate = payload.endDate as string | undefined;

    if (startDate && endDate) {
      setFromDate(startDate);
      setToDate(endDate);
      setSelectedMonth('ALL');
      setTimeout(() => {
        fetchSummary(true);
        fetchChartData(timeGranularity);
      }, 0);
    }
  };

  const handleDownloadSummary = async () => {
    if (downloadLoading) return; // Prevent double-click

    try {
      setDownloadLoading(true);
      const params = new URLSearchParams();

      if (selectedMonth && selectedMonth !== 'ALL') {
        params.append('month', selectedMonth);
      } else {
        if (fromDate) params.append('fromDate', fromDate);
        if (toDate) params.append('toDate', toDate);
      }
      if (selectedProductCategories.length > 0) {
        selectedProductCategories.forEach(cat => params.append('productCategory', cat));
      }
      params.append('timeGranularity', timeGranularity);

      const response = await authenticatedFetch(`/inbound/download-summary?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to download inbound summary');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inbound-summary.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Inbound summary download failed:', error);
      alert('Failed to download inbound summary. Please try again.');
    } finally {
      setDownloadLoading(false);
    }
  };

  // All formatting utilities are now imported from lib/formatters.ts:
  // formatNumber, formatInLakhs, formatQuantityInLakhs, formatQuantitySmartKL,
  // formatAxisLabel, formatMonthLabel, formatProductCategory, MONTH_LABELS

  // QtyLegend and CbmLegend are defined outside with React.memo

  return (
    <div>

      {/* Date & Category Filters - Premium Redesign */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/40 dark:border-slate-700/40 rounded-2xl p-5 mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      >
        {/* Decorative gradient blob */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-brandRed/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end" suppressHydrationWarning={true}>
          {/* Date Range - Unified Control */}
          <div className="md:col-span-2 space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    const newFromDate = e.target.value;
                    setFromDate(newFromDate);

                    // Check if the new date range matches a specific month
                    const matchedMonth = getMonthFromDateRange(newFromDate, toDate);
                    if (matchedMonth && summaryData?.availableMonths?.includes(matchedMonth)) {
                      setSelectedMonth(matchedMonth);
                    } else {
                      setSelectedMonth('ALL');
                    }

                    // If in week or day mode, refresh chart data immediately
                    if (timeGranularity !== 'month' && newFromDate && toDate) {
                      setTimeout(() => fetchChartData(timeGranularity), 0);
                    }
                  }}
                  min={summaryData?.availableDates?.minDate || ''}
                  max={summaryData?.availableDates?.maxDate || ''}
                  className="w-full pl-3 pr-2 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer"
                  suppressHydrationWarning={true}
                />
              </div>
              <div className="px-3 text-gray-300 dark:text-slate-600">
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </div>
              <div className="relative flex-1">
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    const newToDate = e.target.value;
                    setToDate(newToDate);

                    // Check if the new date range matches a specific month
                    const matchedMonth = getMonthFromDateRange(fromDate, newToDate);
                    if (matchedMonth && summaryData?.availableMonths?.includes(matchedMonth)) {
                      setSelectedMonth(matchedMonth);
                    } else {
                      setSelectedMonth('ALL');
                    }

                    // If in week or day mode, refresh chart data immediately
                    if (timeGranularity !== 'month' && fromDate && newToDate) {
                      setTimeout(() => fetchChartData(timeGranularity), 0);
                    }
                  }}
                  min={summaryData?.availableDates?.minDate || ''}
                  max={summaryData?.availableDates?.maxDate || ''}
                  className="w-full pl-2 pr-3 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer text-right"
                  suppressHydrationWarning={true}
                />
              </div>
            </div>
          </div>

          {/* Month Selector */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Quick Select
            </label>
            <div className="group relative flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    const newMonth = e.target.value;
                    setSelectedMonth(newMonth);

                    // If a specific month is selected, update the date range
                    if (newMonth !== 'ALL') {
                      const [year, month] = newMonth.split('-').map(Number);
                      if (year && month) {
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

                        // If in week or day mode, refresh chart data immediately
                        if (timeGranularity !== 'month') {
                          setTimeout(() => fetchChartData(timeGranularity), 0);
                        }
                      }
                    } else {
                      // If "All Months" is selected, clear the date range
                      setFromDate('');
                      setToDate('');

                      // If in week or day mode, refresh chart data immediately
                      if (timeGranularity !== 'month') {
                        setTimeout(() => fetchChartData(timeGranularity), 0);
                      }
                    }
                  }}
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white outline-none appearance-none transition-all cursor-pointer"
                  suppressHydrationWarning={true}
                >
                  {(summaryData?.availableMonths || ['ALL']).map((month: string) => (
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

          {/* Product Category */}
          <div className="space-y-2 relative" ref={categoryDropdownRef}>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Package className="w-3.5 h-3.5" /> Category
            </label>
            <div className={`group relative flex items-center bg-white dark:bg-slate-800/50 border rounded-xl p-1 shadow-sm transition-all duration-200 ${categoryDropdownOpen
              ? 'border-brandRed ring-4 ring-brandRed/5 z-20'
              : 'border-gray-200 dark:border-slate-700 hover:border-brandRed/30 hover:shadow-md'
              }`}>
              <button
                type="button"
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="w-full pl-3 pr-8 py-1.5 text-left bg-transparent text-xs font-semibold outline-none transition-all duration-200 flex items-center justify-between text-gray-900 dark:text-white cursor-pointer"
                suppressHydrationWarning={true}
              >
                <span className="truncate block">
                  {getSelectedCategoriesLabel()}
                </span>
              </button>
              <div className={`absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none transition-transform duration-300 ${categoryDropdownOpen ? 'rotate-180' : ''}`}>
                <ChevronDown className={`h-3.5 w-3.5 stroke-[3] ${categoryDropdownOpen ? 'text-brandRed' : 'text-gray-400'}`} />
              </div>
            </div>

            {categoryDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-2xl shadow-gray-200/50 dark:shadow-black/50 overflow-hidden ring-1 ring-black/5"
              >
                <div className="flex border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50 p-0.5">
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="flex-1 px-2 py-1.5 text-sm font-bold text-brandRed hover:bg-brandRed/10 rounded-md transition-colors"
                  >
                    Select All
                  </button>
                  <div className="w-px bg-gray-200 dark:bg-slate-700 mx-0.5"></div>
                  <button
                    type="button"
                    onClick={clearAllCategories}
                    className="flex-1 px-2 py-1.5 text-sm font-bold text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                  {(summaryData?.productCategories || []).filter(c => c !== 'ALL').map((category) => (
                    <label
                      key={category}
                      className="flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                    >
                      <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center transition-all duration-200 ${selectedProductCategories.includes(category)
                        ? 'bg-brandRed border-brandRed shadow-sm shadow-brandRed/30 scale-105'
                        : 'border-gray-300 dark:border-slate-600 group-hover:border-brandRed/50 bg-white dark:bg-slate-900'
                        }`}>
                        {selectedProductCategories.includes(category) && (
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        )}
                      </div>
                      <span className={`text-xs transition-colors ${selectedProductCategories.includes(category)
                        ? 'text-gray-900 dark:text-white font-semibold'
                        : 'text-gray-600 dark:text-slate-400'
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
              whileHover={{ scale: downloadLoading ? 1 : 1.05, translateY: downloadLoading ? 0 : -1 }}
              whileTap={{ scale: downloadLoading ? 1 : 0.95, translateY: 0 }}
              onClick={handleDownloadSummary}
              disabled={downloadLoading}
              className={`h-[36px] w-[36px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-slate-200 shadow-sm transition-colors ${downloadLoading ? 'opacity-70 cursor-not-allowed' : 'hover:border-brandRed/60 hover:text-brandRed'}`}
              aria-label="Download inbound Excel"
              title={downloadLoading ? 'Downloading...' : 'Download Excel'}
            >
              {downloadLoading ? (
                <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, translateY: -2 }}
              whileTap={{ scale: 0.95, translateY: 0 }}
              onClick={handleFilter}
              disabled={loading}
              title="Apply Filter"
              className="h-[36px] px-4 bg-gradient-to-r from-brandRed to-red-600 text-white rounded-xl shadow-lg shadow-brandRed/25 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-brandRed/40"
              suppressHydrationWarning={true}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4 stroke-[2.5]" />
              )}
              <span className="font-semibold text-xs">Filter</span>
            </motion.button>
            {(fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0) && (
              <motion.button
                whileHover={{ scale: 1.05, translateY: -2, rotate: 180 }}
                whileTap={{ scale: 0.95, translateY: 0 }}
                onClick={handleReset}
                title="Reset Filters"
                className="h-[36px] w-[36px] bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-slate-300 rounded-xl transition-all hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-200 dark:hover:border-red-800 hover:text-red-600 dark:hover:text-red-400 shadow-sm flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Date range info - Bottom Right */}
        {summaryData?.availableDates?.minDate && (
          <div className="flex justify-end mt-3">
            <p className="text-xs text-gray-500 dark:text-slate-500">
              Data available: {summaryData.availableDates.minDate} to {summaryData.availableDates.maxDate}
            </p>
          </div>
        )}
      </motion.div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded mb-4 w-1/2"></div>
                <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded mb-2 w-3/4"></div>
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/3"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Data State */}
      {!loading && !summaryData && (
        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-12 mb-8 shadow-sm dark:shadow-none text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 dark:text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200 mb-2">No Inbound Data Found</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            No inbound data found for the selected period. Please upload an Item Master file and Inbound data file.
          </p>
          <a
            href="/upload"
            className="inline-flex items-center px-6 py-3 bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            Upload Files
          </a>
        </div>
      )}

      {/* Inbound Cards - Outbound Style */}
      {!loading && summaryData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Invoice Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <ArrowDownToLine className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Invoice</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Order metrics</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Invoice SKU</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Unique Invoice Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {formatNumber(summaryData.cards.invoiceSkuCount)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Invoice Qty</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total Invoice Quantity (in Lakhs)</p>
                  </div>
                </div>
                <span
                  className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 cursor-help"
                  title={`Full Value: ${formatNumber(summaryData.cards.invoiceQtyTotal, 2)}`}
                >
                  {formatQuantityInLakhs(summaryData.cards.invoiceQtyTotal, 2)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">No of Vehicle</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Unique Vehicles</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {formatNumber(summaryData.cards.vehicleCount)}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Received Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Received</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Delivery metrics</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Received SKU</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Unique Received Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                  {formatNumber(summaryData.cards.receivedSkuCount)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Received Qty</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total Received Quantity (in Lakhs)</p>
                  </div>
                </div>
                <span
                  className="text-2xl font-bold font-mono text-green-600 dark:text-green-400 cursor-help"
                  title={`Full Value: ${formatNumber(summaryData.cards.receivedQtyTotal, 2)}`}
                >
                  {formatQuantityInLakhs(summaryData.cards.receivedQtyTotal, 2)}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <Box className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Good Qty</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total Good Quantity (in Lakhs)</p>
                  </div>
                </div>
                <span
                  className="text-2xl font-bold font-mono text-green-600 dark:text-green-400 cursor-help"
                  title={`Full Value: ${formatNumber(summaryData.cards.goodQtyTotal, 2)}`}
                >
                  {formatQuantityInLakhs(summaryData.cards.goodQtyTotal, 2)}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Volume Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Volume</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">CBM metrics</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-purple-50/80 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                    <Box className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Total CBM</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Cubic Meters</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {formatNumber(summaryData.cards.totalCbm, 2)}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Product Category Table */}
      {!loading && summaryData && summaryData.categoryTable && summaryData.categoryTable.length > 0 && (
        <div className="w-full mb-8">
          <div className="relative border border-gray-200 dark:border-slate-700/30 rounded-2xl p-6 bg-white dark:bg-slate-800/50">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <h3 className="text-xl font-medium text-gray-900 dark:text-slate-100">Category Wise CBM</h3>
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  {summaryData.categoryTable.length} Categories
                </div>
              </div>
            </div>

            <div>
              {/* Headers */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                <div className="col-span-1">No</div>
                <div className="col-span-5">Category</div>
                <div className="col-span-2 text-center">SKU</div>
                <div className="col-span-2 text-center">Received Qty (L)</div>
                <div className="col-span-2 text-center">Total CBM</div>
              </div>

              {/* Data Rows */}
              <motion.div
                className="space-y-2"
                variants={{
                  visible: {
                    transition: {
                      staggerChildren: 0.08,
                      delayChildren: 0.1,
                    },
                  },
                }}
                initial="hidden"
                animate="visible"
              >
                {summaryData.categoryTable.map((row, index) => (
                  <motion.div
                    key={row.category}
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
                      className="relative bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600/50 rounded-xl p-4 overflow-hidden"
                      whileHover={{
                        y: -1,
                        transition: { type: "spring", stiffness: 400, damping: 25 }
                      }}
                    >
                      {/* Status gradient overlay */}
                      <div
                        className="absolute inset-0 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none"
                        style={{
                          backgroundSize: "30% 100%",
                          backgroundPosition: "right",
                          backgroundRepeat: "no-repeat"
                        }}
                      />

                      {/* Grid Content */}
                      <div className="relative grid grid-cols-12 gap-4 items-center">
                        {/* Number */}
                        <div className="col-span-1">
                          <span className="text-2xl font-bold text-gray-400 dark:text-slate-500">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>

                        {/* Category */}
                        <div className="col-span-5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                            <Package className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-gray-900 dark:text-slate-200 font-medium">
                            {formatProductCategory(row.category)}
                          </span>
                        </div>

                        {/* SKU Count */}
                        <div className="col-span-2 flex justify-center">
                          <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center">
                            <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                              {formatNumber(row.skuCount, 0)}
                            </span>
                          </div>
                        </div>

                        {/* Received Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div
                            className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center cursor-help"
                            title={`Full Value: ${formatNumber(row.receivedQty, 0)}`}
                          >
                            <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                              {formatQuantityInLakhs(row.receivedQty, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Total CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                            <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">
                              {formatNumber(row.totalCbm, 2)} CBM
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Total Row */}
              <div className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-slate-600">
                <div className="relative bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl p-4 overflow-hidden">
                  {/* Decorative gradient overlay */}
                  <div
                    className="absolute inset-0 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none"
                    style={{
                      backgroundSize: "40% 100%",
                      backgroundPosition: "right",
                      backgroundRepeat: "no-repeat"
                    }}
                  />

                  {/* Grid Content */}
                  <div className="relative grid grid-cols-12 gap-4 items-center">
                    {/* Icon */}
                    <div className="col-span-1">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                    </div>

                    {/* Total Label */}
                    <div className="col-span-5 flex items-center">
                      <span className="text-lg font-bold text-gray-900 dark:text-slate-100">
                        Total
                      </span>
                    </div>

                    {/* Total SKU Count */}
                    <div className="col-span-2 flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-blue-500/20 border-2 border-blue-500/50 inline-flex items-center justify-center">
                        <span className="text-blue-700 dark:text-blue-300 text-base font-bold">
                          {formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.skuCount, 0), 0)}
                        </span>
                      </div>
                    </div>

                    {/* Total Received Qty */}
                    <div className="col-span-2 flex justify-center">
                      <div
                        className="px-4 py-2 rounded-lg bg-green-500/20 border-2 border-green-500/50 inline-flex items-center justify-center cursor-help"
                        title={`Full Value: ${formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.receivedQty, 0), 0)}`}
                      >
                        <span className="text-green-700 dark:text-green-300 text-base font-bold">
                          {formatQuantityInLakhs(summaryData.categoryTable.reduce((sum, row) => sum + row.receivedQty, 0), 2)}
                        </span>
                      </div>
                    </div>

                    {/* Total CBM */}
                    <div className="col-span-2 flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-purple-500/20 border-2 border-purple-500/50 inline-flex items-center justify-center">
                        <span className="text-purple-700 dark:text-purple-300 text-base font-bold">
                          {formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.totalCbm, 0), 2)} CBM
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Series Charts - Premium Glassmorphism Design */}
      {!loading && summaryData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          {/* View by toggle - Enhanced Design */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brandRed" />
              <label className="text-base font-semibold text-gray-900 dark:text-slate-100">Time Series Analysis</label>
            </div>
            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-1 shadow-sm">
              {(['month', 'week', 'day'] as const).map((granularity) => (
                <motion.button
                  key={granularity}
                  onClick={() => handleTimeGranularityChange(granularity)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeGranularity === granularity
                    ? 'bg-gradient-to-r from-brandRed to-red-600 text-white shadow-lg shadow-brandRed/25'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-100/50 dark:hover:bg-slate-700/50'
                    }`}
                  suppressHydrationWarning={true}
                >
                  {granularity.charAt(0).toUpperCase() + granularity.slice(1)}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* EDEL vs Total Received Qty Chart - Premium Design */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              {/* Decorative gradient blob */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

              <div className="flex items-center justify-between mb-6 relative z-10">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">EDEL vs Received Qty</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Quantity comparison (in Lakhs)</p>
                </div>
              </div>
              {chartLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-brandRed border-t-transparent"></div>
                </div>
              ) : chartData?.points && chartData.points.length > 0 ? (
                <div className="relative z-10">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartData.points}
                      margin={{ top: 20, right: 20, bottom: 10, left: 0 }}
                      onClick={handleChartClick}
                    >
                      <defs>
                        <linearGradient id="edelQtyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.7} />
                        </linearGradient>
                        <linearGradient id="receivedQtyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#dc2626" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} />
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
                        tickFormatter={formatAxisLabel}
                        className="text-gray-600 dark:text-slate-400"
                        axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        tickFormatter={(value: number) => `${formatInLakhs(value)}L`}
                        className="text-gray-600 dark:text-slate-400"
                        axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
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
                        formatter={(value: number, name: string) => [
                          `${formatInLakhs(value)}L (${formatNumber(value, 0)})`,
                          name === 'edelReceivedQty' ? 'EDEL Received Qty' : 'Received Qty'
                        ]}
                        cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        content={<QtyLegend />}
                        wrapperStyle={{ paddingBottom: '20px' }}
                      />
                      <Bar
                        dataKey="edelReceivedQty"
                        fill="url(#edelQtyGradient)"
                        radius={[8, 8, 0, 0]}
                        name="EDEL Received Qty"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        activeBar={{ stroke: 'black', strokeWidth: 1 }}
                      >
                        <LabelList
                          dataKey="edelReceivedQty"
                          position="top"
                          formatter={(value: any) => `${formatInLakhs(value)}L`}
                          style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                        />
                      </Bar>
                      <Bar
                        dataKey="receivedQty"
                        fill="url(#receivedQtyGradient)"
                        radius={[8, 8, 0, 0]}
                        name="Received Qty"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        activeBar={{ stroke: 'black', strokeWidth: 1 }}
                      >
                        <LabelList
                          dataKey="receivedQty"
                          position="top"
                          formatter={(value: any) => `${formatInLakhs(value)}L`}
                          style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 dark:text-slate-400">
                  <div className="text-center">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No data available</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* EDEL vs Total CBM Chart - Premium Design */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              {/* Decorative gradient blob */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

              <div className="flex items-center justify-between mb-6 relative z-10">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">EDEL vs Total CBM</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Volume comparison</p>
                </div>
              </div>
              {chartLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-brandRed border-t-transparent"></div>
                </div>
              ) : chartData?.points && chartData.points.length > 0 ? (
                <div className="relative z-10">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartData.points}
                      margin={{ top: 20, right: 20, bottom: 10, left: 0 }}
                      onClick={handleChartClick}
                    >
                      <defs>
                        <linearGradient id="edelCbmGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.7} />
                        </linearGradient>
                        <linearGradient id="totalCbmGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#d97706" stopOpacity={0.7} />
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
                        tickFormatter={formatAxisLabel}
                        className="text-gray-600 dark:text-slate-400"
                        axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'currentColor' }}
                        className="text-gray-600 dark:text-slate-400"
                        axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
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
                        formatter={(value: number, name: string) => [
                          formatNumber(value, 2),
                          name === 'edelTotalCbm' ? 'EDEL CBM' : 'Total CBM'
                        ]}
                        cursor={{ fill: 'rgba(245, 158, 11, 0.1)' }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        content={<CbmLegend />}
                        wrapperStyle={{ paddingBottom: '20px' }}
                      />
                      <Bar
                        dataKey="edelTotalCbm"
                        fill="url(#edelCbmGradient)"
                        radius={[8, 8, 0, 0]}
                        name="EDEL CBM"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        activeBar={{ stroke: 'black', strokeWidth: 1 }}
                      >
                        <LabelList
                          dataKey="edelTotalCbm"
                          position="top"
                          formatter={(value: any) => formatNumber(value, 2)}
                          style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                        />
                      </Bar>
                      <Bar
                        dataKey="totalCbm"
                        fill="url(#totalCbmGradient)"
                        radius={[8, 8, 0, 0]}
                        name="Total CBM"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        activeBar={{ stroke: 'black', strokeWidth: 1 }}
                      >
                        <LabelList
                          dataKey="totalCbm"
                          position="top"
                          formatter={(value: any) => formatNumber(value, 2)}
                          style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-500 dark:text-slate-400">
                  <div className="text-center">
                    <Box className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No data available</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Summary Totals Table - Server Management Style */}
      {!loading && summaryData && (
        <div className="w-full mb-8">
          <div className="relative border border-gray-200 dark:border-slate-700/30 rounded-2xl p-6 bg-white dark:bg-slate-800/50">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <h3 className="text-xl font-medium text-gray-900 dark:text-slate-100">Daily Receiving Summary</h3>
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  {summaryData.summaryTotals?.dayData?.length || 0} Records
                </div>
              </div>
            </div>

            {summaryData.summaryTotals ? (
              <div>
                {/* Headers */}
                <div className="grid grid-cols-12 gap-4 px-4 py-3 text-sm font-bold uppercase tracking-wider bg-white/70 dark:bg-slate-900/60 backdrop-blur-md backdrop-saturate-150 ring-1 ring-black/5 dark:ring-white/10 border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-white rounded-t-2xl">
                  <div className="col-span-1">No</div>
                  <div className="col-span-3">Date</div>
                  <div className="col-span-2">Received Qty (L)</div>
                  <div className="col-span-2">Total CBM</div>
                  <div className="col-span-2">EDEL Received Qty (L)</div>
                  <div className="col-span-2">EDEL CBM</div>
                </div>

                {/* Scrollable Data Rows - Max ~5 visible */}
                <motion.div
                  className="space-y-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent"
                  variants={{
                    visible: {
                      transition: {
                        staggerChildren: 0.08,
                        delayChildren: 0.1,
                      },
                    },
                  }}
                  initial="hidden"
                  animate="visible"
                >
                  {/* Data Rows */}
                  {summaryData.summaryTotals.dayData && summaryData.summaryTotals.dayData.length > 0 ? (
                    summaryData.summaryTotals.dayData.map((day, index) => (
                      <motion.div
                        key={day.date}
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
                          className="relative bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600/50 rounded-xl p-4 overflow-hidden"
                          whileHover={{
                            y: -1,
                            transition: { type: "spring", stiffness: 400, damping: 25 }
                          }}
                        >
                          {/* Status gradient overlay */}
                          <div
                            className="absolute inset-0 bg-gradient-to-l from-green-500/10 to-transparent pointer-events-none"
                            style={{
                              backgroundSize: "30% 100%",
                              backgroundPosition: "right",
                              backgroundRepeat: "no-repeat"
                            }}
                          />

                          {/* Grid Content */}
                          <div className="relative grid grid-cols-12 gap-4 items-center">
                            {/* Number */}
                            <div className="col-span-1">
                              <span className="text-2xl font-bold text-gray-400 dark:text-slate-500">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                            </div>

                            {/* Date */}
                            <div className="col-span-3 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brandRed to-red-600 flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                                <ArrowDownToLine className="w-4 h-4 text-white" />
                              </div>
                              <span className="text-gray-900 dark:text-slate-200 font-medium">
                                {day.label}
                              </span>
                            </div>

                            {/* Received Qty */}
                            <div className="col-span-2 flex justify-center">
                              <div
                                className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center cursor-help"
                                title={`Full Value: ${formatNumber(day.receivedQty, 0)}`}
                              >
                                <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                                  {formatQuantitySmartKL(day.receivedQty, 2)}
                                </span>
                              </div>
                            </div>

                            {/* Total CBM */}
                            <div className="col-span-2">
                              <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                                <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                                  {formatNumber(day.totalCbm, 2)} CBM
                                </span>
                              </div>
                            </div>

                            {/* EDEL Received Qty */}
                            <div className="col-span-2 flex justify-center">
                              <div
                                className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center cursor-help"
                                title={`Full Value: ${formatNumber(day.edelReceivedQty, 0)}`}
                              >
                                <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">
                                  {formatQuantityInLakhs(day.edelReceivedQty, 2)}
                                </span>
                              </div>
                            </div>

                            {/* EDEL CBM */}
                            <div className="col-span-2 flex justify-center">
                              <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                                <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">
                                  {formatNumber(day.edelTotalCbm, 2)} CBM
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    ))
                  ) : null}
                </motion.div>

                {/* Total Row - Always show when data exists */}
                {summaryData.summaryTotals.dayData && summaryData.summaryTotals.dayData.length > 0 && (
                  <div className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-slate-600">
                    <div className="relative bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl p-4 overflow-hidden">
                      {/* Decorative gradient overlay */}
                      <div
                        className="absolute inset-0 bg-gradient-to-l from-amber-500/10 to-transparent pointer-events-none"
                        style={{
                          backgroundSize: "40% 100%",
                          backgroundPosition: "right",
                          backgroundRepeat: "no-repeat"
                        }}
                      />

                      {/* Grid Content */}
                      <div className="relative grid grid-cols-12 gap-4 items-center">
                        {/* Icon */}
                        <div className="col-span-1">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-white" />
                          </div>
                        </div>

                        {/* Total Label */}
                        <div className="col-span-3 flex items-center">
                          <span className="text-lg font-bold text-gray-900 dark:text-slate-100">
                            Total
                          </span>
                        </div>

                        {/* Total Received Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div
                            className="px-4 py-2 rounded-lg bg-blue-500/20 border-2 border-blue-500/50 inline-flex items-center justify-center cursor-help"
                            title={`Full Value: ${formatNumber(summaryData.summaryTotals.totalReceivedQty, 0)}`}
                          >
                            <span className="text-blue-700 dark:text-blue-300 text-base font-bold">
                              {formatQuantitySmartKL(summaryData.summaryTotals.totalReceivedQty, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Total CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                            <span className="text-green-700 dark:text-green-300 text-sm font-bold">
                              {formatNumber(summaryData.summaryTotals.totalCbm, 2)} CBM
                            </span>
                          </div>
                        </div>

                        {/* Total EDEL Received Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div
                            className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center cursor-help"
                            title={`Full Value: ${formatNumber(summaryData.summaryTotals.totalEdelReceivedQty, 0)}`}
                          >
                            <span className="text-purple-700 dark:text-purple-300 text-sm font-bold">
                              {formatQuantityInLakhs(summaryData.summaryTotals.totalEdelReceivedQty, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Total EDEL CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                            <span className="text-purple-700 dark:text-purple-300 text-sm font-bold">
                              {formatNumber(summaryData.summaryTotals.totalEdelTotalCbm, 2)} CBM
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400">
                <p>No summary data available</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
