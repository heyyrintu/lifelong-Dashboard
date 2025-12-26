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
        <div className="relative flex h-screen overflow-hidden bg-gray-50 dark:bg-zinc-900">
        {/* Tiles Background Effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <Tiles 
            rows={40} 
            cols={20}
            tileSize="md"
            className="w-full h-full"
          />
        </div>

        {/* Main Content - positioned above tiles background */}
        <div className="relative z-10 flex h-screen w-full">
          <Sidebar isOpen={false} onClose={() => {}} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <Header onMenuClick={() => {}} />

            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-transparent">
              <div className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
      </div>
      </DateFilterProvider>
    </ProtectedRoute>
  );
}
