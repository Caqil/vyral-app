'use client'

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { 
  Plugin, 
  PluginStatus, 
  PluginCategory,
} from '@/core/types/plugin'
import { APIResponse, PaginatedResponse, SearchParams } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { useAuth } from './useAuth'
import { toast } from 'sonner'

// Plugin context interface
interface PluginContextType {
  plugins: Plugin[]
  installedPlugins: Plugin[]
  activePlugins: Plugin[]
  availablePlugins: Plugin[]
  isLoading: boolean
  error: string | null
  currentPlugin: Plugin | null
  
  // Plugin management functions
  installPlugin: (pluginId: string) => Promise<boolean>
  uninstallPlugin: (pluginId: string) => Promise<boolean>
  activatePlugin: (pluginId: string) => Promise<boolean>
  deactivatePlugin: (pluginId: string) => Promise<boolean>
  updatePlugin: (pluginId: string) => Promise<boolean>
  
  // Plugin data functions
  getPlugin: (pluginId: string) => Plugin | null
  searchPlugins: (params: SearchParams) => Promise<PaginatedResponse<Plugin>>
  getPluginsByCategory: (category: PluginCategory) => Plugin[]
  checkPluginPermissions: (pluginId: string) => Promise<boolean>
  
  // Plugin settings
  getPluginSettings: (pluginId: string) => Promise<Record<string, any>>
  updatePluginSettings: (pluginId: string, settings: Record<string, any>) => Promise<boolean>
  resetPluginSettings: (pluginId: string) => Promise<boolean>
  
  // Plugin info
  setCurrentPlugin: (plugin: Plugin | null) => void
  refreshPlugins: () => Promise<void>
}

// Plugin provider props
interface PluginProviderProps {
  children: ReactNode
}

// Plugin state interface
interface PluginState {
  plugins: Plugin[]
  installedPlugins: Plugin[]
  activePlugins: Plugin[]
  availablePlugins: Plugin[]
  isLoading: boolean
  error: string | null
  currentPlugin: Plugin | null
}

// Plugin API endpoints
const PLUGIN_ENDPOINTS = {
  LIST: '/api/plugins',
  INSTALL: '/api/plugins/install',
  UNINSTALL: '/api/plugins/uninstall',
  ACTIVATE: '/api/plugins/activate',
  DEACTIVATE: '/api/plugins/deactivate',
  UPDATE: '/api/plugins/update',
  SEARCH: '/api/plugins/search',
  PERMISSIONS: '/api/plugins/permissions',
  SETTINGS: '/api/plugins/settings',
  MARKETPLACE: '/api/plugins/marketplace'
} as const

// Plugin Context
const PluginContext = createContext<PluginContextType | null>(null)

