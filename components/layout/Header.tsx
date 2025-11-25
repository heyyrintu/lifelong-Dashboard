'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();

  const getPageName = () => {
    const routes: Record<string, string> = {
      '/summary': 'Quick Summary',
      '/inbound': 'Inbound',
      '/inventory': 'Inventory',
      '/outbound': 'Outbound',
      '/upload': 'Upload',
      '/billing': 'Billing',
    };
    return routes[pathname] || 'Dashboard';
  };

  return (
    <header className="bg-white dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-gray-700 dark:text-slate-300" />
          </button>
          <div className="relative">
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Drona MIS V2</h1>
            <p className="text-xs text-gray-600 dark:text-slate-400">MIS V2</p>
            <div className="absolute bottom-0 left-0 w-12 h-0.5 bg-brandRed"></div>
          </div>
          <div className="hidden md:block">
            <span className="text-gray-400 dark:text-slate-500 mx-3">/</span>
            <span className="text-sm text-gray-700 dark:text-slate-300">{getPageName()}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-slate-200">Rintu Mondal</p>
              <p className="text-xs text-gray-600 dark:text-slate-500">rintu@drona.com</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gray-200 dark:bg-primary-500 rounded-full flex items-center justify-center text-gray-700 dark:text-white font-semibold">
                RM
              </div>
              <span className="px-2.5 py-1 bg-brandRed/10 dark:bg-brandRed/20 text-brandRed dark:text-brandRed text-xs font-medium rounded-md border border-brandRed/20 dark:border-brandRed/30">
                Admin
              </span>
            </div>
          </div>
          <div className="sm:hidden">
            <div className="w-10 h-10 bg-gray-200 dark:bg-primary-500 rounded-full flex items-center justify-center text-gray-700 dark:text-white font-semibold">
              RM
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
