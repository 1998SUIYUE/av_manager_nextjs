import { NextResponse } from 'next/server';

export function middleware(request) {
  console.log("Incoming request:", request.url);

  // 这里可以添加你的中间件逻辑

  const response = NextResponse.next();
  console.log("Outgoing response:", response);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};