'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useDateFilter } from '@/lib/date-filter-context';
import { formatHeaderDateShort } from '@/lib/utils';
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
import { authenticatedFetch } from '@/lib/api';

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
  soQty: number;
  soCbm: number;
  dnQty: number;
  dnCbm: number;
  edelDnQty: number;
  edelDnCbm: number;
}

interface SummaryTotals {
  totalSoQty: number;
  totalSoCbm: number;
  totalDnQty: number;
  totalDnCbm: number;
  totalEdelDnQty: number;
  totalEdelDnCbm: number;
  dayData?: DayData[];
}

interface FulfillmentRow {
  date: string;
  soQty: number;
  dnQty: number;
  pending: number;
  percentage: number;
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
  fulfillmentTable?: FulfillmentRow[];
  availableDateRange?: {
    minDate: string | null;
    maxDate: string | null;
  };
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



export default function OutboundPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  // Normalize available date range - some endpoints use different keys
  const availableDateRange = data?.availableDateRange ?? (data as any)?.filters?.availableDateRange ?? null;
  const [chartData, setChartData] = useState<TimeSeriesData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  // Top Products state
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [topProductsRankBy, setTopProductsRankBy] = useState<'cbm' | 'qty'>('cbm');
  const [topProductsSortOrder, setTopProductsSortOrder] = useState<'top' | 'bottom'>('top');

  // Use shared filter context
  const { 
    fromDate, 
    toDate, 
    selectedMonth, 
    selectedProductCategories,
    selectedWarehouse,
    setFromDate,
    setToDate,
    setSelectedMonth,
    setMonthWithDates,
    setSelectedProductCategories,
    setSelectedWarehouse,
    resetFilters
  } = useDateFilter();
  
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [filtersDirty, setFiltersDirty] = useState(false);

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

  const categoryRows = useMemo(() => {
    return (data?.categoryTable || []).filter(row => row.categoryLabel !== 'TOTAL');
  }, [data?.categoryTable]);

  const fulfillmentRows = useMemo(() => {
    const rows = data?.fulfillmentTable ?? [];
    const dataRows = rows.filter((row) => row.date.toLowerCase() !== 'average');

    if (!dataRows.length) return rows;

    const totals = dataRows.reduce(
      (acc, row) => {
        acc.soQty += row.soQty;
        acc.dnQty += row.dnQty;
        acc.pending += row.pending;
        acc.percentage += row.percentage;
        return acc;
      },
      { soQty: 0, dnQty: 0, pending: 0, percentage: 0 }
    );

    const count = dataRows.length;
    const averageRow: FulfillmentRow = {
      date: 'Average',
      soQty: totals.soQty / count,
      dnQty: totals.dnQty / count,
      pending: totals.pending / count,
      percentage: totals.percentage / count,
    };

    return [...dataRows, averageRow];
  }, [data?.fulfillmentTable]);

  const categoryTotals = useMemo(() => {
    return categoryRows.reduce(
      (acc, row) => {
        acc.soCount += row.soCount || 0;
        acc.soQty += row.soQty || 0;
        acc.soTotalCbm += row.soTotalCbm || 0;
        acc.dnCount += row.dnCount || 0;
        acc.dnQty += row.dnQty || 0;
        acc.dnTotalCbm += row.dnTotalCbm || 0;
        return acc;
      },
      {
        soCount: 0,
        soQty: 0,
        soTotalCbm: 0,
        dnCount: 0,
        dnQty: 0,
        dnTotalCbm: 0,
      }
    );
  }, [categoryRows]);

  const categoryTableWithTotal = useMemo(() => {
    if (!categoryRows.length) return [];

    return [
      ...categoryRows,
      {
        categoryLabel: 'TOTAL',
        soCount: categoryTotals.soCount,
        soQty: categoryTotals.soQty,
        soTotalCbm: categoryTotals.soTotalCbm,
        dnCount: categoryTotals.dnCount,
        dnQty: categoryTotals.dnQty,
        dnTotalCbm: categoryTotals.dnTotalCbm,
        soMinusDnQty: categoryTotals.soQty - categoryTotals.dnQty,
      },
    ];
  }, [categoryRows, categoryTotals]);

  const derivedCards = useMemo(() => {
    if (categoryRows.length) {
      return {
        ...data?.cards,
        soSku: categoryTotals.soCount,
        dnSku: categoryTotals.dnCount,
        soQty: categoryTotals.soQty,
        dnQty: categoryTotals.dnQty,
        soTotalCbm: categoryTotals.soTotalCbm,
        dnTotalCbm: categoryTotals.dnTotalCbm,
        soMinusDnQty: categoryTotals.soQty - categoryTotals.dnQty,
      } as CardMetrics;
    }
    return data?.cards as CardMetrics | undefined;
  }, [categoryRows.length, categoryTotals, data?.cards]);

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
      if (categoryRows.length) {
        for (const category of categoryRows) {
          cbmByCategory.set(category.categoryLabel, category.dnTotalCbm ?? 0);
        }
      }

