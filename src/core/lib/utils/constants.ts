// Application constants for the social media platform
import { LogLevel } from '@/core/types/system'
import { UserRole } from '@/core/types/auth'

// API Configuration
export const API_CONSTANTS = {
  VERSION: 'v1',
  BASE_PATH: '/api',
  TIMEOUT: 30000,
  MAX_REQUEST_SIZE: '10mb',
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 1000,
    SKIP_SUCCESSFUL: false
  }
} as const

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
} as const

// Validation constants
export const VALIDATION = {
  EMAIL: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 254,
    REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
  },
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30,
    REGEX: /^[a-zA-Z0-9_]+$/
  },
  PLUGIN_ID: {
    REGEX: /^[a-zA-Z0-9-_]+$/
  },
  CONFIG_KEY: {
    REGEX: /^[a-zA-Z0-9_.]+$/
  },
  VERSION: {
    REGEX: /^\d+\.\d+\.\d+$/
  }
} as const

// File upload constants
export const UPLOAD = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'text/plain', 'application/json'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/ogg'],
  THUMBNAIL_SIZES: [
    { width: 150, height: 150, name: 'thumbnail' },
    { width: 300, height: 300, name: 'small' },
    { width: 600, height: 600, name: 'medium' },
    { width: 1200, height: 1200, name: 'large' }
  ]
} as const

// Cache configuration
export const CACHE = {
  TTL: {
    SHORT: 5 * 60, // 5 minutes
    MEDIUM: 30 * 60, // 30 minutes
    LONG: 24 * 60 * 60, // 24 hours
    VERY_LONG: 7 * 24 * 60 * 60 // 7 days
  },
  KEYS: {
    USER_PROFILE: 'user:profile:',
    SYSTEM_CONFIG: 'system:config:',
    PLUGIN_CONFIG: 'plugin:config:',
    SESSION: 'session:',
    RATE_LIMIT: 'rate_limit:'
  }
} as const

// Security constants
export const SECURITY = {
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  REFRESH_TOKEN_EXPIRES: 7 * 24 * 60 * 60 * 1000, // 7 days
  PASSWORD_RESET_EXPIRES: 60 * 60 * 1000, // 1 hour
  EMAIL_VERIFICATION_EXPIRES: 24 * 60 * 60 * 1000, // 24 hours
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutes
  JWT_ALGORITHM: 'HS256',
  BCRYPT_ROUNDS: 12,
  CRYPTO_ALGORITHM: 'aes-256-gcm'
} as const

// Plugin system constants
export const PLUGIN = {
  MAX_PLUGINS: 100,
  MAX_PLUGIN_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_EXTENSIONS: ['.zip', '.tar.gz'],
  REQUIRED_FILES: ['manifest.json', 'index.js'],
  BACKUP_RETENTION: 30, // days
  SCAN_TIMEOUT: 60000, // 1 minute
  EXECUTION_TIMEOUT: 30000 // 30 seconds
} as const

// Logging configuration
export const LOGGING = {
  DEFAULT_LEVEL: LogLevel.INFO,
  MAX_LOG_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_LOG_FILES: 5,
  RETENTION_DAYS: 30,
  STRUCTURED_FORMAT: true,
  EXCLUDE_PATHS: ['/health', '/metrics', '/favicon.ico']
} as const

// System limits
export const LIMITS = {
  MAX_USERS: 100000,
  MAX_SESSIONS_PER_USER: 5,
  MAX_HISTORY_ENTRIES: 100,
  MAX_NOTIFICATION_RETENTION: 30, // days
  MAX_BACKUP_RETENTION: 90, // days
  MAX_SEARCH_RESULTS: 1000
} as const

// Default role permissions
export const DEFAULT_PERMISSIONS = {
  [UserRole.USER]: [
    { resource: 'posts', actions: ['create', 'read', 'update:own', 'delete:own'], scope: 'own' },
    { resource: 'profile', actions: ['read', 'update:own'], scope: 'own' },
    { resource: 'comments', actions: ['create', 'read', 'update:own', 'delete:own'], scope: 'own' }
  ],
  [UserRole.MODERATOR]: [
    { resource: 'posts', actions: ['create', 'read', 'update', 'delete', 'moderate'], scope: 'global' },
    { resource: 'comments', actions: ['create', 'read', 'update', 'delete', 'moderate'], scope: 'global' },
    { resource: 'users', actions: ['read', 'moderate'], scope: 'global' }
  ],
  [UserRole.ADMIN]: [
    { resource: '*', actions: ['*'], scope: 'global' }
  ],
  [UserRole.SUPER_ADMIN]: [
    { resource: '*', actions: ['*'], scope: 'global' }
  ]
} as const

// Environment defaults
export const ENV_DEFAULTS = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'mongodb://localhost:27017/social-platform',
  JWT_SECRET: 'change-me-in-production',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'admin123',
  CONFIG_ENCRYPTION_KEY: 'default-key-change-in-production',
  PLUGIN_CONFIG_ENCRYPTION_KEY: 'default-plugin-key-change-in-production'
} as const

// Feature flags
export const FEATURES = {
  REGISTRATION_ENABLED: true,
  EMAIL_VERIFICATION_REQUIRED: false,
  PLUGINS_ENABLED: true,
  ANALYTICS_ENABLED: true,
  REAL_TIME_ENABLED: true,
  MAINTENANCE_MODE: false,
  DEBUG_MODE: false
} as const

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

// Error codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  PLUGIN_ERROR: 'PLUGIN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

// Success messages
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'User account created successfully',
  USER_UPDATED: 'User profile updated successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  PASSWORD_RESET: 'Password reset email sent',
  EMAIL_VERIFIED: 'Email verified successfully',
  PLUGIN_INSTALLED: 'Plugin installed successfully',
  PLUGIN_ACTIVATED: 'Plugin activated successfully',
  CONFIG_UPDATED: 'Configuration updated successfully'
} as const

// Error messages
export const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Invalid email or password',
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'User already exists with this email',
  EMAIL_NOT_VERIFIED: 'Please verify your email address',
  ACCOUNT_BANNED: 'Your account has been banned',
  ACCOUNT_INACTIVE: 'Your account is inactive',
  INVALID_TOKEN: 'Invalid or expired token',
  SESSION_EXPIRED: 'Your session has expired',
  PERMISSION_DENIED: 'You do not have permission to perform this action',
  PLUGIN_NOT_FOUND: 'Plugin not found',
  PLUGIN_INSTALL_FAILED: 'Plugin installation failed',
  CONFIG_NOT_FOUND: 'Configuration not found',
  VALIDATION_FAILED: 'Validation failed',
  RATE_LIMIT_EXCEEDED: 'Too many requests, please slow down'
} as const

// Time constants (in milliseconds)
export const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
  YEAR: 365 * 24 * 60 * 60 * 1000
} as const