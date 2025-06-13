import mongoose, { Schema, Model, Types } from 'mongoose'

// Base interface without Document
export interface IPluginConfig {
  pluginId: string
  userId?: Types.ObjectId
  isGlobal: boolean
  settings: Record<string, any>
  isActive: boolean
  version: string
  environment: 'development' | 'staging' | 'production' | 'all'
  validationSchema?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      required: boolean
      default?: any
      validation?: {
        min?: number
        max?: number
        pattern?: string
        options?: any[]
        custom?: string
      }
      description?: string
    }
  }
  metadata: {
    source: 'user' | 'admin' | 'plugin' | 'import'
    encrypted: string[]
    sensitive: string[]
    readonly: string[]
    hidden: string[]
    dependencies: Record<string, any>
    overrides: Record<string, any>
    backup?: {
      enabled: boolean
      frequency: string
      retention: number
    }
  }
  history: Array<{
    settings: Record<string, any>
    updatedBy?: Types.ObjectId
    updatedAt: Date
    reason?: string
    version: string
  }>
  lastValidated: Date
  validationErrors: Array<{
    field: string
    message: string
    code: string
    severity: 'error' | 'warning' | 'info'
  }>
  performance: {
    loadTime: number
    memoryUsage: number
    cacheHits: number
    cacheMisses: number
    lastOptimized: Date
  }
  schedule?: {
    enabled: boolean
    cron: string
    timezone: string
    nextRun?: Date
    lastRun?: Date
    failures: number
  }
  createdAt: Date
  updatedAt: Date
}
interface ValidationSchemaField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  default?: any
  validation?: {
    min?: number
    max?: number
    pattern?: string
    options?: any[]
    custom?: string
  }
  description?: string
}
// Document interface for instance methods
export interface PluginConfigDocument extends IPluginConfig, mongoose.Document<Types.ObjectId> {
  validateSettings(): Promise<boolean>
  getSetting(key: string, defaultValue?: any): any
  setSetting(key: string, value: any): Promise<void>
  resetToDefaults(): Promise<void>
  exportConfig(): any
  importConfig(config: any): Promise<void>
  createBackup(): Promise<void>
  restoreFromBackup(backupId: string): Promise<void>
  encrypt(value: any): string
  decrypt(encryptedValue: string): any
  addToHistory(reason?: string): Promise<void>
  clone(newUserId?: string): Promise<PluginConfigDocument>
  merge(otherConfig: any): Promise<void>
  optimizePerformance(): Promise<void>
}

// Model interface for static methods
export interface PluginConfigModel extends Model<PluginConfigDocument> {
  findByPlugin(pluginId: string): Promise<PluginConfigDocument[]>
  findByUser(userId: string): Promise<PluginConfigDocument[]>
  findGlobalConfigs(): Promise<PluginConfigDocument[]>
  findActiveConfigs(): Promise<PluginConfigDocument[]>
  findByPluginAndUser(pluginId: string, userId?: string): Promise<PluginConfigDocument | null>
  createDefault(pluginId: string, userId?: string): Promise<PluginConfigDocument>
  bulkUpdate(updates: Array<{ pluginId: string; userId?: string; settings: any }>): Promise<any[]>
  validateAllConfigs(): Promise<any[]>
  cleanupInactive(): Promise<number>
  getConfigStats(): Promise<any>
}

