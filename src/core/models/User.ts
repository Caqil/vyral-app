import mongoose, { Schema, Model, Types } from 'mongoose'
import { UserRole, AuthProvider } from '@/core/types/auth'

// Base interface without Document
export interface IUser {
  _id?: Types.ObjectId
  email: string
  username?: string
  name?: string
  password?: string
  avatar?: string
  role: UserRole
  provider: AuthProvider
  providerId?: string
  emailVerified?: Date
  isActive: boolean
  isBanned: boolean
  banReason?: string
  bannedAt?: Date
  bannedBy?: Types.ObjectId
  lastActiveAt: Date
  lastLoginAt?: Date
  loginCount: number
  loginHistory: Array<{
    timestamp: Date
    ipAddress?: string
    userAgent?: string
    success: boolean
  }>
  preferences: {
    theme: 'light' | 'dark' | 'system'
    language: string
    timezone: string
    notifications: {
      email: boolean
      push: boolean
      sms: boolean
      inApp: boolean
      types: {
        likes: boolean
        comments: boolean
        follows: boolean
        mentions: boolean
        messages: boolean
        systemUpdates: boolean
        pluginUpdates: boolean
      }
    }
    privacy: {
      profileVisibility: 'public' | 'friends' | 'private'
      showEmail: boolean
      showPhone: boolean
      showLocation: boolean
      allowSearch: boolean
      allowTagging: boolean
    }
    feed: {
      algorithm: 'chronological' | 'engagement' | 'personalized'
      showRecommendations: boolean
      hideReposts: boolean
      hideLikedPosts: boolean
    }
  }
  profile: {
    bio?: string
    location?: string
    website?: string
    birthDate?: Date
    phoneNumber?: string
    social: {
      twitter?: string
      github?: string
      linkedin?: string
      instagram?: string
      facebook?: string
      youtube?: string
      tiktok?: string
      blog?: string
    }
    interests: string[]
    skills: string[]
  }
  stats: {
    postsCount: number
    followersCount: number
    followingCount: number
    likesReceived: number
    commentsReceived: number
    sharesReceived: number
    viewsReceived: number
    reputation: number
  }
  security: {
    twoFactorEnabled: boolean
    twoFactorSecret?: string
    backupCodes: string[]
    failedLoginAttempts: number
    lockoutUntil?: Date
    passwordChangedAt: Date
    sessions: Array<{
      sessionId: string
      createdAt: Date
      lastActiveAt: Date
      ipAddress?: string
      userAgent?: string
      isActive: boolean
    }>
  }
  permissions: Array<{
    resource: string
    actions: string[]
    scope: 'global' | 'own' | 'none'
    grantedAt: Date
    grantedBy?: Types.ObjectId
    expiresAt?: Date
  }>
  blockedUsers: Types.ObjectId[]
  mutedUsers: Types.ObjectId[]
  metadata: Record<string, any>
  deletedAt?: Date
  isDeleted: boolean
  createdAt: Date
  updatedAt: Date
}

// Document interface for instance methods
export interface UserDocument extends IUser, mongoose.Document {
  comparePassword(candidatePassword: string): Promise<boolean>
  generateAuthToken(): string
  isValidPassword(password: string): boolean
  canAccess(resource: string): boolean
  hasRole(role: UserRole): boolean
  updateLastActive(): Promise<void>
  incrementLoginCount(): Promise<void>
  addToLoginHistory(ipAddress?: string, userAgent?: string): Promise<void>
  getDefaultPermissions(): Array<{
    resource: string
    actions: string[]
    scope: 'global' | 'own' | 'none'
  }>
  softDelete(): Promise<void>
  restore(): Promise<void>
}

// Model interface for static methods
export interface UserModel extends Model<UserDocument> {
  findByEmail(email: string): Promise<UserDocument | null>
  findByUsername(username: string): Promise<UserDocument | null>
  findActiveUsers(limit?: number): Promise<UserDocument[]>
  findByRole(role: UserRole): Promise<UserDocument[]>
  searchUsers(query: string, limit?: number): Promise<UserDocument[]>
  getStatistics(): Promise<any>
}

