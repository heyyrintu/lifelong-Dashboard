'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
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
} from 'lucide-react';

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
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

type TimeFilter = '24h' | '48h' | 'month';

export default function SummaryPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QuickSummaryData | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [selectedProductCategories, setSelectedProductCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

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

  const getDateRangeForFilter = (filter: TimeFilter) => {
    const now = new Date();
    let fromDate: string;
    const toDate: string = now.toISOString().split('T')[0];

    if (filter === '24h') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      fromDate = yesterday.toISOString().split('T')[0];
    } else if (filter === '48h') {
      const twoDaysAgo = new Date(now);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      fromDate = twoDaysAgo.toISOString().split('T')[0];
    } else {
      // Current month
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      fromDate = firstDayOfMonth.toISOString().split('T')[0];
    }

    return { fromDate, toDate };
  };

  const fetchSummary = async (useFilters = false) => {
    try {
      setLoading(true);

      const { fromDate, toDate } = getDateRangeForFilter(timeFilter);

      // Build query params
      const buildParams = () => {
        const params = new URLSearchParams();
        if (useFilters) {
          params.append('fromDate', fromDate);
          params.append('toDate', toDate);
          if (selectedProductCategories.length > 0) {
            selectedProductCategories.forEach(cat => params.append('productCategory', cat));
          }
        }
        return params.toString();
      };

      const queryString = buildParams();

      // Fetch all three endpoints in parallel
      const [inboundRes, inventoryRes, outboundRes] = await Promise.all([
        fetch(`${BACKEND_URL}/inbound/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        fetch(`${BACKEND_URL}/inventory/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
        fetch(`${BACKEND_URL}/outbound/summary${queryString ? '?' + queryString : ''}`).catch(() => null),
      ]);

      // Parse responses
      const inboundData = inboundRes?.ok ? await inboundRes.json() : null;
      const inventoryData = inventoryRes?.ok ? await inventoryRes.json() : null;
      const outboundData = outboundRes?.ok ? await outboundRes.json() : null;

      // Collect product categories from all sources
      const categories = new Set<string>();
      if (inboundData?.productCategories) {
        inboundData.productCategories.forEach((c: string) => categories.add(c));
      }
      if (inventoryData?.filters?.availableProductCategories) {
        inventoryData.filters.availableProductCategories.forEach((c: string) => categories.add(c));
      }
      if (outboundData?.productCategories) {
        outboundData.productCategories.forEach((c: string) => categories.add(c));
      }
      setAvailableCategories(Array.from(categories).filter(c => c !== 'ALL'));

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
    setTimeFilter('month');
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

  const getTimeFilterLabel = (filter: TimeFilter) => {
    switch (filter) {
      case '24h': return '24 Hours';
      case '48h': return '48 Hours';
      case 'month': return 'Current Month';
    }
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
          {/* Time Filter */}
          <div className="md:col-span-5 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Clock className="w-3.5 h-3.5" /> Time Period
            </label>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm">
              {(['24h', '48h', 'month'] as const).map((filter) => (
                <motion.button
                  key={filter}
                  onClick={() => setTimeFilter(filter)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex-1 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    timeFilter === filter
                      ? 'bg-gradient-to-r from-brandRed to-red-600 text-white shadow-lg shadow-brandRed/25'
                      : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-100/50 dark:hover:bg-slate-700/50'
                  }`}
                  suppressHydrationWarning={true}
                >
                  {getTimeFilterLabel(filter)}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Product Category */}
          <div className="md:col-span-4 space-y-2 relative" ref={categoryDropdownRef}>
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
          <div className="md:col-span-3 flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98, translateY: 0 }}
              onClick={handleFilter}
              disabled={loading}
              className="flex-1 h-[40px] bg-gradient-to-r from-brandRed to-red-600 text-white rounded-xl text-xs font-bold tracking-wide shadow-lg shadow-brandRed/25 flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-brandRed/40"
              suppressHydrationWarning={true}
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Apply Filter</span>
                </>
              )}
            </motion.button>
            {(timeFilter !== 'month' || selectedProductCategories.length > 0) && (
              <motion.button
                whileHover={{ scale: 1.02, translateY: -2 }}
                whileTap={{ scale: 0.98, translateY: 0 }}
                onClick={handleReset}
                className="h-[40px] px-3 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 text-gray-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-300 dark:hover:border-slate-600 shadow-sm flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
            )}
          </div>
        </div>
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