// Plugin Provider Component
export function PluginProvider({ children }: PluginProviderProps) {
  const [state, setState] = useState<PluginState>({
    plugins: [],
    installedPlugins: [],
    activePlugins: [],
    availablePlugins: [],
    isLoading: true,
    error: null,
    currentPlugin: null
  })

  const { user, session } = useAuth()

  // Initialize plugins
  useEffect(() => {
    if (user && session) {
      loadPlugins()
    }
  }, [user, session])

  // Load all plugins
  const loadPlugins = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(PLUGIN_ENDPOINTS.LIST, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load plugins')
      }

      const result: APIResponse<{ 
        installed: Plugin[]
        active: Plugin[]
        available: Plugin[]
      }> = await response.json()

      if (result.success && result.data) {
        const { installed, active, available } = result.data
        const allPlugins = [...installed, ...available]

        setState(prev => ({
          ...prev,
          plugins: allPlugins,
          installedPlugins: installed,
          activePlugins: active,
          availablePlugins: available,
          isLoading: false
        }))

        logger.info('Plugins loaded', { 
          installed: installed.length, 
          active: active.length, 
          available: available.length 
        })
      } else {
        throw new Error(result.error || 'Failed to load plugins')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load plugins'
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      
      toast.error(errorMessage)

      logger.error('Plugin loading error', { error })
    }
  }, [toast])

  // Install plugin
  const installPlugin = useCallback(async (pluginId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(PLUGIN_ENDPOINTS.INSTALL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pluginId })
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        await loadPlugins() // Refresh plugin list
        
        toast('Plugin has been installed successfully.')

        logger.info('Plugin installed', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to install plugin')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Installation failed'
      setState(prev => ({ ...prev, isLoading: false }))
      
      toast.error(errorMessage)

      logger.error('Plugin installation error', { error, pluginId })
      return false
    }
  }, [loadPlugins, toast])

  // Uninstall plugin
  const uninstallPlugin = useCallback(async (pluginId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(PLUGIN_ENDPOINTS.UNINSTALL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pluginId })
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        await loadPlugins() // Refresh plugin list
        
        // Clear current plugin if it was uninstalled
        setState(prev => ({
          ...prev,
          currentPlugin: prev.currentPlugin?.id === pluginId ? null : prev.currentPlugin
        }))
        
        toast('Plugin has been uninstalled successfully.')

        logger.info('Plugin uninstalled', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to uninstall plugin')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Uninstallation failed'
      setState(prev => ({ ...prev, isLoading: false }))
      
      toast.error(errorMessage)

      logger.error('Plugin uninstallation error', { error, pluginId })
      return false
    }
  }, [loadPlugins, toast])

  // Activate plugin
  const activatePlugin = useCallback(async (pluginId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(PLUGIN_ENDPOINTS.ACTIVATE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pluginId })
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        await loadPlugins() // Refresh plugin list
        
        toast('Plugin has been activated successfully.')

        logger.info('Plugin activated', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to activate plugin')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Activation failed'
      setState(prev => ({ ...prev, isLoading: false }))
      
      toast.error(errorMessage)

      logger.error('Plugin activation error', { error, pluginId })
      return false
    }
  }, [loadPlugins, toast])

  // Deactivate plugin
  const deactivatePlugin = useCallback(async (pluginId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(PLUGIN_ENDPOINTS.DEACTIVATE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pluginId })
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        await loadPlugins() // Refresh plugin list
        
        toast.success('Plugin has been deactivated successfully.')

        logger.info('Plugin deactivated', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to deactivate plugin')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Deactivation failed'
      setState(prev => ({ ...prev, isLoading: false }))
      
      toast.error(errorMessage)

      logger.error('Plugin deactivation error', { error, pluginId })
      return false
    }
  }, [loadPlugins, toast])

  // Update plugin
  const updatePlugin = useCallback(async (pluginId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true }))

    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(PLUGIN_ENDPOINTS.UPDATE, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pluginId })
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        await loadPlugins() // Refresh plugin list
        
        toast.success('Plugin has been updated successfully.')

        logger.info('Plugin updated', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to update plugin')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed'
      setState(prev => ({ ...prev, isLoading: false }))
      
      toast.error(errorMessage)

      logger.error('Plugin update error', { error, pluginId })
      return false
    }
  }, [loadPlugins, toast])

  // Get plugin by ID
  const getPlugin = useCallback((pluginId: string): Plugin | null => {
    return state.plugins.find(plugin => plugin.id === pluginId) || null
  }, [state.plugins])

  // Search plugins
  const searchPlugins = useCallback(async (params: SearchParams): Promise<PaginatedResponse<Plugin>> => {
    try {
      const token = localStorage.getItem('auth_token')
      const searchParams = new URLSearchParams()
      
      if (params.query) searchParams.append('query', params.query)
      if (params.page) searchParams.append('page', params.page.toString())
      if (params.limit) searchParams.append('limit', params.limit.toString())
      if (params.sortBy) searchParams.append('sortBy', params.sortBy)
      if (params.sortOrder) searchParams.append('sortOrder', params.sortOrder)
      if (params.filters) {
        searchParams.append('filters', JSON.stringify(params.filters))
      }

      const response = await fetch(`${PLUGIN_ENDPOINTS.SEARCH}?${searchParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const result: APIResponse<PaginatedResponse<Plugin>> = await response.json()
      
      if (result.success && result.data) {
        return result.data
      } else {
        throw new Error(result.error || 'Search failed')
      }
    } catch (error) {
      logger.error('Plugin search error', { error, params })
      throw error
    }
  }, [])

  // Get plugins by category
  const getPluginsByCategory = useCallback((category: PluginCategory): Plugin[] => {
    return state.plugins.filter(plugin => plugin.category === category)
  }, [state.plugins])

  // Check plugin permissions
  const checkPluginPermissions = useCallback(async (pluginId: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${PLUGIN_ENDPOINTS.PERMISSIONS}/${pluginId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Permission check failed')
      }

      const result: APIResponse<{ hasPermission: boolean }> = await response.json()
      
      return result.success && result.data?.hasPermission === true
    } catch (error) {
      logger.error('Plugin permission check error', { error, pluginId })
      return false
    }
  }, [])

  // Get plugin settings
  const getPluginSettings = useCallback(async (pluginId: string): Promise<Record<string, any>> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${PLUGIN_ENDPOINTS.SETTINGS}/${pluginId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to get plugin settings')
      }

      const result: APIResponse<Record<string, any>> = await response.json()
      
      if (result.success && result.data) {
        return result.data
      } else {
        throw new Error(result.error || 'Failed to get plugin settings')
      }
    } catch (error) {
      logger.error('Plugin settings retrieval error', { error, pluginId })
      throw error
    }
  }, [])

  // Update plugin settings
  const updatePluginSettings = useCallback(async (pluginId: string, settings: Record<string, any>): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${PLUGIN_ENDPOINTS.SETTINGS}/${pluginId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings })
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        toast.success('Plugin settings have been updated successfully.')

        logger.info('Plugin settings updated', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to update plugin settings')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Settings update failed'
      
      toast.error(errorMessage)

      logger.error('Plugin settings update error', { error, pluginId })
      return false
    }
  }, [toast])

  // Reset plugin settings
  const resetPluginSettings = useCallback(async (pluginId: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${PLUGIN_ENDPOINTS.SETTINGS}/${pluginId}/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result: APIResponse = await response.json()

      if (result.success) {
        toast('Plugin settings have been reset to defaults.')

        logger.info('Plugin settings reset', { pluginId })
        return true
      } else {
        throw new Error(result.error || 'Failed to reset plugin settings')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Settings reset failed'
      
      toast.error(errorMessage)

      logger.error('Plugin settings reset error', { error, pluginId })
      return false
    }
  }, [toast])

  // Set current plugin
  const setCurrentPlugin = useCallback((plugin: Plugin | null) => {
    setState(prev => ({ ...prev, currentPlugin: plugin }))
  }, [])

  // Refresh plugins
  const refreshPlugins = useCallback(async () => {
    await loadPlugins()
  }, [loadPlugins])

  // Context value
  const contextValue: PluginContextType = {
    plugins: state.plugins,
    installedPlugins: state.installedPlugins,
    activePlugins: state.activePlugins,
    availablePlugins: state.availablePlugins,
    isLoading: state.isLoading,
    error: state.error,
    currentPlugin: state.currentPlugin,
    
    installPlugin,
    uninstallPlugin,
    activatePlugin,
    deactivatePlugin,
    updatePlugin,
    
    getPlugin,
    searchPlugins,
    getPluginsByCategory,
    checkPluginPermissions,
    
    getPluginSettings,
    updatePluginSettings,
    resetPluginSettings,
    
    setCurrentPlugin,
    refreshPlugins
  }

  return (
    <PluginContext.Provider value={contextValue}>
      {children}
    </PluginContext.Provider>
  )
}

// Main usePlugin hook
export function usePlugin(): PluginContextType {
  const context = useContext(PluginContext)
  
  if (!context) {
    throw new Error('usePlugin must be used within a PluginProvider')
  }

  return context
}

// Hook for plugin status checks
export function usePluginStatus(pluginId: string) {
  const { getPlugin } = usePlugin()
  
  const plugin = getPlugin(pluginId)
  
  const isInstalled = plugin !== null
  const isActive = plugin?.status === PluginStatus.ACTIVE
  const isSystem = plugin?.isSystemPlugin === true
  const canUninstall = isInstalled && !isSystem
  const canActivate = isInstalled && !isActive
  const canDeactivate = isInstalled && isActive && !isSystem

  return {
    plugin,
    isInstalled,
    isActive,
    isSystem,
    canUninstall,
    canActivate,
    canDeactivate
  }
}

// Hook for plugin filtering
export function usePluginFilter() {
  const { plugins } = usePlugin()
  
  const filterByCategory = useCallback((category: PluginCategory) => {
    return plugins.filter(plugin => plugin.category === category)
  }, [plugins])

  const filterByStatus = useCallback((status: PluginStatus) => {
    return plugins.filter(plugin => plugin.status === status)
  }, [plugins])

  const filterByType = useCallback((isSystem: boolean) => {
    return plugins.filter(plugin => plugin.isSystemPlugin === isSystem)
  }, [plugins])

  const searchByName = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase()
    return plugins.filter(plugin => 
      plugin.name.toLowerCase().includes(lowerQuery) ||
      plugin.displayName.toLowerCase().includes(lowerQuery) ||
      plugin.description.toLowerCase().includes(lowerQuery)
    )
  }, [plugins])

  return {
    filterByCategory,
    filterByStatus,
    filterByType,
    searchByName
  }
}

export default usePlugin