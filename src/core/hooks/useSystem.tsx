'use client'

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import { AppConfig, APIMetrics, SystemEvent, EventCategory } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { useAuth } from './useAuth'
import { toast } from 'sonner'

// System status interface
interface SystemStatus {
  status: 'healthy' | 'warning' | 'error' | 'maintenance'
  uptime: number
  version: string
  environment: string
  lastHealthCheck: Date
  services: ServiceStatus[]
  metrics: SystemMetrics
}

// Service status interface
interface ServiceStatus {
  name: string
  status: 'online' | 'offline' | 'degraded'
  lastCheck: Date
  responseTime: number
  error?: string
}

// System metrics interface
interface SystemMetrics {
  cpu: number
  memory: number
  disk: number
  network: number
  activeUsers: number
  requestsPerMinute: number
  errorRate: number
  averageResponseTime: number
}

// System configuration interface
interface SystemConfig extends AppConfig {
  maintenance: {
    enabled: boolean
    message: string
    scheduledStart?: Date
    scheduledEnd?: Date
  }
  notifications: {
    enabled: boolean
    channels: string[]
    settings: Record<string, any>
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    enableFileLogging: boolean
    maxLogSize: number
    retention: number
  }
  security: {
    rateLimiting: {
      enabled: boolean
      windowMs: number
      maxRequests: number
    }
    cors: {
      enabled: boolean
      origins: string[]
      credentials: boolean
    }
    csrf: {
      enabled: boolean
      secretKey: string
    }
  }
}

// System context interface
interface SystemContextType {
  config: SystemConfig | null
  status: SystemStatus | null
  isLoading: boolean
  error: string | null
  isMaintenanceMode: boolean
  
  // Configuration management
  getConfig: () => Promise<SystemConfig>
  updateConfig: (updates: Partial<SystemConfig>) => Promise<boolean>
  resetConfig: () => Promise<boolean>
  
  // System status
  getSystemStatus: () => Promise<SystemStatus>
  checkServiceHealth: (serviceName: string) => Promise<ServiceStatus>
  
  // Maintenance mode
  enableMaintenanceMode: (message?: string, duration?: number) => Promise<boolean>
  disableMaintenanceMode: () => Promise<boolean>
  scheduleMaintenanceMode: (startTime: Date, endTime: Date, message?: string) => Promise<boolean>
  
  // System metrics
  getMetrics: (timeRange?: string) => Promise<APIMetrics[]>
  getSystemMetrics: () => Promise<SystemMetrics>
  
  // System events
  getSystemEvents: (limit?: number, category?: EventCategory) => Promise<SystemEvent[]>
  clearSystemEvents: () => Promise<boolean>
  
  // System utilities
  restartSystem: () => Promise<boolean>
  clearCache: () => Promise<boolean>
  runHealthCheck: () => Promise<SystemStatus>
  exportSystemData: () => Promise<string>
  importSystemData: (data: string) => Promise<boolean>
}

// System provider props
interface SystemProviderProps {
  children: ReactNode
}

// System state interface
interface SystemState {
  config: SystemConfig | null
  status: SystemStatus | null
  isLoading: boolean
  error: string | null
  isMaintenanceMode: boolean
  lastConfigUpdate: Date | null
  lastStatusUpdate: Date | null
}

// System API endpoints
const SYSTEM_ENDPOINTS = {
  CONFIG: '/api/system/config',
  STATUS: '/api/system/status',
  HEALTH: '/api/system/health',
  METRICS: '/api/system/metrics',
  EVENTS: '/api/system/events',
  MAINTENANCE: '/api/system/maintenance',
  CACHE: '/api/system/cache',
  RESTART: '/api/system/restart',
  EXPORT: '/api/system/export',
  IMPORT: '/api/system/import'
} as const

// System Context
const SystemContext = createContext<SystemContextType | null>(null)

