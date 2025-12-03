'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/common/PageHeader';
import { MetricCard } from '@/components/ui/metric-card';
import {
  FileText,
  DollarSign,
  Calculator,
  Calendar,
  MapPin,
  Building2,
  RefreshCw,
  Download,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  Check,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

// Types
interface BillingLineItem {
  id: string;
  type: string;
  label: string;
  qty: number | null;
  cbm: number | null;
  rate: number | null;
  amount: number;
  isCore: boolean;
  source: string;
}

interface BillingPeriod {
  id: string;
  customerName: string;
  location: string;
  year: number;
  month: number;
  fromDate: string | null;
  toDate: string | null;
  inventoryCbm: number;
  outboundCbm: number;
  inventoryRate: number;
  outboundRate: number;
  inventoryAmount: number;
  outboundAmount: number;
  subtotalAmount: number;
  gstPercent: number;
  gstAmount: number;
  grandTotal: number;
  status: string;
  lineItems: BillingLineItem[];
  updatedAt?: string;
}

// Helper to format numbers as currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num: number | null | undefined, decimals = 2) => {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

// Get current month/year
const getCurrentMonthYear = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
};

// Generate month options (last 12 months + next 3 months)
const getMonthOptions = () => {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  
  // Start from 12 months ago to 3 months ahead
  for (let i = -12; i <= 3; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const monthName = date.toLocaleString('default', { month: 'long' });
    options.push({
      value: `${year}-${month}`,
      label: `${monthName} ${year}`,
    });
  }
  
  return options.reverse(); // Most recent first
};

