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
  availableWarehouses: string[];
  timeSeries: InventoryTimeSeriesData;
}

interface FastMovingSku {
  item: string;
  warehouse: string;
  itemGroup: string;
  productCategory: string;
  avgDailyQty: number;
  latestQty: number;
  minQty: number;
  maxQty: number;
  daysOfStock: number;
  stockStatus: 'critical' | 'low' | 'adequate' | 'high';
  cbmPerUnit: number;
  totalCbm: number;
  // Sales data from outbound (DN = Delivery Note)
  avgDailySales: number;
  totalSalesQty: number;
  totalSalesCbm: number;
}

interface FastMovingSkusResponse {
  skus: FastMovingSku[];
  summary: {
    totalFastMovingSkus: number;
    criticalCount: number;
    lowCount: number;
    adequateCount: number;
    highCount: number;
  };
  filters: {
    availableWarehouses: string[];
    availableProductCategories: string[];
  };
}

interface ZeroOrderProduct {
  item: string;
  warehouse: string;
  itemGroup: string;
  productCategory: string;
  avgStockQty: number;
  latestStockQty: number;
  cbmPerUnit: number;
  totalCbm: number;
  daysInStock: number;
  stockValue: string;
}

interface ZeroOrderProductsResponse {
  products: ZeroOrderProduct[];
  summary: {
    totalZeroOrderProducts: number;
    highValueCount: number;
    mediumValueCount: number;
    lowValueCount: number;
    totalCbmBlocked: number;
  };
  filters: {
    availableWarehouses: string[];
    availableProductCategories: string[];
  };
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

function InventoryPageContent() {
  const searchParams = useSearchParams();
  const uploadIdParam = searchParams.get('uploadId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InventorySummaryResponse | null>(null);

  // Fast-moving SKUs state
  const [fastMovingData, setFastMovingData] = useState<FastMovingSkusResponse | null>(null);
  const [fastMovingLoading, setFastMovingLoading] = useState(false);
  const [fastMovingError, setFastMovingError] = useState<string | null>(null);
  const [fastMovingWarehouse, setFastMovingWarehouse] = useState('ALL');
  const [fastMovingCategory, setFastMovingCategory] = useState('ALL');
  const [minAvgQty, setMinAvgQty] = useState(50);
  const [showFastMovingSection, setShowFastMovingSection] = useState(true);
  const [fastMovingPage, setFastMovingPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Zero-order products state
  const [zeroOrderData, setZeroOrderData] = useState<ZeroOrderProductsResponse | null>(null);
  const [zeroOrderLoading, setZeroOrderLoading] = useState(false);
  const [zeroOrderError, setZeroOrderError] = useState<string | null>(null);
  const [zeroOrderWarehouse, setZeroOrderWarehouse] = useState('ALL');
  const [zeroOrderCategory, setZeroOrderCategory] = useState('ALL');
  const [minDaysInStock, setMinDaysInStock] = useState(7);
  const [showZeroOrderSection, setShowZeroOrderSection] = useState(true);
  const [zeroOrderPage, setZeroOrderPage] = useState(0);

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedItemGroup, setSelectedItemGroup] = useState('ALL');
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');

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
        if (selectedWarehouse && selectedWarehouse !== 'ALL') {
          params.append('warehouse', selectedWarehouse);
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

  // Fetch fast-moving SKUs
  const fetchFastMovingSkus = async () => {
    try {
      setFastMovingLoading(true);
      setFastMovingError(null);

      const params = new URLSearchParams();
      if (fastMovingWarehouse && fastMovingWarehouse !== 'ALL') {
        params.append('warehouse', fastMovingWarehouse);
      }
      if (fastMovingCategory && fastMovingCategory !== 'ALL') {
        params.append('productCategory', fastMovingCategory);
      }
      params.append('minAvgQty', minAvgQty.toString());
      params.append('limit', '50');

      const response = await fetch(`${BACKEND_URL}/inventory/fast-moving-skus?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No inventory data available');
        }
        throw new Error('Failed to fetch fast-moving SKUs');
      }

      const result: FastMovingSkusResponse = await response.json();
      setFastMovingData(result);
    } catch (err: any) {
      setFastMovingError(err.message || 'An error occurred');
      setFastMovingData(null);
    } finally {
      setFastMovingLoading(false);
    }
  };

  // Fetch fast-moving SKUs on mount and when filters change
  useEffect(() => {
    if (data) {
      setFastMovingPage(0); // Reset to first page when filters change
      fetchFastMovingSkus();
    }
  }, [data, fastMovingWarehouse, fastMovingCategory, minAvgQty]);

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'low': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'adequate': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'high': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStockStatusIcon = (status: string) => {
    switch (status) {
      case 'critical': return '🔴';
      case 'low': return '🟠';
      case 'adequate': return '🟢';
      case 'high': return '🔵';
      default: return '⚪';
    }
  };

  // Fetch zero-order products
  const fetchZeroOrderProducts = async () => {
    try {
      setZeroOrderLoading(true);
      setZeroOrderError(null);

      const params = new URLSearchParams();
      if (zeroOrderWarehouse && zeroOrderWarehouse !== 'ALL') {
        params.append('warehouse', zeroOrderWarehouse);
      }
      if (zeroOrderCategory && zeroOrderCategory !== 'ALL') {
        params.append('productCategory', zeroOrderCategory);
      }
      params.append('minDaysInStock', minDaysInStock.toString());
      params.append('limit', '100');

      const response = await fetch(`${BACKEND_URL}/inventory/zero-order-products?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No inventory data available');
        }
        throw new Error('Failed to fetch zero-order products');
      }

      const result: ZeroOrderProductsResponse = await response.json();
      setZeroOrderData(result);
    } catch (err: any) {
      setZeroOrderError(err.message || 'An error occurred');
      setZeroOrderData(null);
    } finally {
      setZeroOrderLoading(false);
    }
  };

  // Fetch zero-order products when data loads or filters change
  useEffect(() => {
    if (data) {
      setZeroOrderPage(0);
      fetchZeroOrderProducts();
    }
  }, [data, zeroOrderWarehouse, zeroOrderCategory, minDaysInStock]);

  const getStockValueColor = (value: string) => {
    switch (value) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const getStockValueIcon = (value: string) => {
    switch (value) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
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
    // For inventory data, we need to AVERAGE (not sum) across days in a period
    // because inventory is a point-in-time snapshot, not a cumulative metric
    const groups: Record<string, { data: InventoryTimeSeriesPoint; count: number }> = {};

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
          data: {
            date: key,
            label,
            inventoryQty: 0,
            edelInventoryQty: 0,
            totalCbm: 0,
            edelTotalCbm: 0,
          },
          count: 0,
        };
      }

      // Accumulate values for averaging
      groups[key].data.inventoryQty += p.inventoryQty;
      groups[key].data.edelInventoryQty += p.edelInventoryQty;
      groups[key].data.totalCbm += p.totalCbm;
      groups[key].data.edelTotalCbm += p.edelTotalCbm;
      groups[key].count += 1;
    }

    // Calculate averages
    return Object.keys(groups)
      .sort()
      .map((k) => {
        const group = groups[k];
        const count = group.count || 1;
        return {
          date: group.data.date,
          label: group.data.label,
          inventoryQty: Math.round((group.data.inventoryQty / count) * 100) / 100,
          edelInventoryQty: Math.round((group.data.edelInventoryQty / count) * 100) / 100,
          totalCbm: Math.round((group.data.totalCbm / count) * 100) / 100,
          edelTotalCbm: Math.round((group.data.edelTotalCbm / count) * 100) / 100,
        };
      });
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
          <div className="md:col-span-2 space-y-2">
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
          <div className="md:col-span-2 space-y-2">
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
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthIndex = parseInt(monthNum) - 1;
                    const shortYear = year.slice(2);
                    return <option key={month} value={month}>{monthNames[monthIndex]}&apos;{shortYear}</option>;
                  })}
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
            {(fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0 || (selectedWarehouse && selectedWarehouse !== 'ALL')) && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSelectedMonth('ALL');
                  setSelectedProductCategories([]);
                  setSelectedWarehouse('ALL');
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
            
            {/* Total Inventory QTY */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Total Inventory QTY</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Sum of per-row AVERAGE</p>
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
                  <p className="text-xs text-gray-400 dark:text-slate-500">Sum of (AVG QTY × CBM/unit)</p>
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

      {/* Fast-Moving SKUs Section */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8"
        >
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shadow-lg">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Fast-Moving SKUs Availability</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Monitor stock levels for high-velocity items</p>
              </div>
            </div>
            <button
              onClick={() => setShowFastMovingSection(!showFastMovingSection)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showFastMovingSection ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showFastMovingSection && (
            <>
              {/* Summary Cards */}
              {fastMovingData && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{fastMovingData.summary.totalFastMovingSkus}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">Total Fast-Moving</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{fastMovingData.summary.criticalCount}</div>
                    <div className="text-xs text-red-600 dark:text-red-400">Critical (&lt;7 days)</div>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200/50 dark:border-orange-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{fastMovingData.summary.lowCount}</div>
                    <div className="text-xs text-orange-600 dark:text-orange-400">Low (7-14 days)</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{fastMovingData.summary.adequateCount}</div>
                    <div className="text-xs text-green-600 dark:text-green-400">Adequate (14-30 days)</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fastMovingData.summary.highCount}</div>
                    <div className="text-xs text-blue-600 dark:text-blue-400">High (&gt;30 days)</div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-700/40 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Warehouse:</label>
                    <select
                      value={fastMovingWarehouse}
                      onChange={(e) => setFastMovingWarehouse(e.target.value)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                    >
                      {(fastMovingData?.filters.availableWarehouses || data?.availableWarehouses || ['ALL']).map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Category:</label>
                    <select
                      value={fastMovingCategory}
                      onChange={(e) => setFastMovingCategory(e.target.value)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                    >
                      {(fastMovingData?.filters.availableProductCategories || ['ALL']).map((c) => (
                        <option key={c} value={c}>{formatProductCategory(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Min Avg Qty:</label>
                    <input
                      type="number"
                      value={minAvgQty}
                      onChange={(e) => setMinAvgQty(parseInt(e.target.value) || 0)}
                      className="w-20 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                      min={0}
                    />
                  </div>
                  <button
                    onClick={fetchFastMovingSkus}
                    disabled={fastMovingLoading}
                    className="flex items-center gap-2 px-4 py-1.5 bg-brandRed hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${fastMovingLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* SKUs Table */}
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl shadow-lg overflow-hidden">
                {fastMovingLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
                  </div>
                ) : fastMovingError ? (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    {fastMovingError}
                  </div>
                ) : fastMovingData && fastMovingData.skus.length > 0 ? (
                  <>
                    {/* Scrollable Table Container */}
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Item</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Warehouse</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Category</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Avg Qty</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Latest Qty</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Min/Max</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-900/20" title="Average Daily Sales (units/day) from Outbound">Sales/Day</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-900/20" title="Total DN Qty">DN Qty</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-900/20" title="Total DN CBM">DN CBM</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Days of Stock</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">CBM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                          {fastMovingData.skus
                            .slice(fastMovingPage * ITEMS_PER_PAGE, (fastMovingPage + 1) * ITEMS_PER_PAGE)
                            .map((sku, idx) => (
                            <tr key={`${sku.item}-${sku.warehouse}-${idx}`} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]" title={sku.item}>
                                  {sku.item}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{sku.itemGroup}</div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 dark:text-slate-300 text-xs">{sku.warehouse}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded text-xs font-medium text-gray-700 dark:text-slate-300">
                                  {formatProductCategory(sku.productCategory)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatNumber(sku.avgDailyQty)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatNumber(sku.latestQty)}</td>
                              <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-slate-400">
                                {formatNumber(sku.minQty)} / {formatNumber(sku.maxQty)}
                              </td>
                              {/* Sales columns from outbound data */}
                              <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                                {formatNumber(sku.avgDailySales, 2)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                                {formatNumber(sku.totalSalesQty)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                                {formatNumber(sku.totalSalesCbm, 2)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {sku.daysOfStock === 999 ? '∞' : sku.daysOfStock}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getStockStatusColor(sku.stockStatus)}`}>
                                  {getStockStatusIcon(sku.stockStatus)} {sku.stockStatus.charAt(0).toUpperCase() + sku.stockStatus.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600 dark:text-slate-300">{formatNumber(sku.totalCbm, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-700">
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        Showing {fastMovingPage * ITEMS_PER_PAGE + 1} - {Math.min((fastMovingPage + 1) * ITEMS_PER_PAGE, fastMovingData.skus.length)} of {fastMovingData.skus.length} SKUs
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setFastMovingPage(0)}
                          disabled={fastMovingPage === 0}
                          className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          First
                        </button>
                        <button
                          onClick={() => setFastMovingPage(p => Math.max(0, p - 1))}
                          disabled={fastMovingPage === 0}
                          className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Prev
                        </button>
                        <span className="px-3 py-1 text-xs font-semibold text-gray-900 dark:text-white bg-brandRed/10 border border-brandRed/20 rounded">
                          Page {fastMovingPage + 1} of {Math.ceil(fastMovingData.skus.length / ITEMS_PER_PAGE)}
                        </span>
                        <button
                          onClick={() => setFastMovingPage(p => Math.min(Math.ceil(fastMovingData.skus.length / ITEMS_PER_PAGE) - 1, p + 1))}
                          disabled={fastMovingPage >= Math.ceil(fastMovingData.skus.length / ITEMS_PER_PAGE) - 1}
                          className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                        <button
                          onClick={() => setFastMovingPage(Math.ceil(fastMovingData.skus.length / ITEMS_PER_PAGE) - 1)}
                          disabled={fastMovingPage >= Math.ceil(fastMovingData.skus.length / ITEMS_PER_PAGE) - 1}
                          className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No fast-moving SKUs found with the current filters.</p>
                    <p className="text-xs mt-1">Try lowering the minimum average quantity threshold.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Zero-Order Products Section */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8"
        >
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Products With Zero Orders</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Identify dead stock and slow-moving inventory</p>
              </div>
            </div>
            <button
              onClick={() => setShowZeroOrderSection(!showZeroOrderSection)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showZeroOrderSection ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showZeroOrderSection && (
            <>
              {/* Summary Cards */}
              {zeroOrderData && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{zeroOrderData.summary.totalZeroOrderProducts}</div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">Total Zero-Order</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{zeroOrderData.summary.highValueCount}</div>
                    <div className="text-xs text-red-600 dark:text-red-400">High Value (≥1 CBM)</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200/50 dark:border-yellow-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{zeroOrderData.summary.mediumValueCount}</div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">Medium (0.1-1 CBM)</div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200/50 dark:border-green-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">{zeroOrderData.summary.lowValueCount}</div>
                    <div className="text-xs text-green-600 dark:text-green-400">Low (&lt;0.1 CBM)</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200/50 dark:border-purple-800/50 rounded-xl p-4 shadow-sm">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{formatNumber(zeroOrderData.summary.totalCbmBlocked, 2)}</div>
                    <div className="text-xs text-purple-600 dark:text-purple-400">Total CBM Blocked</div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/40 dark:border-slate-700/40 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Warehouse:</label>
                    <select
                      value={zeroOrderWarehouse}
                      onChange={(e) => setZeroOrderWarehouse(e.target.value)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                    >
                      {(zeroOrderData?.filters.availableWarehouses || data?.availableWarehouses || ['ALL']).map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Category:</label>
                    <select
                      value={zeroOrderCategory}
                      onChange={(e) => setZeroOrderCategory(e.target.value)}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                    >
                      {(zeroOrderData?.filters.availableProductCategories || ['ALL']).map((c) => (
                        <option key={c} value={c}>{formatProductCategory(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Min Days in Stock:</label>
                    <input
                      type="number"
                      value={minDaysInStock}
                      onChange={(e) => setMinDaysInStock(parseInt(e.target.value) || 0)}
                      className="w-20 px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                      min={0}
                    />
                  </div>
                  <button
                    onClick={fetchZeroOrderProducts}
                    disabled={zeroOrderLoading}
                    className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${zeroOrderLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Products Table */}
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-xl shadow-lg overflow-hidden">
                {zeroOrderLoading ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  </div>
                ) : zeroOrderError ? (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    {zeroOrderError}
                  </div>
                ) : zeroOrderData && zeroOrderData.products.length > 0 ? (
                  <>
                    {/* Scrollable Table Container */}
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Item</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Warehouse</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Category</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Avg Stock</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Latest Stock</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Days in Stock</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">Value</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-slate-900/50">CBM Blocked</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                          {zeroOrderData.products
                            .slice(zeroOrderPage * ITEMS_PER_PAGE, (zeroOrderPage + 1) * ITEMS_PER_PAGE)
                            .map((product, idx) => (
                            <tr key={`${product.item}-${product.warehouse}-${idx}`} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]" title={product.item}>
                                  {product.item}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{product.itemGroup}</div>
                              </td>
                              <td className="px-4 py-3 text-gray-600 dark:text-slate-300 text-xs">{product.warehouse}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded text-xs font-medium text-gray-700 dark:text-slate-300">
                                  {formatProductCategory(product.productCategory)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatNumber(product.avgStockQty)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatNumber(product.latestStockQty)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-bold text-gray-900 dark:text-white">{product.daysInStock}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${getStockValueColor(product.stockValue)}`}>
                                  {getStockValueIcon(product.stockValue)} {product.stockValue.charAt(0).toUpperCase() + product.stockValue.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-purple-600 dark:text-purple-400">{formatNumber(product.totalCbm, 2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-700">
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        Showing {zeroOrderPage * ITEMS_PER_PAGE + 1} - {Math.min((zeroOrderPage + 1) * ITEMS_PER_PAGE, zeroOrderData.products.length)} of {zeroOrderData.products.length} products
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setZeroOrderPage(0)}
                          disabled={zeroOrderPage === 0}
                          className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          First
                        </button>
                        <button
                          onClick={() => setZeroOrderPage(p => Math.max(0, p - 1))}
                          disabled={zeroOrderPage === 0}
                          className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Prev
                        </button>
                        <span className="px-3 py-1 text-xs font-semibold text-gray-900 dark:text-white bg-purple-500/10 border border-purple-500/20 rounded">
                          Page {zeroOrderPage + 1} of {Math.ceil(zeroOrderData.products.length / ITEMS_PER_PAGE)}
                        </span>
                        <button
                          onClick={() => setZeroOrderPage(p => Math.min(Math.ceil(zeroOrderData.products.length / ITEMS_PER_PAGE) - 1, p + 1))}
                          disabled={zeroOrderPage >= Math.ceil(zeroOrderData.products.length / ITEMS_PER_PAGE) - 1}
                          className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                        <button
                          onClick={() => setZeroOrderPage(Math.ceil(zeroOrderData.products.length / ITEMS_PER_PAGE) - 1)}
                          disabled={zeroOrderPage >= Math.ceil(zeroOrderData.products.length / ITEMS_PER_PAGE) - 1}
                          className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No zero-order products found with the current filters.</p>
                    <p className="text-xs mt-1">All inventory items have matching outbound orders.</p>
                  </div>
                )}
              </div>
            </>
          )}
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
