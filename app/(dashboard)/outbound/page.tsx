'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '@/components/common/PageHeader';
import { MetricCard } from '@/components/ui/metric-card';
import Table from '@/components/common/Table';
import { Package, TrendingUp, Box, ArrowRightLeft, Download, ArrowUpFromLine, ChevronDown, Check, Calendar, Filter, X, RefreshCw, Search, FileText, Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Legend,
  PieChart,
  Pie,
} from 'recharts';

interface CardMetrics {
  soSku: number;
  soQty: number;
  soTotalCbm: number;
  dnSku: number;
  dnQty: number;
  dnTotalCbm: number;
  soMinusDnQty: number;
}

interface CategoryRow {
  categoryLabel: string;
  soCount: number;
  soQty: number;
  soTotalCbm: number;
  dnCount: number;
  dnQty: number;
  dnTotalCbm: number;
  soMinusDnQty: number;
}

interface TimeSeriesPoint {
  key: string;
  label: string;
  soQty: number;
  soTotalCbm: number;
  dnQty: number;
  dnTotalCbm: number;
  startDate: string;
  endDate: string;
}

interface DayData {
  date: string;
  label: string;
  dnQty: number;
  dnCbm: number;
  edelDnQty: number;
  edelDnCbm: number;
}

interface SummaryTotals {
  totalDnQty: number;
  totalDnCbm: number;
  totalEdelDnQty: number;
  totalEdelDnCbm: number;
  dayData?: DayData[];
}

interface TimeSeriesData {
  granularity: 'month' | 'week' | 'day';
  points: TimeSeriesPoint[];
}

interface SummaryResponse {
  cards: CardMetrics;
  categoryTable: CategoryRow[];
  productCategoryTable: CategoryRow[];
  availableMonths: string[];
  productCategories: string[];
  availableWarehouses: string[];
  timeSeries: TimeSeriesData;
  summaryTotals: SummaryTotals;
}

interface UploadInfo {
  uploadId: string;
  fileName: string;
  uploadedAt: string;
  rowsInserted: number;
  status: string;
}

interface TopProduct {
  rank: number;
  deliveryNoteItem: string;
  totalCbm: number;
  totalQty: number;
  productCategory: string;
  percentageOfTotal: number;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export default function OutboundPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [chartData, setChartData] = useState<TimeSeriesData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  // Top Products state
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [topProductsRankBy, setTopProductsRankBy] = useState<'cbm' | 'qty'>('cbm');
  const [topProductsSortOrder, setTopProductsSortOrder] = useState<'top' | 'bottom'>('top');

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

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');

  const productCategoryDonutData = useMemo(
    () => {
      const fixedCategories = [
        'E-Commerce',
        'Offline',
        'Quick-Commerce',
        'EBO',
        'B2C',
        'Others',
      ];

      const cbmByCategory = new Map<string, number>();
      if (data?.categoryTable) {
        for (const category of data.categoryTable) {
          cbmByCategory.set(category.categoryLabel, category.dnTotalCbm ?? 0);
        }
      }

      return fixedCategories.map((name) => ({
        name,
        value: cbmByCategory.get(name) ?? 0,
      }));
    },
    [data?.categoryTable]
  );

  // Combine initial data fetch - avoid duplicate API calls
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setChartLoading(true);
        setTopProductsLoading(true);
        
        const params = new URLSearchParams();
        params.append('timeGranularity', timeGranularity);
        
        const [summaryResponse, topProductsResponse] = await Promise.all([
          fetch(`${BACKEND_URL}/outbound/summary?${params.toString()}`),
          fetch(`${BACKEND_URL}/outbound/top-products?limit=10&rankBy=cbm&sortOrder=top`),
        ]);
        
        if (!summaryResponse.ok) {
          if (summaryResponse.status === 404) {
            throw new Error('No data available. Please upload an Outbound Excel file first.');
          }
          throw new Error('Failed to fetch data from backend');
        }
        
        const result: SummaryResponse = await summaryResponse.json();
        setData(result);
        setChartData(result.timeSeries);