const PluginConfigSchema = new Schema<PluginConfigDocument>({
  pluginId: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: (pluginId: string) => /^[a-zA-Z0-9-_]+$/.test(pluginId),
      message: 'Plugin ID can only contain letters, numbers, hyphens, and underscores'
    }
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    sparse: true
  },
  isGlobal: {
    type: Boolean,
    default: false,
    index: true
  },
  settings: {
    type: Schema.Types.Mixed,
    default: {},
    validate: {
      validator: (settings: any) => {
        return typeof settings === 'object' && settings !== null
      },
      message: 'Settings must be an object'
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  version: {
    type: String,
    required: true,
    default: '1.0.0',
    validate: {
      validator: (version: string) => /^\d+\.\d+\.\d+$/.test(version),
      message: 'Version must be in semantic versioning format (x.y.z)'
    }
  },
  environment: {
    type: String,
    enum: ['development', 'staging', 'production', 'all'],
    default: 'all',
    index: true
  },
  validationSchema: {
    type: Schema.Types.Mixed,
    default: {}
  },
  metadata: {
    source: {
      type: String,
      enum: ['user', 'admin', 'plugin', 'import'],
      default: 'user'
    },
    encrypted: [String],
    sensitive: [String],
    readonly: [String],
    hidden: [String],
    dependencies: {
      type: Schema.Types.Mixed,
      default: {}
    },
    overrides: {
      type: Schema.Types.Mixed,
      default: {}
    },
    backup: {
      enabled: { type: Boolean, default: true },
      frequency: { type: String, default: 'daily' },
      retention: { type: Number, default: 30 }
    }
  },
  history: [{
    settings: {
      type: Schema.Types.Mixed,
      required: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    reason: String,
    version: {
      type: String,
      required: true
    }
  }],
  lastValidated: {
    type: Date,
    default: Date.now
  },
  validationErrors: [{
    field: { type: String, required: true },
    message: { type: String, required: true },
    code: { type: String, required: true },
    severity: {
      type: String,
      enum: ['error', 'warning', 'info'],
      default: 'error'
    }
  }],
  performance: {
    loadTime: { type: Number, default: 0 },
    memoryUsage: { type: Number, default: 0 },
    cacheHits: { type: Number, default: 0 },
    cacheMisses: { type: Number, default: 0 },
    lastOptimized: { type: Date, default: Date.now }
  },
  schedule: {
    enabled: { type: Boolean, default: false },
    cron: String,
    timezone: { type: String, default: 'UTC' },
    nextRun: Date,
    lastRun: Date,
    failures: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
      
      // Hide encrypted and sensitive settings
      if (ret.metadata?.encrypted?.length > 0 || ret.metadata?.sensitive?.length > 0) {
        const hiddenFields = [...(ret.metadata.encrypted || []), ...(ret.metadata.sensitive || [])]
        hiddenFields.forEach(field => {
          if (ret.settings[field]) {
            ret.settings[field] = '[HIDDEN]'
          }
        })
      }
      
      return ret
    }
  }
})

// Indexes
PluginConfigSchema.index({ pluginId: 1, userId: 1 }, { unique: true })
PluginConfigSchema.index({ pluginId: 1, isGlobal: 1 })
PluginConfigSchema.index({ userId: 1, isActive: 1 })
PluginConfigSchema.index({ environment: 1, isActive: 1 })
PluginConfigSchema.index({ lastValidated: 1 })
PluginConfigSchema.index({ 'schedule.enabled': 1, 'schedule.nextRun': 1 })

// Instance methods
PluginConfigSchema.methods.validateSettings = async function(): Promise<boolean> {
  this.validationErrors = []
  
  if (!this.validationSchema || Object.keys(this.validationSchema).length === 0) {
    this.lastValidated = new Date()
    return true
  }
  
  // Fix: Type the schema properly
  for (const [key, schema] of Object.entries(this.validationSchema) as [string, ValidationSchemaField][]) {
    const value = this.settings[key]
    
    // Check required fields
    if (schema.required && (value === undefined || value === null)) {
      this.validationErrors.push({
        field: key,
        message: `${key} is required`,
        code: 'REQUIRED_FIELD',
        severity: 'error'
      })
      continue
    }
    
    // Skip validation if value is undefined and not required
    if (value === undefined || value === null) continue
    
    // Type validation
    if (!this.validateType(value, schema.type)) {
      this.validationErrors.push({
        field: key,
        message: `${key} must be of type ${schema.type}`,
        code: 'INVALID_TYPE',
        severity: 'error'
      })
      continue
    }
    
    // Custom validation
    if (schema.validation) {
      const customErrors = this.runCustomValidation(key, value, schema.validation)
      this.validationErrors.push(...customErrors)
    }
  }
  
  this.lastValidated = new Date()
  await this.save()
  
  return this.validationErrors.filter((e: { severity: string }) => e.severity === 'error').length === 0
}

PluginConfigSchema.methods.validateType = function(value: any, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    default:
      return true
  }
}

