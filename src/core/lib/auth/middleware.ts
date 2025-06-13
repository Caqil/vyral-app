import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { UserRole, AuthProvider } from '@/core/types/auth'
import { logger } from '@/core/lib/utils/logger'
import { connectToDatabase } from '@/lib/database/connection'
import { User } from '@/core/models/User'
import { Session } from '@/core/models/Session'

export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  allowedRoles?: UserRole[]
  requirePermissions?: string[]
  allowedProviders?: AuthProvider[]
  rateLimiting?: {
    windowMs: number
    maxAttempts: number
  }
  redirectTo?: string
  allowUnauthenticated?: boolean
}

export interface RouteConfig {
  matcher: string | RegExp
  options: AuthMiddlewareOptions
}

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Default route configurations
export const DEFAULT_ROUTE_CONFIGS: RouteConfig[] = [
  // Public routes - no authentication required
  {
    matcher: /^\/(auth|api\/auth|$)/,
    options: {
      requireAuth: false,
      allowUnauthenticated: true
    }
  },
  
  // Admin routes - require admin role
  {
    matcher: /^\/admin/,
    options: {
      requireAuth: true,
      allowedRoles: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
      redirectTo: '/auth/signin?callbackUrl=/admin'
    }
  },
  
  // Plugin management - require moderator or higher
  {
    matcher: /^\/plugins\/(manage|install|configure)/,
    options: {
      requireAuth: true,
      allowedRoles: [UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN],
      requirePermissions: ['plugin.manage'],
      redirectTo: '/auth/signin?callbackUrl=/plugins'
    }
  },
  
  // User dashboard - require authentication
  {
    matcher: /^\/dashboard/,
    options: {
      requireAuth: true,
      redirectTo: '/auth/signin?callbackUrl=/dashboard'
    }
  },
  
  // API routes - require authentication with rate limiting
  {
    matcher: /^\/api(?!\/auth)/,
    options: {
      requireAuth: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxAttempts: 100
      }
    }
  },
  
  // Settings - require authentication
  {
    matcher: /^\/settings/,
    options: {
      requireAuth: true,
      redirectTo: '/auth/signin?callbackUrl=/settings'
    }
  }
]

/**
 * Enhanced authentication middleware with comprehensive security features
 */
