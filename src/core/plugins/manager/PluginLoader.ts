import fs from 'fs/promises'
import path from 'path'
import { PluginError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginValidator } from './PluginValidator'
import { 
  Plugin, 
  PluginManifest, 
  PluginStatus,
  PluginConfig,
  PluginLoadResult,        // ← Add these
  PluginContext,           // ← Add these
  PluginAPI,               // ← Add these
  PluginLogger,            // ← Add these
  PluginStorage,           // ← Add these
  PluginHookSystem,        // ← Add these
  LoadConfiguration,       // ← Add these
  LoadedPluginModule       // ← Add these
} from '@/core/types/plugin'


/**
 * Plugin Loader - Handles loading and execution of plugins
 */
export class PluginLoader {
  private static instance: PluginLoader
  private validator: PluginValidator
  private loadedModules: Map<string, LoadedPluginModule> = new Map()
  private moduleCache: Map<string, any> = new Map()
  private loadConfiguration: LoadConfiguration
  private pluginsPath: string

  private constructor(config?: Partial<LoadConfiguration>) {
    this.validator = PluginValidator.getInstance()
    this.pluginsPath = path.join(process.cwd(), 'plugins')
    this.loadConfiguration = {
      enableSandbox: true,
      enableValidation: true,
      enableHotReload: false,
      loadTimeout: 30000,
      maxMemoryUsage: 100 * 1024 * 1024, // 100MB
      allowedModules: [
        'fs/promises',
        'path',
        'crypto',
        'util',
        'events',
        'stream'
      ],
      blockedModules: [
        'child_process',
        'cluster',
        'dgram',
        'dns',
        'net',
        'tls',
        'worker_threads'
      ],
      ...config
    }
  }

  public static getInstance(config?: Partial<LoadConfiguration>): PluginLoader {
    if (!PluginLoader.instance) {
      PluginLoader.instance = new PluginLoader(config)
    }
    return PluginLoader.instance
  }

  /**
   * Load plugin from file system
   */
  public async loadPlugin(plugin: Plugin): Promise<PluginLoadResult> {
    const startTime = Date.now()
    
    try {
      logger.info('Loading plugin', { 
        pluginId: plugin.id,
        version: plugin.version,
        path: plugin.installPath 
      })

      // Validate plugin before loading
      if (this.loadConfiguration.enableValidation) {
        await this.validatePluginForLoading(plugin)
      }

      // Check if already loaded
      if (this.loadedModules.has(plugin.id)) {
        const existing = this.loadedModules.get(plugin.id)!
        existing.lastAccess = new Date()
        
        return {
          success: true,
          plugin: existing.plugin,
          loadTime: Date.now() - startTime
        }
      }

      // Load plugin module
      const pluginModule = await this.loadPluginModule(plugin)
      
      // Create plugin context
      const context = await this.createPluginContext(plugin)
      
      // Initialize plugin
      if (pluginModule.initialize && typeof pluginModule.initialize === 'function') {
        await this.executeWithTimeout(
          () => pluginModule.initialize(context),
          this.loadConfiguration.loadTimeout,
          `Plugin ${plugin.id} initialization timeout`
        )
      }

      // Store loaded module
      const loadedModule: LoadedPluginModule = {
        plugin,
        module: pluginModule,
        context,
        loadTime: new Date(),
        lastAccess: new Date(),
        memoryUsage: await this.calculateMemoryUsage(plugin.id),
        errorCount: 0
      }

      this.loadedModules.set(plugin.id, loadedModule)

      logger.info('Plugin loaded successfully', {
        pluginId: plugin.id,
        loadTime: Date.now() - startTime
      })

      return {
        success: true,
        plugin,
        loadTime: Date.now() - startTime
      }

    } catch (error) {
      logger.error('Failed to load plugin', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        loadTime: Date.now() - startTime
      }
    }
  }

