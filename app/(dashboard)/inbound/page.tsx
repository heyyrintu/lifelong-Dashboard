'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MetricCard } from '@/components/ui/metric-card';
import { ArrowDownToLine, Package, Clock, TrendingUp, CheckCircle, AlertCircle, Download, ChevronDown, Check, Calendar, ArrowRightLeft, Search, RefreshCw, Box } from 'lucide-react';
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
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

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

  useEffect(() => {
    fetchSummary();
    fetchChartData(timeGranularity);
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

      const response = await fetch(`${BACKEND_URL}/inbound/summary?${params.toString()}`);

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

      const url = `${BACKEND_URL}/inbound/summary${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);

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
  };

  const handleReset = () => {
    setFromDate('');
    setToDate('');
    setSelectedMonth('ALL');
    setSelectedProductCategories([]);
    fetchSummary();
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
    fetchChartData(granularity);
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

      const response = await fetch(`${BACKEND_URL}/inbound/download-summary?${params.toString()}`);

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

  const formatAxisLabel = (label: string) => {
    // Convert labels like "Aug 2025" -> "Aug'25"
    const match = label.match(/^([A-Za-z]{3}) (\d{4})$/);
    if (match) {
      const [, month, year] = match;
      return `${month}'${year.slice(2)}`;
    }
    return label;
  };

  const stats = summaryData ? [
    {
      title: 'Invoice SKU Count',
      value: formatNumber(summaryData.cards.invoiceSkuCount),
      subtitle: 'Unique invoice SKUs',
      icon: ArrowDownToLine,
    },
    {
      title: 'Received SKU Count',
      value: formatNumber(summaryData.cards.receivedSkuCount),
      subtitle: 'Unique received SKUs',
      icon: Package,
    },
    {
      title: 'Invoice Qty',
      value: formatNumber(summaryData.cards.invoiceQtyTotal, 2),
      subtitle: 'Total invoice quantity',
      icon: TrendingUp,
    },
    {
      title: 'Received Qty',
      value: formatNumber(summaryData.cards.receivedQtyTotal, 2),
      subtitle: 'Total received quantity',
      icon: CheckCircle,
    },
    {
      title: 'Good Qty',
      value: formatNumber(summaryData.cards.goodQtyTotal, 2),
      subtitle: 'Total good quantity',
      icon: Package,
    },
    {
      title: 'Total CBM',
      value: formatNumber(summaryData.cards.totalCbm, 2),
      subtitle: 'Cubic meters',
      icon: Clock,
    },
  ] : [];

  const QtyLegend = () => (
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
  );

  const CbmLegend = () => (
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
  );

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

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end" suppressHydrationWarning={true}>
          {/* Date Range - Unified Control */}
          <div className="md:col-span-4 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSelectedMonth('ALL');
                  }}
                  min={summaryData?.availableDates?.minDate || ''}
                  max={summaryData?.availableDates?.maxDate || ''}
                  className="w-full pl-3 pr-2 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer"
                  suppressHydrationWarning={true}
                />
              </div>
              <div className="px-1.5 text-gray-300 dark:text-slate-600">
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
                  min={summaryData?.availableDates?.minDate || ''}
                  max={summaryData?.availableDates?.maxDate || ''}
                  className="w-full pl-2 pr-3 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer text-right"
                  suppressHydrationWarning={true}
                />
              </div>
            </div>
          </div>

          {/* Month Selector */}
          <div className="md:col-span-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Quick Select
            </label>
            <div className="group relative flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white outline-none appearance-none transition-all cursor-pointer"
                  suppressHydrationWarning={true}
                >
                  {(summaryData?.availableMonths || ['ALL']).map((month: string) => (
                    <option key={month} value={month}>
                      {month === 'ALL' ? 'All Months' : month}
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
          <div className="md:col-span-3 space-y-2 relative" ref={categoryDropdownRef}>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
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
                    className="flex-1 px-2 py-1.5 text-xs font-bold text-brandRed hover:bg-brandRed/10 rounded-md transition-colors"
                  >
                    Select All
                  </button>
                  <div className="w-px bg-gray-200 dark:bg-slate-700 mx-0.5"></div>
                  <button
                    type="button"
                    onClick={clearAllCategories}
                    className="flex-1 px-2 py-1.5 text-xs font-bold text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors"
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
          <div className="md:col-span-2 flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98, translateY: 0 }}
              onClick={handleFilter}
              disabled={loading}
              className="flex-1 h-[36px] bg-gradient-to-r from-brandRed to-red-600 text-white rounded-xl text-xs font-bold tracking-wide shadow-lg shadow-brandRed/25 flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-brandRed/40"
              suppressHydrationWarning={true}
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Apply Filter</span>
                </>
              )}
            </motion.button>
            {(fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0) && (
              <motion.button
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98, translateY: 0 }}
                onClick={handleReset}
                className="h-[36px] px-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 shadow-sm flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                <span className="hidden sm:inline">Reset</span>
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

      {/* Inbound Cards */}
      {!loading && summaryData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {stats.map((stat, index) => (
            <MetricCard
              key={index}
              title={stat.title}
              value={stat.value}
              subtitle={stat.subtitle}
              icon={stat.icon}
            />
          ))}
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
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                    timeGranularity === granularity
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
                  <p className="text-xs text-gray-500 dark:text-slate-400">Quantity comparison over time (in Lakhs)</p>
                </div>
              </div>
              {chartLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-brandRed border-t-transparent"></div>
                </div>
              ) : chartData?.points && chartData.points.length > 0 ? (
                <div className="relative z-10">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData.points} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
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
                        tickFormatter={(value: number) => `${formatInLakhs(value)} L`}
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
                          `${formatInLakhs(value)} L`,
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
                      <Bar dataKey="edelReceivedQty" fill="url(#edelQtyGradient)" radius={[8, 8, 0, 0]} name="EDEL Received Qty">
                        <LabelList
                          dataKey="edelReceivedQty"
                          position="top"
                          formatter={(value: any) => formatInLakhs(value)}
                          style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                        />
                      </Bar>
                      <Bar dataKey="receivedQty" fill="url(#receivedQtyGradient)" radius={[8, 8, 0, 0]} name="Received Qty">
                        <LabelList
                          dataKey="receivedQty"
                          position="top"
                          formatter={(value: any) => formatInLakhs(value)}
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
                  <p className="text-xs text-gray-500 dark:text-slate-400">Volume comparison over time</p>
                </div>
              </div>
              {chartLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-brandRed border-t-transparent"></div>
                </div>
              ) : chartData?.points && chartData.points.length > 0 ? (
                <div className="relative z-10">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData.points} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
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
                      <Bar dataKey="edelTotalCbm" fill="url(#edelCbmGradient)" radius={[8, 8, 0, 0]} name="EDEL CBM">
                        <LabelList
                          dataKey="edelTotalCbm"
                          position="top"
                          formatter={(value: any) => formatNumber(value, 2)}
                          style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                        />
                      </Bar>
                      <Bar dataKey="totalCbm" fill="url(#totalCbmGradient)" radius={[8, 8, 0, 0]} name="Total CBM">
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
                  <h3 className="text-xl font-medium text-gray-900 dark:text-slate-100">Summary Totals</h3>
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  {summaryData.summaryTotals?.dayData?.length || 0} Records
                </div>
              </div>
              <button
                onClick={handleDownloadSummary}
                className="flex items-center gap-2 bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download Excel
              </button>
            </div>

            {summaryData.summaryTotals ? (
              <div>
                {/* Headers */}
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  <div className="col-span-1">No</div>
                  <div className="col-span-3">Date</div>
                  <div className="col-span-2">Received Qty</div>
                  <div className="col-span-2">Total CBM</div>
                  <div className="col-span-2">EDEL Received Qty</div>
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
                            <div className="col-span-2">
                              <div className="flex items-center gap-3">
                                <div className="flex gap-1">
                                  {Array.from({ length: 10 }).map((_, i) => (
                                    <div
                                      key={i}
                                      className={`w-1.5 h-5 rounded-full transition-all duration-500 ${i < Math.round((day.receivedQty / Math.max(...summaryData.summaryTotals!.dayData!.map(d => d.receivedQty))) * 10)
                                          ? 'bg-gray-600 dark:bg-slate-300/60'
                                          : 'bg-gray-200 dark:bg-slate-600/40 border border-gray-300 dark:border-slate-500/30'
                                        }`}
                                    />
                                  ))}
                                </div>
                                <span className="text-sm font-mono text-gray-900 dark:text-slate-200 font-medium min-w-[4rem]">
                                  {formatNumber(day.receivedQty)}
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
                              <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                                <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">
                                  {formatNumber(day.edelReceivedQty)}
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
                  ) : (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, x: -25, scale: 0.95, filter: "blur(4px)" },
                        visible: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 400, damping: 28, mass: 0.6 } },
                      }}
                      className="relative"
                    >
                      <div className="relative bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600/50 rounded-xl p-4">
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-1">
                            <span className="text-2xl font-bold text-gray-400 dark:text-slate-500">01</span>
                          </div>
                          <div className="col-span-3">
                            <span className="text-gray-900 dark:text-slate-200 font-medium">Total</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-sm font-mono text-gray-900 dark:text-slate-200 font-medium">
                              {formatNumber(summaryData.summaryTotals.totalReceivedQty)}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                              <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                                {formatNumber(summaryData.summaryTotals.totalCbm, 2)} CBM
                              </span>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <span className="text-sm font-mono text-gray-900 dark:text-slate-200 font-medium">
                              {formatNumber(summaryData.summaryTotals.totalEdelReceivedQty)}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                              <span className="text-purple-600 dark:text-purple-400 text-sm font-medium">
                                {formatNumber(summaryData.summaryTotals.totalEdelTotalCbm, 2)} CBM
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
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
