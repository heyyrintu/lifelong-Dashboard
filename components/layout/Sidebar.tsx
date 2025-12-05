'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  ArrowDownToLine,
  Package,
  ArrowUpFromLine,
  Upload,
  FileText,
  X,
  UserCheck,
  ClipboardList,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  name: string;
  path: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
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
    adminOnly: true,
  },
  {
    name: 'Billing',
    path: '/billing',
    icon: FileText,
    adminOnly: true,
  },
  {
    name: 'Take Attendance',
    path: '/attendance/take',
    icon: UserCheck,
    adminOnly: true,
  },
  {
    name: 'View Attendance',
    path: '/attendance/view',
    icon: ClipboardList,
    adminOnly: true,
  },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  // Memoize filtered menu items to prevent recalculation on every render
  const visibleMenuItems = useMemo(() => 
    menuItems.filter(item => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  // Memoize click handler for mobile menu close
  const handleLinkClick = useCallback(() => {
    if (window.innerWidth < 1024) {
      onClose();
    }
  }, [onClose]);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-30 h-screen
          w-64
          bg-gradient-to-br 
          from-white via-rose-50/70 to-amber-50/50
          dark:from-slate-900/70 dark:via-rose-900/35 dark:to-amber-900/25
          border-r border-gray-200 dark:border-slate-700
          shadow-sm dark:shadow-none
          transform transition-all duration-300 ease-in-out
          sidebar-noise
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full relative z-10">
          {/* Logo section */}
          <div className="relative p-6 border-b border-gray-200/50 dark:border-white/10 flex items-center justify-center">
            <img
              src="https://cdn.dribbble.com/userupload/45188200/file/49510167ef68236a40dd16a5212e595e.png?resize=400x400&vertical=center"
              alt="Drona MIS logo"
              className="h-20 w-20 rounded-2xl object-cover"
            />
            <button
              onClick={onClose}
              className="lg:hidden absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {visibleMenuItems.map((item) => {
                const isActive = pathname === item.path;
                const Icon = item.icon;

                return (
                  <li key={item.path}>
                    <Link
                      href={item.path}
                      onClick={handleLinkClick}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg
                        transition-all duration-200 group
                        ${isActive
                          ? 'bg-brandRed/10 dark:bg-white/10 text-brandRed dark:text-white border-l-4 border-brandRed dark:border-indigo-400 pl-3 font-semibold'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-rose-100/70 dark:hover:bg-rose-500/20 hover:text-gray-900 dark:hover:text-white border-l-4 border-transparent'
                        }
                      `}
                    >
                      <Icon
                        className={`w-5 h-5 ${isActive
                          ? 'text-brandRed dark:text-indigo-400'
                          : 'text-gray-400 dark:text-gray-400 group-hover:text-[#FEA418] dark:group-hover:text-[#FEA418]'
                          }`}
                      />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer (intentionally left empty) */}
        </div>
      </aside>
    </>
  );
}
