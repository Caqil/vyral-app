// Core types export file
// Authentication types
export * from './auth'

// User types
export * from './user'

// Plugin types
export * from './plugin'

// Common utility types
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  meta?: {
    total?: number
    page?: number
    limit?: number
    hasMore?: boolean
  }
}

export interface PaginatedResponse<T = any> {
  items: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
  nextPage?: number
  prevPage?: number
}

export interface SearchParams {
  query?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, any>
}

export interface FileUpload {
  file: File | Buffer
  filename: string
  mimetype: string
  size: number
  encoding?: string
}

export interface UploadResponse {
  success: boolean
  url?: string
  filename?: string
  size?: number
  type?: string
  error?: string
}

export interface ValidationError {
  field: string
  message: string
  code: string
  value?: any
}

export interface FormState<T = any> {
  data: T
  errors: ValidationError[]
  isValid: boolean
  isSubmitting: boolean
  isDirty: boolean
  touched: Record<string, boolean>
}

// Database types
export interface BaseModel {
  id: string
  createdAt: Date
  updatedAt: Date
}

export interface SoftDeleteModel extends BaseModel {
  deletedAt?: Date
  isDeleted: boolean
}

export interface TimestampModel {
  createdAt: Date
  updatedAt: Date
}

export interface UserTimestampModel extends TimestampModel {
  createdBy?: string
  updatedBy?: string
}

// API types
export interface RequestContext {
  user?: import('./auth').User
  session?: import('./auth').Session
  plugin?: import('./plugin').Plugin
  permissions?: string[]
  metadata?: Record<string, any>
}

export interface APIError {
  code: string
  message: string
  details?: any
  statusCode: number
  timestamp: Date
}

export interface APIMetrics {
  requestId: string
  method: string
  path: string
  statusCode: number
  responseTime: number
  userAgent?: string
  ipAddress?: string
  userId?: string
  pluginId?: string
  timestamp: Date
}

// Event types
export interface SystemEvent {
  type: string
  category: EventCategory
  data: any
  userId?: string
  sessionId?: string
  pluginId?: string
  timestamp: Date
  metadata?: Record<string, any>
}

export interface EventListener {
  event: string
  handler: (event: SystemEvent) => Promise<void> | void
  priority?: number
  once?: boolean
}

export enum EventCategory {
  AUTH = 'auth',
  USER = 'user',
  CONTENT = 'content',
  PLUGIN = 'plugin',
  SYSTEM = 'system',
  SECURITY = 'security',
  API = 'api',
  DATABASE = 'database',
}

// Hook types
export interface HookContext {
  user?: import('./auth').User
  plugin?: import('./plugin').Plugin
  request?: any
  response?: any
  data?: any
  metadata?: Record<string, any>
}

export interface HookHandler {
  (context: HookContext): Promise<HookContext | null> | HookContext | null
}

export interface Hook {
  name: string
  handler: HookHandler
  priority?: number
  pluginId?: string
  enabled: boolean
}

// Configuration types
export interface AppConfig {
  app: {
    name: string
    version: string
    url: string
    environment: string
    debug: boolean
  }
  auth: {
    sessionTimeout: number
    passwordMinLength: number
    requireEmailVerification: boolean
    allowRegistration: boolean
    providers: string[]
  }
  database: {
    url: string
    name: string
    options?: Record<string, any>
  }
  upload: {
    maxFileSize: number
    allowedTypes: string[]
    storage: string
    path: string
  }
  plugins: {
    autoInstallSystem: boolean
    allowThirdParty: boolean
    maxPlugins: number
    securityScan: boolean
  }
  features: {
    maintenance: boolean
    analytics: boolean
    notifications: boolean
    realtime: boolean
  }
}

// Error types
export class AppError extends Error {
  public statusCode: number
  public code: string
  public isOperational: boolean
  public context?: Record<string, any>

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = isOperational
    this.context = context

    Object.setPrototypeOf(this, AppError.prototype)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class ValidationError extends AppError {
  public errors: ValidationError[]

  constructor(message: string, errors: ValidationError[] = []) {
    super(message, 400, 'VALIDATION_ERROR')
    this.errors = errors
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR')
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR')
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR')
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR')
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR')
  }
}

export class PluginError extends AppError {
  public pluginId: string

  constructor(message: string, pluginId: string, statusCode: number = 500) {
    super(message, statusCode, 'PLUGIN_ERROR')
    this.pluginId = pluginId
  }
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type Nullable<T> = T | null

export type Optional<T> = T | undefined

export type ID = string

export type Timestamp = Date

export type JSONValue = string | number | boolean | null | JSONObject | JSONArray

export interface JSONObject {
  [key: string]: JSONValue
}

export interface JSONArray extends Array<JSONValue> {}

// Environment types
export interface Environment {
  NODE_ENV: 'development' | 'production' | 'test'
  PORT: string
  DATABASE_URL: string
  NEXTAUTH_SECRET: string
  NEXTAUTH_URL: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  TWITTER_CLIENT_ID?: string
  TWITTER_CLIENT_SECRET?: string
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  CLOUDINARY_CLOUD_NAME?: string
  CLOUDINARY_API_KEY?: string
  CLOUDINARY_API_SECRET?: string
  REDIS_URL?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USER?: string
  SMTP_PASS?: string
}