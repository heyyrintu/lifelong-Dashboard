'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import Table from '@/components/common/Table';
import { Package, TrendingUp, Box, ArrowRightLeft, Download } from 'lucide-react';
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
  
  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedProductCategory, setSelectedProductCategory] = useState('ALL');
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');

  useEffect(() => {
    fetchSummary();
  }, []);

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
    // Immediately fetch data with new granularity by passing it directly
    fetchSummaryWithGranularity(granularity);
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
  const formatNumber = (num: number | string | undefined | null): string => {
    if (num === undefined || num === null || num === '') return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    
    // Check if the number has a decimal part
    if (Number.isInteger(value)) {
      return value.toString();
    } else {
      return value.toFixed(1);
    }
  };

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
        <PageHeader
          title="Outbound Management"
          description="Track sales orders, delivery notes, and category-wise breakdowns"
        />
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
      <PageHeader
        title=""
        description=""
      />

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
                  {category}
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

      {/* Category Breakdown Table - Also responds to filters */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Category Breakdown</h3>
        </div>
        {loading ? (
          <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brandRed mx-auto mb-4"></div>
            <p className="text-sm text-gray-600 dark:text-slate-400">Loading data...</p>
          </div>
        ) : (
          <Table 
            columns={columns} 
            data={data?.categoryTable?.map(row => ({
              ...row,
              soCount: formatNumber(row.soCount),
              soQty: formatNumber(row.soQty),
              soTotalCbm: formatNumber(row.soTotalCbm),
              dnCount: formatNumber(row.dnCount),
              dnQty: formatNumber(row.dnQty),
              dnTotalCbm: formatNumber(row.dnTotalCbm),
              soMinusDnQty: formatNumber(row.soMinusDnQty),
            })) || []} 
          />
        )}
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
          {/* DN Qty Chart */}
          <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">DN Qty Over Time</h3>
            </div>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : data?.timeSeries?.points && data.timeSeries.points.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.timeSeries.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                  angle={-30}
                  textAnchor="end"
                  height={60}
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
                  formatter={(value: number) => formatNumber(value)}
                />
                <Bar dataKey="dnQty" fill="#dc2626" radius={[4, 4, 0, 0]}>
                  <LabelList 
                    dataKey="dnQty" 
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

        {/* DN Total CBM Chart */}
        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">DN Total CBM Over Time</h3>
          </div>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brandRed"></div>
            </div>
          ) : data?.timeSeries?.points && data.timeSeries.points.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.timeSeries.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 12 }}
                  angle={-30}
                  textAnchor="end"
                  height={60}
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
                  formatter={(value: number) => formatNumber(value)}
                />
                <Bar dataKey="dnTotalCbm" fill="#f59e0b" radius={[4, 4, 0, 0]}>
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

      {/* Summary Totals Table */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Summary Totals</h3>
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
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white dark:bg-slate-800/50 z-10 shadow-sm">
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  {data.summaryTotals.dayData && data.summaryTotals.dayData.length > 0 ? (
                    <>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Days</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total DN Qty</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total DN CBM</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total EDEL DN Qty</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total EDEL DN CBM</th>
                    </>
                  ) : (
                    <>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total DN Qty</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total DN CBM</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total EDEL DN Qty</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total EDEL DN CBM</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.summaryTotals.dayData && data.summaryTotals.dayData.length > 0 ? (
                  data.summaryTotals.dayData.map((day, index) => (
                    <tr key={day.date} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                        {day.label}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300">
                        {formatNumber(day.dnQty)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300">
                        {formatNumber(day.dnCbm)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300">
                        {formatNumber(day.edelDnQty)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300">
                        {formatNumber(day.edelDnCbm)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                      {formatNumber(data.summaryTotals.totalDnQty)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                      {formatNumber(data.summaryTotals.totalDnCbm)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                      {formatNumber(data.summaryTotals.totalEdelDnQty)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                      {formatNumber(data.summaryTotals.totalEdelDnCbm)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-500 dark:text-slate-400">
            <p>No summary data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
