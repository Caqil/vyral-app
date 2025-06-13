// Centralized logging utility for the social media platform
import { LogLevel } from '@/core/types/system'
import { LOGGING } from './constants'

// Log entry interface
export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  service?: string
  userId?: string
  sessionId?: string
  requestId?: string
  context?: Record<string, any>
  error?: Error
  stack?: string
  duration?: number
  metadata?: Record<string, any>
}

// Logger configuration
export interface LoggerConfig {
  level: LogLevel
  service: string
  enableConsole: boolean
  enableFile: boolean
  enableStructured: boolean
  excludePaths: string[]
  maxFileSize: number
  maxFiles: number
  logDirectory: string
}

// Log formatter interface
export interface LogFormatter {
  format(entry: LogEntry): string
}

// Console formatter for development
class ConsoleFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString()
    const level = entry.level.toUpperCase().padEnd(5)
    const service = entry.service ? `[${entry.service}]` : ''
    const userId = entry.userId ? `user:${entry.userId}` : ''
    const context = entry.context ? JSON.stringify(entry.context) : ''
    
    let logLine = `${timestamp} ${level} ${service} ${entry.message}`
    
    if (userId) logLine += ` ${userId}`
    if (entry.duration !== undefined) logLine += ` (${entry.duration}ms)`
    if (context) logLine += ` ${context}`
    if (entry.error) logLine += `\n${entry.error.stack || entry.error.message}`
    
    return logLine
  }
}

// JSON formatter for production
class JSONFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const logData = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      service: entry.service,
      userId: entry.userId,
      sessionId: entry.sessionId,
      requestId: entry.requestId,
      duration: entry.duration,
      context: entry.context,
      metadata: entry.metadata,
      error: entry.error ? {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack
      } : undefined
    }
    
    // Remove undefined values
    Object.keys(logData).forEach(key => {
      if (logData[key as keyof typeof logData] === undefined) {
        delete logData[key as keyof typeof logData]
      }
    })
    
    return JSON.stringify(logData)
  }
}

