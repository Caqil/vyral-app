import { NextRequest, NextResponse } from 'next/server'
import { Plugin } from '@/core/types/plugin'
import { 
  PluginAPIContext, 
  PluginAPIRequest, 
  PluginAPIResponse,
  PluginRoute,
  HTTPMethod 
} from '@/core/plugins/types/api'
import { PluginError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginManager } from '@/core/plugins/manager/PluginManager'

/**
 * Plugin Handler - Handles plugin API request execution
 */
export class PluginHandler {
  private static instance: PluginHandler
  private pluginManager: PluginManager
  private handlers: Map<string, Function> = new Map()
  private contextCache: Map<string, PluginAPIContext> = new Map()

  private constructor() {
    this.pluginManager = PluginManager.getInstance()
    this.initializeHandlers()
  }

  public static getInstance(): PluginHandler {
    if (!PluginHandler.instance) {
      PluginHandler.instance = new PluginHandler()
    }
    return PluginHandler.instance
  }

  /**
   * Initialize built-in handlers
   */
  private initializeHandlers(): void {
    // Register default handlers
    this.registerHandler('default', this.defaultHandler.bind(this))
    this.registerHandler('proxy', this.proxyHandler.bind(this))
    this.registerHandler('redirect', this.redirectHandler.bind(this))
    this.registerHandler('static', this.staticHandler.bind(this))
  }

  /**
   * Register a plugin handler
   */
  public registerHandler(name: string, handler: Function): void {
    this.handlers.set(name, handler)
    logger.debug('Plugin handler registered', { name })
  }

  /**
   * Unregister a plugin handler
   */
  public unregisterHandler(name: string): boolean {
    const result = this.handlers.delete(name)
    if (result) {
      logger.debug('Plugin handler unregistered', { name })
    }
    return result
  }

