'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import { ArrowDownToLine, Package, Clock, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react';

interface InboundCardMetrics {
  invoiceSkuCount: number;
  receivedSkuCount: number;
  invoiceQtyTotal: number;
  receivedQtyTotal: number;
  goodQtyTotal: number;
  totalCbm: number;
}

interface InboundSummaryResponse {
  cards: InboundCardMetrics;
  availableDates: {
    minDate: string | null;
    maxDate: string | null;
  };
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function InboundPage() {
  const [summaryData, setSummaryData] = useState<InboundSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [month, setMonth] = useState('');

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async (from?: string, to?: string) => {
    try {
      setLoading(true);
      let url = `${BACKEND_URL}/inbound/summary`;
      const params = new URLSearchParams();
      
      if (from) params.append('fromDate', from);
      if (to) params.append('toDate', to);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

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

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedMonth = e.target.value;
    setMonth(selectedMonth);
    
    if (selectedMonth) {
      const [year, monthVal] = selectedMonth.split('-');
      // First day of the month
      const start = new Date(parseInt(year), parseInt(monthVal) - 1, 1);
      // Last day of the month
      const end = new Date(parseInt(year), parseInt(monthVal), 0);
      
      const formatDate = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
      };

      setFromDate(formatDate(start));
      setToDate(formatDate(end));
    }
  };

  const handleFilter = () => {
    fetchSummary(fromDate, toDate);
  };

  const handleReset = () => {
    setFromDate('');
    setToDate('');
    setMonth('');
    fetchSummary();
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
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-6 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Date Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" suppressHydrationWarning>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Month</label>
            <input
              type="month"
              value={month}
              onChange={handleMonthChange}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setMonth('');
              }}
              min={summaryData?.availableDates?.minDate || ''}
              max={summaryData?.availableDates?.maxDate || ''}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setMonth('');
              }}
              min={summaryData?.availableDates?.minDate || ''}
              max={summaryData?.availableDates?.maxDate || ''}
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
              suppressHydrationWarning
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={handleFilter}
              className="flex-1 bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
              suppressHydrationWarning
            >
              Filter
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors"
              suppressHydrationWarning
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
