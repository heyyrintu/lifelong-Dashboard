'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { authenticatedFetch } from '@/lib/api';
import { useDateFilter } from '@/lib/date-filter-context';
import { motion, AnimatePresence } from 'framer-motion';
import { formatHeaderDateShort } from '@/lib/utils';
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



export default function InboundPage() {
  const [summaryData, setSummaryData] = useState<InboundSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Use shared filter context
  const { 
    fromDate, 
    toDate, 
    selectedMonth, 
    selectedProductCategories,
    setFromDate,
    setToDate,
    setSelectedMonth,
    setMonthWithDates,
    setSelectedProductCategories,
    resetFilters
  } = useDateFilter();
  
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [chartData, setChartData] = useState<TimeSeriesData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  const formatToDDMMYYYY = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) return dateStr;
    // Parse as UTC to avoid timezone issues
    const isoStr = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
  };

  const formatDateUTC = (date: Date): string => {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Helper function to check if date range matches a specific month
  const getMonthFromDateRange = (from: string, to: string): string | null => {
    if (!from || !to) return null;

    try {
      const fromDateParsed = new Date(from);
      const toDateParsed = new Date(to);

      // Check if both dates are in the same month and year
      if (fromDateParsed.getFullYear() === toDateParsed.getFullYear() &&
        fromDateParsed.getMonth() === toDateParsed.getMonth()) {

        // Check if fromDateParsed is the 1st of the month
        const isFirstDay = fromDateParsed.getDate() === 1;

        // Check if toDateParsed is the last day of the month
        const lastDay = new Date(toDateParsed.getFullYear(), toDateParsed.getMonth() + 1, 0).getDate();
        const isLastDay = toDateParsed.getDate() === lastDay;

        if (isFirstDay && isLastDay) {
          const year = fromDateParsed.getFullYear();
          const month = String(fromDateParsed.getMonth() + 1).padStart(2, '0');
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

        // First fetch without date filters to get available date range
        const unfilteredResponse = await authenticatedFetch('/inbound/summary');
        
        if (!unfilteredResponse.ok) {
          if (unfilteredResponse.status === 404) {
            setSummaryData(null);
            setChartData(null);
            return;
          }
          throw new Error('Failed to fetch data');
        }

        const unfilteredResult: InboundSummaryResponse = await unfilteredResponse.json();
        
        // Check if current month has data
        const availableMaxDate = unfilteredResult.availableDates?.maxDate;
        const availableMinDate = unfilteredResult.availableDates?.minDate;
        
        if (availableMaxDate && availableMinDate) {
          const maxDate = new Date(availableMaxDate);
          const minDateObj = new Date(availableMinDate);
          
          // Get current month boundaries
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;
          const currentMonthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
          const currentMonthEnd = new Date(Date.UTC(currentYear, currentMonth, 0));
          
          // If current month is outside available data range, use latest available month
          if (currentMonthStart > maxDate || currentMonthEnd < minDateObj) {
            const maxYear = maxDate.getUTCFullYear();
            const maxMonthNum = maxDate.getUTCMonth() + 1;
            const latestAvailableMonth = `${maxYear}-${String(maxMonthNum).padStart(2, '0')}`;
            
            // Update the selected month to the latest available month
            setMonthWithDates(latestAvailableMonth);
            
            // Fetch with the latest available month filter
            const startDate = new Date(Date.UTC(maxYear, maxMonthNum - 1, 1));
            const endDate = new Date(Date.UTC(maxYear, maxMonthNum, 0));
            const params = new URLSearchParams();
            params.append('fromDate', startDate.toISOString().split('T')[0]);
            params.append('toDate', endDate.toISOString().split('T')[0]);
            params.append('timeGranularity', timeGranularity);
            
            const filteredResponse = await authenticatedFetch(`/inbound/summary?${params.toString()}`);
            
            if (filteredResponse.ok) {
              const filteredResult: InboundSummaryResponse = await filteredResponse.json();
              setSummaryData(filteredResult);
              setChartData(unfilteredResult.timeSeries); // Use unfiltered for chart
            } else {
              setSummaryData(unfilteredResult);
              setChartData(unfilteredResult.timeSeries);
            }
          } else {
            // Current month is within range, use original flow
            const params = new URLSearchParams();
            params.append('timeGranularity', timeGranularity);

            if (selectedMonth && selectedMonth !== 'ALL') {
              const [year, month] = selectedMonth.split('-').map(Number);
              if (year && month) {
                const startDate = new Date(Date.UTC(year, month - 1, 1));
                const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
                params.append('fromDate', startDate.toISOString().split('T')[0]);
                params.append('toDate', endDate.toISOString().split('T')[0]);
              }
            }

            const response = await authenticatedFetch(`/inbound/summary?${params.toString()}`);

            if (response.ok) {
              const result: InboundSummaryResponse = await response.json();
              setSummaryData(result);
              setChartData(result.timeSeries);
            }
          }
        } else {
          // No date range info, use unfiltered data
          setSummaryData(unfilteredResult);
          setChartData(unfilteredResult.timeSeries);
        }
      } catch (err: any) {
        console.error('Initial data fetch error:', err.message);
        setSummaryData(null);
        setChartData(null);
      } finally {
        setLoading(false);
        setChartLoading(false);
      }
    };

    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch (err: any) {
      console.error('Chart data fetch error:', err.message);
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
    resetFilters();
    fetchSummary();
    // Refresh chart data with current granularity (will show all data for month, filtered for week/day)
    fetchChartData(timeGranularity);
  };

  const toggleProductCategory = (category: string) => {
    setSelectedProductCategories(
      selectedProductCategories.includes(category)
        ? selectedProductCategories.filter(c => c !== category)
        : [...selectedProductCategories, category]
    );
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

  const handleChartClick = (data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;

    // Per user request: exclude month granularity clicking
    if (timeGranularity === 'month') return;

    const payload = data.activePayload[0].payload;
    if (payload.startDate && payload.endDate) {
      setFromDate(payload.startDate);
      setToDate(payload.endDate);
      setSelectedMonth('ALL');
      setTimeout(() => {
        fetchSummary(true);
        fetchChartData(timeGranularity);
      }, 0);
    }
  };

  const handleDownloadSummary = async () => {
    try {
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
    }
  };

  const formatNumber = (num: number, decimals: number = 0) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const formatInLakhs = (num: number | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null) return '0';
    const value = Number(num);
    if (isNaN(value)) return '0';
    const lakhs = value / 100000;
    return lakhs.toFixed(decimals);
  };

  // Format quantity in lakhs with 'L' suffix for display
  const formatQuantityInLakhs = (num: number | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null) return '0L';
    const value = Number(num);
    if (isNaN(value)) return '0L';
    const lakhs = value / 100000;
    return `${lakhs.toFixed(decimals)}L`;
  };

  // Format quantity smartly: if < 1L show in K (thousands), if >= 1L show in L (lakhs)
  const formatQuantitySmartKL = (num: number | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null) return '0K';
    const value = Number(num);
    if (isNaN(value)) return '0K';
    const lakhs = value / 100000;

    if (lakhs < 1) {
      // Show in thousands (K)
      const thousands = value / 1000;
      return `${thousands.toFixed(decimals)}K`;
    } else {
      // Show in lakhs (L)
      return `${lakhs.toFixed(decimals)}L`;
    }
  };

  const formatAxisLabel = (label: string) => {
    // Convert labels like "Aug 2025" -> "Aug'25"
    const match = label.match(/^([A-Za-z]{3}) (\d{4})$/);
    if (match) {
      const [, month, year] = match;
      return `${month}'${year.slice(2)}`;
    }
    return label;
  };

  // Format backend month value (e.g. 2025-11) to display label like Nov'25
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


  const QtyLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-redTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandRed shadow-sm" />
        <span className="text-enterprise-text">EDEL Received Qty</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-yellowTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandYellow shadow-sm" />
        <span className="text-enterprise-text">Received Qty</span>
      </div>
    </div>
  );

  const CbmLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-redTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandRed shadow-sm" />
        <span className="text-enterprise-text">EDEL CBM</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-yellowTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandYellow shadow-sm" />
        <span className="text-enterprise-text">Total CBM</span>
      </div>
    </div>
  );

  return (
    <div>

      {/* Date & Category Filters - Premium Redesign */}
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
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);

                    // If in week or day mode, refresh chart data immediately
                    if (timeGranularity !== 'month' && e.target.value && toDate) {
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
                    setToDate(e.target.value);

                    // If in week or day mode, refresh chart data immediately
                    if (timeGranularity !== 'month' && fromDate && e.target.value) {
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
              <Calendar className="w-3.5 h-3.5" /> Select Month
            </label>
            <div className="group relative flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    const newMonth = e.target.value;
                    setMonthWithDates(newMonth);

                    // If in week or day mode, refresh chart data immediately
                    if (timeGranularity !== 'month') {
                      setTimeout(() => fetchChartData(timeGranularity), 0);
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
              whileHover={{ scale: 1.05, translateY: -1 }}
              whileTap={{ scale: 0.95, translateY: 0 }}
              onClick={handleDownloadSummary}
              className="h-[36px] w-[36px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-slate-200 shadow-sm hover:border-brandRed/60 hover:text-brandRed transition-colors"
              aria-label="Download inbound Excel"
              title="Download Excel"
            >
              <Download className="w-4 h-4" />
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
              <span className="font-semibold text-xs">Submit</span>
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

      {/* Metrics Cards - 3-Card Layout matching Outbound */}
      {!loading && summaryData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Invoice Card - Red Accent */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            <div className="flex items-center gap-3 mb-4 pl-2">
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <ArrowDownToLine className="w-5 h-5 text-brandRed" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Invoice</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Order metrics</p>
              </div>
            </div>

            <div className="space-y-2.5 pl-2">
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Package className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Invoice SKU</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {loading ? '-' : formatNumber(summaryData.cards.invoiceSkuCount)}
                </span>
              </motion.div>

              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Invoice Qty</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight" title={`Full Value: ${formatNumber(summaryData.cards.invoiceQtyTotal, 2)}`}>
                  {loading ? '-' : formatQuantityInLakhs(summaryData.cards.invoiceQtyTotal, 2)}
                </span>
              </motion.div>

              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Truck className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Vehicles</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Count</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {loading ? '-' : formatNumber(summaryData.cards.vehicleCount)}
                </span>
              </motion.div>
            </div>
          </motion.div>

          {/* Received Card - Yellow Accent with Progress Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/40 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandYellow/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandYellow via-brandYellow to-brandYellow/70 rounded-l-2xl" />

            <div className="flex items-center gap-3 mb-4 pl-2">
              <motion.div
                whileHover={{ rotate: -5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
              >
                <CheckCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Received</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Delivery metrics</p>
              </div>
            </div>

            <div className="space-y-2.5 pl-2">
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandYellow/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                    <Package className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Received SKU</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                  {loading ? '-' : formatNumber(summaryData.cards.receivedSkuCount)}
                </span>
              </motion.div>

              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandYellow/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Received Qty</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight" title={`Full Value: ${formatNumber(summaryData.cards.receivedQtyTotal, 2)}`}>
                  {loading ? '-' : formatQuantityInLakhs(summaryData.cards.receivedQtyTotal, 2)}
                </span>
              </motion.div>

              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandYellow/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                    <Box className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Good Qty</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Quality Check</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight" title={`Full Value: ${formatNumber(summaryData.cards.goodQtyTotal, 2)}`}>
                  {loading ? '-' : formatQuantityInLakhs(summaryData.cards.goodQtyTotal, 2)}
                </span>
              </motion.div>

              {/* Receipt Progress Bar */}
              <div className="mt-3 pt-3 border-t border-enterprise-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-enterprise-textSecondary uppercase tracking-wider">Receipt Rate</span>
                  <span className="text-sm font-bold text-yellow-700 dark:text-yellow-500">
                    {loading ? '-' : `${((summaryData.cards.receivedQtyTotal || 0) / (summaryData.cards.invoiceQtyTotal || 1) * 100).toFixed(1)}%`}
                  </span>
                </div>
                <div className="h-2 bg-enterprise-border/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((summaryData.cards.receivedQtyTotal || 0) / (summaryData.cards.invoiceQtyTotal || 1) * 100))}%` }}
                    transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-yellow-600 to-amber-600 rounded-full"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Volume Card - Red Theme */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            whileHover={{ scale: 1.01, y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
          >
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            <div className="flex items-center gap-3 mb-4 pl-2">
              <motion.div
                whileHover={{ rotate: 10, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <Clock className="w-5 h-5 text-brandRed" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Volume</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">CBM metrics</p>
              </div>
            </div>

            <div className="space-y-2.5 pl-2">
              <motion.div
                whileHover={{ x: 2 }}
                className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                    <Box className="w-4 h-4 text-brandRed" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Total CBM</span>
                    <p className="text-xs text-enterprise-textSecondary/60 font-medium">Volume</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                  {loading ? '-' : formatNumber(summaryData.cards.totalCbm, 2)}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Product Category Table - Premium Design matching Outbound */}
      {!loading && summaryData && summaryData.categoryTable && summaryData.categoryTable.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          whileHover={{ y: -2 }}
          className="w-full mb-8"
        >
          <div className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/20 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ rotate: 5, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
                >
                  <Package className="w-5 h-5 text-brandRed" />
                </motion.div>
                <div>
                  <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Category Wise Inbound</h3>
                  <p className="text-xs text-enterprise-textSecondary font-medium">Category distribution breakdown</p>
                </div>
              </div>
            </div>

            <motion.div
              className="space-y-1.5 pl-2"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: 0.05,
                    delayChildren: 0.1,
                  }
                }
              }}
              initial="hidden"
              animate="visible"
            >
              {/* Headers */}
              <div className="grid grid-cols-12 gap-3 px-3 py-2.5 mb-2 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 text-sm font-bold uppercase tracking-widest text-enterprise-textSecondary">
                <div className="col-span-1 text-left">No</div>
                <div className="col-span-5 text-left">Category</div>
                <div className="col-span-2 text-center">SKU Count</div>
                <div className="col-span-2 text-center">Received Qty</div>
                <div className="col-span-2 text-center">Total CBM</div>
              </div>

              {/* Data Rows */}
              {summaryData.categoryTable.map((row, index) => (
                <motion.div
                  key={row.category}
                  variants={{
                    hidden: {
                      opacity: 0,
                      x: -15,
                      scale: 0.98,
                    },
                    visible: {
                      opacity: 1,
                      x: 0,
                      scale: 1,
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
                    className="relative bg-gradient-to-r from-white to-white/80 border border-enterprise-border/50 hover:border-brandYellow/30 rounded-lg p-3 overflow-hidden transition-all duration-200"
                    whileHover={{
                      x: 2,
                      transition: { type: "spring", stiffness: 400, damping: 25 }
                    }}
                  >
                    {/* Grid Content */}
                    <div className="relative grid grid-cols-12 gap-3 items-center">
                      {/* Number */}
                      <div className="col-span-1 flex items-center">
                        <div className="w-7 h-7 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                          <span className="text-brandRed text-xs font-bold">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>
                      </div>

                      {/* Category */}
                      <div className="col-span-5 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                          <Package className="w-3.5 h-3.5 text-brandRed" />
                        </div>
                        <span className="text-enterprise-text font-medium text-base">
                          {formatProductCategory(row.category)}
                        </span>
                      </div>

                      {/* SKU Count */}
                      <div className="col-span-2 flex justify-center">
                        <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-enterprise-redTint/50 border border-enterprise-border/50">
                          <span className="font-medium font-mono text-brandRed text-base">
                            {formatNumber(row.skuCount, 0)}
                          </span>
                        </div>
                      </div>

                      {/* Received Qty */}
                      <div className="col-span-2 flex justify-center">
                        <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-enterprise-yellowTint/50 border border-enterprise-border/50">
                          <span className="font-medium font-mono text-amber-600 dark:text-amber-500 text-base" title={`Full Value: ${formatNumber(row.receivedQty, 0)}`}>
                            {formatNumber(row.receivedQty, 0)}
                          </span>
                        </div>
                      </div>

                      {/* Total CBM */}
                      <div className="col-span-2 flex justify-center">
                        <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-enterprise-redTint/50 border border-enterprise-border/50">
                          <span className="font-medium font-mono text-brandRed text-base">
                            {formatNumber(row.totalCbm, 2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              ))}

              {/* Total Row */}
              <motion.div
                variants={{
                  hidden: {
                    opacity: 0,
                    x: -15,
                    scale: 0.98,
                  },
                  visible: {
                    opacity: 1,
                    x: 0,
                    scale: 1,
                    transition: {
                      type: "spring",
                      stiffness: 400,
                      damping: 28,
                      mass: 0.6,
                    },
                  },
                }}
                className="relative mt-3"
              >
                <motion.div
                  className="relative bg-gradient-to-r from-enterprise-redTint via-enterprise-redTint/80 to-enterprise-redTint/50 border-2 border-brandRed/40 shadow-lg shadow-brandRed/10 rounded-lg p-3 overflow-hidden transition-all duration-200"
                  whileHover={{
                    x: 2,
                    transition: { type: "spring", stiffness: 400, damping: 25 }
                  }}
                >
                  {/* Grid Content */}
                  <div className="relative grid grid-cols-12 gap-3 items-center text-base font-bold">
                    {/* Icon */}
                    <div className="col-span-1 flex items-center">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brandRed to-brandRed/70 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">Σ</span>
                      </div>
                    </div>

                    {/* Total Label */}
                    <div className="col-span-5 flex items-center gap-2">
                      <span className="text-brandRed font-bold text-base">
                        TOTAL
                      </span>
                    </div>

                    {/* Total SKU Count */}
                    <div className="col-span-2 flex justify-center">
                      <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-brandRed/20 border border-brandRed/40">
                        <span className="text-brandRed text-base font-bold font-mono">
                          {formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.skuCount, 0), 0)}
                        </span>
                      </div>
                    </div>

                    {/* Total Received Qty */}
                    <div className="col-span-2 flex justify-center">
                      <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-brandYellow/20 border border-brandYellow/40">
                        <span className="text-yellow-700 dark:text-yellow-500 text-base font-bold font-mono" title={`Full Value: ${formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.receivedQty, 0), 0)}`}>
                          {formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.receivedQty, 0), 0)}
                        </span>
                      </div>
                    </div>

                    {/* Total CBM */}
                    <div className="col-span-2 flex justify-center">
                      <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-brandRed/20 border border-brandRed/40">
                        <span className="text-brandRed text-base font-bold font-mono">
                          {formatNumber(summaryData.categoryTable.reduce((sum, row) => sum + row.totalCbm, 0), 2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Time Series Charts - Premium Design matching Outbound */}
      {!loading && summaryData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          {/* View by toggle */}
          <div className="flex justify-end mb-6">
            <div className="inline-flex bg-white rounded-lg p-1 border border-enterprise-border shadow-sm">
              <button
                onClick={() => handleTimeGranularityChange('month')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${timeGranularity === 'month'
                  ? 'bg-brandRed text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                Month
              </button>
              <button
                onClick={() => handleTimeGranularityChange('week')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${timeGranularity === 'week'
                  ? 'bg-brandRed text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                Week
              </button>
              <button
                onClick={() => handleTimeGranularityChange('day')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${timeGranularity === 'day'
                  ? 'bg-brandRed text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
              >
                Day
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Received Qty vs EDEL Qty Chart */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandYellow/10 transition-all duration-300 border border-enterprise-border overflow-hidden"
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-500 via-amber-500 to-amber-500/70 rounded-l-2xl" />

              <div className="flex items-center justify-between mb-4 pl-2">
                <div className="flex items-center gap-2">
                  <motion.div
                    whileHover={{ rotate: 5, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="p-2 bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 rounded-lg shadow-sm"
                  >
                    <CheckCircle className="w-5 h-5 text-amber-500" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Received Qty vs EDEL Qty</h3>
                    <p className="text-xs text-enterprise-textSecondary font-medium">Quantity comparison</p>
                  </div>
                </div>
              </div>
              {chartLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-amber-500 border-t-transparent"></div>
                </div>
              ) : chartData?.points && chartData.points.length > 0 ? (
                <div className="relative z-10">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={chartData.points}
                      margin={{ top: 20, right: 20, bottom: 10, left: 0 }}
                      onClick={handleChartClick}
                    >
                      <defs>
                        <linearGradient id="edelQtyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#DE1C1C" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#B91C1C" stopOpacity={0.7} />
                        </linearGradient>
                        <linearGradient id="receivedQtyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FEA418" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.7} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={formatAxisLabel}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                        formatter={(value: number, name: string) => [
                          `${formatInLakhs(value)}L (${formatNumber(value, 0)})`,
                          name === 'edelReceivedQty' ? 'EDEL Received Qty' : 'Received Qty'
                        ]}
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
                        radius={[6, 6, 0, 0]}
                        name="EDEL Received Qty"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        maxBarSize={50}
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
                        radius={[6, 6, 0, 0]}
                        name="Received Qty"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        maxBarSize={50}
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
                <div className="h-80 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm font-medium">No data available</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* EDEL vs Total CBM Chart */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 border border-enterprise-border overflow-hidden"
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

              <div className="flex items-center justify-between mb-4 pl-2">
                <div className="flex items-center gap-2">
                  <motion.div
                    whileHover={{ rotate: 5, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                    className="p-2 bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 rounded-lg shadow-sm"
                  >
                    <Box className="w-5 h-5 text-brandRed" />
                  </motion.div>
                  <div>
                    <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">EDEL vs Total CBM</h3>
                    <p className="text-xs text-enterprise-textSecondary font-medium">Volume comparison</p>
                  </div>
                </div>
              </div>
              {chartLoading ? (
                <div className="h-80 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-brandRed border-t-transparent"></div>
                </div>
              ) : chartData?.points && chartData.points.length > 0 ? (
                <div className="relative z-10">
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={chartData.points}
                      margin={{ top: 20, right: 20, bottom: 10, left: 0 }}
                      onClick={handleChartClick}
                    >
                      <defs>
                        <linearGradient id="edelCbmGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#DE1C1C" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#B91C1C" stopOpacity={0.7} />
                        </linearGradient>
                        <linearGradient id="totalCbmGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FEA418" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.7} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickFormatter={formatAxisLabel}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                        formatter={(value: number, name: string) => [
                          formatNumber(value, 2),
                          name === 'edelTotalCbm' ? 'EDEL CBM' : 'Total CBM'
                        ]}
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
                        radius={[6, 6, 0, 0]}
                        name="EDEL CBM"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        maxBarSize={50}
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
                        radius={[6, 6, 0, 0]}
                        name="Total CBM"
                        cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                        maxBarSize={50}
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
                <div className="h-80 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Box className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm font-medium">No data available</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Summary Totals Table - Premium Design matching Outbound */}
      {!loading && summaryData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          whileHover={{ y: -2 }}
          className="w-full mb-8"
        >
          <div className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/20 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            {/* Header */}
            <div className="flex items-center justify-between mb-4 pl-2">
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ rotate: 5, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
                >
                  <ArrowDownToLine className="w-5 h-5 text-brandRed" />
                </motion.div>
                <div>
                  <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Daily Receiving Summary</h3>
                  <p className="text-xs text-enterprise-textSecondary font-medium">Day-wise inbound breakdown</p>
                </div>
              </div>
            </div>

            {summaryData.summaryTotals ? (
              <div>
                {/* Headers */}
                <div className="grid grid-cols-12 gap-3 px-3 py-2.5 mb-2 text-sm font-bold uppercase tracking-widest bg-gradient-to-r from-enterprise-redTint/40 to-transparent text-enterprise-textSecondary rounded-lg border border-enterprise-border/50">
                  <div className="col-span-1">No</div>
                  <div className="col-span-3">Date</div>
                  <div className="col-span-2 text-center">Received Qty</div>
                  <div className="col-span-2 text-center">Total CBM</div>
                  <div className="col-span-2 text-center">EDEL Received</div>
                  <div className="col-span-2 text-center">EDEL CBM</div>
                </div>

                {/* Scrollable Data Rows */}
                <motion.div
                  className="space-y-1.5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"
                  variants={{
                    visible: {
                      transition: {
                        staggerChildren: 0.05,
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
                            x: -15,
                            scale: 0.98,
                          },
                          visible: {
                            opacity: 1,
                            x: 0,
                            scale: 1,
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
                          className="relative bg-gradient-to-r from-white to-white/80 border border-enterprise-border/50 hover:border-brandYellow/30 rounded-lg p-3 transition-colors duration-200"
                          whileHover={{
                            x: 2,
                            transition: { type: "spring", stiffness: 400, damping: 25 }
                          }}
                        >
                          {/* Grid Content */}
                          <div className="relative grid grid-cols-12 gap-3 items-center">
                            {/* Number */}
                            <div className="col-span-1">
                              <div className="w-7 h-7 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                                <span className="text-brandRed text-xs font-bold">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </div>
                            </div>

                            {/* Date */}
                            <div className="col-span-3 flex items-center gap-2">
                              <span className="text-enterprise-text font-medium text-base">
                                {day.label}
                              </span>
                            </div>

                            {/* Received Qty */}
                            <div className="col-span-2 flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-enterprise-yellowTint/50 border border-enterprise-border/50">
                                <span className="text-amber-600 text-base font-mono font-medium" title={`Full Value: ${formatNumber(day.receivedQty, 0)}`}>
                                  {formatQuantitySmartKL(day.receivedQty, 2)}
                                </span>
                              </div>
                            </div>

                            {/* Total CBM */}
                            <div className="col-span-2 flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-enterprise-redTint/50 border border-enterprise-border/50">
                                <span className="text-brandRed text-base font-mono font-medium">
                                  {formatNumber(day.totalCbm, 2)}
                                </span>
                              </div>
                            </div>

                            {/* EDEL Received Qty */}
                            <div className="col-span-2 flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-blue-50 border border-blue-200/50">
                                <span className="text-blue-600 text-base font-mono font-medium">
                                  {formatQuantityInLakhs(day.edelReceivedQty, 2)}
                                </span>
                              </div>
                            </div>

                            {/* EDEL CBM */}
                            <div className="col-span-2 flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-blue-50 border border-blue-200/50">
                                <span className="text-blue-600 text-base font-mono font-medium">
                                  {formatNumber(day.edelTotalCbm, 2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    ))
                  ) : null}
                </motion.div>

                {/* Total Row */}
                {summaryData.summaryTotals.dayData && summaryData.summaryTotals.dayData.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                    className="mt-3"
                  >
                    <motion.div
                      className="relative bg-gradient-to-r from-enterprise-redTint via-enterprise-redTint/80 to-enterprise-redTint/50 border-2 border-brandRed/40 shadow-lg shadow-brandRed/10 rounded-lg p-3 overflow-hidden"
                      whileHover={{
                        x: 2,
                        transition: { type: "spring", stiffness: 400, damping: 25 }
                      }}
                    >
                      <div className="relative grid grid-cols-12 gap-3 items-center text-base font-bold">
                        {/* Icon */}
                        <div className="col-span-1">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brandRed to-brandRed/70 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">Σ</span>
                          </div>
                        </div>

                        {/* Total Label */}
                        <div className="col-span-3 flex items-center">
                          <span className="text-brandRed font-bold text-base">
                            TOTAL
                          </span>
                        </div>

                        {/* Total Received Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-brandYellow/20 border border-brandYellow/40">
                            <span className="text-yellow-700 dark:text-yellow-500 text-base font-bold font-mono" title={`Full Value: ${formatNumber(summaryData.summaryTotals.totalReceivedQty, 0)}`}>
                              {formatQuantitySmartKL(summaryData.summaryTotals.totalReceivedQty, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Total CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-brandRed/20 border border-brandRed/40">
                            <span className="text-brandRed text-base font-bold font-mono">
                              {formatNumber(summaryData.summaryTotals.totalCbm, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Total EDEL Received Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-blue-100 border border-blue-300">
                            <span className="text-blue-700 text-base font-bold font-mono">
                              {formatQuantityInLakhs(summaryData.summaryTotals.totalEdelReceivedQty, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Total EDEL CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-blue-100 border border-blue-300">
                            <span className="text-blue-700 text-base font-bold font-mono">
                              {formatNumber(summaryData.summaryTotals.totalEdelTotalCbm, 2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-500">
                <p>No summary data available</p>
              </div>
            )}
          </div>
        </motion.div>
      )}

    </div>
  );
}
