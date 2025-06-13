import { getServerSession } from 'next-auth/next'
import { getToken, JWT } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { authConfig } from './config'
import { User } from '@/core/models/User'
import { Session } from '@/core/models/Session'
import { connectToDatabase } from '@/lib/database/connection'
import { logger } from '@/core/lib/utils/logger'
import { UserRole, AuthProvider } from '@/core/types/auth'

export interface ExtendedSession {
  user: {
    id: string
    email: string
    name: string
    username: string
    avatar: string
    role: UserRole
    provider: AuthProvider
    emailVerified: Date | null
    isActive: boolean
    permissions: string[]
  }
  expires: string
  sessionToken?: string
}

export interface SessionUser {
  id: string
  email: string
  name: string
  username: string
  avatar: string
  role: UserRole
  provider: AuthProvider
  emailVerified: Date | null
  isActive: boolean
  permissions: string[]
  lastActiveAt: Date
  createdAt: Date
}

/**
 * Get current session on server side
 */
export async function getCurrentSession(): Promise<ExtendedSession | null> {
  try {
    const session = await getServerSession(authConfig)
    return session as ExtendedSession | null
  } catch (error: any) {
    logger.error('Failed to get current session', { error: error.message })
    return null
  }
}

/**
 * Get session from request (middleware/API routes)
 */
export async function getSessionFromRequest(req: NextRequest): Promise<ExtendedSession | null> {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET
    })

    if (!token) {
      return null
    }

    return {
      user: {
        id: token.userId as string,
        email: token.email as string,
        name: token.name as string,
        username: token.username as string,
        avatar: token.avatar as string,
        role: token.role as UserRole,
        provider: token.provider as AuthProvider,
        emailVerified: token.emailVerified as Date | null,
        isActive: token.isActive as boolean,
        permissions: token.permissions as string[]
      },
      expires: new Date(token.exp! * 1000).toISOString(),
      sessionToken: token.sessionToken as string
    }
  } catch (error: any) {
    logger.error('Failed to get session from request', { error: error.message })
    return null
  }
}

/**
 * Get user data from session
 */
export async function getSessionUser(session: ExtendedSession | null): Promise<SessionUser | null> {
  if (!session?.user?.id) {
    return null
  }

  try {
    await connectToDatabase()
    
    const user = await User.findById(session.user.id)
    if (!user) {
      logger.warn('Session user not found in database', { userId: session.user.id })
      return null
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      username: user.username || '',
      avatar: user.avatar || '',
      role: user.role,
      provider: user.provider,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      permissions: user.getDefaultPermissions().map(p => 
        `${p.resource}:${p.actions.join(',')}:${p.scope}`
      ),
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt
    }
  } catch (error: any) {
    logger.error('Failed to get session user', { 
      error: error.message, 
      userId: session.user.id 
    })
    return null
  }
}

/**
 * Validate session and refresh user data
 */
export async function validateAndRefreshSession(
  session: ExtendedSession | null
): Promise<{
  valid: boolean
  user?: SessionUser
  error?: string
}> {
  if (!session) {
    return { valid: false, error: 'No session' }
  }

  try {
    await connectToDatabase()

    // Check if session is expired
    if (new Date() > new Date(session.expires)) {
      return { valid: false, error: 'Session expired' }
    }

    // Get fresh user data
    const user = await User.findById(session.user.id)
    if (!user) {
      return { valid: false, error: 'User not found' }
    }

    if (!user.isActive) {
      return { valid: false, error: 'User inactive' }
    }

    if (user.isBanned) {
      return { valid: false, error: 'User banned' }
    }

    // Update last active time
    user.lastActiveAt = new Date()
    await user.save()

    // Validate session token if present
    if (session.sessionToken) {
      const sessionRecord = await Session.findOne({ 
        token: session.sessionToken,
        isActive: true
      })

      if (!sessionRecord || sessionRecord.expiresAt < new Date()) {
        return { valid: false, error: 'Session token invalid' }
      }

      // Update session activity
      sessionRecord.lastActiveAt = new Date()
      await sessionRecord.save()
    }

    return {
      valid: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name || '',
        username: user.username || '',
        avatar: user.avatar || '',
        role: user.role,
        provider: user.provider,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        permissions: user.getDefaultPermissions().map(p => 
          `${p.resource}:${p.actions.join(',')}:${p.scope}`
        ),
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt
      }
    }
  } catch (error: any) {
    logger.error('Session validation failed', { 
      error: error.message,
      userId: session.user?.id 
    })
    return { valid: false, error: 'Validation error' }
  }
}

/**
 * Check if user has required role
 */
export function hasRequiredRole(user: SessionUser, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.USER]: 1,
    [UserRole.MODERATOR]: 2,
    [UserRole.ADMIN]: 3,
    [UserRole.SUPER_ADMIN]: 4
  }

  return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
}

/**
 * Check if user has required permission
 */
