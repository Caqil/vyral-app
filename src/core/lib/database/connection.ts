import mongoose from 'mongoose'
import { logger } from '@/core/lib/utils/logger'
import { ENV_DEFAULTS } from '@/core/lib/utils/constants'
import { ERROR_MESSAGES } from '../utils/constants';

export interface DatabaseConnectionConfig {
  url: string
  options?: mongoose.ConnectOptions
  retryAttempts?: number
  retryDelay?: number
  healthCheckInterval?: number
  enableLogging?: boolean
}

export interface DatabaseConnectionStats {
  isConnected: boolean
  readyState: mongoose.ConnectionStates
  host?: string
  name?: string
  port?: number
  collections: number
  connectionTime?: number
  lastError?: string
  uptime: number
  reconnectAttempts: number
}

class DatabaseConnection {
  private connection: mongoose.Connection | null = null
  private config: DatabaseConnectionConfig
  private connectionStats: Partial<DatabaseConnectionStats> = {}
  private healthCheckTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private isConnecting = false
  private connectionStartTime = 0

  constructor(config: DatabaseConnectionConfig) {
    this.config = {
      retryAttempts: 5,
      retryDelay: 5000,
      healthCheckInterval: 30000,
      enableLogging: process.env.NODE_ENV === 'development',
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
        autoIndex: process.env.NODE_ENV === 'development',
        ...config.options
      },
      ...config
    }

    this.setupEventListeners()
  }

  /**
   * Connect to MongoDB database
   */
  async connect(): Promise<void> {
    if (this.isConnecting) {
      logger.warn('Connection attempt already in progress')
      return
    }

    if (this.isConnected()) {
      logger.info('Database already connected')
      return
    }

    this.isConnecting = true
    this.connectionStartTime = Date.now()

    try {
      logger.info('Connecting to MongoDB...', { 
        url: this.config.url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
        options: this.config.options 
      })

      // Set mongoose configuration
      mongoose.set('strictQuery', false)
      
      if (this.config.enableLogging) {
        mongoose.set('debug', (collectionName: string, method: string, query: any, doc?: any) => {
          logger.debug('Mongoose operation', {
            collection: collectionName,
            method,
            query: JSON.stringify(query).substring(0, 200),
            doc: doc ? JSON.stringify(doc).substring(0, 100) : undefined
          })
        })
      }

      await mongoose.connect(this.config.url, this.config.options)
      
      this.connection = mongoose.connection
      this.connectionStats.connectionTime = Date.now() - this.connectionStartTime
      this.reconnectAttempts = 0
      this.isConnecting = false

      logger.info('Successfully connected to MongoDB', {
        host: this.connection.host,
        name: this.connection.name,
        port: this.connection.port,
        connectionTime: this.connectionStats.connectionTime
      })

      this.startHealthCheck()
      
    } catch (error: any) {
      this.isConnecting = false
      this.connectionStats.lastError = error.message
      logger.error('Failed to connect to MongoDB', error)
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        logger.info(`Retrying connection in ${this.config.retryDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
        
        setTimeout(() => {
          this.connect()
        }, this.config.retryDelay)
      } else {
        logger.error('Max reconnection attempts reached')
        throw error
      }
    }
  }

  /**
   * Disconnect from MongoDB database
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    if (this.connection) {
      logger.info('Disconnecting from MongoDB...')
      await mongoose.disconnect()
      this.connection = null
      logger.info('Disconnected from MongoDB')
    }
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return mongoose.connection.readyState === mongoose.ConnectionStates.connected
  }

  /**
   * Get connection statistics
   */
  getStats(): DatabaseConnectionStats {
    const connection = mongoose.connection
    
    return {
      isConnected: this.isConnected(),
      readyState: connection.readyState,
      host: connection.host,
      name: connection.name,
      port: connection.port,
      collections: Object.keys(connection.collections).length,
      connectionTime: this.connectionStats.connectionTime,
      lastError: this.connectionStats.lastError,
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
      reconnectAttempts: this.reconnectAttempts
    }
  }

  /**
   * Get database connection instance
   */
  getConnection(): mongoose.Connection | null {
    return this.connection
  }

  async ping(): Promise<boolean> {
  try {
    if (!this.isConnected() || !mongoose.connection.db) {
      return false;
    }

    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    const responseTime = Date.now() - startTime;

    logger.debug('Database ping successful', { responseTime });
    return true;
  } catch (error) {
    logger.error('Database ping failed', ERROR_MESSAGES);
    return false;
  }
}

  /**
   * Get database health information
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded'
    details: Record<string, any>
  }> {
    try {
      const stats = this.getStats()
      const pingResult = await this.ping()
      
      if (!stats.isConnected || !pingResult) {
        return {
          status: 'unhealthy',
          details: {
            connected: stats.isConnected,
            ping: pingResult,
            readyState: stats.readyState,
            lastError: stats.lastError
          }
        }
      }

      // Check for degraded performance
      const isDegraded = stats.reconnectAttempts > 0 || (stats.connectionTime && stats.connectionTime > 10000)

      return {
        status: isDegraded ? 'degraded' : 'healthy',
        details: {
          connected: stats.isConnected,
          ping: pingResult,
          uptime: stats.uptime,
          collections: stats.collections,
          reconnectAttempts: stats.reconnectAttempts,
          host: stats.host,
          name: stats.name
        }
      }
    } catch (error: any) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          connected: false
        }
      }
    }
  }

  /**
   * Setup event listeners for connection monitoring
   */
  private setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      logger.info('Database connection established')
    })

    mongoose.connection.on('error', (error) => {
      logger.error('Database connection error', error)
      this.connectionStats.lastError = error.message
    })

    mongoose.connection.on('disconnected', () => {
      logger.warn('Database connection lost')
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        logger.info('Attempting to reconnect to database...')
        setTimeout(() => {
          this.connect()
        }, this.config.retryDelay)
      }
    })

    mongoose.connection.on('reconnected', () => {
      logger.info('Database reconnected successfully')
      this.reconnectAttempts = 0
    })

    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, closing database connection...')
      await this.disconnect()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, closing database connection...')
      await this.disconnect()
      process.exit(0)
    })
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer || !this.config.healthCheckInterval) {
      return
    }

    this.healthCheckTimer = setInterval(async () => {
      try {
        const health = await this.getHealth()
        if (health.status === 'unhealthy') {
          logger.warn('Database health check failed', health.details)
        }
      } catch (error) {
        logger.error('Health check error', ERROR_MESSAGES)
      }
    }, this.config.healthCheckInterval)
  }
}

// Create singleton instance
const databaseConfig: DatabaseConnectionConfig = {
  url: process.env.DATABASE_URL || ENV_DEFAULTS.DATABASE_URL,
  options: {
    maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10'),
    serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '5000'),
    socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '45000'),
    autoIndex: process.env.NODE_ENV === 'development',
    bufferCommands: false
  },
  retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '5'),
  retryDelay: parseInt(process.env.DB_RETRY_DELAY || '5000'),
  healthCheckInterval: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '30000'),
  enableLogging: process.env.DB_LOGGING === 'true'
}

export const database = new DatabaseConnection(databaseConfig)

// Export utility functions
export const connectToDatabase = () => database.connect()
export const disconnectFromDatabase = () => database.disconnect()
export const isDatabaseConnected = () => database.isConnected()
export const getDatabaseStats = () => database.getStats()
export const getDatabaseHealth = () => database.getHealth()
export const pingDatabase = () => database.ping()

// Export for use in migrations and other database operations
export { mongoose }
export default database