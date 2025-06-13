import { Plugin } from '@/core/types/plugin'
import { logger } from '@/core/lib/utils/logger'
import { EventEmitter } from 'events'

export interface SandboxConfig {
  memoryLimit: number // MB
  timeoutLimit: number // ms
  cpuLimit: number // percentage
  networkAccess: boolean
  fileSystemAccess: boolean
  databaseAccess: boolean
  allowedApis: string[]
  blockedApis: string[]
  environment: 'production' | 'development' | 'testing'
}

export interface SandboxContext {
  pluginId: string
  plugin: Plugin
  config: SandboxConfig
  startTime: number
  memoryUsage: number
  cpuUsage: number
  isActive: boolean
  violations: SandboxViolation[]
}

export interface SandboxViolation {
  type: ViolationType
  message: string
  timestamp: Date
  severity: 'low' | 'medium' | 'high' | 'critical'
  details?: Record<string, any>
}

export enum ViolationType {
  MEMORY_LIMIT = 'memory_limit',
  TIMEOUT = 'timeout',
  CPU_LIMIT = 'cpu_limit',
  UNAUTHORIZED_API = 'unauthorized_api',
  NETWORK_ACCESS = 'network_access',
  FILE_ACCESS = 'file_access',
  DATABASE_ACCESS = 'database_access',
  SECURITY_VIOLATION = 'security_violation',
  PERMISSION_DENIED = 'permission_denied'
}

export class PluginSandbox extends EventEmitter {
  private static instance: PluginSandbox
  private contexts: Map<string, SandboxContext> = new Map()
  private defaultConfig: SandboxConfig = {
    memoryLimit: 64, // 64MB
    timeoutLimit: 30000, // 30 seconds
    cpuLimit: 50, // 50%
    networkAccess: false,
    fileSystemAccess: false,
    databaseAccess: false,
    allowedApis: [
      'console.log',
      'console.warn',
      'console.error',
      'JSON.parse',
      'JSON.stringify',
      'Date',
      'Math',
      'String',
      'Number',
      'Boolean',
      'Array',
      'Object'
    ],
    blockedApis: [
      'eval',
      'Function',
      'require',
      'import',
      'process',
      'global',
      'window',
      'document',
      'XMLHttpRequest',
      'fetch'
    ],
    environment: 'development'
  }
  private monitoringInterval: NodeJS.Timeout | null = null

  private constructor() {
    super()
    this.startMonitoring()
  }

  public static getInstance(): PluginSandbox {
    if (!PluginSandbox.instance) {
      PluginSandbox.instance = new PluginSandbox()
    }
    return PluginSandbox.instance
  }

  /**
   * Create sandbox for plugin
   */
  public createSandbox(plugin: Plugin, customConfig?: Partial<SandboxConfig>): SandboxContext {
    const config = { ...this.defaultConfig, ...customConfig }
    
    const context: SandboxContext = {
      pluginId: plugin.id,
      plugin,
      config,
      startTime: Date.now(),
      memoryUsage: 0,
      cpuUsage: 0,
      isActive: true,
      violations: []
    }

    this.contexts.set(plugin.id, context)

    logger.info('Plugin sandbox created', {
      pluginId: plugin.id,
      config
    })

    this.emit('sandbox:created', context)
    return context
  }

  /**
   * Execute code in sandbox
   */
  public async executeInSandbox<T = any>(
    pluginId: string,
    code: string,
    args?: Record<string, any>
  ): Promise<{ result: T; violations: SandboxViolation[] }> {
    const context = this.contexts.get(pluginId)
    if (!context) {
      throw new Error(`Sandbox not found for plugin: ${pluginId}`)
    }

    if (!context.isActive) {
      throw new Error(`Sandbox is inactive for plugin: ${pluginId}`)
    }

    const violations: SandboxViolation[] = []
    const startTime = Date.now()
    const startMemory = process.memoryUsage().heapUsed

    try {
      // Pre-execution checks
      this.validateCode(code, context, violations)
      
      if (violations.some(v => v.severity === 'critical')) {
        throw new Error('Critical security violations detected')
      }

      // Create isolated execution environment
      const sandbox = this.createIsolatedEnvironment(context, args || {})
      
      // Set timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), context.config.timeoutLimit)
      })

      // Execute code
      const executionPromise = this.runCode(code, sandbox, context)
      
      const result = await Promise.race([executionPromise, timeoutPromise])

