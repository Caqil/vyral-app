'use client'

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { 
  User, 
  Session, 
  AuthCredentials, 
  RegisterData, 
  AuthResponse, 
  AuthContext as IAuthContext,
  UserRole,
} from '@/core/types/auth'
import { logger } from '@/core/lib/utils/logger'
import { toast } from 'sonner'

// Auth Context
const AuthContext = createContext<IAuthContext | null>(null)

// Auth state interface
interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
}

// Auth provider props
interface AuthProviderProps {
  children: ReactNode
  initialUser?: User | null
  initialSession?: Session | null
}

// Local storage keys
const AUTH_STORAGE_KEYS = {
  USER: 'auth_user',
  SESSION: 'auth_session',
  TOKEN: 'auth_token',
  REMEMBER_ME: 'auth_remember_me'
} as const

// Auth API endpoints
const AUTH_ENDPOINTS = {
  SIGN_IN: '/api/auth/signin',
  SIGN_UP: '/api/auth/signup', 
  SIGN_OUT: '/api/auth/signout',
  REFRESH: '/api/auth/refresh',
  UPDATE_USER: '/api/auth/user',
  VERIFY_EMAIL: '/api/auth/verify-email',
  RESET_PASSWORD: '/api/auth/reset-password',
  CHECK_PERMISSIONS: '/api/auth/permissions'
} as const

// Auth Provider Component
export function AuthProvider({ children, initialUser = null, initialSession = null }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: initialUser,
    session: initialSession,
    isLoading: true,
    isAuthenticated: !!initialUser,
    error: null
  })


  // Initialize auth state from storage
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check for stored session
        const storedToken = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)
        const storedUser = localStorage.getItem(AUTH_STORAGE_KEYS.USER)
        const storedSession = localStorage.getItem(AUTH_STORAGE_KEYS.SESSION)

        if (storedToken && storedUser && storedSession) {
          const user = JSON.parse(storedUser) as User
          const session = JSON.parse(storedSession) as Session

          // Verify session is still valid
          if (new Date(session.expiresAt) > new Date()) {
            setState(prev => ({
              ...prev,
              user,
              session,
              isAuthenticated: true,
              isLoading: false
            }))
            
            // Auto-refresh session if needed
            await refreshSession()
            return
          } else {
            // Session expired, clear storage
            clearAuthStorage()
          }
        }

        setState(prev => ({ ...prev, isLoading: false }))
      } catch (error) {
        logger.error('Auth initialization failed', { error })
        setState(prev => ({ ...prev, isLoading: false, error: 'Failed to initialize authentication' }))
      }
    }

    initAuth()
  }, [])

  // Sign in function
  const signIn = useCallback(async (credentials: AuthCredentials): Promise<AuthResponse> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(AUTH_ENDPOINTS.SIGN_IN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      })

      const result: AuthResponse = await response.json()

      if (result.success && result.user && result.session && result.token) {
        // Store auth data
        localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(result.user))
        localStorage.setItem(AUTH_STORAGE_KEYS.SESSION, JSON.stringify(result.session))
        localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, result.token)

        setState(prev => ({
          ...prev,
          user: result.user!,
          session: result.session!,
          isAuthenticated: true,
          isLoading: false,
          error: null
        }))

        toast(`Welcome back, ${result.user.name || result.user.email}!`)

        logger.info('User signed in', { userId: result.user.id, email: result.user.email })
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: result.error || 'Sign in failed' }))
        
        toast(result.error || 'Please check your credentials and try again.')
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred'
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      
      toast(errorMessage)

      logger.error('Sign in error', { error, credentials: { email: credentials.email } })
      
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [toast])

  // Sign up function
  const signUp = useCallback(async (data: RegisterData): Promise<AuthResponse> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const response = await fetch(AUTH_ENDPOINTS.SIGN_UP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result: AuthResponse = await response.json()

      if (result.success && result.user && result.session && result.token) {
        // Store auth data
        localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(result.user))
        localStorage.setItem(AUTH_STORAGE_KEYS.SESSION, JSON.stringify(result.session))
        localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, result.token)

        setState(prev => ({
          ...prev,
          user: result.user!,
          session: result.session!,
          isAuthenticated: true,
          isLoading: false,
          error: null
        }))

        toast(`Welcome, ${result.user.name || result.user.email}!`)

        logger.info('User signed up', { userId: result.user.id, email: result.user.email })
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: result.error || 'Sign up failed' }))
        
        toast(result.error || 'Please check your information and try again.')
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred'
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      
      toast(errorMessage)

      logger.error('Sign up error', { error, data: { email: data.email } })
      
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [toast])

  // Sign out function
  const signOut = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)
      
      if (token) {
        await fetch(AUTH_ENDPOINTS.SIGN_OUT, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        })
      }

      // Clear storage and state
      clearAuthStorage()
      setState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null
      })

      toast('You have been signed out of your account.')

      logger.info('User signed out')
    } catch (error) {
      logger.error('Sign out error', { error })
      
      // Still clear local state even if API call fails
      clearAuthStorage()
      setState({
        user: null,
        session: null,
        isLoading: false,
        isAuthenticated: false,
        error: null
      })
    }
  }, [toast])

  // Update user function
  const updateUser = useCallback(async (userData: Partial<User>): Promise<User> => {
    if (!state.user) {
      throw new Error('No authenticated user')
    }

    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)
      const response = await fetch(AUTH_ENDPOINTS.UPDATE_USER, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userData)
      })

      if (!response.ok) {
        throw new Error('Failed to update user')
      }

      const updatedUser: User = await response.json()

      // Update stored user data
      localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(updatedUser))
      
      setState(prev => ({
        ...prev,
        user: updatedUser,
        isLoading: false
      }))

      toast('Your profile has been updated successfully.')

      logger.info('User updated', { userId: updatedUser.id })

      return updatedUser
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to update user'
      toast(errorMessage)

      logger.error('User update error', { error })
      throw error
    }
  }, [state.user, toast])

  // Refresh session function
  const refreshSession = useCallback(async (): Promise<Session | null> => {
    try {
      const token = localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)
      if (!token) return null

      const response = await fetch(AUTH_ENDPOINTS.REFRESH, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        // Token invalid, sign out
        await signOut()
        return null
      }

      const result = await response.json()
      
      if (result.session && result.token) {
        // Update stored session and token
        localStorage.setItem(AUTH_STORAGE_KEYS.SESSION, JSON.stringify(result.session))
        localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, result.token)
        
        setState(prev => ({
          ...prev,
          session: result.session
        }))

        return result.session
      }

      return null
    } catch (error) {
      logger.error('Session refresh error', { error })
      return null
    }
  }, [signOut])

  // Helper function to clear auth storage
  const clearAuthStorage = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEYS.USER)
    localStorage.removeItem(AUTH_STORAGE_KEYS.SESSION)
    localStorage.removeItem(AUTH_STORAGE_KEYS.TOKEN)
    localStorage.removeItem(AUTH_STORAGE_KEYS.REMEMBER_ME)
  }, [])

  // Context value
  const contextValue: IAuthContext = {
    user: state.user,
    session: state.session,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    signIn,
    signUp,
    signOut,
    updateUser,
    refreshSession
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// Main useAuth hook
export function useAuth(): IAuthContext {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

// Additional auth utility hooks

// Hook for checking user permissions
export function usePermissions() {
  const { user, session } = useAuth()
  
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user || !session) return false
    
    // Check if user has specific permission
    // This would typically check against user.permissions or make an API call
    return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN
  }, [user, session])

  const hasRole = useCallback((role: UserRole): boolean => {
    if (!user) return false
    return user.role === role
  }, [user])

  const hasAnyRole = useCallback((roles: UserRole[]): boolean => {
    if (!user) return false
    return roles.includes(user.role)
  }, [user])

  const isAdmin = useCallback((): boolean => {
    return hasAnyRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])
  }, [hasAnyRole])

  const isModerator = useCallback((): boolean => {
    return hasAnyRole([UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN])
  }, [hasAnyRole])

  return {
    hasPermission,
    hasRole,
    hasAnyRole,
    isAdmin,
    isModerator
  }
}

