import { EventEmitter } from 'events'
import { 
  Plugin, 
  PluginManifest, 
  PluginStatus, 
  PluginConfig,
  PluginData,
  PluginInstallRequest,
  PluginInstallResponse,
  PluginUpdateRequest,
  PluginCategory
} from '@/core/types/plugin'
import { PluginError, ValidationError, NotFoundError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginInstaller } from './PluginInstaller'
import { PluginUninstaller } from './PluginUninstaller'
import { PluginLoader } from './PluginLoader'
import { PluginValidator } from './PluginValidator'
import { PluginRouter } from '@/core/plugins/api/Router'

/**
 * Plugin system hooks interface
 */
export interface PluginSystemHooks {
  beforeInstall?: (plugin: Plugin) => Promise<boolean>
  afterInstall?: (plugin: Plugin) => Promise<void>
  beforeUninstall?: (pluginId: string) => Promise<boolean>
  afterUninstall?: (pluginId: string) => Promise<void>
  beforeActivate?: (plugin: Plugin) => Promise<boolean>
  afterActivate?: (plugin: Plugin) => Promise<void>
  beforeDeactivate?: (plugin: Plugin) => Promise<boolean>
  afterDeactivate?: (plugin: Plugin) => Promise<void>
}

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
  autoLoadOnStartup: boolean
  enableHotReload: boolean
  enablePluginAPI: boolean
  enableSecurityScan: boolean
  maxPluginsPerCategory: number
  allowSystemPluginManagement: boolean
  dataRetentionDays: number
  backupEnabled: boolean
}

/**
 * Plugin system statistics
 */
export interface PluginSystemStats {
  totalPlugins: number
  activePlugins: number
  inactivePlugins: number
  systemPlugins: number
  userPlugins: number
  pluginsByCategory: Record<PluginCategory, number>
  pluginsByStatus: Record<PluginStatus, number>
  totalSize: number
  averageRating: number
  totalDownloads: number
  errorCount: number
  uptime: number
}

/**
 * Plugin event types
 */
export enum PluginEvent {
  INSTALLED = 'plugin:installed',
  UNINSTALLED = 'plugin:uninstalled',
  ACTIVATED = 'plugin:activated',
  DEACTIVATED = 'plugin:deactivated',
  UPDATED = 'plugin:updated',
  LOADED = 'plugin:loaded',
  UNLOADED = 'plugin:unloaded',
  ERROR = 'plugin:error',
  CONFIG_CHANGED = 'plugin:config_changed'
}

/**
 * Plugin Manager - Central management system for all plugin operations
 */
export class PluginManager extends EventEmitter {
  private static instance: PluginManager
  private config: PluginManagerConfig
  private installer: PluginInstaller
  private uninstaller: PluginUninstaller
  private loader: PluginLoader
  private validator: PluginValidator
  private router: PluginRouter
  
  // Plugin storage
  private plugins: Map<string, Plugin> = new Map()
  private pluginConfigs: Map<string, PluginConfig> = new Map()
  private pluginData: Map<string, Map<string, PluginData>> = new Map()
  private pluginHooks: PluginSystemHooks = {}
  private systemStats: PluginSystemStats
  private startTime: Date

  private constructor(config?: Partial<PluginManagerConfig>) {
    super()
    
    this.config = {
      autoLoadOnStartup: true,
      enableHotReload: false,
      enablePluginAPI: true,
      enableSecurityScan: true,
      maxPluginsPerCategory: 50,
      allowSystemPluginManagement: false,
      dataRetentionDays: 90,
      backupEnabled: true,
      ...config
    }

    this.startTime = new Date()
    this.systemStats = this.initializeStats()
    
    // Initialize components
    this.installer = PluginInstaller.getInstance()
    this.uninstaller = PluginUninstaller.getInstance()
    this.loader = PluginLoader.getInstance()
    this.validator = PluginValidator.getInstance()
    this.router = PluginRouter.getInstance()
    
    this.initializeEventHandlers()
    this.initializeSystemPlugins()
  }

