'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StatCard from '@/components/common/StatCard';
import { ArrowDownToLine, Package, Clock, TrendingUp, CheckCircle, AlertCircle, Download, ChevronDown, Check } from 'lucide-react';
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
        <span>EDEL Received Qty</span>
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
        <span>Received Qty</span>
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
        <span>EDEL CBM</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 12,
            height: 12,
            backgroundColor: '#f59e0b',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>Total CBM</span>
      </div>
    </div>
  );

  return (
    <div>

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
          <div className="relative" ref={categoryDropdownRef}>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Product Category</label>
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none flex items-center justify-between"
              suppressHydrationWarning={true}
            >
              <span className="truncate">{getSelectedCategoriesLabel()}</span>
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {categoryDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                {/* Select All / Clear All buttons */}
                <div className="flex border-b border-gray-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={selectAllCategories}
                    className="flex-1 px-3 py-2 text-xs text-brandRed hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllCategories}
                    className="flex-1 px-3 py-2 text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors border-l border-gray-200 dark:border-slate-700"
                  >
                    Clear All
                  </button>
                </div>
                
                {/* Category options */}
                {(summaryData?.productCategories || []).filter(c => c !== 'ALL').map((category) => (
                  <label
                    key={category}
                    className="flex items-center px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-colors ${
                      selectedProductCategories.includes(category)
                        ? 'bg-brandRed border-brandRed'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}>
                      {selectedProductCategories.includes(category) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <span className="text-sm text-gray-900 dark:text-slate-300">
                      {formatProductCategory(category)}
                    </span>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedProductCategories.includes(category)}
                      onChange={() => toggleProductCategory(category)}
                    />
                  </label>
                ))}
              </div>
            )}
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
            {/* EDEL vs Total Received Qty Chart */}
            <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">EDEL vs Total Received Qty Over Time</h3>
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
                      tickFormatter={formatAxisLabel}
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
                        formatNumber(value),
                        name === 'edelReceivedQty' ? 'EDEL Received Qty' : 'Received Qty',
                      ]}
                    />
                    <Legend 
                      verticalAlign="top"
                      align="right"
                      content={<QtyLegend />}
                    />
                    <Bar dataKey="edelReceivedQty" fill="#3b82f6" radius={[4, 4, 0, 0]} name="EDEL Received Qty">
                      <LabelList 
                        dataKey="edelReceivedQty" 
                        position="top" 
                        formatter={(value: any) => formatInLakhs(value)}
                        style={{ fontSize: 11, fill: '#6b7280' }}
                      />
                    </Bar>
                    <Bar dataKey="receivedQty" fill="#dc2626" radius={[4, 4, 0, 0]} name="Received Qty">
                      <LabelList 
                        dataKey="receivedQty" 
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

            {/* EDEL vs Total CBM Chart */}
            <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">EDEL vs Total CBM Over Time</h3>
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
                      tickFormatter={formatAxisLabel}
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
                        formatNumber(value, 2),
                        name === 'edelTotalCbm' ? 'EDEL CBM' : 'Total CBM',
                      ]}
                    />
                    <Legend 
                      verticalAlign="top"
                      align="right"
                      content={<CbmLegend />}
                    />
                    <Bar dataKey="edelTotalCbm" fill="#3b82f6" radius={[4, 4, 0, 0]} name="EDEL CBM">
                      <LabelList 
                        dataKey="edelTotalCbm" 
                        position="top" 
                        formatter={(value: any) => formatNumber(value, 2)}
                        style={{ fontSize: 11, fill: '#6b7280' }}
                      />
                    </Bar>
                    <Bar dataKey="totalCbm" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Total CBM">
                      <LabelList 
                        dataKey="totalCbm" 
                        position="top" 
                        formatter={(value: any) => formatNumber(value, 2)}
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
                                    className={`w-1.5 h-5 rounded-full transition-all duration-500 ${
                                      i < Math.round((day.receivedQty / Math.max(...summaryData.summaryTotals!.dayData!.map(d => d.receivedQty))) * 10)
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
