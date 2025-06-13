import mongoose, { Schema, Model, Types } from 'mongoose'
import { ConfigType, ConfigCategory } from '@/core/types/system'

// Base interface without Document
export interface ISystemConfig {
  _id?: Types.ObjectId
  key: string
  value: any
  type: ConfigType
  category: ConfigCategory
  description?: string
  isPublic: boolean
  isRequired: boolean
  isReadOnly: boolean
  isSecret: boolean
  defaultValue?: any
  validation?: {
    type: 'range' | 'pattern' | 'options' | 'custom'
    min?: number
    max?: number
    pattern?: string
    options?: any[]
    custom?: string
    message?: string
  }
  tags: string[]
  environment: 'development' | 'staging' | 'production' | 'all'
  version: string
  history: Array<{
    oldValue: any
    newValue: any
    updatedBy?: Types.ObjectId
    updatedAt: Date
    reason?: string
    ipAddress?: string
    userAgent?: string
  }>
  lastModified: Date
  updatedBy?: Types.ObjectId
  expiresAt?: Date
  metadata: {
    source: 'system' | 'plugin' | 'user' | 'import'
    pluginId?: string
    format?: string
    sensitive: boolean
    encrypted: boolean
    dependencies: string[]
    affects: string[]
    restartRequired: boolean
  }
  createdAt: Date
  updatedAt: Date
}

// Document interface for instance methods
export interface SystemConfigDocument extends ISystemConfig, mongoose.Document {
  getValue(): any
  setValue(value: any): Promise<void>
  isExpired(): boolean
  validateValue(value: any): boolean
  addToHistory(oldValue: any, newValue: any, updatedBy?: string): Promise<void>
  clone(): Promise<SystemConfigDocument>
  encryptValue(value: any): string
  decryptValue(encryptedValue: string): any
  runValidation(value: any): boolean
}

// Model interface for static methods
export interface SystemConfigModel extends Model<SystemConfigDocument> {
  findByKey(key: string): Promise<SystemConfigDocument | null>
  findByCategory(category: ConfigCategory): Promise<SystemConfigDocument[]>
  findPublic(): Promise<SystemConfigDocument[]>
  findByEnvironment(environment: string): Promise<SystemConfigDocument[]>
  findByPlugin(pluginId: string): Promise<SystemConfigDocument[]>
  searchConfigs(query: string): Promise<SystemConfigDocument[]>
  getConfigValue(key: string, defaultValue?: any): Promise<any>
  setConfigValue(key: string, value: any, updatedBy?: string): Promise<SystemConfigDocument>
  createConfig(configData: Partial<ISystemConfig>): Promise<SystemConfigDocument>
  bulkUpdate(configs: Array<{ key: string; value: any }>, updatedBy?: string): Promise<any[]>
  exportConfigs(category?: ConfigCategory, includeSecrets?: boolean): Promise<any[]>
  importConfigs(configs: Array<Partial<ISystemConfig>>, updatedBy?: string, overwrite?: boolean): Promise<any[]>
  cleanupExpired(): Promise<number>
}

const SystemConfigSchema = new Schema<SystemConfigDocument>({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
    validate: {
      validator: (key: string) => /^[a-zA-Z0-9_.]+$/.test(key),
      message: 'Config key can only contain letters, numbers, dots, and underscores'
    }
  },
  value: {
    type: Schema.Types.Mixed,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(ConfigType),
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: Object.values(ConfigCategory),
    required: true,
    index: true
  },
  description: String,
  isPublic: {
    type: Boolean,
    default: false,
    index: true
  },
  isRequired: {
    type: Boolean,
    default: false,
    index: true
  },
  isReadOnly: {
    type: Boolean,
    default: false
  },
  isSecret: {
    type: Boolean,
    default: false
  },
  defaultValue: Schema.Types.Mixed,
  validation: {
    type: {
      type: String,
      enum: ['range', 'pattern', 'options', 'custom']
    },
    min: Number,
    max: Number,
    pattern: String,
    options: [Schema.Types.Mixed],
    custom: String,
    message: String
  },
  tags: [String],
  environment: {
    type: String,
    enum: ['development', 'staging', 'production', 'all'],
    default: 'all',
    index: true
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  history: [{
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
    reason: String,
    ipAddress: String,
    userAgent: String
  }],
  lastModified: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 }
  },
  metadata: {
    source: {
      type: String,
      enum: ['system', 'plugin', 'user', 'import'],
      default: 'system'
    },
    pluginId: String,
    format: String,
    sensitive: { type: Boolean, default: false },
    encrypted: { type: Boolean, default: false },
    dependencies: [String],
    affects: [String],
    restartRequired: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
      
      if (ret.isSecret || ret.metadata?.sensitive) {
        ret.value = '[HIDDEN]'
      }
      
      return ret
    }
  }
})

