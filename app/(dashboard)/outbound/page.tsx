'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import Table from '@/components/common/Table';
import { Package, TrendingUp, Box, ArrowRightLeft, Download, ArrowUpFromLine } from 'lucide-react';
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

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function OutboundPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [chartData, setChartData] = useState<TimeSeriesData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  
  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedProductCategory, setSelectedProductCategory] = useState('ALL');
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');

  useEffect(() => {
    fetchSummary();
    fetchChartData(timeGranularity);
  }, []);

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
        if (selectedProductCategory && selectedProductCategory !== 'ALL') {
          params.append('productCategory', selectedProductCategory);
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
      if (selectedProductCategory && selectedProductCategory !== 'ALL') {
        params.append('productCategory', selectedProductCategory);
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
      if (selectedProductCategory && selectedProductCategory !== 'ALL') {
        params.append('productCategory', selectedProductCategory);
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

  // Helper function to format numbers - only show decimal if needed
  const formatNumber = (num: number | string | undefined | null, decimals?: number): string => {
    if (num === undefined || num === null || num === '') return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    
    // If decimals specified, use that
    if (decimals !== undefined) {
      return value.toFixed(decimals);
    }
    
    // Check if the number has a decimal part
    if (Number.isInteger(value)) {
      return value.toString();
    } else {
      return value.toFixed(1);
    }
  };

  // Helper function to format numbers in Lakhs (divide by 100,000)
  const formatInLakhs = (num: number | string | undefined | null, decimals: number = 2): string => {
    if (num === undefined || num === null || num === '') return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    
    const lakhs = value / 100000;
    return lakhs.toFixed(decimals);
  };

  // Helper function to format product category enum to display label
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

  const QtyLegend = () => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 12,
            height: 12,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>SO qty</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 12,
            height: 12,
            backgroundColor: '#dc2626',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>DN Qty</span>
      </div>
    </div>
  );

  const CbmLegend = () => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 12,
            height: 12,
            backgroundColor: '#3b82f6',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>SO Total CBM</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 12,
            height: 12,
            backgroundColor: '#dc2626',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>DN Total CBM</span>
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
      <div>
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
    <div>
      {/* Date & Category Filters - Moved to Top */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4" suppressHydrationWarning={true}>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning={true}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning={true}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning={true}
            >
              {(data?.availableMonths || ['ALL']).map((month) => (
                <option key={month} value={month}>
                  {month === 'ALL' ? 'ALL MONTH' : month}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Product Category</label>
            <select
              value={selectedProductCategory}
              onChange={(e) => setSelectedProductCategory(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning={true}
            >
              {(data?.productCategories || ['ALL']).map((category) => (
                <option key={category} value={category}>
                  {formatProductCategory(category)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFilter}
              disabled={loading}
              className="w-full bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
              suppressHydrationWarning={true}
            >
              {loading ? 'Loading...' : 'Apply Filter'}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Cards - Now respond to filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="SO SKU"
          value={loading ? '-' : formatNumber(data?.cards.soSku)}
          subtitle="Unique Sales Order Items"
          icon={Package}
        />
        <StatCard
          title="SO Qty"
          value={loading ? '-' : formatNumber(data?.cards.soQty)}
          subtitle="Total Sales Order Quantity"
          icon={TrendingUp}
        />
        <StatCard
          title="SO Total CBM"
          value={loading ? '-' : formatNumber(data?.cards.soTotalCbm)}
          subtitle="Sales Order Volume"
          icon={Box}
        />
        <StatCard
          title="(SO - DN) Qty"
          value={loading ? '-' : formatNumber(data?.cards.soMinusDnQty)}
          subtitle="Pending Delivery Quantity"
          icon={ArrowRightLeft}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="DN SKU"
          value={loading ? '-' : formatNumber(data?.cards.dnSku)}
          subtitle="Unique Delivery Note Items"
          icon={Package}
        />
        <StatCard
          title="DN Qty"
          value={loading ? '-' : formatNumber(data?.cards.dnQty)}
          subtitle="Total Delivery Note Quantity"
          icon={TrendingUp}
        />
        <StatCard
          title="DN Total CBM"
          value={loading ? '-' : formatNumber(data?.cards.dnTotalCbm)}
          subtitle="Delivery Note Volume"
          icon={Box}
        />
      </div>

      {/* Category Breakdown Table - Server Management Style */}
      <div className="w-full mb-8">
        <div className="relative border border-gray-200 dark:border-slate-700/30 rounded-2xl p-6 bg-white dark:bg-slate-800/50">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h3 className="text-xl font-medium text-gray-900 dark:text-slate-100">Category Breakdown</h3>
              </div>
              <div className="text-sm text-gray-500 dark:text-slate-400">
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
              <div className="grid grid-cols-9 gap-4 px-4 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
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
                    className={`relative ${
                      row.categoryLabel === 'TOTAL' 
                        ? 'bg-gradient-to-r from-brandRed/10 to-brandRed/5 border-2 border-brandRed/30 shadow-lg shadow-brandRed/10' 
                        : 'bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600/50'
                    } rounded-xl p-4 overflow-hidden`}
                    whileHover={{
                      y: -1,
                      transition: { type: "spring", stiffness: 400, damping: 25 }
                    }}
                  >
                    {/* Status gradient overlay */}
                    {row.categoryLabel !== 'TOTAL' && (
                      <div 
                        className="absolute inset-0 bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none"
                        style={{ 
                          backgroundSize: "30% 100%", 
                          backgroundPosition: "right",
                          backgroundRepeat: "no-repeat"
                        }} 
                      />
                    )}
                    
                    {/* Grid Content */}
                    <div className={`relative grid grid-cols-9 gap-4 items-center ${
                      row.categoryLabel === 'TOTAL' ? 'text-lg font-bold' : ''
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
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : 'bg-orange-500/10 border border-orange-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
                              ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                              : 'text-orange-600 dark:text-orange-400 text-sm'
                          }`}>
                            {formatNumber(row.soCount)}
                          </span>
                        </div>
                      </div>

                      {/* SO Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : 'bg-indigo-500/10 border border-indigo-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
                              ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                              : 'text-indigo-600 dark:text-indigo-400 text-sm'
                          }`}>
                            {formatNumber(row.soQty)}
                          </span>
                        </div>
                      </div>

                      {/* SO CBM */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : 'bg-blue-500/10 border border-blue-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
                              ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                              : 'text-blue-600 dark:text-blue-400 text-sm'
                          }`}>
                            {formatNumber(row.soTotalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* DN Count */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : 'bg-teal-500/10 border border-teal-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
                              ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                              : 'text-teal-600 dark:text-teal-400 text-sm'
                          }`}>
                            {formatNumber(row.dnCount)}
                          </span>
                        </div>
                      </div>

                      {/* DN Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : 'bg-green-500/10 border border-green-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
                              ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                              : 'text-green-600 dark:text-green-400 text-sm'
                          }`}>
                            {formatNumber(row.dnQty)}
                          </span>
                        </div>
                      </div>

                      {/* DN Total CBM */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : 'bg-purple-500/10 border border-purple-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
                              ? 'text-brandRed dark:text-brandRed text-lg font-bold'
                              : 'text-purple-600 dark:text-purple-400 text-sm'
                          }`}>
                            {formatNumber(row.dnTotalCbm, 2)}
                          </span>
                        </div>
                      </div>

                      {/* SO - DN Qty */}
                      <div className="col-span-1 flex justify-center">
                        <div className={`w-full min-w-[4rem] px-3 py-1.5 rounded-lg inline-flex items-center justify-center ${
                          row.categoryLabel === 'TOTAL'
                            ? 'bg-brandRed/20 border-2 border-brandRed/50'
                            : row.soMinusDnQty > 0 
                              ? 'bg-red-500/10 border border-red-500/30'
                              : row.soMinusDnQty < 0
                                ? 'bg-yellow-500/10 border border-yellow-500/30'
                                : 'bg-green-500/10 border border-green-500/30'
                        }`}>
                          <span className={`font-medium font-mono ${
                            row.categoryLabel === 'TOTAL'
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
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400">
              <p>No category data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Time Series Charts */}
      <div className="mb-8">
        {/* View by toggle above charts */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <label className="text-sm font-medium text-gray-900 dark:text-slate-100">View by</label>
          </div>
          <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
            {(['month', 'week', 'day'] as const).map((granularity) => (
              <button
                key={granularity}
                onClick={() => handleTimeGranularityChange(granularity)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  timeGranularity === granularity
                    ? 'bg-white dark:bg-slate-900 text-brandRed dark:text-brandRed shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                }`}
                suppressHydrationWarning={true}
              >
                {granularity.charAt(0).toUpperCase() + granularity.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SO vs DN Qty Chart */}
          <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">SO Qty vs DN Qty Over Time (in Lakhs)</h3>
            </div>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : chartData?.points && chartData.points.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value: number) => `${formatInLakhs(value)} L`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#f3f4f6' }}
                  itemStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number, name: string) => [
                    `${formatInLakhs(value)} L`, 
                    name === 'soQty' ? 'SO Qty' : 'DN Qty'
                  ]}
                />
                <Legend 
                  verticalAlign="top"
                  align="right"
                  content={<QtyLegend />}
                />
                <Bar dataKey="soQty" fill="#3b82f6" radius={[4, 4, 0, 0]} name="SO qty">
                  <LabelList 
                    dataKey="soQty" 
                    position="top" 
                    formatter={(value: any) => formatInLakhs(value)}
                    style={{ fontSize: 11, fill: '#6b7280' }}
                  />
                </Bar>
                <Bar dataKey="dnQty" fill="#dc2626" radius={[4, 4, 0, 0]} name="DN Qty">
                  <LabelList 
                    dataKey="dnQty" 
                    position="top" 
                    formatter={(value: any) => formatInLakhs(value)}
                    style={{ fontSize: 11, fill: '#6b7280' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-slate-400">
              <p>No data available</p>
            </div>
          )}
        </div>

        {/* SO vs DN Total CBM Chart */}
        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">SO Total CBM vs DN Total CBM Over Time</h3>
          </div>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : chartData?.points && chartData.points.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: '#f3f4f6' }}
                  itemStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number, name: string) => [
                    formatNumber(value), 
                    name === 'soTotalCbm' ? 'SO Total CBM' : 'DN Total CBM'
                  ]}
                />
                <Legend 
                  verticalAlign="top"
                  align="right"
                  content={<CbmLegend />}
                />
                <Bar dataKey="soTotalCbm" fill="#3b82f6" radius={[4, 4, 0, 0]} name="SO Total CBM">
                  <LabelList 
                    dataKey="soTotalCbm" 
                    position="top" 
                    formatter={(value: any) => formatNumber(value)}
                    style={{ fontSize: 11, fill: '#6b7280' }}
                  />
                </Bar>
                <Bar dataKey="dnTotalCbm" fill="#dc2626" radius={[4, 4, 0, 0]} name="DN Total CBM">
                  <LabelList 
                    dataKey="dnTotalCbm" 
                    position="top" 
                    formatter={(value: any) => formatNumber(value)}
                    style={{ fontSize: 11, fill: '#6b7280' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-slate-400">
              <p>No data available</p>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Summary Totals Table - Server Management Style */}
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
                {data?.summaryTotals?.dayData?.length || 0} Records
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
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                <div className="col-span-1">No</div>
                <div className="col-span-3">Date</div>
                <div className="col-span-2">DN Qty</div>
                <div className="col-span-2">DN CBM</div>
                <div className="col-span-2">EDEL DN Qty</div>
                <div className="col-span-2">EDEL DN CBM</div>
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

                        {/* Date */}
                        <div className="col-span-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center border border-gray-200 dark:border-slate-600/30">
                            <ArrowUpFromLine className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-gray-900 dark:text-slate-200 font-medium">
                            {day.label}
                          </span>
                        </div>

                        {/* DN Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                            <span className="text-green-600 dark:text-green-400 text-sm font-medium font-mono">
                              {formatNumber(day.dnQty)}
                            </span>
                          </div>
                        </div>

                        {/* DN CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center">
                            <span className="text-blue-600 dark:text-blue-400 text-sm font-medium font-mono">
                              {formatNumber(day.dnCbm, 2)}
                            </span>
                          </div>
                        </div>

                        {/* EDEL DN Qty */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 inline-flex items-center justify-center">
                            <span className="text-purple-600 dark:text-purple-400 text-sm font-medium font-mono">
                              {formatNumber(day.edelDnQty)}
                            </span>
                          </div>
                        </div>

                        {/* EDEL DN CBM */}
                        <div className="col-span-2 flex justify-center">
                          <div className="w-full min-w-[4rem] px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 inline-flex items-center justify-center">
                            <span className="text-orange-600 dark:text-orange-400 text-sm font-medium font-mono">
                              {formatNumber(day.edelDnCbm, 2)}
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
                          {formatNumber(data.summaryTotals.totalDnQty)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 inline-flex items-center justify-center">
                          <span className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                            {formatNumber(data.summaryTotals.totalDnCbm, 2)}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm font-mono text-gray-900 dark:text-slate-200 font-medium">
                          {formatNumber(data.summaryTotals.totalEdelDnQty)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 inline-flex items-center justify-center">
                          <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                            {formatNumber(data.summaryTotals.totalEdelDnCbm, 2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400">
              <p>No summary data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
