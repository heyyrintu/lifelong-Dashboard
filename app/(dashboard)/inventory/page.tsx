import PageHeader from '@/components/common/PageHeader';
import StatCard from '@/components/common/StatCard';
import Table from '@/components/common/Table';
import Badge from '@/components/common/Badge';
import { Boxes, AlertTriangle, TrendingDown, Warehouse } from 'lucide-react';

export default function InventoryPage() {
  const stats = [
    {
      title: 'Total SKUs',
      value: '485',
      subtitle: 'Active items',
      icon: Boxes,
    },
    {
      title: 'Total Units',
      value: '45,890',
      subtitle: 'In stock',
      icon: Warehouse,
      trend: { value: 5.2, isPositive: true },
    },
    {
      title: 'Low Stock Items',
      value: '12',
      subtitle: 'Below threshold',
      icon: AlertTriangle,
    },
    {
      title: 'Ageing Inventory',
      value: '3,245',
      subtitle: '>90 days',
      icon: TrendingDown,
    },
  ];

  const columns = [
    { header: 'SKU', accessor: 'sku' },
    { header: 'Description', accessor: 'description' },
    { header: 'Available Qty', accessor: 'available' },
    { header: 'Reserved Qty', accessor: 'reserved' },
    { header: 'Location', accessor: 'location' },
    { header: 'Ageing (Days)', accessor: 'ageing' },
    { header: 'Status', accessor: 'status' },
  ];

  const tableData = [
    {
      sku: 'SKU-001234',
      description: 'DEF 20L Container',
      available: '2,450',
      reserved: '150',
      location: 'Warehouse A - Rack 12',
      ageing: '15',
      status: <Badge variant="success">Good</Badge>,
    },
    {
      sku: 'SKU-001235',
      description: 'DEF Pump Assembly',
      available: '85',
      reserved: '20',
      location: 'Warehouse B - Rack 5',
      ageing: '45',
      status: <Badge variant="success">Good</Badge>,
    },
    {
      sku: 'SKU-001236',
      description: 'DEF Sensor Unit',
      available: '15',
      reserved: '5',
      location: 'Warehouse A - Rack 8',
      ageing: '120',
      status: <Badge variant="warning">Low Stock</Badge>,
    },
    {
      sku: 'SKU-001237',
      description: 'DEF 5L Bottle',
      available: '5,600',
      reserved: '300',
      location: 'Warehouse C - Rack 1',
      ageing: '8',
      status: <Badge variant="success">Good</Badge>,
    },
    {
      sku: 'SKU-001238',
      description: 'DEF Nozzle Kit',
      available: '3',
      reserved: '0',
      location: 'Warehouse B - Rack 15',
      ageing: '95',
      status: <Badge variant="error">Critical</Badge>,
    },
    {
      sku: 'SKU-001239',
      description: 'DEF Tank 200L',
      available: '125',
      reserved: '25',
      location: 'Warehouse A - Rack 20',
      ageing: '30',
      status: <Badge variant="success">Good</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory Management"
        description="Monitor stock levels, locations, and inventory ageing across all warehouses"
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-200 mb-4">Filters & Search</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Warehouse</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All Warehouses</option>
              <option>Warehouse A</option>
              <option>Warehouse B</option>
              <option>Warehouse C</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Category</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All Categories</option>
              <option>Containers</option>
              <option>Components</option>
              <option>Accessories</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">Stock Status</label>
            <select className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-slate-300 focus:ring-2 focus:ring-brandRed focus:border-brandRed outline-none">
              <option>All</option>
              <option>Good</option>
              <option>Low Stock</option>
              <option>Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-slate-400 mb-2">SKU Search</label>
            <input
              type="text"
              placeholder="Search SKU..."
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

      {/* Inventory table */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Inventory Items</h3>
          <button className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors border border-gray-300 dark:border-slate-700 shadow-sm">
            Export to Excel
          </button>
        </div>
        <Table columns={columns} data={tableData} />
      </div>

      <p className="text-xs text-gray-500 dark:text-slate-500 text-center mt-4">
        ⚠ Placeholder data - Real inventory data will be integrated in Phase 2
      </p>
    </div>
  );
}