PluginConfigSchema.methods.runCustomValidation = function(field: string, value: any, validation: any): any[] {
  const errors = []
  
  if (validation.min !== undefined && value < validation.min) {
    errors.push({
      field,
      message: `${field} must be at least ${validation.min}`,
      code: 'MIN_VALUE',
      severity: 'error'
    })
  }
  
  if (validation.max !== undefined && value > validation.max) {
    errors.push({
      field,
      message: `${field} must be at most ${validation.max}`,
      code: 'MAX_VALUE',
      severity: 'error'
    })
  }
  
  if (validation.pattern && typeof value === 'string') {
    const regex = new RegExp(validation.pattern)
    if (!regex.test(value)) {
      errors.push({
        field,
        message: `${field} does not match required pattern`,
        code: 'PATTERN_MISMATCH',
        severity: 'error'
      })
    }
  }
  
  if (validation.options && !validation.options.includes(value)) {
    errors.push({
      field,
      message: `${field} must be one of: ${validation.options.join(', ')}`,
      code: 'INVALID_OPTION',
      severity: 'error'
    })
  }
  
  if (validation.custom) {
    try {
      const validator = new Function('value', validation.custom)
      if (!validator(value)) {
        errors.push({
          field,
          message: `${field} failed custom validation`,
          code: 'CUSTOM_VALIDATION',
          severity: 'error'
        })
      }
    } catch (error) {
      errors.push({
        field,
        message: `Custom validation error for ${field}`,
        code: 'VALIDATION_ERROR',
        severity: 'warning'
      })
    }
  }
  
  return errors
}

PluginConfigSchema.methods.getSetting = function(key: string, defaultValue?: any): any {
  const value = this.settings[key]
  
  if (value === undefined || value === null) {
    // Check validation schema for default value
    if (this.validationSchema?.[key]?.default !== undefined) {
      return this.validationSchema[key].default
    }
    return defaultValue
  }
  
  // Decrypt if encrypted
  if (this.metadata.encrypted?.includes(key)) {
    return this.decrypt(value)
  }
  
  return value
}

PluginConfigSchema.methods.setSetting = async function(key: string, value: any): Promise<void> {
  // Check if field is readonly
  if (this.metadata.readonly?.includes(key)) {
    throw new Error(`Setting ${key} is readonly`)
  }
  
  // Encrypt if needed
  if (this.metadata.encrypted?.includes(key)) {
    value = this.encrypt(value)
  }
  
  this.settings[key] = value
  await this.save()
}
PluginConfigSchema.methods.resetToDefaults = async function(): Promise<void> {
  const defaultSettings: Record<string, any> = {}
  
  if (this.validationSchema) {
    // Fix: Type the schema properly
    for (const [key, schema] of Object.entries(this.validationSchema) as [string, ValidationSchemaField][]) {
      if (schema.default !== undefined) {
        defaultSettings[key] = schema.default
      }
    }
  }
  
  await this.addToHistory('Reset to defaults')
  this.settings = defaultSettings
  await this.save()
}

PluginConfigSchema.methods.exportConfig = function(): any {
  return {
    pluginId: this.pluginId,
    userId: this.userId,
    isGlobal: this.isGlobal,
    settings: this.getDecryptedSettings(),
    version: this.version,
    environment: this.environment,
    metadata: this.metadata,
    exportedAt: new Date()
  }
}

PluginConfigSchema.methods.getDecryptedSettings = function(): any {
  const settings = { ...this.settings }
  
  if (this.metadata.encrypted) {
    for (const key of this.metadata.encrypted) {
      if (settings[key]) {
        settings[key] = this.decrypt(settings[key])
      }
    }
  }
  
  return settings
}

PluginConfigSchema.methods.importConfig = async function(config: any): Promise<void> {
  await this.addToHistory('Imported configuration')
  
  this.settings = config.settings || {}
  this.version = config.version || this.version
  this.environment = config.environment || this.environment
  this.metadata = { ...this.metadata, ...config.metadata }
  
  // Encrypt sensitive settings
  if (this.metadata.encrypted) {
    for (const key of this.metadata.encrypted) {
      if (this.settings[key]) {
        this.settings[key] = this.encrypt(this.settings[key])
      }
    }
  }
  
  await this.save()
}

PluginConfigSchema.methods.createBackup = async function(): Promise<void> {
  // Implementation would save backup to storage
  console.log(`Creating backup for plugin config ${this.pluginId}`)
}

