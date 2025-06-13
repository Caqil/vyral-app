import { NextRequest, NextResponse } from 'next/server'
import { Plugin } from '@/core/types/plugin'
import { 
  PluginRoute, 
  HTTPMethod,
  PluginAPIContext 
} from '@/core/types/plugin'
import { logger } from '@/core/lib/utils/logger'
import { PluginManager } from '@/core/plugins/manager/PluginManager'
import { PluginHandler } from './Handler'
import { PluginMiddleware } from './Middleware'

/**
 * Route registration interface
 */
export interface RegisteredRoute {
  pluginId: string
  route: PluginRoute
  pattern: RegExp
  paramNames: string[]
  registeredAt: Date
}

/**
 * Route matching result
 */
export interface RouteMatch {
  route: RegisteredRoute
  params: Record<string, string>
  query: Record<string, any>
}

/**
 * Router configuration
 */
export interface PluginRouterConfig {
  basePath: string
  enableCache: boolean
  cacheSize: number
  enableMetrics: boolean
  strictMode: boolean
}

/**
 * Route metrics
 */
export interface RouteMetrics {
  requests: number
  successCount: number
  errorCount: number
  totalTime: number
  averageTime: number
  lastAccessed: Date
}

/**
 * Plugin Router - Handles routing for plugin API endpoints
 */
export class PluginRouter {
  private static instance: PluginRouter
  private pluginManager: PluginManager
  private pluginHandler: PluginHandler
  private pluginMiddleware: PluginMiddleware
  private routes: Map<string, RegisteredRoute[]> = new Map()
  private routeCache: Map<string, RouteMatch> = new Map()
  private routeMetrics: Map<string, RouteMetrics> = new Map()
  private config: PluginRouterConfig

  private constructor(config?: PluginRouterConfig) {
    this.pluginManager = PluginManager.getInstance()
    this.pluginHandler = PluginHandler.getInstance()
    this.pluginMiddleware = PluginMiddleware.getInstance()
    this.config = {
      basePath: '/api/plugins',
      enableCache: true,
      cacheSize: 1000,
      enableMetrics: true,
      strictMode: false,
      ...config
    }
  }

  public static getInstance(config?: PluginRouterConfig): PluginRouter {
    if (!PluginRouter.instance) {
      PluginRouter.instance = new PluginRouter(config)
    }
    return PluginRouter.instance
  }

