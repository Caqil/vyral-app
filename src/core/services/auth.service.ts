import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { 
  User, 
  Session, 
  AuthCredentials, 
  RegisterData, 
  OAuthProfile,
  AuthResponse,
  AuthError,
  UserRole,
  AuthProvider,
  JWTPayload,
  PasswordResetRequest,
  EmailVerificationRequest,
  AuthHooks
} from '@/core/types/auth'
import { AuthenticationError, AuthorizationError, ValidationError, ConflictError } from '@/core/types'
import { HookManager } from '@/core/plugins/system/HookManager'
import { logger } from '@/core/lib/utils/logger';

export class AuthService {
  private static instance: AuthService
  private hooks: AuthHooks = {}
  private hookManager: HookManager
  private users: Map<string, User> = new Map()
  private sessions: Map<string, Session> = new Map()
  private passwordResets: Map<string, PasswordResetRequest> = new Map()
  private emailVerifications: Map<string, EmailVerificationRequest> = new Map()
  private usersByEmail: Map<string, string> = new Map()
  private usersByUsername: Map<string, string> = new Map()
  private usersByProvider: Map<string, string> = new Map()

  private constructor() {
    this.hookManager = HookManager.getInstance()
    this.registerHooks()
    this.initializeDefaultAdmin()
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  private registerHooks(): void {
    this.hookManager.registerHook('auth.beforeSignIn', this.executeBeforeSignIn.bind(this))
    this.hookManager.registerHook('auth.afterSignIn', this.executeAfterSignIn.bind(this))
    this.hookManager.registerHook('auth.beforeSignUp', this.executeBeforeSignUp.bind(this))
    this.hookManager.registerHook('auth.afterSignUp', this.executeAfterSignUp.bind(this))
    this.hookManager.registerHook('auth.beforeSignOut', this.executeBeforeSignOut.bind(this))
    this.hookManager.registerHook('auth.afterSignOut', this.executeAfterSignOut.bind(this))
  }

  private async initializeDefaultAdmin(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

    if (!this.usersByEmail.has(adminEmail)) {
      try {
        const hashedPassword = await this.hashPassword(adminPassword)
        const adminUser: User = {
          id: this.generateId(),
          email: adminEmail,
          username: 'admin',
          name: 'System Administrator',
          role: UserRole.SUPER_ADMIN,
          provider: AuthProvider.EMAIL,
          isActive: true,
          isBanned: false,
          emailVerified: new Date(),
          metadata: { isDefaultAdmin: true },
          createdAt: new Date(),
          updatedAt: new Date(),
          password: hashedPassword
        }

        this.users.set(adminUser.id, adminUser)
        this.usersByEmail.set(adminUser.email, adminUser.id)
        this.usersByUsername.set(adminUser.username!, adminUser.id)

        logger.info('Default admin user created', { email: adminEmail })
      } catch (error) {
        logger.error('Failed to create default admin', { error: error.message })
      }
    }
  }

  async signIn(credentials: AuthCredentials): Promise<AuthResponse> {
    try {
      const processedCredentials = await this.executeBeforeSignIn(credentials)
      if (!processedCredentials) {
        throw new AuthenticationError('Sign in blocked by plugin')
      }

      const validatedCredentials = await this.validateCredentials(processedCredentials)
      
      const user = await this.findUserByEmail(validatedCredentials.email)
      if (!user) {
        throw new AuthenticationError('Invalid credentials')
      }

      if (!user.isActive) {
        throw new AuthenticationError('Account is inactive')
      }

      if (user.isBanned) {
        throw new AuthenticationError('Account is banned')
      }

      const isPasswordValid = await this.verifyPassword(validatedCredentials.password, user.password!)
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid credentials')
      }

      const session = await this.createSession(user)
      const token = await this.generateToken(user, session)

      await this.executeAfterSignIn(user, session)

      logger.info('User signed in successfully', {
        userId: user.id,
        email: user.email,
        provider: user.provider,
        sessionId: session.id
      })

      return {
        success: true,
        user: this.sanitizeUser(user),
        session,
        token
      }
    } catch (error) {
      logger.error('Sign in failed', { error: error.message, email: credentials.email })
      
      if (error instanceof AuthenticationError) {
        return {
          success: false,
          error: error.message
        }
      }
      
      return {
        success: false,
        error: 'An error occurred during sign in'
      }
    }
  }

