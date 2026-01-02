'use client';

import { useState, useEffect, Suspense, useRef, useMemo } from 'react';
import { authenticatedFetch } from '@/lib/api';
import { useDateFilter } from '@/lib/date-filter-context';
import { formatHeaderDateShort } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { MetricCard } from '@/components/ui/metric-card';
import { Boxes, Package, Box, ChevronDown, Check, Calendar, ArrowRightLeft, Search, RefreshCw, TrendingUp, Download, Info, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';

interface InventoryCardMetrics {
  inboundSkuCount: number;
  inventoryQtyTotal: number;
  totalCbm: number;
}

interface InventoryFilters {
  availableItemGroups: string[];
  availableProductCategories?: string[];
  availableDateRange?: {
    minDate: string | null;
    maxDate: string | null;
  };
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
  warehouse: string;     // Combined warehouses like "HR11 + HR12"
  itemGroup: string;
  productCategory: string;
  avgQty: number;        // AVG QTY of inventory for latest month
  currentQty: number;    // Latest/Current inventory QTY (sum across warehouses)
  dnQty: number;         // DN QTY for last 90 days
  dnCbm: number;         // DN CBM for last 90 days
  cbm: number;           // CBM (inventory) based on current qty
  salesPerDay: number;   // Sales/Day = Total DN QTY / 90 days
}

interface FastMovingSkusResponse {
  skus: FastMovingSku[];
  summary: {
    totalSkus: number;
    totalDnQty: number;
    totalDnCbm: number;
  };
  filters: {
    availableWarehouses: string[];
    availableProductCategories: string[];
  };
  salesDateRange?: {
    minDate: string | null;
    maxDate: string | null;
    totalDays: number;
  };
  latestInventoryMonth?: string;
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
  dnCount?: number;
  deliveryNoteCount?: number;
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

  const [fastMovingLimit, setFastMovingLimit] = useState(10);
  const [showFastMovingSection, setShowFastMovingSection] = useState(true);
  const [fastMovingPage, setFastMovingPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Slow-moving SKUs state
  const [zeroOrderData, setZeroOrderData] = useState<ZeroOrderProductsResponse | null>(null);
  const [zeroOrderLoading, setZeroOrderLoading] = useState(false);
  const [zeroOrderError, setZeroOrderError] = useState<string | null>(null);
  const [zeroOrderWarehouse, setZeroOrderWarehouse] = useState('ALL');
  const [zeroOrderCategory, setZeroOrderCategory] = useState('ALL');
  const [minDaysInStock, setMinDaysInStock] = useState(7);
  const [zeroOrderLimit, setZeroOrderLimit] = useState(10);
  const [showZeroOrderSection, setShowZeroOrderSection] = useState(true);
  const [zeroOrderPage, setZeroOrderPage] = useState(0);

  // Derived totals for slow-moving table
  const zeroOrderTotals = useMemo(() => {
    if (!zeroOrderData?.products?.length) {
      return { stock: 0, cbm: 0 };
    }
    return zeroOrderData.products.reduce(
      (acc, p) => ({
        stock: acc.stock + (p.latestStockQty || 0),
        cbm: acc.cbm + (p.totalCbm || 0),
      }),
      { stock: 0, cbm: 0 }
    );
  }, [zeroOrderData]);

  // Info tooltip states
  const [showFastMovingInfo, setShowFastMovingInfo] = useState(false);
  const [showZeroOrderInfo, setShowZeroOrderInfo] = useState(false);

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
  
  const [selectedItemGroup, setSelectedItemGroup] = useState('ALL');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [chartDisplayMode, setChartDisplayMode] = useState<'value' | 'percentage'>('value');
  const [filtersDirty, setFiltersDirty] = useState(false);

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

  useEffect(() => {
    // On initial load, fetch without filters first to get available date range
    // Then auto-select the latest available month if current month has no data
    const initializeWithLatestMonth = async () => {
      try {
        setLoading(true);
        setError(null);

        // First fetch without date filters to get available data range
        const response = await authenticatedFetch('/inventory/summary');
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('No inventory data available. Please upload a Daily Stock Analytics Excel file first.');
          }
          throw new Error('Failed to fetch inventory data from backend');
        }

        const result: InventorySummaryResponse = await response.json();
        
        // Check if there's data in the current month or if we need to use the latest available month
        const availableMaxDate = result.filters.availableDateRange?.maxDate;
        const availableMinDate = result.filters.availableDateRange?.minDate;
        
        if (availableMaxDate && availableMinDate) {
          const maxDate = new Date(availableMaxDate);
          const minDateObj = new Date(availableMinDate);
          const maxYear = maxDate.getUTCFullYear();
          const maxMonth = maxDate.getUTCMonth() + 1;
          const latestAvailableMonth = `${maxYear}-${String(maxMonth).padStart(2, '0')}`;
          
          // Get current month (what the filter defaults to)
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth() + 1;
          const currentMonthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
          const currentMonthEnd = new Date(Date.UTC(currentYear, currentMonth, 0));
          
          // If current month is outside available data range, use latest available month
          if (currentMonthStart > maxDate || currentMonthEnd < minDateObj) {
            // Update the selected month to the latest available month
            setMonthWithDates(latestAvailableMonth);
            
            // Fetch with the new month filter
            const startDate = new Date(Date.UTC(maxYear, maxMonth - 1, 1));
            const endDate = new Date(Date.UTC(maxYear, maxMonth, 0));
            const params = new URLSearchParams();
            params.append('fromDate', formatDateUTC(startDate));
            params.append('toDate', formatDateUTC(endDate));
            
            const filteredResponse = await authenticatedFetch(`/inventory/summary?${params.toString()}`);
            if (filteredResponse.ok) {
              const filteredResult: InventorySummaryResponse = await filteredResponse.json();
              setData(filteredResult);
              setChartData(filteredResult.timeSeries);
              setFullChartData(result.timeSeries); // Keep unfiltered for charts
            } else {
              // Fallback to unfiltered data
              setData(result);
              setChartData(result.timeSeries);
              setFullChartData(result.timeSeries);
            }
          } else {
            // Current month is within available range, use default fetch with filters
            setData(result);
            setFullChartData(result.timeSeries);
            // Now fetch with current month filter
            const params = new URLSearchParams();
            params.append('fromDate', formatDateUTC(currentMonthStart));
            params.append('toDate', formatDateUTC(currentMonthEnd));
            
            const filteredResponse = await authenticatedFetch(`/inventory/summary?${params.toString()}`);
            if (filteredResponse.ok) {
              const filteredResult: InventorySummaryResponse = await filteredResponse.json();
              setData(filteredResult);
              setChartData(filteredResult.timeSeries);
            } else {
              setChartData(result.timeSeries);
            }
          }
        } else {
          // No date range info, just use unfiltered data
          setData(result);
          setChartData(result.timeSeries);
          setFullChartData(result.timeSeries);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred while fetching inventory data';
        setError(errorMessage);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    initializeWithLatestMonth();
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
            const startDate = new Date(Date.UTC(year, month - 1, 1));
            const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
            params.append('fromDate', formatDateUTC(startDate));
            params.append('toDate', formatDateUTC(endDate));
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

      const response = await authenticatedFetch(`/inventory/summary?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No inventory data available. Please upload a Daily Stock Analytics Excel file first.');
        }
        throw new Error('Failed to fetch inventory data from backend');
      }

      const result: InventorySummaryResponse = await response.json();
      setData(result);
      setChartData(result.timeSeries);

      // Fetch unfiltered data for charts (always show all months)
      if (!useFilters) {
        // On initial load, also set fullChartData
        setFullChartData(result.timeSeries);
      } else {
        // When filters are applied, fetch unfiltered data separately for charts
        try {
          const unfilteredResponse = await authenticatedFetch('/inventory/summary');
          if (unfilteredResponse.ok) {
            const unfilteredResult: InventorySummaryResponse = await unfilteredResponse.json();
            setFullChartData(unfilteredResult.timeSeries);
          }
        } catch (err) {
          console.error('Failed to fetch unfiltered chart data:', err);
        }
      }

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

  const handleDownloadSummary = async () => {
    try {
      const params = new URLSearchParams();

      if (uploadIdParam) {
        params.append('uploadId', uploadIdParam);
      }

      if (selectedMonth && selectedMonth !== 'ALL') {
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
        selectedProductCategories.forEach((cat) => params.append('productCategory', cat));
      }

      if (selectedWarehouse && selectedWarehouse !== 'ALL') {
        params.append('warehouse', selectedWarehouse);
      }

      // Fetch all data in parallel: summary + fast-moving + slow-moving
      const fastMovingParams = new URLSearchParams();
      fastMovingParams.append('limit', '1000'); // Get all for export
      if (fastMovingWarehouse && fastMovingWarehouse !== 'ALL') {
        fastMovingParams.append('warehouse', fastMovingWarehouse);
      }
      if (fastMovingCategory && fastMovingCategory !== 'ALL') {
        fastMovingParams.append('productCategory', fastMovingCategory);
      }

      const zeroOrderParams = new URLSearchParams();
      zeroOrderParams.append('limit', '1000'); // Get all for export
      if (zeroOrderWarehouse && zeroOrderWarehouse !== 'ALL') {
        zeroOrderParams.append('warehouse', zeroOrderWarehouse);
      }
      if (zeroOrderCategory && zeroOrderCategory !== 'ALL') {
        zeroOrderParams.append('productCategory', zeroOrderCategory);
      }
      zeroOrderParams.append('minDaysInStock', minDaysInStock.toString());

      const [summaryResponse, fastMovingResponse, zeroOrderResponse] = await Promise.all([
        authenticatedFetch(`/inventory/download-summary?${params.toString()}`),
        authenticatedFetch(`/inventory/fast-moving-skus?${fastMovingParams.toString()}`),
        authenticatedFetch(`/inventory/zero-order-products?${zeroOrderParams.toString()}`),
      ]);

      if (!summaryResponse.ok) {
        throw new Error('Failed to download inventory summary');
      }

      // Get the original workbook from backend
      const arrayBuffer = await summaryResponse.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Add Fast Moving SKUs sheet
      let fastMovingExportData = fastMovingData;
      if (fastMovingResponse.ok) {
        try {
          fastMovingExportData = await fastMovingResponse.json();
        } catch (e) {
          console.error('Failed to parse fast-moving data:', e);
        }
      }
      
      if (fastMovingExportData?.skus?.length) {
        const fastMovingRows = [
          ['Fast Moving SKUs Report'],
          ['Generated on: ' + new Date().toLocaleString()],
          [],
          ['Item (SKU)', 'Warehouse', 'Item Group', 'Avg Inventory Qty', 'Current Inventory Qty', 'Sales/Day', 'DN Qty', 'DN CBM', 'CBM'],
          ...fastMovingExportData.skus.map(sku => [
            sku.item,
            sku.warehouse,
            sku.itemGroup,
            sku.avgQty,
            sku.currentQty,
            sku.salesPerDay?.toFixed(2) || 0,
            sku.dnQty,
            sku.dnCbm?.toFixed(2) || 0,
            sku.cbm?.toFixed(2) || 0,
          ])
        ];
        const fastMovingSheet = XLSX.utils.aoa_to_sheet(fastMovingRows);
        fastMovingSheet['!cols'] = [
          { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
        ];
        XLSX.utils.book_append_sheet(workbook, fastMovingSheet, 'Fast Moving SKUs');
      }

      // Add Slow Moving SKUs sheet
      let zeroOrderExportData = zeroOrderData;
      if (zeroOrderResponse.ok) {
        try {
          zeroOrderExportData = await zeroOrderResponse.json();
        } catch (e) {
          console.error('Failed to parse slow-moving data:', e);
        }
      }

      if (zeroOrderExportData?.products?.length) {
        const slowMovingRows = [
          ['Non-Moving / Slow Moving SKUs Report'],
          ['Generated on: ' + new Date().toLocaleString()],
          [],
          ['Item', 'Warehouse', 'Item Group', 'Latest Stock Qty', 'CBM Blocked', 'DN Count'],
          ...zeroOrderExportData.products.map(product => [
            product.item,
            product.warehouse,
            product.itemGroup,
            product.latestStockQty,
            product.totalCbm?.toFixed(2) || 0,
            product.dnCount ?? product.deliveryNoteCount ?? 0,
          ])
        ];
        const slowMovingSheet = XLSX.utils.aoa_to_sheet(slowMovingRows);
        slowMovingSheet['!cols'] = [
          { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(workbook, slowMovingSheet, 'Slow Moving SKUs');
      }

      // Write the modified workbook to a blob and download
      const wbOut = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory-summary.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Inventory summary download failed:', error);
      alert('Failed to download inventory summary. Please try again.');
    }
  };

  const handleReset = () => {
    resetFilters();
    setSelectedItemGroup('ALL');
    setFiltersDirty(false);
    fetchSummary(false);
  };

  const handleFilter = () => {
    fetchSummary(true);
    setFiltersDirty(true);
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

      params.append('limit', fastMovingLimit.toString());

      const response = await authenticatedFetch(`/inventory/fast-moving-skus?${params.toString()}`);

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

  // Fetch fast-moving SKUs on mount only
  useEffect(() => {
    if (data) {
      fetchFastMovingSkus();
    }
  }, [data]);

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

  // Fetch slow-moving SKUs
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
      params.append('limit', zeroOrderLimit.toString());

      // Add selected month as date range for DN count calculation
      if (selectedMonth && selectedMonth !== 'ALL') {
        const [year, month] = selectedMonth.split('-').map(Number);
        if (year && month) {
          const startDate = new Date(year, month - 1, 1);
          const endDate = new Date(year, month, 0);
          const formatDate = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };
          params.append('fromDate', formatDate(startDate));
          params.append('toDate', formatDate(endDate));
        }
      } else if (fromDate && toDate) {
        // Use custom date range if no month selected
        params.append('fromDate', fromDate);
        params.append('toDate', toDate);
      }

      const response = await authenticatedFetch(`/inventory/zero-order-products?${params.toString()}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No inventory data available');
        }
        throw new Error('Failed to fetch slow-moving SKUs');
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

  // Fetch slow-moving SKUs on mount only
  useEffect(() => {
    if (data) {
      fetchZeroOrderProducts();
    }
  }, [data]);

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
    const allCategories = (data?.filters.availableProductCategories || []).filter(c => c !== 'ALL');
    setSelectedProductCategories(allCategories);
    setFiltersDirty(true);
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
  const [fullChartData, setFullChartData] = useState<InventoryTimeSeriesData | null>(null);

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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-red-500 to-red-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">Inventory Qty</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-yellow-500 to-yellow-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">EDEL Inventory Qty</span>
      </div>
    </div>
  );

  const CbmLegend = () => (
    <div className="flex justify-end gap-4 text-xs font-semibold">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200/50 dark:border-red-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-red-500 to-red-600 shadow-sm" />
        <span className="text-gray-700 dark:text-slate-300">Total CBM</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
        <div className="w-3 h-3 rounded bg-gradient-to-br from-yellow-500 to-yellow-600 shadow-sm" />
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

  const getWeekStart = (year: number, week: number): Date => {
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7 - firstDayOfYear.getDay();
    return new Date(year, 0, 1 + daysOffset);
  };

  // Function to convert data to percentage
  const convertToPercentage = (points: InventoryTimeSeriesPoint[]): InventoryTimeSeriesPoint[] => {
    return points.map(point => {
      const totalQty = point.inventoryQty + point.edelInventoryQty;
      const totalCbm = point.totalCbm + point.edelTotalCbm;

      return {
        ...point,
        inventoryQty: totalQty > 0 ? (point.inventoryQty / totalQty) * 100 : 0,
        edelInventoryQty: totalQty > 0 ? (point.edelInventoryQty / totalQty) * 100 : 0,
        totalCbm: totalCbm > 0 ? (point.totalCbm / totalCbm) * 100 : 0,
        edelTotalCbm: totalCbm > 0 ? (point.edelTotalCbm / totalCbm) * 100 : 0,
      };
    });
  };

  const getDisplayPoints = (): InventoryTimeSeriesPoint[] => {
    // For month view: use fullChartData (show all months regardless of filter)
    // For week/day view: use chartData (respect date filter to show only selected month)
    const sourceData = timeGranularity === 'month' ? fullChartData : chartData;
    
    if (!sourceData || !sourceData.points) return [];
    const points = sourceData.points;

    if (timeGranularity === 'day') {
      return chartDisplayMode === 'percentage' ? convertToPercentage(points) : points;
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
        label = `${monthNames[month]} ${year}`;
      } else {
        // week
        const year = d.getFullYear();
        const week = getISOWeek(d);
        key = `${year}-W${String(week).padStart(2, '0')}`;

        // Calculate week label in format WeekN'Mon
        const weekStart = getWeekStart(year, week);
        const weekMonth = weekStart.getMonth();
        const firstDayOfMonth = new Date(weekStart.getFullYear(), weekMonth, 1);
        const weekOfMonth = Math.ceil((weekStart.getDate() + firstDayOfMonth.getDay()) / 7);

        label = `Week${weekOfMonth}'${monthNames[weekMonth]}`;
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
    const result = Object.keys(groups)
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

    return chartDisplayMode === 'percentage' ? convertToPercentage(result) : result;
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

  const handleChartClick = (data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;

    if (timeGranularity === 'month') return;

    const payload = data.activePayload[0].payload;
    const dateKey = payload.date; // "YYYY-MM-DD" for day, "YYYY-WNN" for week

    if (timeGranularity === 'week') {
      const match = dateKey.match(/^(\d{4})-W(\d{1,2})$/);
      if (match) {
        const year = parseInt(match[1], 10);
        const week = parseInt(match[2], 10);
        const startDate = getWeekStart(year, week);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        const formatDate = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        setFromDate(formatDate(startDate));
        setToDate(formatDate(endDate));
        setSelectedMonth('ALL');
        setFiltersDirty(true);
        // Trigger fetch immediately
        setTimeout(() => fetchSummary(true), 0);
      }
    } else if (timeGranularity === 'day') {
      // Day granularity: dateKey is "YYYY-MM-DD" or similar ISO
      // Just in case, try to standardise
      const d = new Date(dateKey);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;

        setFromDate(dateStr);
        setToDate(dateStr);
        setSelectedMonth('ALL');
        setFiltersDirty(true);
        setTimeout(() => fetchSummary(true), 0);
      }
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
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <div className="relative flex-1">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setFiltersDirty(true);
                  }}
                  min={data?.filters.availableDateRange?.minDate || ''}
                  max={data?.filters.availableDateRange?.maxDate || ''}
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
                  min={data?.filters.availableDateRange?.minDate || ''}
                  max={data?.filters.availableDateRange?.maxDate || ''}
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
                  onChange={(e) => setMonthWithDates(e.target.value)}
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
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
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
          <div className="flex gap-2 items-end">
            <motion.button
              whileHover={{ scale: 1.05, translateY: -1 }}
              whileTap={{ scale: 0.95, translateY: 0 }}
              onClick={handleDownloadSummary}
              className="h-[36px] w-[36px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-gray-700 dark:text-slate-200 shadow-sm hover:border-brandRed/60 hover:text-brandRed transition-colors"
              aria-label="Download inventory Excel"
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
            {filtersDirty && (fromDate || toDate || (selectedMonth && selectedMonth !== 'ALL') || selectedProductCategories.length > 0 || (selectedWarehouse && selectedWarehouse !== 'ALL') || (selectedItemGroup && selectedItemGroup !== 'ALL')) && (
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
          whileHover={{ y: -2 }}
          className="relative bg-gradient-to-br from-white via-white to-red-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-red-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border mb-8"
        >
          {/* Left accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

          <div className="flex items-center gap-3 mb-6 pl-2">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
            >
              <Boxes className="w-5 h-5 text-brandRed" />
            </motion.div>
            <div>
              <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Inventory Overview</h3>
              <p className="text-xs text-enterprise-textSecondary font-medium">Current stock metrics</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-2">
            {/* Inbound SKU - Red Theme */}
            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-enterprise-border shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <Package className="w-5 h-5 text-brandRed" />
                </div>
                <div>
                  <span className="text-xs font-bold text-enterprise-textSecondary uppercase tracking-wider">Inbound SKU</span>
                  <p className="text-[10px] text-enterprise-textSecondary/70">Unique SKUs with CBM &gt; 0</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed">
                {formatNumber(data?.cards.inboundSkuCount)}
              </span>
            </motion.div>

            {/* Total Inventory QTY - Yellow Theme */}
            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-enterprise-border shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <span className="text-xs font-bold text-enterprise-textSecondary uppercase tracking-wider">Total Inventory QTY</span>
                  <p className="text-[10px] text-enterprise-textSecondary/70">Sum of per-row AVERAGE</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-amber-600">
                {formatInLakhs(data?.cards.inventoryQtyTotal)} L
              </span>
            </motion.div>

            {/* Total CBM - Red Theme */}
            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-enterprise-border shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <Box className="w-5 h-5 text-brandRed" />
                </div>
                <div>
                  <span className="text-xs font-bold text-enterprise-textSecondary uppercase tracking-wider">Total CBM</span>
                  <p className="text-[10px] text-enterprise-textSecondary/70">Sum of (AVG QTY × CBM/unit)</p>
                </div>
              </div>
              <span className="text-2xl font-bold font-mono text-brandRed">
                {formatNumber(data?.cards.totalCbm, 2)}
              </span>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Time Series Charts - Clean Design */}
      {!loading && data && chartData && chartData.points.length > 0 && displayPoints.length > 0 && (
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
                <h3 className="text-xl font-extrabold text-enterprise-text tracking-tight">Total VS Edel</h3>
                <p className="text-xs text-enterprise-textSecondary font-medium">View by granularity and mode</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Value/Percentage Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
                {(['value', 'percentage'] as const).map((mode) => (
                  <motion.button
                    key={mode}
                    onClick={() => setChartDisplayMode(mode)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${chartDisplayMode === mode
                      ? 'bg-white dark:bg-slate-600 text-brandRed shadow-sm'
                      : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                      }`}
                    suppressHydrationWarning={true}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </motion.button>
                ))}
              </div>
              {/* Time Granularity Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-700/50 rounded-xl p-1">
                {(['month', 'week', 'day'] as const).map((granularity) => (
                  <motion.button
                    key={granularity}
                    onClick={() => setTimeGranularity(granularity)}
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inventory Qty vs EDEL Inventory Qty Chart - Clean Design */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              whileHover={{ y: -2 }}
              className="relative bg-gradient-to-br from-white via-white to-red-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-red-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border"
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />

              <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
                <div>
                  <h3 className="text-lg font-bold text-enterprise-text mb-1">Inventory Qty vs EDEL Qty</h3>
                  <p className="text-xs text-enterprise-textSecondary">
                    {chartDisplayMode === 'value' ? 'Quantity comparison (in Lakhs)' : 'Percentage comparison'}
                  </p>
                </div>
              </div>
              <div className="relative z-10">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={displayPoints}
                    margin={{ top: 20, right: 20, bottom: 10, left: 0 }}
                    onClick={handleChartClick}
                  >
                    <defs>
                      <linearGradient id="inventoryQtyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="edelInventoryQtyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#eab308" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#ca8a04" stopOpacity={0.7} />
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
                      tickFormatter={(value: number) => chartDisplayMode === 'value' ? `${formatInLakhs(value)} L` : `${value.toFixed(0)}%`}
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
                        chartDisplayMode === 'value' ? `${formatInLakhs(value)} L` : `${value.toFixed(2)}%`,
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
                    <Bar
                      dataKey="inventoryQty"
                      fill="url(#inventoryQtyGradient)"
                      radius={[8, 8, 0, 0]}
                      name="Inventory Qty"
                      cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                      activeBar={{ stroke: 'black', strokeWidth: 1 }}
                    >
                      <LabelList
                        dataKey="inventoryQty"
                        position="top"
                        formatter={(value: any) => chartDisplayMode === 'value' ? `${formatInLakhs(value)} L` : `${value.toFixed(1)}%`}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar
                      dataKey="edelInventoryQty"
                      fill="url(#edelInventoryQtyGradient)"
                      radius={[8, 8, 0, 0]}
                      name="EDEL Inventory Qty"
                      cursor={timeGranularity !== 'month' ? "pointer" : "default"}
                      activeBar={{ stroke: 'black', strokeWidth: 1 }}
                    >
                      <LabelList
                        dataKey="edelInventoryQty"
                        position="top"
                        formatter={(value: any) => chartDisplayMode === 'value' ? `${formatInLakhs(value)} L` : `${value.toFixed(1)}%`}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Total CBM vs EDEL CBM Chart - Clean Design */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              whileHover={{ y: -2 }}
              className="relative bg-gradient-to-br from-white via-white to-yellow-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-yellow-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border"
            >
              {/* Left accent bar */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-yellow-500 via-yellow-500 to-yellow-500/70 rounded-l-2xl" />

              <div className="flex items-center justify-between mb-4 relative z-10 pl-2">
                <div>
                  <h3 className="text-lg font-bold text-enterprise-text mb-1">Total CBM vs EDEL CBM</h3>
                  <p className="text-xs text-enterprise-textSecondary">
                    {chartDisplayMode === 'value' ? 'Volume comparison' : 'Percentage comparison'}
                  </p>
                </div>
              </div>
              <div className="relative z-10">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={displayPoints} margin={{ top: 20, right: 20, bottom: 10, left: 0 }}>
                    <defs>
                      <linearGradient id="totalCbmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="edelCbmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#eab308" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#ca8a04" stopOpacity={0.7} />
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
                      tickFormatter={(value: number) => chartDisplayMode === 'value' ? `${formatInLakhs(value)} L` : `${value.toFixed(0)}%`}
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
                        chartDisplayMode === 'value' ? formatNumber(value, 2) : `${value.toFixed(2)}%`,
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
                        formatter={(value: any) => chartDisplayMode === 'value' ? formatNumber(value, 2) : `${value.toFixed(1)}%`}
                        style={{ fontSize: 10, fill: '#64748b', fontWeight: '600' }}
                      />
                    </Bar>
                    <Bar dataKey="edelTotalCbm" fill="url(#edelCbmGradient)" radius={[8, 8, 0, 0]} name="EDEL CBM">
                      <LabelList
                        dataKey="edelTotalCbm"
                        position="top"
                        formatter={(value: any) => chartDisplayMode === 'value' ? formatNumber(value, 2) : `${value.toFixed(1)}%`}
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

      {/* Fast-Moving SKUs Section - Clean Design */}
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
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-redTint to-enterprise-redTint/50 flex items-center justify-center shadow-sm"
              >
                <TrendingUp className="w-5 h-5 text-brandRed" />
              </motion.div>
              <div>
                <h2 className="text-xl font-extrabold text-enterprise-text tracking-tight">Fast-Moving SKUs Availability</h2>
                <p className="text-xs text-enterprise-textSecondary font-medium">Monitor stock levels for high-velocity items</p>
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
              {/* Filters - Premium Design */}
              <div className="relative bg-white border-2 border-enterprise-border rounded-2xl p-4 mb-6 shadow-lg hover:shadow-xl transition-all duration-300">
                {/* Decorative gradient blob */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-brandRed/5 rounded-full blur-3xl -z-10 pointer-events-none" />
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
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Top SKUs:</label>
                    <select
                      value={fastMovingLimit}
                      onChange={(e) => setFastMovingLimit(parseInt(e.target.value))}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setFastMovingPage(0);
                      fetchFastMovingSkus();
                    }}
                    disabled={fastMovingLoading}
                    className="flex items-center gap-2 px-4 py-1.5 bg-brandRed hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {fastMovingLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    Filter
                  </button>
                  {/* Info Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowFastMovingInfo(!showFastMovingInfo)}
                      className="w-8 h-8 rounded-full bg-brandRed hover:bg-red-700 text-white flex items-center justify-center transition-colors"
                      title="Information"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    {showFastMovingInfo && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="absolute z-[100] bottom-10 right-0 w-96 bg-white dark:bg-slate-800 border-2 border-blue-500 dark:border-blue-400 rounded-xl shadow-2xl p-4"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Fast-Moving SKUs</h4>
                          <button
                            onClick={() => setShowFastMovingInfo(false)}
                            className="w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-slate-400 space-y-2">
                          <p><strong>Purpose:</strong> Identify high-velocity items sorted by Sales/Day.</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Sales/Day = Total DN QTY ÷ days in last 3 months</li>
                            <li>AVG QTY: Average inventory quantity for the latest month</li>
                            <li>Current Inventory Qty: Latest inventory stock quantity</li>
                            <li>DN QTY/CBM: Total from last 3 months</li>
                            <li>Sorted by highest Sales/Day first</li>
                          </ul>
                          <p><strong>Use Case:</strong> Monitor stock levels for popular items to prevent stockouts.</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* SKUs Table - Clean Design */}
              <div className="relative bg-gradient-to-br from-white via-white to-red-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-red-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-brandRed via-brandRed to-brandRed/70 rounded-l-2xl" />
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
                        <thead className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md backdrop-saturate-150 ring-1 ring-black/5 dark:ring-white/10 border border-gray-200/50 dark:border-slate-700/50 rounded-t-lg sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-white uppercase tracking-wider">Item (SKU)</th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-white uppercase tracking-wider">Warehouse</th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-white uppercase tracking-wider">Avg Inventory Qty</th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-white uppercase tracking-wider">Current Inventory Qty</th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-900/20" title={`Sales per Day (last 90 days)${fastMovingData?.salesDateRange ? ` (${fastMovingData.salesDateRange.minDate} to ${fastMovingData.salesDateRange.maxDate})` : ''}`}>
                              Sales/Day
                              {fastMovingData?.salesDateRange && (
                                <div className="text-[9px] font-normal normal-case text-blue-500 dark:text-blue-300 mt-0.5">
                                  ({new Date(fastMovingData.salesDateRange.minDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(fastMovingData.salesDateRange.maxDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                                </div>
                              )}
                            </th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-900/20" title="Total DN Qty (last 90 days)">DN Qty</th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-900/20" title="Total DN CBM (last 90 days)">DN CBM</th>
                            <th className="px-4 py-3 text-center text-sm font-bold text-gray-700 dark:text-white uppercase tracking-wider">CBM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                          {fastMovingData.skus
                            .slice(fastMovingPage * ITEMS_PER_PAGE, (fastMovingPage + 1) * ITEMS_PER_PAGE)
                            .map((sku, idx) => (
                              <tr key={`${sku.item}-${idx}`} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="px-4 py-3 text-center">
                                  <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px] mx-auto" title={sku.item}>
                                    {sku.item}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-slate-400">{sku.itemGroup}</div>
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600 dark:text-slate-300 text-xs" title={sku.warehouse}>{sku.warehouse}</td>
                                <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{formatNumber(sku.avgQty)}</td>
                                <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{formatNumber(sku.currentQty)}</td>
                                {/* Sales columns from outbound data */}
                                <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                                  {formatNumber(sku.salesPerDay, 2)}
                                </td>
                                <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                                  {formatNumber(sku.dnQty)}
                                </td>
                                <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10">
                                  {formatNumber(sku.dnCbm, 2)}
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600 dark:text-slate-300">{formatNumber(sku.cbm, 2)}</td>
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

      {/* Slow Moving SKUs Section */}
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
              <motion.div
                whileHover={{ rotate: 5, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-enterprise-yellowTint to-enterprise-yellowTint/50 flex items-center justify-center shadow-sm"
              >
                <Package className="w-5 h-5 text-amber-600" />
              </motion.div>
              <div>
                <h2 className="text-xl font-extrabold text-enterprise-text tracking-tight">Non-Moving / Slow Moving SKUs</h2>
                <p className="text-xs text-enterprise-textSecondary font-medium">Identify dead stock and slow-moving inventory</p>
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
              {/* Filters - Premium Design */}
              <div className="relative bg-white border-2 border-enterprise-border rounded-2xl p-4 mb-6 shadow-lg hover:shadow-xl transition-all duration-300">
                {/* Decorative gradient blob */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-brandYellow/5 rounded-full blur-3xl -z-10 pointer-events-none" />
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
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500 dark:text-slate-400">Limit:</label>
                    <select
                      value={zeroOrderLimit}
                      onChange={(e) => setZeroOrderLimit(parseInt(e.target.value))}
                      className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setZeroOrderPage(0);
                      fetchZeroOrderProducts();
                    }}
                    disabled={zeroOrderLoading}
                    className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {zeroOrderLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    Filter
                  </button>
                  {/* Info Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowZeroOrderInfo(!showZeroOrderInfo)}
                      className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition-colors"
                      title="Information"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    {showZeroOrderInfo && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="absolute z-[100] bottom-10 right-0 w-96 bg-white dark:bg-slate-800 border-2 border-purple-500 dark:border-purple-400 rounded-xl shadow-2xl p-4"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Non-Moving / Slow Moving SKUs</h4>
                          <button
                            onClick={() => setShowZeroOrderInfo(false)}
                            className="w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                          </button>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-slate-400 space-y-2">
                          <p><strong>Purpose:</strong> Identify dead stock - items in inventory but never ordered.</p>
                          <p><strong>Calculation:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>Gets all items from inventory with their stock quantities</li>
                            <li>Checks which items have NO matching delivery notes in outbound data</li>
                            <li>Filters items with days in stock &gt;= Min Days threshold</li>
                            <li>Shows: Latest Stock Qty, Days in Stock, Total CBM</li>
                          </ul>
                          <p><strong>Use Case:</strong> Identify items to clear, discount, or stop ordering to free up warehouse space.</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* Products Table - Clean Design */}
              <div className="relative bg-gradient-to-br from-white via-white to-yellow-50/30 rounded-2xl p-4 shadow-lg hover:shadow-xl hover:shadow-yellow-500/10 transition-all duration-300 overflow-hidden border border-enterprise-border">
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-yellow-500 via-yellow-500 to-yellow-500/70 rounded-l-2xl" />
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
                        <thead className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md backdrop-saturate-150 ring-1 ring-black/5 dark:ring-white/10 border border-gray-200/50 dark:border-slate-700/50 rounded-t-lg sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-center text-base font-semibold text-gray-700 dark:text-white uppercase tracking-wider">Item</th>
                            <th className="px-4 py-3 text-center text-base font-semibold text-gray-700 dark:text-white uppercase tracking-wider">Warehouse</th>
                            <th className="px-4 py-3 text-center text-base font-semibold text-gray-700 dark:text-white uppercase tracking-wider">Latest Stock Qty</th>
                            <th className="px-4 py-3 text-center text-base font-semibold text-gray-700 dark:text-white uppercase tracking-wider">CBM Blocked</th>
                            <th className="px-4 py-3 text-center text-base font-semibold text-gray-700 dark:text-white uppercase tracking-wider">DN Count</th>
                          </tr>
                          <tr className="bg-gray-50/60 dark:bg-slate-800/50">
                            <th className="px-4 pb-2 text-center text-[11px] font-semibold text-gray-600 dark:text-slate-300"></th>
                            <th className="px-4 pb-2 text-center text-[11px] font-semibold text-gray-600 dark:text-slate-300"></th>
                            <th className="px-4 pb-2 text-center text-sm font-bold text-gray-900 dark:text-white">({formatNumber(zeroOrderTotals.stock)})</th>
                            <th className="px-4 pb-2 text-center text-sm font-bold text-purple-700 dark:text-purple-300">({formatNumber(zeroOrderTotals.cbm, 2)})</th>
                            <th className="px-4 pb-2 text-center text-[11px] font-semibold text-gray-600 dark:text-slate-300"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                          {zeroOrderData.products
                            .slice(zeroOrderPage * ITEMS_PER_PAGE, (zeroOrderPage + 1) * ITEMS_PER_PAGE)
                            .map((product, idx) => (
                              <tr key={`${product.item}-${product.warehouse}-${idx}`} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                <td className="px-4 py-3 text-center">
                                  <div className="font-medium text-gray-900 dark:text-white truncate max-w-[200px] mx-auto" title={product.item}>
                                    {product.item}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-slate-400">{product.itemGroup}</div>
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600 dark:text-slate-300 text-xs">{product.warehouse}</td>
                                <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{formatNumber(product.latestStockQty)}</td>
                                <td className="px-4 py-3 text-center font-semibold text-purple-600 dark:text-purple-400">{formatNumber(product.totalCbm, 2)}</td>
                                <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">{product.dnCount ?? product.deliveryNoteCount ?? 0}</td>
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
                    <p>No slow-moving SKUs found with the current filters.</p>
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
