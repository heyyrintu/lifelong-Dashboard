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
          <div className="absolute -top-60 -right-60 w-[700px] h-[700px] bg-gradient-to-br from-blue-400/50 via-indigo-500/40 to-purple-500/50 rounded-full blur-[100px] animate-pulse" />
          {/* Secondary gradient blob - bottom left */}
          <div className="absolute -bottom-60 -left-60 w-[700px] h-[700px] bg-gradient-to-tr from-violet-400/40 via-blue-500/30 to-cyan-400/40 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
          {/* Center accent - larger */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-blue-500/20 via-purple-400/15 to-pink-500/20 rounded-full blur-[120px]" />
          {/* Top left accent */}
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-gradient-to-br from-cyan-400/30 via-blue-400/20 to-indigo-500/30 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '2s' }} />
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