// Indexes
SystemConfigSchema.index({ key: 1 })
SystemConfigSchema.index({ category: 1, type: 1 })
SystemConfigSchema.index({ isPublic: 1, isRequired: 1 })
SystemConfigSchema.index({ environment: 1 })
SystemConfigSchema.index({ 'metadata.pluginId': 1 })
SystemConfigSchema.index({ lastModified: -1 })

// Instance methods
SystemConfigSchema.methods.getValue = function(): any {
  if (this.expiresAt && this.expiresAt < new Date()) {
    return this.defaultValue
  }
  
  if (this.metadata?.encrypted && (this.isSecret || this.metadata?.sensitive)) {
    return this.decryptValue(this.value)
  }
  
  return this.value
}

SystemConfigSchema.methods.setValue = async function(value: any): Promise<void> {
  if (this.isReadOnly) {
    throw new Error(`Cannot modify read-only config: ${this.key}`)
  }
  
  if (!this.validateValue(value)) {
    throw new Error(`Invalid value for config: ${this.key}`)
  }
  
  this.value = value
  this.lastModified = new Date()
  await this.save()
}

SystemConfigSchema.methods.isExpired = function(): boolean {
  return !!(this.expiresAt && this.expiresAt < new Date())
}

SystemConfigSchema.methods.validateValue = function(value: any): boolean {
  if (value === null || value === undefined) {
    return !this.isRequired
  }
  
  switch (this.type) {
    case ConfigType.STRING:
      if (typeof value !== 'string') return false
      break
    case ConfigType.NUMBER:
      if (typeof value !== 'number' || isNaN(value)) return false
      break
    case ConfigType.BOOLEAN:
      if (typeof value !== 'boolean') return false
      break
    case ConfigType.ARRAY:
      if (!Array.isArray(value)) return false
      break
    case ConfigType.JSON:
      try {
        if (typeof value === 'string') {
          JSON.parse(value)
        } else if (typeof value !== 'object') {
          return false
        }
      } catch {
        return false
      }
      break
  }
  
  if (this.validation) {
    return this.runValidation(value)
  }
  
  return true
}

SystemConfigSchema.methods.runValidation = function(value: any): boolean {
  const validation = this.validation
  if (!validation) return true
  
  switch (validation.type) {
    case 'range':
      if (typeof value === 'number') {
        if (validation.min !== undefined && value < validation.min) return false
        if (validation.max !== undefined && value > validation.max) return false
      }
      break
      
    case 'pattern':
      if (typeof value === 'string' && validation.pattern) {
        const regex = new RegExp(validation.pattern)
        if (!regex.test(value)) return false
      }
      break
      
    case 'options':
      if (validation.options && !validation.options.includes(value)) {
        return false
      }
      break
      
    case 'custom':
      if (validation.custom) {
        try {
          const validator = new Function('value', validation.custom)
          return validator(value)
        } catch {
          return false
        }
      }
      break
  }
  
  return true
}

SystemConfigSchema.methods.addToHistory = async function(
  oldValue: any, 
  newValue: any, 
  updatedBy?: string
): Promise<void> {
  this.history.push({
    oldValue,
    newValue,
    updatedBy: updatedBy ? new Types.ObjectId(updatedBy) : undefined,
    updatedAt: new Date()
  })
  
  if (this.history.length > 100) {
    this.history = this.history.slice(-100)
  }
}

SystemConfigSchema.methods.clone = async function(): Promise<SystemConfigDocument> {
  const cloned = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    key: `${this.key}_copy_${Date.now()}`,
    history: []
  })
  
  return await cloned.save()
}

SystemConfigSchema.methods.encryptValue = function(value: any): string {
  const crypto = require('crypto')
  const algorithm = 'aes-256-gcm'
  const secretKey = process.env.CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production'
  
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipher(algorithm, secretKey)
  
  let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  return `${iv.toString('hex')}:${encrypted}`
}

SystemConfigSchema.methods.decryptValue = function(encryptedValue: string): any {
  const crypto = require('crypto')
  const algorithm = 'aes-256-gcm'
  const secretKey = process.env.CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production'
  
  const [ivHex, encrypted] = encryptedValue.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipher(algorithm, secretKey)
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return JSON.parse(decrypted)
}

// Static methods
SystemConfigSchema.statics.findByKey = function(key: string) {
  return this.findOne({ key })
}

SystemConfigSchema.statics.findByCategory = function(category: ConfigCategory) {
  return this.find({ category }).sort({ key: 1 })
}

SystemConfigSchema.statics.findPublic = function() {
  return this.find({ isPublic: true }).sort({ category: 1, key: 1 })
}

