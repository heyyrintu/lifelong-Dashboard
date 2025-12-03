'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <ProtectedRoute>
      <div className="relative flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-900">
        {/* Aurora Background Effect - larger visible gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Primary gradient blob - top right */}
          <div className="absolute -top-60 -right-60 w-[700px] h-[700px] bg-gradient-to-br from-brandRed/30 via-orange-500/30 to-brandYellow/30 rounded-full blur-[100px] animate-pulse" />
          {/* Secondary gradient blob - bottom left */}
          <div className="absolute -bottom-60 -left-60 w-[700px] h-[700px] bg-gradient-to-tr from-brandYellow/30 via-red-500/30 to-orange-400/30 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
          {/* Center accent - larger */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-red-500/10 via-orange-400/10 to-yellow-500/10 rounded-full blur-[120px]" />
          {/* Top left accent */}
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-gradient-to-br from-orange-400/20 via-brandRed/20 to-yellow-500/20 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        {/* Main Content - positioned above aurora background */}
        <div className="relative z-10 flex h-screen w-full">
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

          <div className="flex-1 flex flex-col overflow-hidden">
            <Header onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />

            <main className="flex-1 overflow-y-auto bg-transparent">
              <div className="container mx-auto px-6 py-8 max-w-7xl">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
