import mongoose, { Schema, Model, Types } from 'mongoose'

// Base interface without Document
export interface ISession {
  userId: Types.ObjectId
  token: string
  refreshToken?: string
  expiresAt: Date
  lastActiveAt: Date
  ipAddress?: string
  userAgent?: string
  isActive: boolean
  deviceInfo: {
    type: 'desktop' | 'mobile' | 'tablet' | 'unknown'
    os?: string
    browser?: string
    version?: string
    fingerprint?: string
  }
  location?: {
    country?: string
    region?: string
    city?: string
    latitude?: number
    longitude?: number
    timezone?: string
  }
  metadata: {
    loginMethod: 'password' | 'oauth' | 'token' | 'magic_link' | '2fa'
    oauthProvider?: 'google' | 'github' | 'twitter' | 'discord' | 'facebook'
    rememberMe: boolean
    twoFactorVerified: boolean
    riskScore: number
    flags: Array<'suspicious' | 'verified' | 'trusted_device' | 'new_location' | 'concurrent_session' | 'admin_session' | 'api_session'>
  }
  permissions: Array<{
    resource: string
    actions: string[]
    scope: 'global' | 'own' | 'none'
    expiresAt?: Date
  }>
  securityEvents: Array<{
    type: 'login' | 'logout' | 'refresh' | 'suspicious_activity' | 'location_change' | 'device_change' | 'failed_auth' | 'session_hijack_attempt' | 'concurrent_session' | 'force_logout'
    timestamp: Date
    ipAddress?: string
    userAgent?: string
    data?: any
    severity: 'low' | 'medium' | 'high' | 'critical'
    location?: {
      country?: string
      region?: string
      city?: string
      latitude?: number
      longitude?: number
    }
  }>
  renewalCount: number
  maxRenewals: number
  forceLogoutAt?: Date
  lastRenewedAt?: Date
  invalidatedAt?: Date
  invalidatedBy?: Types.ObjectId
  invalidationReason?: 'user_logout' | 'admin_action' | 'security_breach' | 'expired' | 'device_change' | 'location_change' | 'suspicious_activity' | 'password_change' | 'account_locked'
  createdAt: Date
  updatedAt: Date
}
export interface SessionDocument extends ISession, mongoose.Document<Types.ObjectId> {
  isValid(): boolean
  isExpired(): boolean
  refresh(): Promise<void>
  invalidateSession(): Promise<void>  // Renamed to avoid conflict with mongoose.Document.invalidate()
  updateActivity(ipAddress?: string, userAgent?: string): Promise<void>
  generateToken(): string
  addSecurityEvent(event: string, data?: any): Promise<void>
  isFromSameDevice(userAgent?: string): boolean
  shouldRenew(): boolean
  calculateRiskScore(): Promise<number>
  parseUserAgent(userAgent: string): any
}

// Model interface for static methods
export interface SessionModel extends Model<SessionDocument> {
  findByToken(token: string): Promise<SessionDocument | null>
  findByUserId(userId: string): Promise<SessionDocument[]>
  findActiveSessions(userId?: string): Promise<SessionDocument[]>
  cleanupExpiredSessions(): Promise<number>
  invalidateUserSessions(userId: string, reason?: string): Promise<number>
  getSessionStats(): Promise<any>
}

const SessionSchema = new Schema<SessionDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  refreshToken: {
    type: String,
    unique: true,
    sparse: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: String,
  userAgent: String,
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  deviceInfo: {
    type: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },
    os: String,
    browser: String,
    version: String,
    fingerprint: String
  },
  location: {
    country: String,
    region: String,
    city: String,
    latitude: Number,
    longitude: Number,
    timezone: String
  },
  metadata: {
    loginMethod: {
      type: String,
      enum: ['password', 'oauth', 'token', 'magic_link', '2fa'],
      default: 'password'
    },
    oauthProvider: {
      type: String,
      enum: ['google', 'github', 'twitter', 'discord', 'facebook']
    },
    rememberMe: { type: Boolean, default: false },
    twoFactorVerified: { type: Boolean, default: false },
    riskScore: { type: Number, min: 0, max: 100, default: 0 },
    flags: [{
      type: String,
      enum: ['suspicious', 'verified', 'trusted_device', 'new_location', 'concurrent_session', 'admin_session', 'api_session']
    }]
  },
  permissions: [{
    resource: String,
    actions: [String],
    scope: {
      type: String,
      enum: ['global', 'own', 'none'],
      default: 'own'
    },
    expiresAt: Date
  }],
  securityEvents: [{
    type: {
      type: String,
      enum: ['login', 'logout', 'refresh', 'suspicious_activity', 'location_change', 'device_change', 'failed_auth', 'session_hijack_attempt', 'concurrent_session', 'force_logout'],
      required: true
    },
    timestamp: { type: Date, default: Date.now },
    ipAddress: String,
    userAgent: String,
    data: Schema.Types.Mixed,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    },
    location: {
      country: String,
      region: String,
      city: String,
      latitude: Number,
      longitude: Number
    }
  }],
  renewalCount: { type: Number, default: 0 },
  maxRenewals: { type: Number, default: 10 },
  forceLogoutAt: Date,
  lastRenewedAt: Date,
  invalidatedAt: Date,
  invalidatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  invalidationReason: {
    type: String,
    enum: ['user_logout', 'admin_action', 'security_breach', 'expired', 'device_change', 'location_change', 'suspicious_activity', 'password_change', 'account_locked']
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
      delete ret.token
      delete ret.refreshToken
      return ret
    }
  }
})