PluginConfigSchema.methods.restoreFromBackup = async function(backupId: string): Promise<void> {
  // Implementation would restore from backup
  console.log(`Restoring from backup ${backupId} for plugin config ${this.pluginId}`)
}

PluginConfigSchema.methods.encrypt = function(value: any): string {
  const crypto = require('crypto')
  const algorithm = 'aes-256-gcm'
  const secretKey = process.env.PLUGIN_CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production'
  
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipher(algorithm, secretKey)
  
  let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  return `${iv.toString('hex')}:${encrypted}`
}

PluginConfigSchema.methods.decrypt = function(encryptedValue: string): any {
  const crypto = require('crypto')
  const algorithm = 'aes-256-gcm'
  const secretKey = process.env.PLUGIN_CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production'
  
  const [ivHex, encrypted] = encryptedValue.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipher(algorithm, secretKey)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return JSON.parse(decrypted)
}

PluginConfigSchema.methods.addToHistory = async function(reason?: string): Promise<void> {
  this.history.push({
    settings: { ...this.settings },
    updatedBy: this.userId,
    updatedAt: new Date(),
    reason,
    version: this.version
  })
  
  // Keep only last 50 history entries
  if (this.history.length > 50) {
    this.history = this.history.slice(-50)
  }
}

PluginConfigSchema.methods.runCustomValidation = function(
  key: string, 
  value: any, 
  validation: any
): Array<{ field: string; message: string; code: string; severity: 'error' | 'warning' | 'info' }> {
  const errors = []
  
  if (validation.min !== undefined && typeof value === 'number' && value < validation.min) {
    errors.push({
      field: key,
      message: `${key} must be at least ${validation.min}`,
      code: 'MIN_VALUE',
      severity: 'error' as const
    })
  }
  
  if (validation.max !== undefined && typeof value === 'number' && value > validation.max) {
    errors.push({
      field: key,
      message: `${key} must be at most ${validation.max}`,
      code: 'MAX_VALUE',
      severity: 'error' as const
    })
  }
  
  if (validation.pattern && typeof value === 'string') {
    const regex = new RegExp(validation.pattern)
    if (!regex.test(value)) {
      errors.push({
        field: key,
        message: `${key} does not match the required pattern`,
        code: 'PATTERN_MISMATCH',
        severity: 'error' as const
      })
    }
  }
  
  if (validation.options && !validation.options.includes(value)) {
    errors.push({
      field: key,
      message: `${key} must be one of: ${validation.options.join(', ')}`,
      code: 'INVALID_OPTION',
      severity: 'error' as const
    })
  }
  
  return errors
}

// Fix: Constructor and static method typing issues
PluginConfigSchema.methods.clone = async function(newUserId?: string): Promise<PluginConfigDocument> {
  const PluginConfigModel = this.constructor as PluginConfigModel
  
  const cloned = new PluginConfigModel({
    ...this.toObject(),
    _id: undefined,
    userId: newUserId ? new Types.ObjectId(newUserId) : this.userId,
    history: [],
    createdAt: undefined,
    updatedAt: undefined
  })
  
  return await cloned.save()
}

PluginConfigSchema.methods.merge = async function(otherConfig: any): Promise<void> {
  await this.addToHistory('Merged configuration')
  
  this.settings = { ...this.settings, ...otherConfig.settings }
  this.metadata = { ...this.metadata, ...otherConfig.metadata }
  
  await this.save()
}

PluginConfigSchema.methods.optimizePerformance = async function(): Promise<void> {
  const startTime = Date.now()
  
  // Remove unused settings
  if (this.validationSchema) {
    const validKeys = Object.keys(this.validationSchema)
    const currentKeys = Object.keys(this.settings)
    
    for (const key of currentKeys) {
      if (!validKeys.includes(key)) {
        delete this.settings[key]
      }
    }
  }
  
  // Update performance metrics
  const endTime = Date.now()
  this.performance.loadTime = endTime - startTime
  this.performance.lastOptimized = new Date()
  
  await this.save()
}

// Static methods
PluginConfigSchema.statics.findByPlugin = function(pluginId: string) {
  return this.find({ pluginId }).sort({ createdAt: -1 })
}