      // Post-execution checks
      const endTime = Date.now()
      const endMemory = process.memoryUsage().heapUsed
      const memoryUsed = Math.round((endMemory - startMemory) / 1024 / 1024) // MB
      const executionTime = endTime - startTime

      // Update context
      context.memoryUsage = Math.max(context.memoryUsage, memoryUsed)

      // Check resource limits
      this.checkResourceLimits(context, memoryUsed, executionTime, violations)

      // Log execution
      logger.debug('Plugin code executed', {
        pluginId,
        memoryUsed,
        executionTime,
        violationCount: violations.length
      })

      this.emit('sandbox:executed', {
        pluginId,
        result,
        violations,
        metrics: { memoryUsed, executionTime }
      })

      return { result, violations }
    } catch (error) {
      const violation: SandboxViolation = {
        type: ViolationType.SECURITY_VIOLATION,
        message: error instanceof Error ? error.message : 'Unknown execution error',
        timestamp: new Date(),
        severity: 'high',
        details: { error: error instanceof Error ? error.stack : error }
      }

      violations.push(violation)
      context.violations.push(violation)

      logger.error('Plugin execution failed', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error',
        violations: violations.length
      })

      this.emit('sandbox:error', { pluginId, error, violations })

      throw error
    }
  }

  /**
   * Destroy sandbox
   */
  public destroySandbox(pluginId: string): boolean {
    const context = this.contexts.get(pluginId)
    if (!context) {
      return false
    }

    context.isActive = false
    this.contexts.delete(pluginId)

    logger.info('Plugin sandbox destroyed', {
      pluginId,
      violationCount: context.violations.length,
      memoryUsage: context.memoryUsage
    })

    this.emit('sandbox:destroyed', context)
    return true
  }

  /**
   * Get sandbox context
   */
  public getSandboxContext(pluginId: string): SandboxContext | null {
    return this.contexts.get(pluginId) || null
  }

  /**
   * Get all active sandboxes
   */
  public getActiveSandboxes(): SandboxContext[] {
    return Array.from(this.contexts.values()).filter(ctx => ctx.isActive)
  }

  /**
   * Suspend sandbox
   */
  public suspendSandbox(pluginId: string, reason: string): void {
    const context = this.contexts.get(pluginId)
    if (context) {
      context.isActive = false
      
      const violation: SandboxViolation = {
        type: ViolationType.SECURITY_VIOLATION,
        message: `Sandbox suspended: ${reason}`,
        timestamp: new Date(),
        severity: 'critical',
        details: { reason }
      }

      context.violations.push(violation)

      logger.warn('Plugin sandbox suspended', {
        pluginId,
        reason,
        violationCount: context.violations.length
      })

      this.emit('sandbox:suspended', { pluginId, reason, context })
    }
  }

  /**
   * Resume sandbox
   */
  public resumeSandbox(pluginId: string): boolean {
    const context = this.contexts.get(pluginId)
    if (context) {
      context.isActive = true
      context.violations = [] // Clear previous violations
      
      logger.info('Plugin sandbox resumed', { pluginId })
      this.emit('sandbox:resumed', context)
      return true
    }
    return false
  }

  /**
   * Get sandbox statistics
   */
  public getSandboxStats(): {
    total: number
    active: number
    suspended: number
    totalViolations: number
    violationsByType: Record<ViolationType, number>
    memoryUsage: number
    avgCpuUsage: number
  } {
    const contexts = Array.from(this.contexts.values())
    const active = contexts.filter(ctx => ctx.isActive)
    const suspended = contexts.filter(ctx => !ctx.isActive)
    
    const totalViolations = contexts.reduce((sum, ctx) => sum + ctx.violations.length, 0)
    const violationsByType = {} as Record<ViolationType, number>
    
    Object.values(ViolationType).forEach(type => {
      violationsByType[type] = contexts.reduce(
        (sum, ctx) => sum + ctx.violations.filter(v => v.type === type).length,
        0
      )
    })

    const totalMemory = contexts.reduce((sum, ctx) => sum + ctx.memoryUsage, 0)
    const avgCpu = contexts.length > 0 
      ? contexts.reduce((sum, ctx) => sum + ctx.cpuUsage, 0) / contexts.length 
      : 0

    return {
      total: contexts.length,
      active: active.length,
      suspended: suspended.length,
      totalViolations,
      violationsByType,
      memoryUsage: totalMemory,
      avgCpuUsage: avgCpu
    }
  }

  /**
   * Cleanup inactive sandboxes
   */
  public cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    this.contexts.forEach((context, pluginId) => {
      // Clean up sandboxes older than 1 hour
      if (now - context.startTime > 60 * 60 * 1000) {
        this.destroySandbox(pluginId)
        cleaned++
      }
    })

    if (cleaned > 0) {
      logger.info('Sandbox cleanup completed', { cleaned })
    }

    return cleaned
  }

  // Private methods
  private validateCode(code: string, context: SandboxContext, violations: SandboxViolation[]): void {
    // Check for blocked APIs
    context.config.blockedApis.forEach(api => {
      if (code.includes(api)) {
        violations.push({
          type: ViolationType.UNAUTHORIZED_API,
          message: `Blocked API detected: ${api}`,
          timestamp: new Date(),
          severity: 'high',
          details: { api }
        })
      }
    })

    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /new\s+Function/,
      /__proto__/,
      /constructor\s*\[/,
      /process\./,
      /require\s*\(/,
      /import\s*\(/
    ]

    dangerousPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        violations.push({
          type: ViolationType.SECURITY_VIOLATION,
          message: `Dangerous code pattern detected: ${pattern}`,
          timestamp: new Date(),
          severity: 'critical',
          details: { pattern: pattern.source }
        })
      }
    })
  }

  private createIsolatedEnvironment(context: SandboxContext, args: Record<string, any>): any {
    const sandbox: any = {
      // Safe globals
      console: {
        log: (...args: any[]) => logger.debug(`[${context.pluginId}]`, ...args),
        warn: (...args: any[]) => logger.warn(`[${context.pluginId}]`, ...args),
        error: (...args: any[]) => logger.error(`[${context.pluginId}]`, ...args)
      },
      JSON,
      Date,
      Math,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      String,
      Number,
      Boolean,
      Array,
      Object,
      RegExp,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ...args
    }

    // Add plugin-specific context
    sandbox.plugin = {
      id: context.plugin.id,
      name: context.plugin.name,
      version: context.plugin.version
    }

    return sandbox
  }

  private async runCode(code: string, sandbox: any, context: SandboxContext): Promise<any> {
    // Create function with limited scope
    const func = new Function(...Object.keys(sandbox), `
      'use strict';
      ${code}
    `)

    // Execute with sandbox values
    return func(...Object.values(sandbox))
  }

  private checkResourceLimits(
    context: SandboxContext,
    memoryUsed: number,
    executionTime: number,
    violations: SandboxViolation[]
  ): void {
    // Check memory limit
    if (memoryUsed > context.config.memoryLimit) {
      violations.push({
        type: ViolationType.MEMORY_LIMIT,
        message: `Memory limit exceeded: ${memoryUsed}MB > ${context.config.memoryLimit}MB`,
        timestamp: new Date(),
        severity: 'high',
        details: { memoryUsed, limit: context.config.memoryLimit }
      })
    }

    // Check timeout
    if (executionTime > context.config.timeoutLimit) {
      violations.push({
        type: ViolationType.TIMEOUT,
        message: `Execution timeout: ${executionTime}ms > ${context.config.timeoutLimit}ms`,
        timestamp: new Date(),
        severity: 'medium',
        details: { executionTime, limit: context.config.timeoutLimit }
      })
    }
  }

  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    this.monitoringInterval = setInterval(() => {
      this.monitorSandboxes()
    }, 5000) // Monitor every 5 seconds
  }

  private monitorSandboxes(): void {
    const now = Date.now()

    this.contexts.forEach((context, pluginId) => {
      if (!context.isActive) return

      // Check for long-running sandboxes
      const runtime = now - context.startTime
      if (runtime > 10 * 60 * 1000) { // 10 minutes
        logger.warn('Long-running sandbox detected', {
          pluginId,
          runtime,
          memoryUsage: context.memoryUsage
        })
      }

      // Emit monitoring event
      this.emit('sandbox:monitor', {
        pluginId,
        runtime,
        memoryUsage: context.memoryUsage,
        violationCount: context.violations.length
      })
    })
  }

  /**
   * Shutdown sandbox manager
   */
  public shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    // Destroy all sandboxes
    const pluginIds = Array.from(this.contexts.keys())
    pluginIds.forEach(pluginId => this.destroySandbox(pluginId))

    logger.info('Plugin sandbox manager shutdown')
  }
}