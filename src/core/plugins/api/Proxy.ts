import { NextRequest, NextResponse } from 'next/server'
import { Plugin } from '@/core/types/plugin'
import { 
  PluginAPIContext,
  HTTPMethod 
} from '@/core/plugins/types/api'
import { PluginError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginManager } from '@/core/plugins/manager/PluginManager'

/**
 * Proxy configuration interface
 */
export interface PluginProxyConfig {
  target: string
  pathRewrite?: Record<string, string>
  changeOrigin?: boolean
  timeout?: number
  retries?: number
  headers?: Record<string, string>
  auth?: ProxyAuthConfig
  ssl?: ProxySSLConfig
  cache?: ProxyCacheConfig
}

/**
 * Proxy authentication configuration
 */
export interface ProxyAuthConfig {
  type: 'basic' | 'bearer' | 'api-key' | 'oauth'
  username?: string
  password?: string
  token?: string
  apiKey?: string
  apiKeyHeader?: string
}

/**
 * Proxy SSL configuration
 */
export interface ProxySSLConfig {
  rejectUnauthorized?: boolean
  cert?: string
  key?: string
  ca?: string
}

/**
 * Proxy cache configuration
 */
export interface ProxyCacheConfig {
  enabled: boolean
  ttl: number
  key?: string
  conditions?: string[]
}

/**
 * Proxy request metrics
 */
export interface ProxyMetrics {
  requests: number
  successCount: number
  errorCount: number
  totalTime: number
  averageTime: number
  cacheHits: number
  cacheMisses: number
}

/**
 * Cached proxy response
 */
interface CachedResponse {
  data: any
  headers: Record<string, string>
  status: number
  timestamp: number
  ttl: number
}

/**
 * Plugin Proxy - Handles proxying requests to external services
 */
export class PluginProxy {
  private static instance: PluginProxy
  private pluginManager: PluginManager
  private proxyConfigs: Map<string, PluginProxyConfig> = new Map()
  private responseCache: Map<string, CachedResponse> = new Map()
  private metrics: Map<string, ProxyMetrics> = new Map()
  private activeRequests: Map<string, AbortController> = new Map()

  private constructor() {
    this.pluginManager = PluginManager.getInstance()
    this.startCacheCleanup()
  }

  public static getInstance(): PluginProxy {
    if (!PluginProxy.instance) {
      PluginProxy.instance = new PluginProxy()
    }
    return PluginProxy.instance
  }

  /**
   * Register proxy configuration for a plugin
   */
  public registerProxyConfig(pluginId: string, config: PluginProxyConfig): void {
    this.proxyConfigs.set(pluginId, config)
    this.initializeMetrics(pluginId)
    
    logger.debug('Proxy config registered', { 
      pluginId, 
      target: config.target 
    })
  }

  /**
   * Unregister proxy configuration
   */
  public unregisterProxyConfig(pluginId: string): boolean {
    const removed = this.proxyConfigs.delete(pluginId)
    this.metrics.delete(pluginId)
    this.clearPluginCache(pluginId)
    
    if (removed) {
      logger.debug('Proxy config unregistered', { pluginId })
    }
    
    return removed
  }

