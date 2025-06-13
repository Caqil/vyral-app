import mongoose, { Schema, Model, Types } from 'mongoose'
import { PluginStatus, PluginCategory } from '@/core/types/plugin'

// Base interface without Document
export interface IPlugin {
  _id?: Types.ObjectId
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  authorEmail?: string
  website?: string
  repository?: string
  license: string
  category: PluginCategory
  tags: string[]
  manifest: {
    version: string
    name: string
    displayName: string
    description: string
    author: string
    license: string
    category: PluginCategory
    tags: string[]
    main: string
    api?: {
      routes: Array<{
        method: string
        path: string
        handler: string
        middleware?: string[]
        permissions?: string[]
        description?: string
      }>
      middleware?: string[]
    }
    ui?: {
      components: Array<{
        name: string
        file: string
        props?: Array<{
          name: string
          type: string
          required: boolean
          default?: any
          description?: string
        }>
        description?: string
      }>
      pages?: Array<{
        path: string
        component: string
        title?: string
        description?: string
        permissions?: string[]
      }>
      hooks: Array<{
        name: string
        handler: string
        priority?: number
      }>
      styles?: string[]
      assets?: string[]
    }
    hooks?: {
      api?: string[]
      ui?: string[]
      system?: string[]
      user?: string[]
      content?: string[]
      custom?: Record<string, string>
    }
    permissions?: Array<{
      name: string
      description: string
      scope: string
      required: boolean
      dangerous?: boolean
    }>
    dependencies?: Array<{
      name: string
      version: string
      type: string
      required: boolean
    }>
    settings?: Array<{
      key: string
      name: string
      description: string
      type: string
      default?: any
      required: boolean
      options?: Array<{
        label: string
        value: any
        description?: string
      }>
      validation?: {
        min?: number
        max?: number
        pattern?: string
        custom?: string
      }
      group?: string
    }>
    assets?: Array<{
      type: string
      path: string
      publicPath?: string
      inline?: boolean
    }>
    database?: {
      models?: Array<{
        name: string
        file: string
        collection?: string
      }>
      migrations?: string[]
      seeders?: string[]
    }
    requirements?: {
      nodeVersion?: string
      platformVersion?: string
      plugins?: string[]
      features?: string[]
    }
    metadata?: Record<string, any>
  }
  status: PluginStatus
  isSystemPlugin: boolean
  installPath: string
  size: number
  downloadCount: number
  rating: number
  reviewCount: number
  installedAt: Date
  updatedAt: Date
  lastActivatedAt?: Date
  activationHistory: Array<{
    action: 'activated' | 'deactivated'
    timestamp: Date
    userId?: Types.ObjectId
    reason?: string
    version: string
  }>
  errorHistory: Array<{
    error: string
    stack?: string
    timestamp: Date
    context?: Record<string, any>
    resolved: boolean
    resolvedAt?: Date
  }>
  performance: {
    loadTime: number
    memoryUsage: number
    cpuUsage: number
    networkRequests: number
    cacheHitRate: number
    errorRate: number
    uptime: number
    lastMeasured: Date
  }
  security: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    vulnerabilities: Array<{
      type: string
      severity: string
      description: string
      fixedIn?: string
      reportedAt: Date
    }>
    scanResults: Array<{
      scanner: string
      version: string
      timestamp: Date
      passed: boolean
      issues: Array<{
        type: string
        severity: string
        message: string
        file?: string
        line?: number
      }>
    }>
    permissions: string[]
    sandboxed: boolean
    verified: boolean
    signature?: string
  }
  marketplace: {
    featured: boolean
    verified: boolean
    price: number
    currency: string
    purchaseCount: number
    revenue: number
    screenshots: string[]
    documentation?: string
    changelog?: string
    support?: {
      email?: string
      website?: string
      documentation?: string
    }
  }
  analytics: {
    installations: number
    activations: number
    uninstalls: number
    dailyActiveUsers: number
    monthlyActiveUsers: number
    apiCalls: number
    errors: number
    crashes: number
    reviews: Array<{
      userId: Types.ObjectId
      rating: number
      title?: string
      comment?: string
      version: string
      helpful: number
      verified: boolean
      timestamp: Date
    }>
  }
  createdAt: Date
}