  /**
   * Unload plugin
   */
  public async unloadPlugin(pluginId: string): Promise<boolean> {
    try {
      const loadedModule = this.loadedModules.get(pluginId)
      if (!loadedModule) {
        logger.warn('Plugin not loaded, cannot unload', { pluginId })
        return false
      }

      logger.info('Unloading plugin', { pluginId })

      // Call plugin cleanup if available
      if (loadedModule.module.cleanup && typeof loadedModule.module.cleanup === 'function') {
        try {
          await this.executeWithTimeout(
            () => loadedModule.module.cleanup(loadedModule.context),
            this.loadConfiguration.loadTimeout,
            `Plugin ${pluginId} cleanup timeout`
          )
        } catch (error) {
          logger.warn('Plugin cleanup failed', {
            pluginId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      // Remove from loaded modules
      this.loadedModules.delete(pluginId)
      
      // Clear from cache
      this.clearPluginFromCache(pluginId)

      logger.info('Plugin unloaded successfully', { pluginId })
      return true

    } catch (error) {
      logger.error('Failed to unload plugin', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Reload plugin (unload then load)
   */
  public async reloadPlugin(plugin: Plugin): Promise<PluginLoadResult> {
    logger.info('Reloading plugin', { pluginId: plugin.id })
    
    await this.unloadPlugin(plugin.id)
    return await this.loadPlugin(plugin)
  }

  /**
   * Execute plugin function
   */
  public async executePluginFunction(
    pluginId: string,
    functionName: string,
    ...args: any[]
  ): Promise<any> {
    const loadedModule = this.loadedModules.get(pluginId)
    if (!loadedModule) {
      throw new PluginError(`Plugin ${pluginId} is not loaded`, pluginId)
    }

    if (!loadedModule.module[functionName] || typeof loadedModule.module[functionName] !== 'function') {
      throw new PluginError(`Function ${functionName} not found in plugin ${pluginId}`, pluginId)
    }

    try {
      loadedModule.lastAccess = new Date()
      
      const result = await this.executeWithTimeout(
        () => loadedModule.module[functionName](loadedModule.context, ...args),
        this.loadConfiguration.loadTimeout,
        `Plugin ${pluginId} function ${functionName} timeout`
      )

      return result

    } catch (error) {
      loadedModule.errorCount++
      
      logger.error('Plugin function execution failed', {
        pluginId,
        functionName,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      throw error
    }
  }

  /**
   * Validate plugin for loading
   */
  private async validatePluginForLoading(plugin: Plugin): Promise<void> {
    const validationResult = await this.validator.validatePlugin(plugin)
    
    if (!validationResult.valid) {
      const errors = validationResult.errors.map(e => e.message).join(', ')
      throw new PluginError(`Plugin validation failed: ${errors}`, plugin.id)
    }
  }

  /**
   * Load plugin module
   */
  private async loadPluginModule(plugin: Plugin): Promise<any> {
    const mainFile = path.join(plugin.installPath, plugin.manifest.main)
    
    try {
      // Check if main file exists
      await fs.access(mainFile)
      
      // Check cache first
      const cacheKey = `${plugin.id}:${plugin.version}`
      if (this.moduleCache.has(cacheKey)) {
        return this.moduleCache.get(cacheKey)
      }

      // Load module with sandbox if enabled
      let pluginModule: any
      
      if (this.loadConfiguration.enableSandbox) {
        pluginModule = await this.loadWithSandbox(mainFile, plugin)
      } else {
        // Dynamic import for ES modules or require for CommonJS
        if (mainFile.endsWith('.mjs') || plugin.manifest.metadata?.type === 'module') {
          pluginModule = await import(mainFile)
        } else {
          // For CommonJS, we need to handle require differently in this context
          pluginModule = await this.loadCommonJSModule(mainFile)
        }
      }

      // Cache the module
      this.moduleCache.set(cacheKey, pluginModule)
      
      return pluginModule

    } catch (error) {
      throw new PluginError(
        `Failed to load plugin module: ${error instanceof Error ? error.message : 'Unknown error'}`,
        plugin.id
      )
    }
  }

  /**
   * Load CommonJS module
   */
  private async loadCommonJSModule(filePath: string): Promise<any> {
    // Clear require cache to ensure fresh load
    delete require.cache[require.resolve(filePath)]
    
    // Use dynamic require
    return require(filePath)
  }

  /**
   * Load plugin with sandbox (security isolation)
   */
  private async loadWithSandbox(filePath: string, plugin: Plugin): Promise<any> {
    // In a real implementation, this would create a proper sandbox
    // using vm2 or similar sandboxing library
    logger.debug('Loading plugin with sandbox', { 
      pluginId: plugin.id, 
      filePath 
    })

    // For now, perform basic module validation
    const content = await fs.readFile(filePath, 'utf8')
    
    // Check for blocked modules
    for (const blockedModule of this.loadConfiguration.blockedModules) {
      if (content.includes(`require('${blockedModule}')`) || 
          content.includes(`require("${blockedModule}")`) ||
          content.includes(`import ${blockedModule}`) ||
          content.includes(`from '${blockedModule}'`) ||
          content.includes(`from "${blockedModule}"`)) {
        throw new PluginError(
          `Plugin uses blocked module: ${blockedModule}`,
          plugin.id
        )
      }
    }

    // Load the module normally (in production, this would be sandboxed)
    return await this.loadCommonJSModule(filePath)
  }

  /**
   * Create plugin context
   */
  private async createPluginContext(plugin: Plugin): Promise<PluginContext> {
    const context: PluginContext = {
      plugin,
      config: await this.getPluginConfig(plugin.id),
      api: this.createPluginAPI(plugin),
      logger: this.createPluginLogger(plugin),
      storage: this.createPluginStorage(plugin),
      hooks: this.createPluginHookSystem(plugin)
    }

    return context
  }

  /**
   * Get plugin configuration
   */
  private async getPluginConfig(pluginId: string): Promise<PluginConfig> {
    // This would interface with the plugin manager to get configuration
    return {
      id: `config_${pluginId}`,
      pluginId,
      settings: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * Create plugin API interface
   */
  private createPluginAPI(plugin: Plugin): PluginAPI {
    return {
      request: async (method: string, path: string, data?: any) => {
        // Implementation for making API requests
        logger.debug('Plugin API request', { pluginId: plugin.id, method, path })
        return { success: true, data: null }
      },
      
      emit: (event: string, data?: any) => {
        logger.debug('Plugin event emitted', { pluginId: plugin.id, event, data })
      },
      
      subscribe: (event: string, handler: Function) => {
        logger.debug('Plugin subscribed to event', { pluginId: plugin.id, event })
      },
      
      unsubscribe: (event: string, handler: Function) => {
        logger.debug('Plugin unsubscribed from event', { pluginId: plugin.id, event })
      }
    }
  }

  /**
   * Create plugin logger
   */
  private createPluginLogger(plugin: Plugin): PluginLogger {
    return {
      debug: (message: string, meta?: any) => 
        logger.debug(message, { pluginId: plugin.id, ...meta }),
      info: (message: string, meta?: any) => 
        logger.info(message, { pluginId: plugin.id, ...meta }),
      warn: (message: string, meta?: any) => 
        logger.warn(message, { pluginId: plugin.id, ...meta }),
      error: (message: string, meta?: any) => 
        logger.error(message, { pluginId: plugin.id, ...meta })
    }
  }

  /**
   * Create plugin storage interface
   */
  private createPluginStorage(plugin: Plugin): PluginStorage {
    const storagePrefix = `plugin:${plugin.id}:`
    
    return {
      get: async (key: string) => {
        // Implementation would interface with actual storage system
        logger.debug('Plugin storage get', { pluginId: plugin.id, key })
        return null
      },
      
      set: async (key: string, value: any) => {
        logger.debug('Plugin storage set', { pluginId: plugin.id, key })
      },
      
      delete: async (key: string) => {
        logger.debug('Plugin storage delete', { pluginId: plugin.id, key })
        return true
      },
      
      clear: async () => {
        logger.debug('Plugin storage clear', { pluginId: plugin.id })
      },
      
      keys: async () => {
        logger.debug('Plugin storage keys', { pluginId: plugin.id })
        return []
      }
    }
  }

  /**
   * Create plugin hook system
   */
  private createPluginHookSystem(plugin: Plugin): PluginHookSystem {
    return {
      register: (hookName: string, handler: Function) => {
        logger.debug('Plugin hook registered', { pluginId: plugin.id, hookName })
      },
      
      unregister: (hookName: string, handler: Function) => {
        logger.debug('Plugin hook unregistered', { pluginId: plugin.id, hookName })
      },
      
      execute: async (hookName: string, context: any) => {
        logger.debug('Plugin hook executed', { pluginId: plugin.id, hookName })
        return context
      }
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
    errorMessage: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new PluginError(errorMessage, 'loader'))
      }, timeout)

      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer))
    })
  }

  /**
   * Calculate memory usage for plugin
   */
  private async calculateMemoryUsage(pluginId: string): Promise<number> {
    // Simple memory usage calculation
    // In production, this would be more sophisticated
    const memUsage = process.memoryUsage()
    return memUsage.heapUsed
  }

  /**
   * Clear plugin from cache
   */
  private clearPluginFromCache(pluginId: string): void {
    const keysToRemove: string[] = []
    
    for (const key of this.moduleCache.keys()) {
      if (key.startsWith(`${pluginId}:`)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => {
      this.moduleCache.delete(key)
    })
  }

  /**
   * Get loaded plugin
   */
  public getLoadedPlugin(pluginId: string): LoadedPluginModule | null {
    return this.loadedModules.get(pluginId) || null
  }

  /**
   * Get all loaded plugins
   */
  public getLoadedPlugins(): LoadedPluginModule[] {
    return Array.from(this.loadedModules.values())
  }

  /**
   * Check if plugin is loaded
   */
  public isPluginLoaded(pluginId: string): boolean {
    return this.loadedModules.has(pluginId)
  }

  /**
   * Get loader statistics
   */
  public getLoaderStats(): Record<string, any> {
    const loadedPlugins = this.getLoadedPlugins()
    
    return {
      totalLoaded: loadedPlugins.length,
      cacheSize: this.moduleCache.size,
      memoryUsage: loadedPlugins.reduce((sum, p) => sum + p.memoryUsage, 0),
      averageMemoryUsage: loadedPlugins.length > 0 ? 
        loadedPlugins.reduce((sum, p) => sum + p.memoryUsage, 0) / loadedPlugins.length : 0,
      totalErrors: loadedPlugins.reduce((sum, p) => sum + p.errorCount, 0),
      plugins: loadedPlugins.map(p => ({
        id: p.plugin.id,
        version: p.plugin.version,
        loadTime: p.loadTime,
        lastAccess: p.lastAccess,
        memoryUsage: p.memoryUsage,
        errorCount: p.errorCount
      })),
      configuration: this.loadConfiguration
    }
  }

  /**
   * Update load configuration
   */
  public updateConfiguration(config: Partial<LoadConfiguration>): void {
    this.loadConfiguration = { ...this.loadConfiguration, ...config }
    logger.debug('Plugin loader configuration updated', { config: this.loadConfiguration })
  }

  /**
   * Cleanup inactive plugins
   */
  public async cleanupInactivePlugins(maxInactiveTime: number = 3600000): Promise<number> {
    const now = Date.now()
    const toUnload: string[] = []
    
    for (const [pluginId, loadedModule] of this.loadedModules.entries()) {
      const inactiveTime = now - loadedModule.lastAccess.getTime()
      
      if (inactiveTime > maxInactiveTime) {
        toUnload.push(pluginId)
      }
    }

    for (const pluginId of toUnload) {
      await this.unloadPlugin(pluginId)
    }

    if (toUnload.length > 0) {
      logger.info('Cleaned up inactive plugins', { 
        count: toUnload.length,
        plugins: toUnload 
      })
    }

    return toUnload.length
  }

  /**
   * Force garbage collection for plugins
   */
  public forceGarbageCollection(): void {
    if (global.gc) {
      global.gc()
      logger.debug('Forced garbage collection for plugin loader')
    } else {
      logger.warn('Garbage collection not available (run with --expose-gc)')
    }
  }
}