'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { MetricCard } from '@/components/ui/metric-card';
import { Boxes, Package, Box, ChevronDown, Check, Calendar, ArrowRightLeft, Search, RefreshCw, TrendingUp } from 'lucide-react';
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

interface InventoryCardMetrics {
  inboundSkuCount: number;
  inventoryQtyTotal: number;
  totalCbm: number;
}

interface InventoryFilters {
  availableItemGroups: string[];
  availableDateRange: {
    minDate: string | null;
    maxDate: string | null;
  };
  availableProductCategories?: string[];
}

interface InventoryTimeSeriesPoint {
  date: string;
  label: string;
  inventoryQty: number;
  edelInventoryQty: number;
  totalCbm: number;
  edelTotalCbm: number;
}

interface InventoryTimeSeriesData {
  points: InventoryTimeSeriesPoint[];
}

interface InventorySummaryResponse {
  cards: InventoryCardMetrics;
  filters: InventoryFilters;
  timeSeries: InventoryTimeSeriesData;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

function InventoryPageContent() {
  const searchParams = useSearchParams();
  const uploadIdParam = searchParams.get('uploadId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InventorySummaryResponse | null>(null);

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedItemGroup, setSelectedItemGroup] = useState('ALL');
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');

  useEffect(() => {
    fetchSummary();
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

  const fetchSummary = async (useFilters = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      // Use uploadId from URL if available
      if (uploadIdParam) {
        params.append('uploadId', uploadIdParam);
      }

      if (useFilters) {
        if (selectedMonth && selectedMonth !== 'ALL') {
          // Parse month and set date range
          const [year, month] = selectedMonth.split('-').map(Number);
          if (year && month) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            params.append('fromDate', startDate.toISOString().split('T')[0]);
            params.append('toDate', endDate.toISOString().split('T')[0]);
          }
        } else {
          if (fromDate) params.append('fromDate', fromDate);
          if (toDate) params.append('toDate', toDate);
        }
        if (selectedItemGroup && selectedItemGroup !== 'ALL') {
          params.append('itemGroup', selectedItemGroup);
        }
        if (selectedProductCategories.length > 0) {
          selectedProductCategories.forEach(cat => params.append('productCategory', cat));
        }
      }

      const response = await fetch(`${BACKEND_URL}/inventory/summary?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No inventory data available. Please upload a Daily Stock Analytics Excel file first.');
        }
        throw new Error('Failed to fetch inventory data from backend');
      }

      const result: InventorySummaryResponse = await response.json();
      setData(result);
      setChartData(result.timeSeries);

      // Set initial date range from available dates if not already set
      if (!useFilters && result.filters.availableDateRange) {
        if (result.filters.availableDateRange.minDate && !fromDate) {
          setFromDate(result.filters.availableDateRange.minDate);
        }
        if (result.filters.availableDateRange.maxDate && !toDate) {
          setToDate(result.filters.availableDateRange.maxDate);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching inventory data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchSummary(true);
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
    const allCategories = (data?.filters.availableProductCategories || []).filter(c => c !== 'ALL');
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

  // Generate available months from date range
  const getAvailableMonths = (): string[] => {
    if (!data?.filters.availableDateRange?.minDate || !data?.filters.availableDateRange?.maxDate) {
      return ['ALL'];
    }
    
    const months: string[] = ['ALL'];
    const start = new Date(data.filters.availableDateRange.minDate);
    const end = new Date(data.filters.availableDateRange.maxDate);
    
    const current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`;
      
      if (!months.includes(monthKey)) {
        months.push(monthKey);
      }
      
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
  };

  const [chartData, setChartData] = useState<InventoryTimeSeriesData | null>(null);

  // Helper function to format numbers
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

    // For large numbers, use thousand separators
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    } else {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  const formatInLakhs = (num: number | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null) return '0';
    const value = Number(num);
    if (isNaN(value)) return '0';
    const lakhs = value / 100000;
    return lakhs.toFixed(decimals);
  };

  const QtyLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">Inventory Qty</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-red-500 to-red-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">EDEL Inventory Qty</span>
      </div>
    </div>
  );

  const CbmLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200/50 dark:border-amber-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-amber-500 to-amber-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">Total CBM</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200/50 dark:border-indigo-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">EDEL CBM</span>
      </div>
    </div>
  );

