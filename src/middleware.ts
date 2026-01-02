import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    '/attendance/take',
    '/attendance/view',
    '/api/health',
  ];

  // Check if the pathname starts with any valid route
  const isValidRoute = validRoutes.some(route => 
    pathname === route || 
    pathname.startsWith(route + '/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  );

  // If route is not valid and not an asset, redirect to summary
  if (!isValidRoute && !pathname.includes('.') && !pathname.startsWith('/_next/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/summary';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
