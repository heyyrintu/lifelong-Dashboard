'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowDownToLine,
  Package,
  ArrowUpFromLine,
  Upload,
  FileText,
  X,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  {
    name: 'Quick Summary',
    path: '/summary',
    icon: LayoutDashboard,
  },
  {
    name: 'Inbound',
    path: '/inbound',
    icon: ArrowDownToLine,
  },
  {
    name: 'Inventory',
    path: '/inventory',
    icon: Package,
  },
  {
    name: 'Outbound',
    path: '/outbound',
    icon: ArrowUpFromLine,
  },
  {
    name: 'Upload',
    path: '/upload',
    icon: Upload,
  },
  {
    name: 'Billing',
    path: '/billing',
    icon: FileText,
  },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-30 h-screen
          w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo section */}
          <div className="p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Drona MIS</h2>
              <p className="text-xs text-gray-600 dark:text-slate-500">Logistics Dashboard</p>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const isActive = pathname === item.path;
                const Icon = item.icon;

                return (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      onClick={() => {
                        // Close mobile menu on navigation
                        if (window.innerWidth < 1024) {
                          onClose();
                        }
                      }}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg
                        transition-all duration-200 group
                        ${
                          isActive
                            ? 'bg-red-50 dark:bg-brandRed/10 text-brandRed dark:text-brandRed border-l-4 border-brandRed pl-3 font-semibold'
                            : 'text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 border-l-4 border-transparent'
                        }
                      `}
                    >
                      <Icon
                        className={`w-5 h-5 ${isActive ? 'text-brandRed dark:text-brandRed' : 'text-gray-500 dark:text-slate-500 group-hover:text-gray-700 dark:group-hover:text-slate-300'}`}
                      />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-slate-700">
            <div className="text-xs text-gray-500 dark:text-slate-500 space-y-1">
              <p>Version 2.0.0</p>
              <p>Phase 1: UI Shell</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