  async signUp(data: RegisterData): Promise<AuthResponse> {
    try {
      const processedData = await this.executeBeforeSignUp(data)
      if (!processedData) {
        throw new ValidationError('Sign up blocked by plugin')
      }

      const validatedData = await this.validateRegistrationData(processedData)

      const existingUser = await this.findUserByEmail(validatedData.email)
      if (existingUser) {
        throw new ConflictError('User already exists with this email')
      }

      if (validatedData.username) {
        const existingUsername = await this.findUserByUsername(validatedData.username)
        if (existingUsername) {
          throw new ConflictError('Username is already taken')
        }
      }

      const hashedPassword = await this.hashPassword(validatedData.password)

      const user = await this.createUser({
        ...validatedData,
        password: hashedPassword,
        provider: AuthProvider.EMAIL,
        role: UserRole.USER,
        isActive: true,
        isBanned: false
      })

      const session = await this.createSession(user)
      const token = await this.generateToken(user, session)

      if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
        await this.sendEmailVerification(user)
      }

      await this.executeAfterSignUp(user)

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        username: user.username
      })

      return {
        success: true,
        user: this.sanitizeUser(user),
        session,
        token,
        message: 'Account created successfully'
      }
    } catch (error) {
      logger.error('Sign up failed', { error: error.message, email: data.email })
      
      if (error instanceof ConflictError || error instanceof ValidationError) {
        return {
          success: false,
          error: error.message
        }
      }
      
      return {
        success: false,
        error: 'An error occurred during registration'
      }
    }
  }

  async signInWithOAuth(profile: OAuthProfile): Promise<AuthResponse> {
    try {
      let user = await this.findUserByProvider(profile.provider, profile.id)
      
      if (!user) {
        user = await this.findUserByEmail(profile.email)
        
        if (user) {
          await this.linkOAuthAccount(user, profile)
        } else {
          user = await this.createUserFromOAuth(profile)
        }
      }

      if (!user.isActive) {
        throw new AuthenticationError('Account is inactive')
      }

      if (user.isBanned) {
        throw new AuthenticationError('Account is banned')
      }

      await this.updateOAuthTokens(user, profile)

      const session = await this.createSession(user)
      const token = await this.generateToken(user, session)

      await this.executeAfterSignIn(user, session)

      logger.info('OAuth sign in successful', {
        userId: user.id,
        email: user.email,
        provider: profile.provider,
        sessionId: session.id
      })

      return {
        success: true,
        user: this.sanitizeUser(user),
        session,
        token
      }
    } catch (error) {
      logger.error('OAuth sign in failed', { error: error.message, provider: profile.provider })
      
      return {
        success: false,
        error: 'OAuth authentication failed'
      }
    }
  }

  async signOut(userId: string, sessionId?: string): Promise<void> {
    try {
      const user = await this.findUserById(userId)
      if (!user) {
        throw new AuthenticationError('User not found')
      }

      await this.executeBeforeSignOut(user)

      if (sessionId) {
        await this.invalidateSession(sessionId)
      } else {
        await this.invalidateAllUserSessions(userId)
      }

      await this.executeAfterSignOut(userId)

      logger.info('User signed out successfully', { userId, sessionId })
    } catch (error) {
      logger.error('Sign out failed', { error: error.message, userId })
      throw error
    }
  }

  async refreshSession(sessionId: string): Promise<Session | null> {
    try {
      const session = await this.findSessionById(sessionId)
      if (!session || session.expiresAt < new Date()) {
        return null
      }

      session.lastActiveAt = new Date()
      this.sessions.set(session.id, session)

      return session
    } catch (error) {
      logger.error('Session refresh failed', { error: error.message, sessionId })
      return null
    }
  }

  async verifyToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as JWTPayload
      
      if (decoded.sessionId) {
        const session = await this.findSessionById(decoded.sessionId)
        if (!session || session.expiresAt < new Date()) {
          return null
        }
      }

      return decoded
    } catch (error) {
      logger.warn('Token verification failed', { error: error.message })
      return null
    }
  }

  async requestPasswordReset(email: string): Promise<boolean> {
    try {
      const user = await this.findUserByEmail(email)
      if (!user) {
        return true
      }

      const resetToken = await this.generateResetToken()
      
      const resetRequest: PasswordResetRequest = {
        email,
        token: resetToken,
        expiresAt: new Date(Date.now() + 3600000),
        used: false,
        createdAt: new Date()
      }

      this.passwordResets.set(resetToken, resetRequest)
      await this.sendPasswordResetEmail(user, resetToken)

      logger.info('Password reset requested', { email })
      return true
    } catch (error) {
      logger.error('Password reset request failed', { error: error.message, email })
      return false
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    try {
      const resetRequest = this.passwordResets.get(token)
      if (!resetRequest || resetRequest.used || resetRequest.expiresAt < new Date()) {
        return false
      }

      const user = await this.findUserByEmail(resetRequest.email)
      if (!user) {
        return false
      }

      const hashedPassword = await this.hashPassword(newPassword)
      user.password = hashedPassword
      user.updatedAt = new Date()

      this.users.set(user.id, user)

      resetRequest.used = true
      this.passwordResets.set(token, resetRequest)

      await this.invalidateAllUserSessions(user.id)
      await this.executePasswordReset(user)

      logger.info('Password reset successful', { userId: user.id })
      return true
    } catch (error) {
      logger.error('Password reset failed', { error: error.message })
      return false
    }
  }

  async sendEmailVerification(user: User): Promise<void> {
    try {
      const verificationToken = await this.generateVerificationToken()
      
      const verificationRequest: EmailVerificationRequest = {
        email: user.email,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 86400000),
        used: false,
        createdAt: new Date()
      }

      this.emailVerifications.set(verificationToken, verificationRequest)
      await this.sendVerificationEmail(user, verificationToken)

      logger.info('Email verification sent', { userId: user.id, email: user.email })
    } catch (error) {
      logger.error('Email verification failed', { error: error.message, userId: user.id })
      throw error
    }
  }

  async verifyEmail(token: string): Promise<boolean> {
    try {
      const verificationRequest = this.emailVerifications.get(token)
      if (!verificationRequest || verificationRequest.used || verificationRequest.expiresAt < new Date()) {
        return false
      }

      const user = await this.findUserByEmail(verificationRequest.email)
      if (!user) {
        return false
      }

      user.emailVerified = new Date()
      user.updatedAt = new Date()
      this.users.set(user.id, user)

      verificationRequest.used = true
      this.emailVerifications.set(token, verificationRequest)

      await this.executeEmailVerified(user)

      logger.info('Email verified successfully', { userId: user.id })
      return true
    } catch (error) {
      logger.error('Email verification failed', { error: error.message })
      return false
    }
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const user = await this.findUserById(userId)
      if (!user) {
        return false
      }

      const rolePermissions = await this.getRolePermissions(user.role)
      return rolePermissions.includes(permission)
    } catch (error) {
      logger.error('Permission check failed', { error: error.message, userId, permission })
      return false
    }
  }

  async canAccessPlugin(userId: string, pluginId: string): Promise<boolean> {
    try {
      const user = await this.findUserById(userId)
      if (!user) {
        return false
      }

      const pluginPermissions = await this.getPluginPermissions(userId, pluginId)
      return pluginPermissions.includes('plugin.access')
    } catch (error) {
      logger.error('Plugin access check failed', { error: error.message, userId, pluginId })
      return false
    }
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values()).map(user => this.sanitizeUser(user))
  }

  async updateUser(userId: string, updateData: Partial<User>): Promise<User | null> {
    try {
      const user = this.users.get(userId)
      if (!user) {
        return null
      }

      const updatedUser = { ...user, ...updateData, updatedAt: new Date() }
      this.users.set(userId, updatedUser)

      if (updateData.email && updateData.email !== user.email) {
        this.usersByEmail.delete(user.email)
        this.usersByEmail.set(updateData.email, userId)
      }

      if (updateData.username && updateData.username !== user.username) {
        if (user.username) {
          this.usersByUsername.delete(user.username)
        }
        this.usersByUsername.set(updateData.username, userId)
      }

      logger.info('User updated', { userId, updateData })
      return this.sanitizeUser(updatedUser)
    } catch (error) {
      logger.error('User update failed', { error: error.message, userId })
      return null
    }
  }

  // Hook execution methods
  private async executeBeforeSignIn(credentials: AuthCredentials): Promise<AuthCredentials | null> {
    if (this.hooks.beforeSignIn) {
      return await this.hooks.beforeSignIn(credentials)
    }
    return credentials
  }

  private async executeAfterSignIn(user: User, session: Session): Promise<void> {
    if (this.hooks.afterSignIn) {
      await this.hooks.afterSignIn(user, session)
    }
  }

  private async executeBeforeSignUp(data: RegisterData): Promise<RegisterData | null> {
    if (this.hooks.beforeSignUp) {
      return await this.hooks.beforeSignUp(data)
    }
    return data
  }

  private async executeAfterSignUp(user: User): Promise<void> {
    if (this.hooks.afterSignUp) {
      await this.hooks.afterSignUp(user)
    }
  }

  private async executeBeforeSignOut(user: User): Promise<void> {
    if (this.hooks.beforeSignOut) {
      await this.hooks.beforeSignOut(user)
    }
  }

  private async executeAfterSignOut(userId: string): Promise<void> {
    if (this.hooks.afterSignOut) {
      await this.hooks.afterSignOut(userId)
    }
  }

  private async executePasswordReset(user: User): Promise<void> {
    if (this.hooks.onPasswordReset) {
      await this.hooks.onPasswordReset(user)
    }
  }

  private async executeEmailVerified(user: User): Promise<void> {
    if (this.hooks.onEmailVerified) {
      await this.hooks.onEmailVerified(user)
    }
  }

  // Implementation methods
  private async validateCredentials(credentials: AuthCredentials): Promise<AuthCredentials> {
    if (!credentials.email || !credentials.password) {
      throw new ValidationError('Email and password are required')
    }
    
    if (!this.isValidEmail(credentials.email)) {
      throw new ValidationError('Invalid email format')
    }
    
    return credentials
  }

  private async validateRegistrationData(data: RegisterData): Promise<RegisterData> {
    if (!data.email || !data.password) {
      throw new ValidationError('Email and password are required')
    }
    
    if (!this.isValidEmail(data.email)) {
      throw new ValidationError('Invalid email format')
    }
    
    if (data.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters')
    }
    
    return data
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  }

  private async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  }

  private async generateToken(user: User, session: Session): Promise<string> {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(session.expiresAt.getTime() / 1000),
      iss: process.env.NEXTAUTH_URL!,
      aud: process.env.NEXTAUTH_URL!,
      sessionId: session.id
    }

    return jwt.sign(payload, process.env.NEXTAUTH_SECRET!)
  }

  private async generateResetToken(): Promise<string> {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  private async generateVerificationToken(): Promise<string> {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  private sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...sanitizedUser } = user as any
    return sanitizedUser
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const userId = this.usersByEmail.get(email)
    return userId ? this.users.get(userId) || null : null
  }

  private async findUserByUsername(username: string): Promise<User | null> {
    const userId = this.usersByUsername.get(username)
    return userId ? this.users.get(userId) || null : null
  }

  private async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }

  private async findUserByProvider(provider: AuthProvider, providerId: string): Promise<User | null> {
    const key = `${provider}:${providerId}`
    const userId = this.usersByProvider.get(key)
    return userId ? this.users.get(userId) || null : null
  }

  private async createUser(userData: RegisterData & { 
    password: string; 
    provider: AuthProvider; 
    role: UserRole; 
    isActive: boolean; 
    isBanned: boolean 
  }): Promise<User> {
    const user: User = {
      id: this.generateId(),
      email: userData.email,
      username: userData.username,
      name: userData.name,
      role: userData.role,
      provider: userData.provider,
      isActive: userData.isActive,
      isBanned: userData.isBanned,
      password: userData.password,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.users.set(user.id, user)
    this.usersByEmail.set(user.email, user.id)
    if (user.username) {
      this.usersByUsername.set(user.username, user.id)
    }

    return user
  }

  private async createUserFromOAuth(profile: OAuthProfile): Promise<User> {
    const user: User = {
      id: this.generateId(),
      email: profile.email,
      username: profile.username,
      name: profile.name,
      avatar: profile.avatar,
      role: UserRole.USER,
      provider: profile.provider,
      providerId: profile.id,
      isActive: true,
      isBanned: false,
      emailVerified: new Date(),
      metadata: { oauthTokens: { accessToken: profile.accessToken, refreshToken: profile.refreshToken } },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.users.set(user.id, user)
    this.usersByEmail.set(user.email, user.id)
    if (user.username) {
      this.usersByUsername.set(user.username, user.id)
    }
    this.usersByProvider.set(`${profile.provider}:${profile.id}`, user.id)

    return user
  }

  private async linkOAuthAccount(user: User, profile: OAuthProfile): Promise<void> {
    user.providerId = profile.id
    user.metadata = { 
      ...user.metadata, 
      oauthTokens: { accessToken: profile.accessToken, refreshToken: profile.refreshToken } 
    }
    user.updatedAt = new Date()

    this.users.set(user.id, user)
    this.usersByProvider.set(`${profile.provider}:${profile.id}`, user.id)
  }

  private async updateOAuthTokens(user: User, profile: OAuthProfile): Promise<void> {
    user.metadata = { 
      ...user.metadata, 
      oauthTokens: { accessToken: profile.accessToken, refreshToken: profile.refreshToken } 
    }
    user.updatedAt = new Date()
    this.users.set(user.id, user)
  }

  private async createSession(user: User): Promise<Session> {
    const session: Session = {
      id: this.generateId(),
      userId: user.id,
      token: this.generateId(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      lastActiveAt: new Date(),
      createdAt: new Date()
    }

    this.sessions.set(session.id, session)
    return session
  }

  private async findSessionById(sessionId: string): Promise<Session | null> {
    return this.sessions.get(sessionId) || null
  }

  private async invalidateSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  private async invalidateAllUserSessions(userId: string): Promise<void> {
    Array.from(this.sessions.entries())
      .filter(([_, session]) => session.userId === userId)
      .forEach(([sessionId]) => this.sessions.delete(sessionId))
  }

  private async sendPasswordResetEmail(user: User, token: string): Promise<void> {
    logger.info('Password reset email sent', { 
      userId: user.id, 
      email: user.email, 
      resetUrl: `${process.env.NEXTAUTH_URL}/reset-password?token=${token}` 
    })
  }

  private async sendVerificationEmail(user: User, token: string): Promise<void> {
    logger.info('Verification email sent', { 
      userId: user.id, 
      email: user.email, 
      verifyUrl: `${process.env.NEXTAUTH_URL}/verify-email?token=${token}` 
    })
  }

  private async getRolePermissions(role: UserRole): Promise<string[]> {
    const permissions = {
      [UserRole.USER]: [
        'content.create', 'content.read', 'content.update.own', 'content.delete.own',
        'profile.read', 'profile.update.own', 'plugin.access'
      ],
      [UserRole.MODERATOR]: [
        'content.create', 'content.read', 'content.update', 'content.delete',
        'content.moderate', 'user.moderate', 'plugin.access'
      ],
      [UserRole.ADMIN]: [
        'content.*', 'user.*', 'plugin.*', 'system.read', 'system.configure'
      ],
      [UserRole.SUPER_ADMIN]: [
        '*'
      ]
    }
    return permissions[role] || []
  }

  private async getPluginPermissions(userId: string, pluginId: string): Promise<string[]> {
    return ['plugin.access', 'plugin.configure']
  }
}