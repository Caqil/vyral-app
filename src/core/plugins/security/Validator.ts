import { Plugin, PluginManifest, PluginSetting, PluginDependency } from '@/core/types/plugin'
import { logger } from '@/core/lib/utils/logger'
import * as fs from 'fs/promises'
import * as path from 'path'
import semver from 'semver'

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  score: number // 0-100
  metadata: ValidationMetadata
}

export interface ValidationError {
  code: ErrorCode
  message: string
  field?: string
  value?: any
  suggestion?: string
  severity: 'error' | 'warning'
}

export interface ValidationWarning {
  code: WarningCode
  message: string
  field?: string
  value?: any
  suggestion?: string
}

export interface ValidationMetadata {
  validatedAt: Date
  validatorVersion: string
  checksPerformed: string[]
  duration: number
  fileCount: number
  totalSize: number
}

export enum ErrorCode {
  MISSING_MANIFEST = 'MISSING_MANIFEST',
  INVALID_MANIFEST = 'INVALID_MANIFEST',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_FIELD = 'INVALID_FIELD',
  INVALID_VERSION = 'INVALID_VERSION',
  INVALID_DEPENDENCY = 'INVALID_DEPENDENCY',
  MISSING_FILE = 'MISSING_FILE',
  INVALID_PERMISSION = 'INVALID_PERMISSION',
  INVALID_SETTING = 'INVALID_SETTING',
  INVALID_API_CONFIG = 'INVALID_API_CONFIG',
  INVALID_UI_CONFIG = 'INVALID_UI_CONFIG',
  INVALID_HOOK_CONFIG = 'INVALID_HOOK_CONFIG',
  SIZE_LIMIT_EXCEEDED = 'SIZE_LIMIT_EXCEEDED',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  COMPATIBILITY_ERROR = 'COMPATIBILITY_ERROR'
}

export enum WarningCode {
  DEPRECATED_FIELD = 'DEPRECATED_FIELD',
  UNUSED_FIELD = 'UNUSED_FIELD',
  LARGE_FILE = 'LARGE_FILE',
  MANY_DEPENDENCIES = 'MANY_DEPENDENCIES',
  MISSING_OPTIONAL_FIELD = 'MISSING_OPTIONAL_FIELD',
  UNSAFE_PRACTICE = 'UNSAFE_PRACTICE',
  PERFORMANCE_CONCERN = 'PERFORMANCE_CONCERN',
  ACCESSIBILITY_ISSUE = 'ACCESSIBILITY_ISSUE'
}

export interface ValidatorConfig {
  maxPluginSize: number // bytes
  maxFileSize: number // bytes
  allowedFileTypes: string[]
  requiredFields: string[]
  optionalFields: string[]
  deprecatedFields: string[]
  maxDependencies: number
  strictMode: boolean
  validateCode: boolean
  validateAssets: boolean
  validatePermissions: boolean
  customValidators: CustomValidator[]
}

export interface CustomValidator {
  name: string
  description: string
  validator: (plugin: Plugin, manifest: PluginManifest) => Promise<ValidationError[]>
  enabled: boolean
}

export class PluginValidator {
  private static instance: PluginValidator
  private config: ValidatorConfig
  private readonly validatorVersion = '1.0.0'

  private constructor(config: ValidatorConfig) {
    this.config = config
  }

  public static getInstance(config?: ValidatorConfig): PluginValidator {
    if (!PluginValidator.instance) {
      if (!config) {
        throw new Error('Validator config required for first initialization')
      }
      PluginValidator.instance = new PluginValidator(config)
    }
    return PluginValidator.instance
  }