export async function authMiddleware(
  req: NextRequest,
  routeConfigs: RouteConfig[] = DEFAULT_ROUTE_CONFIGS
): Promise<NextResponse> {
  const startTime = Date.now()
  const { pathname, origin } = req.nextUrl
  const userAgent = req.headers.get('user-agent') || 'Unknown'
  const ipAddress = getClientIP(req)
  
  try {
    // Find matching route configuration
    const routeConfig = findMatchingRoute(pathname, routeConfigs)
    
    if (!routeConfig || routeConfig.options.allowUnauthenticated) {
      return NextResponse.next()
    }

    const { options } = routeConfig

    // Rate limiting check
    if (options.rateLimiting) {
      const rateLimitResult = await checkRateLimit(ipAddress, options.rateLimiting)
      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          ipAddress,
          pathname,
          userAgent,
          resetTime: rateLimitResult.resetTime
        })
        
        return new NextResponse('Rate limit exceeded', {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': options.rateLimiting.maxAttempts.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString()
          }
        })
      }
    }

    // Get JWT token
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET
    })

    // Check if authentication is required
    if (options.requireAuth && !token) {
      logger.info('Unauthenticated access attempt', {
        pathname,
        ipAddress,
        userAgent
      })
      
      if (pathname.startsWith('/api/')) {
        return new NextResponse('Unauthorized', { status: 401 })
      }
      
      const redirectUrl = options.redirectTo || `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(new URL(redirectUrl, origin))
    }

    // If no authentication required, allow access
    if (!options.requireAuth) {
      return NextResponse.next()
    }

    // Validate token and user status
    if (token) {
      const validation = await validateUserAccess(token, options)
      
      if (!validation.allowed) {
        logger.warn('Access denied', {
          userId: token.userId,
          pathname,
          reason: validation.reason,
          userAgent,
          ipAddress
        })
        
        if (pathname.startsWith('/api/')) {
          return new NextResponse(validation.reason, { 
            status: validation.statusCode || 403 
          })
        }
        
        const redirectUrl = validation.redirectTo || '/auth/error?error=AccessDenied'
        return NextResponse.redirect(new URL(redirectUrl, origin))
      }

      // Log successful access
      logger.debug('Authorized access', {
        userId: token.userId,
        pathname,
        role: token.role,
        duration: Date.now() - startTime
      })

      // Add user context headers for API routes
      if (pathname.startsWith('/api/')) {
        const response = NextResponse.next()
        response.headers.set('X-User-ID', token.userId as string)
        response.headers.set('X-User-Role', token.role as string)
        response.headers.set('X-User-Provider', token.provider as string)
        return response
      }
    }

    return NextResponse.next()

  } catch (error: any) {
    logger.error('Auth middleware error', {
      error: error.message,
      pathname,
      ipAddress,
      userAgent,
      duration: Date.now() - startTime
    })
    
    // In case of error, allow access to avoid breaking the app
    // but log for investigation
    return NextResponse.next()
  }
}

/**
 * Find matching route configuration
 */
function findMatchingRoute(pathname: string, routeConfigs: RouteConfig[]): RouteConfig | null {
  for (const config of routeConfigs) {
    if (typeof config.matcher === 'string') {
      if (pathname.startsWith(config.matcher)) {
        return config
      }
    } else if (config.matcher instanceof RegExp) {
      if (config.matcher.test(pathname)) {
        return config
      }
    }
  }
  return null
}

/**
 * Validate user access based on options
 */
async function validateUserAccess(
  token: any,
  options: AuthMiddlewareOptions
): Promise<{
  allowed: boolean
  reason?: string
  statusCode?: number
  redirectTo?: string
}> {
  try {
    await connectToDatabase()

    // Check if user exists and is active
    const user = await User.findById(token.userId).select('+password')
    if (!user) {
      return {
        allowed: false,
        reason: 'User not found',
        statusCode: 401,
        redirectTo: '/auth/signin'
      }
    }

    if (!user.isActive) {
      return {
        allowed: false,
        reason: 'Account inactive',
        statusCode: 403,
        redirectTo: '/auth/error?error=AccountInactive'
      }
    }

    if (user.isBanned) {
      return {
        allowed: false,
        reason: 'Account banned',
        statusCode: 403,
        redirectTo: '/auth/error?error=AccountBanned'
      }
    }

    // Check account lockout
    if (user.security.lockoutUntil && user.security.lockoutUntil > new Date()) {
      return {
        allowed: false,
        reason: 'Account locked',
        statusCode: 423,
        redirectTo: '/auth/error?error=AccountLocked'
      }
    }

    // Check allowed roles
    if (options.allowedRoles && options.allowedRoles.length > 0) {
      if (!options.allowedRoles.includes(user.role)) {
        return {
          allowed: false,
          reason: 'Insufficient role',
          statusCode: 403
        }
      }
    }

    // Check allowed providers
    if (options.allowedProviders && options.allowedProviders.length > 0) {
      if (!options.allowedProviders.includes(user.provider)) {
        return {
          allowed: false,
          reason: 'Provider not allowed',
          statusCode: 403
        }
      }
    }

    // Check permissions
    if (options.requirePermissions && options.requirePermissions.length > 0) {
      const userPermissions = user.getDefaultPermissions()
      const hasPermission = options.requirePermissions.every(requiredPerm => {
        return userPermissions.some(userPerm => {
          const [resource, actions, scope] = requiredPerm.split(':')
          return (
            (userPerm.resource === resource || userPerm.resource === '*') &&
            (userPerm.actions.includes('*') || userPerm.actions.some(action => actions.includes(action))) &&
            (userPerm.scope === 'global' || userPerm.scope === scope)
          )
        })
      })

      if (!hasPermission) {
        return {
          allowed: false,
          reason: 'Insufficient permissions',
          statusCode: 403
        }
      }
    }

    // Validate session if exists
    if (token.sessionToken) {
      const session = await Session.findOne({ token: token.sessionToken })
      if (!session || !session.isActive || session.expiresAt < new Date()) {
        return {
          allowed: false,
          reason: 'Invalid session',
          statusCode: 401,
          redirectTo: '/auth/signin'
        }
      }

      // Update session activity
      session.lastActiveAt = new Date()
      await session.save()
    }

    return { allowed: true }

  } catch (error: any) {
    logger.error('User validation error', {
      error: error.message,
      userId: token.userId
    })
    
    return {
      allowed: false,
      reason: 'Validation error',
      statusCode: 500
    }
  }
}

/**
 * Rate limiting implementation
 */
async function checkRateLimit(
  identifier: string,
  config: { windowMs: number; maxAttempts: number }
): Promise<{ allowed: boolean; resetTime: number }> {
  const now = Date.now()
  const windowStart = now - config.windowMs
  
  // Clean up old entries
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
  
  const existing = rateLimitStore.get(identifier)
  
  if (!existing || existing.resetTime < now) {
    // First request in window or window expired
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs
    })
    return { allowed: true, resetTime: now + config.windowMs }
  }
  
  if (existing.count >= config.maxAttempts) {
    // Rate limit exceeded
    return { allowed: false, resetTime: existing.resetTime }
  }
  
  // Increment counter
  existing.count++
  rateLimitStore.set(identifier, existing)
  
  return { allowed: true, resetTime: existing.resetTime }
}

/**
 * Get client IP address
 */
function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIP = req.headers.get('x-real-ip')
  const cfConnectingIP = req.headers.get('cf-connecting-ip')
  
  if (cfConnectingIP) return cfConnectingIP
  if (realIP) return realIP
  if (forwarded) return forwarded.split(',')[0].trim()
  
  return req.ip || '127.0.0.1'
}

/**
 * Role hierarchy checker
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.USER]: 1,
    [UserRole.MODERATOR]: 2,
    [UserRole.ADMIN]: 3,
    [UserRole.SUPER_ADMIN]: 4
  }
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

/**
 * Permission checker
 */
export function hasPermission(
  userPermissions: Array<{ resource: string; actions: string[]; scope: string }>,
  requiredPermission: string
): boolean {
  const [resource, action, scope] = requiredPermission.split(':')
  
  return userPermissions.some(permission => {
    const resourceMatch = permission.resource === '*' || permission.resource === resource
    const actionMatch = permission.actions.includes('*') || permission.actions.includes(action)
    const scopeMatch = permission.scope === 'global' || permission.scope === scope
    
    return resourceMatch && actionMatch && scopeMatch
  })
}

/**
 * Create custom middleware with specific route configurations
 */
export function createAuthMiddleware(routeConfigs: RouteConfig[]) {
  return (req: NextRequest) => authMiddleware(req, routeConfigs)
}

/**
 * Higher-order function for API route protection
 */
export function withAuth(
  handler: (req: NextRequest, context: { user: any }) => Promise<Response>,
  options: AuthMiddlewareOptions = { requireAuth: true }
) {
  return async (req: NextRequest): Promise<Response> => {
    // Check authentication
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET
    })

    if (options.requireAuth && !token) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    if (token) {
      const validation = await validateUserAccess(token, options)
      if (!validation.allowed) {
        return new NextResponse(validation.reason || 'Forbidden', {
          status: validation.statusCode || 403
        })
      }
    }

    // Call original handler with user context
    return handler(req, { user: token })
  }
}

/**
 * Plugin-specific authentication middleware
 */
export function withPluginAuth(pluginId: string, requiredPermission?: string) {
  return withAuth(async (req: NextRequest, context: { user: any }): Promise<Response> => {
    const { user } = context
    
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    try {
      await connectToDatabase()
      const dbUser = await User.findById(user.userId)
      
      if (!dbUser) {
        return new NextResponse('User not found', { status: 404 })
      }

      // Check plugin access permission
      const canAccessPlugin = dbUser.getDefaultPermissions().some(p => 
        p.resource === 'plugin' && p.actions.includes('access')
      )

      if (!canAccessPlugin) {
        return new NextResponse('Plugin access denied', { status: 403 })
      }

      // Check specific plugin permission if provided
      if (requiredPermission) {
        const hasPluginPermission = hasPermission(
          dbUser.getDefaultPermissions(),
          `plugin.${pluginId}:${requiredPermission}:global`
        )

        if (!hasPluginPermission) {
          return new NextResponse('Insufficient plugin permissions', { status: 403 })
        }
      }

      return new NextResponse('Plugin access granted', { status: 200 })
    } catch (error: any) {
      logger.error('Plugin auth middleware error', { 
        error: error.message,
        pluginId,
        userId: context.user?.userId 
      })
      return new NextResponse('Internal server error', { status: 500 })
    }
  })
}