const UserSchema = new Schema<UserDocument>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: 'Please provide a valid email address'
    }
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    index: true,
    validate: {
      validator: (username: string) => /^[a-zA-Z0-9_]+$/.test(username),
      message: 'Username can only contain letters, numbers, and underscores'
    }
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  password: {
    type: String,
    minlength: 8,
    select: false
  },
  avatar: String,
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
    index: true
  },
  provider: {
    type: String,
    enum: Object.values(AuthProvider),
    default: AuthProvider.EMAIL,
    index: true
  },
  providerId: {
    type: String,
    sparse: true,
    index: true
  },
  emailVerified: Date,
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isBanned: {
    type: Boolean,
    default: false,
    index: true
  },
  banReason: String,
  bannedAt: Date,
  bannedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastLoginAt: Date,
  loginCount: {
    type: Number,
    default: 0
  },
  loginHistory: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: String,
    userAgent: String,
    success: {
      type: Boolean,
      default: true
    }
  }],
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      inApp: { type: Boolean, default: true },
      types: {
        likes: { type: Boolean, default: true },
        comments: { type: Boolean, default: true },
        follows: { type: Boolean, default: true },
        mentions: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        systemUpdates: { type: Boolean, default: true },
        pluginUpdates: { type: Boolean, default: false }
      }
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public'
      },
      showEmail: { type: Boolean, default: false },
      showPhone: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: false },
      allowSearch: { type: Boolean, default: true },
      allowTagging: { type: Boolean, default: true }
    },
    feed: {
      algorithm: {
        type: String,
        enum: ['chronological', 'engagement', 'personalized'],
        default: 'chronological'
      },
      showRecommendations: { type: Boolean, default: true },
      hideReposts: { type: Boolean, default: false },
      hideLikedPosts: { type: Boolean, default: false }
    }
  },
  profile: {
    bio: String,
    location: String,
    website: String,
    birthDate: Date,
    phoneNumber: String,
    social: {
      twitter: String,
      github: String,
      linkedin: String,
      instagram: String,
      facebook: String,
      youtube: String,
      tiktok: String,
      blog: String
    },
    interests: [String],
    skills: [String]
  },
  stats: {
    postsCount: { type: Number, default: 0 },
    followersCount: { type: Number, default: 0 },
    followingCount: { type: Number, default: 0 },
    likesReceived: { type: Number, default: 0 },
    commentsReceived: { type: Number, default: 0 },
    sharesReceived: { type: Number, default: 0 },
    viewsReceived: { type: Number, default: 0 },
    reputation: { type: Number, default: 0 }
  },
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    backupCodes: [{ type: String, select: false }],
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: Date,
    passwordChangedAt: { type: Date, default: Date.now },
    sessions: [{
      sessionId: String,
      createdAt: { type: Date, default: Date.now },
      lastActiveAt: { type: Date, default: Date.now },
      ipAddress: String,
      userAgent: String,
      isActive: { type: Boolean, default: true }
    }]
  },
  permissions: [{
    resource: { type: String, required: true },
    actions: [{ type: String, required: true }],
    scope: {
      type: String,
      enum: ['global', 'own', 'none'],
      default: 'own'
    },
    grantedAt: { type: Date, default: Date.now },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: Date
  }],
  blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  mutedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  deletedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id
      delete ret._id
      delete ret.__v
      delete ret.password
      delete ret.security?.twoFactorSecret
      delete ret.security?.backupCodes
      return ret
    }
  }
})

// Indexes
UserSchema.index({ email: 1 })
UserSchema.index({ username: 1 })
UserSchema.index({ role: 1 })
UserSchema.index({ provider: 1, providerId: 1 })
UserSchema.index({ isActive: 1, isBanned: 1 })
UserSchema.index({ lastActiveAt: -1 })
UserSchema.index({ createdAt: -1 })
UserSchema.index({ isDeleted: 1, deletedAt: 1 })

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false
  const bcrypt = require('bcryptjs')
  return bcrypt.compare(candidatePassword, this.password)
}

UserSchema.methods.generateAuthToken = function(): string {
  const jwt = require('jsonwebtoken')
  return jwt.sign(
    { 
      id: this._id,
      email: this.email,
      role: this.role
    },
    process.env.NEXTAUTH_SECRET,
    { expiresIn: '7d' }
  )
}