export default function BillingPage() {
  // Filter states
  const [customerName, setCustomerName] = useState('Lifelong');
  const [location, setLocation] = useState('HR-11 & HR12 (Farukh Nagar & Daboda)');
  const { year: currentYear, month: currentMonth } = getCurrentMonthYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Data states
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable extra line items (local state)
  const [extraItems, setExtraItems] = useState<BillingLineItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync extra items when billing period changes
  useEffect(() => {
    if (billingPeriod) {
      setExtraItems(billingPeriod.lineItems.filter((item) => !item.isCore));
      setHasChanges(false);
    }
  }, [billingPeriod]);

  // Generate/Recalculate billing
  const handleGenerateBilling = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${BACKEND_URL}/billing/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          location,
          year: selectedYear,
          month: selectedMonth,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate billing');
      }

      const data = await response.json();
      setBillingPeriod(data.billingPeriod);
      setSuccess('Billing generated successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setGenerating(false);
    }
  };

  // Load existing billing on mount or when month changes
  const loadExistingBilling = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        customerName,
        location,
        year: selectedYear.toString(),
        month: selectedMonth.toString(),
      });

      const response = await fetch(`${BACKEND_URL}/billing/view?${params}`);

      if (response.ok) {
        const data = await response.json();
        setBillingPeriod(data.billingPeriod);
      } else if (response.status === 404) {
        // No existing billing, that's okay
        setBillingPeriod(null);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load billing');
      }
    } catch (err: any) {
      // Don't show error for 404
      if (!err.message?.includes('404')) {
        console.error('Error loading billing:', err);
      }
      setBillingPeriod(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExistingBilling();
  }, [selectedYear, selectedMonth, customerName, location]);

  // Add new extra line item
  const handleAddExtraItem = () => {
    const newItem: BillingLineItem = {
      id: `temp-${Date.now()}`,
      type: 'OTHER',
      label: '',
      qty: null,
      cbm: null,
      rate: null,
      amount: 0,
      isCore: false,
      source: 'USER',
    };
    setExtraItems([...extraItems, newItem]);
    setHasChanges(true);
  };

  // Update extra line item
  const handleUpdateExtraItem = (
    index: number,
    field: keyof BillingLineItem,
    value: string | number | null
  ) => {
    const updated = [...extraItems];
    (updated[index] as any)[field] = value;

    // Auto-calculate amount if qty and rate are set
    if (field === 'qty' || field === 'rate') {
      const qty = updated[index].qty ?? 0;
      const rate = updated[index].rate ?? 0;
      updated[index].amount = qty * rate;
    }

    setExtraItems(updated);
    setHasChanges(true);
  };

  // Remove extra line item
  const handleRemoveExtraItem = (index: number) => {
    const updated = extraItems.filter((_, i) => i !== index);
    setExtraItems(updated);
    setHasChanges(true);
  };

  // Save changes
  const handleSaveChanges = async () => {
    if (!billingPeriod) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Prepare line items for API (remove temp IDs)
      const lineItemsPayload = extraItems.map((item) => ({
        id: item.id.startsWith('temp-') ? undefined : item.id,
        type: item.type || 'OTHER',
        label: item.label,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
      }));

      const response = await fetch(
        `${BACKEND_URL}/billing/${billingPeriod.id}/lines`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lineItemsPayload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save changes');
      }

      const data = await response.json();
      setBillingPeriod(data.billingPeriod);
      setHasChanges(false);
      setSuccess('Changes saved successfully!');
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!billingPeriod) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/billing/${billingPeriod.id}/pdf`
      );

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${customerName}_${selectedYear}-${String(selectedMonth).padStart(2, '0')}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to download invoice');
    }
  };

  // Download Excel with multiple sheets
  const handleDownloadExcel = async () => {
    if (!billingPeriod) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/billing/${billingPeriod.id}/excel`
      );

      if (!response.ok) {
        throw new Error('Failed to generate Excel');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthShort = monthNames[selectedMonth - 1];
      a.download = `Billing_Details_${customerName}_${monthShort}-${selectedYear}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to download Excel');
    }
  };

  // Get core items
  const coreItems = billingPeriod?.lineItems.filter((item) => item.isCore) || [];

  // Calculate local totals (for preview before save)
  const calculateLocalTotals = () => {
    if (!billingPeriod) return { subtotal: 0, gst: 0, grandTotal: 0 };

    const coreTotal = coreItems.reduce((sum, item) => sum + item.amount, 0);
    const extraTotal = extraItems.reduce((sum, item) => sum + (item.amount || 0), 0);
    const subtotal = coreTotal + extraTotal;
    const gst = subtotal * (billingPeriod.gstPercent / 100);
    const grandTotal = subtotal + gst;

    return { subtotal, gst, grandTotal };
  };

  const localTotals = calculateLocalTotals();

  // Line item type options for Other Expenses (from billing template)
  const lineItemTypes = [
    { value: 'OT_BLUE_COLLARS', label: 'Overtime Cost Blue Collars' },
    { value: 'ADHOC_MANPOWER', label: 'Adhoc Manpower cost' },
    { value: 'SUN_MGMT', label: 'Sunday/Holiday Working Mgmt Charges' },
    { value: 'SUN_BLUE_COLLAR', label: 'Sunday/Holiday Working Blue Collar' },
    { value: 'SUN_SUPERVISOR', label: 'Sunday/Holiday Working Supervisor' },
    { value: 'PACKING_CONSUMABLES', label: 'Packing Materials & Consumables' },
    { value: 'FOOD_SNACKS', label: 'Food Snacks' },
  ];

  const monthOptions = getMonthOptions();

  return (
    <div className="pb-8">
      <PageHeader
        title="Billing Management"
        description="Generate and manage billing invoices based on inventory and outbound data"
      />

      {/* Filters Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/40 dark:border-slate-700/40 rounded-2xl p-6 mb-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      >
        {/* Decorative gradient blob */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Customer Name */}
          <div className="md:col-span-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Building2 className="w-3.5 h-3.5" /> Customer
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full pl-3 pr-3 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none"
                placeholder="Customer name"
              />
            </div>
          </div>

          {/* Location */}
          <div className="md:col-span-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <MapPin className="w-3.5 h-3.5" /> Location
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-3 pr-3 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white border-none focus:ring-0 placeholder-gray-400 outline-none"
                placeholder="Location"
              />
            </div>
          </div>

          {/* Month/Year Picker */}
          <div className="md:col-span-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider ml-1">
              <Calendar className="w-3.5 h-3.5" /> Billing Month
            </label>
            <div className="group flex items-center bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-1 shadow-sm transition-all hover:border-brandRed/30 hover:shadow-md focus-within:border-brandRed focus-within:ring-4 focus-within:ring-brandRed/5">
              <select
                value={`${selectedYear}-${selectedMonth}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setSelectedYear(y);
                  setSelectedMonth(m);
                }}
                className="w-full pl-3 pr-8 py-1.5 bg-transparent text-xs font-semibold text-gray-900 dark:text-white outline-none appearance-none cursor-pointer"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Generate Button */}
          <div className="md:col-span-3 flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02, translateY: -2 }}
              whileTap={{ scale: 0.98, translateY: 0 }}
              onClick={handleGenerateBilling}
              disabled={generating}
              className="flex-1 h-[36px] bg-gradient-to-r from-brandRed to-red-600 text-white rounded-xl text-xs font-bold tracking-wide shadow-lg shadow-brandRed/25 flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed transition-all hover:shadow-brandRed/40"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Generate Billing</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Optional Date Range Override */}
        <div className="mt-4 pt-4 border-t border-gray-200/50 dark:border-slate-700/50">
          <p className="text-xs text-gray-500 dark:text-slate-500 mb-3">
            Optional: Override date range (defaults to full month)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-900 dark:text-white outline-none focus:border-brandRed focus:ring-1 focus:ring-brandRed/20"
              />
          </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-900 dark:text-white outline-none focus:border-brandRed focus:ring-1 focus:ring-brandRed/20"
              />
        </div>
          </div>
        </div>
      </motion.div>

      {/* Success/Error Messages */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-4 flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-green-600 dark:text-green-500" />
            <p className="text-sm text-green-700 dark:text-green-400">{success}</p>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-brandRed border-t-transparent"></div>
          </div>
      )}

      {/* No Data State */}
      {!loading && !billingPeriod && (
        <div className="bg-brandYellow/10 dark:bg-brandYellow/10 border border-brandYellow/20 rounded-xl p-8 text-center">
          <FileText className="w-16 h-16 text-brandYellow mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-200 mb-2">
            No Billing Data Found
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
            Click &quot;Generate Billing&quot; to create a billing invoice for the selected month.
          </p>
        </div>
      )}

      {/* Billing Content */}
      {!loading && billingPeriod && (
        <>
          {/* Billing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <MetricCard
              title="Inventory Costing"
              value={formatCurrency(billingPeriod.inventoryAmount)}
              subtitle={`${formatNumber(billingPeriod.inventoryCbm)} CBM × ${formatCurrency(billingPeriod.inventoryRate)}/CBM`}
              icon={DollarSign}
            />
            <MetricCard
              title="Out Bound Costing"
              value={formatCurrency(billingPeriod.outboundAmount)}
              subtitle={`${formatNumber(billingPeriod.outboundCbm)} CBM × ${formatCurrency(billingPeriod.outboundRate)}/CBM`}
              icon={DollarSign}
            />
            <MetricCard
              title="Core Total Cost"
              value={formatCurrency(billingPeriod.inventoryAmount + billingPeriod.outboundAmount)}
              subtitle="Inventory + Outbound (excl. Other Expenses)"
              icon={Calculator}
            />
      </div>

          {/* Billing Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-gray-200/50 dark:border-slate-700/50 rounded-2xl p-6 shadow-lg mb-8"
          >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-gradient-to-br from-green-400 to-green-600 animate-pulse shadow-lg shadow-green-500/50" />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                    Billing Details
                  </h3>
                </div>
                <div className="px-3 py-1 bg-gray-100 dark:bg-slate-700 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-300">
                  {billingPeriod.status.toUpperCase()}
                </div>
              </div>
              <div className="flex gap-2">
                {hasChanges && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSaveChanges}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-70 shadow-md"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Changes
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownloadPdf}
                  className="px-4 py-2 bg-brandRed hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  Download Invoice
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDownloadExcel}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Excel
                </motion.button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-brandRed to-red-600 text-white">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider w-2/5">
                      Particulars
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider w-1/8">
                      Qty
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider w-1/8">
                      CBM
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider w-1/8">
                      Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider w-1/6">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider w-16">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Core Section Header */}
                  <tr className="bg-gray-100 dark:bg-slate-700/50">
                    <td
                      colSpan={6}
                      className="px-4 py-2 text-sm font-bold text-gray-700 dark:text-slate-300"
                    >
                      📦 Qty- Processing & Storage Footwear- B2C
                    </td>
                  </tr>

                  {/* Core Items (Read-only) */}
                  {coreItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-200">
                        {item.label}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-400">
                        {item.qty !== null ? formatNumber(item.qty, 0) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-400">
                        {formatNumber(item.cbm)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-600 dark:text-slate-400">
                        {formatCurrency(item.rate || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-gray-900 dark:text-slate-200">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-400 dark:text-slate-500">
                          Auto
                        </span>
                      </td>
                    </tr>
                  ))}

                  {/* Other Expenses Section Header */}
                  <tr className="bg-orange-50 dark:bg-orange-900/20">
                    <td
                      colSpan={6}
                      className="px-4 py-2 text-sm font-bold text-orange-700 dark:text-orange-300 flex items-center gap-2"
                    >
                      💰 Other Expenses
                      <button
                        onClick={handleAddExtraItem}
                        className="ml-auto px-2 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Item
              </button>
                    </td>
                  </tr>

                  {/* Editable Extra Items */}
                  {extraItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500 italic"
                      >
                        No additional expenses. Click &quot;Add Item&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    extraItems.map((item, index) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-100 dark:border-slate-700/50 bg-orange-50/30 dark:bg-orange-900/10"
                      >
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <select
                              value={item.type}
                              onChange={(e) =>
                                handleUpdateExtraItem(index, 'type', e.target.value)
                              }
                              className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-xs font-medium text-gray-700 dark:text-slate-300 outline-none focus:border-brandRed"
                            >
                              {lineItemTypes.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) =>
                                handleUpdateExtraItem(index, 'label', e.target.value)
                              }
                              placeholder="Description"
                              className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-sm text-gray-900 dark:text-slate-200 outline-none focus:border-brandRed"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={item.qty ?? ''}
                            onChange={(e) =>
                              handleUpdateExtraItem(
                                index,
                                'qty',
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            placeholder="Qty"
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-sm text-center text-gray-900 dark:text-slate-200 outline-none focus:border-brandRed"
                          />
                        </td>
                        <td className="px-4 py-2 text-center text-sm text-gray-400 dark:text-slate-500">
                          -
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={item.rate ?? ''}
                            onChange={(e) =>
                              handleUpdateExtraItem(
                                index,
                                'rate',
                                e.target.value ? parseFloat(e.target.value) : null
                              )
                            }
                            placeholder="Rate"
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-sm text-right text-gray-900 dark:text-slate-200 outline-none focus:border-brandRed"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={item.amount || ''}
                            onChange={(e) =>
                              handleUpdateExtraItem(
                                index,
                                'amount',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            placeholder="Amount"
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded text-sm text-right font-mono font-semibold text-gray-900 dark:text-slate-200 outline-none focus:border-brandRed"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleRemoveExtraItem(index)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}

                  {/* Totals Section */}
                  <tr className="bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-400">
                    <td
                      colSpan={4}
                      className="px-4 py-3 text-right text-sm font-bold text-amber-700 dark:text-amber-300"
                    >
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-base font-mono font-bold text-amber-700 dark:text-amber-300">
                      {formatCurrency(hasChanges ? localTotals.subtotal : billingPeriod.subtotalAmount)}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-blue-50 dark:bg-blue-900/20">
                    <td
                      colSpan={4}
                      className="px-4 py-3 text-right text-sm font-semibold text-blue-700 dark:text-blue-300"
                    >
                      GST @ {billingPeriod.gstPercent}%
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-blue-700 dark:text-blue-300">
                      {formatCurrency(hasChanges ? localTotals.gst : billingPeriod.gstAmount)}
                    </td>
                    <td></td>
                  </tr>
                  <tr className="bg-green-100 dark:bg-green-900/30 border-t-2 border-green-500">
                    <td
                      colSpan={4}
                      className="px-4 py-4 text-right text-base font-bold text-green-700 dark:text-green-300"
                    >
                      Grand Total
                    </td>
                    <td className="px-4 py-4 text-right text-xl font-mono font-bold text-green-700 dark:text-green-300">
                      {formatCurrency(hasChanges ? localTotals.grandTotal : billingPeriod.grandTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Unsaved Changes Warning */}
            {hasChanges && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  You have unsaved changes. Click &quot;Save Changes&quot; to persist them.
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Period Info */}
          <div className="text-xs text-gray-500 dark:text-slate-500 text-center">
            <p>
              Billing Period: {billingPeriod.fromDate ? new Date(billingPeriod.fromDate).toLocaleDateString('en-IN') : '-'} 
              {' '} to {' '}
              {billingPeriod.toDate ? new Date(billingPeriod.toDate).toLocaleDateString('en-IN') : '-'}
              {' '} | Last updated: {new Date(billingPeriod.updatedAt || Date.now()).toLocaleString('en-IN')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
