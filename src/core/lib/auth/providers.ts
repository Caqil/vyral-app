import { AuthProvider, UserRole } from '@/core/types/auth'
import { logger } from '@/core/lib/utils/logger'

export interface OAuthProviderConfig {
  id: string
  name: string
  type: 'oauth'
  clientId: string
  clientSecret: string
  authorization: {
    url: string
    params: Record<string, string>
  }
  token: {
    url: string
    params?: Record<string, string>
  }
  userinfo: {
    url: string
    params?: Record<string, string>
  }
  profile: (profile: any) => Promise<any> | any
  checks?: string[]
  style?: {
    logo: string
    bg: string
    text: string
    bgDark: string
    textDark: string
  }
}

export interface ProviderProfile {
  id: string
  email: string
  name?: string
  username?: string
  avatar?: string
  emailVerified?: boolean
  raw?: Record<string, any>
}

/**
 * Google OAuth Provider Configuration
 */
export const googleProvider: OAuthProviderConfig = {
  id: 'google',
  name: 'Google',
  type: 'oauth',
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  authorization: {
    url: 'https://accounts.google.com/oauth/authorize',
    params: {
      scope: 'openid email profile',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent'
    }
  },
  token: {
    url: 'https://oauth2.googleapis.com/token'
  },
  userinfo: {
    url: 'https://openidconnect.googleapis.com/v1/userinfo'
  },
  profile: (profile: any): ProviderProfile => {
    logger.debug('Google profile received', { 
      sub: profile.sub, 
      email: profile.email,
      verified: profile.email_verified 
    })

    return {
      id: profile.sub,
      email: profile.email,
      name: profile.name,
      username: profile.email?.split('@')[0],
      avatar: profile.picture,
      emailVerified: profile.email_verified,
      raw: profile
    }
  },
  checks: ['pkce', 'state'],
  style: {
    logo: '/providers/google.svg',
    bg: '#4285f4',
    text: '#fff',
    bgDark: '#4285f4',
    textDark: '#fff'
  }
}

/**
 * GitHub OAuth Provider Configuration
 */
export const githubProvider: OAuthProviderConfig = {
  id: 'github',
  name: 'GitHub',
  type: 'oauth',
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  authorization: {
    url: 'https://github.com/login/oauth/authorize',
    params: {
      scope: 'read:user user:email'
    }
  },
  token: {
    url: 'https://github.com/login/oauth/access_token'
  },
  userinfo: {
    url: 'https://api.github.com/user'
  },
  profile: async (profile: any): Promise<ProviderProfile> => {
    logger.debug('GitHub profile received', { 
      id: profile.id, 
      login: profile.login,
      email: profile.email 
    })

    // GitHub doesn't always return email in the profile
    // We might need to fetch it separately if not present
    let email = profile.email
    if (!email) {
      logger.warn('GitHub profile missing email', { id: profile.id, login: profile.login })
    }

    return {
      id: profile.id.toString(),
      email: email,
      name: profile.name || profile.login,
      username: profile.login,
      avatar: profile.avatar_url,
      emailVerified: !!email,
      raw: profile
    }
  },
  checks: ['state'],
  style: {
    logo: '/providers/github.svg',
    bg: '#24292f',
    text: '#fff',
    bgDark: '#f0f6ff',
    textDark: '#24292f'
  }
}

/**
 * Discord OAuth Provider Configuration
 */
