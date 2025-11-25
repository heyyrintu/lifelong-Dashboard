import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import {
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  FileText,
  AlertCircle,
} from 'lucide-react';

export default function SummaryPage() {
  const stats = [
    {
      title: 'Total Shipments',
      value: '2,847',
      subtitle: 'This month',
      icon: Package,
      trend: { value: 12.5, isPositive: true },
    },
    {
      title: 'Inbound Orders',
      value: '1,234',
      subtitle: 'Pending processing',
      icon: ArrowDownToLine,
      trend: { value: 8.2, isPositive: true },
    },
    {
      title: 'Outbound Orders',
      value: '1,613',
      subtitle: 'This month',
      icon: ArrowUpFromLine,
      trend: { value: 5.3, isPositive: false },
    },
    {
      title: 'Inventory Units',
      value: '45,890',
      subtitle: 'Total in stock',
      icon: Boxes,
      trend: { value: 3.1, isPositive: true },
    },
    {
      title: 'LR Missing',
      value: '23',
      subtitle: 'Requires attention',
      icon: AlertCircle,
    },
    {
      title: 'Billing Pending',
      value: '₹12.4L',
      subtitle: 'To be invoiced',
      icon: FileText,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Quick Summary"
        description="Overview of key metrics and performance indicators for logistics operations"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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

      {/* Chart placeholder section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Monthly Trends</h3>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900/50">
            <div className="text-center">
              <Package className="w-12 h-12 text-gray-400 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-slate-400 text-sm">Chart will be integrated in Phase 2</p>
              <p className="text-gray-500 dark:text-slate-500 text-xs mt-1">Inbound vs Outbound trends</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">
            Performance Distribution
          </h3>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900/50">
            <div className="text-center">
              <Boxes className="w-12 h-12 text-gray-400 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-slate-400 text-sm">Chart will be integrated in Phase 2</p>
              <p className="text-gray-500 dark:text-slate-500 text-xs mt-1">Category-wise breakdown</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity placeholder */}
      <div className="mt-6 bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[
            {
              action: 'New inbound order received',
              details: 'PO-2024-1234 from Supplier ABC',
              time: '5 minutes ago',
            },
            {
              action: 'Outbound shipment dispatched',
              details: 'Order #9876 - 250 units',
              time: '23 minutes ago',
            },
            {
              action: 'Inventory updated',
              details: 'SKU-5678 stock level adjusted',
              time: '1 hour ago',
            },
            {
              action: 'Billing generated',
              details: 'Invoice INV-2024-456 - ₹2.5L',
              time: '2 hours ago',
            },
          ].map((activity, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <div className="w-2 h-2 bg-brandRed rounded-full mt-2"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-slate-200">{activity.action}</p>
                <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">{activity.details}</p>
              </div>
              <span className="text-xs text-gray-500 dark:text-slate-500">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