// Document interface for instance methods
export interface PluginDocument extends IPlugin, mongoose.Document {
  activate(userId?: string): Promise<boolean>
  deactivate(userId?: string): Promise<boolean>
  updateVersion(newVersion: string): Promise<void>
  addError(error: string, stack?: string, context?: any): Promise<void>
  resolveError(errorId: string): Promise<void>
  updatePerformance(metrics: any): Promise<void>
  addSecurityScan(results: any): Promise<void>
  addReview(review: any): Promise<void>
  updateDownloadCount(): Promise<void>
  calculateRating(): Promise<number>
  isCompatible(requirements: any): boolean
  hasPermission(permission: string): boolean
  getDependencies(): string[]
  validateManifest(): boolean
  backup(): Promise<string>
  restore(backupId: string): Promise<void>
  clone(): Promise<PluginDocument>
}

// Model interface for static methods
export interface PluginModel extends Model<PluginDocument> {
  findByCategory(category: PluginCategory): Promise<PluginDocument[]>
  findByStatus(status: PluginStatus): Promise<PluginDocument[]>
  findSystemPlugins(): Promise<PluginDocument[]>
  findUserPlugins(): Promise<PluginDocument[]>
  searchPlugins(query: string, filters?: any): Promise<PluginDocument[]>
  findPopular(limit?: number): Promise<PluginDocument[]>
  findFeatured(): Promise<PluginDocument[]>
  findByAuthor(author: string): Promise<PluginDocument[]>
  getAnalytics(): Promise<any>
  cleanupInactive(): Promise<number>
  validateAll(): Promise<any[]>
}

const PluginSchema = new Schema<PluginDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: (id: string) => /^[a-zA-Z0-9-_]+$/.test(id),
      message: 'Plugin ID can only contain letters, numbers, hyphens, and underscores'
    }
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  version: {
    type: String,
    required: true,
    validate: {
      validator: (version: string) => /^\d+\.\d+\.\d+/.test(version),
      message: 'Version must follow semantic versioning'
    }
  },
  author: {
    type: String,
    required: true,
    index: true
  },
  authorEmail: String,
  website: String,
  repository: String,
  license: {
    type: String,
    required: true,
    default: 'MIT'
  },
  category: {
    type: String,
    enum: Object.values(PluginCategory),
    required: true,
    index: true
  },
  tags: [String],
  manifest: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(manifest: any) {
        return manifest && 
               manifest.name && 
               manifest.version && 
               manifest.main &&
               manifest.description
      },
      message: 'Plugin manifest is invalid'
    }
  },
  status: {
    type: String,
    enum: Object.values(PluginStatus),
    default: PluginStatus.INSTALLED,
    index: true
  },
  isSystemPlugin: {
    type: Boolean,
    default: false,
    index: true
  },
  installPath: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    default: 0,
    min: 0
  },
  downloadCount: {
    type: Number,
    default: 0,
    min: 0,
    index: true
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
    index: true
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  installedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastActivatedAt: Date,
  activationHistory: [{
    action: {
      type: String,
      enum: ['activated', 'deactivated'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    version: {
      type: String,
      required: true
    }
  }],
  errorHistory: [{
    error: {
      type: String,
      required: true
    },
    stack: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    context: Schema.Types.Mixed,
    resolved: {
      type: Boolean,
      default: false
    },
    resolvedAt: Date
  }],
  performance: {
    loadTime: { type: Number, default: 0 },
    memoryUsage: { type: Number, default: 0 },
    cpuUsage: { type: Number, default: 0 },
    networkRequests: { type: Number, default: 0 },
    cacheHitRate: { type: Number, default: 0 },
    errorRate: { type: Number, default: 0 },
    uptime: { type: Number, default: 0 },
    lastMeasured: { type: Date, default: Date.now }
  },
  security: {
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    vulnerabilities: [{
      type: String,
      severity: String,
      description: String,
      fixedIn: String,
      reportedAt: { type: Date, default: Date.now }
    }],
    scanResults: [{
      scanner: String,
      version: String,
      timestamp: { type: Date, default: Date.now },
      passed: Boolean,
      issues: [{
        type: String,
        severity: String,
        message: String,
        file: String,
        line: Number
      }]
    }],
    permissions: [String],
    sandboxed: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    signature: String
  },
  marketplace: {
    featured: { type: Boolean, default: false, index: true },
    verified: { type: Boolean, default: false, index: true },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD' },
    purchaseCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    screenshots: [String],
    documentation: String,
    changelog: String,
    support: {
      email: String,
      website: String,
      documentation: String
    }
  },
  analytics: {
    installations: { type: Number, default: 0 },
    activations: { type: Number, default: 0 },
    uninstalls: { type: Number, default: 0 },
    dailyActiveUsers: { type: Number, default: 0 },
    monthlyActiveUsers: { type: Number, default: 0 },
    apiCalls: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    crashes: { type: Number, default: 0 },
    reviews: [{
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      rating: { type: Number, required: true, min: 1, max: 5 },
      title: String,
      comment: String,
      version: { type: String, required: true },
      helpful: { type: Number, default: 0 },
      verified: { type: Boolean, default: false },
      timestamp: { type: Date, default: Date.now }
    }]
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
      return ret
    }
  }
})

