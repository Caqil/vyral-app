import { UserRole } from '@/core/types/auth'

// Plugin API Configuration Types
export interface PluginAPIConfig {
  routes: PluginRoute[]
  middleware?: string[]
  rateLimit?: PluginRateLimit
  cors?: PluginCORSConfig
  authentication?: PluginAuthConfig
}

// Plugin Route Configuration
export interface PluginRoute {
  method: HTTPMethod
  path: string
  handler: string
  middleware?: string[]
  permissions?: string[]
  roles?: UserRole[]
  rateLimit?: PluginRateLimit
  description?: string
}

// Plugin Rate Limiting
export interface PluginRateLimit {
  windowMs: number
  maxRequests: number
  message?: string
  skipSuccessfulRequests?: boolean
}

// Plugin CORS Configuration
export interface PluginCORSConfig {
  origin: string | string[] | boolean
  methods: HTTPMethod[]
  allowedHeaders?: string[]
  credentials?: boolean
}

// Plugin Authentication Configuration
export interface PluginAuthConfig {
  required: boolean
  strategies: string[]
  permissions?: string[]
  roles?: UserRole[]
}

// Plugin API Request/Response Types
export interface PluginAPIRequest {
  method: HTTPMethod
  path: string
  headers: Record<string, string>
  query: Record<string, any>
  params: Record<string, string>
  body?: any
  user?: PluginAPIUser
  timestamp: Date
}

export interface PluginAPIResponse {
  status: number
  headers?: Record<string, string>
  body?: any
  timestamp: Date
}

export interface PluginAPIUser {
  id: string
  email: string
  role: UserRole
  permissions: string[]
}

// Plugin API Context
export interface PluginAPIContext {
  request: PluginAPIRequest
  response: PluginAPIResponse
  user?: PluginAPIUser
  plugin: {
    id: string
    config: Record<string, any>
  }
  logger: {
    debug: (message: string, meta?: any) => void
    info: (message: string, meta?: any) => void
    warn: (message: string, meta?: any) => void
    error: (message: string, meta?: any) => void
  }
}

// Enums
export enum HTTPMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH'
}