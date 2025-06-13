import fs from 'fs/promises'
import path from 'path'
import semver from 'semver'
import { 
  Plugin, 
  PluginManifest, 
  PluginPermission, 
  PluginDependency,
  PluginSetting,
  PluginRoute,
  HTTPMethod,
  DependencyType,
  PermissionScope,
  SettingType
} from '@/core/types/plugin'
import { PluginError, ValidationError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'

/**
 * Validation error interface
 */
export interface ValidationErrorDetail {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  field?: string
  suggestion?: string
  line?: number
  column?: number
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationErrorDetail[]
  warnings: ValidationErrorDetail[]
  score: number
  metadata: ValidationMetadata
}

/**
 * Validation metadata
 */
export interface ValidationMetadata {
  validatedAt: Date
  validatorVersion: string
  checksPerformed: string[]
  duration: number
  fileCount: number
  totalSize: number
  securityScore?: number
  performanceScore?: number
  compatibilityScore?: number
}

/**
 * Validator configuration
 */
export interface ValidatorConfig {
  enableSecurityScan: boolean
  enablePerformanceCheck: boolean
  enableCompatibilityCheck: boolean
  strictMode: boolean
  allowedFileTypes: string[]
  maxFileSize: number
  maxTotalSize: number
  requiredFields: string[]
  blockedPatterns: string[]
  allowedPermissions: string[]
  maxDependencies: number
  validateCode: boolean
  validateManifest: boolean
  validatePermissions: boolean
  validateDependencies: boolean
  validateSettings: boolean
  validateRoutes: boolean
  validateAssets: boolean
}

/**
 * File validation result
 */
export interface FileValidationResult {
  path: string
  valid: boolean
  errors: ValidationErrorDetail[]
  warnings: ValidationErrorDetail[]
  size: number
  type: string
  encoding?: string
}

/**
 * Security scan result
 */
export interface SecurityScanResult {
  safe: boolean
  score: number
  issues: SecurityIssue[]
  recommendations: string[]
}

/**
 * Security issue
 */
export interface SecurityIssue {
  type: 'vulnerability' | 'suspicious' | 'dangerous' | 'deprecated'
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  file?: string
  line?: number
  code?: string
  cve?: string
  recommendation?: string
}

/**
 * Plugin Validator - Comprehensive plugin validation system
 */
export class PluginValidator {
  private static instance: PluginValidator
  private config: ValidatorConfig
  private validatorVersion: string = '1.0.0'
  private customValidators: Map<string, Function> = new Map()
  private validationCache: Map<string, ValidationResult> = new Map()

  private constructor(config?: Partial<ValidatorConfig>) {
    this.config = {
      enableSecurityScan: true,
      enablePerformanceCheck: true,
      enableCompatibilityCheck: true,
      strictMode: false,
      allowedFileTypes: [
        '.js', '.ts', '.jsx', '.tsx', '.json', '.css', '.scss', 
        '.html', '.md', '.txt', '.png', '.jpg', '.jpeg', '.gif', 
        '.svg', '.ico', '.woff', '.woff2', '.ttf'
      ],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxTotalSize: 100 * 1024 * 1024, // 100MB
      requiredFields: ['name', 'version', 'description', 'author', 'license'],
      blockedPatterns: [
        'eval(',
        'Function(',
        'process.exit',
        '__dirname',
        '__filename',
        'require.cache',
        'global.'
      ],
      allowedPermissions: [],
      maxDependencies: 50,
      validateCode: true,
      validateManifest: true,
      validatePermissions: true,
      validateDependencies: true,
      validateSettings: true,
      validateRoutes: true,
      validateAssets: true,
      ...config
    }

    this.initializeBuiltInValidators()
  }

  public static getInstance(config?: Partial<ValidatorConfig>): PluginValidator {
    if (!PluginValidator.instance) {
      PluginValidator.instance = new PluginValidator(config)
    }
    return PluginValidator.instance
  }

  /**
   * Initialize built-in validators
   */
  private initializeBuiltInValidators(): void {
    // Register custom validators
    this.registerValidator('manifest', this.validateManifestStructure.bind(this))
    this.registerValidator('permissions', this.validatePermissions.bind(this))
    this.registerValidator('dependencies', this.validateDependencies.bind(this))
    this.registerValidator('settings', this.validateSettings.bind(this))
    this.registerValidator('routes', this.validateAPIRoutes.bind(this))
    this.registerValidator('files', this.validateFileSystem.bind(this))
    this.registerValidator('security', this.performSecurityScan.bind(this))
  }

  /**
   * Register custom validator
   */
  public registerValidator(name: string, validator: Function): void {
    this.customValidators.set(name, validator)
    logger.debug('Custom validator registered', { name })
  }

  /**
   * Unregister custom validator
   */
  public unregisterValidator(name: string): boolean {
    const removed = this.customValidators.delete(name)
    if (removed) {
      logger.debug('Custom validator unregistered', { name })
    }
    return removed
  }

  /**
   * Validate plugin comprehensively
   */
  public async validatePlugin(plugin: Plugin): Promise<ValidationResult> {
    const startTime = Date.now()
    const cacheKey = `${plugin.id}:${plugin.version}:${plugin.updatedAt.getTime()}`
    
    // Check cache
    if (this.validationCache.has(cacheKey)) {
      logger.debug('Returning cached validation result', { pluginId: plugin.id })
      return this.validationCache.get(cacheKey)!
    }

    logger.info('Starting comprehensive plugin validation', {
      pluginId: plugin.id,
      version: plugin.version,
      path: plugin.installPath
    })

    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      score: 100,
      metadata: {
        validatedAt: new Date(),
        validatorVersion: this.validatorVersion,
        checksPerformed: [],
        duration: 0,
        fileCount: 0,
        totalSize: 0
      }
    }

    try {
      // 1. Basic plugin structure validation
      await this.validateBasicStructure(plugin, result)
      result.metadata.checksPerformed.push('basic_structure')

      // 2. Manifest validation
      if (this.config.validateManifest) {
        await this.validateManifest(plugin.manifest, result)
        result.metadata.checksPerformed.push('manifest')
      }

      // 3. File system validation
      await this.validateFileSystem(plugin.installPath, result)
      result.metadata.checksPerformed.push('file_system')

      // 4. Dependencies validation
      if (this.config.validateDependencies) {
        await this.validateDependencies(plugin.manifest, result)
        result.metadata.checksPerformed.push('dependencies')
      }

      // 5. Permissions validation
      if (this.config.validatePermissions) {
        await this.validatePermissions(plugin.manifest, result)
        result.metadata.checksPerformed.push('permissions')
      }

      // 6. API routes validation
      if (this.config.validateRoutes) {
        await this.validateAPIRoutes(plugin.manifest, result)
        result.metadata.checksPerformed.push('api_routes')
      }

      // 7. Settings validation
      if (this.config.validateSettings) {
        await this.validateSettings(plugin.manifest, result)
        result.metadata.checksPerformed.push('settings')
      }

      // 8. Assets validation
      if (this.config.validateAssets) {
        await this.validateAssets(plugin.manifest, plugin.installPath, result)
        result.metadata.checksPerformed.push('assets')
      }

      // 9. Security scan
      if (this.config.enableSecurityScan) {
        await this.performSecurityScan(plugin, result)
        result.metadata.checksPerformed.push('security_scan')
      }

      // 10. Performance check
      if (this.config.enablePerformanceCheck) {
        await this.performPerformanceCheck(plugin, result)
        result.metadata.checksPerformed.push('performance_check')
      }

      // 11. Compatibility check
      if (this.config.enableCompatibilityCheck) {
        await this.performCompatibilityCheck(plugin, result)
        result.metadata.checksPerformed.push('compatibility_check')
      }

      // 12. Run custom validators
      await this.runCustomValidators(plugin, result)
      result.metadata.checksPerformed.push('custom_validators')

      // Calculate final validation score
      this.calculateValidationScore(result)

      // Determine if plugin is valid
      result.valid = result.errors.length === 0

      // Update metadata
      result.metadata.duration = Date.now() - startTime

      // Cache result
      this.validationCache.set(cacheKey, result)

      logger.info('Plugin validation completed', {
        pluginId: plugin.id,
        valid: result.valid,
        score: result.score,
        errors: result.errors.length,
        warnings: result.warnings.length,
        duration: result.metadata.duration
      })

      return result

    } catch (error) {
      logger.error('Plugin validation failed', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      result.errors.push({
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
        suggestion: 'Check plugin structure and try again'
      })

      result.valid = false
      result.score = 0
      result.metadata.duration = Date.now() - startTime

      return result
    }
  }

  /**
   * Validate basic plugin structure
   */
  private async validateBasicStructure(plugin: Plugin, result: ValidationResult): Promise<void> {
    // Check if plugin directory exists
    try {
      const stats = await fs.stat(plugin.installPath)
      if (!stats.isDirectory()) {
        result.errors.push({
          code: 'INVALID_STRUCTURE',
          message: 'Plugin path is not a directory',
          severity: 'error',
          field: 'installPath'
        })
      }
    } catch (error) {
      result.errors.push({
        code: 'PATH_NOT_FOUND',
        message: 'Plugin installation path not found',
        severity: 'error',
        field: 'installPath'
      })
    }

    // Check main file exists
    const mainFile = path.join(plugin.installPath, plugin.manifest.main)
    try {
      await fs.access(mainFile)
    } catch (error) {
      result.errors.push({
        code: 'MAIN_FILE_MISSING',
        message: `Main file not found: ${plugin.manifest.main}`,
        severity: 'error',
        field: 'main',
        suggestion: 'Ensure the main file specified in manifest exists'
      })
    }

    // Check plugin.json exists
    const manifestFile = path.join(plugin.installPath, 'plugin.json')
    try {
      await fs.access(manifestFile)
    } catch (error) {
      result.warnings.push({
        code: 'MANIFEST_FILE_MISSING',
        message: 'plugin.json file not found in plugin directory',
        severity: 'warning',
        suggestion: 'Add plugin.json file for better validation'
      })
    }
  }

  /**
   * Validate plugin manifest
   */
  private async validateManifest(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    // Check required fields
    for (const field of this.config.requiredFields) {
      if (!manifest[field as keyof PluginManifest]) {
        result.errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          message: `Required field missing: ${field}`,
          severity: 'error',
          field,
          suggestion: `Add ${field} to plugin manifest`
        })
      }
    }

    // Validate version format
    if (manifest.version && !semver.valid(manifest.version)) {
      result.errors.push({
        code: 'INVALID_VERSION_FORMAT',
        message: `Invalid version format: ${manifest.version}`,
        severity: 'error',
        field: 'version',
        suggestion: 'Use semantic versioning (e.g., 1.0.0)'
      })
    }

    // Validate main file extension
    if (manifest.main) {
      const ext = path.extname(manifest.main)
      if (!['.js', '.ts', '.mjs'].includes(ext)) {
        result.warnings.push({
          code: 'UNUSUAL_MAIN_FILE',
          message: `Unusual main file extension: ${ext}`,
          severity: 'warning',
          field: 'main',
          suggestion: 'Use .js, .ts, or .mjs for main file'
        })
      }
    }

    // Validate license
    if (manifest.license) {
      const commonLicenses = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'ISC']
      if (!commonLicenses.includes(manifest.license) && !manifest.license.startsWith('SEE LICENSE')) {
        result.warnings.push({
          code: 'UNCOMMON_LICENSE',
          message: `Uncommon license: ${manifest.license}`,
          severity: 'warning',
          field: 'license',
          suggestion: 'Consider using a standard license identifier'
        })
      }
    }

    // Validate tags
    if (manifest.tags && manifest.tags.length > 10) {
      result.warnings.push({
        code: 'TOO_MANY_TAGS',
        message: `Too many tags: ${manifest.tags.length}`,
        severity: 'warning',
        field: 'tags',
        suggestion: 'Limit tags to 10 or fewer'
      })
    }
  }

  /**
   * Validate file system
   */
  private async validateFileSystem(installPath: string, result: ValidationResult): Promise<void> {
    try {
      const fileValidation = await this.validateDirectory(installPath)
      
      result.metadata.fileCount = fileValidation.fileCount
      result.metadata.totalSize = fileValidation.totalSize

      // Check total size
      if (fileValidation.totalSize > this.config.maxTotalSize) {
        result.errors.push({
          code: 'PLUGIN_TOO_LARGE',
          message: `Plugin size exceeds limit: ${fileValidation.totalSize} bytes`,
          severity: 'error',
          suggestion: `Reduce plugin size to under ${this.config.maxTotalSize} bytes`
        })
      }

      // Check for suspicious files
      for (const file of fileValidation.files) {
        const ext = path.extname(file.path)
        
        if (!this.config.allowedFileTypes.includes(ext)) {
          result.warnings.push({
            code: 'UNUSUAL_FILE_TYPE',
            message: `Unusual file type: ${file.path}`,
            severity: 'warning',
            suggestion: 'Ensure all files are necessary for plugin functionality'
          })
        }

        if (file.size > this.config.maxFileSize) {
          result.warnings.push({
            code: 'LARGE_FILE',
            message: `Large file detected: ${file.path} (${file.size} bytes)`,
            severity: 'warning',
            suggestion: 'Consider optimizing or splitting large files'
          })
        }
      }

    } catch (error) {
      result.errors.push({
        code: 'FILE_SYSTEM_ERROR',
        message: `File system validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      })
    }
  }

  /**
   * Validate directory recursively
   */
  private async validateDirectory(dirPath: string): Promise<{
    fileCount: number
    totalSize: number
    files: Array<{ path: string; size: number }>
  }> {
    const files: Array<{ path: string; size: number }> = []
    let totalSize = 0

    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const subDirResult = await this.validateDirectory(fullPath)
        files.push(...subDirResult.files)
        totalSize += subDirResult.totalSize
      } else {
        const stats = await fs.stat(fullPath)
        files.push({ path: fullPath, size: stats.size })
        totalSize += stats.size
      }
    }

    return {
      fileCount: files.length,
      totalSize,
      files
    }
  }

  /**
   * Validate plugin dependencies
   */
  private async validateDependencies(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.dependencies || manifest.dependencies.length === 0) {
      return
    }

    if (manifest.dependencies.length > this.config.maxDependencies) {
      result.warnings.push({
        code: 'TOO_MANY_DEPENDENCIES',
        message: `Too many dependencies: ${manifest.dependencies.length}`,
        severity: 'warning',
        field: 'dependencies',
        suggestion: `Limit dependencies to ${this.config.maxDependencies} or fewer`
      })
    }

    for (const dependency of manifest.dependencies) {
      // Validate dependency structure
      if (!dependency.name || !dependency.version) {
        result.errors.push({
          code: 'INVALID_DEPENDENCY',
          message: 'Dependency missing name or version',
          severity: 'error',
          field: 'dependencies'
        })
        continue
      }

      // Validate version format
      if (!semver.validRange(dependency.version)) {
        result.errors.push({
          code: 'INVALID_DEPENDENCY_VERSION',
          message: `Invalid dependency version: ${dependency.name}@${dependency.version}`,
          severity: 'error',
          field: 'dependencies',
          suggestion: 'Use valid semver range for dependency version'
        })
      }

      // Check dependency type
      if (!Object.values(DependencyType).includes(dependency.type)) {
        result.errors.push({
          code: 'INVALID_DEPENDENCY_TYPE',
          message: `Invalid dependency type: ${dependency.type}`,
          severity: 'error',
          field: 'dependencies'
        })
      }
    }
  }

  /**
   * Validate plugin permissions
   */
  private async validatePermissions(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.permissions || manifest.permissions.length === 0) {
      return
    }

    for (const permission of manifest.permissions) {
      // Validate permission structure
      if (!permission.name || !permission.description) {
        result.errors.push({
          code: 'INVALID_PERMISSION',
          message: 'Permission missing name or description',
          severity: 'error',
          field: 'permissions'
        })
        continue
      }

      // Check if permission is allowed
      if (this.config.allowedPermissions.length > 0 && 
          !this.config.allowedPermissions.includes(permission.name)) {
        result.errors.push({
          code: 'UNAUTHORIZED_PERMISSION',
          message: `Unauthorized permission: ${permission.name}`,
          severity: 'error',
          field: 'permissions',
          suggestion: 'Remove unauthorized permissions or request approval'
        })
      }

      // Validate scope
      if (!Object.values(PermissionScope).includes(permission.scope)) {
        result.errors.push({
          code: 'INVALID_PERMISSION_SCOPE',
          message: `Invalid permission scope: ${permission.scope}`,
          severity: 'error',
          field: 'permissions'
        })
      }

      // Check for dangerous permissions
      if (permission.dangerous && !permission.required) {
        result.warnings.push({
          code: 'DANGEROUS_PERMISSION',
          message: `Dangerous permission requested: ${permission.name}`,
          severity: 'warning',
          field: 'permissions',
          suggestion: 'Ensure dangerous permissions are necessary'
        })
      }
    }
  }

  /**
   * Validate API routes
   */
  private async validateAPIRoutes(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.api?.routes || manifest.api.routes.length === 0) {
      return
    }

    const routePaths = new Set<string>()

    for (const route of manifest.api.routes) {
      // Validate route structure
      if (!route.method || !route.path || !route.handler) {
        result.errors.push({
          code: 'INVALID_ROUTE',
          message: 'Route missing method, path, or handler',
          severity: 'error',
          field: 'api.routes'
        })
        continue
      }

      // Validate HTTP method
      if (!Object.values(HTTPMethod).includes(route.method)) {
        result.errors.push({
          code: 'INVALID_HTTP_METHOD',
          message: `Invalid HTTP method: ${route.method}`,
          severity: 'error',
          field: 'api.routes'
        })
      }

      // Validate path format
      if (!route.path.startsWith('/')) {
        result.errors.push({
          code: 'INVALID_ROUTE_PATH',
          message: `Route path must start with '/': ${route.path}`,
          severity: 'error',
          field: 'api.routes'
        })
      }

      // Check for duplicate routes
      const routeKey = `${route.method}:${route.path}`
      if (routePaths.has(routeKey)) {
        result.errors.push({
          code: 'DUPLICATE_ROUTE',
          message: `Duplicate route: ${routeKey}`,
          severity: 'error',
          field: 'api.routes'
        })
      }
      routePaths.add(routeKey)

      // Validate rate limiting
      if (route.rateLimit) {
        if (!route.rateLimit.windowMs || !route.rateLimit.maxRequests) {
          result.errors.push({
            code: 'INVALID_RATE_LIMIT',
            message: 'Rate limit missing windowMs or maxRequests',
            severity: 'error',
            field: 'api.routes'
          })
        }
      }
    }
  }

  /**
   * Validate plugin settings
   */
  private async validateSettings(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.settings || manifest.settings.length === 0) {
      return
    }

    const settingKeys = new Set<string>()

    for (const setting of manifest.settings) {
      // Validate setting structure
      if (!setting.key || !setting.name || !setting.type) {
        result.errors.push({
          code: 'INVALID_SETTING',
          message: 'Setting missing key, name, or type',
          severity: 'error',
          field: 'settings'
        })
        continue
      }

      // Check for duplicate keys
      if (settingKeys.has(setting.key)) {
        result.errors.push({
          code: 'DUPLICATE_SETTING_KEY',
          message: `Duplicate setting key: ${setting.key}`,
          severity: 'error',
          field: 'settings'
        })
      }
      settingKeys.add(setting.key)

      // Validate setting type
      if (!Object.values(SettingType).includes(setting.type)) {
        result.errors.push({
          code: 'INVALID_SETTING_TYPE',
          message: `Invalid setting type: ${setting.type}`,
          severity: 'error',
          field: 'settings'
        })
      }

      // Validate options for select/radio types
      if (['select', 'radio'].includes(setting.type) && (!setting.options || setting.options.length === 0)) {
        result.errors.push({
          code: 'MISSING_SETTING_OPTIONS',
          message: `Setting type '${setting.type}' requires options: ${setting.key}`,
          severity: 'error',
          field: 'settings'
        })
      }

      // Validate validation rules
      if (setting.validation) {
        if (setting.validation.min !== undefined && setting.validation.max !== undefined) {
          if (setting.validation.min > setting.validation.max) {
            result.errors.push({
              code: 'INVALID_VALIDATION_RANGE',
              message: `Invalid validation range for ${setting.key}: min > max`,
              severity: 'error',
              field: 'settings'
            })
          }
        }
      }
    }
  }

  /**
   * Validate plugin assets
   */
  private async validateAssets(
    manifest: PluginManifest,
    installPath: string,
    result: ValidationResult
  ): Promise<void> {
    if (!manifest.assets || manifest.assets.length === 0) {
      return
    }

    for (const asset of manifest.assets) {
      const assetPath = path.join(installPath, asset.path)
      
      try {
        await fs.access(assetPath)
      } catch (error) {
        result.errors.push({
          code: 'ASSET_NOT_FOUND',
          message: `Asset file not found: ${asset.path}`,
          severity: 'error',
          field: 'assets',
          suggestion: 'Ensure all asset files exist in plugin directory'
        })
      }
    }
  }

  /**
   * Perform security scan
   */
  private async performSecurityScan(plugin: Plugin, result: ValidationResult): Promise<void> {
    try {
      const scanResult = await this.scanForSecurityIssues(plugin.installPath)
      
      result.metadata.securityScore = scanResult.score

      for (const issue of scanResult.issues) {
        const errorDetail: ValidationErrorDetail = {
          code: 'SECURITY_ISSUE',
          message: issue.message,
          severity: issue.severity === 'critical' || issue.severity === 'high' ? 'error' : 'warning',
          suggestion: issue.recommendation
        }

        if (issue.file) {
          errorDetail.field = issue.file
        }

        if (issue.line) {
          errorDetail.line = issue.line
        }

        if (issue.severity === 'critical' || issue.severity === 'high') {
          result.errors.push(errorDetail)
        } else {
          result.warnings.push(errorDetail)
        }
      }

    } catch (error) {
      result.warnings.push({
        code: 'SECURITY_SCAN_FAILED',
        message: `Security scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'warning'
      })
    }
  }

  /**
   * Scan for security issues
   */
  private async scanForSecurityIssues(installPath: string): Promise<SecurityScanResult> {
    const issues: SecurityIssue[] = []
    let score = 100

    // This is a simplified security scan
    // In production, you'd use more sophisticated tools
    
    const files = await this.getJavaScriptFiles(installPath)
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8')
      const lines = content.split('\n')

      // Check for dangerous patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        
        for (const pattern of this.config.blockedPatterns) {
          if (line.includes(pattern)) {
            issues.push({
              type: 'dangerous',
              severity: 'high',
              message: `Potentially dangerous code pattern: ${pattern}`,
              file: path.relative(installPath, file),
              line: i + 1,
              code: line.trim(),
              recommendation: `Avoid using ${pattern} for security reasons`
            })
            score -= 10
          }
        }
      }
    }

    return {
      safe: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
      score: Math.max(0, score),
      issues,
      recommendations: issues.map(i => i.recommendation).filter(Boolean) as string[]
    }
  }

  /**
   * Get JavaScript files from directory
   */
  private async getJavaScriptFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const subFiles = await this.getJavaScriptFiles(fullPath)
        files.push(...subFiles)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
          files.push(fullPath)
        }
      }
    }

    return files
  }

  /**
   * Perform performance check
   */
  private async performPerformanceCheck(plugin: Plugin, result: ValidationResult): Promise<void> {
    let score = 100

    // Check bundle size
    if (result.metadata.totalSize > 50 * 1024 * 1024) { // 50MB
      result.warnings.push({
        code: 'LARGE_PLUGIN_SIZE',
        message: 'Plugin size is quite large, may impact performance',
        severity: 'warning',
        suggestion: 'Consider optimizing plugin size'
      })
      score -= 20
    }

    // Check number of files
    if (result.metadata.fileCount > 1000) {
      result.warnings.push({
        code: 'TOO_MANY_FILES',
        message: 'Plugin contains many files, may impact load time',
        severity: 'warning',
        suggestion: 'Consider bundling or reducing file count'
      })
      score -= 10
    }

    result.metadata.performanceScore = Math.max(0, score)
  }

  /**
   * Perform compatibility check
   */
  private async performCompatibilityCheck(plugin: Plugin, result: ValidationResult): Promise<void> {
    let score = 100

    // Check Node.js version compatibility
    if (plugin.manifest.requirements?.nodeVersion) {
      const currentNodeVersion = process.version
      if (!semver.satisfies(currentNodeVersion, plugin.manifest.requirements.nodeVersion)) {
        result.warnings.push({
          code: 'NODE_VERSION_MISMATCH',
          message: `Plugin requires Node.js ${plugin.manifest.requirements.nodeVersion}, current: ${currentNodeVersion}`,
          severity: 'warning',
          suggestion: 'Update Node.js version or adjust requirements'
        })
        score -= 30
      }
    }

    result.metadata.compatibilityScore = Math.max(0, score)
  }

  /**
   * Run custom validators
   */
  private async runCustomValidators(plugin: Plugin, result: ValidationResult): Promise<void> {
    for (const [name, validator] of this.customValidators.entries()) {
      try {
        await validator(plugin, result)
      } catch (error) {
        logger.error('Custom validator failed', {
          validator: name,
          pluginId: plugin.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  /**
   * Validate manifest structure (custom validator)
   */
  private async validateManifestStructure(plugin: Plugin, result: ValidationResult): Promise<void> {
    // Additional manifest validation
    const manifest = plugin.manifest

    if (manifest.api && (!manifest.api.routes || manifest.api.routes.length === 0)) {
      result.warnings.push({
        code: 'EMPTY_API_CONFIG',
        message: 'API configuration exists but no routes defined',
        severity: 'warning',
        field: 'api'
      })
    }

    if (manifest.ui && (!manifest.ui.components || manifest.ui.components.length === 0)) {
      result.warnings.push({
        code: 'EMPTY_UI_CONFIG',
        message: 'UI configuration exists but no components defined',
        severity: 'warning',
        field: 'ui'
      })
    }
  }

  /**
   * Calculate validation score
   */
  private calculateValidationScore(result: ValidationResult): void {
    let score = 100

    // Deduct points for errors and warnings
    score -= result.errors.length * 20
    score -= result.warnings.length * 5

    // Apply component scores
    if (result.metadata.securityScore !== undefined) {
      score = Math.min(score, result.metadata.securityScore)
    }

    if (result.metadata.performanceScore !== undefined) {
      score = (score + result.metadata.performanceScore) / 2
    }

    if (result.metadata.compatibilityScore !== undefined) {
      score = (score + result.metadata.compatibilityScore) / 2
    }

    result.score = Math.max(0, Math.round(score))
  }

  /**
   * Validate plugin settings values
   */
  public validatePluginSettings(
    settings: Record<string, any>,
    manifest: PluginManifest
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      score: 100,
      metadata: {
        validatedAt: new Date(),
        validatorVersion: this.validatorVersion,
        checksPerformed: ['settings_values'],
        duration: 0,
        fileCount: 0,
        totalSize: 0
      }
    }

    const startTime = Date.now()

    if (!manifest.settings) {
      result.metadata.duration = Date.now() - startTime
      return result
    }

    for (const setting of manifest.settings) {
      const value = settings[setting.key]

      // Check required settings
      if (setting.required && (value === undefined || value === null || value === '')) {
        result.errors.push({
          code: 'MISSING_REQUIRED_SETTING',
          message: `Required setting missing: ${setting.key}`,
          severity: 'error',
          field: setting.key
        })
        continue
      }

      if (value === undefined || value === null) {
        continue
      }

      // Validate setting value based on type
      const validationError = this.validateSettingValue(setting, value)
      if (validationError) {
        result.errors.push(validationError)
      }
    }

    result.valid = result.errors.length === 0
    result.metadata.duration = Date.now() - startTime

    return result
  }

  /**
   * Validate individual setting value
   */
  private validateSettingValue(setting: any, value: any): ValidationErrorDetail | null {
    switch (setting.type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            code: 'INVALID_SETTING_TYPE',
            message: `Setting '${setting.key}' must be a string`,
            severity: 'error',
            field: setting.key
          }
        }
        break

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          return {
            code: 'INVALID_SETTING_TYPE',
            message: `Setting '${setting.key}' must be a number`,
            severity: 'error',
            field: setting.key
          }
        }
        break

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            code: 'INVALID_SETTING_TYPE',
            message: `Setting '${setting.key}' must be a boolean`,
            severity: 'error',
            field: setting.key
          }
        }
        break

      case 'select':
      case 'radio':
        if (setting.options && !setting.options.some((opt: any) => opt.value === value)) {
          return {
            code: 'INVALID_SETTING_OPTION',
            message: `Setting '${setting.key}' has invalid option: ${value}`,
            severity: 'error',
            field: setting.key
          }
        }
        break
    }

    // Validate against validation rules
    if (setting.validation) {
      if (setting.validation.min !== undefined && value < setting.validation.min) {
        return {
          code: 'SETTING_VALUE_TOO_SMALL',
          message: `Setting '${setting.key}' value is below minimum: ${setting.validation.min}`,
          severity: 'error',
          field: setting.key
        }
      }

      if (setting.validation.max !== undefined && value > setting.validation.max) {
        return {
          code: 'SETTING_VALUE_TOO_LARGE',
          message: `Setting '${setting.key}' value exceeds maximum: ${setting.validation.max}`,
          severity: 'error',
          field: setting.key
        }
      }

      if (setting.validation.pattern && typeof value === 'string') {
        const regex = new RegExp(setting.validation.pattern)
        if (!regex.test(value)) {
          return {
            code: 'SETTING_VALUE_INVALID_PATTERN',
            message: `Setting '${setting.key}' value doesn't match required pattern`,
            severity: 'error',
            field: setting.key
          }
        }
      }
    }

    return null
  }

  /**
   * Get validator statistics
   */
  public getValidatorStats(): Record<string, any> {
    return {
      cacheSize: this.validationCache.size,
      customValidators: this.customValidators.size,
      validatorVersion: this.validatorVersion,
      configuration: this.config
    }
  }

  /**
   * Clear validation cache
   */
  public clearCache(): void {
    this.validationCache.clear()
    logger.debug('Validation cache cleared')
  }

  /**
   * Update validator configuration
   */
  public updateConfiguration(newConfig: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.clearCache() // Clear cache when config changes
    logger.debug('Validator configuration updated', { config: this.config })
  }
}