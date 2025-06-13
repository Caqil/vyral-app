
let pluginSystemInitialized = false

export async function register() {
  // Only initialize once
  if (pluginSystemInitialized) {
    return
  }

  console.log('🚀 Initializing Social Media Platform...')

  try {
    // Initialize database connection
    await initializeDatabase()

    // Initialize plugin system
    await initializePluginSystem()

    // Initialize system plugins
    await initializeSystemPlugins()

    // Initialize monitoring
    await initializeMonitoring()

    pluginSystemInitialized = true
    console.log('✅ Platform initialization complete')
  } catch (error) {
    console.error('❌ Platform initialization failed:', error)
    throw error
  }
}

async function initializeDatabase() {
  try {
    // Import and initialize database connection
    const { connectDatabase } = await import('@/core/lib/database/connection')
    await connectDatabase()
    console.log('✅ Database connected')
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    throw error
  }
}

async function initializePluginSystem() {
  try {
    // Initialize plugin manager
    const { PluginManager } = await import('@/core/plugins/manager/PluginManager')
    const pluginManager = PluginManager.getInstance()
    
    // Initialize plugin registry
    await pluginManager.initialize()
    
    // Load installed plugins
    await pluginManager.loadInstalledPlugins()
    
    console.log('✅ Plugin system initialized')
  } catch (error) {
    console.error('❌ Plugin system initialization failed:', error)
    throw error
  }
}

async function initializeSystemPlugins() {
  try {
    // Check if system plugins are installed
    const { PluginManager } = await import('@/core/plugins/manager/PluginManager')
    const pluginManager = PluginManager.getInstance()
    
    const systemPlugins = [
      'user-management',
      'content-system',
      'feed-system',
      'notification-system',
      'media-upload',
    ]

    // Install system plugins if not already installed
    for (const pluginId of systemPlugins) {
      const isInstalled = await pluginManager.isPluginInstalled(pluginId)
      
      if (!isInstalled) {
        console.log(`📦 Installing system plugin: ${pluginId}`)
        await pluginManager.installSystemPlugin(pluginId)
      }
    }

    // Activate all system plugins
    for (const pluginId of systemPlugins) {
      const isActive = await pluginManager.isPluginActive(pluginId)
      
      if (!isActive) {
        console.log(`🔌 Activating system plugin: ${pluginId}`)
        await pluginManager.activatePlugin(pluginId)
      }
    }

    console.log('✅ System plugins initialized')
  } catch (error) {
    console.error('❌ System plugins initialization failed:', error)
    // Don't throw error for system plugins, as the app can still work
    console.warn('⚠️ Continuing without some system plugins')
  }
}

async function initializeMonitoring() {
  try {
    // Initialize logging system
    const { logger } = await import('@/core/lib/utils/logger')
    
    // Initialize error tracking
    if (process.env.NODE_ENV === 'production') {
      // Initialize Sentry or similar error tracking
      // await initializeSentry()
    }

    // Initialize performance monitoring
    if (process.env.ENABLE_ANALYTICS === 'true') {
      await initializeAnalytics()
    }

    console.log('✅ Monitoring initialized')
  } catch (error) {
    console.error('❌ Monitoring initialization failed:', error)
    // Don't throw error for monitoring, as the app can still work
    console.warn('⚠️ Continuing without full monitoring')
  }
}

async function initializeAnalytics() {
  // Initialize analytics tracking
  if (process.env.ANALYTICS_PROVIDER === 'google') {
    // Initialize Google Analytics
  } else if (process.env.ANALYTICS_PROVIDER === 'mixpanel') {
    // Initialize Mixpanel
  }
  // Add more analytics providers as needed
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...')
  await shutdown()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...')
  await shutdown()
  process.exit(0)
})

async function shutdown() {
  try {
    // Cleanup plugin system
    const { PluginManager } = await import('@/core/plugins/manager/PluginManager')
    const pluginManager = PluginManager.getInstance()
    await pluginManager.cleanup()

    // Close database connections
    const { disconnectDatabase } = await import('@/core/lib/database/connection')
    await disconnectDatabase()

    console.log('✅ Graceful shutdown complete')
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
  }
}

// Health check endpoint data
export function getHealthStatus() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
    pluginSystem: pluginSystemInitialized,
    environment: process.env.NODE_ENV || 'development',
  }
}

// Performance monitoring
export function trackPerformance(metric: string, value: number, tags?: Record<string, string>) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 Performance: ${metric} = ${value}ms`, tags)
  }
  
  // In production, send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    // Send to monitoring service like DataDog, New Relic, etc.
  }
}

// Plugin system events
export function trackPluginEvent(event: string, pluginId: string, data?: any) {
  console.log(`🔌 Plugin Event: ${event} - ${pluginId}`, data)
  
  // Track plugin usage analytics
  if (process.env.ENABLE_PLUGIN_ANALYTICS === 'true') {
    // Send to analytics service
  }
}