// System Provider Component
export function SystemProvider({ children }: SystemProviderProps) {
  const [state, setState] = useState<SystemState>({
    config: null,
    status: null,
    isLoading: true,
    error: null,
    isMaintenanceMode: false,
    lastConfigUpdate: null,
    lastStatusUpdate: null
  })

  const { user, session } = useAuth()

  // Initialize system data
  useEffect(() => {
    if (user && session) {
      loadSystemData()
    }
  }, [user, session])

  // Auto-refresh system status
  useEffect(() => {
    const interval = setInterval(() => {
      if (user && session && !state.isLoading) {
        refreshSystemStatus()
      }
    }, 30000) // Refresh every 30 seconds

    return () => clearInterval(interval)
  }, [user, session, state.isLoading])

  // Load system data
  const loadSystemData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const [configResult, statusResult] = await Promise.allSettled([
        getConfig(),
        getSystemStatus()
      ])

      const config = configResult.status === 'fulfilled' ? configResult.value : null
      const status = statusResult.status === 'fulfilled' ? statusResult.value : null

      setState(prev => ({
        ...prev,
        config,
        status,
        isMaintenanceMode: config?.maintenance?.enabled || false,
        isLoading: false,
        lastConfigUpdate: new Date(),
        lastStatusUpdate: new Date()
      }))

      logger.info('System data loaded successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load system data'
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }))
      
      logger.error('System data loading failed', { error })
    }
  }, [])

  // Get system configuration
  const getConfig = useCallback(async (): Promise<SystemConfig> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.CONFIG, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch system configuration')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result.data as SystemConfig
      } else {
        throw new Error(result.error || 'Invalid configuration response')
      }
    } catch (error) {
      logger.error('Failed to get system configuration', { error })
      throw error
    }
  }, [])

  // Update system configuration
  const updateConfig = useCallback(async (updates: Partial<SystemConfig>): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.CONFIG, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })

      const result = await response.json()

      if (result.success) {
        setState(prev => ({
          ...prev,
          config: prev.config ? { ...prev.config, ...updates } : null,
          lastConfigUpdate: new Date()
        }))

        toast('System configuration has been updated successfully.')

        logger.info('System configuration updated', { updates })
        return true
      } else {
        throw new Error(result.error || 'Failed to update configuration')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Configuration update failed'
      
      toast(errorMessage)

      logger.error('System configuration update failed', { error })
      return false
    }
  }, [toast])

  // Reset system configuration
  const resetConfig = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${SYSTEM_ENDPOINTS.CONFIG}/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        const newConfig = await getConfig()
        setState(prev => ({
          ...prev,
          config: newConfig,
          lastConfigUpdate: new Date()
        }))

        toast('System configuration has been reset to defaults.')

        logger.info('System configuration reset')
        return true
      } else {
        throw new Error(result.error || 'Failed to reset configuration')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Configuration reset failed'
      
      toast(errorMessage)

      logger.error('System configuration reset failed', { error })
      return false
    }
  }, [getConfig, toast])

  // Get system status
  const getSystemStatus = useCallback(async (): Promise<SystemStatus> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.STATUS, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch system status')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result.data as SystemStatus
      } else {
        throw new Error(result.error || 'Invalid status response')
      }
    } catch (error) {
      logger.error('Failed to get system status', { error })
      throw error
    }
  }, [])

  // Check service health
  const checkServiceHealth = useCallback(async (serviceName: string): Promise<ServiceStatus> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${SYSTEM_ENDPOINTS.HEALTH}/${serviceName}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to check ${serviceName} health`)
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result.data as ServiceStatus
      } else {
        throw new Error(result.error || 'Invalid health check response')
      }
    } catch (error) {
      logger.error('Service health check failed', { error, serviceName })
      throw error
    }
  }, [])

  // Enable maintenance mode
  const enableMaintenanceMode = useCallback(async (message?: string, duration?: number): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${SYSTEM_ENDPOINTS.MAINTENANCE}/enable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message, duration })
      })

      const result = await response.json()

      if (result.success) {
        setState(prev => ({ ...prev, isMaintenanceMode: true }))

        toast(message || 'System is now in maintenance mode.')

        logger.info('Maintenance mode enabled', { message, duration })
        return true
      } else {
        throw new Error(result.error || 'Failed to enable maintenance mode')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to enable maintenance mode'
      
      toast.error(errorMessage)

      logger.error('Maintenance mode enable failed', { error })
      return false
    }
  }, [toast])

  // Disable maintenance mode
  const disableMaintenanceMode = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${SYSTEM_ENDPOINTS.MAINTENANCE}/disable`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        setState(prev => ({ ...prev, isMaintenanceMode: false }))

        toast('System is now operational.')

        logger.info('Maintenance mode disabled')
        return true
      } else {
        throw new Error(result.error || 'Failed to disable maintenance mode')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disable maintenance mode'
      
      toast.error(errorMessage)

      logger.error('Maintenance mode disable failed', { error })
      return false
    }
  }, [toast])

  // Schedule maintenance mode
  const scheduleMaintenanceMode = useCallback(async (
    startTime: Date, 
    endTime: Date, 
    message?: string
  ): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${SYSTEM_ENDPOINTS.MAINTENANCE}/schedule`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startTime, endTime, message })
      })

      const result = await response.json()

      if (result.success) {
        toast(`Maintenance mode scheduled from ${startTime.toLocaleString()} to ${endTime.toLocaleString()}.`)

        logger.info('Maintenance mode scheduled', { startTime, endTime, message })
        return true
      } else {
        throw new Error(result.error || 'Failed to schedule maintenance mode')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to schedule maintenance mode'
      
      toast.error(errorMessage)

      logger.error('Maintenance mode scheduling failed', { error })
      return false
    }
  }, [toast])

  // Get system metrics
  const getMetrics = useCallback(async (timeRange?: string): Promise<APIMetrics[]> => {
    try {
      const token = localStorage.getItem('auth_token')
      const url = timeRange 
        ? `${SYSTEM_ENDPOINTS.METRICS}?range=${timeRange}` 
        : SYSTEM_ENDPOINTS.METRICS

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch metrics')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result.data as APIMetrics[]
      } else {
        throw new Error(result.error || 'Invalid metrics response')
      }
    } catch (error) {
      logger.error('Failed to get system metrics', { error })
      throw error
    }
  }, [])

  // Get system performance metrics
  const getSystemMetrics = useCallback(async (): Promise<SystemMetrics> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`${SYSTEM_ENDPOINTS.METRICS}/system`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch system metrics')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result.data as SystemMetrics
      } else {
        throw new Error(result.error || 'Invalid system metrics response')
      }
    } catch (error) {
      logger.error('Failed to get system performance metrics', { error })
      throw error
    }
  }, [])

  // Get system events
  const getSystemEvents = useCallback(async (
    limit?: number, 
    category?: EventCategory
  ): Promise<SystemEvent[]> => {
    try {
      const token = localStorage.getItem('auth_token')
      const params = new URLSearchParams()
      
      if (limit) params.append('limit', limit.toString())
      if (category) params.append('category', category)

      const url = `${SYSTEM_ENDPOINTS.EVENTS}?${params}`
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch system events')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result.data as SystemEvent[]
      } else {
        throw new Error(result.error || 'Invalid events response')
      }
    } catch (error) {
      logger.error('Failed to get system events', { error })
      throw error
    }
  }, [])

  // Clear system events
  const clearSystemEvents = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.EVENTS, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        toast('System events have been cleared successfully.')

        logger.info('System events cleared')
        return true
      } else {
        throw new Error(result.error || 'Failed to clear events')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear events'
      
      toast.error(errorMessage)

      logger.error('System events clear failed', { error })
      return false
    }
  }, [toast])

  // Restart system
  const restartSystem = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.RESTART, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        toast('System is restarting. Please wait...')

        logger.info('System restart initiated')
        return true
      } else {
        throw new Error(result.error || 'Failed to restart system')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to restart system'
      
      toast.error(errorMessage)

      logger.error('System restart failed', { error })
      return false
    }
  }, [toast])

  // Clear cache
  const clearCache = useCallback(async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.CACHE, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()

      if (result.success) {
        toast('System cache has been cleared successfully.')

        logger.info('System cache cleared')
        return true
      } else {
        throw new Error(result.error || 'Failed to clear cache')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear cache'
      
      toast.error(errorMessage)

      logger.error('System cache clear failed', { error })
      return false
    }
  }, [toast])

  // Run health check
  const runHealthCheck = useCallback(async (): Promise<SystemStatus> => {
    try {
      const status = await getSystemStatus()
      
      setState(prev => ({
        ...prev,
        status,
        lastStatusUpdate: new Date()
      }))

      return status
    } catch (error) {
      logger.error('Health check failed', { error })
      throw error
    }
  }, [getSystemStatus])

  // Export system data
  const exportSystemData = useCallback(async (): Promise<string> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.EXPORT, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to export system data')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        toast('System data has been exported successfully.')

        logger.info('System data exported')
        return result.data
      } else {
        throw new Error(result.error || 'Export failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed'
      
      toast.error(errorMessage)

      logger.error('System data export failed', { error })
      throw error
    }
  }, [toast])

  // Import system data
  const importSystemData = useCallback(async (data: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(SYSTEM_ENDPOINTS.IMPORT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data })
      })

      const result = await response.json()

      if (result.success) {
        toast('System data has been imported successfully.')

        // Reload system data
        await loadSystemData()

        logger.info('System data imported')
        return true
      } else {
        throw new Error(result.error || 'Import failed')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Import failed'
      
      toast.error(errorMessage)

      logger.error('System data import failed', { error })
      return false
    }
  }, [toast, loadSystemData])

  // Refresh system status
  const refreshSystemStatus = useCallback(async () => {
    try {
      const status = await getSystemStatus()
      setState(prev => ({
        ...prev,
        status,
        lastStatusUpdate: new Date()
      }))
    } catch (error) {
      logger.error('Failed to refresh system status', { error })
    }
  }, [getSystemStatus])

  // Context value
  const contextValue: SystemContextType = {
    config: state.config,
    status: state.status,
    isLoading: state.isLoading,
    error: state.error,
    isMaintenanceMode: state.isMaintenanceMode,
    
    getConfig,
    updateConfig,
    resetConfig,
    
    getSystemStatus,
    checkServiceHealth,
    
    enableMaintenanceMode,
    disableMaintenanceMode,
    scheduleMaintenanceMode,
    
    getMetrics,
    getSystemMetrics,
    
    getSystemEvents,
    clearSystemEvents,
    
    restartSystem,
    clearCache,
    runHealthCheck,
    exportSystemData,
    importSystemData
  }

  return (
    <SystemContext.Provider value={contextValue}>
      {children}
    </SystemContext.Provider>
  )
}

// Main useSystem hook
export function useSystem(): SystemContextType {
  const context = useContext(SystemContext)
  
  if (!context) {
    throw new Error('useSystem must be used within a SystemProvider')
  }

  return context
}

// Hook for system status monitoring
export function useSystemStatus() {
  const { status, runHealthCheck } = useSystem()
  
  const isHealthy = status?.status === 'healthy'
  const hasWarnings = status?.status === 'warning'
  const hasErrors = status?.status === 'error'
  const isInMaintenance = status?.status === 'maintenance'
  
  const getStatusColor = useCallback(() => {
    switch (status?.status) {
      case 'healthy': return 'green'
      case 'warning': return 'yellow'
      case 'error': return 'red'
      case 'maintenance': return 'blue'
      default: return 'gray'
    }
  }, [status?.status])

  const getUptimeString = useCallback(() => {
    if (!status?.uptime) return '0 seconds'
    
    const days = Math.floor(status.uptime / (24 * 60 * 60))
    const hours = Math.floor((status.uptime % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((status.uptime % (60 * 60)) / 60)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }, [status?.uptime])

  return {
    status,
    isHealthy,
    hasWarnings,
    hasErrors,
    isInMaintenance,
    getStatusColor,
    getUptimeString,
    refresh: runHealthCheck
  }
}

// Hook for system configuration management
export function useSystemConfig() {
  const { config, updateConfig, resetConfig } = useSystem()
  
  const updateSingleConfig = useCallback((key: string, value: any) => {
    if (!config) return Promise.resolve(false)
    
    const updates = { [key]: value }
    return updateConfig(updates)
  }, [config, updateConfig])

  const updateNestedConfig = useCallback((path: string, value: any) => {
    if (!config) return Promise.resolve(false)
    
    const keys = path.split('.')
    const updates: any = {}
    let current = updates
    
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {}
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
    
    return updateConfig(updates)
  }, [config, updateConfig])

  return {
    config,
    updateConfig,
    updateSingleConfig,
    updateNestedConfig,
    resetConfig
  }
}

export default useSystem