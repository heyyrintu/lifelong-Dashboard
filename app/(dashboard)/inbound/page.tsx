'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import { ArrowDownToLine, Package, Clock, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
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
  receivedQty: number;
  totalCbm: number;
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
}

interface SummaryTotals {
  totalReceivedQty: number;
  totalCbm: number;
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
  const [selectedProductCategory, setSelectedProductCategory] = useState('ALL');
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [chartData, setChartData] = useState<TimeSeriesData | null>(null);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
    fetchChartData(timeGranularity);
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
        if (selectedProductCategory && selectedProductCategory !== 'ALL') {
          params.append('productCategory', selectedProductCategory);
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
    setSelectedProductCategory('ALL');
    fetchSummary();
  };

  const handleTimeGranularityChange = (granularity: 'month' | 'week' | 'day') => {
    setTimeGranularity(granularity);
    fetchChartData(granularity);
  };

  const formatNumber = (num: number, decimals: number = 0) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
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

  return (
    <div>
      <PageHeader
        title="Inbound Management"
        description="Track and manage incoming shipments, fresh receipts, and goods receipt notes with CBM calculations"
      />

      {/* Date Filters */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4" suppressHydrationWarning={true}>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setSelectedMonth('ALL');
              }}
              min={summaryData?.availableDates?.minDate || ''}
              max={summaryData?.availableDates?.maxDate || ''}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning={true}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setSelectedMonth('ALL');
              }}
              min={summaryData?.availableDates?.minDate || ''}
              max={summaryData?.availableDates?.maxDate || ''}
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
              {(summaryData?.availableMonths || ['ALL']).map((month: string) => (
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
              {(summaryData?.productCategories || ['ALL']).map((category: string) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleFilter}
              className="flex-1 bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
              suppressHydrationWarning={true}
            >
              Filter
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
              suppressHydrationWarning={true}
            >
              Reset
            </button>
          </div>
          {summaryData?.availableDates?.minDate && (
            <div className="flex items-end text-xs text-gray-500 dark:text-slate-400">
              Data available: {summaryData.availableDates.minDate} to {summaryData.availableDates.maxDate}
            </div>
          )}
        </div>
      </div>

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
            <StatCard
              key={index}
              title={stat.title}
              value={stat.value}
              subtitle={stat.subtitle}
              icon={stat.icon}
            />
          ))}
        </div>
      )}

      {/* Time Series Charts */}
      {!loading && summaryData && (
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
            {/* Received Qty Chart */}
            <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Received Qty Over Time</h3>
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
                    <Bar dataKey="receivedQty" fill="#dc2626" radius={[4, 4, 0, 0]}>
                      <LabelList 
                        dataKey="receivedQty" 
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

            {/* Total CBM Chart */}
            <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Total CBM Over Time</h3>
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
                    <Bar dataKey="totalCbm" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                      <LabelList 
                        dataKey="totalCbm" 
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
      )}

      {/* Summary Totals Table */}
      {!loading && summaryData && (
        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Summary Totals</h3>
          </div>
          
          {summaryData.summaryTotals ? (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-white dark:bg-slate-800/50 z-10 shadow-sm">
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    {summaryData.summaryTotals.dayData && summaryData.summaryTotals.dayData.length > 0 ? (
                      <>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Days</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total Received Qty</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total CBM</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total Received Qty</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Total CBM</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {summaryData.summaryTotals.dayData && summaryData.summaryTotals.dayData.length > 0 ? (
                    summaryData.summaryTotals.dayData.map((day) => (
                      <tr key={day.date} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                          {day.label}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300">
                          {formatNumber(day.receivedQty)}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300">
                          {formatNumber(day.totalCbm, 2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-b border-gray-100 dark:border-slate-800">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                        {formatNumber(summaryData.summaryTotals.totalReceivedQty)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-slate-300 font-medium">
                        {formatNumber(summaryData.summaryTotals.totalCbm, 2)}
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
      )}

      {/* Info Section */}
      {!loading && summaryData && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4 mb-8">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-500">Phase 3 - Inbound with CBM</h4>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                This dashboard shows inbound metrics calculated from uploaded Item Master and Inbound Fresh Receipt files.
                CBM values are automatically calculated by joining received SKUs with the Item Master data.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