// Indexes
SessionSchema.index({ userId: 1, isActive: 1 })
SessionSchema.index({ token: 1 })
SessionSchema.index({ refreshToken: 1 })
SessionSchema.index({ expiresAt: 1 })
SessionSchema.index({ lastActiveAt: -1 })
SessionSchema.index({ ipAddress: 1 })
SessionSchema.index({ createdAt: -1 })
SessionSchema.index({ isActive: 1, expiresAt: 1 })

// Instance methods
SessionSchema.methods.isValid = function(): boolean {
  return this.isActive && !this.isExpired() && !this.forceLogoutAt
}

SessionSchema.methods.isExpired = function(): boolean {
  return this.expiresAt < new Date()
}

SessionSchema.methods.refresh = async function(): Promise<void> {
  if (this.renewalCount >= this.maxRenewals) {
    throw new Error('Maximum renewal count reached')
  }
  
  this.lastActiveAt = new Date()
  this.lastRenewedAt = new Date()
  this.renewalCount += 1
  this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  
  await this.save()
}

SessionSchema.methods.invalidate = async function(): Promise<void> {
  this.isActive = false
  this.invalidatedAt = new Date()
  await this.save()
}

SessionSchema.methods.updateActivity = async function(ipAddress?: string, userAgent?: string): Promise<void> {
  this.lastActiveAt = new Date()
  
  if (ipAddress && ipAddress !== this.ipAddress) {
    await this.addSecurityEvent('location_change', { 
      oldIp: this.ipAddress, 
      newIp: ipAddress 
    })
    this.ipAddress = ipAddress
  }
  
  if (userAgent && !this.isFromSameDevice(userAgent)) {
    await this.addSecurityEvent('device_change', { 
      oldUserAgent: this.userAgent, 
      newUserAgent: userAgent 
    })
    this.userAgent = userAgent
    this.deviceInfo = this.parseUserAgent(userAgent)
  }
  
  await this.save()
}

SessionSchema.methods.generateToken = function(): string {
  const crypto = require('crypto')
  return crypto.randomBytes(32).toString('hex')
}

SessionSchema.methods.addSecurityEvent = async function(eventType: string, data?: any): Promise<void> {
  this.securityEvents.push({
    type: eventType as any,
    timestamp: new Date(),
    ipAddress: this.ipAddress,
    userAgent: this.userAgent,
    data,
    severity: this.getSeverityForEvent(eventType),
    location: this.location
  })
  
  // Keep only last 100 security events
  if (this.securityEvents.length > 100) {
    this.securityEvents = this.securityEvents.slice(-100)
  }
  
  await this.save()
}

SessionSchema.methods.isFromSameDevice = function(userAgent?: string): boolean {
  if (!userAgent || !this.userAgent) return false
  
  const normalize = (ua: string) => ua.toLowerCase().replace(/[^\w]/g, '')
  const current = normalize(this.userAgent)
  const incoming = normalize(userAgent)
  
  // Simple similarity check
  const similarity = this.calculateSimilarity(current, incoming)
  return similarity > 0.8
}

SessionSchema.methods.shouldRenew = function(): boolean {
  const halfwayPoint = new Date(this.createdAt.getTime() + (this.expiresAt.getTime() - this.createdAt.getTime()) / 2)
  return new Date() > halfwayPoint && this.renewalCount < this.maxRenewals
}

