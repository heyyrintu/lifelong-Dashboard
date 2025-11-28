'use client';

import { Menu, LogOut, User as UserIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuth } from '@/lib/auth-context';
import { useState } from 'react';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-10 relative isolate overflow-hidden
      bg-white/5 dark:bg-slate-800/50
      bg-gradient-to-br from-black/5 to-black/[0.02] dark:from-white/[0.02] dark:to-transparent
      backdrop-blur-xl backdrop-saturate-[180%]
      border-b border-black/10 dark:border-slate-700/50
      shadow-[0_8px_16px_rgb(0_0_0_/_0.15)] dark:shadow-[0_8px_16px_rgb(0_0_0_/_0.3)]
      will-change-transform translate-z-0
      transition-all duration-300">
      <div className="flex items-center justify-between px-6 py-4
        bg-gradient-to-br from-black/[0.05] to-transparent dark:from-slate-700/30 dark:to-slate-800/10
        backdrop-blur-md backdrop-saturate-150
        relative">
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

        <div className="flex items-center gap-3">
          {/* User Info Card */}
          {user && (
            <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 
              backdrop-blur-md backdrop-saturate-150
              border border-gray-200/50 dark:border-slate-700/50
              rounded-xl shadow-sm
              hover:shadow-md transition-all duration-200
              bg-gradient-to-br from-white/90 to-blue-50/30 
              dark:from-slate-800/90 dark:to-blue-900/20">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-md ring-2 ring-white/50 dark:ring-slate-700/50">
                <UserIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate">
                  {user.name || 'User'}
                </span>
                <span className="text-xs text-gray-600 dark:text-slate-400 truncate">
                  {user.email}
                </span>
              </div>
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-2 px-4 py-2.5 
              text-sm font-medium text-red-600 dark:text-red-400 
              bg-white/80 dark:bg-slate-800/80
              backdrop-blur-md backdrop-saturate-150
              border border-red-200/50 dark:border-red-900/30
              hover:bg-red-50/80 dark:hover:bg-red-900/20 
              rounded-xl shadow-sm hover:shadow-md
              transition-all duration-200 
              disabled:opacity-50 disabled:cursor-not-allowed
              disabled:hover:bg-white/80 dark:disabled:hover:bg-slate-800/80"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>

          {/* Theme Toggle */}
          <div className="bg-white/80 dark:bg-slate-800/80
            backdrop-blur-md backdrop-saturate-150
            border border-gray-200/50 dark:border-slate-700/50
            rounded-xl shadow-sm hover:shadow-md
            transition-all duration-200">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
