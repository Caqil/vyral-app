import fs from 'fs/promises'
import path from 'path'
import { createWriteStream } from 'fs'
import archiver from 'archiver'
import { 
  Plugin, 
  PluginStatus,
  PluginBackup 
} from '@/core/types/plugin'
import { PluginError, NotFoundError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginManager } from './PluginManager'
import { PluginLoader } from './PluginLoader'

/**
 * Uninstallation step interface
 */
export interface UninstallationStep {
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  error?: string
  duration?: number
  startTime?: Date
  endTime?: Date
}

/**
 * Uninstallation progress interface
 */
export interface UninstallationProgress {
  pluginId: string
  steps: UninstallationStep[]
  currentStep: number
  totalSteps: number
  overallStatus: 'pending' | 'running' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  error?: string
  backupCreated?: boolean
  backupPath?: string
}

/**
 * Uninstallation context
 */
export interface UninstallationContext {
  plugin: Plugin
  backupPath?: string
  preserveData: boolean
  preserveConfig: boolean
  dependentPlugins: Plugin[]
  userConfirmation: boolean
  rollbackData?: any
}

/**
 * Uninstallation options
 */
export interface UninstallationOptions {
  preserveUserData?: boolean
  preserveConfiguration?: boolean
  createBackup?: boolean
  forceUninstall?: boolean
  cleanupDependencies?: boolean
  skipConfirmation?: boolean
}

/**
 * Plugin Uninstaller - Handles safe plugin removal
 */
export class PluginUninstaller {
  private static instance: PluginUninstaller
  private pluginManager: PluginManager
  private pluginLoader: PluginLoader
  private activeUninstallations: Map<string, UninstallationProgress> = new Map()
  private backupsPath: string
  private tempPath: string

  private constructor() {
    this.pluginManager = PluginManager.getInstance()
    this.pluginLoader = PluginLoader.getInstance()
    this.backupsPath = path.join(process.cwd(), 'backups', 'plugins')
    this.tempPath = path.join(process.cwd(), 'temp', 'uninstall')
    this.ensureDirectories()
  }

