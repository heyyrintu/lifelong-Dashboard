'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { backendFetch } from '@/lib/backendFetch';
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
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import * as XLSX from 'xlsx';

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

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

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

      // Build query params
      const buildParams = () => {
        const params = new URLSearchParams();

        if (useFilters) {
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

      // Fetch all three endpoints in parallel
      const [inboundRes, inventoryRes, outboundRes] = await Promise.all([
        backendFetch(`${BACKEND_URL}/inbound/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        backendFetch(`${BACKEND_URL}/inventory/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        backendFetch(`${BACKEND_URL}/outbound/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
      ]);

      // Parse responses
      const inboundData = inboundRes?.ok ? await inboundRes.json() : null;
      const inventoryData = inventoryRes?.ok ? await inventoryRes.json() : null;
      const outboundData = outboundRes?.ok ? await outboundRes.json() : null;

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

      // Extract available dates from inbound or inventory data
      let dates: { minDate: string; maxDate: string } | null = null;
      if (inboundData?.availableDates) {
        dates = inboundData.availableDates;
      } else if (inventoryData?.filters?.availableDateRange) {
        dates = inventoryData.filters.availableDateRange;
      } else if (outboundData?.availableDateRange) {
        dates = outboundData.availableDateRange;
      }

      setAvailableCategories(Array.from(categories).filter(c => c !== 'ALL'));
      setAvailableWarehouses(['ALL', ...Array.from(warehouses)]);
      setAvailableMonths(['ALL', ...Array.from(months).sort()]);
      setAvailableDates(dates);

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

  const averageFulfillment = useMemo(() => {
    const rows = data?.fulfillmentTable || [];
    if (!rows.length) return 0;
    const total = rows.reduce((sum, row) => sum + (row.percentage || 0), 0);
    return total / rows.length;
  }, [data?.fulfillmentTable]);

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

  return (
    <div>
      <PageHeader
        title="Quick Summary"
        description="Overview of key metrics and performance indicators for logistics operations"
      />

      {/* Filters Section - Premium Design */}
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
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSelectedMonth('ALL');
                  }}
                  min={availableDates?.minDate || ''}
                  max={availableDates?.maxDate || ''}
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
                  min={availableDates?.minDate || ''}
                  max={availableDates?.maxDate || ''}
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
                  className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white outline-none appearance-none transition-all cursor-pointer"
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
                  {availableWarehouses.map((warehouse) => (
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
                className="w-full pl-3 pr-8 py-2 text-left bg-transparent text-xs font-semibold outline-none transition-all duration-200 flex items-center justify-between text-gray-900 dark:text-white cursor-pointer"
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
                  {availableCategories.map((category) => (
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
          <div className="md:col-span-2 flex gap-2 items-end">
            <motion.button
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98, translateY: 0 }}
              onClick={handleFilter}
              disabled={loading}
              className="flex-1 h-[36px] bg-gradient-to-r from-brandRed to-red-600 text-white rounded-xl text-xs font-bold tracking-wide shadow-lg shadow-brandRed/25 flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-brandRed/40 group"
              suppressHydrationWarning={true}
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Loading...</span>
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
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98, translateY: 0 }}
                onClick={handleReset}
                className="h-[36px] px-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 shadow-sm flex items-center justify-center gap-1.5 group"
              >
                <RefreshCw className="w-3 h-3 transition-transform group-hover:rotate-180" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Date range info - Bottom Right */}
        {availableDates && (
          <div className="flex justify-end mt-3">
            <p className="text-xs text-gray-500 dark:text-slate-500">
              Data available: {availableDates.minDate} to {availableDates.maxDate}
            </p>
          </div>
        )}
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
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <ArrowDownToLine className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Inbound</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Received metrics</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Received SKU Count */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Received SKU</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Unique SKUs received</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {formatNumber(data.inbound.receivedSkuCount)}
                </span>
              </div>

              {/* Received Qty */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Received Qty</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total quantity received</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {formatInLakhs(data.inbound.receivedQty)}
                </span>
              </div>

              {/* Received CBM */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/30 dark:to-blue-800/20 rounded-xl border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <Box className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Received CBM</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Volume received</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {formatInThousands(data.inbound.receivedCbm)}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Inventory Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Boxes className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Inventory</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Stock metrics</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Inventory SKU */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-purple-50/80 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Inventory SKU</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Unique SKUs in stock</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {formatNumber(data.inventory.inventorySku)}
                </span>
              </div>

              {/* Inventory Qty */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-purple-50/80 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Inventory Qty</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total stock quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {formatInLakhs(data.inventory.inventoryQty)}
                </span>
              </div>

              {/* Inventory CBM */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-purple-50/80 to-purple-100/50 dark:from-purple-900/30 dark:to-purple-800/20 rounded-xl border border-purple-200/50 dark:border-purple-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                    <Box className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Inventory CBM</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total volume in stock</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  {formatInThousands(data.inventory.inventoryCbm)}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Outbound Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden"
          >
            {/* Decorative gradient */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-green-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                <ArrowUpFromLine className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Outbound</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Delivery metrics</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* DN SKU */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">DN SKU</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Unique delivery SKUs</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                  {formatNumber(data.outbound.dnSku)}
                </span>
              </div>

              {/* DN Qty */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">DN Qty</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Total delivery quantity</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                  {formatInLakhs(data.outbound.dnQty)}
                </span>
              </div>

              {/* DN Total CBM */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-green-50/80 to-green-100/50 dark:from-green-900/30 dark:to-green-800/20 rounded-xl border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <Box className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">DN Total CBM</span>
                    <p className="text-xs text-gray-400 dark:text-slate-500">Delivery volume</p>
                  </div>
                </div>
                <span className="text-2xl font-bold font-mono text-green-600 dark:text-green-400">
                  {formatInThousands(data.outbound.dnTotalCbm)}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Fulfillment Rate Half Donut */}
      {!loading && data?.fulfillmentTable && data.fulfillmentTable.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full mb-8"
        >
          <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fulfillment Rate</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Average across fulfillment table</p>
                </div>
              </div>
              <div className="px-3 py-1.5 bg-emerald-50/80 dark:bg-emerald-900/30 backdrop-blur-sm rounded-lg border border-emerald-200/50 dark:border-emerald-700/40 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {data.fulfillmentTable.length} Dates
              </div>
            </div>

            <div className="h-52 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Fulfilled', value: Math.min(100, Math.max(0, averageFulfillment)), fill: '#10b981' },
                      { name: 'Gap', value: Math.max(0, 100 - Math.max(0, averageFulfillment)), fill: '#f59e0b' },
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
                <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {averageFulfillment.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Avg Fulfillment</span>
              </div>
            </div>

            <div className="flex justify-center gap-6 mt-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs text-gray-600 dark:text-slate-400">Fulfilled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-xs text-gray-600 dark:text-slate-400">Gap to 100%</span>
              </div>
            </div>
          </div>
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
          <div className="relative bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl backdrop-saturate-150 border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
            {/* Decorative gradient blobs */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 animate-pulse shadow-lg shadow-purple-500/50" />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Fulfillment Table</h3>
                </div>
                <div className="px-3 py-1.5 bg-gray-100/80 dark:bg-slate-700/80 backdrop-blur-sm rounded-lg border border-gray-200/50 dark:border-slate-600/50 text-sm font-semibold text-gray-700 dark:text-slate-300">
                  {data.fulfillmentTable.length} Dates
                </div>
              </div>
              <motion.button
                onClick={() => downloadFulfillmentExcel(data.fulfillmentTable!)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Download className="w-4 h-4" />
                <span>Download Excel</span>
              </motion.button>
            </div>

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
              <div className="grid grid-cols-5 gap-4 px-4 py-3 mb-2 bg-gradient-to-r from-gray-50/80 to-transparent dark:from-slate-800/50 dark:to-transparent backdrop-blur-sm rounded-lg border border-gray-200/30 dark:border-slate-700/30 text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider relative z-10">
                <div className="text-center">Date</div>
                <div className="text-center">SO Qty</div>
                <div className="text-center">DN Qty</div>
                <div className="text-center">Pending</div>
                <div className="text-center">%</div>
              </div>

              {/* Data Rows */}
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
                      className={`absolute inset-0 bg-gradient-to-l ${
                        row.percentage >= 100 
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
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                          <Calendar className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-gray-900 dark:text-slate-200 font-medium text-sm">
                          {row.date}
                        </span>
                      </div>

                      {/* SO Qty */}
                      <div className="flex justify-center">
                        <div className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 inline-flex items-center justify-center min-w-[5rem]">
                          <span className="text-indigo-600 dark:text-indigo-400 text-sm font-medium font-mono">
                            {formatNumber(row.soQty)}
                          </span>
                        </div>
                      </div>

                      {/* DN Qty */}
                      <div className="flex justify-center">
                        <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center min-w-[5rem]">
                          <span className="text-blue-600 dark:text-blue-400 text-sm font-medium font-mono">
                            {formatNumber(row.dnQty)}
                          </span>
                        </div>
                      </div>

                      {/* Pending */}
                      <div className="flex justify-center">
                        <div className={`px-3 py-1.5 rounded-lg inline-flex items-center justify-center min-w-[5rem] ${
                          row.pending === 0 
                            ? 'bg-green-500/10 border border-green-500/30' 
                            : 'bg-red-500/10 border border-red-500/30'
                        }`}>
                          <span className={`text-sm font-medium font-mono ${
                            row.pending === 0 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {formatNumber(row.pending)}
                          </span>
                        </div>
                      </div>

                      {/* Percentage */}
                      <div className="flex justify-center">
                        <div className={`px-3 py-1.5 rounded-lg inline-flex items-center justify-center min-w-[5rem] ${
                          row.percentage >= 100 
                            ? 'bg-green-500/20 border-2 border-green-500/50' 
                            : row.percentage >= 90 
                              ? 'bg-blue-500/10 border border-blue-500/30'
                              : row.percentage >= 75
                                ? 'bg-yellow-500/10 border border-yellow-500/30'
                                : 'bg-red-500/10 border border-red-500/30'
                        }`}>
                          <span className={`text-sm font-bold font-mono ${
                            row.percentage >= 100 
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
