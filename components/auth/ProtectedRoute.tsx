'use client';

/**
 * ProtectedRoute - Auth verification disabled
 * All routes are now public. This component simply passes through children.
 * Login functionality is still available for optional session management.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // Auth verification removed - all routes are public
  return <>{children}</>;
}