// Main Logger class
class Logger {
  private config: LoggerConfig
  private formatter: LogFormatter
  private logQueue: LogEntry[] = []
  private isProcessingQueue = false
  
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      service: 'app',
      enableConsole: true,
      enableFile: process.env.NODE_ENV === 'production',
      enableStructured: process.env.NODE_ENV === 'production',
      excludePaths: [...LOGGING.EXCLUDE_PATHS],
      maxFileSize: LOGGING.MAX_LOG_SIZE,
      maxFiles: LOGGING.MAX_LOG_FILES,
      logDirectory: './logs',
      ...config
    }
    
    this.formatter = this.config.enableStructured 
      ? new JSONFormatter() 
      : new ConsoleFormatter()
  }

  // Log level hierarchy for filtering
  private getLevelPriority(level: LogLevel): number {
    const priorities = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
      [LogLevel.FATAL]: 4
    }
    return priorities[level] ?? 1
  }

  // Check if log level should be processed
  private shouldLog(level: LogLevel): boolean {
    return this.getLevelPriority(level) >= this.getLevelPriority(this.config.level)
  }

  // Core logging method
  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      service: this.config.service,
      context,
      error,
      stack: error?.stack,
      metadata: {
        pid: process.pid,
        environment: process.env.NODE_ENV,
        hostname: process.env.HOSTNAME
      }
    }

    // Add to queue for async processing
    this.logQueue.push(entry)
    this.processQueue()
  }

  // Process log queue asynchronously
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.logQueue.length === 0) return
    
    this.isProcessingQueue = true
    
    try {
      while (this.logQueue.length > 0) {
        const entry = this.logQueue.shift()!
        await this.writeLog(entry)
      }
    } catch (error) {
      console.error('Failed to process log queue:', error)
    } finally {
      this.isProcessingQueue = false
    }
  }

  // Write log entry to configured outputs
  private async writeLog(entry: LogEntry): Promise<void> {
    const formattedLog = this.formatter.format(entry)
    
    // Console output
    if (this.config.enableConsole) {
      this.writeToConsole(entry.level, formattedLog)
    }
    
    // File output (in production environments)
    if (this.config.enableFile) {
      await this.writeToFile(formattedLog)
    }
  }

  // Write to console with appropriate colors
  private writeToConsole(level: LogLevel, message: string): void {
    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
      [LogLevel.FATAL]: '\x1b[35m'  // Magenta
    }
    
    const reset = '\x1b[0m'
    const coloredMessage = `${colors[level] || ''}${message}${reset}`
    
    switch (level) {
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(coloredMessage)
        break
      case LogLevel.WARN:
        console.warn(coloredMessage)
        break
      default:
        console.log(coloredMessage)
    }
  }

  // Write to file (simplified implementation)
  private async writeToFile(message: string): Promise<void> {
    // In a real implementation, this would use fs.appendFile with log rotation
    // For now, we'll just skip the actual file writing to avoid Node.js dependencies
    // This would be implemented when running in a Node.js environment
  }

  // Public logging methods
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, error?: Error | Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, undefined, error)
    } else {
      this.log(LogLevel.ERROR, message, error as Record<string, any>)
    }
  }

  fatal(message: string, error?: Error | Record<string, any>): void {
    if (error instanceof Error) {
      this.log(LogLevel.FATAL, message, undefined, error)
    } else {
      this.log(LogLevel.FATAL, message, error as Record<string, any>)
    }
  }

  // Create child logger with additional context
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(this.config)
    childLogger.config = { ...this.config }
    childLogger.formatter = this.formatter
    
    // Override log method to include child context
    const originalLog = childLogger.log.bind(childLogger)
    childLogger.log = (level: LogLevel, message: string, logContext?: Record<string, any>, error?: Error) => {
      const mergedContext = { ...context, ...logContext }
      originalLog(level, message, mergedContext, error)
    }
    
    return childLogger
  }

  // Performance logging
  time(label: string): void {
    console.time(label)
  }

  timeEnd(label: string, context?: Record<string, any>): void {
    console.timeEnd(label)
    this.debug(`Timer ${label} completed`, context)
  }

  // Request/response logging
  request(method: string, path: string, context?: Record<string, any>): void {
    this.info(`${method} ${path}`, {
      type: 'request',
      method,
      path,
      ...context
    })
  }

  response(method: string, path: string, statusCode: number, duration: number, context?: Record<string, any>): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : 
                 statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO
    
    this.log(level, `${method} ${path} ${statusCode}`, {
      type: 'response',
      method,
      path,
      statusCode,
      duration,
      ...context
    })
  }

  // Security event logging
  security(event: string, context?: Record<string, any>): void {
    this.warn(`Security event: ${event}`, {
      type: 'security',
      event,
      ...context
    })
  }

  // Plugin-specific logging
  plugin(pluginId: string, message: string, context?: Record<string, any>): void {
    this.info(`[Plugin:${pluginId}] ${message}`, {
      type: 'plugin',
      pluginId,
      ...context
    })
  }

  // Database query logging
  query(query: string, duration: number, context?: Record<string, any>): void {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.DEBUG
    
    this.log(level, `Database query completed`, {
      type: 'database',
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration,
      ...context
    })
  }

  // Set log level dynamically
  setLevel(level: LogLevel): void {
    this.config.level = level
    this.info(`Log level changed to ${level}`)
  }

  // Set service name
  setService(service: string): void {
    this.config.service = service
  }

  // Flush any remaining logs (useful for graceful shutdown)
  async flush(): Promise<void> {
    while (this.logQueue.length > 0 || this.isProcessingQueue) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
}

// Create default logger instance
export const logger = new Logger({
  service: 'social-platform'
})

// Create service-specific loggers
export const createLogger = (service: string, config?: Partial<LoggerConfig>): Logger => {
  return new Logger({
    service,
    ...config
  })
}

// Convenience function for request logging middleware
export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId })
}

// Export logger class for custom instances
export { Logger }