SystemConfigSchema.statics.findByEnvironment = function(environment: string) {
  return this.find({ 
    $or: [{ environment }, { environment: 'all' }]
  }).sort({ key: 1 })
}

SystemConfigSchema.statics.findByPlugin = function(pluginId: string) {
  return this.find({ 'metadata.pluginId': pluginId }).sort({ key: 1 })
}

SystemConfigSchema.statics.searchConfigs = function(query: string) {
  const searchRegex = new RegExp(query, 'i')
  return this.find({
    $or: [
      { key: searchRegex },
      { description: searchRegex },
      { tags: { $in: [searchRegex] } }
    ]
  }).sort({ key: 1 })
}

SystemConfigSchema.statics.getConfigValue = async function(key: string, defaultValue?: any) {
  const config = await this.findByKey(key)
  if (!config) return defaultValue
  
  if (config.isExpired()) return config.defaultValue || defaultValue
  
  return config.getValue()
}

SystemConfigSchema.statics.setConfigValue = async function(
  key: string, 
  value: any, 
  updatedBy?: string
) {
  const config = await this.findByKey(key)
  if (!config) {
    throw new Error(`Config not found: ${key}`)
  }
  
  config.updatedBy = updatedBy ? new Types.ObjectId(updatedBy) : undefined
  await config.setValue(value)
  
  return config
}

SystemConfigSchema.statics.createConfig = async function(configData: Partial<ISystemConfig>) {
  const existingConfig = await this.findByKey(configData.key!)
  if (existingConfig) {
    throw new Error(`Config already exists: ${configData.key}`)
  }
  
  return await this.create(configData)
}

SystemConfigSchema.statics.bulkUpdate = async function(
  configs: Array<{ key: string; value: any }>,
  updatedBy?: string
) {
  const results = []
  
  for (const { key, value } of configs) {
    try {
      const config = await this.setConfigValue(key, value, updatedBy)
      results.push({ key, success: true, config })
    } catch (error: any) {
      results.push({ key, success: false, error: error.message })
    }
  }
  
  return results
}

SystemConfigSchema.statics.exportConfigs = async function(
  category?: ConfigCategory,
  includeSecrets: boolean = false
) {
  const query: any = {}
  if (category) query.category = category
  if (!includeSecrets) query.isSecret = { $ne: true }
  
  const configs = await this.find(query).sort({ key: 1 })
  
  return configs.map(config => ({
    key: config.key,
    value: includeSecrets ? config.getValue() : (config.isSecret ? '[HIDDEN]' : config.value),
    type: config.type,
    category: config.category,
    description: config.description,
    isPublic: config.isPublic,
    isRequired: config.isRequired,
    defaultValue: config.defaultValue,
    tags: config.tags,
    environment: config.environment
  }))
}

SystemConfigSchema.statics.importConfigs = async function(
  configs: Array<Partial<ISystemConfig>>,
  updatedBy?: string,
  overwrite: boolean = false
) {
  const results = []
  
  for (const configData of configs) {
    try {
      const existingConfig = await this.findByKey(configData.key!)
      
      if (existingConfig && !overwrite) {
        results.push({ 
          key: configData.key, 
          success: false, 
          error: 'Config already exists' 
        })
        continue
      }
      
      if (existingConfig && overwrite) {
        existingConfig.value = configData.value
        existingConfig.updatedBy = updatedBy ? new Types.ObjectId(updatedBy) : undefined
        await existingConfig.save()
        results.push({ key: configData.key, success: true, action: 'updated' })
      } else {
        await this.create({
          ...configData,
          updatedBy: updatedBy ? new Types.ObjectId(updatedBy) : undefined
        })
        results.push({ key: configData.key, success: true, action: 'created' })
      }
    } catch (error: any) {
      results.push({ 
        key: configData.key, 
        success: false, 
        error: error.message 
      })
    }
  }
  
  return results
}

SystemConfigSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
    isRequired: { $ne: true }
  })
  
  return result.deletedCount || 0
}

// Pre-save middleware
SystemConfigSchema.pre('save', async function() {
  if (this.isModified('value')) {
    if (!this.validateValue(this.value)) {
      throw new Error(`Invalid value for config key: ${this.key}`)
    }
    
    if (this.isModified('value') && !this.isNew) {
      const oldDoc = await this.constructor.findById(this._id)
      if (oldDoc && oldDoc.value !== this.value) {
        await this.addToHistory(oldDoc.value, this.value, this.updatedBy?.toString())
      }
    }
    
    this.lastModified = new Date()
  }
  
  if ((this.isSecret || this.metadata?.sensitive) && this.metadata?.encrypted) {
    this.value = this.encryptValue(this.value)
  }
})

export const SystemConfig = mongoose.model<SystemConfigDocument, SystemConfigModel>('SystemConfig', SystemConfigSchema)