import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Plugin system middleware
async function handlePluginRoutes(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Plugin API routes
  if (pathname.startsWith('/api/plugins/')) {
    const pluginId = pathname.split('/')[3]
    
    // Check if plugin is active
    // This would check against your plugin registry
    const isPluginActive = await checkPluginStatus(pluginId)
    
    if (!isPluginActive && !pathname.includes('/install') && !pathname.includes('/uninstall')) {
      return NextResponse.json(
        { error: 'Plugin not found or inactive' },
        { status: 404 }
      )
    }

    // Add plugin context headers
    const response = NextResponse.next()
    response.headers.set('X-Plugin-ID', pluginId)
    response.headers.set('X-Plugin-Context', 'api')
    return response
  }

  // Dynamic plugin pages
  if (pathname.startsWith('/p/')) {
    const segments = pathname.split('/')
    const pluginId = segments[2]
    
    if (!pluginId) {
      return NextResponse.redirect(new URL('/404', request.url))
    }

    // Check if plugin is active and has pages
    const hasPages = await checkPluginPages(pluginId)
    
    if (!hasPages) {
      return NextResponse.redirect(new URL('/404', request.url))
    }

    // Rewrite to plugin page handler
    return NextResponse.rewrite(
      new URL(`/api/plugins/${pluginId}/page${pathname.slice(2 + pluginId.length)}`, request.url)
    )
  }

  return NextResponse.next()
}

// Authentication middleware
async function handleAuthRoutes(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = await getToken({ req: request })

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/signin',
    '/signup',
    '/api/auth',
    '/api/system/health',
    '/api/system/info',
    '/oauth',
    '/reset-password',
  ]

  // Admin routes that require admin role
  const adminRoutes = ['/admin']

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname.startsWith(route) || pathname === route
  )

  // Check if route is admin
  const isAdminRoute = adminRoutes.some(route => 
    pathname.startsWith(route)
  )

  // Redirect to signin if not authenticated and trying to access protected route
  if (!token && !isPublicRoute) {
    const signInUrl = new URL('/signin', request.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Redirect to home if authenticated and trying to access auth pages
  if (token && (pathname.startsWith('/signin') || pathname.startsWith('/signup'))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Check admin access
  if (isAdminRoute && token) {
    const isAdmin = await checkAdminRole(token.sub as string)
    
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/403', request.url))
    }
  }

  return NextResponse.next()
}
async function handleRateLimit(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the client's IP address from headers
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
             request.headers.get('x-real-ip') || 
             'unknown';

  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    const rateLimitKey = `rate-limit:${ip}:${pathname}`;

    // Integrate with your rate limiting system (Redis, etc.)
    const isRateLimited = await checkRateLimit(rateLimitKey);

    if (isRateLimited) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }
  }

  return NextResponse.next();
}

// Security headers middleware
function addSecurityHeaders(response: NextResponse) {
  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )
  
  // CSP for plugin security
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self' https:; " +
    "frame-ancestors 'none'"
  )

  return response
}

// Main middleware function
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  try {
    // Handle rate limiting first
    const rateLimitResponse = await handleRateLimit(request)
    if (rateLimitResponse.status === 429) {
      return rateLimitResponse
    }

    // Handle plugin routes
    const pluginResponse = await handlePluginRoutes(request)
    if (pluginResponse.status !== 200 && pluginResponse.status !== 404) {
      return pluginResponse
    }

    // Handle authentication
    const authResponse = await handleAuthRoutes(request)
    if (authResponse.status !== 200) {
      return authResponse
    }

    // Add security headers to successful responses
    let response = NextResponse.next()
    
    // Skip security headers for API routes that need specific headers
    if (!pathname.startsWith('/api/plugins/') && !pathname.startsWith('/api/upload/')) {
      response = addSecurityHeaders(response)
    }

    // Add plugin context if this is a plugin-related request
    if (pathname.startsWith('/p/') || pathname.startsWith('/api/plugins/')) {
      response.headers.set('X-Plugin-Request', 'true')
    }

    return response
  } catch (error) {
    console.error('Middleware error:', error)
    
    // Fallback response
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper functions (these would be implemented with your actual database/cache)
async function checkPluginStatus(pluginId: string): Promise<boolean> {
  // TODO: Implement plugin status check against database
  // For now, return true for development
  return true
}

async function checkPluginPages(pluginId: string): Promise<boolean> {
  // TODO: Implement plugin pages check
  // For now, return true for development
  return true
}

async function checkAdminRole(userId: string): Promise<boolean> {
  // TODO: Implement admin role check against database
  // For now, check if user has admin role
  return true
}

async function checkRateLimit(key: string): Promise<boolean> {
  // TODO: Implement rate limiting with Redis or similar
  // For now, return false (no rate limiting)
  return false
}

// Configure which paths run the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|images|uploads|plugins/.*\\.(js|css|png|jpg|jpeg|gif|svg|ico|webp)).*)',
  ],
}