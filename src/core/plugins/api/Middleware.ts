import { NextRequest, NextResponse } from 'next/server'
import { Plugin } from '@/core/types/plugin'
import { 
  PluginAPIContext, 
  PluginRoute,
  PluginRateLimit 
} from '@/core/types/plugin'
import { PluginError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginManager } from '@/core/plugins/manager/PluginManager'

/**
 * Plugin middleware function signature
 */
export type PluginMiddlewareFunction = (
  context: PluginAPIContext,
  next: () => Promise<NextResponse>
) => Promise<NextResponse>

/**
 * Middleware registration interface
 */
export interface PluginMiddlewareConfig {
  name: string
  priority: number
  enabled: boolean
  plugin?: Plugin
  conditions?: MiddlewareCondition[]
}

/**
 * Middleware execution condition
 */
export interface MiddlewareCondition {
  type: 'path' | 'method' | 'header' | 'query' | 'custom'
  value: string | RegExp | ((context: PluginAPIContext) => boolean)
  operator?: 'equals' | 'contains' | 'matches' | 'custom'
}

/**
 * Rate limiting state
 */
interface RateLimitState {
  requests: number
  windowStart: number
  blocked: boolean
}

/**
 * Plugin Middleware Manager
 */
export class PluginMiddleware {
  private static instance: PluginMiddleware
  private pluginManager: PluginManager
  private middlewares: Map<string, PluginMiddlewareFunction> = new Map()
  private middlewareConfigs: Map<string, PluginMiddlewareConfig> = new Map()
  private rateLimitStates: Map<string, RateLimitState> = new Map()
  private requestMetrics: Map<string, any> = new Map()

  private constructor() {
    this.pluginManager = PluginManager.getInstance()
    this.initializeBuiltInMiddlewares()
  }

  public static getInstance(): PluginMiddleware {
    if (!PluginMiddleware.instance) {
      PluginMiddleware.instance = new PluginMiddleware()
    }
    return PluginMiddleware.instance
  }

  /**
   * Initialize built-in middlewares
   */
  private initializeBuiltInMiddlewares(): void {
    // Authentication middleware
    this.registerMiddleware('auth', this.authMiddleware.bind(this), {
      name: 'auth',
      priority: 1000,
      enabled: true
    })

    // Rate limiting middleware
    this.registerMiddleware('rateLimit', this.rateLimitMiddleware.bind(this), {
      name: 'rateLimit',
      priority: 900,
      enabled: true
    })

    // CORS middleware
    this.registerMiddleware('cors', this.corsMiddleware.bind(this), {
      name: 'cors',
      priority: 800,
      enabled: true
    })

    // Validation middleware
    this.registerMiddleware('validation', this.validationMiddleware.bind(this), {
      name: 'validation',
      priority: 700,
      enabled: true
    })

    // Logging middleware
    this.registerMiddleware('logging', this.loggingMiddleware.bind(this), {
      name: 'logging',
      priority: 100,
      enabled: true
    })

    // Error handling middleware
    this.registerMiddleware('errorHandler', this.errorHandlerMiddleware.bind(this), {
      name: 'errorHandler',
      priority: 50,
      enabled: true
    })
  }

  /**
   * Register middleware
   */
  public registerMiddleware(
    name: string,
    middleware: PluginMiddlewareFunction,
    config: PluginMiddlewareConfig
  ): void {
    this.middlewares.set(name, middleware)
    this.middlewareConfigs.set(name, config)
    
    logger.debug('Plugin middleware registered', { 
      name, 
      priority: config.priority,
      plugin: config.plugin?.id 
    })
  }

  /**
   * Unregister middleware
   */
  public unregisterMiddleware(name: string): boolean {
    const middlewareRemoved = this.middlewares.delete(name)
    const configRemoved = this.middlewareConfigs.delete(name)
    
    if (middlewareRemoved && configRemoved) {
      logger.debug('Plugin middleware unregistered', { name })
      return true
    }
    
    return false
  }

