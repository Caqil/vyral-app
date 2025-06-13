import { UserRole } from '@/core/types/auth'
import { PluginPermission, PermissionScope } from '@/core/types/plugin'
import { logger } from '@/core/lib/utils/logger'

export class PluginPermissions {
  private static instance: PluginPermissions
  private permissions: Map<string, PluginPermission[]> = new Map()
  private roleHierarchy: Record<UserRole, number> = {
    [UserRole.USER]: 1,
    [UserRole.MODERATOR]: 2,
    [UserRole.ADMIN]: 3,
    [UserRole.SUPER_ADMIN]: 4
  }

  private constructor() {}

  public static getInstance(): PluginPermissions {
    if (!PluginPermissions.instance) {
      PluginPermissions.instance = new PluginPermissions()
    }
    return PluginPermissions.instance
  }

  /**
   * Register plugin permissions
   */
  public registerPermissions(pluginId: string, permissions: PluginPermission[]): void {
    try {
      // Validate permissions
      const validatedPermissions = this.validatePermissions(permissions)
      
      // Store permissions
      this.permissions.set(pluginId, validatedPermissions)
      
      logger.info('Plugin permissions registered', {
        pluginId,
        permissionCount: permissions.length
      })
    } catch (error) {
      logger.error('Failed to register plugin permissions', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  }

  /**
   * Remove plugin permissions
   */
  public removePermissions(pluginId: string): void {
    const removed = this.permissions.delete(pluginId)
    
    if (removed) {
      logger.info('Plugin permissions removed', { pluginId })
    }
  }

  /**
   * Get plugin permissions
   */
  public getPermissions(pluginId: string): PluginPermission[] {
    return this.permissions.get(pluginId) || []
  }

  /**
   * Check if user has permission for plugin action
   */
  public hasPermission(
    userId: string,
    userRole: UserRole,
    userPermissions: string[],
    pluginId: string,
    requiredPermission: string
  ): boolean {
    try {
      // Get plugin permissions
      const pluginPermissions = this.getPermissions(pluginId)
      
      // Find the required permission
      const permission = pluginPermissions.find(p => p.name === requiredPermission)
      
      if (!permission) {
        logger.warn('Permission not found', {
          pluginId,
          requiredPermission,
          userId
        })
        return false
      }

      // Check if permission is dangerous and user has sufficient role
      if (permission.dangerous && !this.hasMinimumRole(userRole, UserRole.ADMIN)) {
        logger.warn('Dangerous permission denied - insufficient role', {
          pluginId,
          requiredPermission,
          userRole,
          userId
        })
        return false
      }

      // Check role-based permission
      if (this.checkRolePermission(userRole, permission)) {
        return true
      }

      // Check explicit user permissions
      if (this.checkUserPermission(userPermissions, pluginId, requiredPermission, permission.scope)) {
        return true
      }

      logger.debug('Permission denied', {
        pluginId,
        requiredPermission,
        userRole,
        userId
      })

      return false
    } catch (error) {
      logger.error('Permission check failed', {
        pluginId,
        requiredPermission,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return false
    }
  }

  /**
   * Check if user can install plugin
   */
  public canInstallPlugin(userRole: UserRole, pluginPermissions: PluginPermission[]): {
    allowed: boolean
    reason?: string
    dangerousPermissions: PluginPermission[]
  } {
    const dangerousPermissions = pluginPermissions.filter(p => p.dangerous)
    
    // Check if user has admin role for dangerous permissions
    if (dangerousPermissions.length > 0 && !this.hasMinimumRole(userRole, UserRole.ADMIN)) {
      return {
        allowed: false,
        reason: 'Plugin requires dangerous permissions that need admin approval',
        dangerousPermissions
      }
    }

    // Check for system-level permissions
    const systemPermissions = pluginPermissions.filter(p => p.scope === PermissionScope.SYSTEM)
    if (systemPermissions.length > 0 && !this.hasMinimumRole(userRole, UserRole.MODERATOR)) {
      return {
        allowed: false,
        reason: 'Plugin requires system permissions',
        dangerousPermissions
      }
    }

    return {
      allowed: true,
      dangerousPermissions
    }
  }

  /**
   * Get permissions summary for plugin
   */
  public getPermissionsSummary(pluginId: string): {
    total: number
    required: number
    dangerous: number
    byScope: Record<PermissionScope, number>
  } {
    const permissions = this.getPermissions(pluginId)
    
    const summary = {
      total: permissions.length,
      required: permissions.filter(p => p.required).length,
      dangerous: permissions.filter(p => p.dangerous).length,
      byScope: {
        [PermissionScope.SYSTEM]: 0,
        [PermissionScope.USER]: 0,
        [PermissionScope.CONTENT]: 0,
        [PermissionScope.API]: 0,
        [PermissionScope.DATABASE]: 0,
        [PermissionScope.FILE]: 0,
        [PermissionScope.NETWORK]: 0
      }
    }

    permissions.forEach(permission => {
      summary.byScope[permission.scope]++
    })

    return summary
  }

  /**
   * Validate user permissions for multiple plugins
   */
  public validateUserPermissions(
    userId: string,
    userRole: UserRole,
    userPermissions: string[],
    pluginIds: string[]
  ): Record<string, { allowed: boolean; missingPermissions: string[] }> {
    const results: Record<string, { allowed: boolean; missingPermissions: string[] }> = {}

    pluginIds.forEach(pluginId => {
      const pluginPermissions = this.getPermissions(pluginId)
      const requiredPermissions = pluginPermissions.filter(p => p.required)
      const missingPermissions: string[] = []

      requiredPermissions.forEach(permission => {
        if (!this.hasPermission(userId, userRole, userPermissions, pluginId, permission.name)) {
          missingPermissions.push(permission.name)
        }
      })

      results[pluginId] = {
        allowed: missingPermissions.length === 0,
        missingPermissions
      }
    })

    return results
  }

  /**
   * Get all dangerous permissions across plugins
   */
  public getDangerousPermissions(): Array<{
    pluginId: string
    permissions: PluginPermission[]
  }> {
    const dangerous: Array<{ pluginId: string; permissions: PluginPermission[] }> = []

    this.permissions.forEach((permissions, pluginId) => {
      const dangerousPerms = permissions.filter(p => p.dangerous)
      if (dangerousPerms.length > 0) {
        dangerous.push({
          pluginId,
          permissions: dangerousPerms
        })
      }
    })

    return dangerous
  }

  /**
   * Generate permission audit report
   */
  public generateAuditReport(): {
    totalPlugins: number
    totalPermissions: number
    dangerousPermissions: number
    pluginsByScope: Record<PermissionScope, string[]>
    riskAnalysis: {
      high: string[]
      medium: string[]
      low: string[]
    }
  } {
    let totalPermissions = 0
    let dangerousPermissions = 0
    const pluginsByScope: Record<PermissionScope, string[]> = {
      [PermissionScope.SYSTEM]: [],
      [PermissionScope.USER]: [],
      [PermissionScope.CONTENT]: [],
      [PermissionScope.API]: [],
      [PermissionScope.DATABASE]: [],
      [PermissionScope.FILE]: [],
      [PermissionScope.NETWORK]: []
    }
    const riskAnalysis = {
      high: [] as string[],
      medium: [] as string[],
      low: [] as string[]
    }

    this.permissions.forEach((permissions, pluginId) => {
      totalPermissions += permissions.length
      const dangerous = permissions.filter(p => p.dangerous).length
      dangerousPermissions += dangerous

      // Categorize by scope
      permissions.forEach(permission => {
        if (!pluginsByScope[permission.scope].includes(pluginId)) {
          pluginsByScope[permission.scope].push(pluginId)
        }
      })

      // Risk analysis
      if (dangerous > 2 || permissions.some(p => p.scope === PermissionScope.SYSTEM)) {
        riskAnalysis.high.push(pluginId)
      } else if (dangerous > 0 || permissions.length > 5) {
        riskAnalysis.medium.push(pluginId)
      } else {
        riskAnalysis.low.push(pluginId)
      }
    })

    return {
      totalPlugins: this.permissions.size,
      totalPermissions,
      dangerousPermissions,
      pluginsByScope,
      riskAnalysis
    }
  }

  /**
   * Clear all permissions (for testing)
   */
  public clearAll(): void {
    this.permissions.clear()
    logger.info('All plugin permissions cleared')
  }

  // Private helper methods
  private validatePermissions(permissions: PluginPermission[]): PluginPermission[] {
    return permissions.map(permission => {
      if (!permission.name || !permission.description) {
        throw new Error('Permission must have name and description')
      }

      if (!Object.values(PermissionScope).includes(permission.scope)) {
        throw new Error(`Invalid permission scope: ${permission.scope}`)
      }

      return {
        ...permission,
        name: permission.name.toLowerCase().trim(),
        description: permission.description.trim(),
        required: permission.required ?? false,
        dangerous: permission.dangerous ?? false
      }
    })
  }

  private hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
    return this.roleHierarchy[userRole] >= this.roleHierarchy[requiredRole]
  }

  private checkRolePermission(userRole: UserRole, permission: PluginPermission): boolean {
    // Super admin has all permissions
    if (userRole === UserRole.SUPER_ADMIN) {
      return true
    }

    // Admin has most permissions except dangerous system ones
    if (userRole === UserRole.ADMIN) {
      if (permission.dangerous && permission.scope === PermissionScope.SYSTEM) {
        return false
      }
      return true
    }

    // Moderator has limited permissions
    if (userRole === UserRole.MODERATOR) {
      if (permission.dangerous || permission.scope === PermissionScope.SYSTEM) {
        return false
      }
      return permission.scope !== PermissionScope.DATABASE
    }

    // Regular users have minimal permissions
    return !permission.dangerous && 
           permission.scope === PermissionScope.USER || 
           permission.scope === PermissionScope.CONTENT
  }

  private checkUserPermission(
    userPermissions: string[],
    pluginId: string,
    requiredPermission: string,
    scope: PermissionScope
  ): boolean {
    // Check for explicit plugin permission
    const pluginPermission = `plugin:${pluginId}:${requiredPermission}`
    if (userPermissions.includes(pluginPermission)) {
      return true
    }

    // Check for wildcard plugin permission
    const wildcardPluginPermission = `plugin:${pluginId}:*`
    if (userPermissions.includes(wildcardPluginPermission)) {
      return true
    }

    // Check for scope-based permission
    const scopePermission = `${scope}:${requiredPermission}`
    if (userPermissions.includes(scopePermission)) {
      return true
    }

    // Check for wildcard scope permission
    const wildcardScopePermission = `${scope}:*`
    if (userPermissions.includes(wildcardScopePermission)) {
      return true
    }

    // Check for global wildcard
    if (userPermissions.includes('*:*')) {
      return true
    }

    return false
  }
}