export function hasRequiredPermission(user: SessionUser, permission: string): boolean {
  if (!user.permissions || user.permissions.length === 0) {
    return false
  }

  const [resource, action, scope] = permission.split(':')
  
  return user.permissions.some(userPerm => {
    const [userResource, userActions, userScope] = userPerm.split(':')
    const userActionList = userActions.split(',')
    
    const resourceMatch = userResource === '*' || userResource === resource
    const actionMatch = userActionList.includes('*') || userActionList.includes(action)
    const scopeMatch = userScope === 'global' || userScope === scope
    
    return resourceMatch && actionMatch && scopeMatch
  })
}

/**
 * Get user permissions for specific resource
 */
export function getUserPermissionsForResource(
  user: SessionUser, 
  resource: string
): string[] {
  if (!user.permissions || user.permissions.length === 0) {
    return []
  }

  return user.permissions
    .filter(permission => {
      const [permResource] = permission.split(':')
      return permResource === resource || permResource === '*'
    })
    .map(permission => {
      const [, actions] = permission.split(':')
      return actions.split(',')
    })
    .flat()
    .filter((action, index, array) => array.indexOf(action) === index) // Remove duplicates
}

/**
 * Invalidate session
 */
export async function invalidateSession(sessionToken: string): Promise<boolean> {
  try {
    await connectToDatabase()
    
    const result = await Session.findOneAndUpdate(
      { token: sessionToken },
      { 
        isActive: false,
        invalidatedAt: new Date(),
        invalidationReason: 'manual_invalidation'
      },
      { new: true }
    )

    if (result) {
      logger.info('Session invalidated', { sessionToken })
      return true
    } else {
      logger.warn('Session not found for invalidation', { sessionToken })
      return false
    }
  } catch (error: any) {
    logger.error('Failed to invalidate session', { 
      error: error.message,
      sessionToken 
    })
    return false
  }
}

/**
 * Invalidate all user sessions
 */
export async function invalidateAllUserSessions(userId: string): Promise<number> {
  try {
    await connectToDatabase()
    
    const result = await Session.updateMany(
      { userId, isActive: true },
      { 
        isActive: false,
        invalidatedAt: new Date(),
        invalidationReason: 'user_logout_all'
      }
    )

    logger.info('All user sessions invalidated', { 
      userId, 
      count: result.modifiedCount 
    })
    
    return result.modifiedCount || 0
  } catch (error: any) {
    logger.error('Failed to invalidate all user sessions', { 
      error: error.message,
      userId 
    })
    return 0
  }
}

/**
 * Get active sessions for user
 */
export async function getUserActiveSessions(userId: string): Promise<Array<{
  id: string
  token: string
  lastActiveAt: Date
  createdAt: Date
  deviceInfo: any
  location?: any
  current?: boolean
}>> {
  try {
    await connectToDatabase()
    
    const sessions = await Session.find({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).sort({ lastActiveAt: -1 })

    return sessions.map(session => ({
      id: session._id.toString(),
      token: session.token,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
      deviceInfo: session.deviceInfo,
      location: session.location
    }))
  } catch (error: any) {
    logger.error('Failed to get user active sessions', { 
      error: error.message,
      userId 
    })
    return []
  }
}

/**
 * Session management utilities
 */
export const sessionUtils = {
  getCurrentSession,
  getSessionFromRequest,
  getSessionUser,
  validateAndRefreshSession,
  hasRequiredRole,
  hasRequiredPermission,
  getUserPermissionsForResource,
  invalidateSession,
  invalidateAllUserSessions,
  getUserActiveSessions
}

/**
 * Higher-order function for session-protected API routes
 */
export function withSession<T extends any[]>(
  handler: (session: ExtendedSession, ...args: T) => Promise<NextResponse>,
  options: {
    requireRole?: UserRole
    requirePermission?: string
    requireEmailVerified?: boolean
  } = {}
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      const session = await getSessionFromRequest(req)
      
      if (!session) {
        return new NextResponse('Authentication required', { status: 401 })
      }

      // Validate session
      const validation = await validateAndRefreshSession(session)
      if (!validation.valid) {
        return new NextResponse(validation.error || 'Session invalid', { status: 401 })
      }

      const user = validation.user!

      // Check role requirement
      if (options.requireRole && !hasRequiredRole(user, options.requireRole)) {
        return new NextResponse('Insufficient role', { status: 403 })
      }

      // Check permission requirement
      if (options.requirePermission && !hasRequiredPermission(user, options.requirePermission)) {
        return new NextResponse('Insufficient permissions', { status: 403 })
      }

      // Check email verification requirement
      if (options.requireEmailVerified && !user.emailVerified) {
        return new NextResponse('Email verification required', { status: 403 })
      }

      return handler(session, ...args)
    } catch (error: any) {
      logger.error('Session middleware error', { error: error.message })
      return new NextResponse('Internal server error', { status: 500 })
    }
  }
}

export default sessionUtils