  /**
   * Validate plugin
   */
  public async validatePlugin(plugin: Plugin): Promise<ValidationResult> {
    const startTime = Date.now()
    
    logger.info('Starting plugin validation', {
      pluginId: plugin.id,
      pluginPath: plugin.installPath
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
      // 1. Basic validation
      await this.validateBasicStructure(plugin, result)
      result.metadata.checksPerformed.push('basic_structure')

      // 2. Manifest validation
      await this.validateManifest(plugin.manifest, result)
      result.metadata.checksPerformed.push('manifest')

      // 3. File system validation
      await this.validateFileSystem(plugin.installPath, result)
      result.metadata.checksPerformed.push('file_system')

      // 4. Dependencies validation
      await this.validateDependencies(plugin.manifest, result)
      result.metadata.checksPerformed.push('dependencies')

      // 5. Permissions validation
      if (this.config.validatePermissions) {
        await this.validatePermissions(plugin.manifest, result)
        result.metadata.checksPerformed.push('permissions')
      }

      // 6. API configuration validation
      await this.validateAPIConfig(plugin.manifest, result)
      result.metadata.checksPerformed.push('api_config')

      // 7. UI configuration validation
      await this.validateUIConfig(plugin.manifest, result)
      result.metadata.checksPerformed.push('ui_config')

      // 8. Settings validation
      await this.validateSettings(plugin.manifest, result)
      result.metadata.checksPerformed.push('settings')

      // 9. Custom validators
      await this.runCustomValidators(plugin, result)
      result.metadata.checksPerformed.push('custom_validators')

      // 10. Code validation (if enabled)
      if (this.config.validateCode) {
        await this.validateCode(plugin.installPath, result)
        result.metadata.checksPerformed.push('code_validation')
      }

      // 11. Asset validation (if enabled)
      if (this.config.validateAssets) {
        await this.validateAssets(plugin.installPath, result)
        result.metadata.checksPerformed.push('asset_validation')
      }

      // Calculate final score and validity
      this.calculateScore(result)
      result.valid = result.errors.length === 0
      result.metadata.duration = Date.now() - startTime

      logger.info('Plugin validation completed', {
        pluginId: plugin.id,
        valid: result.valid,
        score: result.score,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        duration: result.metadata.duration
      })

      return result
    } catch (error) {
      logger.error('Plugin validation failed', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      result.errors.push({
        code: ErrorCode.INVALID_MANIFEST,
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
   * Validate manifest only
   */
  public async validateManifestOnly(manifest: PluginManifest): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      score: 100,
      metadata: {
        validatedAt: new Date(),
        validatorVersion: this.validatorVersion,
        checksPerformed: ['manifest'],
        duration: 0,
        fileCount: 0,
        totalSize: 0
      }
    }

    const startTime = Date.now()
    await this.validateManifest(manifest, result)
    result.metadata.duration = Date.now() - startTime
    
    this.calculateScore(result)
    result.valid = result.errors.length === 0

    return result
  }

  /**
   * Validate plugin settings
   */
  public validatePluginSettings(settings: Record<string, any>, manifest: PluginManifest): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      score: 100,
      metadata: {
        validatedAt: new Date(),
        validatorVersion: this.validatorVersion,
        checksPerformed: ['settings'],
        duration: 0,
        fileCount: 0,
        totalSize: 0
      }
    }

    const startTime = Date.now()

    if (manifest.settings) {
      manifest.settings.forEach(setting => {
        const value = settings[setting.key]
        const errors = this.validateSettingValue(setting, value)
        result.errors.push(...errors)
      })
    }

    result.metadata.duration = Date.now() - startTime
    this.calculateScore(result)
    result.valid = result.errors.length === 0

    return result
  }

  /**
   * Get validation schema for plugin type
   */
  public getValidationSchema(category: string): any {
    // Return JSON schema for plugin validation
    const baseSchema = {
      type: 'object',
      required: this.config.requiredFields,
      properties: {
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+' },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        displayName: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', minLength: 10, maxLength: 1000 },
        author: { type: 'string', minLength: 1, maxLength: 100 },
        license: { type: 'string', minLength: 1 },
        category: { type: 'string', enum: ['social', 'media', 'productivity', 'utility'] },
        tags: { type: 'array', items: { type: 'string' } },
        main: { type: 'string', minLength: 1 }
      }
    }

    return baseSchema
  }

  // Private validation methods
  private async validateBasicStructure(plugin: Plugin, result: ValidationResult): Promise<void> {
    // Check if plugin path exists
    try {
      const stats = await fs.stat(plugin.installPath)
      if (!stats.isDirectory()) {
        result.errors.push({
          code: ErrorCode.INVALID_MANIFEST,
          message: 'Plugin path is not a directory',
          severity: 'error',
          suggestion: 'Ensure plugin is extracted to a directory'
        })
      }
    } catch (error) {
      result.errors.push({
        code: ErrorCode.MISSING_FILE,
        message: 'Plugin directory not found',
        severity: 'error',
        suggestion: 'Ensure plugin is properly installed'
      })
    }

    // Check basic plugin properties
    if (!plugin.id || plugin.id.trim().length === 0) {
      result.errors.push({
        code: ErrorCode.MISSING_FIELD,
        message: 'Plugin ID is required',
        field: 'id',
        severity: 'error'
      })
    }

    if (!plugin.name || plugin.name.trim().length === 0) {
      result.errors.push({
        code: ErrorCode.MISSING_FIELD,
        message: 'Plugin name is required',
        field: 'name',
        severity: 'error'
      })
    }

    // Validate plugin ID format
    if (plugin.id && !/^[a-z0-9-_]+$/.test(plugin.id)) {
      result.errors.push({
        code: ErrorCode.INVALID_FIELD,
        message: 'Plugin ID must contain only lowercase letters, numbers, hyphens, and underscores',
        field: 'id',
        value: plugin.id,
        severity: 'error'
      })
    }
  }

  private async validateManifest(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    // Required fields validation
    this.config.requiredFields.forEach(field => {
      if (!(field in manifest) || !manifest[field as keyof PluginManifest]) {
        result.errors.push({
          code: ErrorCode.MISSING_FIELD,
          message: `Required field '${field}' is missing`,
          field,
          severity: 'error',
          suggestion: `Add '${field}' to your plugin manifest`
        })
      }
    })

    // Version validation
    if (manifest.version && !semver.valid(manifest.version)) {
      result.errors.push({
        code: ErrorCode.INVALID_VERSION,
        message: 'Invalid semantic version format',
        field: 'version',
        value: manifest.version,
        severity: 'error',
        suggestion: 'Use semantic versioning format (e.g., 1.0.0)'
      })
    }

    // Category validation
    const validCategories = ['social', 'media', 'communication', 'productivity', 'business', 'utility', 'analytics', 'security', 'integration', 'theme', 'extension']
    if (manifest.category && !validCategories.includes(manifest.category)) {
      result.errors.push({
        code: ErrorCode.INVALID_FIELD,
        message: 'Invalid plugin category',
        field: 'category',
        value: manifest.category,
        severity: 'error',
        suggestion: `Use one of: ${validCategories.join(', ')}`
      })
    }

    // Tags validation
    if (manifest.tags) {
      if (!Array.isArray(manifest.tags)) {
        result.errors.push({
          code: ErrorCode.INVALID_FIELD,
          message: 'Tags must be an array',
          field: 'tags',
          value: manifest.tags,
          severity: 'error'
        })
      } else if (manifest.tags.length > 10) {
        result.warnings.push({
          code: WarningCode.PERFORMANCE_CONCERN,
          message: 'Too many tags (limit: 10)',
          field: 'tags',
          value: manifest.tags.length,
          suggestion: 'Reduce number of tags for better performance'
        })
      }
    }

    // Main file validation
    if (manifest.main) {
      const mainPath = path.join(process.cwd(), 'plugins', manifest.name, manifest.main)
      try {
        await fs.access(mainPath)
      } catch (error) {
        result.errors.push({
          code: ErrorCode.MISSING_FILE,
          message: 'Main file not found',
          field: 'main',
          value: manifest.main,
          severity: 'error',
          suggestion: 'Ensure the main file exists in the plugin directory'
        })
      }
    }

    // Check for deprecated fields
    this.config.deprecatedFields.forEach(field => {
      if (field in manifest) {
        result.warnings.push({
          code: WarningCode.DEPRECATED_FIELD,
          message: `Field '${field}' is deprecated`,
          field,
          suggestion: 'Remove deprecated field from manifest'
        })
      }
    })
  }

  private async validateFileSystem(pluginPath: string, result: ValidationResult): Promise<void> {
    try {
      const files = await this.getAllFiles(pluginPath)
      result.metadata.fileCount = files.length
      
      let totalSize = 0
      for (const file of files) {
        const stats = await fs.stat(file)
        totalSize += stats.size

        // Check file size
        if (stats.size > this.config.maxFileSize) {
          result.warnings.push({
            code: WarningCode.LARGE_FILE,
            message: `Large file detected: ${path.basename(file)} (${this.formatBytes(stats.size)})`,
            value: stats.size,
            suggestion: 'Consider optimizing large files'
          })
        }

        // Check file type
        const ext = path.extname(file).toLowerCase()
        if (ext && this.config.allowedFileTypes.length > 0 && !this.config.allowedFileTypes.includes(ext)) {
          result.errors.push({
            code: ErrorCode.UNSUPPORTED_FILE_TYPE,
            message: `Unsupported file type: ${ext}`,
            value: file,
            severity: 'error',
            suggestion: 'Remove unsupported files or update allowed file types'
          })
        }
      }

      result.metadata.totalSize = totalSize

      // Check total plugin size
      if (totalSize > this.config.maxPluginSize) {
        result.errors.push({
          code: ErrorCode.SIZE_LIMIT_EXCEEDED,
          message: `Plugin size exceeds limit: ${this.formatBytes(totalSize)} > ${this.formatBytes(this.config.maxPluginSize)}`,
          value: totalSize,
          severity: 'error',
          suggestion: 'Reduce plugin size by removing unnecessary files'
        })
      }
    } catch (error) {
      result.errors.push({
        code: ErrorCode.MISSING_FILE,
        message: `File system validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      })
    }
  }

  private async validateDependencies(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.dependencies) return

    if (manifest.dependencies.length > this.config.maxDependencies) {
      result.warnings.push({
        code: WarningCode.MANY_DEPENDENCIES,
        message: `Too many dependencies (${manifest.dependencies.length} > ${this.config.maxDependencies})`,
        field: 'dependencies',
        value: manifest.dependencies.length,
        suggestion: 'Consider reducing dependencies for better performance'
      })
    }

    // Validate each dependency
    manifest.dependencies.forEach((dep, index) => {
      this.validateDependency(dep, index, result)
    })

    // Check for circular dependencies
    this.checkCircularDependencies(manifest.dependencies, result)
  }

  private validateDependency(dep: PluginDependency, index: number, result: ValidationResult): void {
    if (!dep.name || dep.name.trim().length === 0) {
      result.errors.push({
        code: ErrorCode.INVALID_DEPENDENCY,
        message: `Dependency ${index} is missing name`,
        field: `dependencies[${index}].name`,
        severity: 'error'
      })
    }

    if (!dep.version || dep.version.trim().length === 0) {
      result.errors.push({
        code: ErrorCode.INVALID_DEPENDENCY,
        message: `Dependency ${index} is missing version`,
        field: `dependencies[${index}].version`,
        severity: 'error'
      })
    }

    if (dep.version && !semver.validRange(dep.version)) {
      result.errors.push({
        code: ErrorCode.INVALID_VERSION,
        message: `Invalid version range for dependency: ${dep.name}`,
        field: `dependencies[${index}].version`,
        value: dep.version,
        severity: 'error',
        suggestion: 'Use valid semantic version range (e.g., ^1.0.0, ~2.1.0)'
      })
    }

    const validTypes = ['plugin', 'npm', 'system', 'feature']
    if (!validTypes.includes(dep.type)) {
      result.errors.push({
        code: ErrorCode.INVALID_DEPENDENCY,
        message: `Invalid dependency type: ${dep.type}`,
        field: `dependencies[${index}].type`,
        value: dep.type,
        severity: 'error',
        suggestion: `Use one of: ${validTypes.join(', ')}`
      })
    }
  }

  private checkCircularDependencies(dependencies: PluginDependency[], result: ValidationResult): void {
    const pluginDeps = dependencies.filter(d => d.type === 'plugin')
    const graph = new Map<string, string[]>()
    
    pluginDeps.forEach(dep => {
      graph.set(dep.name, []) // Simplified - in real implementation, would load actual dependencies
    })

    // Simple cycle detection (would be more complex in real implementation)
    graph.forEach((deps, plugin) => {
      if (this.hasCycle(graph, plugin, new Set())) {
        result.errors.push({
          code: ErrorCode.CIRCULAR_DEPENDENCY,
          message: `Circular dependency detected involving: ${plugin}`,
          field: 'dependencies',
          severity: 'error',
          suggestion: 'Remove circular dependencies'
        })
      }
    })
  }

  private hasCycle(graph: Map<string, string[]>, node: string, visited: Set<string>): boolean {
    if (visited.has(node)) return true
    
    visited.add(node)
    const neighbors = graph.get(node) || []
    
    for (const neighbor of neighbors) {
      if (this.hasCycle(graph, neighbor, visited)) {
        return true
      }
    }
    
    visited.delete(node)
    return false
  }

  private async validatePermissions(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.permissions) return

    const validScopes = ['system', 'user', 'content', 'api', 'database', 'file', 'network']
    
    manifest.permissions.forEach((permission, index) => {
      if (!permission.name || permission.name.trim().length === 0) {
        result.errors.push({
          code: ErrorCode.INVALID_PERMISSION,
          message: `Permission ${index} is missing name`,
          field: `permissions[${index}].name`,
          severity: 'error'
        })
      }

      if (!permission.description || permission.description.trim().length === 0) {
        result.errors.push({
          code: ErrorCode.INVALID_PERMISSION,
          message: `Permission ${index} is missing description`,
          field: `permissions[${index}].description`,
          severity: 'error'
        })
      }

      if (!validScopes.includes(permission.scope)) {
        result.errors.push({
          code: ErrorCode.INVALID_PERMISSION,
          message: `Invalid permission scope: ${permission.scope}`,
          field: `permissions[${index}].scope`,
          value: permission.scope,
          severity: 'error',
          suggestion: `Use one of: ${validScopes.join(', ')}`
        })
      }

      if (permission.dangerous) {
        result.warnings.push({
          code: WarningCode.UNSAFE_PRACTICE,
          message: `Dangerous permission without justification: ${permission.name}`,
          field: `permissions[${index}].justification`,
          suggestion: 'Provide justification for dangerous permissions'
        })
      }
    })
  }

  private async validateAPIConfig(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.api) return

    const { api } = manifest
    
    if (api.routes) {
      api.routes.forEach((route, index) => {
        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
        if (!validMethods.includes(route.method)) {
          result.errors.push({
            code: ErrorCode.INVALID_API_CONFIG,
            message: `Invalid HTTP method: ${route.method}`,
            field: `api.routes[${index}].method`,
            value: route.method,
            severity: 'error',
            suggestion: `Use one of: ${validMethods.join(', ')}`
          })
        }

        if (!route.path || !route.path.startsWith('/')) {
          result.errors.push({
            code: ErrorCode.INVALID_API_CONFIG,
            message: 'API route path must start with /',
            field: `api.routes[${index}].path`,
            value: route.path,
            severity: 'error'
          })
        }

        if (!route.handler || route.handler.trim().length === 0) {
          result.errors.push({
            code: ErrorCode.INVALID_API_CONFIG,
            message: 'API route handler is required',
            field: `api.routes[${index}].handler`,
            severity: 'error'
          })
        }
      })
    }
  }

  private async validateUIConfig(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.ui) return

    const { ui } = manifest

    if (ui.components) {
      ui.components.forEach((component, index) => {
        if (!component.name || component.name.trim().length === 0) {
          result.errors.push({
            code: ErrorCode.INVALID_UI_CONFIG,
            message: 'UI component name is required',
            field: `ui.components[${index}].name`,
            severity: 'error'
          })
        }

        if (!component.file || component.file.trim().length === 0) {
          result.errors.push({
            code: ErrorCode.INVALID_UI_CONFIG,
            message: 'UI component file is required',
            field: `ui.components[${index}].file`,
            severity: 'error'
          })
        }

        // Validate component name format
        if (component.name && !/^[A-Z][a-zA-Z0-9]*$/.test(component.name)) {
          result.warnings.push({
            code: WarningCode.UNSAFE_PRACTICE,
            message: 'Component name should follow PascalCase convention',
            field: `ui.components[${index}].name`,
            value: component.name,
            suggestion: 'Use PascalCase for component names (e.g., MyComponent)'
          })
        }
      })
    }
  }

  private async validateSettings(manifest: PluginManifest, result: ValidationResult): Promise<void> {
    if (!manifest.settings) return

    const settingKeys = new Set<string>()

    manifest.settings.forEach((setting, index) => {
      // Check for duplicate keys
      if (settingKeys.has(setting.key)) {
        result.errors.push({
          code: ErrorCode.INVALID_SETTING,
          message: `Duplicate setting key: ${setting.key}`,
          field: `settings[${index}].key`,
          value: setting.key,
          severity: 'error'
        })
      }
      settingKeys.add(setting.key)

      // Validate setting structure
      if (!setting.key || setting.key.trim().length === 0) {
        result.errors.push({
          code: ErrorCode.INVALID_SETTING,
          message: 'Setting key is required',
          field: `settings[${index}].key`,
          severity: 'error'
        })
      }

      if (!setting.name || setting.name.trim().length === 0) {
        result.errors.push({
          code: ErrorCode.INVALID_SETTING,
          message: 'Setting name is required',
          field: `settings[${index}].name`,
          severity: 'error'
        })
      }

      if (!setting.type) {
        result.errors.push({
          code: ErrorCode.INVALID_SETTING,
          message: 'Setting type is required',
          field: `settings[${index}].type`,
          severity: 'error'
        })
      }

      // Validate default value matches type
      if (setting.default !== undefined) {
        const errors = this.validateSettingValue(setting, setting.default)
        result.errors.push(...errors)
      }
    })
  }

  private validateSettingValue(setting: PluginSetting, value: any): ValidationError[] {
    const errors: ValidationError[] = []

    if (setting.required && (value === undefined || value === null)) {
      errors.push({
        code: ErrorCode.INVALID_SETTING,
        message: `Required setting '${setting.key}' is missing`,
        field: setting.key,
        severity: 'error'
      })
      return errors
    }

    if (value === undefined || value === null) {
      return errors
    }

    // Type validation
    switch (setting.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push({
            code: ErrorCode.INVALID_SETTING,
            message: `Setting '${setting.key}' must be a string`,
            field: setting.key,
            value,
            severity: 'error'
          })
        }
        break
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({
            code: ErrorCode.INVALID_SETTING,
            message: `Setting '${setting.key}' must be a number`,
            field: setting.key,
            value,
            severity: 'error'
          })
        }
        break
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push({
            code: ErrorCode.INVALID_SETTING,
            message: `Setting '${setting.key}' must be a boolean`,
            field: setting.key,
            value,
            severity: 'error'
          })
        }
        break
    }

    // Validation rules
    if (setting.validation) {
      const validation = setting.validation
      
      if (typeof value === 'string') {
        if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
          errors.push({
            code: ErrorCode.INVALID_SETTING,
            message: `Setting '${setting.key}' does not match pattern: ${validation.pattern}`,
            field: setting.key,
            value,
            severity: 'error'
          })
        }
      }

      if (typeof value === 'number') {
        if (validation.min !== undefined && value < validation.min) {
          errors.push({
            code: ErrorCode.INVALID_SETTING,
            message: `Setting '${setting.key}' must be at least ${validation.min}`,
            field: setting.key,
            value,
            severity: 'error'
          })
        }

        if (validation.max !== undefined && value > validation.max) {
          errors.push({
            code: ErrorCode.INVALID_SETTING,
            message: `Setting '${setting.key}' must be at most ${validation.max}`,
            field: setting.key,
            value,
            severity: 'error'
          })
        }
      }
    }

    return errors
  }

  private async runCustomValidators(plugin: Plugin, result: ValidationResult): Promise<void> {
    for (const validator of this.config.customValidators) {
      if (!validator.enabled) continue

      try {
        const errors = await validator.validator(plugin, plugin.manifest)
        result.errors.push(...errors)
      } catch (error) {
        result.warnings.push({
          code: WarningCode.PERFORMANCE_CONCERN,
          message: `Custom validator '${validator.name}' failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestion: 'Check custom validator implementation'
        })
      }
    }
  }

