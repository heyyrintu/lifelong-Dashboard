import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export default function StatCard({ title, value, subtitle, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-6 hover:border-gray-300 dark:hover:border-slate-600 transition-colors shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 bg-brandRed rounded-full"></div>
            <p className="text-sm font-medium text-gray-600 dark:text-slate-400">{title}</p>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 mt-2">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className="flex items-center mt-2">
              <span
                className={`text-xs font-medium ${
                  trend.isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                }`}
              >
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-gray-500 dark:text-slate-500 ml-1">vs last period</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="bg-brandRed/10 dark:bg-brandRed/20 p-3 rounded-lg">
            <Icon className="w-6 h-6 text-brandRed" />
          </div>
        )}
      </div>
    </div>
  );
}