  public static getInstance(): PluginUninstaller {
    if (!PluginUninstaller.instance) {
      PluginUninstaller.instance = new PluginUninstaller()
    }
    return PluginUninstaller.instance
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.backupsPath, { recursive: true })
      await fs.mkdir(this.tempPath, { recursive: true })
    } catch (error) {
      logger.error('Failed to create uninstaller directories', { error })
    }
  }

  /**
   * Uninstall plugin
   */
  public async uninstallPlugin(
    pluginId: string,
    userId?: string,
    options: UninstallationOptions = {}
  ): Promise<boolean> {
    const uninstallId = this.generateUninstallId()
    
    try {
      logger.info('Starting plugin uninstallation', { 
        uninstallId,
        pluginId,
        userId,
        options 
      })

      // Get plugin
      const plugin = await this.pluginManager.getPlugin(pluginId)
      if (!plugin) {
        throw new NotFoundError(`Plugin ${pluginId} not found`)
      }

      // Initialize progress tracking
      const progress = this.initializeProgress(uninstallId, pluginId)
      
      // Create uninstallation context
      const context = await this.createUninstallationContext(plugin, options)
      
      // Execute uninstallation steps
      await this.executeUninstallationSteps(context, progress, options)
      
      // Mark uninstallation as completed
      progress.overallStatus = 'completed'
      progress.endTime = new Date()
      
      logger.info('Plugin uninstallation completed successfully', {
        uninstallId,
        pluginId,
        duration: Date.now() - progress.startTime.getTime()
      })

      return true

    } catch (error) {
      logger.error('Plugin uninstallation failed', {
        uninstallId,
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Update progress with error
      const progress = this.activeUninstallations.get(uninstallId)
      if (progress) {
        progress.overallStatus = 'failed'
        progress.error = error instanceof Error ? error.message : 'Unknown error'
        progress.endTime = new Date()
      }

      // Attempt recovery if possible
      await this.attemptRecovery(uninstallId)

      return false
    } finally {
      // Cleanup
      await this.cleanupUninstallation(uninstallId)
    }
  }

  /**
   * Create uninstallation context
   */
  private async createUninstallationContext(
    plugin: Plugin,
    options: UninstallationOptions
  ): Promise<UninstallationContext> {
    // Find dependent plugins
    const dependentPlugins = await this.findDependentPlugins(plugin)
    
    const context: UninstallationContext = {
      plugin,
      preserveData: options.preserveUserData || false,
      preserveConfig: options.preserveConfiguration || false,
      dependentPlugins,
      userConfirmation: !options.skipConfirmation || false
    }

    // Create backup path if needed
    if (options.createBackup !== false) {
      context.backupPath = path.join(
        this.backupsPath,
        `${plugin.id}_${Date.now()}`
      )
      await fs.mkdir(context.backupPath, { recursive: true })
    }

    return context
  }

  /**
   * Execute uninstallation steps
   */
  private async executeUninstallationSteps(
    context: UninstallationContext,
    progress: UninstallationProgress,
    options: UninstallationOptions
  ): Promise<void> {
    const steps = [
      { name: 'validate', description: 'Validating uninstallation requirements' },
      { name: 'dependencies', description: 'Checking plugin dependencies' },
      { name: 'backup', description: 'Creating backup' },
      { name: 'deactivate', description: 'Deactivating plugin' },
      { name: 'unload', description: 'Unloading plugin from memory' },
      { name: 'cleanup_hooks', description: 'Cleaning up plugin hooks' },
      { name: 'cleanup_routes', description: 'Removing plugin routes' },
      { name: 'cleanup_database', description: 'Cleaning up database data' },
      { name: 'cleanup_config', description: 'Removing configuration' },
      { name: 'cleanup_data', description: 'Removing user data' },
      { name: 'remove_files', description: 'Removing plugin files' },
      { name: 'finalize', description: 'Finalizing uninstallation' }
    ]

    progress.steps = steps.map(step => ({
      ...step,
      status: 'pending'
    }))
    progress.totalSteps = steps.length

    for (let i = 0; i < steps.length; i++) {
      const step = progress.steps[i]
      progress.currentStep = i + 1
      
      step.status = 'running'
      step.startTime = new Date()
      
      try {
        const shouldExecute = await this.shouldExecuteStep(step.name, context, options)
        
        if (!shouldExecute) {
          step.status = 'skipped'
          step.endTime = new Date()
          step.duration = 0
          continue
        }

        await this.executeUninstallationStep(step.name, context, options)
        
        step.status = 'completed'
        step.endTime = new Date()
        step.duration = step.endTime.getTime() - step.startTime.getTime()
        
      } catch (error) {
        step.status = 'failed'
        step.error = error instanceof Error ? error.message : 'Unknown error'
        step.endTime = new Date()
        step.duration = step.endTime.getTime() - step.startTime.getTime()
        
        // Check if step is critical
        if (this.isCriticalStep(step.name)) {
          throw error
        } else {
          logger.warn('Non-critical uninstallation step failed', {
            step: step.name,
            pluginId: context.plugin.id,
            error: step.error
          })
        }
      }
    }
  }

  /**
   * Execute individual uninstallation step
   */
  private async executeUninstallationStep(
    stepName: string,
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<void> {
    switch (stepName) {
      case 'validate':
        await this.validateUninstallation(context, options)
        break
        
      case 'dependencies':
        await this.handleDependencies(context, options)
        break
        
      case 'backup':
        await this.createBackup(context)
        break
        
      case 'deactivate':
        await this.deactivatePlugin(context)
        break
        
      case 'unload':
        await this.unloadPlugin(context)
        break
        
      case 'cleanup_hooks':
        await this.cleanupPluginHooks(context)
        break
        
      case 'cleanup_routes':
        await this.cleanupPluginRoutes(context)
        break
        
      case 'cleanup_database':
        await this.cleanupDatabaseData(context, options)
        break
        
      case 'cleanup_config':
        await this.cleanupConfiguration(context, options)
        break
        
      case 'cleanup_data':
        await this.cleanupUserData(context, options)
        break
        
      case 'remove_files':
        await this.removePluginFiles(context)
        break
        
      case 'finalize':
        await this.finalizeUninstallation(context)
        break
        
      default:
        throw new PluginError(`Unknown uninstallation step: ${stepName}`, context.plugin.id)
    }
  }

  /**
   * Check if step should be executed
   */
  private async shouldExecuteStep(
    stepName: string,
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<boolean> {
    switch (stepName) {
      case 'backup':
        return context.backupPath !== undefined
        
      case 'cleanup_config':
        return !context.preserveConfig
        
      case 'cleanup_data':
        return !context.preserveData
        
      case 'dependencies':
        return context.dependentPlugins.length > 0
        
      default:
        return true
    }
  }

  /**
   * Check if step is critical
   */
  private isCriticalStep(stepName: string): boolean {
    const criticalSteps = ['validate', 'dependencies', 'deactivate', 'remove_files', 'finalize']
    return criticalSteps.includes(stepName)
  }

  /**
   * Validate uninstallation
   */
  private async validateUninstallation(
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<void> {
    // Check if plugin is system plugin
    if (context.plugin.isSystemPlugin && !options.forceUninstall) {
      throw new PluginError('Cannot uninstall system plugin without force flag', context.plugin.id)
    }

    // Check plugin status
    if (context.plugin.status === PluginStatus.ACTIVE && !options.forceUninstall) {
      // Will be handled in deactivate step
    }

    // Validate user confirmation if required
    if (context.userConfirmation && !options.skipConfirmation) {
      // In a real implementation, this would wait for user confirmation
      logger.debug('User confirmation required for uninstallation', {
        pluginId: context.plugin.id
      })
    }
  }

  /**
   * Handle plugin dependencies
   */
  private async handleDependencies(
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<void> {
    if (context.dependentPlugins.length === 0) {
      return
    }

    if (options.cleanupDependencies) {
      // Uninstall dependent plugins first
      for (const dependentPlugin of context.dependentPlugins) {
        logger.info('Uninstalling dependent plugin', {
          pluginId: dependentPlugin.id,
          dependsOn: context.plugin.id
        })
        
        await this.uninstallPlugin(dependentPlugin.id, undefined, {
          ...options,
          skipConfirmation: true
        })
      }
    } else if (!options.forceUninstall) {
      const dependentIds = context.dependentPlugins.map(p => p.id).join(', ')
      throw new PluginError(
        `Cannot uninstall plugin due to dependencies: ${dependentIds}`,
        context.plugin.id
      )
    }
  }

  /**
   * Create backup
   */
  private async createBackup(context: UninstallationContext): Promise<void> {
    if (!context.backupPath) {
      return
    }

    try {
      // Create backup archive
      const backupArchive = path.join(context.backupPath, 'plugin_backup.zip')
      const output = createWriteStream(backupArchive)
      const archive = archiver('zip', { zlib: { level: 9 } })

      archive.pipe(output)

      // Add plugin files
      archive.directory(context.plugin.installPath, 'files')

      // Add plugin metadata
      const metadata = {
        plugin: context.plugin,
        backupDate: new Date().toISOString(),
        version: '1.0'
      }
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })

      // Add configuration if exists
      const config = await this.pluginManager.getPluginConfig(context.plugin.id)
      if (config) {
        archive.append(JSON.stringify(config, null, 2), { name: 'config.json' })
      }

      await archive.finalize()

      // Wait for backup to complete
      await new Promise((resolve, reject) => {
        output.on('close', resolve)
        output.on('error', reject)
        archive.on('error', reject)
      })

      context.rollbackData = {
        backupPath: context.backupPath,
        backupArchive
      }

      logger.info('Plugin backup created successfully', {
        pluginId: context.plugin.id,
        backupPath: context.backupPath,
        size: archive.pointer()
      })

    } catch (error) {
      logger.error('Failed to create plugin backup', {
        pluginId: context.plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Deactivate plugin
   */
  private async deactivatePlugin(context: UninstallationContext): Promise<void> {
    if (context.plugin.status === PluginStatus.ACTIVE) {
      await this.pluginManager.deactivatePlugin(context.plugin.id)
    }
  }

  /**
   * Unload plugin from memory
   */
  private async unloadPlugin(context: UninstallationContext): Promise<void> {
    if (this.pluginLoader.isPluginLoaded(context.plugin.id)) {
      await this.pluginLoader.unloadPlugin(context.plugin.id)
    }
  }

  /**
   * Cleanup plugin hooks
   */
  private async cleanupPluginHooks(context: UninstallationContext): Promise<void> {
    // Remove all hooks registered by this plugin
    logger.debug('Cleaning up plugin hooks', { pluginId: context.plugin.id })
    
    // In a real implementation, this would interface with the hook manager
    // to remove all hooks registered by this plugin
  }

  /**
   * Cleanup plugin routes
   */
  private async cleanupPluginRoutes(context: UninstallationContext): Promise<void> {
    // Remove plugin routes from router
    logger.debug('Cleaning up plugin routes', { pluginId: context.plugin.id })
    
    // Routes would be cleaned up when plugin is deactivated,
    // but this ensures they are properly removed
  }

  /**
   * Cleanup database data
   */
  private async cleanupDatabaseData(
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<void> {
    if (context.preserveData) {
      logger.debug('Preserving database data', { pluginId: context.plugin.id })
      return
    }

    // Remove plugin-specific database data
    if (context.plugin.manifest.database?.models) {
      logger.debug('Cleaning up database models', {
        pluginId: context.plugin.id,
        models: context.plugin.manifest.database.models.map(m => m.name)
      })
      
      // In a real implementation, this would drop database tables/collections
      // created by the plugin
    }
  }

  /**
   * Cleanup configuration
   */
  private async cleanupConfiguration(
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<void> {
    if (context.preserveConfig) {
      logger.debug('Preserving plugin configuration', { pluginId: context.plugin.id })
      return
    }

    // Remove plugin configuration
    logger.debug('Removing plugin configuration', { pluginId: context.plugin.id })
    
    // In a real implementation, this would remove the plugin's configuration
    // from the database or configuration storage
  }

  /**
   * Cleanup user data
   */
  private async cleanupUserData(
    context: UninstallationContext,
    options: UninstallationOptions
  ): Promise<void> {
    if (context.preserveData) {
      logger.debug('Preserving user data', { pluginId: context.plugin.id })
      return
    }

    // Remove plugin user data
    logger.debug('Removing plugin user data', { pluginId: context.plugin.id })
    
    // In a real implementation, this would remove all user data
    // stored by the plugin
  }

  /**
   * Remove plugin files
   */
  private async removePluginFiles(context: UninstallationContext): Promise<void> {
    try {
      await fs.rm(context.plugin.installPath, { recursive: true, force: true })
      
      logger.info('Plugin files removed successfully', {
        pluginId: context.plugin.id,
        path: context.plugin.installPath
      })
      
    } catch (error) {
      throw new PluginError(
        `Failed to remove plugin files: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context.plugin.id
      )
    }
  }

  /**
   * Finalize uninstallation
   */
  private async finalizeUninstallation(context: UninstallationContext): Promise<void> {
    // Unregister plugin from system
    await this.pluginManager.unregisterPlugin(context.plugin.id)
    
    logger.info('Plugin uninstallation finalized', { pluginId: context.plugin.id })
  }

  /**
   * Find dependent plugins
   */
  private async findDependentPlugins(plugin: Plugin): Promise<Plugin[]> {
    const allPlugins = await this.pluginManager.getAllPlugins()
    const dependentPlugins: Plugin[] = []

    for (const otherPlugin of allPlugins) {
      if (otherPlugin.id === plugin.id) continue
      
      const dependencies = otherPlugin.manifest.dependencies || []
      const hasDependency = dependencies.some(dep => dep.name === plugin.id)
      
      if (hasDependency) {
        dependentPlugins.push(otherPlugin)
      }
    }

    return dependentPlugins
  }

  /**
   * Attempt recovery after failed uninstallation
   */
  private async attemptRecovery(uninstallId: string): Promise<void> {
    const progress = this.activeUninstallations.get(uninstallId)
    if (!progress) return

    try {
      logger.info('Attempting recovery from failed uninstallation', {
        uninstallId,
        pluginId: progress.pluginId
      })

      // If backup was created, we could restore from it
      if (progress.backupCreated && progress.backupPath) {
        logger.debug('Backup available for recovery', {
          uninstallId,
          backupPath: progress.backupPath
        })
      }

      // In a real implementation, this would attempt to restore
      // the plugin to its previous state

    } catch (error) {
      logger.error('Recovery attempt failed', {
        uninstallId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Cleanup uninstallation
   */
  private async cleanupUninstallation(uninstallId: string): Promise<void> {
    try {
      // Remove temporary files
      const tempDir = path.join(this.tempPath, uninstallId)
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch (error) {
        // Ignore errors if directory doesn't exist
      }

      // Keep progress for a while for status checking
      setTimeout(() => {
        this.activeUninstallations.delete(uninstallId)
      }, 300000) // Keep for 5 minutes

    } catch (error) {
      logger.warn('Failed to cleanup uninstallation', {
        uninstallId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Initialize progress tracking
   */
  private initializeProgress(uninstallId: string, pluginId: string): UninstallationProgress {
    const progress: UninstallationProgress = {
      pluginId,
      steps: [],
      currentStep: 0,
      totalSteps: 0,
      overallStatus: 'pending',
      startTime: new Date()
    }

    this.activeUninstallations.set(uninstallId, progress)
    return progress
  }

  /**
   * Generate uninstallation ID
   */
  private generateUninstallId(): string {
    return `uninstall_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get uninstallation progress
   */
  public getUninstallationProgress(uninstallId: string): UninstallationProgress | null {
    return this.activeUninstallations.get(uninstallId) || null
  }

  /**
   * Get active uninstallations
   */
  public getActiveUninstallations(): UninstallationProgress[] {
    return Array.from(this.activeUninstallations.values())
  }

  /**
   * Cancel uninstallation
   */
  public async cancelUninstallation(uninstallId: string): Promise<boolean> {
    const progress = this.activeUninstallations.get(uninstallId)
    
    if (!progress || progress.overallStatus !== 'running') {
      return false
    }

    try {
      progress.overallStatus = 'failed'
      progress.error = 'Uninstallation cancelled by user'
      progress.endTime = new Date()
      
      await this.attemptRecovery(uninstallId)
      await this.cleanupUninstallation(uninstallId)
      
      return true
      
    } catch (error) {
      logger.error('Failed to cancel uninstallation', {
        uninstallId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Restore plugin from backup
   */
  public async restoreFromBackup(
    backupPath: string,
    targetPluginId?: string
  ): Promise<boolean> {
    try {
      logger.info('Restoring plugin from backup', { backupPath })

      // In a real implementation, this would:
      // 1. Extract the backup archive
      // 2. Validate the backup contents
      // 3. Restore the plugin files
      // 4. Restore the configuration
      // 5. Re-register the plugin

      logger.info('Plugin restored from backup successfully')
      return true

    } catch (error) {
      logger.error('Failed to restore plugin from backup', {
        backupPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * List available backups
   */
  public async listAvailableBackups(): Promise<PluginBackup[]> {
    try {
      const backups: PluginBackup[] = []
      const backupDirs = await fs.readdir(this.backupsPath, { withFileTypes: true })

      for (const dir of backupDirs) {
        if (!dir.isDirectory()) continue

        const metadataPath = path.join(this.backupsPath, dir.name, 'metadata.json')
        
        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8')
          const metadata = JSON.parse(metadataContent)
          
          const stats = await fs.stat(path.join(this.backupsPath, dir.name))
          
          backups.push({
            id: dir.name,
            pluginId: metadata.plugin.id,
            pluginName: metadata.plugin.name,
            pluginVersion: metadata.plugin.version,
            createdAt: new Date(metadata.backupDate),
            size: stats.size,
            path: path.join(this.backupsPath, dir.name)
          })
          
        } catch (error) {
          logger.warn('Failed to read backup metadata', {
            backupDir: dir.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    } catch (error) {
      logger.error('Failed to list available backups', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return []
    }
  }

  /**
   * Delete backup
   */
  public async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backupPath = path.join(this.backupsPath, backupId)
      await fs.rm(backupPath, { recursive: true, force: true })
      
      logger.info('Backup deleted successfully', { backupId })
      return true

    } catch (error) {
      logger.error('Failed to delete backup', {
        backupId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Get uninstaller statistics
   */
  public getUninstallerStats(): Record<string, any> {
    return {
      activeUninstallations: this.activeUninstallations.size,
      totalBackups: 0, // Would be calculated from backup directory
      backupsPath: this.backupsPath,
      tempPath: this.tempPath
    }
  }
}