        if (topProductsResponse.ok) {
          const topProductsResult: TopProduct[] = await topProductsResponse.json();
          setTopProducts(topProductsResult);
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching data');
        setData(null);
        setChartData(null);
      } finally {
        setLoading(false);
        setChartLoading(false);
        setTopProductsLoading(false);
      }
    };
    
    fetchInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchChartData = async (granularity: 'month' | 'week' | 'day') => {
    try {
      setChartLoading(true);
      const params = new URLSearchParams();
      // Only send timeGranularity, no filters for chart data
      params.append('timeGranularity', granularity);

      const response = await fetch(`${BACKEND_URL}/outbound/summary?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }

      const result: SummaryResponse = await response.json();
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
      setError(null);

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
        if (selectedWarehouse && selectedWarehouse !== 'ALL') {
          params.append('warehouse', selectedWarehouse);
        }
      }
      // Always send timeGranularity
      params.append('timeGranularity', timeGranularity);

      const response = await fetch(`${BACKEND_URL}/outbound/summary?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No data available. Please upload an Outbound Excel file first.');
        }
        throw new Error('Failed to fetch data from backend');
      }

      const result: SummaryResponse = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummaryWithGranularity = async (granularity: 'month' | 'week' | 'day') => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      // Apply current filters
      if (selectedMonth && selectedMonth !== 'ALL') {
        params.append('month', selectedMonth);
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
      // Use the passed granularity instead of state
      params.append('timeGranularity', granularity);

      const response = await fetch(`${BACKEND_URL}/outbound/summary?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No data available. Please upload an Outbound Excel file first.');
        }
        throw new Error('Failed to fetch data from backend');
      }

      const result: SummaryResponse = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchSummary(true);
    fetchTopProducts(topProductsRankBy, topProductsSortOrder);
  };

  // Fetch top products
  const fetchTopProducts = async (rankBy: 'cbm' | 'qty', sortOrder: 'top' | 'bottom') => {
    try {
      setTopProductsLoading(true);
      const params = new URLSearchParams();
      params.append('limit', '10');
      params.append('rankBy', rankBy);
      params.append('sortOrder', sortOrder);
      
      // Apply current filters
      if (selectedMonth && selectedMonth !== 'ALL') {
        params.append('month', selectedMonth);
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

      const response = await fetch(`${BACKEND_URL}/outbound/top-products?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch top products');
      }
      
      const result: TopProduct[] = await response.json();
      setTopProducts(result);
    } catch (err: any) {
      console.error('Top products fetch error:', err.message);
      setTopProducts([]);
    } finally {
      setTopProductsLoading(false);
    }
  };

  // Handle rank by change
  const handleRankByChange = (rankBy: 'cbm' | 'qty') => {
    setTopProductsRankBy(rankBy);
    fetchTopProducts(rankBy, topProductsSortOrder);
  };

  // Handle sort order change
  const handleSortOrderChange = (sortOrder: 'top' | 'bottom') => {
    setTopProductsSortOrder(sortOrder);
    fetchTopProducts(topProductsRankBy, sortOrder);
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
    const allCategories = (data?.productCategories || []).filter(c => c !== 'ALL');
    setSelectedProductCategories(allCategories);
  };

  const getSelectedCategoriesLabel = () => {
    if (selectedProductCategories.length === 0) return 'All Categories';
    if (selectedProductCategories.length === 1) return formatProductCategory(selectedProductCategories[0]);
    return `${selectedProductCategories.length} selected`;
  };

  const handleTimeGranularityChange = (granularity: 'month' | 'week' | 'day') => {
    setTimeGranularity(granularity);
    // Fetch filtered data with new granularity
    fetchSummaryWithGranularity(granularity);
    // Fetch unfiltered chart data with new granularity
    fetchChartData(granularity);
  };

  const handleDownloadSummary = async () => {
    try {
      // Build query params for current filters
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
      if (selectedWarehouse && selectedWarehouse !== 'ALL') {
        params.append('warehouse', selectedWarehouse);
      }
      params.append('timeGranularity', timeGranularity);

      const response = await fetch(`${BACKEND_URL}/outbound/download-summary?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to download summary');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'outbound-summary.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download summary. Please try again.');
    }
  };

  // Memoized helper functions to avoid recreation on every render
  const formatNumber = useCallback((num: number | string | undefined | null, decimals?: number): string => {
    if (num === undefined || num === null || num === '') return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (decimals !== undefined) return value.toFixed(decimals);
    return Number.isInteger(value) ? value.toString() : value.toFixed(1);
  }, []);

  const formatInLakhs = useCallback((num: number | string | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null || num === '') return '0 L';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0 L';
    return `${(value / 100000).toFixed(decimals)} L`;
  }, []);

  const formatInThousands = useCallback((num: number | string | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null || num === '') return '0 K';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0 K';
    return `${(value / 1000).toFixed(decimals)} K`;
  }, []);

  // Static label map - defined outside component would be even better
  const CATEGORY_LABELS: Record<string, string> = useMemo(() => ({
    'ALL': 'All Categories',
    'EDEL': 'EDEL',
    'HOME_AND_KITCHEN': 'Home & Kitchen',
    'ELECTRONICS': 'Electronics',
    'HEALTH_AND_PERSONAL_CARE': 'Health & Personal Care',
    'AUTOMOTIVE_AND_TOOLS': 'Automotive & Tools',
    'TOYS_AND_GAMES': 'Toys & Games',
    'BRAND_PRIVATE_LABEL': 'Brand Private Label',
    'OTHERS': 'Others',
  }), []);

  const formatProductCategory = useCallback((category: string): string => {
    return CATEGORY_LABELS[category] || category;
  }, [CATEGORY_LABELS]);

  // Format backend month value (e.g. 2025-11) to display label like Nov'25
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  const formatMonthLabel = useCallback((month: string): string => {
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
  }, []);

  const QtyLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">SO Qty</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-red-500 to-red-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">DN Qty</span>
      </div>
    </div>
  );

  const CbmLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">SO Total CBM</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-red-500 to-red-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">DN Total CBM</span>
      </div>
    </div>
  );

  const columns = [
    { header: 'Category', accessor: 'categoryLabel' },
    { header: 'SO SKU Count', accessor: 'soCount' },
    { header: 'SO Qty', accessor: 'soQty' },
    { header: 'SO Total CBM', accessor: 'soTotalCbm' },
    { header: 'DN SKU Count', accessor: 'dnCount' },
    { header: 'DN Qty', accessor: 'dnQty' },
    { header: 'DN Total CBM', accessor: 'dnTotalCbm' },
    { header: '(SO - DN) Qty', accessor: 'soMinusDnQty' },
  ];

  // Empty state
  if (!loading && error) {
    return (
      <div className="relative min-h-screen">
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-8 text-center">
          <Package className="w-16 h-16 text-yellow-600 dark:text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200 mb-2">No Data Available</h3>
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

  return (
    <div className="relative min-h-screen">
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
          <div className="md:col-span-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
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
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full pl-2 pr-3 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none cursor-pointer text-right"
                  suppressHydrationWarning={true}
                />
              </div>
            </div>
          </div>

          {/* Month Selector */}
          <div className="md:col-span-2 space-y-2">
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
                  {(data?.availableMonths || ['ALL']).map((month) => (
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
          <div className="md:col-span-2 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Box className="w-3.5 h-3.5" /> Warehouse
            </label>
            <div className="group relative flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <select
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white outline-none appearance-none transition-all cursor-pointer"
                  suppressHydrationWarning={true}
                >
                  {(data?.availableWarehouses || ['ALL']).map((warehouse) => (
                    <option key={warehouse} value={warehouse}>
                      {warehouse}
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
          <div className="md:col-span-2 space-y-2 relative" ref={categoryDropdownRef}>
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
                  {(data?.productCategories || []).filter(c => c !== 'ALL').map((category) => (
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
            {(fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0 || (selectedWarehouse && selectedWarehouse !== 'ALL')) && (
              <motion.button
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98, translateY: 0 }}
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSelectedMonth('ALL');
                  setSelectedProductCategories([]);
                  setSelectedWarehouse('ALL');
                  fetchSummary(false);
                }}
                className="h-[36px] px-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 shadow-sm flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div >

      {/* Metrics Cards - Consolidated 3-Card Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Sales Order (SO) Card */}
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
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Sales Order (SO)</h3>
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
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SO SKU</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Unique Sales Order Items</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {loading ? '-' : formatNumber(data?.cards.soSku)}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SO Qty</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Total Sales Order Quantity</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {loading ? '-' : formatInLakhs(data?.cards.soQty)}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                  <Box className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SO Total CBM</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Sales Order Volume</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {loading ? '-' : formatInThousands(data?.cards.soTotalCbm)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Delivery Note (DN) Card */}
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
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Delivery Note (DN)</h3>
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
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">DN SKU</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Unique Delivery Note Items</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                {loading ? '-' : formatNumber(data?.cards.dnSku)}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">DN Qty</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Total Delivery Note Quantity</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                {loading ? '-' : formatInLakhs(data?.cards.dnQty)}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                  <Box className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">DN Total CBM</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Delivery Note Volume</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                {loading ? '-' : formatInThousands(data?.cards.dnTotalCbm)}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Difference (SO - DN) Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
        >
          {/* Decorative gradient */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <ArrowRightLeft className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Pending (SO - DN)</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">Difference metrics</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className={`flex items-center justify-between p-4 bg-gradient-to-br rounded-xl border hover:shadow-md transition-all ${
              (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) > 0
                ? 'from-orange-50/80 to-orange-100/50 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200/50 dark:border-orange-700/30'
                : (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) < 0
                  ? 'from-red-50/80 to-red-100/50 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/30'
                  : 'from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 border-green-200/50 dark:border-green-700/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) > 0
                    ? 'bg-orange-500/10 dark:bg-orange-500/20'
                    : (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) < 0
                      ? 'bg-red-500/10 dark:bg-red-500/20'
                      : 'bg-green-500/10 dark:bg-green-500/20'
                }`}>
                  <Package className={`w-5 h-5 ${
                    (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                  }`} />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SO - DN SKU</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Pending SKU difference</p>
                </div>
              </div>
              <span className={`text-2xl font-bold font-mono ${
                (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) > 0 
                  ? 'text-orange-600 dark:text-orange-400' 
                  : (data?.cards.soSku || 0) - (data?.cards.dnSku || 0) < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
              }`}>
                {loading ? '-' : formatNumber((data?.cards.soSku || 0) - (data?.cards.dnSku || 0))}
              </span>
            </div>
            
            <div className={`flex items-center justify-between p-4 bg-gradient-to-br rounded-xl border hover:shadow-md transition-all ${
              (data?.cards.soMinusDnQty || 0) > 0
                ? 'from-orange-50/80 to-orange-100/50 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200/50 dark:border-orange-700/30'
                : (data?.cards.soMinusDnQty || 0) < 0
                  ? 'from-red-50/80 to-red-100/50 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/30'
                  : 'from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 border-green-200/50 dark:border-green-700/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  (data?.cards.soMinusDnQty || 0) > 0
                    ? 'bg-orange-500/10 dark:bg-orange-500/20'
                    : (data?.cards.soMinusDnQty || 0) < 0
                      ? 'bg-red-500/10 dark:bg-red-500/20'
                      : 'bg-green-500/10 dark:bg-green-500/20'
                }`}>
                  <TrendingUp className={`w-5 h-5 ${
                    (data?.cards.soMinusDnQty || 0) > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : (data?.cards.soMinusDnQty || 0) < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                  }`} />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SO - DN Qty</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Pending delivery quantity</p>
                </div>
              </div>
              <span className={`text-2xl font-bold font-mono ${
                (data?.cards.soMinusDnQty || 0) > 0 
                  ? 'text-orange-600 dark:text-orange-400' 
                  : (data?.cards.soMinusDnQty || 0) < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
              }`}>
                {loading ? '-' : formatInLakhs(data?.cards.soMinusDnQty)}
              </span>
            </div>
            
            <div className={`flex items-center justify-between p-4 bg-gradient-to-br rounded-xl border hover:shadow-md transition-all ${
              ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) > 0
                ? 'from-orange-50/80 to-orange-100/50 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200/50 dark:border-orange-700/30'
                : ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) < 0
                  ? 'from-red-50/80 to-red-100/50 dark:from-red-900/30 dark:to-red-800/20 border-red-200/50 dark:border-red-700/30'
                  : 'from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 border-green-200/50 dark:border-green-700/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) > 0
                    ? 'bg-orange-500/10 dark:bg-orange-500/20'
                    : ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) < 0
                      ? 'bg-red-500/10 dark:bg-red-500/20'
                      : 'bg-green-500/10 dark:bg-green-500/20'
                }`}>
                  <Box className={`w-5 h-5 ${
                    ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                  }`} />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">SO - DN CBM</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Pending delivery volume</p>
                </div>
              </div>
              <span className={`text-2xl font-bold font-mono ${
                ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) > 0 
                  ? 'text-orange-600 dark:text-orange-400' 
                  : ((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)) < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
              }`}>
                {loading ? '-' : formatInThousands((data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0))}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Fulfillment Half Donut Charts - SO to DN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Qty Fulfillment Half Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
        >
          {/* Decorative gradient */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Qty Fulfillment</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">SO to DN Quantity Ratio</p>
            </div>
          </div>
          
          <div className="h-52 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { 
                      name: 'Fulfilled (DN)', 
                      value: data?.cards.dnQty || 0,
                      fill: '#10b981'
                    },
                    { 
                      name: 'Pending', 
                      value: Math.max(0, (data?.cards.soQty || 0) - (data?.cards.dnQty || 0)),
                      fill: '#f59e0b'
                    },
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
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as { name: string; value: number };
                      const soQtyTotal = data?.cards.soQty || 0;
                      const percentOfSo = soQtyTotal > 0 ? (item.value / soQtyTotal) * 100 : 0;
                      return (
                        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">
                            {item.name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400">
                            Qty: <span className="font-mono font-semibold">{formatInLakhs(item.value)}</span>
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                            Share of SO: <span className="font-mono font-semibold">{percentOfSo.toFixed(1)}%</span>
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
              <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {loading ? '-' : `${((data?.cards.dnQty || 0) / (data?.cards.soQty || 1) * 100).toFixed(1)}%`}
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Fulfilled</span>
            </div>
          </div>
          
          {/* Legend */}
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs text-gray-600 dark:text-slate-400">DN Qty: {formatInLakhs(data?.cards.dnQty)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-600 dark:text-slate-400">Pending: {formatInLakhs(Math.max(0, (data?.cards.soQty || 0) - (data?.cards.dnQty || 0)))}</span>
            </div>
          </div>
        </motion.div>

        {/* CBM Fulfillment Half Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
        >
          {/* Decorative gradient */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">CBM Fulfillment</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">SO to DN Volume Ratio</p>
            </div>
          </div>
          
          <div className="h-52 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { 
                      name: 'Fulfilled (DN)', 
                      value: data?.cards.dnTotalCbm || 0,
                      fill: '#3b82f6'
                    },
                    { 
                      name: 'Pending', 
                      value: Math.max(0, (data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)),
                      fill: '#f59e0b'
                    },
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
                  <Cell fill="#3b82f6" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as { name: string; value: number };
                      const soCbmTotal = data?.cards.soTotalCbm || 0;
                      const percentOfSo = soCbmTotal > 0 ? (item.value / soCbmTotal) * 100 : 0;
                      return (
                        <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">
                            {item.name}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400">
                            CBM: <span className="font-mono font-semibold">{formatInThousands(item.value)}</span>
                          </p>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                            Share of SO CBM: <span className="font-mono font-semibold">{percentOfSo.toFixed(1)}%</span>
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
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {loading ? '-' : `${((data?.cards.dnTotalCbm || 0) / (data?.cards.soTotalCbm || 1) * 100).toFixed(1)}%`}
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Fulfilled</span>
            </div>
          </div>
          
          {/* Legend */}
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-600 dark:text-slate-400">DN CBM: {formatInThousands(data?.cards.dnTotalCbm)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs text-gray-600 dark:text-slate-400">Pending: {formatInThousands(Math.max(0, (data?.cards.soTotalCbm || 0) - (data?.cards.dnTotalCbm || 0)))}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Product Catagory Table - Premium Glassmorphism Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full mb-8"
      >
        <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
          {/* Decorative gradient blobs */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gradient-to-br from-green-400 to-green-600 animate-pulse shadow-lg shadow-green-500/50" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Product Catagory</h3>
              </div>
              <div className="px-3 py-1.5 bg-gray-100/80 dark:bg-slate-700/80 backdrop-blur-sm rounded-lg border border-gray-200/50 dark:border-slate-600/50 text-sm font-semibold text-gray-700 dark:text-slate-300">
                {data?.categoryTable?.length || 0} Categories
              </div>
            </div>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : data?.categoryTable && data.categoryTable.length > 0 ? (
            <motion.div
              className="space-y-2"
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
              {/* Headers */}
              <div className="grid grid-cols-9 gap-4 px-4 py-3 mb-2 bg-gradient-to-r from-gray-50/80 to-transparent dark:from-slate-800/50 dark:to-transparent backdrop-blur-sm rounded-lg border border-gray-200/30 dark:border-slate-700/30 text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider relative z-10">
                <div className="col-span-2 text-left">Category</div>
                <div className="col-span-1 text-center">SO Count</div>
                <div className="col-span-1 text-center">SO Qty</div>
                <div className="col-span-1 text-center">SO CBM</div>
                <div className="col-span-1 text-center">DN Count</div>
                <div className="col-span-1 text-center">DN Qty</div>
                <div className="col-span-1 text-center">DN CBM</div>
                <div className="col-span-1 text-center">SO - DN Qty</div>
              </div>

              {/* Data Rows */}
              {data.categoryTable.map((row, index) => (
                <motion.div
                  key={row.categoryLabel}
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
                    className={`relative ${row.categoryLabel === 'TOTAL'
                      ? 'bg-gradient-to-r from-brandRed/20 via-brandRed/10 to-brandRed/5 border-2 border-brandRed/40 shadow-lg shadow-brandRed/20 backdrop-blur-sm'
                      : 'bg-white/60 dark:bg-slate-700/40 backdrop-blur-md border border-gray-200/50 dark:border-slate-600/40'
                      } rounded-xl p-4 overflow-hidden transition-all duration-200`}
                    whileHover={{
                      y: -2,
                      scale: 1.01,
                      transition: { type: "spring", stiffness: 400, damping: 25 }
                    }}
                  >
                    {/* Status gradient overlay */}
                    {row.categoryLabel !== 'TOTAL' && (
                      <div
                        className="absolute inset-0 bg-gradient-to-l from-blue-500/15 via-blue-500/5 to-transparent pointer-events-none"
                        style={{
                          backgroundSize: "30% 100%",
                          backgroundPosition: "right",
                          backgroundRepeat: "no-repeat"
                        }}
                      />
                    )}

                    {/* Grid Content */}
                    <div className={`relative grid grid-cols-9 gap-4 items-center ${row.categoryLabel === 'TOTAL' ? 'text-lg font-bold' : ''
                      }`}>
                      {/* Category */}
                      <div className="col-span-2 flex items-center gap-3">
                        {row.categoryLabel === 'TOTAL' ? (
                          <>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brandRed to-brandRed/70 flex items-center justify-center border-2 border-brandRed/50">
                              <span className="text-white text-xs font-bold">Σ</span>
                            </div>
                            <span className="text-brandRed dark:text-brandRed font-bold text-lg">
                              {row.categoryLabel}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                              <Package className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-gray-900 dark:text-slate-200 font-medium">
                              {row.categoryLabel}
                            </span>
                          </>
                        )}
                      </div>

                      {/* SO Count */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : 'bg-orange-500/10 border border-orange-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : 'text-orange-600 dark:text-orange-400 text-sm'
                            }`}>
                            {formatNumber(row.soCount)}
                          </span>
                        </div>
                      </div>

                      {/* SO Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : 'bg-indigo-500/10 border border-indigo-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : 'text-indigo-600 dark:text-indigo-400 text-sm'
                            }`}>
                            {formatNumber(row.soQty)}
                          </span>
                        </div>
                      </div>

                      {/* SO CBM */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : 'bg-blue-500/10 border border-blue-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : 'text-blue-600 dark:text-blue-400 text-sm'
                            }`}>
                            {formatNumber(row.soTotalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* DN Count */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : 'bg-teal-500/10 border border-teal-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : 'text-teal-600 dark:text-teal-400 text-sm'
                            }`}>
                            {formatNumber(row.dnCount)}
                          </span>
                        </div>
                      </div>

                      {/* DN Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : 'bg-green-500/10 border border-green-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : 'text-green-600 dark:text-green-400 text-sm'
                            }`}>
                            {formatNumber(row.dnQty)}
                          </span>
                        </div>
                      </div>

                      {/* DN Total CBM */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : 'bg-purple-500/10 border border-purple-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : 'text-purple-600 dark:text-purple-400 text-sm'
                            }`}>
                            {formatNumber(row.dnTotalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* SO - DN Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border-2 border-brandRed/50'
                          : row.soMinusDnQty > 0
                            ? 'bg-red-500/10 border border-red-500/30'
                            : row.soMinusDnQty < 0
                              ? 'bg-yellow-500/10 border border-yellow-500/30'
                              : 'bg-green-500/10 border border-green-500/30'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                            : row.soMinusDnQty > 0
                              ? 'text-red-600 dark:text-red-400 text-sm'
                              : row.soMinusDnQty < 0
                                ? 'text-yellow-600 dark:text-yellow-400 text-sm'
                                : 'text-green-600 dark:text-green-400 text-sm'
                            }`}>
                            {formatNumber(row.soMinusDnQty)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400 relative z-10">
              <div className="text-center">
                <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No category data available</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Pie Charts Section - Products and Categories by CBM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Products by CBM Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="w-full"
        >
          <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
            {/* Decorative gradient blobs */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Box className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Products by CBM
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Top 10 products distribution
                </p>
              </div>
            </div>

            {/* Pie Chart */}
            {topProducts.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topProducts.slice(0, 10).map((product) => ({
                        name: product.deliveryNoteItem.length > 20 
                          ? product.deliveryNoteItem.substring(0, 20) + '...' 
                          : product.deliveryNoteItem,
                        value: product.totalCbm,
                        fullName: product.deliveryNoteItem,
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ percent }: { percent?: number }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
                      outerRadius={100}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {topProducts.slice(0, 10).map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={[
                            '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
                            '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
                          ][index % 10]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">
                                {data.fullName}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-slate-400">
                                CBM: <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{formatNumber(data.value, 2)}</span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500 dark:text-slate-400">
                <div className="text-center">
                  <Box className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No product data available</p>
                </div>
              </div>
            )}

            {/* Legend */}
            {topProducts.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {topProducts.slice(0, 10).map((product, index) => (
                  <div key={product.deliveryNoteItem} className="flex items-center gap-2 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ 
                        backgroundColor: [
                          '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
                          '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#06b6d4'
                        ][index % 10] 
                      }} 
                    />
                    <span className="text-gray-600 dark:text-slate-400 truncate">
                      {product.deliveryNoteItem.length > 25 
                        ? product.deliveryNoteItem.substring(0, 25) + '...' 
                        : product.deliveryNoteItem}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Categories by CBM Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="w-full"
        >
          <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
            {/* Decorative gradient blobs */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                  Product Catagory
                </h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Category distribution by CBM
                </p>
              </div>
            </div>

            {/* Pie Chart */}
            {productCategoryDonutData.some(item => item.value > 0) ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={productCategoryDonutData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ percent }: { percent?: number }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
                      outerRadius={100}
                      innerRadius={40}
                      fill="#8884d8"
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {productCategoryDonutData.map((_, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={[
                            '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6',
                            '#ec4899', '#f59e0b', '#f97316', '#84cc16', '#6366f1'
                          ][index % 10]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-3 rounded-xl border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-1">
                                {data.name}
                              </p>
                              <p className="text-sm text-gray-600 dark:text-slate-400">
                                CBM: <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(data.value, 2)}</span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-gray-500 dark:text-slate-400">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No category data available</p>
                </div>
              </div>
            )}

            {/* Legend */}
            {productCategoryDonutData.some(item => item.value > 0) && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {productCategoryDonutData.map((category, index) => (
                  <div key={category.name} className="flex items-center gap-2 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ 
                        backgroundColor: [
                          '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6',
                          '#ec4899', '#f59e0b', '#f97316', '#84cc16', '#6366f1'
                        ][index % 10] 
                      }} 
                    />
                    <span className="text-gray-600 dark:text-slate-400 truncate">
                      {category.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Product Performances Table - Premium Glassmorphism Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="w-full mb-8"
      >
        <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
          {/* Decorative gradient blobs */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    Product Performances
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Ranked by {topProductsRankBy === 'cbm' ? 'CBM' : 'Quantity'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Controls */}
            <div className="flex items-center gap-3">
              {/* Rank By Toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
                <button
                  onClick={() => handleRankByChange('cbm')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    topProductsRankBy === 'cbm'
                      ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  By CBM
                </button>
                <button
                  onClick={() => handleRankByChange('qty')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    topProductsRankBy === 'qty'
                      ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  By Qty
                </button>
              </div>
              
              {/* Sort Order Toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
                <button
                  onClick={() => handleSortOrderChange('top')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    topProductsSortOrder === 'top'
                      ? 'bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  Top
                </button>
                <button
                  onClick={() => handleSortOrderChange('bottom')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    topProductsSortOrder === 'bottom'
                      ? 'bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 shadow-sm'
                      : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                  }`}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  Bottom
                </button>
              </div>
            </div>
          </div>

          {topProductsLoading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : topProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200/50 dark:border-slate-700/50">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Product Item</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      <span className={topProductsRankBy === 'qty' ? 'text-amber-600 dark:text-amber-400' : ''}>DN Qty</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                      <span className={topProductsRankBy === 'cbm' ? 'text-amber-600 dark:text-amber-400' : ''}>DN CBM</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                  {topProducts.map((product, index) => (
                    <motion.tr
                      key={product.deliveryNoteItem}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                          product.rank === 1 
                            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30' 
                            : product.rank === 2 
                              ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-md' 
                              : product.rank === 3 
                                ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/20'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                        }`}>
                          {product.rank}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-slate-200">
                          {product.deliveryNoteItem}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50">
                          {product.productCategory}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-mono font-semibold ${
                          topProductsRankBy === 'qty' 
                            ? 'text-amber-600 dark:text-amber-400' 
                            : 'text-gray-700 dark:text-slate-300'
                        }`}>
                          {formatNumber(product.totalQty)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-mono font-semibold ${
                          topProductsRankBy === 'cbm' 
                            ? 'text-amber-600 dark:text-amber-400' 
                            : 'text-gray-700 dark:text-slate-300'
                        }`}>
                          {formatNumber(product.totalCbm, 2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatNumber(product.percentageOfTotal, 2)}%
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400 relative z-10">
              <div className="text-center">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No product data available</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Time Series Charts - Premium Glassmorphism Design */}
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
          {/* SO vs DN Qty Chart - Premium Design */}
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
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">SO Qty vs DN Qty</h3>
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
                      <linearGradient id="soQtyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="dnQtyGradient" x1="0" y1="0" x2="0" y2="1">
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
                        name === 'soQty' ? 'SO Qty' : 'DN Qty'
                      ]}
                      cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      content={<QtyLegend />}
                      wrapperStyle={{ paddingBottom: '20px' }}
                    />
                    <Bar dataKey="soQty" fill="url(#soQtyGradient)" radius={[8, 8, 0, 0]} name="SO qty">
                      <LabelList
                        dataKey="soQty"
                        position="top"
                        formatter={(value: any) => formatInLakhs(value)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar dataKey="dnQty" fill="url(#dnQtyGradient)" radius={[8, 8, 0, 0]} name="DN Qty">
                      <LabelList
                        dataKey="dnQty"
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

          {/* SO vs DN Total CBM Chart - Premium Design */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient blob */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-1">SO CBM vs DN CBM</h3>
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
                      <linearGradient id="soCbmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="dnCbmGradient" x1="0" y1="0" x2="0" y2="1">
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
                        name === 'soTotalCbm' ? 'SO Total CBM' : 'DN Total CBM'
                      ]}
                      cursor={{ fill: 'rgba(220, 38, 38, 0.1)' }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      content={<CbmLegend />}
                      wrapperStyle={{ paddingBottom: '20px' }}
                    />
                    <Bar dataKey="soTotalCbm" fill="url(#soCbmGradient)" radius={[8, 8, 0, 0]} name="SO Total CBM">
                      <LabelList
                        dataKey="soTotalCbm"
                        position="top"
                        formatter={(value: any) => formatNumber(value, 2)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar dataKey="dnTotalCbm" fill="url(#dnCbmGradient)" radius={[8, 8, 0, 0]} name="DN Total CBM">
                      <LabelList
                        dataKey="dnTotalCbm"
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

      {/* Summary Totals Table - Premium Glassmorphism Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="w-full mb-8"
      >
        <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
          {/* Decorative gradient blobs */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          
          {/* Header */}
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gradient-to-br from-green-400 to-green-600 animate-pulse shadow-lg shadow-green-500/50" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Summary Totals</h3>
              </div>
              <div className="px-3 py-1.5 bg-gray-100/80 dark:bg-slate-700/80 backdrop-blur-sm rounded-lg border border-gray-200/50 dark:border-slate-600/50 text-sm font-semibold text-gray-700 dark:text-slate-300">
                {data?.summaryTotals?.dayData?.length || 0} Records
              </div>
            </div>
            <motion.button
              onClick={handleDownloadSummary}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 bg-gradient-to-r from-brandRed to-red-600 hover:from-red-600 hover:to-red-700 dark:hover:from-red-700 dark:hover:to-red-800 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-brandRed/25 hover:shadow-brandRed/40"
            >
              <Download className="w-4 h-4" />
              Download Excel
            </motion.button>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : data?.summaryTotals ? (
            <motion.div
              className="space-y-2 max-h-96 overflow-y-auto pr-2"
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
              {/* Headers */}
              <div className="grid grid-cols-9 gap-4 px-4 py-3 mb-2 bg-gradient-to-r from-gray-50/80 to-transparent dark:from-slate-800/50 dark:to-transparent backdrop-blur-sm rounded-lg border border-gray-200/30 dark:border-slate-700/30 text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider relative z-10">
                <div className="col-span-1">No</div>
                <div className="col-span-2">Date</div>
                <div className="col-span-1">DN Qty</div>
                <div className="col-span-1">DN CBM</div>
                <div className="col-span-1">EDEL DN Qty</div>
                <div className="col-span-1">EDEL DN CBM</div>
                <div className="col-span-1">Pending Qty</div>
                <div className="col-span-1">Pending CBM</div>
              </div>

              {/* Data Rows */}
              {data.summaryTotals.dayData && data.summaryTotals.dayData.length > 0 ? (
                data.summaryTotals.dayData.map((day, index) => (
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
                      className="relative bg-white/60 dark:bg-slate-700/40 backdrop-blur-md border border-gray-200/50 dark:border-slate-600/40 rounded-xl p-4 overflow-hidden transition-all duration-200"
                      whileHover={{
                        y: -2,
                        scale: 1.01,
                        transition: { type: "spring", stiffness: 400, damping: 25 }
                      }}
                    >
                      {/* Status gradient overlay */}
                      <div
                        className="absolute inset-0 bg-gradient-to-l from-green-500/15 via-green-500/5 to-transparent pointer-events-none"
                        style={{
                          backgroundSize: "30% 100%",
                          backgroundPosition: "right",
                          backgroundRepeat: "no-repeat"
                        }}
                      />

                      {/* Grid Content */}
                      <div className="relative grid grid-cols-9 gap-4 items-center">
                        {/* Number */}
                        <div className="col-span-1">
                          <span className="text-2xl font-bold text-gray-400 dark:text-slate-500">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>

                        {/* Date */}
                        <div className="col-span-2 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                            <ArrowUpFromLine className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-gray-900 dark:text-slate-200 font-medium">
                            {day.label}
                          </span>
                        </div>

                        {/* DN Qty */}
                        <div className="col-span-1 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                            <span className="text-green-600 dark:text-green-400 text-sm font-medium font-mono">
                              {formatNumber(day.dnQty)}
                            </span>
                          </div>
                        </div>

                        {/* DN CBM */}
                        <div className="col-span-1 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center">
                            <span className="text-blue-600 dark:text-blue-400 text-sm font-medium font-mono">
                              {formatNumber(day.dnCbm, 2)}
                            </span>
                          </div>
                        </div>

                        {/* EDEL DN Qty */}
                        <div className="col-span-1 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                            <span className="text-purple-600 dark:text-purple-400 text-sm font-medium font-mono">
                              {formatNumber(day.edelDnQty)}
                            </span>
                          </div>
                        </div>

                        {/* EDEL DN CBM */}
                        <div className="col-span-1 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 inline-flex items-center justify-center">
                            <span className="text-orange-600 dark:text-orange-400 text-sm font-medium font-mono">
                              {formatNumber(day.edelDnCbm, 2)}
                            </span>
                          </div>
                        </div>

                        {/* Pending Qty (DN - EDEL DN) */}
                        <div className="col-span-1 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 inline-flex items-center justify-center">
                            <span className="text-red-600 dark:text-red-400 text-sm font-medium font-mono">
                              {formatNumber((day.dnQty || 0) - (day.edelDnQty || 0))}
                            </span>
                          </div>
                        </div>

                        {/* Pending CBM (DN - EDEL DN) */}
                        <div className="col-span-1 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 inline-flex items-center justify-center">
                            <span className="text-amber-600 dark:text-amber-400 text-sm font-medium font-mono">
                              {formatNumber((day.dnCbm || 0) - (day.edelDnCbm || 0), 2)}
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
                  <div className="relative bg-gradient-to-r from-green-50/80 via-green-50/40 to-transparent dark:from-green-900/20 dark:via-green-900/10 dark:to-transparent backdrop-blur-md border-2 border-green-500/30 dark:border-green-500/20 rounded-xl p-4 shadow-lg shadow-green-500/10">
                    <div className="grid grid-cols-8 gap-4 items-center">
                      <div className="col-span-1">
                        <span className="text-2xl font-bold text-gray-400 dark:text-slate-500">01</span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-gray-900 dark:text-slate-200 font-medium">Total</span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-sm font-mono text-gray-900 dark:text-slate-200 font-medium">
                          {formatNumber(data.summaryTotals.totalDnQty)}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center">
                          <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                            {formatNumber(data.summaryTotals.totalDnCbm, 2)}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <span className="text-sm font-mono text-gray-900 dark:text-slate-200 font-medium">
                          {formatNumber(data.summaryTotals.totalEdelDnQty)}
                        </span>
                      </div>
                      <div className="col-span-1">
                        <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                          <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                            {formatNumber(data.summaryTotals.totalEdelDnCbm, 2)}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 inline-flex items-center justify-center">
                          <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                            {formatNumber((data.summaryTotals.totalDnQty || 0) - (data.summaryTotals.totalEdelDnQty || 0))}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1">
                        <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 inline-flex items-center justify-center">
                          <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">
                            {formatNumber((data.summaryTotals.totalDnCbm || 0) - (data.summaryTotals.totalEdelDnCbm || 0), 2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400 relative z-10">
              <div className="text-center">
                <ArrowUpFromLine className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No summary data available</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div >
  );
}
