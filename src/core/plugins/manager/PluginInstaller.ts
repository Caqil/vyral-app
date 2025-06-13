import fs from 'fs/promises'
import path from 'path'
import { createWriteStream, createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import unzipper from 'unzipper'
// Note: If you need TAR support, install the 'tar' package: npm install tar @types/tar
// import tar from 'tar'
import { 
  Plugin,
  PluginManifest,
  PluginInstallRequest,
  PluginInstallResponse,
  PluginSource,
  PluginStatus,
  PluginDependency,
  DependencyType
} from '@/core/types/plugin'
import { PluginError, ValidationError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { PluginValidator } from './PluginValidator'
import { PluginManager } from './PluginManager'

/**
 * Installation step interface
 */
export interface InstallationStep {
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  error?: string
  duration?: number
  startTime?: Date
  endTime?: Date
}

/**
 * Installation progress interface
 */
export interface InstallationProgress {
  pluginId: string
  steps: InstallationStep[]
  currentStep: number
  totalSteps: number
  overallStatus: 'pending' | 'running' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  error?: string
}

/**
 * Installation context
 */
export interface InstallationContext {
  pluginId: string
  tempDir: string
  extractDir: string
  installDir: string
  manifest: PluginManifest
  dependencies: PluginDependency[]
  backupDir?: string
  rollbackData?: any
}

/**
 * Plugin Installer - Handles plugin installation process
 */
export class PluginInstaller {
  private static instance: PluginInstaller
  private pluginManager: PluginManager
  private validator: PluginValidator
  private pluginsPath: string
  private tempPath: string
  private activeInstallations: Map<string, InstallationProgress> = new Map()
  private installationQueue: Map<string, InstallationContext> = new Map()

  private constructor() {
    this.pluginManager = PluginManager.getInstance()
    this.validator = PluginValidator.getInstance()
    this.pluginsPath = path.join(process.cwd(), 'plugins')
    this.tempPath = path.join(process.cwd(), 'temp', 'plugins')
    this.ensureDirectories()
  }

  public static getInstance(): PluginInstaller {
    if (!PluginInstaller.instance) {
      PluginInstaller.instance = new PluginInstaller()
    }
    return PluginInstaller.instance
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.pluginsPath, { recursive: true })
      await fs.mkdir(this.tempPath, { recursive: true })
    } catch (error) {
      logger.error('Failed to create plugin directories', { error })
    }
  }

  /**
   * Install plugin from request
   */
  public async installPlugin(
    request: PluginInstallRequest,
    userId?: string
  ): Promise<PluginInstallResponse> {
    const installId = this.generateInstallId()
    
    try {
      logger.info('Starting plugin installation', { 
        installId,
        source: request.source,
        userId 
      })

      // Initialize progress tracking
      const progress = this.initializeProgress(installId)
      
      // Create installation context
      const context = await this.createInstallationContext(request, installId)
      
      // Execute installation steps
      await this.executeInstallationSteps(context, progress)
      
      // Mark installation as completed
      progress.overallStatus = 'completed'
      progress.endTime = new Date()
      
      // Get installed plugin
      const plugin = await this.pluginManager.getPlugin(context.pluginId)
      
      logger.info('Plugin installation completed successfully', {
        installId,
        pluginId: context.pluginId,
        duration: Date.now() - progress.startTime.getTime()
      })

      return {
        success: true,
        plugin: plugin || undefined
      }

    } catch (error) {
      logger.error('Plugin installation failed', {
        installId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Update progress with error
      const progress = this.activeInstallations.get(installId)
      if (progress) {
        progress.overallStatus = 'failed'
        progress.error = error instanceof Error ? error.message : 'Unknown error'
        progress.endTime = new Date()
      }

      // Attempt rollback
      await this.rollbackInstallation(installId)

      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    } finally {
      // Cleanup
      await this.cleanupInstallation(installId)
    }
  }

  /**
   * Create installation context
   */
  private async createInstallationContext(
    request: PluginInstallRequest,
    installId: string
  ): Promise<InstallationContext> {
    const tempDir = path.join(this.tempPath, installId)
    const extractDir = path.join(tempDir, 'extract')
    
    await fs.mkdir(tempDir, { recursive: true })
    await fs.mkdir(extractDir, { recursive: true })

    // Extract plugin archive
    const extractedPath = await this.extractPlugin(request, extractDir)
    
    // Load and validate manifest
    const manifest = await this.loadManifest(extractedPath)
    
    const context: InstallationContext = {
      pluginId: manifest.name,
      tempDir,
      extractDir: extractedPath,
      installDir: path.join(this.pluginsPath, manifest.name),
      manifest,
      dependencies: manifest.dependencies || []
    }

    return context
  }

  /**
   * Execute installation steps
   */
  private async executeInstallationSteps(
    context: InstallationContext,
    progress: InstallationProgress
  ): Promise<void> {
    const steps = [
      { name: 'validate', description: 'Validating plugin structure and security' },
      { name: 'dependencies', description: 'Checking and installing dependencies' },
      { name: 'backup', description: 'Creating backup for rollback' },
      { name: 'install', description: 'Installing plugin files' },
      { name: 'configure', description: 'Configuring plugin settings' },
      { name: 'database', description: 'Running database migrations' },
      { name: 'register', description: 'Registering plugin with system' },
      { name: 'activate', description: 'Activating plugin (if requested)' }
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
        await this.executeInstallationStep(step.name, context)
        
        step.status = 'completed'
        step.endTime = new Date()
        step.duration = step.endTime.getTime() - step.startTime.getTime()
        
      } catch (error) {
        step.status = 'failed'
        step.error = error instanceof Error ? error.message : 'Unknown error'
        step.endTime = new Date()
        step.duration = step.endTime.getTime() - step.startTime.getTime()
        
        throw error
      }
    }
  }

  /**
   * Execute individual installation step
   */
  private async executeInstallationStep(
    stepName: string,
    context: InstallationContext
  ): Promise<void> {
    switch (stepName) {
      case 'validate':
        await this.validatePlugin(context)
        break
        
      case 'dependencies':
        await this.checkAndInstallDependencies(context)
        break
        
      case 'backup':
        await this.createBackup(context)
        break
        
      case 'install':
        await this.installPluginFiles(context)
        break
        
      case 'configure':
        await this.configurePlugin(context)
        break
        
      case 'database':
        await this.runDatabaseMigrations(context)
        break
        
      case 'register':
        await this.registerPlugin(context)
        break
        
      case 'activate':
        await this.activatePlugin(context)
        break
        
      default:
        throw new PluginError(`Unknown installation step: ${stepName}`, context.pluginId)
    }
  }

  /**
   * Extract plugin archive
   */
  private async extractPlugin(
    request: PluginInstallRequest,
    extractDir: string
  ): Promise<string> {
    switch (request.source) {
      case PluginSource.FILE:
        if (!request.file) {
          throw new PluginError('No file provided for file source', 'installer')
        }
        return await this.extractFromFile(request.file, extractDir)
        
      case PluginSource.URL:
        if (!request.url) {
          throw new PluginError('No URL provided for URL source', 'installer')
        }
        return await this.extractFromUrl(request.url, extractDir)
        
      case PluginSource.MARKETPLACE:
        throw new PluginError('Marketplace installation not yet implemented', 'installer')
        
      default:
        throw new PluginError(`Unsupported plugin source: ${request.source}`, 'installer')
    }
  }

  /**
   * Extract plugin from file
   */
  private async extractFromFile(file: File | Buffer, extractDir: string): Promise<string> {
    try {
      let buffer: Buffer
      
      if (file instanceof File) {
        buffer = Buffer.from(await file.arrayBuffer())
      } else {
        buffer = file
      }

      // Determine file type and extract accordingly
      const isZip = buffer.slice(0, 4).toString('hex') === '504b0304'
      const isTar = buffer.slice(257, 262).toString() === 'ustar'

      if (isZip) {
        return await this.extractZip(buffer, extractDir)
      } else if (isTar) {
        return await this.extractTar(buffer, extractDir)
      } else {
        throw new PluginError('Unsupported archive format. Please use ZIP format.', 'installer')
      }

    } catch (error) {
      throw new PluginError(
        `Failed to extract plugin: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'installer'
      )
    }
  }

  /**
   * Extract plugin from URL
   */
  private async extractFromUrl(url: string, extractDir: string): Promise<string> {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      return await this.extractFromFile(buffer, extractDir)

    } catch (error) {
      throw new PluginError(
        `Failed to download plugin: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'installer'
      )
    }
  }

  /**
   * Extract ZIP archive
   */
  private async extractZip(buffer: Buffer, extractDir: string): Promise<string> {
    const directory = await unzipper.Open.buffer(buffer)
    
    for (const file of directory.files) {
      if (file.type === 'Directory') {
        await fs.mkdir(path.join(extractDir, file.path), { recursive: true })
      } else {
        const filePath = path.join(extractDir, file.path)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await pipeline(file.stream(), createWriteStream(filePath))
      }
    }

    return extractDir
  }

  /**
   * Extract TAR archive
   */
  private async extractTar(buffer: Buffer, extractDir: string): Promise<string> {
    // Note: This requires the 'tar' package to be installed
    // Run: npm install tar @types/tar
    throw new PluginError('TAR extraction not implemented. Please install tar package or use ZIP format.', 'installer')
    
    /* Uncomment this code after installing tar package:
    return new Promise((resolve, reject) => {
      const stream = tar.extract({
        cwd: extractDir,
        strict: true,
        filter: (path) => {
          // Security check: prevent path traversal
          return !path.includes('..')
        }
      })

      stream.on('error', reject)
      stream.on('end', () => resolve(extractDir))
      
      stream.write(buffer)
      stream.end()
    })
    */
  }

  /**
   * Load plugin manifest
   */
  private async loadManifest(extractDir: string): Promise<PluginManifest> {
    const manifestPath = path.join(extractDir, 'plugin.json')
    
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf8')
      const manifest = JSON.parse(manifestContent) as PluginManifest
      
      // Validate basic manifest structure
      if (!manifest.name || !manifest.version) {
        throw new ValidationError('Invalid manifest: missing name or version')
      }
      
      return manifest
      
    } catch (error) {
      throw new PluginError(
        `Failed to load manifest: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'installer'
      )
    }
  }

  /**
   * Validate plugin
   */
  private async validatePlugin(context: InstallationContext): Promise<void> {
    // Create temporary plugin object for validation
    const tempPlugin: Plugin = {
      id: context.manifest.name,
      name: context.manifest.name,
      displayName: context.manifest.displayName,
      description: context.manifest.description,
      version: context.manifest.version,
      author: context.manifest.author,
      license: context.manifest.license,
      category: context.manifest.category,
      tags: context.manifest.tags,
      manifest: context.manifest,
      status: PluginStatus.INACTIVE,
      isSystemPlugin: false,
      installPath: context.extractDir,
      size: 0,
      downloadCount: 0,
      rating: 0,
      reviewCount: 0,
      installedAt: new Date(),
      updatedAt: new Date()
    }

    const validationResult = await this.validator.validatePlugin(tempPlugin)
    
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors.map(e => e.message).join(', ')
      throw new ValidationError(`Plugin validation failed: ${errorMessages}`)
    }
  }

  /**
   * Check and install dependencies
   */
  private async checkAndInstallDependencies(context: InstallationContext): Promise<void> {
    if (!context.dependencies || context.dependencies.length === 0) {
      return
    }

    for (const dependency of context.dependencies) {
      await this.checkDependency(dependency, context)
    }
  }

  /**
   * Check individual dependency
   */
  private async checkDependency(
    dependency: PluginDependency,
    context: InstallationContext
  ): Promise<void> {
    switch (dependency.type) {
      case DependencyType.PLUGIN:
        await this.checkPluginDependency(dependency, context)
        break
        
      case DependencyType.SYSTEM:
        await this.checkSystemDependency(dependency, context)
        break
        
      case DependencyType.NPM:
        await this.checkNpmDependency(dependency, context)
        break
        
      default:
        if (dependency.required) {
          throw new PluginError(
            `Unsupported dependency type: ${dependency.type}`,
            context.pluginId
          )
        }
    }
  }

  /**
   * Check plugin dependency
   */
  private async checkPluginDependency(
    dependency: PluginDependency,
    context: InstallationContext
  ): Promise<void> {
    const dependentPlugin = await this.pluginManager.getPlugin(dependency.name)
    
    if (!dependentPlugin) {
      if (dependency.required) {
        throw new PluginError(
          `Required plugin dependency not found: ${dependency.name}`,
          context.pluginId
        )
      }
      return
    }

    // Check version compatibility
    if (!this.isVersionCompatible(dependentPlugin.version, dependency.version)) {
      throw new PluginError(
        `Plugin dependency version mismatch: ${dependency.name} (required: ${dependency.version}, found: ${dependentPlugin.version})`,
        context.pluginId
      )
    }
  }

  /**
   * Check system dependency
   */
  private async checkSystemDependency(
    dependency: PluginDependency,
    context: InstallationContext
  ): Promise<void> {
    // Check Node.js version, platform, etc.
    if (dependency.name === 'node' && dependency.version) {
      const nodeVersion = process.version
      if (!this.isVersionCompatible(nodeVersion, dependency.version)) {
        throw new PluginError(
          `Node.js version mismatch: required ${dependency.version}, found ${nodeVersion}`,
          context.pluginId
        )
      }
    }
  }

  /**
   * Check NPM dependency
   */
  private async checkNpmDependency(
    dependency: PluginDependency,
    context: InstallationContext
  ): Promise<void> {
    // In a real implementation, this would check if NPM packages are available
    // For now, we'll just log it
    logger.debug('NPM dependency check', {
      name: dependency.name,
      version: dependency.version,
      required: dependency.required
    })
  }

  /**
   * Check version compatibility
   */
  private isVersionCompatible(currentVersion: string, requiredVersion: string): boolean {
    // Simple version comparison - in production, use semver library
    const current = currentVersion.replace(/^v/, '').split('.').map(Number)
    const required = requiredVersion.replace(/^v/, '').split('.').map(Number)
    
    for (let i = 0; i < Math.max(current.length, required.length); i++) {
      const c = current[i] || 0
      const r = required[i] || 0
      
      if (c > r) return true
      if (c < r) return false
    }
    
    return true
  }

  /**
   * Create backup
   */
  private async createBackup(context: InstallationContext): Promise<void> {
    // Check if plugin already exists
    const existingPlugin = await this.pluginManager.getPlugin(context.pluginId)
    
    if (existingPlugin) {
      const backupDir = path.join(this.tempPath, 'backups', context.pluginId)
      await fs.mkdir(backupDir, { recursive: true })
      
      // Copy existing plugin files
      await this.copyDirectory(existingPlugin.installPath, backupDir)
      
      context.backupDir = backupDir
      context.rollbackData = {
        plugin: existingPlugin,
        backupPath: backupDir
      }
    }
  }

  /**
   * Install plugin files
   */
  private async installPluginFiles(context: InstallationContext): Promise<void> {
    await fs.mkdir(path.dirname(context.installDir), { recursive: true })
    
    // Remove existing installation if it exists
    try {
      await fs.rm(context.installDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
    
    // Copy plugin files to installation directory
    await this.copyDirectory(context.extractDir, context.installDir)
  }

  /**
   * Configure plugin
   */
  private async configurePlugin(context: InstallationContext): Promise<void> {
    // Set default configuration if settings are defined
    if (context.manifest.settings) {
      const defaultConfig: Record<string, any> = {}
      
      for (const setting of context.manifest.settings) {
        if (setting.default !== undefined) {
          defaultConfig[setting.key] = setting.default
        }
      }
      
      await this.pluginManager.setPluginConfig(context.pluginId, defaultConfig)
    }
  }

  /**
   * Run database migrations
   */
  private async runDatabaseMigrations(context: InstallationContext): Promise<void> {
    if (context.manifest.database?.migrations) {
      // In a real implementation, this would run database migrations
      logger.debug('Running database migrations', {
        pluginId: context.pluginId,
        migrations: context.manifest.database.migrations
      })
    }
  }

  /**
   * Register plugin with system
   */
  private async registerPlugin(context: InstallationContext): Promise<void> {
    const plugin: Plugin = {
      id: context.manifest.name,
      name: context.manifest.name,
      displayName: context.manifest.displayName,
      description: context.manifest.description,
      version: context.manifest.version,
      author: context.manifest.author,
      license: context.manifest.license,
      category: context.manifest.category,
      tags: context.manifest.tags,
      manifest: context.manifest,
      status: PluginStatus.INACTIVE,
      isSystemPlugin: false,
      installPath: context.installDir,
      size: await this.calculateDirectorySize(context.installDir),
      downloadCount: 0,
      rating: 0,
      reviewCount: 0,
      installedAt: new Date(),
      updatedAt: new Date()
    }

    await this.pluginManager.registerPlugin(plugin)
  }

  /**
   * Activate plugin if requested
   */
  private async activatePlugin(context: InstallationContext): Promise<void> {
    // This would be implemented based on the activation request
    // For now, we'll just log it
    logger.debug('Plugin activation step', { pluginId: context.pluginId })
  }

  /**
   * Rollback installation
   */
  private async rollbackInstallation(installId: string): Promise<void> {
    const context = this.installationQueue.get(installId)
    if (!context) return

    try {
      logger.info('Rolling back plugin installation', {
        installId,
        pluginId: context.pluginId
      })

      // Remove installed files
      try {
        await fs.rm(context.installDir, { recursive: true, force: true })
      } catch (error) {
        logger.warn('Failed to remove installed files during rollback', { error })
      }

      // Restore backup if it exists
      if (context.backupDir && context.rollbackData) {
        await this.copyDirectory(context.backupDir, context.installDir)
        await this.pluginManager.registerPlugin(context.rollbackData.plugin)
      }

      logger.info('Installation rollback completed', { installId })

    } catch (error) {
      logger.error('Failed to rollback installation', {
        installId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Cleanup installation
   */
  private async cleanupInstallation(installId: string): Promise<void> {
    try {
      const context = this.installationQueue.get(installId)
      
      if (context) {
        // Remove temporary directory
        await fs.rm(context.tempDir, { recursive: true, force: true })
        
        // Remove backup if installation was successful
        if (context.backupDir) {
          await fs.rm(context.backupDir, { recursive: true, force: true })
        }
        
        this.installationQueue.delete(installId)
      }
      
      // Remove from active installations after a delay
      setTimeout(() => {
        this.activeInstallations.delete(installId)
      }, 300000) // Keep for 5 minutes for status checking

    } catch (error) {
      logger.warn('Failed to cleanup installation', {
        installId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    
    const entries = await fs.readdir(src, { withFileTypes: true })
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath)
      } else {
        await fs.copyFile(srcPath, destPath)
      }
    }
  }

  /**
   * Calculate directory size
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        
        if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath)
        } else {
          const stats = await fs.stat(fullPath)
          totalSize += stats.size
        }
      }
    } catch (error) {
      logger.warn('Failed to calculate directory size', { dirPath, error })
    }
    
    return totalSize
  }

  /**
   * Initialize progress tracking
   */
  private initializeProgress(installId: string): InstallationProgress {
    const progress: InstallationProgress = {
      pluginId: '',
      steps: [],
      currentStep: 0,
      totalSteps: 0,
      overallStatus: 'pending',
      startTime: new Date()
    }

    this.activeInstallations.set(installId, progress)
    return progress
  }

  /**
   * Generate installation ID
   */
  private generateInstallId(): string {
    return `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get installation progress
   */
  public getInstallationProgress(installId: string): InstallationProgress | null {
    return this.activeInstallations.get(installId) || null
  }

  /**
   * Get active installations
   */
  public getActiveInstallations(): InstallationProgress[] {
    return Array.from(this.activeInstallations.values())
  }

  /**
   * Cancel installation
   */
  public async cancelInstallation(installId: string): Promise<boolean> {
    const progress = this.activeInstallations.get(installId)
    
    if (!progress || progress.overallStatus !== 'running') {
      return false
    }

    try {
      progress.overallStatus = 'failed'
      progress.error = 'Installation cancelled by user'
      progress.endTime = new Date()
      
      await this.rollbackInstallation(installId)
      await this.cleanupInstallation(installId)
      
      return true
      
    } catch (error) {
      logger.error('Failed to cancel installation', {
        installId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }
}