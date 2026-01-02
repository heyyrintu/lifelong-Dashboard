'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function NotFound() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Redirect to summary if authenticated, otherwise to login
    const timer = setTimeout(() => {
      if (!loading) {
        if (isAuthenticated) {
          router.replace('/summary');
        } else {
          router.replace('/login');
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isAuthenticated, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center px-4">
        <div className="mb-8">
          <h1 className="text-6xl font-bold text-white mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-slate-300 mb-2">Page Not Found</h2>
          <p className="text-slate-400 mb-6">The page you&apos;re looking for doesn&apos;t exist.</p>
        </div>
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          <p className="ml-2">Redirecting to summary...</p>
        </div>
      </div>
    </div>
  );
}
