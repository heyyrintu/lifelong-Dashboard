'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import StatCard from '@/components/common/StatCard';
import { Boxes, Package, Box, ChevronDown, Check } from 'lucide-react';
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
        if (fromDate) params.append('fromDate', fromDate);
        if (toDate) params.append('toDate', toDate);
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
        <span>Inventory Qty</span>
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
        <span>EDEL Inventory Qty</span>
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
            backgroundColor: '#f59e0b',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>Total CBM</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            width: 12,
            height: 12,
            backgroundColor: '#6366f1',
            borderRadius: 2,
            display: 'inline-block',
          }}
        />
        <span>EDEL CBM</span>
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
      {/* Date & Category Filters */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" suppressHydrationWarning={true}>
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
                {(data?.filters.availableProductCategories || []).filter(c => c !== 'ALL').map((category) => (
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
        
        {/* Date range info */}
        {data?.filters.availableDateRange && (
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-3">
            Available date range: {data.filters.availableDateRange.minDate || 'N/A'} to {data.filters.availableDateRange.maxDate || 'N/A'}
          </p>
        )}
      </div>

      {/* Metrics Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Inbound SKU"
            value={formatNumber(data?.cards.inboundSkuCount)}
            subtitle="Unique SKUs with CBM > 0"
            icon={Boxes}
          />
          <StatCard
            title="Inventory QTY"
            value={formatNumber(data?.cards.inventoryQtyTotal)}
            subtitle="Total stock quantity"
            icon={Package}
          />
          <StatCard
            title="Total CBM"
            value={formatNumber(data?.cards.totalCbm)}
            subtitle="Cubic meter volume"
            icon={Box}
          />
        </div>
      )}

      {/* Time Series Charts */}
      {!loading && data && chartData && chartData.points.length > 0 && displayPoints.length > 0 && (
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
                  onClick={() => setTimeGranularity(granularity)}
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
            {/* Inventory Qty vs EDEL Inventory Qty */}
            <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Inventory Qty vs EDEL Inventory Qty Over Time</h3>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={displayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) => `${formatInLakhs(value)} L`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#f3f4f6' }}
                    itemStyle={{ color: '#f3f4f6' }}
                    formatter={(value: number, name: string) => [
                      formatInLakhs(value),
                      name === 'edelInventoryQty' ? 'EDEL Inventory Qty' : 'Inventory Qty',
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    content={<QtyLegend />}
                  />
                  <Bar dataKey="inventoryQty" fill="#3b82f6" name="Inventory Qty">
                    <LabelList
                      dataKey="inventoryQty"
                      position="top"
                      formatter={(value: any) => formatInLakhs(value)}
                      style={{ fontSize: 11, fill: '#6b7280' }}
                    />
                  </Bar>
                  <Bar dataKey="edelInventoryQty" fill="#dc2626" name="EDEL Inventory Qty">
                    <LabelList
                      dataKey="edelInventoryQty"
                      position="top"
                      formatter={(value: any) => formatInLakhs(value)}
                      style={{ fontSize: 11, fill: '#6b7280' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Total CBM vs EDEL CBM */}
            <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Total CBM vs EDEL CBM Over Time</h3>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={displayPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) => `${formatInLakhs(value)} L`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#f3f4f6' }}
                    itemStyle={{ color: '#f3f4f6' }}
                    formatter={(value: number, name: string) => [
                      formatNumber(value),
                      name === 'edelTotalCbm' ? 'EDEL CBM' : 'Total CBM',
                    ]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    content={<CbmLegend />}
                  />
                  <Bar dataKey="totalCbm" fill="#f59e0b" name="Total CBM">
                    <LabelList
                      dataKey="totalCbm"
                      position="top"
                      formatter={(value: any) => formatNumber(value)}
                      style={{ fontSize: 11, fill: '#6b7280' }}
                    />
                  </Bar>
                  <Bar dataKey="edelTotalCbm" fill="#6366f1" name="EDEL CBM">
                    <LabelList
                      dataKey="edelTotalCbm"
                      position="top"
                      formatter={(value: any) => formatNumber(value)}
                      style={{ fontSize: 11, fill: '#6b7280' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
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