SessionSchema.methods.calculateRiskScore = async function(): Promise<number> {
  let score = 0
  
  // Check for suspicious patterns - fix parameter typing
  if (this.securityEvents.some((e: any) => e.type === 'suspicious_activity')) score += 30
  if (this.securityEvents.some((e: any) => e.type === 'location_change')) score += 20
  if (this.securityEvents.some((e: any) => e.type === 'device_change')) score += 15
  if (this.renewalCount > 5) score += 10
  
  // Check concurrent sessions - fix constructor typing
  const SessionModel = this.constructor as SessionModel
  const concurrentSessions = await SessionModel.countDocuments({
    userId: this.userId,
    isActive: true,
    _id: { $ne: this._id }
  })
  if (concurrentSessions > 3) score += 20
  
  return Math.min(score, 100)
}
SessionSchema.methods.parseUserAgent = function(userAgent: string): any {
  const ua = userAgent.toLowerCase()
  let deviceType = 'unknown'
  let os = 'unknown'
  let browser = 'unknown'
  let version = ''
  
  // Device type detection
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'mobile'
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'tablet'
  } else {
    deviceType = 'desktop'
  }
  
  // OS detection
  if (ua.includes('windows')) os = 'windows'
  else if (ua.includes('mac')) os = 'macos'
  else if (ua.includes('linux')) os = 'linux'
  else if (ua.includes('android')) os = 'android'
  else if (ua.includes('ios')) os = 'ios'
  
  // Browser detection
  if (ua.includes('chrome')) {
    browser = 'chrome'
    const match = ua.match(/chrome\/([0-9.]+)/)
    version = match ? match[1] : ''
  } else if (ua.includes('firefox')) {
    browser = 'firefox'
    const match = ua.match(/firefox\/([0-9.]+)/)
    version = match ? match[1] : ''
  } else if (ua.includes('safari')) {
    browser = 'safari'
    const match = ua.match(/version\/([0-9.]+)/)
    version = match ? match[1] : ''
  } else if (ua.includes('edge')) {
    browser = 'edge'
    const match = ua.match(/edge\/([0-9.]+)/)
    version = match ? match[1] : ''
  }
  
  return {
    type: deviceType,
    os,
    browser,
    version,
    fingerprint: this.generateFingerprint(userAgent)
  }
}

SessionSchema.methods.getSeverityForEvent = function(eventType: string): string {
  const severityMap: Record<string, string> = {
    'login': 'low',
    'logout': 'low',
    'refresh': 'low',
    'location_change': 'medium',
    'device_change': 'medium',
    'suspicious_activity': 'high',
    'session_hijack_attempt': 'critical',
    'failed_auth': 'medium',
    'concurrent_session': 'low',
    'force_logout': 'high'
  }
  
  return severityMap[eventType] || 'low'
}

SessionSchema.methods.calculateSimilarity = function(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = this.levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

SessionSchema.methods.levenshteinDistance = function(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

SessionSchema.methods.generateFingerprint = function(userAgent: string): string {
  const crypto = require('crypto')
  const fingerprint = crypto.createHash('sha256')
    .update(userAgent + this.ipAddress)
    .digest('hex')
  return fingerprint.substring(0, 16)
}

// Static methods
SessionSchema.statics.findByToken = function(token: string) {
  return this.findOne({ token, isActive: true })
}

SessionSchema.statics.findByUserId = function(userId: string) {
  return this.find({ userId: new Types.ObjectId(userId) }).sort({ lastActiveAt: -1 })
}

SessionSchema.statics.findActiveSessions = function(userId?: string) {
  const filter: any = { isActive: true, expiresAt: { $gt: new Date() } }
  if (userId) filter.userId = new Types.ObjectId(userId)
  
  return this.find(filter).sort({ lastActiveAt: -1 })
}

SessionSchema.statics.cleanupExpiredSessions = async function() {
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { isActive: false },
      { forceLogoutAt: { $lt: new Date() } }
    ]
  })
  
  return result.deletedCount || 0
}

SessionSchema.statics.invalidateUserSessions = async function(userId: string, reason = 'admin_action') {
  const result = await this.updateMany(
    { userId: new Types.ObjectId(userId), isActive: true },
    { 
      isActive: false,
      invalidatedAt: new Date(),
      invalidationReason: reason
    }
  )
  
  return result.modifiedCount || 0
}

SessionSchema.statics.getSessionStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        activeSessions: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$isActive', true] }, { $gt: ['$expiresAt', new Date()] }] },
              1,
              0
            ]
          }
        },
        expiredSessions: {
          $sum: {
            $cond: [{ $lt: ['$expiresAt', new Date()] }, 1, 0]
          }
        },
        deviceTypes: { $push: '$deviceInfo.type' },
        averageRiskScore: { $avg: '$metadata.riskScore' }
      }
    }
  ])
  
  return stats[0] || {
    totalSessions: 0,
    activeSessions: 0,
    expiredSessions: 0,
    deviceTypes: [],
    averageRiskScore: 0
  }
}

// Pre-save middleware
SessionSchema.pre('save', async function() {
  if (this.isNew && !this.token) {
    this.token = this.generateToken()
  }
  
  if (this.isNew && !this.refreshToken && this.metadata?.rememberMe) {
    this.refreshToken = this.generateToken()
  }
  
  if (this.isModified('userAgent') && this.userAgent) {
    this.deviceInfo = this.parseUserAgent(this.userAgent)
  }
  
  if (this.isModified('ipAddress') || this.isModified('userAgent') || this.isNew) {
    this.metadata = this.metadata || {} as any
    this.metadata.riskScore = await this.calculateRiskScore()
  }
  
  if (this.isNew) {
    await this.addSecurityEvent('login', {
      method: this.metadata?.loginMethod,
      oauthProvider: this.metadata?.oauthProvider
    })
  }
})

export const Session = mongoose.model<SessionDocument, SessionModel>('Session', SessionSchema)