  const getISOWeek = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const getDisplayPoints = (): InventoryTimeSeriesPoint[] => {
    if (!chartData || !chartData.points) return [];
    const points = chartData.points;

    if (timeGranularity === 'day') {
      return points;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const groups: Record<string, InventoryTimeSeriesPoint> = {};

    for (const p of points) {
      const d = new Date(p.date);
      let key: string;
      let label: string;

      if (timeGranularity === 'month') {
        const year = d.getFullYear();
        const month = d.getMonth();
        key = `${year}-${String(month + 1).padStart(2, '0')}`;
        label = `${monthNames[month]}'${String(year).slice(2)}`;
      } else {
        // week
        const year = d.getFullYear();
        const week = getISOWeek(d);
        key = `${year}-W${String(week).padStart(2, '0')}`;
        label = `W${String(week).padStart(2, '0')}'${String(year).slice(2)}`;
      }

      if (!groups[key]) {
        groups[key] = {
          date: key,
          label,
          inventoryQty: 0,
          edelInventoryQty: 0,
          totalCbm: 0,
          edelTotalCbm: 0,
        };
      }

      groups[key].inventoryQty += p.inventoryQty;
      groups[key].edelInventoryQty += p.edelInventoryQty;
      groups[key].totalCbm += p.totalCbm;
      groups[key].edelTotalCbm += p.edelTotalCbm;
    }

    return Object.keys(groups)
      .sort()
      .map((k) => groups[k]);
  };

  // Empty state / error state
  if (!loading && error) {
    return (
      <div>
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-8 text-center">
          <Boxes className="w-16 h-16 text-yellow-600 dark:text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200 mb-2">No Inventory Data Available</h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">{error}</p>
          <a
            href="/upload"
            className="inline-block px-6 py-3 bg-brandRed hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Go to Upload Page
          </a>
        </div>
      </div>
    );
  }

  const displayPoints = getDisplayPoints();

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
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end" suppressHydrationWarning={true}>
          {/* Date Range - Unified Control */}
          <div className="md:col-span-3 space-y-2">
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
                  min={data?.filters.availableDateRange?.minDate || ''}
                  max={data?.filters.availableDateRange?.maxDate || ''}
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
                  min={data?.filters.availableDateRange?.minDate || ''}
                  max={data?.filters.availableDateRange?.maxDate || ''}
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
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    if (e.target.value !== 'ALL') {
                      const [year, month] = e.target.value.split('-').map(Number);
                      if (year && month) {
                        const startDate = new Date(year, month - 1, 1);
                        const endDate = new Date(year, month, 0, 23, 59, 59);
                        setFromDate(startDate.toISOString().split('T')[0]);
                        setToDate(endDate.toISOString().split('T')[0]);
                      }
                    }
                  }}
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white outline-none appearance-none transition-all cursor-pointer"
                  suppressHydrationWarning={true}
                >
                  {getAvailableMonths().map((month) => {
                    if (month === 'ALL') {
                      return <option key={month} value={month}>All Months</option>;
                    }
                    const [year, monthNum] = month.split('-');
                    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
                    const monthName = date.toLocaleString('default', { month: 'short' });
                    return <option key={month} value={month}>{monthName} {year}</option>;
                  })}
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
                  {(data?.filters.availableProductCategories || []).filter(c => c !== 'ALL').map((category) => (
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
          <div className="md:col-span-3 flex gap-2 items-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleFilter}
              disabled={loading}
              className="flex-1 h-[32px] bg-gradient-to-r from-brandRed to-red-600 text-white rounded-lg text-[11px] font-bold tracking-wide shadow-md shadow-brandRed/20 flex items-center justify-center gap-1 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-brandRed/30"
              suppressHydrationWarning={true}
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Search className="w-3 h-3 stroke-[2.5]" />
                  <span>Apply Filter</span>
                </>
              )}
            </motion.button>
            {(fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0) && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSelectedMonth('ALL');
                  setSelectedProductCategories([]);
                  fetchSummary(false);
                }}
                className="h-[32px] px-2.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-slate-300 rounded-lg text-[11px] font-semibold transition-all hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 shadow-sm flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3 h-3 transition-transform group-hover:rotate-180" />
                <span>Reset</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Date range info - Bottom Right */}
        {data?.filters.availableDateRange && (
          <div className="flex justify-end mt-3">
            <p className="text-xs text-gray-500 dark:text-slate-500">
              Data available: {data.filters.availableDateRange.minDate || 'N/A'} to {data.filters.availableDateRange.maxDate || 'N/A'}
            </p>
          </div>
        )}
      </motion.div>

      {/* Metrics Card - Consolidated Premium Design */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-2xl p-6 animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 bg-gray-100 dark:bg-slate-700/50 rounded-xl">
                  <div className="h-4 bg-gray-200 dark:bg-slate-600 rounded w-1/2 mb-3"></div>
                  <div className="h-8 bg-gray-200 dark:bg-slate-600 rounded w-3/4"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden mb-8"
        >
          {/* Decorative gradient */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Inventory Overview</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">Current stock metrics</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Inbound SKU */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Inbound SKU</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Unique SKUs with CBM &gt; 0</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {formatNumber(data?.cards.inboundSkuCount)}
              </span>
            </div>
            
            {/* Inventory QTY */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Inventory QTY</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Total stock quantity</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                {formatInLakhs(data?.cards.inventoryQtyTotal)} L
              </span>
            </div>
            
            {/* Total CBM */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-purple-50/80 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                  <Box className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Total CBM</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Cubic meter volume</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {(data?.cards.totalCbm ? (data.cards.totalCbm / 1000).toFixed(2) : '0.00')} K
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Time Series Charts - Premium Glassmorphism Design */}
      {!loading && data && chartData && chartData.points.length > 0 && displayPoints.length > 0 && (
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
                  onClick={() => setTimeGranularity(granularity)}
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
            {/* Inventory Qty vs EDEL Inventory Qty Chart - Premium Design */}
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
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">Inventory Qty vs EDEL Qty</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Quantity comparison over time (in Lakhs)</p>
                </div>
              </div>
              <div className="relative z-10">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={displayPoints} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
                    <defs>
                      <linearGradient id="inventoryQtyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="edelInventoryQtyGradient" x1="0" y1="0" x2="0" y2="1">
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
                        name === 'edelInventoryQty' ? 'EDEL Inventory Qty' : 'Inventory Qty',
                      ]}
                      cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      content={<QtyLegend />}
                      wrapperStyle={{ paddingBottom: '20px' }}
                    />
                    <Bar dataKey="inventoryQty" fill="url(#inventoryQtyGradient)" radius={[8, 8, 0, 0]} name="Inventory Qty">
                      <LabelList
                        dataKey="inventoryQty"
                        position="top"
                        formatter={(value: any) => formatInLakhs(value)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar dataKey="edelInventoryQty" fill="url(#edelInventoryQtyGradient)" radius={[8, 8, 0, 0]} name="EDEL Inventory Qty">
                      <LabelList
                        dataKey="edelInventoryQty"
                        position="top"
                        formatter={(value: any) => formatInLakhs(value)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Total CBM vs EDEL CBM Chart - Premium Design */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              {/* Decorative gradient blob */}
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
              
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">Total CBM vs EDEL CBM</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Volume comparison over time</p>
                </div>
              </div>
              <div className="relative z-10">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={displayPoints} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
                    <defs>
                      <linearGradient id="totalCbmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#d97706" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="edelCbmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.7} />
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
                        formatNumber(value, 2),
                        name === 'edelTotalCbm' ? 'EDEL CBM' : 'Total CBM',
                      ]}
                      cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      content={<CbmLegend />}
                      wrapperStyle={{ paddingBottom: '20px' }}
                    />
                    <Bar dataKey="totalCbm" fill="url(#totalCbmGradient)" radius={[8, 8, 0, 0]} name="Total CBM">
                      <LabelList
                        dataKey="totalCbm"
                        position="top"
                        formatter={(value: any) => formatNumber(value, 2)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar dataKey="edelTotalCbm" fill="url(#edelCbmGradient)" radius={[8, 8, 0, 0]} name="EDEL CBM">
                      <LabelList
                        dataKey="edelTotalCbm"
                        position="top"
                        formatter={(value: any) => formatNumber(value, 2)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}

    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
      <InventoryPageContent />
    </Suspense>
  );
}
