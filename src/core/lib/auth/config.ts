import { NextAuthConfig } from 'next-auth'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import { MongoClient } from 'mongodb'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import DiscordProvider from 'next-auth/providers/discord'
import { User } from '@/core/models/User'
import { Session } from '@/core/models/Session'
import { connectToDatabase } from '@/lib/database/connection'
import { logger } from '@/core/lib/utils/logger'
import { AuthProvider, UserRole, AuthError } from '@/core/types/auth'
import { ValidationError, AuthenticationError, ConflictError } from '@/core/types'
import { ENV_DEFAULTS } from '@/core/lib/utils/constants'
import { authService } from '@/core/services/auth.service'
import bcrypt from 'bcryptjs'
import { generateSecureToken, validatePassword, sanitizeUser } from './utils'

// MongoDB client for adapter
const client = new MongoClient(process.env.DATABASE_URL || ENV_DEFAULTS.DATABASE_URL)

// Base NextAuth configuration
export const authConfig: NextAuthConfig = {
  adapter: MongoDBAdapter(client, {
    databaseName: process.env.DATABASE_NAME || 'social-platform',
    collections: {
      Users: 'users',
      Sessions: 'sessions',
      Accounts: 'accounts',
      VerificationTokens: 'verificationtokens'
    }
  }),
  
  providers: [
    // Credentials provider for email/password authentication
    CredentialsProvider({
      id: 'credentials',
      name: 'Email and Password',
      credentials: {
        email: {
          label: 'Email',
          type: 'email',
          placeholder: 'your@email.com'
        },
        password: {
          label: 'Password',
          type: 'password',
          placeholder: 'Your password'
        }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            logger.warn('Missing credentials in authorization attempt', { email: credentials?.email })
            throw new ValidationError('Email and password are required')
          }

          await connectToDatabase()

          // Find user by email
          const user = await User.findByEmail(credentials.email)
          if (!user) {
            logger.warn('User not found during authentication', { email: credentials.email })
            throw new AuthenticationError('Invalid credentials')
          }

          // Check if user is active and not banned
          if (!user.isActive) {
            logger.warn('Inactive user attempted login', { userId: user._id, email: user.email })
            throw new AuthenticationError('Account is inactive')
          }

          if (user.isBanned) {
            logger.warn('Banned user attempted login', { 
              userId: user._id, 
              email: user.email,
              banReason: user.banReason 
            })
            throw new AuthenticationError('Account is banned')
          }

          // Verify password
          const isValidPassword = await user.comparePassword(credentials.password)
          if (!isValidPassword) {
            // Track failed login attempt
            user.security.failedLoginAttempts += 1
            
            // Lock account after 5 failed attempts
            if (user.security.failedLoginAttempts >= 5) {
              user.security.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
              logger.warn('Account locked due to failed login attempts', { 
                userId: user._id, 
                email: user.email 
              })
            }
            
            await user.save()
            throw new AuthenticationError('Invalid credentials')
          }

          // Check if account is locked
          if (user.security.lockoutUntil && user.security.lockoutUntil > new Date()) {
            logger.warn('Login attempt on locked account', { 
              userId: user._id, 
              email: user.email,
              lockoutUntil: user.security.lockoutUntil 
            })
            throw new AuthenticationError(`Account locked until ${user.security.lockoutUntil.toISOString()}`)
          }

          // Reset failed login attempts on successful login
          user.security.failedLoginAttempts = 0
          user.security.lockoutUntil = undefined
          user.loginCount += 1
          user.lastLoginAt = new Date()
          user.lastActiveAt = new Date()
          
          await user.save()

          logger.info('Successful credential authentication', { 
            userId: user._id, 
            email: user.email,
            role: user.role 
          })

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            username: user.username,
            avatar: user.avatar,
            role: user.role,
            provider: AuthProvider.EMAIL,
            emailVerified: user.emailVerified,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }

        } catch (error: any) {
          logger.error('Credential authentication failed', { 
            error: error.message,
            email: credentials?.email 
          })
          
          // Return null for authentication failures (NextAuth expects null)
          return null
        }
      }
    }),

    // Google OAuth provider
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
          scope: 'openid email profile'
        }
      },
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          username: profile.email?.split('@')[0],
          avatar: profile.picture,
          role: UserRole.USER,
          provider: AuthProvider.GOOGLE,
          providerId: profile.sub,
          emailVerified: profile.email_verified ? new Date() : null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }),

    // GitHub OAuth provider
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user user:email'
        }
      },
      profile(profile) {
        return {
          id: profile.id.toString(),
          email: profile.email,
          name: profile.name || profile.login,
          username: profile.login,
          avatar: profile.avatar_url,
          role: UserRole.USER,
          provider: AuthProvider.GITHUB,
          providerId: profile.id.toString(),
          emailVerified: profile.email ? new Date() : null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }),

    // Discord OAuth provider
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify email'
        }
      },
      profile(profile) {
        return {
          id: profile.id,
          email: profile.email,
          name: profile.global_name || profile.username,
          username: profile.username,
          avatar: profile.avatar ? 
            `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : 
            null,
          role: UserRole.USER,
          provider: AuthProvider.DISCORD,
          providerId: profile.id,
          emailVerified: profile.verified ? new Date() : null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    })
  ],

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  jwt: {
    maxAge: 7 * 24 * 60 * 60, // 7 days
    secret: process.env.NEXTAUTH_SECRET,
  },

  pages: {
    signIn: '/auth/signin',
    signUp: '/auth/signup',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
    newUser: '/auth/welcome'
  },

  callbacks: {
    // JWT callback - called whenever JWT is created, updated, or accessed
    async jwt({ token, user, account, profile, trigger, session }) {
      try {
        await connectToDatabase()

        // Initial sign in
        if (user && account) {
          logger.debug('JWT callback - initial sign in', { 
            userId: user.id, 
            provider: account.provider 
          })

          // Find or create user in database
          let dbUser = await User.findById(user.id)
          
          if (!dbUser && account.provider !== 'credentials') {
            // Create new user for OAuth providers
            dbUser = await User.create({
              email: user.email,
              name: user.name,
              username: user.username || user.email?.split('@')[0],
              avatar: user.avatar,
              role: UserRole.USER,
              provider: account.provider as AuthProvider,
              providerId: account.providerAccountId,
              emailVerified: user.emailVerified || new Date(),
              isActive: true,
              isBanned: false,
              lastActiveAt: new Date(),
              loginCount: 1,
              preferences: {
                theme: 'system',
                language: 'en',
                timezone: 'UTC',
                notifications: {
                  email: true,
                  push: true,
                  sms: false,
                  inApp: true,
                  types: {
                    likes: true,
                    comments: true,
                    follows: true,
                    mentions: true,
                    messages: true,
                    systemUpdates: true,
                    pluginUpdates: false
                  }
                },
                privacy: {
                  profileVisibility: 'public',
                  showEmail: false,
                  showPhone: false,
                  showLocation: false,
                  allowSearch: true,
                  allowTagging: true
                },
                feed: {
                  algorithm: 'personalized',
                  showRecommendations: true,
                  hideReposts: false,
                  hideLikedPosts: false
                }
              },
              profile: {
                interests: [],
                skills: []
              },
              stats: {
                postsCount: 0,
                followersCount: 0,
                followingCount: 0,
                likesReceived: 0,
                commentsReceived: 0,
                sharesReceived: 0,
                viewsReceived: 0,
                reputation: 0
              },
              security: {
                twoFactorEnabled: false,
                backupCodes: [],
                failedLoginAttempts: 0,
                passwordChangedAt: new Date(),
                sessions: []
              },
              permissions: [],
              blockedUsers: [],
              mutedUsers: [],
              metadata: {}
            })

            logger.info('New user created via OAuth', { 
              userId: dbUser._id, 
              email: dbUser.email,
              provider: account.provider 
            })
          }

          if (dbUser) {
            // Add user data to token
            token.userId = dbUser._id.toString()
            token.email = dbUser.email
            token.name = dbUser.name
            token.username = dbUser.username
            token.avatar = dbUser.avatar
            token.role = dbUser.role
            token.provider = dbUser.provider
            token.emailVerified = dbUser.emailVerified
            token.isActive = dbUser.isActive
            token.permissions = dbUser.getDefaultPermissions().map(p => 
              `${p.resource}:${p.actions.join(',')}:${p.scope}`
            )

            // Create session record
            const sessionToken = generateSecureToken()
            const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

            await Session.create({
              userId: dbUser._id,
              token: sessionToken,
              expiresAt: sessionExpiry,
              lastActiveAt: new Date(),
              isActive: true,
              deviceInfo: {
                type: 'unknown'
              },
              metadata: {
                loginMethod: account.provider === 'credentials' ? 'password' : 'oauth',
                oauthProvider: account.provider !== 'credentials' ? account.provider : undefined,
                rememberMe: false,
                twoFactorVerified: false,
                riskScore: 0,
                flags: []
              },
              permissions: dbUser.getDefaultPermissions(),
              securityEvents: [{
                type: 'login',
                timestamp: new Date(),
                severity: 'low'
              }],
              renewalCount: 0,
              maxRenewals: 10
            })

            token.sessionToken = sessionToken
          }
        }

        // Session update
        if (trigger === 'update' && session) {
          logger.debug('JWT callback - session update', { userId: token.userId })
          
          // Update user data in token
          if (session.user) {
            token.name = session.user.name || token.name
            token.email = session.user.email || token.email
            token.avatar = session.user.avatar || token.avatar
          }
        }

        // Token refresh
        if (!user && token.userId) {
          logger.debug('JWT callback - token refresh', { userId: token.userId })
          
          // Refresh user data from database
          const dbUser = await User.findById(token.userId)
          if (dbUser && dbUser.isActive && !dbUser.isBanned) {
            token.role = dbUser.role
            token.isActive = dbUser.isActive
            token.permissions = dbUser.getDefaultPermissions().map(p => 
              `${p.resource}:${p.actions.join(',')}:${p.scope}`
            )
            
            // Update last active time
            dbUser.lastActiveAt = new Date()
            await dbUser.save()
          } else {
            // User is inactive or banned, invalidate token
            logger.warn('Token refresh failed - user inactive or banned', { userId: token.userId })
            return null
          }
        }

        return token

      } catch (error: any) {
        logger.error('JWT callback error', { error: error.message, userId: token.userId })
        return token
      }
    },

    // Session callback - sent to client
    async session({ session, token }) {
      try {
        if (token?.userId) {
          session.user = {
            id: token.userId as string,
            email: token.email as string,
            name: token.name as string,
            username: token.username as string,
            avatar: token.avatar as string,
            role: token.role as UserRole,
            provider: token.provider as AuthProvider,
            emailVerified: token.emailVerified as Date,
            isActive: token.isActive as boolean,
            permissions: token.permissions as string[]
          }

          // Update session activity
          if (token.sessionToken) {
            await Session.findOneAndUpdate(
              { token: token.sessionToken },
              { lastActiveAt: new Date() },
              { new: true }
            )
          }
        }

        return session
      } catch (error: any) {
        logger.error('Session callback error', { error: error.message, userId: token?.userId })
        return session
      }
    },

    // Sign in callback
    async signIn({ user, account, profile, email, credentials }) {
      try {
        await connectToDatabase()

        // Allow credentials provider
        if (account?.provider === 'credentials') {
          return true
        }

        // OAuth provider validation
        if (account && profile) {
          logger.debug('OAuth sign in attempt', { 
            provider: account.provider, 
            email: profile.email 
          })

          // Check if email is required but missing
          if (!profile.email) {
            logger.warn('OAuth sign in rejected - no email', { 
              provider: account.provider,
              profileId: profile.sub || profile.id 
            })
            return false
          }

          // Check for existing user with same email but different provider
          const existingUser = await User.findByEmail(profile.email)
          if (existingUser && existingUser.provider !== account.provider) {
            logger.warn('OAuth sign in rejected - email exists with different provider', {
              email: profile.email,
              existingProvider: existingUser.provider,
              attemptedProvider: account.provider
            })
            return `/auth/error?error=OAuthAccountNotLinked&email=${encodeURIComponent(profile.email)}`
          }

          return true
        }

        return false
      } catch (error: any) {
        logger.error('Sign in callback error', { error: error.message })
        return false
      }
    },

    // Redirect callback
    async redirect({ url, baseUrl }) {
      // Allow relative URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`
      
      // Allow URLs on the same origin
      if (new URL(url).origin === baseUrl) return url
      
      // Default redirect
      return baseUrl
    }
  },

  events: {
    async signIn({ user, account, profile, isNewUser }) {
      logger.info('User signed in', {
        userId: user.id,
        email: user.email,
        provider: account?.provider,
        isNewUser
      })

      // Execute auth hooks
      try {
        await connectToDatabase()
        const dbUser = await User.findById(user.id)
        
        if (dbUser) {
          // Execute after sign in hooks
          await authService.executeAfterSignIn?.(dbUser, null)
        }
      } catch (error: any) {
        logger.error('Sign in event hook error', { error: error.message, userId: user.id })
      }
    },

    async signOut({ token }) {
      logger.info('User signed out', { userId: token?.userId })

      try {
        if (token?.userId && token?.sessionToken) {
          await connectToDatabase()
          
          // Invalidate session
          await Session.findOneAndUpdate(
            { token: token.sessionToken },
            { 
              isActive: false,
              invalidatedAt: new Date(),
              invalidationReason: 'user_logout'
            }
          )

          // Execute after sign out hooks
          await authService.executeAfterSignOut?.(token.userId as string)
        }
      } catch (error: any) {
        logger.error('Sign out event hook error', { error: error.message, userId: token?.userId })
      }
    },

    async createUser({ user }) {
      logger.info('New user created', { userId: user.id, email: user.email })
    },

    async linkAccount({ user, account, profile }) {
      logger.info('Account linked', {
        userId: user.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId
      })
    },

    async session({ session, token }) {
      // Update user activity
      if (token?.userId) {
        try {
          await connectToDatabase()
          await User.findByIdAndUpdate(
            token.userId,
            { lastActiveAt: new Date() },
            { new: true }
          )
        } catch (error: any) {
          logger.error('Session event error', { error: error.message, userId: token.userId })
        }
      }
    }
  },

  // Debug mode in development
  debug: process.env.NODE_ENV === 'development',
  
  // Logger configuration
  logger: {
    error(code, metadata) {
      logger.error(`NextAuth error: ${code}`, metadata)
    },
    warn(code) {
      logger.warn(`NextAuth warning: ${code}`)
    },
    debug(code, metadata) {
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`NextAuth debug: ${code}`, metadata)
      }
    }
  }
}

export default authConfig