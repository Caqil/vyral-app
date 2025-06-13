// Authentication types for the platform
export interface User {
  id: string
  email: string
  username?: string
  name?: string
  avatar?: string
  role: UserRole
  provider: AuthProvider
  providerId?: string
  emailVerified: Date | null;
  isActive: boolean
  isBanned: boolean
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: Date
  ipAddress?: string
  userAgent?: string
  lastActiveAt: Date
  createdAt: Date
}

export interface AuthCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  username?: string
  name?: string
}

export interface OAuthProfile {
  id: string
  email: string
  name?: string
  username?: string
  avatar?: string
  provider: AuthProvider
  accessToken?: string
  refreshToken?: string
  raw?: Record<string, any>
}

export interface AuthResponse {
  success: boolean
  user?: User
  session?: Session
  token?: string
  error?: string
  message?: string
}

export interface AuthContext {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (credentials: AuthCredentials) => Promise<AuthResponse>
  signUp: (data: RegisterData) => Promise<AuthResponse>
  signOut: () => Promise<void>
  updateUser: (data: Partial<User>) => Promise<User>
  refreshSession: () => Promise<Session | null>
}

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
  GITHUB = 'github',
  TWITTER = 'twitter',
  DISCORD = 'discord',
}

export enum AuthError {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_BANNED = 'ACCOUNT_BANNED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  OAUTH_ERROR = 'OAUTH_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
}

export interface PasswordResetRequest {
  email: string
  token: string
  expiresAt: Date
  used: boolean
  createdAt: Date
}

export interface EmailVerificationRequest {
  email: string
  token: string
  expiresAt: Date
  used: boolean
  createdAt: Date
}

// Permission system for plugins
export interface Permission {
  id: string
  name: string
  description: string
  resource: string
  action: string
  scope?: string[]
}

export interface RolePermission {
  role: UserRole
  permissions: Permission[]
}

// Auth hooks for plugins
export interface AuthHooks {
  beforeSignIn?: (credentials: AuthCredentials) => Promise<AuthCredentials | null>
  afterSignIn?: (user: User, session: Session) => Promise<void>
  beforeSignUp?: (data: RegisterData) => Promise<RegisterData | null>
  afterSignUp?: (user: User) => Promise<void>
  beforeSignOut?: (user: User) => Promise<void>
  afterSignOut?: (userId: string) => Promise<void>
  onSessionExpired?: (userId: string) => Promise<void>
  onAccountBanned?: (user: User, reason?: string) => Promise<void>
  onPasswordReset?: (user: User) => Promise<void>
  onEmailVerified?: (user: User) => Promise<void>
}

// Plugin authentication context
export interface PluginAuthContext {
  user: User | null
  hasPermission: (permission: string) => boolean
  hasRole: (role: UserRole) => boolean
  canAccessPlugin: (pluginId: string) => boolean
  canManagePlugin: (pluginId: string) => boolean
  getPluginPermissions: (pluginId: string) => Permission[]
}

// JWT token payload
export interface JWTPayload {
  sub: string // user id
  email: string
  role: UserRole
  iat: number
  exp: number
  iss: string
  aud: string
  sessionId?: string
  permissions?: string[]
}

// OAuth configuration
export interface OAuthConfig {
  clientId: string
  clientSecret: string
  scope: string[]
  redirectUri: string
  authUrl: string
  tokenUrl: string
  userInfoUrl: string
}

// Rate limiting
export interface RateLimitConfig {
  windowMs: number
  maxAttempts: number
  blockDuration: number
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

// Auth middleware options
export interface AuthMiddlewareOptions {
  requireAuth?: boolean
  requireRole?: UserRole
  requirePermissions?: string[]
  allowedProviders?: AuthProvider[]
  rateLimiting?: RateLimitConfig
}