  /**
   * Execute middleware chain for plugin request
   */
  public async executeMiddlewareChain(
    pluginId: string,
    route: PluginRoute,
    context: PluginAPIContext,
    finalHandler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    try {
      // Get applicable middlewares
      const applicableMiddlewares = await this.getApplicableMiddlewares(
        pluginId, 
        route, 
        context
      )

      // Sort by priority (higher priority first)
      applicableMiddlewares.sort((a, b) => {
        const configA = this.middlewareConfigs.get(a.name)
        const configB = this.middlewareConfigs.get(b.name)
        return (configB?.priority || 0) - (configA?.priority || 0)
      })

      // Execute middleware chain
      return await this.executeChain(applicableMiddlewares, context, finalHandler)

    } catch (error) {
      logger.error('Middleware chain execution failed', {
        pluginId,
        route: route.path,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get applicable middlewares for request
   */
  private async getApplicableMiddlewares(
    pluginId: string,
    route: PluginRoute,
    context: PluginAPIContext
  ): Promise<{ name: string; middleware: PluginMiddlewareFunction }[]> {
    const applicable: { name: string; middleware: PluginMiddlewareFunction }[] = []

    // Get plugin
    const plugin = await this.pluginManager.getPlugin(pluginId)
    if (!plugin) {
      return applicable
    }

    // Global middlewares
    for (const [name, middleware] of this.middlewares.entries()) {
      const config = this.middlewareConfigs.get(name)
      
      if (!config?.enabled) continue
      
      // Check if middleware applies to this request
      if (await this.shouldApplyMiddleware(config, context, route)) {
        applicable.push({ name, middleware })
      }
    }

    // Plugin-specific middlewares
    if (plugin.manifest.api?.middleware) {
      for (const middlewareName of plugin.manifest.api.middleware) {
        const middleware = this.middlewares.get(middlewareName)
        if (middleware) {
          applicable.push({ name: middlewareName, middleware })
        }
      }
    }

    // Route-specific middlewares
    if (route.middleware) {
      for (const middlewareName of route.middleware) {
        const middleware = this.middlewares.get(middlewareName)
        if (middleware) {
          applicable.push({ name: middlewareName, middleware })
        }
      }
    }

    return applicable
  }

  /**
   * Check if middleware should apply to request
   */
  private async shouldApplyMiddleware(
    config: PluginMiddlewareConfig,
    context: PluginAPIContext,
    route: PluginRoute
  ): Promise<boolean> {
    if (!config.conditions || config.conditions.length === 0) {
      return true
    }

    for (const condition of config.conditions) {
      if (!await this.evaluateCondition(condition, context, route)) {
        return false
      }
    }

    return true
  }

  /**
   * Evaluate middleware condition
   */
  private async evaluateCondition(
    condition: MiddlewareCondition,
    context: PluginAPIContext,
    route: PluginRoute
  ): Promise<boolean> {
    switch (condition.type) {
      case 'path':
        return this.evaluatePathCondition(condition, context.request.path)
      
      case 'method':
        return this.evaluateMethodCondition(condition, context.request.method)
      
      case 'header':
        return this.evaluateHeaderCondition(condition, context.request.headers)
      
      case 'query':
        return this.evaluateQueryCondition(condition, context.request.query)
      
      case 'custom':
        if (typeof condition.value === 'function') {
          return condition.value(context)
        }
        return true
      
      default:
        return true
    }
  }

  /**
   * Evaluate path condition
   */
  private evaluatePathCondition(condition: MiddlewareCondition, path: string): boolean {
    if (typeof condition.value === 'string') {
      switch (condition.operator) {
        case 'equals':
          return path === condition.value
        case 'contains':
          return path.includes(condition.value)
        default:
          return path === condition.value
      }
    } else if (condition.value instanceof RegExp) {
      return condition.value.test(path)
    }
    return false
  }

  /**
   * Evaluate method condition
   */
  private evaluateMethodCondition(condition: MiddlewareCondition, method: string): boolean {
    if (typeof condition.value === 'string') {
      return method.toUpperCase() === condition.value.toUpperCase()
    }
    return false
  }

  /**
   * Evaluate header condition
   */
  private evaluateHeaderCondition(
    condition: MiddlewareCondition, 
    headers: Record<string, string>
  ): boolean {
    if (typeof condition.value === 'string') {
      const [headerName, expectedValue] = condition.value.split(':')
      const headerValue = headers[headerName?.toLowerCase()]
      
      if (!expectedValue) {
        return !!headerValue // Just check if header exists
      }
      
      return headerValue === expectedValue
    }
    return false
  }

  /**
   * Evaluate query condition
   */
  private evaluateQueryCondition(
    condition: MiddlewareCondition, 
    query: Record<string, any>
  ): boolean {
    if (typeof condition.value === 'string') {
      const [queryName, expectedValue] = condition.value.split('=')
      const queryValue = query[queryName]
      
      if (!expectedValue) {
        return queryValue !== undefined
      }
      
      return queryValue === expectedValue
    }
    return false
  }

  /**
   * Execute middleware chain recursively
   */
  private async executeChain(
    middlewares: { name: string; middleware: PluginMiddlewareFunction }[],
    context: PluginAPIContext,
    finalHandler: () => Promise<NextResponse>,
    index: number = 0
  ): Promise<NextResponse> {
    if (index >= middlewares.length) {
      return await finalHandler()
    }

    const { name, middleware } = middlewares[index]
    const startTime = Date.now()

    try {
      const next = async () => {
        return await this.executeChain(middlewares, context, finalHandler, index + 1)
      }

      const result = await middleware(context, next)
      
      // Log middleware execution
      const duration = Date.now() - startTime
      this.logMiddlewareExecution(name, duration, true)
      
      return result

    } catch (error) {
      const duration = Date.now() - startTime
      this.logMiddlewareExecution(name, duration, false)
      
      logger.error('Middleware execution failed', {
        middleware: name,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }

  /**
   * Authentication middleware
   */
  private async authMiddleware(
    context: PluginAPIContext,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Authentication logic would be implemented here
    // For now, just pass through
    context.logger.debug('Auth middleware executed')
    return await next()
  }

  /**
   * Rate limiting middleware
   */
  private async rateLimitMiddleware(
    context: PluginAPIContext,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const plugin = await this.pluginManager.getPlugin(context.plugin.id)
    const rateLimit = plugin?.manifest.api?.rateLimit

    if (!rateLimit) {
      return await next()
    }

    const key = `${context.plugin.id}:${context.request.headers['x-forwarded-for'] || 'unknown'}`
    const now = Date.now()
    
    let state = this.rateLimitStates.get(key)
    
    if (!state || (now - state.windowStart) > rateLimit.windowMs) {
      state = {
        requests: 0,
        windowStart: now,
        blocked: false
      }
    }

    state.requests++
    this.rateLimitStates.set(key, state)

    if (state.requests > rateLimit.maxRequests) {
      state.blocked = true
      return NextResponse.json(
        { 
          error: rateLimit.message || 'Rate limit exceeded',
          retryAfter: rateLimit.windowMs 
        },
        { status: 429 }
      )
    }

    return await next()
  }

  /**
   * CORS middleware
   */
  private async corsMiddleware(
    context: PluginAPIContext,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const plugin = await this.pluginManager.getPlugin(context.plugin.id)
    const corsConfig = plugin?.manifest.api?.cors

    if (!corsConfig) {
      return await next()
    }

    const response = await next()

    // Add CORS headers
    if (corsConfig.origin) {
      if (typeof corsConfig.origin === 'boolean' && corsConfig.origin) {
        response.headers.set('Access-Control-Allow-Origin', '*')
      } else if (typeof corsConfig.origin === 'string') {
        response.headers.set('Access-Control-Allow-Origin', corsConfig.origin)
      } else if (Array.isArray(corsConfig.origin)) {
        const origin = context.request.headers.origin
        if (origin && corsConfig.origin.includes(origin)) {
          response.headers.set('Access-Control-Allow-Origin', origin)
        }
      }
    }

    if (corsConfig.methods) {
      response.headers.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '))
    }

    if (corsConfig.allowedHeaders) {
      response.headers.set('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '))
    }

    if (corsConfig.credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }

    return response
  }

  /**
   * Validation middleware
   */
  private async validationMiddleware(
    context: PluginAPIContext,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Request validation logic would be implemented here
    context.logger.debug('Validation middleware executed')
    return await next()
  }

  /**
   * Logging middleware
   */
  private async loggingMiddleware(
    context: PluginAPIContext,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const startTime = Date.now()
    
    context.logger.info('Plugin request started', {
      method: context.request.method,
      path: context.request.path,
      userAgent: context.request.headers['user-agent']
    })

    const response = await next()
    
    const duration = Date.now() - startTime
    context.logger.info('Plugin request completed', {
      method: context.request.method,
      path: context.request.path,
      status: response.status,
      duration
    })

    return response
  }

  /**
   * Error handler middleware
   */
  private async errorHandlerMiddleware(
    context: PluginAPIContext,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    try {
      return await next()
    } catch (error) {
      context.logger.error('Plugin request error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      })

      const statusCode = error instanceof PluginError ? 400 : 500
      const message = error instanceof Error ? error.message : 'Internal server error'

      return NextResponse.json(
        {
          success: false,
          error: message,
          timestamp: new Date().toISOString()
        },
        { status: statusCode }
      )
    }
  }

  /**
   * Log middleware execution metrics
   */
  private logMiddlewareExecution(name: string, duration: number, success: boolean): void {
    const key = `middleware:${name}`
    const existing = this.requestMetrics.get(key) || {
      executions: 0,
      totalDuration: 0,
      errors: 0,
      avgDuration: 0
    }

    existing.executions++
    existing.totalDuration += duration
    existing.avgDuration = existing.totalDuration / existing.executions

    if (!success) {
      existing.errors++
    }

    this.requestMetrics.set(key, existing)
  }

  /**
   * Get middleware statistics
   */
  public getMiddlewareStats(): Record<string, any> {
    const stats = {
      totalMiddlewares: this.middlewares.size,
      enabledMiddlewares: 0,
      disabledMiddlewares: 0,
      rateLimitStates: this.rateLimitStates.size,
      metrics: Object.fromEntries(this.requestMetrics.entries())
    }

    for (const config of this.middlewareConfigs.values()) {
      if (config.enabled) {
        stats.enabledMiddlewares++
      } else {
        stats.disabledMiddlewares++
      }
    }

    return stats
  }

  /**
   * Clear rate limit states
   */
  public clearRateLimitStates(): void {
    this.rateLimitStates.clear()
    logger.debug('Rate limit states cleared')
  }

  /**
   * Clear metrics
   */
  public clearMetrics(): void {
    this.requestMetrics.clear()
    logger.debug('Middleware metrics cleared')
  }
}