      return fixedCategories.map((name) => ({
        name,
        value: cbmByCategory.get(name) ?? 0,
      }));
    },
    [categoryRows]
  );

  // Combine initial data fetch - avoid duplicate API calls
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setChartLoading(true);
        setTopProductsLoading(true);

        // First fetch without date filters to get available date range
        const unfilteredResponse = await authenticatedFetch('/outbound/summary');
        if (!unfilteredResponse.ok) {
          if (unfilteredResponse.status === 404) {
            throw new Error('No data available. Please upload an Outbound Excel file first.');
          }
          throw new Error('Failed to fetch data from backend');
        }

        const unfilteredResult: SummaryResponse = await unfilteredResponse.json();
        
        // Check if current month has data
        const availableMaxDate = unfilteredResult.availableDateRange?.maxDate;
        const availableMinDate = unfilteredResult.availableDateRange?.minDate;
        
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
            
            const [filteredResponse, topProductsResponse] = await Promise.all([
              authenticatedFetch(`/outbound/summary?${params.toString()}`),
              authenticatedFetch(`/outbound/top-products?limit=10&rankBy=cbm&sortOrder=top`),
            ]);
            
            if (filteredResponse.ok) {
              const filteredResult: SummaryResponse = await filteredResponse.json();
              setData(filteredResult);
              setChartData(unfilteredResult.timeSeries); // Use unfiltered for chart
            } else {
              setData(unfilteredResult);
              setChartData(unfilteredResult.timeSeries);
            }
            
            if (topProductsResponse.ok) {
              const topProductsResult: TopProduct[] = await topProductsResponse.json();
              setTopProducts(topProductsResult);
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

            const [summaryResponse, topProductsResponse] = await Promise.all([
              authenticatedFetch(`/outbound/summary?${params.toString()}`),
              authenticatedFetch(`/outbound/top-products?limit=10&rankBy=cbm&sortOrder=top`),
            ]);

            if (summaryResponse.ok) {
              const result: SummaryResponse = await summaryResponse.json();
              setData(result);
              setChartData(result.timeSeries);
            }

            if (topProductsResponse.ok) {
              const topProductsResult: TopProduct[] = await topProductsResponse.json();
              setTopProducts(topProductsResult);
            }
          }
        } else {
          // No date range info, use unfiltered data
          setData(unfilteredResult);
          setChartData(unfilteredResult.timeSeries);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchChartData = async (granularity: 'month' | 'week' | 'day') => {
    try {
      setChartLoading(true);
      const params = new URLSearchParams();
      // Only send timeGranularity, no filters for chart data
      params.append('timeGranularity', granularity);

      const response = await authenticatedFetch(`/outbound/summary?${params.toString()}`);

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

      const response = await authenticatedFetch(`/outbound/summary?${params.toString()}`);

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

      const response = await authenticatedFetch(`/outbound/summary?${params.toString()}`);

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

  const handleReset = () => {
    resetFilters();
    setFiltersDirty(false);
    fetchSummary(false);
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

      const response = await authenticatedFetch(`/outbound/top-products?${params.toString()}`);

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
    const newCategories = selectedProductCategories.includes(category)
      ? selectedProductCategories.filter(c => c !== category)
      : [...selectedProductCategories, category];
    setSelectedProductCategories(newCategories);
    setFiltersDirty(true);
  };

  const clearAllCategories = () => {
    setSelectedProductCategories([]);
    setFiltersDirty(true);
  };

  const selectAllCategories = () => {
    const allCategories = (data?.productCategories || []).filter(c => c !== 'ALL');
    setSelectedProductCategories(allCategories);
    setFiltersDirty(true);
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

      const response = await authenticatedFetch(`/outbound/download-summary?${params.toString()}`);

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

    // Format with decimals if specified
    const numStr = decimals !== undefined ? value.toFixed(decimals) : (Number.isInteger(value) ? value.toString() : value.toFixed(1));

    // Split into integer and decimal parts
    const parts = numStr.split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1];

    // Indian numbering system: format as X,XX,XXX (lakhs)
    // First, handle negative numbers
    const isNegative = integerPart.startsWith('-');
    if (isNegative) {
      integerPart = integerPart.substring(1);
    }

    // Add commas in Indian format
    if (integerPart.length > 3) {
      const lastThree = integerPart.substring(integerPart.length - 3);
      const otherNumbers = integerPart.substring(0, integerPart.length - 3);
      const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      integerPart = formattedOther + ',' + lastThree;
    }

    // Reconstruct the number
    let result = (isNegative ? '-' : '') + integerPart;
    if (decimalPart) {
      result += '.' + decimalPart;
    }

    return result;
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

  const formatCbmForChart = useCallback((num: number | string | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '0k';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0k';
    const thousands = value / 1000;
    const formatted = thousands.toFixed(1);
    return `${formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted}k`;
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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-redTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandRed shadow-sm" />
        <span className="text-enterprise-text">SO Qty</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-yellowTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandYellow shadow-sm" />
        <span className="text-enterprise-text">DN Qty</span>
      </div>
    </div>
  );

  const CbmLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-redTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandRed shadow-sm" />
        <span className="text-enterprise-text">SO Total CBM</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-enterprise-yellowTint rounded-lg border border-enterprise-border">
        <div className="w-3 h-3 rounded bg-brandYellow shadow-sm" />
        <span className="text-enterprise-text">DN Total CBM</span>
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

  const handleChartClick = (data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;

    // Per user request: exclude month granularity clicking
    if (timeGranularity === 'month') return;

    const payload = data.activePayload[0].payload;
    if (payload.startDate && payload.endDate) {
      setFromDate(payload.startDate);
      setToDate(payload.endDate);
      setSelectedMonth('ALL');
      setFiltersDirty(true);
      setTimeout(() => fetchSummary(true), 0);
    }
  };

  return (
    <div className="relative min-h-screen">
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
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandYellow/50 hover:shadow-md focus-within:border-brandYellow focus-within:ring-4 focus-within:ring-brandYellow/10">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setFiltersDirty(true);
                  }}
                  min={availableDateRange?.minDate || ''}
                  max={availableDateRange?.maxDate || ''}
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
                    setFiltersDirty(true);
                  }}
                  min={availableDateRange?.minDate || ''}
                  max={availableDateRange?.maxDate || ''}
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
            <div className="group relative flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandYellow/50 hover:shadow-md focus-within:border-brandYellow focus-within:ring-4 focus-within:ring-brandYellow/10">
              <div className="relative flex-1">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setMonthWithDates(e.target.value);
                    setFiltersDirty(true);
                  }}
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
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-400 group-hover:text-brandYellow transition-colors">
                <ChevronDown className="h-3.5 w-3.5 stroke-[3]" />
              </div>
            </div>
          </div>

          {/* Warehouse Filter */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Box className="w-3.5 h-3.5" /> Warehouse
            </label>
            <div className="group relative flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandYellow/50 hover:shadow-md focus-within:border-brandYellow focus-within:ring-4 focus-within:ring-brandYellow/10">
              <div className="relative flex-1">
                <select
                  value={selectedWarehouse}
                  onChange={(e) => {
                    setSelectedWarehouse(e.target.value);
                    setFiltersDirty(true);
                  }}
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
            <div className={`group relative flex items-center bg-white dark:bg-slate-800/50 border rounded-xl p-1 shadow-sm transition-all duration-200 ${categoryDropdownOpen
              ? 'border-brandYellow ring-4 ring-brandYellow/10 z-20'
              : 'border-gray-200 dark:border-slate-700 hover:border-brandYellow/50 hover:shadow-md'
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
                <ChevronDown className={`h-3.5 w-3.5 stroke-[3] ${categoryDropdownOpen ? 'text-brandYellow' : 'text-gray-400'}`} />
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
                    className="flex-1 px-2 py-1.5 text-sm font-bold text-brandYellow hover:bg-brandYellow/10 rounded-md transition-colors"
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
                  {(data?.productCategories || []).filter(c => c !== 'ALL').map((category) => (
                    <label
                      key={category}
                      className="flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors group"
                    >
                      <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center transition-all duration-200 ${selectedProductCategories.includes(category)
                        ? 'bg-brandYellow border-brandYellow shadow-sm shadow-brandYellow/30 scale-105'
                        : 'border-gray-300 dark:border-slate-600 group-hover:border-brandYellow/50 bg-white dark:bg-slate-900'
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
              title="Download Summary Excel"
              className="h-[36px] w-[36px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-slate-200 shadow-sm hover:border-brandRed/60 hover:text-brandRed transition-colors"
            >
              <Download className="w-4 h-4" />
            </motion.button>
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
              <span className="font-semibold text-xs text-enterprise-text">Submit</span>
            </motion.button>
            {filtersDirty && (fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0 || (selectedWarehouse && selectedWarehouse !== 'ALL')) && (
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

      </motion.div >

      {/* Metrics Cards - Consolidated 3-Card Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Sales Order (SO) Card - Red Accent */}
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
              <TrendingUp className="w-5 h-5 text-brandRed" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Sales Order (SO)</h3>
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
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">SO SKU</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                {loading ? '-' : formatNumber(derivedCards?.soSku)}
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
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">SO Qty</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                {loading ? '-' : formatInLakhs(derivedCards?.soQty)}
              </span>
            </motion.div>

            <motion.div
              whileHover={{ x: 2 }}
              className="flex items-center justify-between p-3 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                  <Box className="w-4 h-4 text-brandRed" />
                </div>
                <div>
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">SO CBM</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">Volume</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                {loading ? '-' : formatInThousands(derivedCards?.soTotalCbm)}
              </span>
            </motion.div>
          </div>
        </motion.div>

        {/* Delivery Note (DN) Card - Yellow Accent with Progress Bar */}
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
              <FileText className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Delivery Note (DN)</h3>
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
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">DN SKU</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">Unique Items</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                {loading ? '-' : formatNumber(derivedCards?.dnSku)}
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
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">DN Qty</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">Total Quantity</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                {loading ? '-' : formatInLakhs(derivedCards?.dnQty)}
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
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">DN CBM</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">Volume</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500 tracking-tight">
                {loading ? '-' : formatInThousands(derivedCards?.dnTotalCbm)}
              </span>
            </motion.div>

            {/* Fulfillment Progress Bar */}
            <div className="mt-3 pt-3 border-t border-enterprise-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-enterprise-textSecondary uppercase tracking-wider">Qty Filling Ratio</span>
                <span className="text-sm font-bold text-yellow-700 dark:text-yellow-500">
                  {loading ? '-' : `${((derivedCards?.dnQty || 0) / (derivedCards?.soQty || 1) * 100).toFixed(1)}%`}
                </span>
              </div>
              <div className="h-2 bg-enterprise-border/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, ((derivedCards?.dnQty || 0) / (derivedCards?.soQty || 1) * 100))}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-yellow-600 to-amber-600 rounded-full"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Pending (SO - DN) Card - Urgency Styling with Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          whileHover={{ scale: 1.01, y: -2 }}
          className="relative bg-gradient-to-br from-enterprise-pendingBg via-enterprise-pendingBg to-enterprise-redTint/50 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/15 transition-all duration-300 overflow-hidden border-2 border-brandRed group"
        >
          {/* Left accent bar with gradient */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

          {/* Urgency pulse indicator */}
          <div className="absolute top-3 right-3">
            <span className="flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brandRed opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brandRed"></span>
            </span>
          </div>

          <div className="flex items-center gap-3 mb-4 pl-2">
            <motion.div
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="w-11 h-11 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/70 flex items-center justify-center shadow-sm border border-brandRed/20"
            >
              <ArrowRightLeft className="w-5 h-5 text-brandRed" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-brandRed tracking-tight">Pending (SO - DN)</h3>
              <p className="text-xs text-enterprise-textSecondary font-medium">Unfulfilled orders</p>
            </div>
          </div>

          <div className="space-y-2.5 pl-2">
            <motion.div
              whileHover={{ x: 2 }}
              className="flex items-center justify-between p-3 bg-white/80 rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                  <Package className="w-4 h-4 text-brandRed" />
                </div>
                <div>
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Pending SKU</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">SO - DN</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                {loading ? '-' : formatNumber((derivedCards?.soSku || 0) - (derivedCards?.dnSku || 0))}
              </span>
            </motion.div>

            <motion.div
              whileHover={{ x: 2 }}
              className="flex items-center justify-between p-3 bg-white/80 rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-brandRed" />
                </div>
                <div>
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Pending Qty</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">SO - DN</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                {loading ? '-' : formatInLakhs(derivedCards?.soMinusDnQty)}
              </span>
            </motion.div>

            <motion.div
              whileHover={{ x: 2 }}
              className="flex items-center justify-between p-3 bg-white/80 rounded-lg border border-enterprise-border/50 hover:border-brandRed/30 transition-all duration-200"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                  <Box className="w-4 h-4 text-brandRed" />
                </div>
                <div>
                  <span className="text-sm font-bold text-enterprise-textSecondary uppercase tracking-widest">Pending CBM</span>
                  <p className="text-xs text-enterprise-textSecondary/60 font-medium">SO - DN</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed tracking-tight">
                {loading ? '-' : formatInThousands((derivedCards?.soTotalCbm || 0) - (derivedCards?.dnTotalCbm || 0))}
              </span>
            </motion.div>

            {/* Pending Progress Bar (inverted - showing unfulfilled %) */}
            <div className="mt-3 pt-3 border-t border-brandRed/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-enterprise-textSecondary uppercase tracking-wider">Pending Rate</span>
                <span className="text-sm font-bold text-brandRed">
                  {loading ? '-' : `${Math.max(0, 100 - ((derivedCards?.dnQty || 0) / (derivedCards?.soQty || 1) * 100)).toFixed(1)}%`}
                </span>
              </div>
              <div className="h-2 bg-enterprise-border/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, 100 - ((derivedCards?.dnQty || 0) / (derivedCards?.soQty || 1) * 100)))}%` }}
                  transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-brandRed to-brandRed/80 rounded-full"
                />
              </div>
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
          whileHover={{ scale: 1.01, y: -2 }}
          className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandYellow/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
        >
          {/* Left accent bar with gradient */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandYellow via-brandYellow to-brandYellow/70 rounded-l-2xl" />

          <div className="flex items-center gap-3 mb-4 pl-2">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
            >
              <TrendingUp className="w-5 h-5 text-brandYellow" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Qty Filling Ratio</h3>
              <p className="text-xs text-enterprise-textSecondary font-medium">SO to DN Quantity Ratio</p>
            </div>
          </div>

          <div className="h-52 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    {
                      name: 'Fulfilled (DN)',
                      value: derivedCards?.dnQty || 0,
                      fill: '#FEA418'
                    },
                    {
                      name: 'Pending',
                      value: Math.max(0, (derivedCards?.soQty || 0) - (derivedCards?.dnQty || 0)),
                      fill: '#DE1C1C'
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
                  <Cell fill="#FEA418" />
                  <Cell fill="#DE1C1C" />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as { name: string; value: number };
                      const soQtyTotal = derivedCards?.soQty || 0;
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
              <span className="text-3xl font-bold text-yellow-700 dark:text-yellow-500">
                {loading ? '-' : `${((derivedCards?.dnQty || 0) / (derivedCards?.soQty || 1) * 100).toFixed(1)}%`}
              </span>
              <span className="text-xs text-enterprise-textSecondary font-medium">Fulfilled</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-2 pl-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-600" />
              <span className="text-xs text-enterprise-textSecondary">DN Qty: {formatInLakhs(derivedCards?.dnQty)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-brandRed" />
              <span className="text-xs text-enterprise-textSecondary">Pending: {formatInLakhs(Math.max(0, (derivedCards?.soQty || 0) - (derivedCards?.dnQty || 0)))}</span>
            </div>
          </div>
        </motion.div>

        {/* CBM Fulfillment Half Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          whileHover={{ scale: 1.01, y: -2 }}
          className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandYellow/10 transition-all duration-300 overflow-hidden border border-enterprise-border group"
        >
          {/* Left accent bar with gradient */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandYellow via-brandYellow to-brandYellow/70 rounded-l-2xl" />

          <div className="flex items-center gap-3 mb-4 pl-2">
            <motion.div
              whileHover={{ rotate: -5, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
            >
              <Box className="w-5 h-5 text-brandYellow" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">CBM Filling Ratio</h3>
              <p className="text-xs text-enterprise-textSecondary font-medium">SO to DN Volume Ratio</p>
            </div>
          </div>

          <div className="h-52 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    {
                      name: 'Fulfilled (DN)',
                      value: derivedCards?.dnTotalCbm || 0,
                      fill: '#FEA418'
                    },
                    {
                      name: 'Pending',
                      value: Math.max(0, (derivedCards?.soTotalCbm || 0) - (derivedCards?.dnTotalCbm || 0)),
                      fill: '#DE1C1C'
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
                  <Cell fill="#FEA418" />
                  <Cell fill="#DE1C1C" />
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload as { name: string; value: number };
                      const soCbmTotal = derivedCards?.soTotalCbm || 0;
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
              <span className="text-3xl font-bold text-yellow-700 dark:text-yellow-500">
                {loading ? '-' : `${((derivedCards?.dnTotalCbm || 0) / (derivedCards?.soTotalCbm || 1) * 100).toFixed(1)}%`}
              </span>
              <span className="text-xs text-enterprise-textSecondary font-medium">Fulfilled</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-2 pl-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-600" />
              <span className="text-xs text-enterprise-textSecondary">DN CBM: {formatInThousands(derivedCards?.dnTotalCbm)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-brandRed" />
              <span className="text-xs text-enterprise-textSecondary">Pending: {formatInThousands(Math.max(0, (derivedCards?.soTotalCbm || 0) - (derivedCards?.dnTotalCbm || 0)))}</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Product Catagory Table - Premium Glassmorphism Design */}
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
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Category Wise OutBound</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Category distribution breakdown</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : categoryTableWithTotal.length > 0 ? (
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
              <div className="grid grid-cols-9 gap-3 px-3 py-2.5 mb-2 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 text-sm font-bold uppercase tracking-widest text-enterprise-textSecondary">
                <div className="col-span-2 text-left">Category</div>
                <div className="col-span-1 text-center">SO Count</div>
                <div className="col-span-1 text-center">SO Qty</div>
                <div className="col-span-1 text-center">SO CBM</div>
                <div className="col-span-1 text-center">DN Count</div>
                <div className="col-span-1 text-center">DN Qty</div>
                <div className="col-span-1 text-center">DN CBM</div>
                <div className="col-span-1 text-center">Pending Qty</div>
              </div>

              {/* Data Rows */}
              {categoryTableWithTotal.map((row, index) => (
                <motion.div
                  key={row.categoryLabel}
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
                    className={`relative ${row.categoryLabel === 'TOTAL'
                      ? 'bg-gradient-to-r from-enterprise-redTint via-enterprise-redTint/80 to-enterprise-redTint/50 border-2 border-brandRed/40 shadow-lg shadow-brandRed/10'
                      : 'bg-gradient-to-r from-white to-white/80 border border-enterprise-border/50 hover:border-brandYellow/30'
                      } rounded-lg p-3 overflow-hidden transition-all duration-200`}
                    whileHover={{
                      x: 2,
                      transition: { type: "spring", stiffness: 400, damping: 25 }
                    }}
                  >
                    {/* Grid Content */}
                    <div className={`relative grid grid-cols-9 gap-3 items-center ${row.categoryLabel === 'TOTAL' ? 'text-base font-bold' : ''
                      }`}>
                      {/* Category */}
                      <div className="col-span-2 flex items-center gap-2">
                        {row.categoryLabel === 'TOTAL' ? (
                          <>
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brandRed to-brandRed/70 flex items-center justify-center">
                              <span className="text-white text-xs font-bold">Σ</span>
                            </div>
                            <span className="text-brandRed font-bold text-base">
                              {row.categoryLabel}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="w-7 h-7 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                              <Package className="w-3.5 h-3.5 text-brandRed" />
                            </div>
                            <span className="text-enterprise-text font-medium text-base">
                              {row.categoryLabel}
                            </span>
                          </>
                        )}
                      </div>

                      {/* SO Count */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border border-brandRed/40'
                          : 'bg-enterprise-redTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed text-base font-bold'
                            : 'text-brandRed text-base'
                            }`}>
                            {formatNumber(row.soCount)}
                          </span>
                        </div>
                      </div>

                      {/* SO Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border border-brandRed/40'
                          : 'bg-enterprise-redTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed text-base font-bold'
                            : 'text-brandRed text-base'
                            }`}>
                            {formatNumber(row.soQty)}
                          </span>
                        </div>
                      </div>

                      {/* SO CBM */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border border-brandRed/40'
                          : 'bg-enterprise-redTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed text-base font-bold'
                            : 'text-brandRed text-base'
                            }`}>
                            {formatNumber(row.soTotalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* DN Count */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandYellow/20 border border-brandYellow/40'
                          : 'bg-enterprise-yellowTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-yellow-700 dark:text-yellow-500 text-base font-bold'
                            : 'text-amber-600 dark:text-amber-500 text-base'
                            }`}>
                            {formatNumber(row.dnCount)}
                          </span>
                        </div>
                      </div>

                      {/* DN Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandYellow/20 border border-brandYellow/40'
                          : 'bg-enterprise-yellowTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-yellow-700 dark:text-yellow-500 text-base font-bold'
                            : 'text-amber-600 dark:text-amber-500 text-base'
                            }`}>
                            {formatNumber(row.dnQty)}
                          </span>
                        </div>
                      </div>

                      {/* DN Total CBM */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandYellow/20 border border-brandYellow/40'
                          : 'bg-enterprise-yellowTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-yellow-700 dark:text-yellow-500 text-base font-bold'
                            : 'text-amber-600 dark:text-amber-500 text-base'
                            }`}>
                            {formatNumber(row.dnTotalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* Pending Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.categoryLabel === 'TOTAL'
                          ? 'bg-brandRed/20 border border-brandRed/40'
                          : row.soMinusDnQty > 0
                            ? 'bg-enterprise-redTint border border-brandRed/30'
                            : row.soMinusDnQty < 0
                              ? 'bg-enterprise-yellowTint border border-brandYellow/30'
                              : 'bg-gray-100 border border-gray-200'
                          }`}>
                          <span className={`font-medium font-mono ${row.categoryLabel === 'TOTAL'
                            ? 'text-brandRed text-base font-bold'
                            : row.soMinusDnQty > 0
                              ? 'text-brandRed text-base font-semibold'
                              : row.soMinusDnQty < 0
                                ? 'text-brandYellow text-base font-semibold'
                                : 'text-gray-500 text-base'
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
          <div className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border min-h-[580px]">
            {/* Left accent bar with gradient */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-4 pl-2 relative z-10">
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <Box className="w-5 h-5 text-brandRed" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">
                  Top 10 Selling Product CBM
                </h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">
                  Top Products by Volume
                </p>
              </div>
            </div>

            {/* Pie Chart */}
            {topProducts.length > 0 ? (
              <div className="h-80 pl-2">
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
                            '#f59e0b', '#9ca3af', '#f97316', '#6b7280', '#ef4444',
                            '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#eab308'
                          ][index % 10]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-enterprise-border shadow-xl">
                              <p className="text-sm font-semibold text-enterprise-text mb-1">
                                {data.fullName}
                              </p>
                              <p className="text-sm text-enterprise-textSecondary">
                                CBM: <span className="font-mono font-semibold text-brandRed">{formatNumber(data.value, 2)}</span>
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
            {topProducts.length > 0 && (() => {
              const totalCbm = topProducts.slice(0, 10).reduce((sum, p) => sum + p.totalCbm, 0);
              return (
                <div className="mt-4 pl-2 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {topProducts.slice(0, 10).map((product, index) => {
                    const percentage = ((product.totalCbm / totalCbm) * 100).toFixed(1);
                    return (
                      <div key={product.deliveryNoteItem} className="flex items-center gap-2 text-xs">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: [
                              '#f59e0b', '#9ca3af', '#f97316', '#6b7280', '#ef4444',
                              '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#eab308'
                            ][index % 10]
                          }}
                        />
                        <span className="text-enterprise-textSecondary truncate">
                          {product.deliveryNoteItem.length > 20
                            ? product.deliveryNoteItem.substring(0, 20) + '...'
                            : product.deliveryNoteItem} - {percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </motion.div>

        {/* Categories by CBM Pie Chart - Clean Design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          whileHover={{ y: -2 }}
          className="w-full"
        >
          <div className="relative bg-gradient-to-br from-white via-white to-emerald-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border min-h-[580px]">
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-emerald-500 via-emerald-500 to-emerald-500/70 rounded-l-2xl" />

            {/* Header */}
            <div className="flex items-center gap-3 mb-4 pl-2 relative z-10">
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-100/50 flex items-center justify-center shadow-sm"
              >
                <Package className="w-5 h-5 text-emerald-600" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">
                  Category Wise OutBound
                </h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">
                  Category distribution by CBM
                </p>
              </div>
            </div>

            {/* Pie Chart */}
            {productCategoryDonutData.some(item => item.value > 0) ? (
              <div className="h-80 pl-2">
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
                            <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-enterprise-border shadow-xl">
                              <p className="text-sm font-semibold text-enterprise-text mb-1">
                                {data.name}
                              </p>
                              <p className="text-sm text-enterprise-textSecondary">
                                CBM: <span className="font-mono font-semibold text-emerald-600">{formatNumber(data.value, 2)}</span>
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
            {productCategoryDonutData.some(item => item.value > 0) && (() => {
              const totalCbm = productCategoryDonutData.reduce((sum, cat) => sum + cat.value, 0);
              return (
                <div className="mt-4 pl-2 grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {productCategoryDonutData.map((category, index) => {
                    const percentage = ((category.value / totalCbm) * 100).toFixed(1);
                    return (
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
                        <span className="text-enterprise-textSecondary truncate">
                          {category.name} - {percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </motion.div>
      </div>

      {/* Top 10 Products - Clean Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        whileHover={{ y: -2 }}
        className="w-full mb-8"
      >
        <div className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/20 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
          {/* Left accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-500 via-amber-500 to-amber-500/70 rounded-l-2xl" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 relative z-10 pl-2">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
              >
                <Trophy className="w-5 h-5 text-amber-600" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Top 10 Selling Product CBM Wise</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Ranked by {topProductsRankBy === 'cbm' ? 'CBM' : 'Quantity'}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
                <button
                  onClick={() => handleRankByChange('cbm')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${topProductsRankBy === 'cbm'
                    ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                >
                  By CBM
                </button>
                <button
                  onClick={() => handleRankByChange('qty')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${topProductsRankBy === 'qty'
                    ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                >
                  By Qty
                </button>
              </div>
              <div className="flex items-center bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
                <button
                  onClick={() => handleSortOrderChange('top')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${topProductsSortOrder === 'top'
                    ? 'bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                    }`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  Top
                </button>
                <button
                  onClick={() => handleSortOrderChange('bottom')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${topProductsSortOrder === 'bottom'
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
              <div className="grid grid-cols-12 gap-3 px-3 py-2.5 mb-2 bg-gradient-to-r from-enterprise-yellowTint/40 to-transparent rounded-lg border border-enterprise-border/50 text-sm font-bold uppercase tracking-widest text-enterprise-textSecondary">
                <div className="col-span-1 text-center">Rank</div>
                <div className="col-span-4 text-left">Product Item</div>
                <div className="col-span-2 text-center">Category</div>
                <div className="col-span-2 text-center">
                  <span className={topProductsRankBy === 'qty' ? 'text-amber-600 dark:text-amber-500' : ''}>DN Qty</span>
                </div>
                <div className="col-span-2 text-center">
                  <span className={topProductsRankBy === 'cbm' ? 'text-amber-600 dark:text-amber-500' : ''}>DN CBM</span>
                </div>
                <div className="col-span-1 text-center">% Total</div>
              </div>

              {/* Data Rows */}
              {topProducts.map((product, index) => (
                <motion.div
                  key={product.deliveryNoteItem}
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
                    className="relative bg-gradient-to-r from-white to-white/80 border border-enterprise-border/50 hover:border-amber-500/30 rounded-lg p-3 overflow-hidden transition-all duration-200"
                    whileHover={{
                      x: 2,
                      transition: { type: "spring", stiffness: 400, damping: 25 }
                    }}
                  >
                    <div className="relative grid grid-cols-12 gap-3 items-center">
                      {/* Rank */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${product.rank === 1
                          ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30'
                          : product.rank === 2
                            ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-md'
                            : product.rank === 3
                              ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/20'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
                          }`}>
                          {product.rank}
                        </div>
                      </div>

                      {/* Product Name */}
                      <div className="col-span-4 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-enterprise-yellowTint flex items-center justify-center">
                          <Package className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <span className="text-enterprise-text font-medium text-base truncate">
                          {product.deliveryNoteItem}
                        </span>
                      </div>

                      {/* Category */}
                      <div className="col-span-2 flex justify-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50">
                          {product.productCategory}
                        </span>
                      </div>

                      {/* DN Qty */}
                      <div className="col-span-2 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${topProductsRankBy === 'qty'
                          ? 'bg-amber-500/20 border border-amber-500/40'
                          : 'bg-enterprise-yellowTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono text-base ${topProductsRankBy === 'qty'
                            ? 'text-amber-600 dark:text-amber-500'
                            : 'text-enterprise-text'
                            }`}>
                            {formatNumber(product.totalQty)}
                          </span>
                        </div>
                      </div>

                      {/* DN CBM */}
                      <div className="col-span-2 flex justify-center">
                        <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${topProductsRankBy === 'cbm'
                          ? 'bg-amber-500/20 border border-amber-500/40'
                          : 'bg-enterprise-yellowTint/50 border border-enterprise-border/50'
                          }`}>
                          <span className={`font-medium font-mono text-base ${topProductsRankBy === 'cbm'
                            ? 'text-amber-600 dark:text-amber-500'
                            : 'text-enterprise-text'
                            }`}>
                            {formatNumber(product.totalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* % of Total */}
                      <div className="col-span-1 flex justify-center">
                        <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200/50 dark:border-emerald-700/50">
                          <span className="font-medium font-mono text-base text-emerald-600 dark:text-emerald-400">
                            {formatNumber(product.percentageOfTotal, 2)}%
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
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No product data available</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Time Series Charts - Clean Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        {/* View by toggle - Clean Design */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
            >
              <TrendingUp className="w-5 h-5 text-brandRed" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Time Series Analysis</h3>
              <p className="text-xs text-enterprise-textSecondary font-medium">View by granularity</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
            {(['month', 'week', 'day'] as const).map((granularity) => (
              <motion.button
                key={granularity}
                onClick={() => handleTimeGranularityChange(granularity)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${timeGranularity === granularity
                  ? 'bg-white dark:bg-slate-600 text-brandRed shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                  }`}
                suppressHydrationWarning={true}
              >
                {granularity.charAt(0).toUpperCase() + granularity.slice(1)}
              </motion.button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SO vs DN Qty Chart - Clean Design */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-blue-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

            <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
              <div>
                <h3 className="text-lg font-bold text-enterprise-text mb-1">SO Qty vs DN Qty</h3>
                <p className="text-xs text-enterprise-textSecondary">Quantity comparison (in Lakhs)</p>
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
                      <linearGradient id="soQtyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="dnQtyGradient" x1="0" y1="0" x2="0" y2="1">
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
                      className="text-gray-600 dark:text-slate-400"
                      axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      tickFormatter={(value: number) => formatInLakhs(value)}
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
                    <Bar
                      dataKey="soQty"
                      fill="url(#soQtyGradient)"
                      radius={[8, 8, 0, 0]}
                      name="SO qty"
                      cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                      activeBar={{ stroke: 'black', strokeWidth: 1 }}
                    >
                      <LabelList
                        dataKey="soQty"
                        position="top"
                        formatter={(value: any) => (value / 100000).toFixed(2)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar
                      dataKey="dnQty"
                      fill="url(#dnQtyGradient)"
                      radius={[8, 8, 0, 0]}
                      name="DN Qty"
                      cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                      activeBar={{ stroke: 'black', strokeWidth: 1 }}
                    >
                      <LabelList
                        dataKey="dnQty"
                        position="top"
                        formatter={(value: any) => (value / 100000).toFixed(2)}
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

          {/* SO vs DN Total CBM Chart - Clean Design */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            whileHover={{ y: -2 }}
            className="relative bg-gradient-to-br from-white via-white to-amber-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-amber-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border"
          >
            {/* Left accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-500 via-amber-500 to-amber-500/70 rounded-l-2xl" />

            <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
              <div>
                <h3 className="text-lg font-bold text-enterprise-text mb-1">SO CBM vs DN CBM</h3>
                <p className="text-xs text-enterprise-textSecondary">Volume comparison</p>
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
                      <linearGradient id="soCbmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="dnCbmGradient" x1="0" y1="0" x2="0" y2="1">
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
                      className="text-gray-600 dark:text-slate-400"
                      axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'currentColor' }}
                      className="text-gray-600 dark:text-slate-400"
                      axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                      tickFormatter={(value: number) => formatCbmForChart(value)}
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
                    <Bar
                      dataKey="soTotalCbm"
                      fill="url(#soCbmGradient)"
                      radius={[8, 8, 0, 0]}
                      name="SO Total CBM"
                      cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                      activeBar={{ stroke: 'black', strokeWidth: 1 }}
                    >
                      <LabelList
                        dataKey="soTotalCbm"
                        position="top"
                        formatter={(value: any) => formatCbmForChart(value)}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar
                      dataKey="dnTotalCbm"
                      fill="url(#dnCbmGradient)"
                      radius={[8, 8, 0, 0]}
                      name="DN Total CBM"
                      cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                      activeBar={{ stroke: 'black', strokeWidth: 1 }}
                    >
                      <LabelList
                        dataKey="dnTotalCbm"
                        position="top"
                        formatter={(value: any) => formatCbmForChart(value)}
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

      {/* Daily OutBound Summary - Clean Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        whileHover={{ y: -2 }}
        className="w-full mb-8"
      >
        <div className="relative bg-gradient-to-br from-white via-white to-enterprise-redTint/20 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-brandRed/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
          {/* Left accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ rotate: -5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <ArrowUpFromLine className="w-5 h-5 text-brandRed" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Daily OutBound Summary</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Day-wise breakdown</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : data?.summaryTotals ? (
            <div className="relative pl-2">
              <motion.div
                className="space-y-1.5"
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
                <div className="grid grid-cols-8 gap-3 px-3 py-2.5 mb-2 bg-gradient-to-r from-enterprise-redTint/40 to-transparent rounded-lg border border-enterprise-border/50 text-sm font-bold uppercase tracking-widest text-enterprise-textSecondary">
                  <div className="text-left">Date</div>
                  <div className="text-center">SO Qty</div>
                  <div className="text-center">DN Qty</div>
                  <div className="text-center">DN CBM</div>
                  <div className="text-center">Pend Qty</div>
                  <div className="text-center">Pend CBM</div>
                  <div className="text-center">EDEL Qty</div>
                  <div className="text-center">EDEL CBM</div>
                </div>

                {/* Scrollable Data Rows */}
                <div className="max-h-96 overflow-y-auto overflow-x-hidden space-y-1.5">
                  {data.summaryTotals.dayData && data.summaryTotals.dayData.length > 0 ? (
                    data.summaryTotals.dayData.map((day, index) => (
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
                          className="relative bg-gradient-to-r from-white to-white/80 border border-enterprise-border/50 hover:border-brandRed/30 rounded-lg p-3 overflow-hidden transition-all duration-200"
                          whileHover={{
                            x: 2,
                            transition: { type: "spring", stiffness: 400, damping: 25 }
                          }}
                        >
                          <div className="relative grid grid-cols-8 gap-3 items-center">
                            {/* Date */}
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-enterprise-redTint flex items-center justify-center">
                                <Calendar className="w-3.5 h-3.5 text-brandRed" />
                              </div>
                              <span className="text-enterprise-text font-medium text-base truncate">
                                {day.label}
                              </span>
                            </div>

                            {/* SO Qty */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 border border-blue-200/50 dark:border-blue-700/50">
                                <span className="text-blue-600 dark:text-blue-400 text-base font-medium font-mono">
                                  {formatNumber(day.soQty)}
                                </span>
                              </div>
                            </div>

                            {/* DN Qty */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 border border-amber-200/50 dark:border-amber-700/50">
                                <span className="text-amber-600 dark:text-amber-400 text-base font-medium font-mono">
                                  {formatNumber(day.dnQty)}
                                </span>
                              </div>
                            </div>

                            {/* DN CBM */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 border border-amber-200/50 dark:border-amber-700/50">
                                <span className="text-amber-600 dark:text-amber-400 text-base font-medium font-mono">
                                  {formatNumber(day.dnCbm, 2)}
                                </span>
                              </div>
                            </div>

                            {/* Pending Qty (SO - DN) */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-red-50 dark:bg-red-900/30 border border-red-200/50 dark:border-red-700/50">
                                <span className="text-red-600 dark:text-red-400 text-base font-medium font-mono">
                                  {formatNumber((day.soQty || 0) - (day.dnQty || 0))}
                                </span>
                              </div>
                            </div>

                            {/* Pending CBM (SO - DN) */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-red-50 dark:bg-red-900/30 border border-red-200/50 dark:border-red-700/50">
                                <span className="text-red-600 dark:text-red-400 text-base font-medium font-mono">
                                  {formatNumber((day.soCbm || 0) - (day.dnCbm || 0), 2)}
                                </span>
                              </div>
                            </div>

                            {/* EDEL DN Qty */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-purple-50 dark:bg-purple-900/30 border border-purple-200/50 dark:border-purple-700/50">
                                <span className="text-purple-600 dark:text-purple-400 text-base font-medium font-mono">
                                  {formatNumber(day.edelDnQty)}
                                </span>
                              </div>
                            </div>

                            {/* EDEL DN CBM */}
                            <div className="flex justify-center">
                              <div className="w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center bg-purple-50 dark:bg-purple-900/30 border border-purple-200/50 dark:border-purple-700/50">
                                <span className="text-purple-600 dark:text-purple-400 text-base font-medium font-mono">
                                  {formatNumber(day.edelDnCbm, 2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    ))
                  ) : null}
                </div>

                {/* Total Row */}
                {data.summaryTotals.dayData && data.summaryTotals.dayData.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    className="relative mt-3"
                  >
                    <div className="relative bg-gradient-to-r from-enterprise-redTint via-enterprise-redTint/80 to-enterprise-redTint/50 border-2 border-brandRed/40 shadow-lg shadow-brandRed/10 rounded-lg p-3 overflow-hidden">
                      <div className="relative grid grid-cols-8 gap-3 items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brandRed to-brandRed/70 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">Σ</span>
                          </div>
                          <span className="text-brandRed font-bold text-base">TOTAL</span>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-blue-500/20 border border-blue-500/40">
                            <span className="text-blue-700 dark:text-blue-400 text-base font-bold font-mono">{formatNumber(data.summaryTotals.totalSoQty)}</span>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-amber-500/20 border border-amber-500/40">
                            <span className="text-yellow-700 dark:text-yellow-500 text-base font-bold font-mono">{formatNumber(data.summaryTotals.totalDnQty)}</span>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-amber-500/20 border border-amber-500/40">
                            <span className="text-yellow-700 dark:text-yellow-500 text-base font-bold font-mono">{formatNumber(data.summaryTotals.totalDnCbm, 2)}</span>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-red-500/20 border border-red-500/40">
                            <span className="text-red-700 dark:text-red-400 text-base font-bold font-mono">{formatNumber((data.summaryTotals.totalSoQty || 0) - (data.summaryTotals.totalDnQty || 0))}</span>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-red-500/20 border border-red-500/40">
                            <span className="text-red-700 dark:text-red-400 text-base font-bold font-mono">{formatNumber((data.summaryTotals.totalSoCbm || 0) - (data.summaryTotals.totalDnCbm || 0), 2)}</span>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-purple-500/20 border border-purple-500/40">
                            <span className="text-purple-700 dark:text-purple-400 text-base font-bold font-mono">{formatNumber(data.summaryTotals.totalEdelDnQty)}</span>
                          </div>
                        </div>

                        <div className="flex justify-center">
                          <div className="w-full px-2 py-1 rounded-md inline-flex items-center justify-center bg-purple-500/20 border border-purple-500/40">
                            <span className="text-purple-700 dark:text-purple-400 text-base font-bold font-mono">{formatNumber(data.summaryTotals.totalEdelDnCbm, 2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400 relative z-10">
              <div className="text-center">
                <ArrowUpFromLine className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No summary data available</p>
              </div>
            </div>
          )}
        </div >
      </motion.div >

      {/* Fulfillment Table - Clean Design */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        whileHover={{ y: -2 }}
        className="w-full mb-8"
      >
        <div className="relative bg-gradient-to-br from-white via-white to-enterprise-yellowTint/20 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
          {/* Left accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-amber-500 via-amber-500 to-amber-500/70 rounded-l-2xl" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
              >
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </motion.div>
              <div>
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Fulfillment Table</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">Daily Fulfillment Rates (Sort by Dispatch Date)</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : fulfillmentRows.length > 0 ? (
            <div className="relative pl-2">
              <motion.div
                className="space-y-1.5"
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
                <div className="grid grid-cols-5 gap-3 px-3 py-2.5 mb-2 bg-gradient-to-r from-emerald-100/40 to-transparent rounded-lg border border-enterprise-border/50 text-sm font-bold uppercase tracking-widest text-enterprise-textSecondary">
                  <div className="text-center">Date</div>
                  <div className="text-center">SO Qty</div>
                  <div className="text-center">DN Qty</div>
                  <div className="text-center">Pending</div>
                  <div className="text-center">%</div>
                </div>

                {/* Scrollable Data Rows */}
                <div className="max-h-96 overflow-y-auto overflow-x-hidden space-y-1.5">
                  {fulfillmentRows.map((row, index) => (
                    <motion.div
                      key={row.date}
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
                        className={`relative bg-gradient-to-r from-white to-white/80 border rounded-lg p-3 overflow-hidden transition-all duration-200 ${row.date === 'Average'
                          ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-50 via-emerald-50/80 to-emerald-50/50'
                          : 'border-enterprise-border/50 hover:border-emerald-500/30'
                          }`}
                        whileHover={{
                          x: row.date === 'Average' ? 0 : 2,
                          transition: { type: "spring", stiffness: 400, damping: 25 }
                        }}
                      >
                        <div className="relative grid grid-cols-5 gap-3 items-center">
                          {/* Date */}
                          <div className="flex items-center justify-center gap-2">
                            {row.date === 'Average' ? (
                              <>
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">Σ</span>
                                </div>
                                <span className="text-emerald-700 font-bold text-base">AVERAGE</span>
                              </>
                            ) : (
                              <>
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <span className="text-enterprise-text font-medium text-base truncate">
                                  {row.date}
                                </span>
                              </>
                            )}
                          </div>

                          {/* SO Qty */}
                          <div className="flex justify-center">
                            <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.date === 'Average'
                              ? 'bg-blue-500/20 border border-blue-500/40'
                              : 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200/50 dark:border-blue-700/50'
                              }`}>
                              <span className={`font-medium font-mono text-base ${row.date === 'Average'
                                ? 'text-blue-700 dark:text-blue-400 font-bold'
                                : 'text-blue-600 dark:text-blue-400'
                                }`}>
                                {formatNumber(row.soQty)}
                              </span>
                            </div>
                          </div>

                          {/* DN Qty */}
                          <div className="flex justify-center">
                            <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.date === 'Average'
                              ? 'bg-amber-500/20 border border-amber-500/40'
                              : 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200/50 dark:border-amber-700/50'
                              }`}>
                              <span className={`font-medium font-mono text-base ${row.date === 'Average'
                                ? 'text-yellow-700 dark:text-yellow-500 font-bold'
                                : 'text-amber-600 dark:text-amber-400'
                                }`}>
                                {formatNumber(row.dnQty)}
                              </span>
                            </div>
                          </div>

                          {/* Pending */}
                          <div className="flex justify-center">
                            <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.date === 'Average'
                              ? 'bg-red-500/20 border border-red-500/40'
                              : 'bg-red-50 dark:bg-red-900/30 border border-red-200/50 dark:border-red-700/50'
                              }`}>
                              <span className={`font-medium font-mono text-base ${row.date === 'Average'
                                ? 'text-red-700 dark:text-red-400 font-bold'
                                : 'text-red-600 dark:text-red-400'
                                }`}>
                                {formatNumber(row.pending)}
                              </span>
                            </div>
                          </div>

                          {/* Percentage */}
                          <div className="flex justify-center">
                            <div className={`w-full min-w-[3.5rem] px-2 py-1 rounded-md inline-flex items-center justify-center ${row.date === 'Average'
                              ? 'bg-emerald-500/20 border border-emerald-500/40'
                              : 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200/50 dark:border-emerald-700/50'
                              }`}>
                              <span className={`font-medium font-mono text-base ${row.date === 'Average'
                                ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                : 'text-emerald-600 dark:text-emerald-400'
                                }`}>
                                {formatNumber(row.percentage, 2)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400 relative z-10">
              <div className="text-center">
                <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No fulfillment data available</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