// Hook for auth status checks
export function useAuthStatus() {
  const { user, session, isLoading, isAuthenticated } = useAuth()
  
  const isEmailVerified = useCallback((): boolean => {
    return user?.emailVerified !== null
  }, [user])

  const isAccountActive = useCallback((): boolean => {
    return user?.isActive === true && user?.isBanned === false
  }, [user])

  const needsEmailVerification = useCallback((): boolean => {
    return !isEmailVerified() && isAuthenticated
  }, [isEmailVerified, isAuthenticated])

  const sessionExpiresIn = useCallback((): number => {
    if (!session) return 0
    return Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
  }, [session])

  const sessionExpiresInMinutes = useCallback((): number => {
    return Math.floor(sessionExpiresIn() / (1000 * 60))
  }, [sessionExpiresIn])

  return {
    isEmailVerified,
    isAccountActive,
    needsEmailVerification,
    sessionExpiresIn,
    sessionExpiresInMinutes
  }
}

// Hook for protected routes
export function useRequireAuth(redirectTo?: string) {
  const { isAuthenticated, isLoading } = useAuth()
  const [shouldRedirect, setShouldRedirect] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setShouldRedirect(true)
      
      if (redirectTo && typeof window !== 'undefined') {
        window.location.href = redirectTo
      }
    }
  }, [isAuthenticated, isLoading, redirectTo])

  return {
    isAuthenticated,
    isLoading,
    shouldRedirect
  }
}

export default useAuth