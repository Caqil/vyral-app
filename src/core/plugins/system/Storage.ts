
import { logger } from '@/core/lib/utils/logger'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export interface StorageConfig {
  baseDirectory: string
  encryption: {
    enabled: boolean
    algorithm: string
    keyRotationInterval: number // hours
  }
  compression: {
    enabled: boolean
    algorithm: 'gzip' | 'deflate' | 'brotli'
    threshold: number // bytes
  }
  persistence: {
    enabled: boolean
    interval: number // ms
    batchSize: number
    maxRetries: number
  }
  cache: {
    enabled: boolean
    maxSize: number // MB
    ttl: number // seconds
  }
  backup: {
    enabled: boolean
    interval: number // hours
    retention: number // days
    destination: string
  }
  cleanup: {
    enabled: boolean
    interval: number // hours
    maxAge: number // hours
    orphanCleanup: boolean
  }
  monitoring: {
    enabled: boolean
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    metrics: boolean
  }
}

export interface StorageEntry {
  id: string
  pluginId: string
  key: string
  value: any
  type: StorageDataType
  size: number
  encrypted: boolean
  compressed: boolean
  userId?: string
  isGlobal: boolean
  tags: string[]
  metadata: StorageMetadata
  createdAt: Date
  updatedAt: Date
  accessedAt: Date
  expiresAt?: Date
  version: number
}

export interface StorageMetadata {
  mimeType?: string
  encoding?: string
  checksum: string
  originalSize: number
  compressionRatio?: number
  source: string
  permissions?: StoragePermission[]
  searchable: boolean
  indexed: boolean
  namespace?: string
}

export interface StoragePermission {
  type: 'read' | 'write' | 'delete'
  scope: 'owner' | 'plugin' | 'global'
  userId?: string
  pluginId?: string
  conditions?: StorageCondition[]
}

export interface StorageCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'matches'
  value: any
}

export interface StorageQuery {
  pluginId?: string
  userId?: string
  key?: string
  keyPattern?: string
  type?: StorageDataType
  tags?: string[]
  namespace?: string
  isGlobal?: boolean
  createdAfter?: Date
  createdBefore?: Date
  updatedAfter?: Date
  updatedBefore?: Date
  expiresAfter?: Date
  expiresBefore?: Date
  sortBy?: 'key' | 'createdAt' | 'updatedAt' | 'accessedAt' | 'size'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
  includeExpired?: boolean
}

export interface StorageStats {
  totalEntries: number
  totalSize: number
  encryptedEntries: number
  compressedEntries: number
  globalEntries: number
  userEntries: number
  entriesByPlugin: Record<string, number>
  entriesByType: Record<StorageDataType, number>
  oldestEntry?: Date
  newestEntry?: Date
  averageSize: number
  compressionRatio: number
  cacheHitRate: number
  diskUsage: number
  lastCleanup?: Date
  lastBackup?: Date
}

export interface StorageOperation {
  id: string
  type: StorageOperationType
  pluginId: string
  key: string
  userId?: string
  success: boolean
  error?: string
  duration: number
  size?: number
  timestamp: Date
  metadata?: Record<string, any>
}

export enum StorageDataType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
  BUFFER = 'buffer',
  STREAM = 'stream',
  FILE = 'file'
}

export enum StorageOperationType {
  GET = 'get',
  SET = 'set',
  DELETE = 'delete',
  LIST = 'list',
  CLEAR = 'clear',
  BACKUP = 'backup',
  RESTORE = 'restore',
  CLEANUP = 'cleanup'
}

export class PluginStorage extends EventEmitter {
  private static instance: PluginStorage
  private config: StorageConfig
  private storage: Map<string, StorageEntry> = new Map()
  private indexes: Map<string, Set<string>> = new Map()
  private cache: Map<string, { entry: StorageEntry; timestamp: number }> = new Map()
  private operationLog: StorageOperation[] = []
  private encryptionKey: Buffer
  private compressionEnabled: boolean
  private persistenceTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private backupTimer: NodeJS.Timeout | null = null
  private keyRotationTimer: NodeJS.Timeout | null = null
  private pendingWrites: Map<string, StorageEntry> = new Map()
  private isShuttingDown: boolean = false

