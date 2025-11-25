'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import Table from '@/components/common/Table';
import { Package, TrendingUp, Box, ArrowRightLeft } from 'lucide-react';

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

interface SummaryResponse {
  cards: CardMetrics;
  categoryTable: CategoryRow[];
  availableMonths: string[];
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
      }

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

      {/* Date Filters - Moved to Top */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Date Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

      {/* Category Table - Also responds to filters */}
      <div className="mb-6">
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
    </div>
  );
}
