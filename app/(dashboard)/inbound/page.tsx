import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import Table from '@/components/common/Table';
import Badge from '@/components/common/Badge';
import { ArrowDownToLine, Package, Clock, TrendingUp } from 'lucide-react';

export default function InboundPage() {
  const stats = [
    {
      title: 'Inbound Orders Today',
      value: '47',
      subtitle: 'Active orders',
      icon: ArrowDownToLine,
      trend: { value: 15.3, isPositive: true },
    },
    {
      title: 'Pending GRN',
      value: '23',
      subtitle: 'Awaiting receipt',
      icon: Clock,
    },
    {
      title: 'Total Units Expected',
      value: '8,450',
      subtitle: 'This week',
      icon: Package,
    },
    {
      title: 'Top Vendors',
      value: '12',
      subtitle: 'Active suppliers',
      icon: TrendingUp,
    },
  ];

  const columns = [
    { header: 'Date', accessor: 'date' },
    { header: 'PO Number', accessor: 'poNumber' },
    { header: 'Supplier', accessor: 'supplier' },
    { header: 'Quantity', accessor: 'quantity' },
    { header: 'Status', accessor: 'status' },
    { header: 'Expected Date', accessor: 'expectedDate' },
  ];

  const tableData = [
    {
      date: '2024-11-24',
      poNumber: 'PO-2024-1234',
      supplier: 'ABC Suppliers Ltd.',
      quantity: '500 units',
      status: <Badge variant="warning">Pending</Badge>,
      expectedDate: '2024-11-26',
    },
    {
      date: '2024-11-24',
      poNumber: 'PO-2024-1235',
      supplier: 'XYZ Industries',
      quantity: '750 units',
      status: <Badge variant="success">Received</Badge>,
      expectedDate: '2024-11-24',
    },
    {
      date: '2024-11-23',
      poNumber: 'PO-2024-1230',
      supplier: 'Global Traders Co.',
      quantity: '300 units',
      status: <Badge variant="info">In Transit</Badge>,
      expectedDate: '2024-11-25',
    },
    {
      date: '2024-11-23',
      poNumber: 'PO-2024-1228',
      supplier: 'DEF Manufacturing',
      quantity: '1200 units',
      status: <Badge variant="success">Received</Badge>,
      expectedDate: '2024-11-23',
    },
    {
      date: '2024-11-22',
      poNumber: 'PO-2024-1225',
      supplier: 'Prime Logistics',
      quantity: '450 units',
      status: <Badge variant="error">Delayed</Badge>,
      expectedDate: '2024-11-22',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inbound Management"
        description="Track and manage incoming shipments, purchase orders, and goods receipt notes"
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

      {/* Filters placeholder */}
      <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-6 shadow-sm dark:shadow-none">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Date Range</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>This month</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Supplier</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All Suppliers</option>
              <option>ABC Suppliers Ltd.</option>
              <option>XYZ Industries</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Status</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All Status</option>
              <option>Pending</option>
              <option>Received</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full bg-brandRed hover:bg-red-700 dark:hover:bg-red-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Inbound orders table */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Inbound Orders</h3>
        <Table columns={columns} data={tableData} />
      </div>

      <p className="text-xs text-gray-500 dark:text-slate-500 text-center mt-4">
        ⚠ Placeholder data - Real data integration will be added in Phase 2
      </p>
    </div>
  );
}
