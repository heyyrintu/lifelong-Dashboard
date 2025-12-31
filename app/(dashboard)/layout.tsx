'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DateFilterProvider } from '@/lib/date-filter-context';
import { Tiles } from '@/components/ui/tiles';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DateFilterProvider>
        <div className="relative flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-zinc-900">
          {/* Tiles Background Effect */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            <Tiles 
              rows={40} 
              cols={20}
              tileSize="md"
              className="w-full h-full"
            />
          </div>

          {/* Header at the very top - full width */}
          <div className="relative z-20">
            <Header onMenuClick={() => {}} />
          </div>

          {/* Content area with sidebar below header */}
          <div className="relative z-10 flex flex-1 overflow-hidden">
            <Sidebar isOpen={false} onClose={() => {}} />

            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
              <div className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
      </DateFilterProvider>
    </ProtectedRoute>
  );
}
