'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import StatCard from '@/components/common/StatCard';
import { Boxes, Package, Box } from 'lucide-react';

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
}

interface InventorySummaryResponse {
  cards: InventoryCardMetrics;
  filters: InventoryFilters;
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

  useEffect(() => {
    fetchSummary();
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

  // Helper function to format numbers
  const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    
    // For large numbers, use thousand separators
    if (Number.isInteger(num)) {
      return num.toLocaleString();
    } else {
      return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
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
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Category (Item Group)</label>
            <select
              value={selectedItemGroup}
              onChange={(e) => setSelectedItemGroup(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning={true}
            >
              {(data?.filters.availableItemGroups || ['ALL']).map((group) => (
                <option key={group} value={group}>
                  {group}
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

      {/* Info section */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-500 mb-2">Card Calculations</h4>
        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
          <li><strong>Inbound SKU:</strong> Count of unique items with non-zero CBM per unit</li>
          <li><strong>Inventory QTY:</strong> Sum of all daily stock quantities across all SKUs in the date range</li>
          <li><strong>Total CBM:</strong> For each SKU: (average daily qty × CBM per unit), then sum across all SKUs</li>
        </ul>
      </div>
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