UserSchema.methods.isValidPassword = function(password: string): boolean {
  return password && password.length >= 8
}

UserSchema.methods.canAccess = function(resource: string): boolean {
  if (this.role === UserRole.SUPER_ADMIN) return true
  const permission = this.permissions?.find(p => p.resource === resource)
  return !!permission && (!permission.expiresAt || permission.expiresAt > new Date())
}

UserSchema.methods.hasRole = function(role: UserRole): boolean {
  const roleHierarchy = {
    [UserRole.USER]: 1,
    [UserRole.MODERATOR]: 2,
    [UserRole.ADMIN]: 3,
    [UserRole.SUPER_ADMIN]: 4
  }
  return roleHierarchy[this.role] >= roleHierarchy[role]
}

UserSchema.methods.updateLastActive = async function(): Promise<void> {
  this.lastActiveAt = new Date()
  await this.save()
}

UserSchema.methods.incrementLoginCount = async function(): Promise<void> {
  this.loginCount = (this.loginCount || 0) + 1
  this.lastLoginAt = new Date()
  await this.save()
}

UserSchema.methods.addToLoginHistory = async function(ipAddress?: string, userAgent?: string): Promise<void> {
  this.loginHistory.push({
    timestamp: new Date(),
    ipAddress,
    userAgent,
    success: true
  })
  
  if (this.loginHistory.length > 50) {
    this.loginHistory = this.loginHistory.slice(-50)
  }
  
  await this.save()
}

UserSchema.methods.getDefaultPermissions = function() {
  const defaultPermissions = {
    [UserRole.USER]: [
      { resource: 'posts', actions: ['create', 'read', 'update:own', 'delete:own'], scope: 'own' as const },
      { resource: 'profile', actions: ['read', 'update:own'], scope: 'own' as const }
    ],
    [UserRole.MODERATOR]: [
      { resource: 'posts', actions: ['create', 'read', 'update', 'delete', 'moderate'], scope: 'global' as const },
      { resource: 'users', actions: ['read', 'moderate'], scope: 'global' as const }
    ],
    [UserRole.ADMIN]: [
      { resource: '*', actions: ['*'], scope: 'global' as const }
    ],
    [UserRole.SUPER_ADMIN]: [
      { resource: '*', actions: ['*'], scope: 'global' as const }
    ]
  }
  return defaultPermissions[this.role] || defaultPermissions[UserRole.USER]
}

UserSchema.methods.softDelete = async function(): Promise<void> {
  this.isDeleted = true
  this.deletedAt = new Date()
  this.isActive = false
  await this.save()
}

UserSchema.methods.restore = async function(): Promise<void> {
  this.isDeleted = false
  this.deletedAt = undefined
  this.isActive = true
  await this.save()
}

// Static methods
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase(), isDeleted: false })
}

UserSchema.statics.findByUsername = function(username: string) {
  return this.findOne({ username, isDeleted: false })
}

UserSchema.statics.findActiveUsers = function(limit: number = 50) {
  return this.find({ 
    isActive: true, 
    isBanned: false, 
    isDeleted: false 
  })
  .sort({ lastActiveAt: -1 })
  .limit(limit)
}

UserSchema.statics.findByRole = function(role: UserRole) {
  return this.find({ role, isDeleted: false })
}

UserSchema.statics.searchUsers = function(query: string, limit: number = 20) {
  const searchRegex = new RegExp(query, 'i')
  return this.find({
    $or: [
      { username: searchRegex },
      { name: searchRegex },
      { email: searchRegex }
    ],
    isDeleted: false,
    isActive: true
  })
  .select('username name email avatar profile.bio stats.reputation')
  .limit(limit)
}

UserSchema.statics.getStatistics = async function() {
  return this.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        bannedUsers: { $sum: { $cond: [{ $eq: ['$isBanned', true] }, 1, 0] } }
      }
    }
  ])
}

// Pre-save middleware
UserSchema.pre('save', async function() {
  if (this.isModified('password') && this.password) {
    const bcrypt = require('bcryptjs')
    this.password = await bcrypt.hash(this.password, 12)
  }
  
  if (this.isModified('email') && !this.username) {
    this.username = this.email.split('@')[0]
  }
})

export const User = mongoose.model<UserDocument, UserModel>('User', UserSchema)