// Indexes
PluginSchema.index({ id: 1 })
PluginSchema.index({ category: 1, status: 1 })
PluginSchema.index({ author: 1 })
PluginSchema.index({ tags: 1 })
PluginSchema.index({ rating: -1, downloadCount: -1 })
PluginSchema.index({ 'marketplace.featured': 1, rating: -1 })
PluginSchema.index({ isSystemPlugin: 1, status: 1 })
PluginSchema.index({ installedAt: -1 })
PluginSchema.index({ updatedAt: -1 })

// Instance methods
PluginSchema.methods.activate = async function(userId?: string): Promise<boolean> {
  if (this.status === PluginStatus.ACTIVE) {
    return true
  }
  
  try {
    this.status = PluginStatus.ACTIVE
    this.lastActivatedAt = new Date()
    
    this.activationHistory.push({
      action: 'activated',
      timestamp: new Date(),
      userId: userId ? new Types.ObjectId(userId) : undefined,
      version: this.version
    })
    
    this.analytics.activations += 1
    
    await this.save()
    return true
  } catch (error) {
    await this.addError(`Activation failed: ${error}`)
    return false
  }
}

PluginSchema.methods.deactivate = async function(userId?: string): Promise<boolean> {
  if (this.status !== PluginStatus.ACTIVE) {
    return true
  }
  
  try {
    this.status = PluginStatus.INACTIVE
    
    this.activationHistory.push({
      action: 'deactivated',
      timestamp: new Date(),
      userId: userId ? new Types.ObjectId(userId) : undefined,
      version: this.version
    })
    
    await this.save()
    return true
  } catch (error) {
    await this.addError(`Deactivation failed: ${error}`)
    return false
  }
}

PluginSchema.methods.updateVersion = async function(newVersion: string): Promise<void> {
  this.version = newVersion
  this.manifest.version = newVersion
  await this.save()
}

PluginSchema.methods.addError = async function(error: string, stack?: string, context?: any): Promise<void> {
  this.errorHistory.push({
    error,
    stack,
    timestamp: new Date(),
    context,
    resolved: false
  })
  
  this.analytics.errors += 1
  
  // Keep only last 100 errors
  if (this.errorHistory.length > 100) {
    this.errorHistory = this.errorHistory.slice(-100)
  }
  
  await this.save()
}