PluginConfigSchema.statics.findByUser = function(userId: string) {
  return this.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 })
}

PluginConfigSchema.statics.findGlobalConfigs = function() {
  return this.find({ isGlobal: true }).sort({ pluginId: 1 })
}

PluginConfigSchema.statics.findActiveConfigs = function() {
  return this.find({ isActive: true }).sort({ pluginId: 1 })
}

PluginConfigSchema.statics.findByPluginAndUser = function(pluginId: string, userId?: string) {
  const query: any = { pluginId }
  
  if (userId) {
    query.userId = new Types.ObjectId(userId)
  } else {
    query.isGlobal = true
  }
  
  return this.findOne(query)
}

PluginConfigSchema.statics.findByPluginAndUser = function(pluginId: string, userId?: string) {
  const query: any = { pluginId }
  if (userId) {
    query.userId = new Types.ObjectId(userId)
  } else {
    query.isGlobal = true
  }
  return this.findOne(query)
}

PluginConfigSchema.statics.createDefault = async function(pluginId: string, userId?: string) {
  const existingConfig = await (this as PluginConfigModel).findByPluginAndUser(pluginId, userId)
  if (existingConfig) {
    return existingConfig
  }
  
  return await this.create({
    pluginId,
    userId: userId ? new Types.ObjectId(userId) : undefined,
    isGlobal: !userId,
    settings: {},
    isActive: true,
    version: '1.0.0',
    environment: 'production',
    validationSchema: {},
    metadata: {
      source: 'user',
      encrypted: [],
      sensitive: [],
      readonly: [],
      hidden: [],
      dependencies: {},
      overrides: {}
    },
    history: [],
    validationErrors: [],
    performance: {
      loadTime: 0,
      memoryUsage: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastOptimized: new Date()
    }
  })
}
PluginConfigSchema.statics.bulkUpdate = async function(updates: Array<{ pluginId: string; userId?: string; settings: any }>) {
  const results = []
  
  for (const update of updates) {
    try {
      const config = await (this as PluginConfigModel).findByPluginAndUser(update.pluginId, update.userId)
      
      if (config) {
        await config.addToHistory('Bulk update')
        config.settings = { ...config.settings, ...update.settings }
        await config.save()
        results.push({ pluginId: update.pluginId, userId: update.userId, success: true })
      } else {
        results.push({ pluginId: update.pluginId, userId: update.userId, success: false, error: 'Config not found' })
      }
    } catch (error: any) {
      results.push({ pluginId: update.pluginId, userId: update.userId, success: false, error: error.message })
    }
  }
  
  return results
}
PluginConfigSchema.statics.validateAllConfigs = async function() {
  const configs = await this.find({ isActive: true })
  const results = []
  
  for (const config of configs) {
    const isValid = await config.validateSettings()
    results.push({
      pluginId: config.pluginId,
      userId: config.userId,
      isValid,
      errors: config.validationErrors
    })
  }
  
  return results
}

PluginConfigSchema.statics.cleanupInactive = async function() {
  const result = await this.deleteMany({
    isActive: false,
    updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days old
  })
  
  return result.deletedCount || 0
}

PluginConfigSchema.statics.getConfigStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalConfigs: { $sum: 1 },
        activeConfigs: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        globalConfigs: { $sum: { $cond: [{ $eq: ['$isGlobal', true] }, 1, 0] } },
        userConfigs: { $sum: { $cond: [{ $eq: ['$isGlobal', false] }, 1, 0] } },
        pluginCount: { $addToSet: '$pluginId' },
        averageLoadTime: { $avg: '$performance.loadTime' }
      }
    }
  ])
  
  const result = stats[0] || {
    totalConfigs: 0,
    activeConfigs: 0,
    globalConfigs: 0,
    userConfigs: 0,
    pluginCount: [],
    averageLoadTime: 0
  }
  
  result.uniquePlugins = result.pluginCount.length
  delete result.pluginCount
  
  return result
}

// Pre-save middleware
PluginConfigSchema.pre('save', async function() {
  if (this.isModified('settings')) {
    await this.addToHistory()
    await this.validateSettings()
  }
})

export const PluginConfig = mongoose.model<PluginConfigDocument, PluginConfigModel>('PluginConfig', PluginConfigSchema)