export const discordProvider: OAuthProviderConfig = {
  id: 'discord',
  name: 'Discord',
  type: 'oauth',
  clientId: process.env.DISCORD_CLIENT_ID!,
  clientSecret: process.env.DISCORD_CLIENT_SECRET!,
  authorization: {
    url: 'https://discord.com/api/oauth2/authorize',
    params: {
      scope: 'identify email'
    }
  },
  token: {
    url: 'https://discord.com/api/oauth2/token'
  },
  userinfo: {
    url: 'https://discord.com/api/users/@me'
  },
  profile: (profile: any): ProviderProfile => {
    logger.debug('Discord profile received', { 
      id: profile.id, 
      username: profile.username,
      email: profile.email,
      verified: profile.verified 
    })

    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(profile.discriminator) % 5}.png`

    return {
      id: profile.id,
      email: profile.email,
      name: profile.global_name || profile.username,
      username: profile.username,
      avatar,
      emailVerified: profile.verified,
      raw: profile
    }
  },
  checks: ['state'],
  style: {
    logo: '/providers/discord.svg',
    bg: '#5865F2',
    text: '#fff',
    bgDark: '#5865F2',
    textDark: '#fff'
  }
}

/**
 * Twitter/X OAuth Provider Configuration
 */
export const twitterProvider: OAuthProviderConfig = {
  id: 'twitter',
  name: 'Twitter',
  type: 'oauth',
  clientId: process.env.TWITTER_CLIENT_ID!,
  clientSecret: process.env.TWITTER_CLIENT_SECRET!,
  authorization: {
    url: 'https://twitter.com/i/oauth2/authorize',
    params: {
      scope: 'tweet.read users.read offline.access'
    }
  },
  token: {
    url: 'https://api.twitter.com/2/oauth2/token'
  },
  userinfo: {
    url: 'https://api.twitter.com/2/users/me',
    params: {
      'user.fields': 'id,name,username,profile_image_url,verified'
    }
  },
  profile: (profile: any): ProviderProfile => {
    logger.debug('Twitter profile received', { 
      id: profile.data?.id, 
      username: profile.data?.username,
      name: profile.data?.name 
    })

    const userData = profile.data
    return {
      id: userData.id,
      email: userData.email, // Twitter API v2 doesn't provide email by default
      name: userData.name,
      username: userData.username,
      avatar: userData.profile_image_url,
      emailVerified: false, // Twitter doesn't provide email verification status
      raw: profile
    }
  },
  checks: ['pkce', 'state'],
  style: {
    logo: '/providers/twitter.svg',
    bg: '#000000',
    text: '#fff',
    bgDark: '#1d9bf0',
    textDark: '#fff'
  }
}

/**
 * Available OAuth providers
 */
export const availableProviders = {
  google: googleProvider,
  github: githubProvider,
  discord: discordProvider,
  twitter: twitterProvider
} as const

/**
 * Get enabled providers based on environment variables
 */
export function getEnabledProviders(): OAuthProviderConfig[] {
  const providers: OAuthProviderConfig[] = []

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(googleProvider)
  }

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(githubProvider)
  }

  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    providers.push(discordProvider)
  }

  if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
    providers.push(twitterProvider)
  }

  logger.info('OAuth providers enabled', { 
    providers: providers.map(p => p.id),
    count: providers.length 
  })

  return providers
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(providerId: string): boolean {
  const provider = availableProviders[providerId as keyof typeof availableProviders]
  
  if (!provider) {
    logger.error('Invalid provider ID', { providerId })
    return false
  }

  if (!provider.clientId || !provider.clientSecret) {
    logger.error('Provider missing credentials', { 
      providerId,
      hasClientId: !!provider.clientId,
      hasClientSecret: !!provider.clientSecret 
    })
    return false
  }

  return true
}

/**
 * Get provider by ID
 */
export function getProvider(providerId: string): OAuthProviderConfig | null {
  const provider = availableProviders[providerId as keyof typeof availableProviders]
  
  if (!provider || !validateProviderConfig(providerId)) {
    return null
  }

  return provider
}

/**
 * Transform provider profile to user data
 */
export async function transformProviderProfile(
  providerId: string,
  profile: any
): Promise<{
  id: string;
  email: string;
  name?: string;
  username?: string;
  avatar?: string;
  role: UserRole;
  provider: AuthProvider;
  providerId: string;
  emailVerified: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  try {
    const provider = getProvider(providerId)
    if (!provider) {
      logger.error('Provider not found for profile transformation', { providerId })
      return null
    }

    const transformedProfile = await provider.profile(profile)
    
    return {
      id: transformedProfile.id,
      email: transformedProfile.email,
      name: transformedProfile.name,
      username: transformedProfile.username || transformedProfile.email?.split('@')[0],
      avatar: transformedProfile.avatar,
      role: UserRole.USER,
      provider: providerId as AuthProvider,
      providerId: transformedProfile.id,
      emailVerified: transformedProfile.emailVerified ? new Date() : null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  } catch (error: any) {
    logger.error('Profile transformation failed', { 
      error: error.message,
      providerId,
      profileId: profile?.id || profile?.sub 
    })
    return null
  }
}

/**
 * Provider-specific scopes
 */
export const providerScopes = {
  google: [
    'openid',
    'email',
    'profile'
  ],
  github: [
    'read:user',
    'user:email'
  ],
  discord: [
    'identify',
    'email'
  ],
  twitter: [
    'tweet.read',
    'users.read',
    'offline.access'
  ]
} as const

/**
 * Get required scopes for provider
 */
export function getProviderScopes(providerId: string): string[] {
  return [...(providerScopes[providerId as keyof typeof providerScopes] || [])];
}
/**
 * Provider display information
 */
export const providerDisplayInfo = {
  google: {
    name: 'Google',
    description: 'Sign in with your Google account',
    icon: 'google',
    color: '#4285f4'
  },
  github: {
    name: 'GitHub',
    description: 'Sign in with your GitHub account',
    icon: 'github',
    color: '#24292f'
  },
  discord: {
    name: 'Discord',
    description: 'Sign in with your Discord account',
    icon: 'discord',
    color: '#5865F2'
  },
  twitter: {
    name: 'Twitter',
    description: 'Sign in with your Twitter account',
    icon: 'twitter',
    color: '#1d9bf0'
  }
} as const

/**
 * Get provider display info
 */
export function getProviderDisplayInfo(providerId: string) {
  return providerDisplayInfo[providerId as keyof typeof providerDisplayInfo]
}

export default {
  getEnabledProviders,
  getProvider,
  validateProviderConfig,
  transformProviderProfile,
  getProviderScopes,
  getProviderDisplayInfo,
  availableProviders
}