  private constructor(config: StorageConfig) {
    super()
    this.config = config
    this.compressionEnabled = config.compression.enabled
    this.encryptionKey = this.generateEncryptionKey()
    this.initializeDirectories()
    this.startTimers()
    this.loadFromPersistence()
  }

  public static getInstance(config?: StorageConfig): PluginStorage {
    if (!PluginStorage.instance) {
      if (!config) {
        throw new Error('Storage config required for first initialization')
      }
      PluginStorage.instance = new PluginStorage(config)
    }
    return PluginStorage.instance
  }

  /**
   * Store data for a plugin
   */
  public async set(
    pluginId: string,
    key: string,
    value: any,
    options: {
      userId?: string
      isGlobal?: boolean
      expiresAt?: Date
      tags?: string[]
      metadata?: Partial<StorageMetadata>
      namespace?: string
      encrypt?: boolean
      compress?: boolean
    } = {}
  ): Promise<boolean> {
    const startTime = Date.now()
    const operationId = this.generateOperationId()

    try {
      // Validate input
      if (!pluginId || !key) {
        throw new Error('Plugin ID and key are required')
      }

      // Create storage key
      const storageKey = this.createStorageKey(pluginId, key, options.userId, options.namespace)

      // Serialize value
      let serializedValue: any
      let dataType: StorageDataType
      
      if (Buffer.isBuffer(value)) {
        serializedValue = value
        dataType = StorageDataType.BUFFER
      } else if (typeof value === 'string') {
        serializedValue = value
        dataType = StorageDataType.STRING
      } else if (typeof value === 'number') {
        serializedValue = value.toString()
        dataType = StorageDataType.NUMBER
      } else if (typeof value === 'boolean') {
        serializedValue = value.toString()
        dataType = StorageDataType.BOOLEAN
      } else if (Array.isArray(value)) {
        serializedValue = JSON.stringify(value)
        dataType = StorageDataType.ARRAY
      } else if (typeof value === 'object') {
        serializedValue = JSON.stringify(value)
        dataType = StorageDataType.OBJECT
      } else {
        serializedValue = String(value)
        dataType = StorageDataType.STRING
      }

      const originalSize = Buffer.byteLength(serializedValue, 'utf8')
      let processedValue = serializedValue
      let compressed = false
      let encrypted = false

      // Compression
      if ((options.compress ?? this.config.compression.enabled) && 
          originalSize > this.config.compression.threshold) {
        processedValue = await this.compress(processedValue)
        compressed = true
      }

      // Encryption
      if (options.encrypt ?? this.config.encryption.enabled) {
        processedValue = await this.encrypt(processedValue)
        encrypted = true
      }

      const finalSize = Buffer.byteLength(processedValue, 'utf8')

      // Create storage entry
      const existingEntry = this.storage.get(storageKey)
      const now = new Date()

      const entry: StorageEntry = {
        id: existingEntry?.id || this.generateEntryId(),
        pluginId,
        key,
        value: processedValue,
        type: dataType,
        size: finalSize,
        encrypted,
        compressed,
        userId: options.userId,
        isGlobal: options.isGlobal ?? false,
        tags: options.tags || [],
        metadata: {
          mimeType: options.metadata?.mimeType,
          encoding: options.metadata?.encoding || 'utf8',
          checksum: this.calculateChecksum(processedValue),
          originalSize,
          compressionRatio: compressed ? originalSize / finalSize : 1,
          source: `plugin:${pluginId}`,
          permissions: options.metadata?.permissions,
          searchable: options.metadata?.searchable ?? true,
          indexed: options.metadata?.indexed ?? true,
          namespace: options.namespace,
          ...options.metadata
        },
        createdAt: existingEntry?.createdAt || now,
        updatedAt: now,
        accessedAt: now,
        expiresAt: options.expiresAt,
        version: (existingEntry?.version || 0) + 1
      }

      // Store entry
      this.storage.set(storageKey, entry)

      // Update indexes
      this.updateIndexes(entry)

      // Update cache
      if (this.config.cache.enabled) {
        this.cache.set(storageKey, { entry, timestamp: Date.now() })
      }

      // Add to pending writes for persistence
      this.pendingWrites.set(storageKey, entry)

      // Record operation
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.SET,
        pluginId,
        key,
        userId: options.userId,
        success: true,
        duration: Date.now() - startTime,
        size: finalSize,
        timestamp: now
      }

      this.recordOperation(operation)

      // Emit event
      this.emit('storage:set', {
        pluginId,
        key,
        size: finalSize,
        compressed,
        encrypted,
        operation
      })

      if (this.config.monitoring.enabled && this.config.monitoring.logLevel === 'debug') {
        logger.debug('Storage entry set', {
          pluginId,
          key,
          storageKey,
          size: this.formatBytes(finalSize),
          compressed,
          encrypted,
          duration: operation.duration
        })
      }

      return true
    } catch (error) {
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.SET,
        pluginId,
        key,
        userId: options.userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      logger.error('Failed to set storage entry', {
        pluginId,
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('storage:error', { pluginId, key, error, operation })
      return false
    }
  }

  /**
   * Get data for a plugin
   */
  public async get<T = any>(
    pluginId: string,
    key: string,
    options: {
      userId?: string
      namespace?: string
      includeMetadata?: boolean
      updateAccessTime?: boolean
    } = {}
  ): Promise<T | null> {
    const startTime = Date.now()
    const operationId = this.generateOperationId()

    try {
      const storageKey = this.createStorageKey(pluginId, key, options.userId, options.namespace)
      let entry: StorageEntry | undefined

      // Check cache first
      if (this.config.cache.enabled) {
        const cached = this.cache.get(storageKey)
        if (cached && Date.now() - cached.timestamp < this.config.cache.ttl * 1000) {
          entry = cached.entry
        }
      }

      // Get from storage if not in cache
      if (!entry) {
        entry = this.storage.get(storageKey)
        
        if (entry && this.config.cache.enabled) {
          this.cache.set(storageKey, { entry, timestamp: Date.now() })
        }
      }

      if (!entry) {
        // Record miss operation
        const operation: StorageOperation = {
          id: operationId,
          type: StorageOperationType.GET,
          pluginId,
          key,
          userId: options.userId,
          success: false,
          error: 'Entry not found',
          duration: Date.now() - startTime,
          timestamp: new Date()
        }

        this.recordOperation(operation)
        return null
      }

      // Check expiration
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        await this.delete(pluginId, key, { userId: options.userId, namespace: options.namespace })
        return null
      }

      // Update access time
      if (options.updateAccessTime !== false) {
        entry.accessedAt = new Date()
        this.pendingWrites.set(storageKey, entry)
      }

      // Process value (decrypt and decompress)
      let processedValue = entry.value

      if (entry.encrypted) {
        processedValue = await this.decrypt(processedValue)
      }

      if (entry.compressed) {
        processedValue = await this.decompress(processedValue)
      }

      // Parse value based on type
      let result: any
      switch (entry.type) {
        case StorageDataType.STRING:
          result = processedValue
          break
        case StorageDataType.NUMBER:
          result = parseFloat(processedValue)
          break
        case StorageDataType.BOOLEAN:
          result = processedValue === 'true'
          break
        case StorageDataType.ARRAY:
        case StorageDataType.OBJECT:
          result = JSON.parse(processedValue)
          break
        case StorageDataType.BUFFER:
          result = processedValue
          break
        default:
          result = processedValue
      }

      // Include metadata if requested
      if (options.includeMetadata) {
        result = {
          value: result,
          metadata: entry.metadata,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          accessedAt: entry.accessedAt,
          version: entry.version
        }
      }

      // Record operation
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.GET,
        pluginId,
        key,
        userId: options.userId,
        success: true,
        duration: Date.now() - startTime,
        size: entry.size,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      this.emit('storage:get', { pluginId, key, size: entry.size, operation })

      return result
    } catch (error) {
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.GET,
        pluginId,
        key,
        userId: options.userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      logger.error('Failed to get storage entry', {
        pluginId,
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('storage:error', { pluginId, key, error, operation })
      return null
    }
  }

  /**
   * Delete data for a plugin
   */
  public async delete(
    pluginId: string,
    key: string,
    options: {
      userId?: string
      namespace?: string
    } = {}
  ): Promise<boolean> {
    const startTime = Date.now()
    const operationId = this.generateOperationId()

    try {
      const storageKey = this.createStorageKey(pluginId, key, options.userId, options.namespace)
      const entry = this.storage.get(storageKey)

      if (!entry) {
        return false
      }

      // Remove from storage
      this.storage.delete(storageKey)

      // Remove from indexes
      this.removeFromIndexes(entry)

      // Remove from cache
      this.cache.delete(storageKey)

      // Remove from pending writes
      this.pendingWrites.delete(storageKey)

      // Record operation
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.DELETE,
        pluginId,
        key,
        userId: options.userId,
        success: true,
        duration: Date.now() - startTime,
        size: entry.size,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      this.emit('storage:delete', { pluginId, key, size: entry.size, operation })

      if (this.config.monitoring.enabled && this.config.monitoring.logLevel === 'debug') {
        logger.debug('Storage entry deleted', {
          pluginId,
          key,
          storageKey,
          size: this.formatBytes(entry.size)
        })
      }

      return true
    } catch (error) {
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.DELETE,
        pluginId,
        key,
        userId: options.userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      logger.error('Failed to delete storage entry', {
        pluginId,
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('storage:error', { pluginId, key, error, operation })
      return false
    }
  }

  /**
   * List entries matching query
   */
  public async list(query: StorageQuery = {}): Promise<StorageEntry[]> {
    const startTime = Date.now()
    const operationId = this.generateOperationId()

    try {
      let entries = Array.from(this.storage.values())

      // Apply filters
      if (query.pluginId) {
        entries = entries.filter(e => e.pluginId === query.pluginId)
      }

      if (query.userId) {
        entries = entries.filter(e => e.userId === query.userId)
      }

      if (query.key) {
        entries = entries.filter(e => e.key === query.key)
      }

      if (query.keyPattern) {
        const regex = new RegExp(query.keyPattern)
        entries = entries.filter(e => regex.test(e.key))
      }

      if (query.type) {
        entries = entries.filter(e => e.type === query.type)
      }

      if (query.tags && query.tags.length > 0) {
        entries = entries.filter(e => 
          query.tags!.some(tag => e.tags.includes(tag))
        )
      }

      if (query.namespace) {
        entries = entries.filter(e => e.metadata.namespace === query.namespace)
      }

      if (query.isGlobal !== undefined) {
        entries = entries.filter(e => e.isGlobal === query.isGlobal)
      }

      // Date filters
      if (query.createdAfter) {
        entries = entries.filter(e => e.createdAt >= query.createdAfter!)
      }

      if (query.createdBefore) {
        entries = entries.filter(e => e.createdAt <= query.createdBefore!)
      }

      if (query.updatedAfter) {
        entries = entries.filter(e => e.updatedAt >= query.updatedAfter!)
      }

      if (query.updatedBefore) {
        entries = entries.filter(e => e.updatedAt <= query.updatedBefore!)
      }

      // Expiration filters
      if (!query.includeExpired) {
        const now = new Date()
        entries = entries.filter(e => !e.expiresAt || e.expiresAt > now)
      }

      if (query.expiresAfter) {
        entries = entries.filter(e => e.expiresAt && e.expiresAt >= query.expiresAfter!)
      }

      if (query.expiresBefore) {
        entries = entries.filter(e => e.expiresAt && e.expiresAt <= query.expiresBefore!)
      }

      // Sort entries
      if (query.sortBy) {
        entries.sort((a, b) => {
          let aValue: any, bValue: any

          switch (query.sortBy) {
            case 'key':
              aValue = a.key
              bValue = b.key
              break
            case 'createdAt':
              aValue = a.createdAt
              bValue = b.createdAt
              break
            case 'updatedAt':
              aValue = a.updatedAt
              bValue = b.updatedAt
              break
            case 'accessedAt':
              aValue = a.accessedAt
              bValue = b.accessedAt
              break
            case 'size':
              aValue = a.size
              bValue = b.size
              break
            default:
              return 0
          }

          if (aValue < bValue) return query.sortOrder === 'desc' ? 1 : -1
          if (aValue > bValue) return query.sortOrder === 'desc' ? -1 : 1
          return 0
        })
      }

      // Apply pagination
      if (query.offset) {
        entries = entries.slice(query.offset)
      }

      if (query.limit) {
        entries = entries.slice(0, query.limit)
      }

      // Record operation
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.LIST,
        pluginId: query.pluginId || 'system',
        key: 'list',
        userId: query.userId,
        success: true,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        metadata: { resultCount: entries.length }
      }

      this.recordOperation(operation)

      return entries
    } catch (error) {
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.LIST,
        pluginId: query.pluginId || 'system',
        key: 'list',
        userId: query.userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      logger.error('Failed to list storage entries', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return []
    }
  }

  /**
   * Clear all data for a plugin
   */
  public async clear(
    pluginId: string,
    options: {
      userId?: string
      namespace?: string
    } = {}
  ): Promise<number> {
    const startTime = Date.now()
    const operationId = this.generateOperationId()

    try {
      let deleted = 0
      const keysToDelete: string[] = []

      // Find matching entries
      for (const [storageKey, entry] of this.storage.entries()) {
        if (entry.pluginId === pluginId) {
          if (options.userId && entry.userId !== options.userId) continue
          if (options.namespace && entry.metadata.namespace !== options.namespace) continue
          
          keysToDelete.push(storageKey)
        }
      }

      // Delete entries
      for (const storageKey of keysToDelete) {
        const entry = this.storage.get(storageKey)
        if (entry) {
          this.storage.delete(storageKey)
          this.removeFromIndexes(entry)
          this.cache.delete(storageKey)
          this.pendingWrites.delete(storageKey)
          deleted++
        }
      }

      // Record operation
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.CLEAR,
        pluginId,
        key: 'clear',
        userId: options.userId,
        success: true,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        metadata: { deletedCount: deleted }
      }

      this.recordOperation(operation)

      this.emit('storage:clear', { pluginId, deleted, operation })

      logger.info('Plugin storage cleared', {
        pluginId,
        deleted,
        namespace: options.namespace
      })

      return deleted
    } catch (error) {
      const operation: StorageOperation = {
        id: operationId,
        type: StorageOperationType.CLEAR,
        pluginId,
        key: 'clear',
        userId: options.userId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date()
      }

      this.recordOperation(operation)

      logger.error('Failed to clear plugin storage', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      return 0
    }
  }

  /**
   * Check if entry exists
   */
  public async exists(
    pluginId: string,
    key: string,
    options: {
      userId?: string
      namespace?: string
    } = {}
  ): Promise<boolean> {
    const storageKey = this.createStorageKey(pluginId, key, options.userId, options.namespace)
    const entry = this.storage.get(storageKey)
    
    if (!entry) return false
    
    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      await this.delete(pluginId, key, options)
      return false
    }
    
    return true
  }

  /**
   * Get storage statistics
   */
  public getStats(): StorageStats {
    const entries = Array.from(this.storage.values())
    
    const stats: StorageStats = {
      totalEntries: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
      encryptedEntries: entries.filter(e => e.encrypted).length,
      compressedEntries: entries.filter(e => e.compressed).length,
      globalEntries: entries.filter(e => e.isGlobal).length,
      userEntries: entries.filter(e => !e.isGlobal).length,
      entriesByPlugin: {},
      entriesByType: {} as Record<StorageDataType, number>,
      averageSize: 0,
      compressionRatio: 0,
      cacheHitRate: 0,
      diskUsage: 0
    }

    // Initialize counters
    Object.values(StorageDataType).forEach(type => {
      stats.entriesByType[type] = 0
    })

    // Calculate stats
    entries.forEach(entry => {
      stats.entriesByPlugin[entry.pluginId] = (stats.entriesByPlugin[entry.pluginId] || 0) + 1
      stats.entriesByType[entry.type]++
    })

    if (entries.length > 0) {
      stats.averageSize = stats.totalSize / entries.length
      
      const dates = entries.map(e => e.createdAt.getTime())
      stats.oldestEntry = new Date(Math.min(...dates))
      stats.newestEntry = new Date(Math.max(...dates))
      
      // Calculate compression ratio
      const totalOriginalSize = entries.reduce((sum, e) => sum + e.metadata.originalSize, 0)
      stats.compressionRatio = totalOriginalSize > 0 ? totalOriginalSize / stats.totalSize : 1
    }

    return stats
  }

  // Private helper methods
  private createStorageKey(pluginId: string, key: string, userId?: string, namespace?: string): string {
    const parts = [pluginId]
    if (namespace) parts.push(`ns:${namespace}`)
    if (userId) parts.push(`user:${userId}`)
    parts.push(key)
    return parts.join(':')
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateEntryId(): string {
    return `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateEncryptionKey(): Buffer {
    return crypto.randomBytes(32) // 256-bit key
  }

  private calculateChecksum(data: any): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  private async encrypt(data: string): Promise<string> {
    try {
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipher(this.config.encryption.algorithm, this.encryptionKey)
      let encrypted = cipher.update(data, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      return iv.toString('hex') + ':' + encrypted
    } catch (error) {
      logger.warn('Encryption failed, using plain text', { error })
      return data
    }
  }

  private async decrypt(encryptedData: string): Promise<string> {
    try {
      const [ivHex, encrypted] = encryptedData.split(':')
      const decipher = crypto.createDecipher(this.config.encryption.algorithm, this.encryptionKey)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch (error) {
      logger.warn('Decryption failed, using encrypted data', { error })
      return encryptedData
    }
  }

  private async compress(data: string): Promise<string> {
    // Simple compression implementation
    // In production, use proper compression libraries
    try {
      const compressed = Buffer.from(data, 'utf8').toString('base64')
      return compressed
    } catch (error) {
      logger.warn('Compression failed, using original data', { error })
      return data
    }
  }

  private async decompress(data: string): Promise<string> {
    try {
      const decompressed = Buffer.from(data, 'base64').toString('utf8')
      return decompressed
    } catch (error) {
      logger.warn('Decompression failed, using compressed data', { error })
      return data
    }
  }

  private updateIndexes(entry: StorageEntry): void {
    // Plugin index
    const pluginIndex = this.indexes.get(`plugin:${entry.pluginId}`) || new Set()
    pluginIndex.add(entry.id)
    this.indexes.set(`plugin:${entry.pluginId}`, pluginIndex)

    // User index
    if (entry.userId) {
      const userIndex = this.indexes.get(`user:${entry.userId}`) || new Set()
      userIndex.add(entry.id)
      this.indexes.set(`user:${entry.userId}`, userIndex)
    }

    // Tag indexes
    entry.tags.forEach(tag => {
      const tagIndex = this.indexes.get(`tag:${tag}`) || new Set()
      tagIndex.add(entry.id)
      this.indexes.set(`tag:${tag}`, tagIndex)
    })

    // Type index
    const typeIndex = this.indexes.get(`type:${entry.type}`) || new Set()
    typeIndex.add(entry.id)
    this.indexes.set(`type:${entry.type}`, typeIndex)
  }

  private removeFromIndexes(entry: StorageEntry): void {
    // Remove from all indexes
    this.indexes.forEach((index, key) => {
      index.delete(entry.id)
      if (index.size === 0) {
        this.indexes.delete(key)
      }
    })
  }

  private recordOperation(operation: StorageOperation): void {
    this.operationLog.push(operation)
    
    // Keep only recent operations
    if (this.operationLog.length > 10000) {
      this.operationLog.shift()
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  private async initializeDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.config.baseDirectory, { recursive: true })
      
      if (this.config.backup.enabled) {
        await fs.mkdir(this.config.backup.destination, { recursive: true })
      }
    } catch (error) {
      logger.error('Failed to initialize storage directories', { error })
    }
  }

  private startTimers(): void {
    if (this.config.persistence.enabled) {
      this.persistenceTimer = setInterval(() => {
        this.persistToDisk()
      }, this.config.persistence.interval)
    }

    if (this.config.cleanup.enabled) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup()
      }, this.config.cleanup.interval * 60 * 60 * 1000) // Convert hours to ms
    }

    if (this.config.backup.enabled) {
      this.backupTimer = setInterval(() => {
        this.backup()
      }, this.config.backup.interval * 60 * 60 * 1000) // Convert hours to ms
    }

    if (this.config.encryption.enabled) {
      this.keyRotationTimer = setInterval(() => {
        this.rotateEncryptionKey()
      }, this.config.encryption.keyRotationInterval * 60 * 60 * 1000) // Convert hours to ms
    }
  }

  private stopTimers(): void {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer)
      this.persistenceTimer = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    if (this.backupTimer) {
      clearInterval(this.backupTimer)
      this.backupTimer = null
    }

    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer)
      this.keyRotationTimer = null
    }
  }

  private async loadFromPersistence(): Promise<void> {
    if (!this.config.persistence.enabled) return

    try {
      const dataPath = path.join(this.config.baseDirectory, 'storage.json')
      const data = await fs.readFile(dataPath, 'utf-8')
      const storageData = JSON.parse(data)

      if (storageData.entries) {
        for (const entryData of storageData.entries) {
          const entry: StorageEntry = {
            ...entryData,
            createdAt: new Date(entryData.createdAt),
            updatedAt: new Date(entryData.updatedAt),
            accessedAt: new Date(entryData.accessedAt),
            expiresAt: entryData.expiresAt ? new Date(entryData.expiresAt) : undefined
          }

          const storageKey = this.createStorageKey(
            entry.pluginId,
            entry.key,
            entry.userId,
            entry.metadata.namespace
          )

          this.storage.set(storageKey, entry)
          this.updateIndexes(entry)
        }
      }

      logger.info('Storage loaded from persistence', {
        entryCount: this.storage.size,
        path: dataPath
      })
    } catch (error) {
      logger.info('No existing storage found, starting fresh')
    }
  }

  private async persistToDisk(): Promise<void> {
    if (!this.config.persistence.enabled || this.pendingWrites.size === 0) return

    try {
      const entries = Array.from(this.storage.values())
      const data = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        entries
      }

      const dataPath = path.join(this.config.baseDirectory, 'storage.json')
      await fs.writeFile(dataPath, JSON.stringify(data, null, 2))

      this.pendingWrites.clear()

      if (this.config.monitoring.enabled && this.config.monitoring.logLevel === 'debug') {
        logger.debug('Storage persisted to disk', {
          entryCount: entries.length,
          path: dataPath
        })
      }
    } catch (error) {
      logger.error('Failed to persist storage to disk', { error })
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now()
    const maxAge = this.config.cleanup.maxAge * 60 * 60 * 1000 // Convert hours to ms
    let cleaned = 0

    // Clean expired entries
    for (const [storageKey, entry] of this.storage.entries()) {
      let shouldDelete = false

      // Check expiration
      if (entry.expiresAt && entry.expiresAt < new Date()) {
        shouldDelete = true
      }

      // Check age
      if (this.config.cleanup.maxAge > 0 && 
          now - entry.accessedAt.getTime() > maxAge) {
        shouldDelete = true
      }

      if (shouldDelete) {
        this.storage.delete(storageKey)
        this.removeFromIndexes(entry)
        this.cache.delete(storageKey)
        this.pendingWrites.delete(storageKey)
        cleaned++
      }
    }

    // Clean orphaned indexes
    if (this.config.cleanup.orphanCleanup) {
      const validEntryIds = new Set(Array.from(this.storage.values()).map(e => e.id))
      
      for (const [indexKey, entryIds] of this.indexes.entries()) {
        for (const entryId of entryIds) {
          if (!validEntryIds.has(entryId)) {
            entryIds.delete(entryId)
          }
        }
        
        if (entryIds.size === 0) {
          this.indexes.delete(indexKey)
        }
      }
    }

    if (cleaned > 0) {
      logger.info('Storage cleanup completed', { cleaned })
      this.emit('storage:cleanup', { cleaned })
    }
  }

  private async backup(): Promise<void> {
    if (!this.config.backup.enabled) return

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = path.join(this.config.backup.destination, `storage-backup-${timestamp}.json`)

      const data = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        entries: Array.from(this.storage.values())
      }

      await fs.writeFile(backupPath, JSON.stringify(data, null, 2))

      // Clean old backups
      const retentionTime = this.config.backup.retention * 24 * 60 * 60 * 1000 // Convert days to ms
      const files = await fs.readdir(this.config.backup.destination)
      
      for (const file of files) {
        if (file.startsWith('storage-backup-')) {
          const filePath = path.join(this.config.backup.destination, file)
          const stats = await fs.stat(filePath)
          
          if (Date.now() - stats.mtime.getTime() > retentionTime) {
            await fs.unlink(filePath)
          }
        }
      }

      logger.info('Storage backup created', {
        path: backupPath,
        entryCount: this.storage.size
      })

      this.emit('storage:backup', { path: backupPath })
    } catch (error) {
      logger.error('Failed to create storage backup', { error })
    }
  }

  private async rotateEncryptionKey(): Promise<void> {
    if (!this.config.encryption.enabled) return

    try {
      const oldKey = this.encryptionKey
      this.encryptionKey = this.generateEncryptionKey()

      // Re-encrypt all encrypted entries with new key
      let reencrypted = 0
      for (const [storageKey, entry] of this.storage.entries()) {
        if (entry.encrypted) {
          // Decrypt with old key and encrypt with new key
          const decrypted = await this.decrypt(entry.value)
          entry.value = await this.encrypt(decrypted)
          this.pendingWrites.set(storageKey, entry)
          reencrypted++
        }
      }

      logger.info('Encryption key rotated', { reencrypted })
      this.emit('storage:key_rotated', { reencrypted })
    } catch (error) {
      logger.error('Failed to rotate encryption key', { error })
    }
  }

  /**
   * Shutdown storage manager
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true
    this.stopTimers()

    // Persist any pending writes
    if (this.config.persistence.enabled && this.pendingWrites.size > 0) {
      await this.persistToDisk()
    }

    // Clear all data
    this.storage.clear()
    this.indexes.clear()
    this.cache.clear()
    this.operationLog = []
    this.pendingWrites.clear()
    this.removeAllListeners()

    logger.info('Plugin storage shutdown')
  }
}