PluginSchema.methods.resolveError = async function(errorId: string): Promise<void> {
  const error = this.errorHistory.id(errorId)
  if (error) {
    error.resolved = true
    error.resolvedAt = new Date()
    await this.save()
  }
}

PluginSchema.methods.updatePerformance = async function(metrics: any): Promise<void> {
  this.performance = {
    ...this.performance,
    ...metrics,
    lastMeasured: new Date()
  }
  await this.save()
}

PluginSchema.methods.addSecurityScan = async function(results: any): Promise<void> {
  this.security.scanResults.push({
    ...results,
    timestamp: new Date()
  })
  
  // Keep only last 10 scan results
  if (this.security.scanResults.length > 10) {
    this.security.scanResults = this.security.scanResults.slice(-10)
  }
  
  // Update risk level based on latest scan
  const latestScan = this.security.scanResults[this.security.scanResults.length - 1]
  if (latestScan.issues?.length > 0) {
    const criticalIssues = latestScan.issues.filter(i => i.severity === 'critical')
    const highIssues = latestScan.issues.filter(i => i.severity === 'high')
    
    if (criticalIssues.length > 0) {
      this.security.riskLevel = 'critical'
    } else if (highIssues.length > 0) {
      this.security.riskLevel = 'high'
    } else {
      this.security.riskLevel = 'medium'
    }
  } else {
    this.security.riskLevel = 'low'
  }
  
  await this.save()
}

PluginSchema.methods.addReview = async function(review: any): Promise<void> {
  this.analytics.reviews.push({
    ...review,
    timestamp: new Date()
  })
  
  this.reviewCount += 1
  this.rating = await this.calculateRating()
  
  await this.save()
}

PluginSchema.methods.updateDownloadCount = async function(): Promise<void> {
  this.downloadCount += 1
  this.analytics.installations += 1
  await this.save()
}

PluginSchema.methods.calculateRating = async function(): Promise<number> {
  if (this.analytics.reviews.length === 0) {
    return 0
  }
  
  const totalRating = this.analytics.reviews.reduce((sum, review) => sum + review.rating, 0)
  return Math.round((totalRating / this.analytics.reviews.length) * 10) / 10
}

PluginSchema.methods.isCompatible = function(requirements: any): boolean {
  if (!this.manifest.requirements) {
    return true
  }
  
  const pluginRequirements = this.manifest.requirements
  
  // Check Node.js version
  if (pluginRequirements.nodeVersion && requirements.nodeVersion) {
    // Simple version comparison - in production would use semver
    if (pluginRequirements.nodeVersion > requirements.nodeVersion) {
      return false
    }
  }
  
  // Check platform version
  if (pluginRequirements.platformVersion && requirements.platformVersion) {
    if (pluginRequirements.platformVersion > requirements.platformVersion) {
      return false
    }
  }
  
  return true
}

PluginSchema.methods.hasPermission = function(permission: string): boolean {
  return this.security.permissions.includes(permission) || 
         this.security.permissions.includes('*')
}

PluginSchema.methods.getDependencies = function(): string[] {
  return this.manifest.dependencies?.map(dep => dep.name) || []
}

PluginSchema.methods.validateManifest = function(): boolean {
  const manifest = this.manifest
  
  if (!manifest) return false
  if (!manifest.name || !manifest.version || !manifest.main) return false
  if (!manifest.description || !manifest.author) return false
  
  return true
}

PluginSchema.methods.backup = async function(): Promise<string> {
  const backupId = `${this.id}-${Date.now()}`
  // Implementation would create backup
  return backupId
}

PluginSchema.methods.restore = async function(backupId: string): Promise<void> {
  // Implementation would restore from backup
  console.log(`Restoring plugin ${this.id} from backup ${backupId}`)
}