  public static getInstance(config?: Partial<PluginManagerConfig>): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager(config)
    }
    return PluginManager.instance
  }

  /**
   * Initialize plugin system
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing plugin manager')

      // Load existing plugins
      await this.loadExistingPlugins()

      // Auto-load plugins if configured
      if (this.config.autoLoadOnStartup) {
        await this.autoLoadPlugins()
      }

      // Initialize plugin API routes
      if (this.config.enablePluginAPI) {
        await this.initializePluginAPI()
      }

      // Start maintenance tasks
      this.startMaintenanceTasks()

      logger.info('Plugin manager initialized successfully', {
        totalPlugins: this.plugins.size,
        activePlugins: this.getActivePlugins().length
      })

      this.emit(PluginEvent.LOADED, { manager: this })

    } catch (error) {
      logger.error('Failed to initialize plugin manager', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Install plugin
   */
  public async installPlugin(
    request: PluginInstallRequest,
    userId?: string
  ): Promise<PluginInstallResponse> {
    try {
      logger.info('Installing plugin', { source: request.source, userId })

      // Check system limits
      await this.checkSystemLimits()

      // Install plugin
      const result = await this.installer.installPlugin(request, userId)

      if (result.success && result.plugin) {
        // Register plugin
        await this.registerPlugin(result.plugin)

        // Auto-activate if requested
        if (request.autoActivate) {
          await this.activatePlugin(result.plugin.id, userId)
        }

        this.emit(PluginEvent.INSTALLED, { plugin: result.plugin, userId })
        this.updateStats()
      }

      return result

    } catch (error) {
      logger.error('Plugin installation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Uninstall plugin
   */
  public async uninstallPlugin(pluginId: string, userId?: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId)
      if (!plugin) {
        throw new NotFoundError(`Plugin ${pluginId} not found`)
      }

      if (plugin.isSystemPlugin && !this.config.allowSystemPluginManagement) {
        throw new PluginError('Cannot uninstall system plugin', pluginId)
      }

      logger.info('Uninstalling plugin', { pluginId, userId })

      // Deactivate plugin first
      if (plugin.status === PluginStatus.ACTIVE) {
        await this.deactivatePlugin(pluginId, userId)
      }

      // Uninstall plugin
      const success = await this.uninstaller.uninstallPlugin(pluginId, userId)

      if (success) {
        // Unregister plugin
        await this.unregisterPlugin(pluginId)

        this.emit(PluginEvent.UNINSTALLED, { pluginId, userId })
        this.updateStats()
      }

      return success

    } catch (error) {
      logger.error('Plugin uninstallation failed', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Activate plugin
   */
  public async activatePlugin(pluginId: string, userId?: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId)
      if (!plugin) {
        throw new NotFoundError(`Plugin ${pluginId} not found`)
      }

      if (plugin.status === PluginStatus.ACTIVE) {
        logger.warn('Plugin already active', { pluginId })
        return true
      }

      logger.info('Activating plugin', { pluginId, userId })

      // Validate plugin before activation
      if (this.config.enableSecurityScan) {
        const validationResult = await this.validator.validatePlugin(plugin)
        if (!validationResult.valid) {
          throw new ValidationError(`Plugin validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`)
        }
      }

      // Execute before activation hooks
      const shouldActivate = await this.executeHook('beforeActivate', plugin)
      if (!shouldActivate) {
        throw new PluginError('Plugin activation blocked by hook', pluginId)
      }

      // Load plugin
      const loadResult = await this.loader.loadPlugin(plugin)
      if (!loadResult.success) {
        throw new PluginError(`Failed to load plugin: ${loadResult.error}`, pluginId)
      }

      // Register plugin routes
      await this.router.registerPluginRoutes(plugin)

      // Update plugin status
      plugin.status = PluginStatus.ACTIVE
      plugin.lastActivatedAt = new Date()
      this.plugins.set(pluginId, plugin)

      // Execute after activation hooks
      await this.executeHook('afterActivate', plugin)

      logger.info('Plugin activated successfully', { pluginId })
      this.emit(PluginEvent.ACTIVATED, { plugin, userId })
      this.updateStats()

      return true

    } catch (error) {
      logger.error('Plugin activation failed', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Deactivate plugin
   */
  public async deactivatePlugin(pluginId: string, userId?: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId)
      if (!plugin) {
        throw new NotFoundError(`Plugin ${pluginId} not found`)
      }

      if (plugin.status !== PluginStatus.ACTIVE) {
        logger.warn('Plugin not active', { pluginId })
        return true
      }

      logger.info('Deactivating plugin', { pluginId, userId })

      // Execute before deactivation hooks
      const shouldDeactivate = await this.executeHook('beforeDeactivate', plugin)
      if (!shouldDeactivate) {
        throw new PluginError('Plugin deactivation blocked by hook', pluginId)
      }

      // Unregister plugin routes
      this.router.unregisterPluginRoutes(pluginId)

      // Unload plugin
      await this.loader.unloadPlugin(pluginId)

      // Update plugin status
      plugin.status = PluginStatus.INACTIVE
      this.plugins.set(pluginId, plugin)

      // Execute after deactivation hooks
      await this.executeHook('afterDeactivate', plugin)

      logger.info('Plugin deactivated successfully', { pluginId })
      this.emit(PluginEvent.DEACTIVATED, { plugin, userId })
      this.updateStats()

      return true

    } catch (error) {
      logger.error('Plugin deactivation failed', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Update plugin
   */
  public async updatePlugin(
    request: PluginUpdateRequest,
    userId?: string
  ): Promise<PluginInstallResponse> {
    try {
      const plugin = this.plugins.get(request.pluginId)
      if (!plugin) {
        throw new NotFoundError(`Plugin ${request.pluginId} not found`)
      }

      logger.info('Updating plugin', { pluginId: request.pluginId, userId })

      // Create backup if enabled
      if (this.config.backupEnabled) {
        await this.createPluginBackup(plugin)
      }

      // Convert update request to install request
      const installRequest: PluginInstallRequest = {
        source: request.source || plugin.manifest.metadata?.source,
        url: request.url,
        file: request.file,
        autoActivate: plugin.status === PluginStatus.ACTIVE
      }

      // Deactivate current version
      if (plugin.status === PluginStatus.ACTIVE) {
        await this.deactivatePlugin(plugin.id, userId)
      }

      // Install new version
      const result = await this.installPlugin(installRequest, userId)

      if (result.success && result.plugin) {
        this.emit(PluginEvent.UPDATED, { 
          oldPlugin: plugin, 
          newPlugin: result.plugin, 
          userId 
        })
      }

      return result

    } catch (error) {
      logger.error('Plugin update failed', {
        pluginId: request.pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Get plugin by ID
   */
  public async getPlugin(pluginId: string): Promise<Plugin | null> {
    return this.plugins.get(pluginId) || null
  }

  /**
   * Get all plugins
   */
  public async getAllPlugins(): Promise<Plugin[]> {
    return Array.from(this.plugins.values())
  }

  /**
   * Get active plugins
   */
  public getActivePlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter(p => p.status === PluginStatus.ACTIVE)
  }

  /**
   * Get plugins by category
   */
  public getPluginsByCategory(category: PluginCategory): Plugin[] {
    return Array.from(this.plugins.values()).filter(p => p.category === category)
  }

  /**
   * Check if plugin is active
   */
  public async isPluginActive(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId)
    return plugin?.status === PluginStatus.ACTIVE || false
  }

  /**
   * Get plugin configuration
   */
  public async getPluginConfig(pluginId: string): Promise<PluginConfig | null> {
    return this.pluginConfigs.get(pluginId) || null
  }

  /**
   * Set plugin configuration
   */
  public async setPluginConfig(
    pluginId: string,
    settings: Record<string, any>,
    userId?: string
  ): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      throw new NotFoundError(`Plugin ${pluginId} not found`)
    }

    const config: PluginConfig = {
      id: `config_${pluginId}`,
      pluginId,
      settings,
      isActive: plugin.status === PluginStatus.ACTIVE,
      userId,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.pluginConfigs.set(pluginId, config)

    logger.info('Plugin configuration updated', { pluginId, userId })
    this.emit(PluginEvent.CONFIG_CHANGED, { plugin, config, userId })
  }

  /**
   * Get plugin data
   */
  public async getPluginData(
    pluginId: string,
    key: string,
    userId?: string
  ): Promise<any> {
    const pluginData = this.pluginData.get(pluginId)
    if (!pluginData) return null

    const dataKey = userId ? `${userId}:${key}` : `global:${key}`
    const data = pluginData.get(dataKey)
    
    return data?.value || null
  }

  /**
   * Set plugin data
   */
  public async setPluginData(
    pluginId: string,
    key: string,
    value: any,
    userId?: string,
    isGlobal: boolean = false
  ): Promise<void> {
    let pluginData = this.pluginData.get(pluginId)
    if (!pluginData) {
      pluginData = new Map()
      this.pluginData.set(pluginId, pluginData)
    }

    const dataKey = isGlobal || !userId ? `global:${key}` : `${userId}:${key}`
    const data: PluginData = {
      id: `data_${pluginId}_${dataKey}`,
      pluginId,
      key,
      value,
      userId: isGlobal ? undefined : userId,
      isGlobal,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    pluginData.set(dataKey, data)

    logger.debug('Plugin data updated', { pluginId, key, isGlobal, userId })
  }

  /**
   * Register plugin with system
   */
  public async registerPlugin(plugin: Plugin): Promise<void> {
    this.plugins.set(plugin.id, plugin)
    
    // Initialize plugin data storage
    if (!this.pluginData.has(plugin.id)) {
      this.pluginData.set(plugin.id, new Map())
    }

    logger.info('Plugin registered', { pluginId: plugin.id })
  }

  /**
   * Unregister plugin from system
   */
  public async unregisterPlugin(pluginId: string): Promise<void> {
    this.plugins.delete(pluginId)
    this.pluginConfigs.delete(pluginId)
    this.pluginData.delete(pluginId)
    
    logger.info('Plugin unregistered', { pluginId })
  }

  /**
   * Get system statistics
   */
  public getSystemStats(): PluginSystemStats {
    this.updateStats()
    return { ...this.systemStats }
  }

  /**
   * Initialize event handlers
   */
  private initializeEventHandlers(): void {
    // Handle loader events
    this.loader.on('error', (error: any) => {
      this.emit(PluginEvent.ERROR, error)
    })

    // Handle installer events
    this.installer.on('progress', (progress: any) => {
      this.emit('installation:progress', progress)
    })
  }

  /**
   * Initialize system plugins
   */
  private async initializeSystemPlugins(): Promise<void> {
    // This would load built-in system plugins
    logger.debug('Initializing system plugins')
  }

  /**
   * Load existing plugins from storage
   */
  private async loadExistingPlugins(): Promise<void> {
    // This would load plugins from database or file system
    logger.debug('Loading existing plugins')
  }

  /**
   * Auto-load plugins on startup
   */
  private async autoLoadPlugins(): Promise<void> {
    const plugins = Array.from(this.plugins.values())
    const activePlugins = plugins.filter(p => p.status === PluginStatus.ACTIVE)

    for (const plugin of activePlugins) {
      try {
        await this.loader.loadPlugin(plugin)
        await this.router.registerPluginRoutes(plugin)
        logger.info('Auto-loaded plugin', { pluginId: plugin.id })
      } catch (error) {
        logger.error('Failed to auto-load plugin', {
          pluginId: plugin.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  /**
   * Initialize plugin API
   */
  private async initializePluginAPI(): Promise<void> {
    // Initialize API routes for plugin management
    logger.debug('Initializing plugin API')
  }

  /**
   * Start maintenance tasks
   */
  private startMaintenanceTasks(): void {
    // Cleanup inactive plugins every hour
    setInterval(async () => {
      await this.cleanupInactivePlugins()
    }, 3600000)

    // Update statistics every 5 minutes
    setInterval(() => {
      this.updateStats()
    }, 300000)

    // Cleanup old data based on retention policy
    setInterval(async () => {
      await this.cleanupOldData()
    }, 86400000) // Daily
  }

  /**
   * Check system limits
   */
  private async checkSystemLimits(): Promise<void> {
    const totalPlugins = this.plugins.size
    const systemPlugins = Array.from(this.plugins.values()).filter(p => p.isSystemPlugin).length
    const userPlugins = totalPlugins - systemPlugins

    // Check category limits
    const categoryCounts: Record<string, number> = {}
    for (const plugin of this.plugins.values()) {
      if (!plugin.isSystemPlugin) {
        categoryCounts[plugin.category] = (categoryCounts[plugin.category] || 0) + 1
      }
    }

    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count >= this.config.maxPluginsPerCategory) {
        throw new PluginError(
          `Maximum plugins per category exceeded for ${category} (${count}/${this.config.maxPluginsPerCategory})`,
          'system'
        )
      }
    }
  }

  /**
   * Execute plugin hooks
   */
  private async executeHook(hookName: string, plugin: Plugin): Promise<boolean> {
    const hookFunction = this.pluginHooks[hookName as keyof PluginSystemHooks]
    if (hookFunction && typeof hookFunction === 'function') {
      try {
        return await hookFunction(plugin)
      } catch (error) {
        logger.error('Plugin hook execution failed', {
          hook: hookName,
          pluginId: plugin.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        return false
      }
    }
    return true
  }

  /**
   * Create plugin backup
   */
  private async createPluginBackup(plugin: Plugin): Promise<void> {
    // Implementation would create a backup of the plugin
    logger.debug('Creating plugin backup', { pluginId: plugin.id })
  }

  /**
   * Cleanup inactive plugins
   */
  private async cleanupInactivePlugins(): Promise<void> {
    const cleanedCount = await this.loader.cleanupInactivePlugins()
    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive plugins', { count: cleanedCount })
    }
  }

  /**
   * Cleanup old data
   */
  private async cleanupOldData(): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.dataRetentionDays)

    // Cleanup old plugin data
    let removedCount = 0
    for (const [pluginId, dataMap] of this.pluginData.entries()) {
      const keysToRemove: string[] = []
      
      for (const [key, data] of dataMap.entries()) {
        if (data.createdAt < cutoffDate) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach(key => {
        dataMap.delete(key)
        removedCount++
      })
    }

    if (removedCount > 0) {
      logger.info('Cleaned up old plugin data', { removedCount })
    }
  }

  /**
   * Initialize system statistics
   */
  private initializeStats(): PluginSystemStats {
    return {
      totalPlugins: 0,
      activePlugins: 0,
      inactivePlugins: 0,
      systemPlugins: 0,
      userPlugins: 0,
      pluginsByCategory: {} as Record<PluginCategory, number>,
      pluginsByStatus: {} as Record<PluginStatus, number>,
      totalSize: 0,
      averageRating: 0,
      totalDownloads: 0,
      errorCount: 0,
      uptime: 0
    }
  }

  /**
   * Update system statistics
   */
  private updateStats(): void {
    const plugins = Array.from(this.plugins.values())
    
    this.systemStats = {
      totalPlugins: plugins.length,
      activePlugins: plugins.filter(p => p.status === PluginStatus.ACTIVE).length,
      inactivePlugins: plugins.filter(p => p.status === PluginStatus.INACTIVE).length,
      systemPlugins: plugins.filter(p => p.isSystemPlugin).length,
      userPlugins: plugins.filter(p => !p.isSystemPlugin).length,
      pluginsByCategory: this.getPluginsByCategory(),
      pluginsByStatus: this.getPluginsByStatus(),
      totalSize: plugins.reduce((sum, p) => sum + p.size, 0),
      averageRating: plugins.reduce((sum, p) => sum + p.rating, 0) / (plugins.length || 1),
      totalDownloads: plugins.reduce((sum, p) => sum + p.downloadCount, 0),
      errorCount: 0, // This would be tracked from actual errors
      uptime: Date.now() - this.startTime.getTime()
    }
  }

  /**
   * Get plugins by category stats
   */
  private getPluginsByCategory(): Record<PluginCategory, number> {
    const stats: Record<PluginCategory, number> = {} as Record<PluginCategory, number>
    
    for (const plugin of this.plugins.values()) {
      stats[plugin.category] = (stats[plugin.category] || 0) + 1
    }
    
    return stats
  }

  /**
   * Get plugins by status stats
   */
  private getPluginsByStatus(): Record<PluginStatus, number> {
    const stats: Record<PluginStatus, number> = {} as Record<PluginStatus, number>
    
    for (const plugin of this.plugins.values()) {
      stats[plugin.status] = (stats[plugin.status] || 0) + 1
    }
    
    return stats
  }

  /**
   * Shutdown plugin manager
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down plugin manager')

    // Deactivate all active plugins
    const activePlugins = this.getActivePlugins()
    for (const plugin of activePlugins) {
      try {
        await this.deactivatePlugin(plugin.id)
      } catch (error) {
        logger.error('Failed to deactivate plugin during shutdown', {
          pluginId: plugin.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Clear all data
    this.plugins.clear()
    this.pluginConfigs.clear()
    this.pluginData.clear()

    logger.info('Plugin manager shutdown completed')
  }
}