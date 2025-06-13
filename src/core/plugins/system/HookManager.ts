import { PluginHook, PluginHookContext, PluginHookHandler, PluginHookResult, HookCategory } from '@/core/plugins/types/hook'
import { logger } from '@/core/lib/utils/logger'
import { EventEmitter } from 'events'

export interface HookExecutionContext extends PluginHookContext {
  executionId: string
  startTime: number
  parentHook?: string
  depth: number
  timeout: number
}

export interface HookExecutionResult {
  hookId: string
  pluginId: string
  hookName: string
  success: boolean
  result?: PluginHookResult
  error?: string
  executionTime: number
  memoryUsage: number
  timestamp: Date
}

export interface HookPerformanceMetrics {
  hookName: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  averageExecutionTime: number
  minExecutionTime: number
  maxExecutionTime: number
  totalMemoryUsage: number
  averageMemoryUsage: number
  lastExecuted?: Date
  errorRate: number
}

export interface HookRegistryStats {
  totalHooks: number
  activeHooks: number
  hooksByCategory: Record<HookCategory, number>
  hooksByPlugin: Record<string, number>
  executionStats: HookPerformanceMetrics[]
  recentExecutions: HookExecutionResult[]
  failureRate: number
  averageExecutionTime: number
}

export interface HookManagerConfig {
  maxExecutionTime: number // ms
  maxConcurrentExecutions: number
  maxHookDepth: number
  enableMetrics: boolean
  enableDebug: boolean
  enableAsyncExecution: boolean
  retryAttempts: number
  retryDelay: number
  circuitBreakerThreshold: number
  cleanupInterval: number // ms
  metricsRetention: number // ms
}

export class PluginHookManager extends EventEmitter {
  private static instance: PluginHookManager
  private hooks: Map<string, PluginHook[]> = new Map()
  private handlers: Map<string, PluginHookHandler> = new Map()
  private executionResults: HookExecutionResult[] = []
  private performanceMetrics: Map<string, HookPerformanceMetrics> = new Map()
  private activeExecutions: Map<string, HookExecutionContext> = new Map()
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map()
  private cleanupTimer: NodeJS.Timeout | null = null
  private config: HookManagerConfig = {
    maxExecutionTime: 5000,
    maxConcurrentExecutions: 50,
    maxHookDepth: 10,
    enableMetrics: true,
    enableDebug: false,
    enableAsyncExecution: true,
    retryAttempts: 3,
    retryDelay: 1000,
    circuitBreakerThreshold: 5,
    cleanupInterval: 60000,
    metricsRetention: 24 * 60 * 60 * 1000 // 24 hours
  }

  private constructor() {
    super()
    this.startCleanupTimer()
  }

  public static getInstance(): PluginHookManager {
    if (!PluginHookManager.instance) {
      PluginHookManager.instance = new PluginHookManager()
    }
    return PluginHookManager.instance
  }