  /**
   * Register plugin routes
   */
  public async registerPluginRoutes(plugin: Plugin): Promise<void> {
    try {
      if (!plugin.manifest.api?.routes || plugin.manifest.api.routes.length === 0) {
        logger.debug('No routes to register for plugin', { pluginId: plugin.id })
        return
      }

      const registeredRoutes: RegisteredRoute[] = []

      for (const route of plugin.manifest.api.routes) {
        const registeredRoute = this.createRegisteredRoute(plugin.id, route)
        registeredRoutes.push(registeredRoute)
        
        logger.debug('Route registered', {
          pluginId: plugin.id,
          method: route.method,
          path: route.path,
          handler: route.handler
        })
      }

      this.routes.set(plugin.id, registeredRoutes)
      this.clearRouteCache()

      logger.info('Plugin routes registered', {
        pluginId: plugin.id,
        routeCount: registeredRoutes.length
      })

    } catch (error) {
      logger.error('Failed to register plugin routes', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Unregister plugin routes
   */
  public unregisterPluginRoutes(pluginId: string): boolean {
    const removed = this.routes.delete(pluginId)
    
    if (removed) {
      this.clearRouteCache()
      this.clearPluginMetrics(pluginId)
      
      logger.info('Plugin routes unregistered', { pluginId })
    }
    
    return removed
  }

  /**
   * Handle incoming request
   */
  public async handleRequest(req: NextRequest): Promise<NextResponse> {
    const startTime = Date.now()
    const url = new URL(req.url)
    
    try {
      logger.debug('Handling plugin router request', {
        method: req.method,
        path: url.pathname
      })

      // Check if request is for plugin API
      if (!this.isPluginAPIRequest(url.pathname)) {
        return NextResponse.json(
          { error: 'Not a plugin API request' },
          { status: 404 }
        )
      }

      // Find matching route
      const match = await this.findMatchingRoute(req.method as HTTPMethod, url.pathname)
      
      if (!match) {
        return NextResponse.json(
          { error: 'Route not found' },
          { status: 404 }
        )
      }

      // Create context for handler
      const context = await this.createRequestContext(req, match)

      // Execute middleware chain and handler
      const response = await this.pluginMiddleware.executeMiddlewareChain(
        match.route.pluginId,
        match.route.route,
        context,
        async () => {
          return await this.pluginHandler.handleRequest(
            match.route.pluginId,
            match.route.route,
            req
          )
        }
      )

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateRouteMetrics(match.route, Date.now() - startTime, true)
      }

      return response

    } catch (error) {
      logger.error('Plugin router request failed', {
        method: req.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      )
    }
  }

  /**
   * Create registered route from plugin route
   */
  private createRegisteredRoute(pluginId: string, route: PluginRoute): RegisteredRoute {
    const { pattern, paramNames } = this.createRoutePattern(route.path)
    
    return {
      pluginId,
      route,
      pattern,
      paramNames,
      registeredAt: new Date()
    }
  }

  /**
   * Create route pattern and extract parameter names
   */
  private createRoutePattern(path: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = []
    
    // Convert route path to regex pattern
    let regexPattern = path
      .replace(/\//g, '\\/')
      .replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
        paramNames.push(paramName)
        return '([^/]+)'
      })
      .replace(/\*/g, '(.*)')

    // Add anchors for exact matching
    regexPattern = `^${this.config.basePath}${regexPattern}$`
    
    return {
      pattern: new RegExp(regexPattern),
      paramNames
    }
  }

  /**
   * Check if request is for plugin API
   */
  private isPluginAPIRequest(pathname: string): boolean {
    return pathname.startsWith(this.config.basePath)
  }

  /**
   * Find matching route for request
   */
  private async findMatchingRoute(
    method: HTTPMethod,
    pathname: string
  ): Promise<RouteMatch | null> {
    // Check cache first
    const cacheKey = `${method}:${pathname}`
    
    if (this.config.enableCache) {
      const cached = this.routeCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Search through all registered routes
    for (const [pluginId, pluginRoutes] of this.routes.entries()) {
      // Check if plugin is active
      if (!await this.pluginManager.isPluginActive(pluginId)) {
        continue
      }

      for (const registeredRoute of pluginRoutes) {
        // Check method match
        if (registeredRoute.route.method !== method) {
          continue
        }

        // Check path match
        const pathMatch = registeredRoute.pattern.exec(pathname)
        if (!pathMatch) {
          continue
        }

        // Extract parameters
        const params = this.extractRouteParams(registeredRoute.paramNames, pathMatch)
        
        // Create route match
        const match: RouteMatch = {
          route: registeredRoute,
          params,
          query: {}
        }

        // Cache the match
        if (this.config.enableCache && this.routeCache.size < this.config.cacheSize) {
          this.routeCache.set(cacheKey, match)
        }

        return match
      }
    }

    return null
  }

  /**
   * Extract route parameters from regex match
   */
  private extractRouteParams(paramNames: string[], match: RegExpExecArray): Record<string, string> {
    const params: Record<string, string> = {}
    
    for (let i = 0; i < paramNames.length; i++) {
      const paramName = paramNames[i]
      const paramValue = match[i + 1] // Skip full match at index 0
      
      if (paramName && paramValue) {
        params[paramName] = decodeURIComponent(paramValue)
      }
    }
    
    return params
  }

  /**
   * Create request context
   */
  private async createRequestContext(
    req: NextRequest,
    match: RouteMatch
  ): Promise<PluginAPIContext> {
    const url = new URL(req.url)
    
    // Get plugin configuration
    const config = await this.pluginManager.getPluginConfig(match.route.pluginId) || {}
    
    const context: PluginAPIContext = {
      request: {
        method: req.method as HTTPMethod,
        path: url.pathname,
        headers: Object.fromEntries(req.headers.entries()),
        query: Object.fromEntries(url.searchParams.entries()),
        params: match.params,
        body: await this.parseRequestBody(req),
        timestamp: new Date()
      },
      response: {
        status: 200,
        headers: {},
        timestamp: new Date()
      },
      plugin: {
        id: match.route.pluginId,
        config: config.settings || {}
      },
      logger: {
        debug: (message: string, meta?: any) => logger.debug(message, { pluginId: match.route.pluginId, ...meta }),
        info: (message: string, meta?: any) => logger.info(message, { pluginId: match.route.pluginId, ...meta }),
        warn: (message: string, meta?: any) => logger.warn(message, { pluginId: match.route.pluginId, ...meta }),
        error: (message: string, meta?: any) => logger.error(message, { pluginId: match.route.pluginId, ...meta })
      }
    }

    return context
  }

  /**
   * Parse request body
   */
  private async parseRequestBody(req: NextRequest): Promise<any> {
    try {
      const contentType = req.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        return await req.json()
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData()
        return Object.fromEntries(formData.entries())
      } else if (contentType.includes('multipart/form-data')) {
        return await req.formData()
      } else if (contentType.includes('text/')) {
        return await req.text()
      } else {
        return null
      }
    } catch (error) {
      logger.warn('Failed to parse request body', { error })
      return null
    }
  }

  /**
   * Update route metrics
   */
  private updateRouteMetrics(
    route: RegisteredRoute,
    duration: number,
    success: boolean
  ): void {
    const key = `${route.pluginId}:${route.route.method}:${route.route.path}`
    
    let metrics = this.routeMetrics.get(key)
    if (!metrics) {
      metrics = {
        requests: 0,
        successCount: 0,
        errorCount: 0,
        totalTime: 0,
        averageTime: 0,
        lastAccessed: new Date()
      }
    }

    metrics.requests++
    metrics.totalTime += duration
    metrics.averageTime = metrics.totalTime / metrics.requests
    metrics.lastAccessed = new Date()

    if (success) {
      metrics.successCount++
    } else {
      metrics.errorCount++
    }

    this.routeMetrics.set(key, metrics)
  }

  /**
   * Clear route cache
   */
  private clearRouteCache(): void {
    this.routeCache.clear()
    logger.debug('Route cache cleared')
  }

  /**
   * Clear metrics for specific plugin
   */
  private clearPluginMetrics(pluginId: string): void {
    const keysToRemove: string[] = []
    
    for (const key of this.routeMetrics.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => {
      this.routeMetrics.delete(key)
    })

    logger.debug('Plugin metrics cleared', { pluginId, removed: keysToRemove.length })
  }

  /**
   * Get all registered routes
   */
  public getRegisteredRoutes(): RegisteredRoute[] {
    const allRoutes: RegisteredRoute[] = []
    
    for (const routes of this.routes.values()) {
      allRoutes.push(...routes)
    }
    
    return allRoutes
  }

  /**
   * Get routes for specific plugin
   */
  public getPluginRoutes(pluginId: string): RegisteredRoute[] {
    return this.routes.get(pluginId) || []
  }

  /**
   * Check if route exists
   */
  public hasRoute(pluginId: string, method: HTTPMethod, path: string): boolean {
    const pluginRoutes = this.routes.get(pluginId)
    if (!pluginRoutes) return false

    return pluginRoutes.some(route => 
      route.route.method === method && route.route.path === path
    )
  }

  /**
   * Get router statistics
   */
  public getRouterStats(): Record<string, any> {
    let totalRoutes = 0
    let activePlugins = 0

    for (const routes of this.routes.values()) {
      totalRoutes += routes.length
      activePlugins++
    }

    return {
      totalRoutes,
      activePlugins,
      cacheSize: this.routeCache.size,
      cacheHitRate: this.calculateCacheHitRate(),
      metrics: Object.fromEntries(this.routeMetrics.entries()),
      config: this.config
    }
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    // This is a simplified calculation
    // In a real implementation, you'd track hits and misses
    const cacheSize = this.routeCache.size
    const totalRoutes = Array.from(this.routes.values()).reduce((sum, routes) => sum + routes.length, 0)
    
    if (totalRoutes === 0) return 0
    return (cacheSize / totalRoutes) * 100
  }

  /**
   * Validate route configuration
   */
  public validateRoute(route: PluginRoute): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate method
    if (!Object.values(HTTPMethod).includes(route.method)) {
      errors.push(`Invalid HTTP method: ${route.method}`)
    }

    // Validate path
    if (!route.path || !route.path.startsWith('/')) {
      errors.push('Route path must start with /')
    }

    // Validate handler
    if (!route.handler || route.handler.trim() === '') {
      errors.push('Route handler is required')
    }

    // Validate permissions format
    if (route.permissions) {
      for (const permission of route.permissions) {
        if (typeof permission !== 'string' || permission.trim() === '') {
          errors.push(`Invalid permission format: ${permission}`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Clear all caches and metrics
   */
  public clearAll(): void {
    this.routeCache.clear()
    this.routeMetrics.clear()
    logger.debug('All router data cleared')
  }

  /**
   * Update router configuration
   */
  public updateConfig(newConfig: Partial<PluginRouterConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Clear cache if cache size changed
    if (newConfig.cacheSize && this.routeCache.size > newConfig.cacheSize) {
      this.clearRouteCache()
    }
    
    logger.debug('Router configuration updated', { config: this.config })
  }
}