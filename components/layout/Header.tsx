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
            <h1 className="flex items-baseline gap-1 font-bold text-gray-900 dark:text-slate-100">
              <span className="text-2xl">Drona 🤝🏼 Lifelong /</span>
              <span className="text-xl text-gray-600">{getPageName()}</span>
            </h1>
            <div className="absolute bottom-0 left-0 h-1 w-16 rounded-full bg-gradient-to-r from-amber-400 via-amber-300/80 to-transparent opacity-90"></div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