  /**
   * Register a hook
   */
  public async registerHook(
    hook: PluginHook,
    handler: PluginHookHandler
  ): Promise<boolean> {
    try {
      // Validate hook
      if (!this.validateHook(hook)) {
        throw new Error('Invalid hook configuration')
      }

      // Store handler
      this.handlers.set(hook.id, handler)

      // Add to hooks registry
      const hookList = this.hooks.get(hook.name) || []
      
      // Check for duplicate hook ID
      if (hookList.some(h => h.id === hook.id)) {
        throw new Error(`Hook with ID ${hook.id} already exists`)
      }

      hookList.push(hook)
      
      // Sort by priority (highest first)
      hookList.sort((a, b) => b.priority - a.priority)
      
      this.hooks.set(hook.name, hookList)

      // Initialize metrics
      if (this.config.enableMetrics) {
        this.initializeMetrics(hook.name)
      }

      logger.info('Hook registered', {
        hookId: hook.id,
        hookName: hook.name,
        pluginId: hook.pluginId,
        priority: hook.priority,
        category: hook.category
      })

      this.emit('hook:registered', { hook })
      return true
    } catch (error) {
      logger.error('Failed to register hook', {
        hookId: hook.id,
        hookName: hook.name,
        pluginId: hook.pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('hook:register_failed', { hook, error })
      return false
    }
  }

  /**
   * Unregister a hook
   */
  public async unregisterHook(hookId: string): Promise<boolean> {
    try {
      let removed = false
      let hookInfo: { name: string; pluginId: string } | null = null

      // Find and remove the hook
      for (const [hookName, hookList] of this.hooks.entries()) {
        const index = hookList.findIndex(h => h.id === hookId)
        
        if (index > -1) {
          const hook = hookList[index]
          hookInfo = { name: hook.name, pluginId: hook.pluginId }
          
          hookList.splice(index, 1)
          
          if (hookList.length === 0) {
            this.hooks.delete(hookName)
          } else {
            this.hooks.set(hookName, hookList)
          }
          
          removed = true
          break
        }
      }

      if (removed) {
        // Remove handler
        this.handlers.delete(hookId)

        // Remove from circuit breakers
        this.circuitBreakers.delete(hookId)

        logger.info('Hook unregistered', {
          hookId,
          hookName: hookInfo?.name,
          pluginId: hookInfo?.pluginId
        })

        this.emit('hook:unregistered', { hookId, hookInfo })
      }

      return removed
    } catch (error) {
      logger.error('Failed to unregister hook', {
        hookId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return false
    }
  }

  /**
   * Execute hooks for a given hook name
   */
  public async executeHooks(
  hookName: string,
  context: PluginHookContext
): Promise<PluginHookResult[]> {
  const executionId = this.generateExecutionId()
  const startTime = Date.now()

  try {
    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached')
    }

    const hooks = this.hooks.get(hookName) || []
    const enabledHooks = hooks.filter(h => h.enabled)

    if (enabledHooks.length === 0) {
      if (this.config.enableDebug) {
        logger.debug('No enabled hooks found', { hookName })
      }
      return []
    }

    // Create execution context
    const execContext: HookExecutionContext = {
      ...context,
      executionId,
      startTime,
      depth: 0,
      timeout: this.config.maxExecutionTime
    }

    // Track active execution
    this.activeExecutions.set(executionId, execContext)

    const results: PluginHookResult[] = []
    let stopPropagation = false

    logger.debug('Executing hooks', {
      hookName,
      hookCount: enabledHooks.length,
      executionId
    })

    // Execute hooks in priority order
    for (const hook of enabledHooks) {
      if (stopPropagation) {
        break
      }

      try {
        // Check circuit breaker
        if (this.isCircuitBreakerOpen(hook.id)) {
          logger.warn('Circuit breaker open, skipping hook', {
            hookId: hook.id,
            hookName: hook.name,
            pluginId: hook.pluginId
          })
          continue
        }

        const executionResult = await this.executeHook(hook, execContext)
        
        // 🔧 FIX: Access the nested result property correctly
        if (executionResult.success && executionResult.result) {
          const hookResult = executionResult.result
          results.push(hookResult)
          
          // Check for stop propagation
          if (hookResult.stopPropagation) {
            stopPropagation = true
          }
        }

        // Update metrics
        if (this.config.enableMetrics) {
          this.updateMetrics(hook.name, executionResult)
        }

      } catch (error) {
        logger.error('Hook execution failed', {
          hookId: hook.id,
          hookName: hook.name,
          pluginId: hook.pluginId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })

        // Update circuit breaker
        this.updateCircuitBreaker(hook.id, false)
      }
    }

    // Remove from active executions
    this.activeExecutions.delete(executionId)

    const totalTime = Date.now() - startTime

    logger.debug('Hook execution completed', {
      hookName,
      executionId,
      resultsCount: results.length,
      totalTime,
      stopPropagation
    })

    this.emit('hooks:executed', {
      hookName,
      executionId,
      results,
      totalTime
    })

    return results
  } catch (error) {
    this.activeExecutions.delete(executionId)
    
    logger.error('Hook execution failed', {
      hookName,
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    this.emit('hooks:execution_failed', { hookName, executionId, error })
    return []
  }
}

  /**
   * Execute a single hook
   */
  public async executeHook(
    hook: PluginHook,
    context: HookExecutionContext
  ): Promise<HookExecutionResult> {
    const startTime = Date.now()
    const startMemory = process.memoryUsage().heapUsed

    try {
      // Check execution depth
      if (context.depth >= this.config.maxHookDepth) {
        throw new Error('Maximum hook execution depth reached')
      }

      // Get handler
      const handler = this.handlers.get(hook.id)
      if (!handler) {
        throw new Error(`Handler not found for hook: ${hook.id}`)
      }

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Hook execution timeout'))
        }, hook.timeout || context.timeout)
      })

      // Execute handler with timeout
      const executionPromise = this.config.enableAsyncExecution
        ? Promise.resolve(handler(context))
        : Promise.resolve(handler(context))

      const result = await Promise.race([executionPromise, timeoutPromise])

      const executionTime = Date.now() - startTime
      const memoryUsage = process.memoryUsage().heapUsed - startMemory

      const executionResult: HookExecutionResult = {
        hookId: hook.id,
        pluginId: hook.pluginId,
        hookName: hook.name,
        success: true,
        result: result || undefined,
        executionTime,
        memoryUsage,
        timestamp: new Date()
      }

      // Store execution result
      this.storeExecutionResult(executionResult)

      // Update circuit breaker
      this.updateCircuitBreaker(hook.id, true)

      this.emit('hook:executed', executionResult)

      return executionResult
    } catch (error) {
      const executionTime = Date.now() - startTime
      const memoryUsage = process.memoryUsage().heapUsed - startMemory

      const executionResult: HookExecutionResult = {
        hookId: hook.id,
        pluginId: hook.pluginId,
        hookName: hook.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        memoryUsage,
        timestamp: new Date()
      }

      // Store execution result
      this.storeExecutionResult(executionResult)

      // Update circuit breaker
      this.updateCircuitBreaker(hook.id, false)

      // Retry if configured
      if (this.config.retryAttempts > 0) {
        return this.retryHookExecution(hook, context, 1)
      }

      this.emit('hook:execution_failed', executionResult)

      return executionResult
    }
  }

  /**
   * Get hooks by name
   */
  public getHooks(hookName: string): PluginHook[] {
    return this.hooks.get(hookName) || []
  }

  /**
   * Get all hooks for a plugin
   */
  public getPluginHooks(pluginId: string): PluginHook[] {
    const pluginHooks: PluginHook[] = []
    
    this.hooks.forEach(hookList => {
      hookList
        .filter(hook => hook.pluginId === pluginId)
        .forEach(hook => pluginHooks.push(hook))
    })
    
    return pluginHooks
  }

  /**
   * Enable/disable hook
   */
  public setHookEnabled(hookId: string, enabled: boolean): boolean {
    for (const hookList of this.hooks.values()) {
      const hook = hookList.find(h => h.id === hookId)
      if (hook) {
        hook.enabled = enabled
        
        logger.info('Hook enabled state changed', {
          hookId,
          hookName: hook.name,
          pluginId: hook.pluginId,
          enabled
        })
        
        this.emit('hook:enabled_changed', { hookId, enabled })
        return true
      }
    }
    
    return false
  }

  /**
   * Remove all hooks for a plugin
   */
  public removePluginHooks(pluginId: string): number {
    let removed = 0
    
    for (const [hookName, hookList] of this.hooks.entries()) {
      const originalLength = hookList.length
      const filteredHooks = hookList.filter(hook => {
        if (hook.pluginId === pluginId) {
          // Remove handler
          this.handlers.delete(hook.id)
          // Remove circuit breaker
          this.circuitBreakers.delete(hook.id)
          return false
        }
        return true
      })
      
      if (filteredHooks.length !== originalLength) {
        removed += originalLength - filteredHooks.length
        
        if (filteredHooks.length === 0) {
          this.hooks.delete(hookName)
        } else {
          this.hooks.set(hookName, filteredHooks)
        }
      }
    }
    
    logger.info('Plugin hooks removed', { pluginId, removed })
    this.emit('plugin:hooks_removed', { pluginId, removed })
    
    return removed
  }

  /**
   * Get hook registry statistics
   */
  public getStats(): HookRegistryStats {
    const totalHooks = Array.from(this.hooks.values()).reduce((sum, hooks) => sum + hooks.length, 0)
    const activeHooks = Array.from(this.hooks.values()).reduce((sum, hooks) => sum + hooks.filter(h => h.enabled).length, 0)
    
    const hooksByCategory: Record<HookCategory, number> = {
      [HookCategory.API]: 0,
      [HookCategory.UI]: 0,
      [HookCategory.SYSTEM]: 0,
      [HookCategory.USER]: 0,
      [HookCategory.CONTENT]: 0,
      [HookCategory.CUSTOM]: 0
    }
    
    const hooksByPlugin: Record<string, number> = {}
    
    this.hooks.forEach(hookList => {
      hookList.forEach(hook => {
        hooksByCategory[hook.category]++
        hooksByPlugin[hook.pluginId] = (hooksByPlugin[hook.pluginId] || 0) + 1
      })
    })
    
    const executionStats = Array.from(this.performanceMetrics.values())
    const recentExecutions = this.executionResults
      .slice(-50)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    const totalExecutions = executionStats.reduce((sum, stat) => sum + stat.totalExecutions, 0)
    const failedExecutions = executionStats.reduce((sum, stat) => sum + stat.failedExecutions, 0)
    const failureRate = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0
    
    const totalExecutionTime = executionStats.reduce((sum, stat) => sum + (stat.averageExecutionTime * stat.totalExecutions), 0)
    const averageExecutionTime = totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0
    
    return {
      totalHooks,
      activeHooks,
      hooksByCategory,
      hooksByPlugin,
      executionStats,
      recentExecutions,
      failureRate,
      averageExecutionTime
    }
  }

  /**
   * Get performance metrics for hook
   */
  public getHookMetrics(hookName: string): HookPerformanceMetrics | null {
    return this.performanceMetrics.get(hookName) || null
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<HookManagerConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Restart cleanup timer if interval changed
    if (newConfig.cleanupInterval) {
      this.stopCleanupTimer()
      this.startCleanupTimer()
    }
    
    logger.info('Hook manager configuration updated', { config: this.config })
  }

  /**
   * Clear all hooks
   */
  public clearAll(): void {
    this.hooks.clear()
    this.handlers.clear()
    this.executionResults = []
    this.performanceMetrics.clear()
    this.activeExecutions.clear()
    this.circuitBreakers.clear()
    
    logger.info('All hooks cleared')
    this.emit('hooks:cleared')
  }

  // Private methods
  private validateHook(hook: PluginHook): boolean {
    return !!(
      hook.id &&
      hook.name &&
      hook.pluginId &&
      hook.category &&
      typeof hook.priority === 'number' &&
      typeof hook.enabled === 'boolean'
    )
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private initializeMetrics(hookName: string): void {
    if (!this.performanceMetrics.has(hookName)) {
      this.performanceMetrics.set(hookName, {
        hookName,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        minExecutionTime: Number.MAX_SAFE_INTEGER,
        maxExecutionTime: 0,
        totalMemoryUsage: 0,
        averageMemoryUsage: 0,
        errorRate: 0
      })
    }
  }

  private updateMetrics(hookName: string, result: HookExecutionResult): void {
    const metrics = this.performanceMetrics.get(hookName)
    if (!metrics) return

    metrics.totalExecutions++
    metrics.lastExecuted = result.timestamp

    if (result.success) {
      metrics.successfulExecutions++
    } else {
      metrics.failedExecutions++
    }

    // Update execution time stats
    metrics.averageExecutionTime = 
      ((metrics.averageExecutionTime * (metrics.totalExecutions - 1)) + result.executionTime) / metrics.totalExecutions
    
    metrics.minExecutionTime = Math.min(metrics.minExecutionTime, result.executionTime)
    metrics.maxExecutionTime = Math.max(metrics.maxExecutionTime, result.executionTime)

    // Update memory usage stats
    metrics.totalMemoryUsage += result.memoryUsage
    metrics.averageMemoryUsage = metrics.totalMemoryUsage / metrics.totalExecutions

    // Update error rate
    metrics.errorRate = (metrics.failedExecutions / metrics.totalExecutions) * 100
  }

  private storeExecutionResult(result: HookExecutionResult): void {
    this.executionResults.push(result)
    
    // Keep only recent results
    if (this.executionResults.length > 1000) {
      this.executionResults.shift()
    }
  }

  private isCircuitBreakerOpen(hookId: string): boolean {
    const state = this.circuitBreakers.get(hookId)
    if (!state) return false
    
    if (state.state === 'open') {
      // Check if we should move to half-open
      if (Date.now() - state.lastFailureTime > state.timeout) {
        state.state = 'half-open'
        state.consecutiveFailures = 0
        return false
      }
      return true
    }
    
    return false
  }

  private updateCircuitBreaker(hookId: string, success: boolean): void {
    let state = this.circuitBreakers.get(hookId)
    
    if (!state) {
      state = {
        state: 'closed',
        consecutiveFailures: 0,
        lastFailureTime: 0,
        timeout: 60000 // 1 minute
      }
      this.circuitBreakers.set(hookId, state)
    }
    
    if (success) {
      if (state.state === 'half-open') {
        state.state = 'closed'
      }
      state.consecutiveFailures = 0
    } else {
      state.consecutiveFailures++
      state.lastFailureTime = Date.now()
      
      if (state.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        state.state = 'open'
        
        logger.warn('Circuit breaker opened', {
          hookId,
          consecutiveFailures: state.consecutiveFailures,
          threshold: this.config.circuitBreakerThreshold
        })
        
        this.emit('circuit_breaker:opened', { hookId, state })
      }
    }
  }

  private async retryHookExecution(
    hook: PluginHook,
    context: HookExecutionContext,
    attempt: number
  ): Promise<HookExecutionResult> {
    if (attempt > this.config.retryAttempts) {
      throw new Error('Maximum retry attempts reached')
    }
    
    logger.debug('Retrying hook execution', {
      hookId: hook.id,
      attempt,
      maxAttempts: this.config.retryAttempts
    })
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt))
    
    try {
      return await this.executeHook(hook, context)
    } catch (error) {
      return this.retryHookExecution(hook, context, attempt + 1)
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private cleanup(): void {
    const now = Date.now()
    const retentionTime = this.config.metricsRetention
    
    // Clean up old execution results
    this.executionResults = this.executionResults.filter(
      result => now - result.timestamp.getTime() < retentionTime
    )
    
    // Clean up inactive circuit breakers
    for (const [hookId, state] of this.circuitBreakers.entries()) {
      if (now - state.lastFailureTime > retentionTime) {
        this.circuitBreakers.delete(hookId)
      }
    }
    
    // Clean up metrics for removed hooks
    const activeHookNames = new Set(this.hooks.keys())
    for (const hookName of this.performanceMetrics.keys()) {
      if (!activeHookNames.has(hookName)) {
        this.performanceMetrics.delete(hookName)
      }
    }
    
    logger.debug('Hook manager cleanup completed')
  }

  /**
   * Shutdown hook manager
   */
  public shutdown(): void {
    this.stopCleanupTimer()
    this.clearAll()
    this.removeAllListeners()
    
    logger.info('Hook manager shutdown')
  }
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open'
  consecutiveFailures: number
  lastFailureTime: number
  timeout: number
}