  /**
   * Proxy request to external service
   */
  public async proxyRequest(
    pluginId: string,
    context: PluginAPIContext,
    targetPath?: string
  ): Promise<NextResponse> {
    const startTime = Date.now()
    const requestId = this.generateRequestId()
    
    try {
      logger.debug('Starting proxy request', {
        pluginId,
        requestId,
        method: context.request.method,
        path: context.request.path
      })

      // Get proxy configuration
      const config = this.proxyConfigs.get(pluginId)
      if (!config) {
        throw new PluginError(`No proxy configuration found for plugin ${pluginId}`, pluginId)
      }

      // Build target URL
      const targetUrl = this.buildTargetUrl(config, context.request.path, targetPath)
      
      // Check cache first
      const cacheKey = this.generateCacheKey(pluginId, context.request.method, targetUrl)
      const cachedResponse = this.getCachedResponse(cacheKey, config.cache)
      
      if (cachedResponse) {
        this.updateMetrics(pluginId, Date.now() - startTime, true, true)
        return this.createResponseFromCache(cachedResponse)
      }

      // Create proxy request
      const proxyRequest = await this.createProxyRequest(config, context, targetUrl)
      
      // Execute request with timeout and retries
      const response = await this.executeProxyRequest(
        requestId,
        proxyRequest,
        config
      )

      // Cache response if configured
      if (config.cache?.enabled && this.shouldCacheResponse(response, config.cache)) {
        await this.cacheResponse(cacheKey, response, config.cache)
      }

      // Update metrics
      this.updateMetrics(pluginId, Date.now() - startTime, true, false)

      logger.debug('Proxy request completed', {
        pluginId,
        requestId,
        status: response.status,
        duration: Date.now() - startTime
      })

      return response

    } catch (error) {
      this.updateMetrics(pluginId, Date.now() - startTime, false, false)
      
      logger.error('Proxy request failed', {
        pluginId,
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      throw error
    } finally {
      this.activeRequests.delete(requestId)
    }
  }

  /**
   * Build target URL from configuration and request path
   */
  private buildTargetUrl(
    config: PluginProxyConfig,
    requestPath: string,
    targetPath?: string
  ): string {
    let path = targetPath || requestPath
    
    // Apply path rewrites
    if (config.pathRewrite) {
      for (const [from, to] of Object.entries(config.pathRewrite)) {
        path = path.replace(new RegExp(from), to)
      }
    }

    // Ensure target URL ends with /
    const target = config.target.endsWith('/') ? config.target : `${config.target}/`
    
    // Remove leading slash from path
    path = path.startsWith('/') ? path.slice(1) : path

    return `${target}${path}`
  }

  /**
   * Create proxy request from context and configuration
   */
  private async createProxyRequest(
    config: PluginProxyConfig,
    context: PluginAPIContext,
    targetUrl: string
  ): Promise<Request> {
    const headers = new Headers()

    // Copy original headers (excluding host)
    Object.entries(context.request.headers).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'host') {
        headers.set(key, value)
      }
    })

    // Add configuration headers
    if (config.headers) {
      Object.entries(config.headers).forEach(([key, value]) => {
        headers.set(key, value)
      })
    }

    // Add authentication headers
    if (config.auth) {
      this.addAuthHeaders(headers, config.auth)
    }

    // Change origin if configured
    if (config.changeOrigin) {
      const url = new URL(targetUrl)
      headers.set('host', url.host)
    }

    // Prepare request body
    let body: any = undefined
    if (['POST', 'PUT', 'PATCH'].includes(context.request.method)) {
      body = context.request.body
    }

