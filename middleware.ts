import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Define valid routes
  const validRoutes = [
    '/',
    '/login',
    '/summary',
    '/inbound',
    '/outbound',
    '/inventory',
    '/billing',
    '/upload',
    '/health',
    '/dashboard',
    '/attendance',
  ];

  // Check if the pathname is valid or starts with a valid route
  const isValidRoute = validRoutes.some(route => 
    pathname === route || pathname.startsWith(route + '/')
  );

  // If route is not valid, redirect to summary
  if (!isValidRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/summary';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