  /**
   * Handle plugin API request
   */
  public async handleRequest(
    pluginId: string,
    route: PluginRoute,
    req: NextRequest
  ): Promise<NextResponse> {
    const startTime = Date.now()
    
    try {
      logger.debug('Handling plugin request', {
        pluginId,
        method: route.method,
        path: route.path,
        handler: route.handler
      })

      // Get plugin
      const plugin = await this.pluginManager.getPlugin(pluginId)
      if (!plugin) {
        throw new PluginError(`Plugin ${pluginId} not found`, pluginId)
      }

      // Check if plugin is active
      if (!await this.pluginManager.isPluginActive(pluginId)) {
        throw new PluginError(`Plugin ${pluginId} is not active`, pluginId)
      }

      // Create API context
      const context = await this.createAPIContext(plugin, route, req)

      // Validate permissions
      await this.validateRoutePermissions(context, route)

      // Execute handler
      const response = await this.executeHandler(plugin, route, context)

      // Log metrics
      const duration = Date.now() - startTime
      this.logRequestMetrics(pluginId, route, duration, response.status)

      return response

    } catch (error) {
      logger.error('Plugin request handling failed', {
        pluginId,
        route: route.path,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return this.createErrorResponse(error)
    }
  }

  /**
   * Create API context for plugin execution
   */
  private async createAPIContext(
    plugin: Plugin,
    route: PluginRoute,
    req: NextRequest
  ): Promise<PluginAPIContext> {
    const url = new URL(req.url)
    
    // Parse request data
    const apiRequest: PluginAPIRequest = {
      method: req.method as HTTPMethod,
      path: url.pathname,
      headers: Object.fromEntries(req.headers.entries()),
      query: Object.fromEntries(url.searchParams.entries()),
      params: this.extractRouteParams(route.path, url.pathname),
      body: await this.parseRequestBody(req),
      timestamp: new Date()
    }

    // Get plugin configuration
    const config = await this.pluginManager.getPluginConfig(plugin.id) || {}

    // Create context
    const context: PluginAPIContext = {
      request: apiRequest,
      response: {
        status: 200,
        headers: {},
        timestamp: new Date()
      },
      plugin: {
        id: plugin.id,
        config: config.settings || {}
      },
      logger: {
        debug: (message: string, meta?: any) => logger.debug(message, { pluginId: plugin.id, ...meta }),
        info: (message: string, meta?: any) => logger.info(message, { pluginId: plugin.id, ...meta }),
        warn: (message: string, meta?: any) => logger.warn(message, { pluginId: plugin.id, ...meta }),
        error: (message: string, meta?: any) => logger.error(message, { pluginId: plugin.id, ...meta })
      }
    }

    return context
  }

  /**
   * Extract route parameters from URL path
   */
  private extractRouteParams(routePath: string, actualPath: string): Record<string, string> {
    const params: Record<string, string> = {}
    const routeParts = routePath.split('/')
    const actualParts = actualPath.split('/')

    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i]
      const actualPart = actualParts[i]

      if (routePart?.startsWith(':') && actualPart) {
        const paramName = routePart.slice(1)
        params[paramName] = actualPart
      }
    }

    return params
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
      } else {
        return await req.text()
      }
    } catch (error) {
      logger.warn('Failed to parse request body', { error })
      return null
    }
  }

  /**
   * Validate route permissions
   */
  private async validateRoutePermissions(
    context: PluginAPIContext,
    route: PluginRoute
  ): Promise<void> {
    if (!route.permissions || route.permissions.length === 0) {
      return
    }

    if (!context.user) {
      throw new PluginError('Authentication required', context.plugin.id)
    }

    for (const permission of route.permissions) {
      const hasPermission = this.checkUserPermission(
        context.user.permissions,
        permission
      )

      if (!hasPermission) {
        throw new PluginError(`Missing permission: ${permission}`, context.plugin.id)
      }
    }
  }

  /**
   * Check if user has specific permission
   */
  private checkUserPermission(userPermissions: string[], requiredPermission: string): boolean {
    if (!userPermissions || userPermissions.length === 0) {
      return false
    }

    // Simple permission check - can be extended for more complex permission logic
    return userPermissions.includes(requiredPermission) || 
           userPermissions.includes('*') || 
           userPermissions.includes('admin:*')
  }

  /**
   * Execute plugin handler
   */
  private async executeHandler(
    plugin: Plugin,
    route: PluginRoute,
    context: PluginAPIContext
  ): Promise<NextResponse> {
    try {
      // Get handler function
      const handlerName = route.handler || 'default'
      const handler = this.handlers.get(handlerName)

      if (!handler) {
        throw new PluginError(`Handler ${handlerName} not found`, plugin.id)
      }

      // Execute handler
      const result = await handler(context, plugin, route)

      // Convert result to NextResponse
      return this.createSuccessResponse(result, context.response)

    } catch (error) {
      logger.error('Handler execution failed', {
        pluginId: plugin.id,
        handler: route.handler,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Default handler implementation
   */
  private async defaultHandler(
    context: PluginAPIContext,
    plugin: Plugin,
    route: PluginRoute
  ): Promise<any> {
    // This would load and execute the actual plugin handler file
    // For now, return a basic response
    context.logger.info('Default handler executed')
    
    return {
      success: true,
      message: 'Plugin endpoint executed successfully',
      plugin: plugin.name,
      route: route.path,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Proxy handler for forwarding requests
   */
  private async proxyHandler(
    context: PluginAPIContext,
    plugin: Plugin,
    route: PluginRoute
  ): Promise<any> {
    // Implementation for proxying requests to external services
    context.logger.info('Proxy handler executed')
    
    return {
      success: true,
      message: 'Proxy request handled',
      plugin: plugin.name
    }
  }

  /**
   * Redirect handler
   */
  private async redirectHandler(
    context: PluginAPIContext,
    plugin: Plugin,
    route: PluginRoute
  ): Promise<any> {
    context.logger.info('Redirect handler executed')
    
    return {
      redirect: true,
      url: '/dashboard',
      status: 302
    }
  }

  /**
   * Static file handler
   */
  private async staticHandler(
    context: PluginAPIContext,
    plugin: Plugin,
    route: PluginRoute
  ): Promise<any> {
    context.logger.info('Static handler executed')
    
    return {
      success: true,
      message: 'Static content served',
      plugin: plugin.name
    }
  }

  /**
   * Create success response
   */
  private createSuccessResponse(result: any, responseContext: PluginAPIResponse): NextResponse {
    if (result?.redirect) {
      return NextResponse.redirect(result.url, { status: result.status || 302 })
    }

    const response = NextResponse.json(result, { 
      status: responseContext.status || 200 
    })

    // Add custom headers
    if (responseContext.headers) {
      Object.entries(responseContext.headers).forEach(([key, value]) => {
        response.headers.set(key, value)
      })
    }

    return response
  }

  /**
   * Create error response
   */
  private createErrorResponse(error: any): NextResponse {
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

  /**
   * Log request metrics
   */
  private logRequestMetrics(
    pluginId: string,
    route: PluginRoute,
    duration: number,
    status: number
  ): void {
    logger.info('Plugin request completed', {
      pluginId,
      method: route.method,
      path: route.path,
      duration,
      status,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Clear context cache
   */
  public clearCache(): void {
    this.contextCache.clear()
    logger.debug('Plugin handler cache cleared')
  }

  /**
   * Get handler statistics
   */
  public getHandlerStats(): Record<string, any> {
    return {
      totalHandlers: this.handlers.size,
      registeredHandlers: Array.from(this.handlers.keys()),
      cacheSize: this.contextCache.size
    }
  }
}