    return new Request(targetUrl, {
      method: context.request.method,
      headers,
      body
    })
  }

  /**
   * Add authentication headers based on configuration
   */
  private addAuthHeaders(headers: Headers, auth: ProxyAuthConfig): void {
    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = btoa(`${auth.username}:${auth.password}`)
          headers.set('Authorization', `Basic ${credentials}`)
        }
        break

      case 'bearer':
        if (auth.token) {
          headers.set('Authorization', `Bearer ${auth.token}`)
        }
        break

      case 'api-key':
        if (auth.apiKey && auth.apiKeyHeader) {
          headers.set(auth.apiKeyHeader, auth.apiKey)
        }
        break

      case 'oauth':
        if (auth.token) {
          headers.set('Authorization', `OAuth ${auth.token}`)
        }
        break
    }
  }

  /**
   * Execute proxy request with retries and timeout
   */
  private async executeProxyRequest(
    requestId: string,
    request: Request,
    config: PluginProxyConfig
  ): Promise<NextResponse> {
    const timeout = config.timeout || 30000
    const retries = config.retries || 0
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController()
        this.activeRequests.set(requestId, controller)

        const timeoutId = setTimeout(() => {
          controller.abort()
        }, timeout)

        // Make request
        const response = await fetch(request.clone(), {
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Convert to NextResponse
        return await this.convertToNextResponse(response)

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt < retries) {
          logger.warn('Proxy request attempt failed, retrying', {
            requestId,
            attempt: attempt + 1,
            maxRetries: retries,
            error: lastError.message
          })
          
          // Wait before retry (exponential backoff)
          await this.sleep(Math.pow(2, attempt) * 1000)
        }
      }
    }

    throw new PluginError(
      `Proxy request failed after ${retries + 1} attempts: ${lastError?.message}`,
      'proxy'
    )
  }

  /**
   * Convert fetch Response to NextResponse
   */
  private async convertToNextResponse(response: Response): Promise<NextResponse> {
    const body = await response.text()
    const headers = new Headers()

    // Copy response headers
    response.headers.forEach((value, key) => {
      headers.set(key, value)
    })

    return new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(pluginId: string, method: string, url: string): string {
    return `${pluginId}:${method}:${url}`
  }

  /**
   * Get cached response if valid
   */
  private getCachedResponse(
    cacheKey: string,
    cacheConfig?: ProxyCacheConfig
  ): CachedResponse | null {
    if (!cacheConfig?.enabled) {
      return null
    }

    const cached = this.responseCache.get(cacheKey)
    if (!cached) {
      return null
    }

    const now = Date.now()
    if (now - cached.timestamp > cached.ttl * 1000) {
      this.responseCache.delete(cacheKey)
      return null
    }

    return cached
  }

  /**
   * Cache response
   */
  private async cacheResponse(
    cacheKey: string,
    response: NextResponse,
    cacheConfig: ProxyCacheConfig
  ): Promise<void> {
    try {
      const body = await response.text()
      const headers: Record<string, string> = {}
      
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      const cached: CachedResponse = {
        data: body,
        headers,
        status: response.status,
        timestamp: Date.now(),
        ttl: cacheConfig.ttl
      }

      this.responseCache.set(cacheKey, cached)

    } catch (error) {
      logger.warn('Failed to cache proxy response', {
        cacheKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Create NextResponse from cached data
   */
  private createResponseFromCache(cached: CachedResponse): NextResponse {
    return new NextResponse(cached.data, {
      status: cached.status,
      headers: {
        ...cached.headers,
        'X-Cache': 'HIT'
      }
    })
  }

  /**
   * Check if response should be cached
   */
  private shouldCacheResponse(
    response: NextResponse,
    cacheConfig: ProxyCacheConfig
  ): boolean {
    // Only cache successful responses
    if (response.status < 200 || response.status >= 300) {
      return false
    }

    // Check cache conditions
    if (cacheConfig.conditions) {
      for (const condition of cacheConfig.conditions) {
        // Implement condition checking logic here
        // For now, assume all conditions pass
      }
    }

    return true
  }

  /**
   * Initialize metrics for plugin
   */
  private initializeMetrics(pluginId: string): void {
    if (!this.metrics.has(pluginId)) {
      this.metrics.set(pluginId, {
        requests: 0,
        successCount: 0,
        errorCount: 0,
        totalTime: 0,
        averageTime: 0,
        cacheHits: 0,
        cacheMisses: 0
      })
    }
  }

  /**
   * Update proxy metrics
   */
  private updateMetrics(
    pluginId: string,
    duration: number,
    success: boolean,
    cacheHit: boolean
  ): void {
    const metrics = this.metrics.get(pluginId)
    if (!metrics) return

    metrics.requests++
    metrics.totalTime += duration
    metrics.averageTime = metrics.totalTime / metrics.requests

    if (success) {
      metrics.successCount++
    } else {
      metrics.errorCount++
    }

    if (cacheHit) {
      metrics.cacheHits++
    } else {
      metrics.cacheMisses++
    }

    this.metrics.set(pluginId, metrics)
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredCache()
    }, 60000) // Cleanup every minute
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now()
    let removed = 0

    for (const [key, cached] of this.responseCache.entries()) {
      if (now - cached.timestamp > cached.ttl * 1000) {
        this.responseCache.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      logger.debug('Cleaned up expired cache entries', { removed })
    }
  }

  /**
   * Clear cache for specific plugin
   */
  private clearPluginCache(pluginId: string): void {
    const keysToRemove: string[] = []
    
    for (const key of this.responseCache.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => {
      this.responseCache.delete(key)
    })

    logger.debug('Plugin cache cleared', { pluginId, removed: keysToRemove.length })
  }

  /**
   * Cancel active request
   */
  public cancelRequest(requestId: string): boolean {
    const controller = this.activeRequests.get(requestId)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(requestId)
      return true
    }
    return false
  }

  /**
   * Get proxy statistics
   */
  public getProxyStats(): Record<string, any> {
    return {
      totalConfigs: this.proxyConfigs.size,
      cacheSize: this.responseCache.size,
      activeRequests: this.activeRequests.size,
      metrics: Object.fromEntries(this.metrics.entries())
    }
  }

  /**
   * Clear all caches
   */
  public clearAllCaches(): void {
    this.responseCache.clear()
    logger.debug('All proxy caches cleared')
  }

  /**
   * Get proxy configuration for plugin
   */
  public getProxyConfig(pluginId: string): PluginProxyConfig | undefined {
    return this.proxyConfigs.get(pluginId)
  }
}