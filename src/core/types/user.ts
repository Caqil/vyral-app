import { UserRole, AuthProvider, User, RegisterData } from './auth'

// Core user types
export interface UserProfile {
  id: string
  userId: string
  bio?: string
  location?: string
  website?: string
  birthDate?: Date
  phoneNumber?: string
  timezone?: string
  language?: string
  isPrivate: boolean
  allowMessages: boolean
  allowNotifications: boolean
  settings: UserSettings
  social: SocialLinks
  stats: UserStats
  createdAt: Date
  updatedAt: Date
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system'
  notifications: NotificationSettings
  privacy: PrivacySettings
  feed: FeedSettings
  plugins: PluginSettings
}

export interface NotificationSettings {
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

export interface PrivacySettings {
  profileVisibility: 'public' | 'friends' | 'private'
  showEmail: boolean
  showPhone: boolean
  showLocation: boolean
  allowSearch: boolean
  allowTagging: boolean
  blockedUsers: string[]
  mutedUsers: string[]
}

export interface FeedSettings {
  algorithm: 'chronological' | 'engagement' | 'personalized'
  showRecommendations: boolean
  hideReposts: boolean
  hideLikedPosts: boolean
  contentFilters: string[]
  hiddenTopics: string[]
}

export interface PluginSettings {
  enabledPlugins: string[]
  disabledPlugins: string[]
  pluginConfigs: Record<string, any>
  allowThirdPartyPlugins: boolean
  autoUpdatePlugins: boolean
}

export interface SocialLinks {
  twitter?: string
  github?: string
  linkedin?: string
  instagram?: string
  facebook?: string
  youtube?: string
  tiktok?: string
  website?: string
  blog?: string
}

export interface UserStats {
  postsCount: number
  followersCount: number
  followingCount: number
  likesReceived: number
  commentsReceived: number
  sharesReceived: number
  viewsReceived: number
  joinedCommunitiesCount: number
  badgesCount: number
  reputation: number
  lastActiveAt: Date
}

export interface UserBadge {
  id: string
  userId: string
  type: BadgeType
  name: string
  description: string
  icon: string
  color: string
  earnedAt: Date
  isVisible: boolean
}

export enum BadgeType {
  ACHIEVEMENT = 'achievement',
  MILESTONE = 'milestone',
  COMMUNITY = 'community',
  PLUGIN = 'plugin',
  SPECIAL = 'special',
}

export interface UserConnection {
  id: string
  followerId: string
  followingId: string
  status: ConnectionStatus
  createdAt: Date
  updatedAt: Date
}

export enum ConnectionStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  BLOCKED = 'blocked',
  MUTED = 'muted',
}

export interface UserActivity {
  id: string
  userId: string
  type: ActivityType
  action: string
  targetId?: string
  targetType?: string
  metadata?: Record<string, any>
  pluginId?: string
  createdAt: Date
}

export enum ActivityType {
  POST = 'post',
  COMMENT = 'comment',
  LIKE = 'like',
  SHARE = 'share',
  FOLLOW = 'follow',
  UNFOLLOW = 'unfollow',
  JOIN = 'join',
  LEAVE = 'leave',
  PLUGIN = 'plugin',
  SYSTEM = 'system',
}

export interface UserPreferences {
  id: string
  userId: string
  key: string
  value: any
  pluginId?: string
  isGlobal: boolean
  createdAt: Date
  updatedAt: Date
}

// User search and filtering
export interface UserSearchParams {
  query?: string
  role?: UserRole
  provider?: AuthProvider
  isActive?: boolean
  isBanned?: boolean
  hasProfile?: boolean
  location?: string
  joinedAfter?: Date
  joinedBefore?: Date
  sortBy?: UserSortBy
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export enum UserSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  LAST_ACTIVE = 'lastActiveAt',
  USERNAME = 'username',
  EMAIL = 'email',
  FOLLOWERS = 'followersCount',
  POSTS = 'postsCount',
  REPUTATION = 'reputation',
}

export interface UserSearchResult {
  users: User[]
  total: number
  hasMore: boolean
  nextOffset?: number
}

// User management
export interface UserUpdateData {
  username?: string
  name?: string
  email?: string
  avatar?: string
  profile?: Partial<UserProfile>
  settings?: Partial<UserSettings>
  metadata?: Record<string, any>
}

export interface UserModerationAction {
  id: string
  userId: string
  moderatorId: string
  type: ModerationActionType
  reason: string
  duration?: number // in minutes
  metadata?: Record<string, any>
  createdAt: Date
  expiresAt?: Date
}

export enum ModerationActionType {
  WARNING = 'warning',
  MUTE = 'mute',
  SUSPEND = 'suspend',
  BAN = 'ban',
  UNBAN = 'unban',
  DELETE_CONTENT = 'delete_content',
  RESTORE_CONTENT = 'restore_content',
}

// Plugin-specific user extensions
export interface PluginUserData {
  id: string
  userId: string
  pluginId: string
  data: Record<string, any>
  version: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserPluginPermissions {
  userId: string
  pluginId: string
  permissions: string[]
  grantedBy: string
  grantedAt: Date
  expiresAt?: Date
}

// User hooks for plugins
export interface UserHooks {
  beforeUserCreate?: (userData: RegisterData) => Promise<RegisterData | null>
  afterUserCreate?: (user: User) => Promise<void>
  beforeUserUpdate?: (userId: string, updateData: UserUpdateData) => Promise<UserUpdateData | null>
  afterUserUpdate?: (user: User, previousData: User) => Promise<void>
  beforeUserDelete?: (userId: string) => Promise<boolean>
  afterUserDelete?: (userId: string) => Promise<void>
  onUserBanned?: (user: User, reason?: string) => Promise<void>
  onUserUnbanned?: (user: User) => Promise<void>
  onUserFollow?: (followerId: string, followingId: string) => Promise<void>
  onUserUnfollow?: (followerId: string, followingId: string) => Promise<void>
  onProfileView?: (viewerId: string, profileId: string) => Promise<void>
}

// Export commonly used interfaces from auth
export type { User } from './auth'