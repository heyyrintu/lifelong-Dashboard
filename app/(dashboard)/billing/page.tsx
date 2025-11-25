import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import Table from '@/components/common/Table';
import Badge from '@/components/common/Badge';
import { FileText, DollarSign, AlertCircle, TrendingUp } from 'lucide-react';

export default function BillingPage() {
  const stats = [
    {
      title: 'Billing Posted Today',
      value: '₹8.5L',
      subtitle: '12 invoices',
      icon: FileText,
      trend: { value: 15.2, isPositive: true },
    },
    {
      title: 'Billing Pending',
      value: '₹12.4L',
      subtitle: '23 pending',
      icon: DollarSign,
    },
    {
      title: 'Discrepancies',
      value: '8',
      subtitle: 'Requires review',
      icon: AlertCircle,
    },
    {
      title: 'Monthly Total',
      value: '₹145.2L',
      subtitle: 'This month',
      icon: TrendingUp,
      trend: { value: 8.7, isPositive: true },
    },
  ];

  const columns = [
    { header: 'Invoice No', accessor: 'invoiceNo' },
    { header: 'Customer', accessor: 'customer' },
    { header: 'Order Reference', accessor: 'orderRef' },
    { header: 'Amount', accessor: 'amount' },
    { header: 'Status', accessor: 'status' },
    { header: 'Date', accessor: 'date' },
    { header: 'Due Date', accessor: 'dueDate' },
  ];

  const tableData = [
    {
      invoiceNo: 'INV-2024-1234',
      customer: 'Customer A Pvt Ltd',
      orderRef: 'ORD-2024-5678',
      amount: '₹2,45,000',
      status: <Badge variant="success">Paid</Badge>,
      date: '2024-11-24',
      dueDate: '2024-12-09',
    },
    {
      invoiceNo: 'INV-2024-1235',
      customer: 'E-commerce Platform',
      orderRef: 'ORD-2024-5679',
      amount: '₹1,85,500',
      status: <Badge variant="warning">Pending</Badge>,
      date: '2024-11-24',
      dueDate: '2024-12-09',
    },
    {
      invoiceNo: 'INV-2024-1236',
      customer: 'Dealer Network XYZ',
      orderRef: 'ORD-2024-5680',
      amount: '₹5,20,000',
      status: <Badge variant="info">Processing</Badge>,
      date: '2024-11-23',
      dueDate: '2024-12-08',
    },
    {
      invoiceNo: 'INV-2024-1233',
      customer: 'Retail Chain ABC',
      orderRef: 'ORD-2024-5675',
      amount: '₹3,15,750',
      status: <Badge variant="success">Paid</Badge>,
      date: '2024-11-23',
      dueDate: '2024-12-08',
    },
    {
      invoiceNo: 'INV-2024-1232',
      customer: 'Online Marketplace',
      orderRef: 'ORD-2024-5672',
      amount: '₹2,65,000',
      status: <Badge variant="error">Overdue</Badge>,
      date: '2024-11-20',
      dueDate: '2024-11-25',
    },
    {
      invoiceNo: 'INV-2024-1231',
      customer: 'Customer B Industries',
      orderRef: 'ORD-2024-5668',
      amount: '₹1,45,250',
      status: <Badge variant="success">Paid</Badge>,
      date: '2024-11-22',
      dueDate: '2024-12-07',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Billing Management"
        description="Track invoices, payments, and billing discrepancies across all customer orders"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <StatCard
            key={index}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            icon={stat.icon}
            trend={stat.trend}
          />
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-6 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Date Range</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>This month</option>
              <option>Last month</option>
              <option>Last 3 months</option>
              <option>Custom range</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Customer</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All Customers</option>
              <option>Customer A Pvt Ltd</option>
              <option>E-commerce Platform</option>
              <option>Dealer Network XYZ</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Status</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All Status</option>
              <option>Paid</option>
              <option>Pending</option>
              <option>Processing</option>
              <option>Overdue</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Invoice Search</label>
            <input
              type="text"
              placeholder="INV-2024-..."
              className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 placeholder-gray-500 dark:placeholder-slate-500 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Billing summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-500/10 dark:to-green-500/5 border border-green-200 dark:border-green-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Paid This Month</h4>
            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-500" />
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-500">₹85.2L</p>
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">45 invoices</p>
        </div>

        <div className="bg-gradient-to-br from-brandYellow/20 to-brandYellow/10 dark:from-brandYellow/10 dark:to-brandYellow/5 border border-brandYellow/30 dark:border-brandYellow/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Pending Payment</h4>
            <AlertCircle className="w-5 h-5 text-brandYellow dark:text-brandYellow" />
          </div>
          <p className="text-2xl font-bold text-brandYellow">₹52.8L</p>
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">28 invoices</p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-500/10 dark:to-red-500/5 border border-red-200 dark:border-red-500/20 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Overdue</h4>
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-500">₹7.2L</p>
          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">5 invoices</p>
        </div>
      </div>

      {/* Billing table */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Invoices</h3>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors border border-gray-300 dark:border-slate-700 shadow-sm">
              Export to Excel
            </button>
            <button className="px-4 py-2 bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
              Generate Report
            </button>
          </div>
        </div>
        <Table columns={columns} data={tableData} />
      </div>

      {/* Discrepancies alert */}
      <div className="bg-brandYellow/10 dark:bg-brandYellow/10 border border-brandYellow/20 dark:border-brandYellow/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brandYellow mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-brandYellow">8 Billing Discrepancies Found</h4>
            <p className="text-xs text-yellow-700 dark:text-brandYellow/80 mt-1">
              Some invoices have mismatched amounts or missing LR references. Please review and
              resolve.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-slate-500 text-center mt-6">
        ⚠ Placeholder data - Real billing data will be integrated in Phase 2
      </p>
    </div>
  );
}