PluginSchema.methods.clone = async function(): Promise<PluginDocument> {
  const cloned = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    id: `${this.id}_copy_${Date.now()}`,
    name: `${this.name}_copy`,
    displayName: `${this.displayName} (Copy)`,
    downloadCount: 0,
    rating: 0,
    reviewCount: 0,
    analytics: {
      ...this.analytics,
      installations: 0,
      activations: 0,
      reviews: []
    }
  })
  
  return await cloned.save()
}

// Static methods
PluginSchema.statics.findByCategory = function(category: PluginCategory) {
  return this.find({ category }).sort({ rating: -1, downloadCount: -1 })
}

PluginSchema.statics.findByStatus = function(status: PluginStatus) {
  return this.find({ status }).sort({ updatedAt: -1 })
}

PluginSchema.statics.findSystemPlugins = function() {
  return this.find({ isSystemPlugin: true }).sort({ name: 1 })
}

PluginSchema.statics.findUserPlugins = function() {
  return this.find({ isSystemPlugin: false }).sort({ installedAt: -1 })
}

PluginSchema.statics.searchPlugins = function(query: string, filters: any = {}) {
  const searchRegex = new RegExp(query, 'i')
  const searchQuery = {
    $or: [
      { name: searchRegex },
      { displayName: searchRegex },
      { description: searchRegex },
      { tags: { $in: [searchRegex] } },
      { author: searchRegex }
    ],
    ...filters
  }
  
  return this.find(searchQuery).sort({ rating: -1, downloadCount: -1 })
}

PluginSchema.statics.findPopular = function(limit: number = 10) {
  return this.find({ status: PluginStatus.ACTIVE })
    .sort({ downloadCount: -1, rating: -1 })
    .limit(limit)
}

PluginSchema.statics.findFeatured = function() {
  return this.find({ 'marketplace.featured': true })
    .sort({ rating: -1, downloadCount: -1 })
}

PluginSchema.statics.findByAuthor = function(author: string) {
  return this.find({ author }).sort({ updatedAt: -1 })
}

PluginSchema.statics.getAnalytics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalPlugins: { $sum: 1 },
        activePlugins: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        systemPlugins: { $sum: { $cond: [{ $eq: ['$isSystemPlugin', true] }, 1, 0] } },
        userPlugins: { $sum: { $cond: [{ $eq: ['$isSystemPlugin', false] }, 1, 0] } },
        totalDownloads: { $sum: '$downloadCount' },
        averageRating: { $avg: '$rating' },
        totalSize: { $sum: '$size' },
        pluginsByCategory: { $push: '$category' }
      }
    }
  ])
  
  return stats[0] || {
    totalPlugins: 0,
    activePlugins: 0,
    systemPlugins: 0,
    userPlugins: 0,
    totalDownloads: 0,
    averageRating: 0,
    totalSize: 0,
    pluginsByCategory: []
  }
}

PluginSchema.statics.cleanupInactive = async function() {
  const result = await this.deleteMany({
    status: PluginStatus.INACTIVE,
    isSystemPlugin: false,
    updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days old
  })
  
  return result.deletedCount || 0
}

PluginSchema.statics.validateAll = async function() {
  const plugins = await this.find({})
  const results = []
  
  for (const plugin of plugins) {
    const isValid = plugin.validateManifest()
    const hasErrors = plugin.errorHistory.some(e => !e.resolved)
    
    results.push({
      id: plugin.id,
      name: plugin.name,
      isValid,
      hasErrors,
      errorCount: plugin.errorHistory.filter(e => !e.resolved).length,
      lastError: plugin.errorHistory.length > 0 ? plugin.errorHistory[plugin.errorHistory.length - 1] : null
    })
  }
  
  return results
}

export const Plugin = mongoose.model<PluginDocument, PluginModel>('Plugin', PluginSchema)