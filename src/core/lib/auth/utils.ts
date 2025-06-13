import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { User, UserRole, AuthProvider } from '@/core/types/auth'
import { logger } from '@/core/lib/utils/logger'

/**
 * Password validation rules
 */
export interface PasswordValidationRules {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  maxLength?: number
  forbiddenPatterns?: string[]
}

export const DEFAULT_PASSWORD_RULES: PasswordValidationRules = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxLength: 128,
  forbiddenPatterns: [
    'password',
    '123456',
    'qwerty',
    'admin',
    'letmein',
    'welcome'
  ]
}

/**
 * Validate password against security rules
 */
export function validatePassword(
  password: string, 
  rules: PasswordValidationRules = DEFAULT_PASSWORD_RULES
): {
  isValid: boolean
  errors: string[]
  score: number
} {
  const errors: string[] = []
  let score = 0

  // Length check
  if (password.length < rules.minLength) {
    errors.push(`Password must be at least ${rules.minLength} characters long`)
  } else {
    score += Math.min(password.length * 2, 25)
  }

  if (rules.maxLength && password.length > rules.maxLength) {
    errors.push(`Password must not exceed ${rules.maxLength} characters`)
  }

  // Character requirements
  if (rules.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  } else if (rules.requireUppercase) {
    score += 5
  }

  if (rules.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  } else if (rules.requireLowercase) {
    score += 5
  }

  if (rules.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number')
  } else if (rules.requireNumbers) {
    score += 5
  }

  if (rules.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    errors.push('Password must contain at least one special character')
  } else if (rules.requireSpecialChars) {
    score += 10
  }

  // Pattern checks
  if (rules.forbiddenPatterns) {
    const lowerPassword = password.toLowerCase()
    for (const pattern of rules.forbiddenPatterns) {
      if (lowerPassword.includes(pattern.toLowerCase())) {
        errors.push(`Password cannot contain '${pattern}'`)
        score -= 20
      }
    }
  }

  // Common pattern penalties
  if (/(.)\1{2,}/.test(password)) { // Repeated characters
    score -= 10
  }

  if (/(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
    score -= 15 // Sequential characters
  }

  // Bonus for variety
  const characterTypes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)
  ].filter(Boolean).length

  score += characterTypes * 5

  // Ensure score is within bounds
  score = Math.max(0, Math.min(score, 100))

  return {
    isValid: errors.length === 0,
    errors,
    score
  }
}

/**
 * Hash password securely
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12')
    return await bcrypt.hash(password, saltRounds)
  } catch (error: any) {
    logger.error('Password hashing failed', { error: error.message })
    throw new Error('Failed to hash password')
  }
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash)
  } catch (error: any) {
    logger.error('Password verification failed', { error: error.message })
    return false
  }
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Generate cryptographically secure random string
 */
export function generateSecureRandomString(
  length: number = 16,
  charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = ''
  const charsetLength = charset.length
  const randomBytes = crypto.randomBytes(length)

  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charsetLength]
  }

  return result
}