  private async validateCode(pluginPath: string, result: ValidationResult): Promise<void> {
    // Code validation would be implemented here
    // This could include syntax checking, security scanning, etc.
    result.warnings.push({
      code: WarningCode.PERFORMANCE_CONCERN,
      message: 'Code validation not yet implemented',
      suggestion: 'Manual code review recommended'
    })
  }

  private async validateAssets(pluginPath: string, result: ValidationResult): Promise<void> {
    // Asset validation would be implemented here
    // This could include image optimization checks, etc.
    result.warnings.push({
      code: WarningCode.PERFORMANCE_CONCERN,
      message: 'Asset validation not yet implemented',
      suggestion: 'Manual asset review recommended'
    })
  }

  // Helper methods
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    
    async function traverse(currentPath: string) {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name)
          
          if (entry.isDirectory()) {
            await traverse(fullPath)
          } else {
            files.push(fullPath)
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    }
    
    await traverse(dirPath)
    return files
  }

  private calculateScore(result: ValidationResult): void {
    let score = 100

    result.errors.forEach(error => {
      switch (error.severity) {
        case 'error':
          score -= 20
          break
        case 'warning':
          score -= 5
          break
      }
    })

    result.warnings.forEach(() => {
      score -= 2
    })

    result.score = Math.max(0, score)
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Update validator configuration
   */
  public updateConfig(newConfig: Partial<ValidatorConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.info('Validator configuration updated', { config: this.config })
  }
}