/**
 * Generate secure backup codes
 */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = []
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character code with dashes for readability
    const code = generateSecureRandomString(8, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`
    codes.push(formattedCode)
  }
  
  return codes
}

/**
 * Validate email format
 */
export function validateEmail(email: string): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!email) {
    errors.push('Email is required')
    return { isValid: false, errors }
  }

  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    errors.push('Invalid email format')
  }

  // Length validation
  if (email.length > 254) {
    errors.push('Email address is too long')
  }

  // Local part validation (before @)
  const localPart = email.split('@')[0]
  if (localPart && localPart.length > 64) {
    errors.push('Email local part is too long')
  }

  // Domain validation
  const domain = email.split('@')[1]
  if (domain) {
    if (domain.length > 253) {
      errors.push('Email domain is too long')
    }

    // Check for valid domain characters
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
      errors.push('Email domain contains invalid characters')
    }

    // Check for consecutive dots
    if (domain.includes('..')) {
      errors.push('Email domain cannot contain consecutive dots')
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate username
 */
export function validateUsername(username: string): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!username) {
    errors.push('Username is required')
    return { isValid: false, errors }
  }

  // Length validation
  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long')
  }

  if (username.length > 30) {
    errors.push('Username must not exceed 30 characters')
  }

  // Character validation
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, and underscores')
  }

  // Cannot start or end with underscore
  if (username.startsWith('_') || username.endsWith('_')) {
    errors.push('Username cannot start or end with underscore')
  }

  // Cannot have consecutive underscores
  if (username.includes('__')) {
    errors.push('Username cannot contain consecutive underscores')
  }

  // Reserved usernames
  const reservedUsernames = [
    'admin', 'administrator', 'root', 'system', 'api', 'www',
    'mail', 'ftp', 'test', 'guest', 'user', 'support', 'help',
    'info', 'contact', 'about', 'blog', 'news', 'forum'
  ]

  if (reservedUsernames.includes(username.toLowerCase())) {
    errors.push('This username is reserved and cannot be used')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Sanitize user data for public consumption
 */
export function sanitizeUser(user: any): Partial<User> {
  return {
    id: user.id || user._id?.toString(),
    email: user.email,
    username: user.username,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    provider: user.provider,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
    // Exclude sensitive fields like password, security settings, etc.
  }
}

/**
 * Generate user avatar URL or initials
 */
export function generateUserAvatar(user: Partial<User>): string {
  if (user.avatar) {
    return user.avatar
  }

  // Generate avatar from initials
  const name = user.name || user.username || user.email || 'User'
  const initials = name
    .split(' ')
    .map(part => part.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2)

  // Generate a consistent color based on user ID or email
  const id = user.id || user.email || 'default'
  const hash = crypto.createHash('md5').update(id).digest('hex')
  const hue = parseInt(hash.slice(0, 2), 16) * 360 / 255

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" fill="hsl(${hue}, 65%, 50%)" />
      <text x="20" y="26" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
        ${initials}
      </text>
    </svg>
  `)}`
}

/**
 * Check if password needs to be rehashed (for security updates)
 */
export function needsRehashing(hash: string): boolean {
  try {
    const currentRounds = parseInt(process.env.BCRYPT_ROUNDS || '12')
    // This is a simplified check - in production you might want more sophisticated logic
    return !hash.startsWith(`$2b$${currentRounds.toString().padStart(2, '0')}$`)
  } catch {
    return true
  }
}

/**
 * Get user role hierarchy level
 */
export function getRoleLevel(role: UserRole): number {
  const hierarchy: Record<UserRole, number> = {
    [UserRole.USER]: 1,
    [UserRole.MODERATOR]: 2,
    [UserRole.ADMIN]: 3,
    [UserRole.SUPER_ADMIN]: 4
  }
  return hierarchy[role] || 0
}

/**
 * Check if user can perform action on target user
 */
export function canPerformActionOnUser(
  actorRole: UserRole,
  targetRole: UserRole,
  action: 'view' | 'edit' | 'delete' | 'ban' | 'promote' | 'demote'
): boolean {
  const actorLevel = getRoleLevel(actorRole)
  const targetLevel = getRoleLevel(targetRole)

  switch (action) {
    case 'view':
      return actorLevel >= 1 // Anyone can view (with proper permissions)
    case 'edit':
      return actorLevel > targetLevel // Must have higher role
    case 'delete':
    case 'ban':
      return actorLevel >= 3 && actorLevel > targetLevel // Admin+ and higher role
    case 'promote':
    case 'demote':
      return actorLevel >= 4 // Super admin only
    default:
      return false
  }
}

/**
 * Generate secure session token
 */
export function generateSessionToken(): string {
  return generateSecureToken(64)
}

/**
 * Parse user agent string
 */
export function parseUserAgent(userAgent: string): {
  browser: string
  version: string
  os: string
  device: 'desktop' | 'mobile' | 'tablet' | 'unknown'
} {
  const ua = userAgent.toLowerCase()

  // Browser detection
  let browser = 'unknown'
  let version = ''

  if (ua.includes('chrome')) {
    browser = 'Chrome'
    version = ua.match(/chrome\/(\d+)/)?.[1] || ''
  } else if (ua.includes('firefox')) {
    browser = 'Firefox'
    version = ua.match(/firefox\/(\d+)/)?.[1] || ''
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari'
    version = ua.match(/version\/(\d+)/)?.[1] || ''
  } else if (ua.includes('edge')) {
    browser = 'Edge'
    version = ua.match(/edge\/(\d+)/)?.[1] || ''
  }

  // OS detection
  let os = 'unknown'
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS'
  else if (ua.includes('linux')) os = 'Linux'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS'

  // Device type detection
  let device: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown'
  if (ua.includes('mobile')) device = 'mobile'
  else if (ua.includes('tablet') || ua.includes('ipad')) device = 'tablet'
  else if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux')) device = 'desktop'

  return { browser, version, os, device }
}

/**
 * Generate device fingerprint
 */
export function generateDeviceFingerprint(userAgent: string, ip?: string): string {
  const components = [
    userAgent,
    ip || 'unknown'
  ].join('|')

  return crypto
    .createHash('sha256')
    .update(components)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Mask sensitive information
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email

  const maskedLocal = local.length > 2 
    ? local.charAt(0) + '*'.repeat(local.length - 2) + local.charAt(local.length - 1)
    : '*'.repeat(local.length)

  return `${maskedLocal}@${domain}`
}

/**
 * Format time ago
 */
export function timeAgo(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  
  const years = Math.floor(days / 365)
  return `${years}y ago`
}

export default {
  validatePassword,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateSecureRandomString,
  generateBackupCodes,
  validateEmail,
  validateUsername,
  sanitizeUser,
  generateUserAvatar,
  needsRehashing,
  getRoleLevel,
  canPerformActionOnUser,
  generateSessionToken,
  parseUserAgent,
  generateDeviceFingerprint,
  maskEmail,
  timeAgo
}