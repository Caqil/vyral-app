import { logger } from '@/core/lib/utils/logger'
import { EventEmitter } from 'events'

export interface CacheConfig {
  strategy: CacheStrategy
  ttl: number // seconds
  maxSize: number // MB
  maxEntries: number
  compression: boolean
  persistence: boolean
  persistencePath?: string
  metrics: boolean
  cleanupInterval: number // seconds
  warningThreshold: number // percentage of maxSize
}

export interface CacheEntry {
  key: string
  value: any
  size: number // bytes
  createdAt: Date
  lastAccessed: Date
  accessCount: number
  ttl: number
  pluginId: string
  namespace: string
  compressed: boolean
  metadata?: Record<string, any>
}

export interface CacheStats {
  totalEntries: number
  totalSize: number // bytes
  hitCount: number
  missCount: number
  hitRate: number
  memoryUsage: number
  evictionCount: number
  compressionRatio: number
  oldestEntry?: Date
  newestEntry?: Date
  topKeys: Array<{ key: string; accessCount: number }>
}

export interface CacheMetrics {
  pluginId: string
  namespace: string
  operations: CacheOperationMetrics
  performance: CachePerformanceMetrics
  storage: CacheStorageMetrics
  timestamp: Date
}

export interface CacheOperationMetrics {
  gets: number
  sets: number
  deletes: number
  hits: number
  misses: number
  evictions: number
}

export interface CachePerformanceMetrics {
  avgGetTime: number
  avgSetTime: number
  avgDeleteTime: number
  slowQueries: number
  compressionTime: number
  decompressionTime: number
}

export interface CacheStorageMetrics {
  size: number
  entries: number
  memoryUsage: number
  compressionRatio: number
}

export enum CacheStrategy {
  LRU = 'lru', // Least Recently Used
  LFU = 'lfu', // Least Frequently Used
  FIFO = 'fifo', // First In, First Out
  TTL = 'ttl' // Time To Live only
}

export enum CacheEvent {
  SET = 'set',
  GET = 'get',
  DELETE = 'delete',
  EVICT = 'evict',
  CLEAR = 'clear',
  EXPIRE = 'expire',
  WARNING = 'warning',
  ERROR = 'error'
}

export class PluginCache extends EventEmitter {
  private static instance: PluginCache
  private config: CacheConfig
  private cache: Map<string, CacheEntry> = new Map()
  private accessOrder: string[] = [] // For LRU
  private accessFrequency: Map<string, number> = new Map() // For LFU
  private insertOrder: string[] = [] // For FIFO
  private stats: CacheStats = {
    totalEntries: 0,
    totalSize: 0,
    hitCount: 0,
    missCount: 0,
    hitRate: 0,
    memoryUsage: 0,
    evictionCount: 0,
    compressionRatio: 1,
    topKeys: []
  }
  private metrics: Map<string, CacheMetrics> = new Map()
  private cleanupTimer: NodeJS.Timeout | null = null

  private constructor(config: CacheConfig) {
    super()
    this.config = config
    this.startCleanupTimer()
    this.loadFromPersistence()
  }

  public static getInstance(config?: CacheConfig): PluginCache {
    if (!PluginCache.instance) {
      if (!config) {
        throw new Error('Cache config required for first initialization')
      }
      PluginCache.instance = new PluginCache(config)
    }
    return PluginCache.instance
  }

  /**
   * Set cache entry
   */
  public async set(
    pluginId: string,
    namespace: string,
    key: string,
    value: any,
    ttl?: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    const startTime = Date.now()
    
    try {
      const fullKey = this.buildKey(pluginId, namespace, key)
      const entryTtl = ttl || this.config.ttl
      
      // Serialize and optionally compress value
      let serializedValue = JSON.stringify(value)
      let compressed = false
      let originalSize = Buffer.byteLength(serializedValue, 'utf8')
      
      if (this.config.compression && originalSize > 1024) { // Compress if > 1KB
        serializedValue = await this.compress(serializedValue)
        compressed = true
      }
      
      const size = Buffer.byteLength(serializedValue, 'utf8')
      
      // Check size limits
      if (size > this.config.maxSize * 1024 * 1024 * 0.1) { // Single entry can't be > 10% of max size
        logger.warn('Cache entry too large, skipping', {
          pluginId,
          namespace,
          key,
          size: this.formatBytes(size)
        })
        return false
      }
      
      // Check if we need to evict entries
      await this.ensureCapacity(size)
      
      // Create cache entry
      const entry: CacheEntry = {
        key: fullKey,
        value: serializedValue,
        size,
        createdAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 0,
        ttl: entryTtl,
        pluginId,
        namespace,
        compressed,
        metadata
      }
      
      // Remove existing entry if present
      if (this.cache.has(fullKey)) {
        await this.removeEntry(fullKey, false)
      }
      
      // Add new entry
      this.cache.set(fullKey, entry)
      this.updateAccessTracking(fullKey, 'set')
      this.updateStats(size, 0, 'set')
      this.updateMetrics(pluginId, namespace, 'set', Date.now() - startTime)
      
      this.emit(CacheEvent.SET, {
        pluginId,
        namespace,
        key,
        size,
        ttl: entryTtl,
        compressed
      })
      
      logger.debug('Cache entry set', {
        pluginId,
        namespace,
        key,
        size: this.formatBytes(size),
        ttl: entryTtl,
        compressed
      })
      
      return true
    } catch (error) {
      logger.error('Failed to set cache entry', {
        pluginId,
        namespace,
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.emit(CacheEvent.ERROR, { pluginId, namespace, key, error })
      return false
    }
  }

  /**
   * Get cache entry
   */
  public async get<T = any>(
    pluginId: string,
    namespace: string,
    key: string
  ): Promise<T | null> {
    const startTime = Date.now()
    
    try {
      const fullKey = this.buildKey(pluginId, namespace, key)
      const entry = this.cache.get(fullKey)
      
      if (!entry) {
        this.stats.missCount++
        this.updateMetrics(pluginId, namespace, 'get', Date.now() - startTime, false)
        
        this.emit(CacheEvent.GET, {
          pluginId,
          namespace,
          key,
          hit: false
        })
        
        return null
      }
      
      // Check TTL
      const now = Date.now()
      const age = now - entry.createdAt.getTime()
      if (age > entry.ttl * 1000) {
        await this.removeEntry(fullKey, true)
        this.stats.missCount++
        this.updateMetrics(pluginId, namespace, 'get', Date.now() - startTime, false)
        
        this.emit(CacheEvent.EXPIRE, {
          pluginId,
          namespace,
          key,
          age
        })
        
        return null
      }
      
      // Update access tracking
      entry.lastAccessed = new Date()
      entry.accessCount++
      this.updateAccessTracking(fullKey, 'get')
      
      this.stats.hitCount++
      this.updateMetrics(pluginId, namespace, 'get', Date.now() - startTime, true)
      
      // Deserialize and decompress value
      let value = entry.value
      if (entry.compressed) {
        value = await this.decompress(value)
      }
      
      const result = JSON.parse(value)
      
      this.emit(CacheEvent.GET, {
        pluginId,
        namespace,
        key,
        hit: true,
        size: entry.size,
        age
      })
      
      logger.debug('Cache entry retrieved', {
        pluginId,
        namespace,
        key,
        size: this.formatBytes(entry.size),
        age,
        accessCount: entry.accessCount
      })
      
      return result
    } catch (error) {
      logger.error('Failed to get cache entry', {
        pluginId,
        namespace,
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.emit(CacheEvent.ERROR, { pluginId, namespace, key, error })
      return null
    }
  }

  /**
   * Delete cache entry
   */
  public async delete(
    pluginId: string,
    namespace: string,
    key: string
  ): Promise<boolean> {
    const startTime = Date.now()
    
    try {
      const fullKey = this.buildKey(pluginId, namespace, key)
      const success = await this.removeEntry(fullKey, false)
      
      this.updateMetrics(pluginId, namespace, 'delete', Date.now() - startTime)
      
      this.emit(CacheEvent.DELETE, {
        pluginId,
        namespace,
        key,
        success
      })
      
      if (success) {
        logger.debug('Cache entry deleted', {
          pluginId,
          namespace,
          key
        })
      }
      
      return success
    } catch (error) {
      logger.error('Failed to delete cache entry', {
        pluginId,
        namespace,
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.emit(CacheEvent.ERROR, { pluginId, namespace, key, error })
      return false
    }
  }

  /**
   * Clear cache entries for plugin
   */
  public async clear(pluginId: string, namespace?: string): Promise<number> {
    try {
      let cleared = 0
      const keysToRemove: string[] = []
      
      this.cache.forEach((entry, key) => {
        if (entry.pluginId === pluginId) {
          if (!namespace || entry.namespace === namespace) {
            keysToRemove.push(key)
          }
        }
      })
      
      for (const key of keysToRemove) {
        await this.removeEntry(key, false)
        cleared++
      }
      
      this.emit(CacheEvent.CLEAR, {
        pluginId,
        namespace,
        cleared
      })
      
      logger.info('Cache cleared', {
        pluginId,
        namespace,
        cleared
      })
      
      return cleared
    } catch (error) {
      logger.error('Failed to clear cache', {
        pluginId,
        namespace,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return 0
    }
  }

  /**
   * Check if cache entry exists
   */
  public async exists(
    pluginId: string,
    namespace: string,
    key: string
  ): Promise<boolean> {
    const fullKey = this.buildKey(pluginId, namespace, key)
    const entry = this.cache.get(fullKey)
    
    if (!entry) return false
    
    // Check TTL
    const now = Date.now()
    const age = now - entry.createdAt.getTime()
    if (age > entry.ttl * 1000) {
      await this.removeEntry(fullKey, true)
      return false
    }
    
    return true
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    this.updateStats(0, 0, 'stats')
    return { ...this.stats }
  }

  /**
   * Get cache metrics for plugin
   */
  public getMetrics(pluginId: string): CacheMetrics | null {
    return this.metrics.get(pluginId) || null
  }

  /**
   * Get all cache metrics
   */
  public getAllMetrics(): CacheMetrics[] {
    return Array.from(this.metrics.values())
  }

  /**
   * Get cache entries for plugin
   */
  public getPluginEntries(pluginId: string, namespace?: string): Array<{
    key: string
    size: number
    age: number
    accessCount: number
    ttl: number
  }> {
    const entries: Array<{
      key: string
      size: number
      age: number
      accessCount: number
      ttl: number
    }> = []
    
    const now = Date.now()
    
    this.cache.forEach((entry) => {
      if (entry.pluginId === pluginId) {
        if (!namespace || entry.namespace === namespace) {
          entries.push({
            key: entry.key,
            size: entry.size,
            age: now - entry.createdAt.getTime(),
            accessCount: entry.accessCount,
            ttl: entry.ttl
          })
        }
      }
    })
    
    return entries.sort((a, b) => b.accessCount - a.accessCount)
  }

  /**
   * Update cache configuration
   */
  public updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // Restart cleanup timer with new interval
    if (newConfig.cleanupInterval) {
      this.stopCleanupTimer()
      this.startCleanupTimer()
    }
    
    logger.info('Cache configuration updated', { config: this.config })
  }

  /**
   * Force cleanup of expired entries
   */
  public async cleanup(): Promise<number> {
    let cleaned = 0
    const now = Date.now()
    const keysToRemove: string[] = []
    
    this.cache.forEach((entry, key) => {
      const age = now - entry.createdAt.getTime()
      if (age > entry.ttl * 1000) {
        keysToRemove.push(key)
      }
    })
    
    for (const key of keysToRemove) {
      await this.removeEntry(key, true)
      cleaned++
    }
    
    if (cleaned > 0) {
      logger.info('Cache cleanup completed', { cleaned })
    }
    
    return cleaned
  }

  /**
   * Warm up cache with initial data
   */
  public async warmup(
    data: Array<{
      pluginId: string
      namespace: string
      key: string
      value: any
      ttl?: number
    }>
  ): Promise<number> {
    let warmed = 0
    
    for (const item of data) {
      const success = await this.set(
        item.pluginId,
        item.namespace,
        item.key,
        item.value,
        item.ttl
      )
      
      if (success) {
        warmed++
      }
    }
    
    logger.info('Cache warmup completed', { warmed, total: data.length })
    return warmed
  }

  // Private methods
  private buildKey(pluginId: string, namespace: string, key: string): string {
    return `${pluginId}:${namespace}:${key}`
  }

  private async removeEntry(key: string, isExpiration: boolean): Promise<boolean> {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    this.cache.delete(key)
    this.removeFromAccessTracking(key)
    this.updateStats(-entry.size, -1, isExpiration ? 'expire' : 'delete')
    
    if (isExpiration) {
      this.emit(CacheEvent.EXPIRE, {
        pluginId: entry.pluginId,
        namespace: entry.namespace,
        key: entry.key
      })
    }
    
    return true
  }

  private async ensureCapacity(newEntrySize: number): Promise<void> {
    const maxSizeBytes = this.config.maxSize * 1024 * 1024
    const currentSize = this.stats.totalSize
    const maxEntries = this.config.maxEntries
    
    // Check if we need to evict based on size
    if (currentSize + newEntrySize > maxSizeBytes) {
      await this.evictEntries('size', maxSizeBytes - newEntrySize)
    }
    
    // Check if we need to evict based on entry count
    if (this.cache.size >= maxEntries) {
      await this.evictEntries('count', maxEntries - 1)
    }
    
    // Warning threshold check
    const usagePercentage = ((currentSize + newEntrySize) / maxSizeBytes) * 100
    if (usagePercentage > this.config.warningThreshold) {
      this.emit(CacheEvent.WARNING, {
        type: 'size_warning',
        usage: usagePercentage,
        threshold: this.config.warningThreshold
      })
    }
  }

  private async evictEntries(reason: 'size' | 'count', targetValue: number): Promise<void> {
    const keysToEvict: string[] = []
    
    switch (this.config.strategy) {
      case CacheStrategy.LRU:
        keysToEvict.push(...this.getLRUEvictionCandidates(reason, targetValue))
        break
      case CacheStrategy.LFU:
        keysToEvict.push(...this.getLFUEvictionCandidates(reason, targetValue))
        break
      case CacheStrategy.FIFO:
        keysToEvict.push(...this.getFIFOEvictionCandidates(reason, targetValue))
        break
      case CacheStrategy.TTL:
        keysToEvict.push(...this.getTTLEvictionCandidates(reason, targetValue))
        break
    }
    
    for (const key of keysToEvict) {
      await this.removeEntry(key, false)
      this.stats.evictionCount++
      
      const entry = this.cache.get(key)
      if (entry) {
        this.emit(CacheEvent.EVICT, {
          pluginId: entry.pluginId,
          namespace: entry.namespace,
          key: entry.key,
          reason: this.config.strategy
        })
      }
    }
  }

  private getLRUEvictionCandidates(reason: 'size' | 'count', targetValue: number): string[] {
    const candidates: string[] = []
    let currentSize = this.stats.totalSize
    let currentCount = this.cache.size
    
    // Sort by last accessed time (oldest first)
    const sortedKeys = Array.from(this.cache.keys()).sort((a, b) => {
      const entryA = this.cache.get(a)!
      const entryB = this.cache.get(b)!
      return entryA.lastAccessed.getTime() - entryB.lastAccessed.getTime()
    })
    
    for (const key of sortedKeys) {
      const entry = this.cache.get(key)!
      
      if (reason === 'size' && currentSize <= targetValue) break
      if (reason === 'count' && currentCount <= targetValue) break
      
      candidates.push(key)
      currentSize -= entry.size
      currentCount--
    }
    
    return candidates
  }

  private getLFUEvictionCandidates(reason: 'size' | 'count', targetValue: number): string[] {
    const candidates: string[] = []
    let currentSize = this.stats.totalSize
    let currentCount = this.cache.size
    
    // Sort by access frequency (least frequent first)
    const sortedKeys = Array.from(this.cache.keys()).sort((a, b) => {
      const entryA = this.cache.get(a)!
      const entryB = this.cache.get(b)!
      return entryA.accessCount - entryB.accessCount
    })
    
    for (const key of sortedKeys) {
      const entry = this.cache.get(key)!
      
      if (reason === 'size' && currentSize <= targetValue) break
      if (reason === 'count' && currentCount <= targetValue) break
      
      candidates.push(key)
      currentSize -= entry.size
      currentCount--
    }
    
    return candidates
  }

  private getFIFOEvictionCandidates(reason: 'size' | 'count', targetValue: number): string[] {
    const candidates: string[] = []
    let currentSize = this.stats.totalSize
    let currentCount = this.cache.size
    
    // Use insert order (oldest first)
    for (const key of this.insertOrder) {
      const entry = this.cache.get(key)
      if (!entry) continue
      
      if (reason === 'size' && currentSize <= targetValue) break
      if (reason === 'count' && currentCount <= targetValue) break
      
      candidates.push(key)
      currentSize -= entry.size
      currentCount--
    }
    
    return candidates
  }

  private getTTLEvictionCandidates(reason: 'size' | 'count', targetValue: number): string[] {
    const candidates: string[] = []
    let currentSize = this.stats.totalSize
    let currentCount = this.cache.size
    const now = Date.now()
    
    // Sort by remaining TTL (shortest first)
    const sortedKeys = Array.from(this.cache.keys()).sort((a, b) => {
      const entryA = this.cache.get(a)!
      const entryB = this.cache.get(b)!
      const remainingA = (entryA.ttl * 1000) - (now - entryA.createdAt.getTime())
      const remainingB = (entryB.ttl * 1000) - (now - entryB.createdAt.getTime())
      return remainingA - remainingB
    })
    
    for (const key of sortedKeys) {
      const entry = this.cache.get(key)!
      
      if (reason === 'size' && currentSize <= targetValue) break
      if (reason === 'count' && currentCount <= targetValue) break
      
      candidates.push(key)
      currentSize -= entry.size
      currentCount--
    }
    
    return candidates
  }

  private updateAccessTracking(key: string, operation: 'set' | 'get'): void {
    if (operation === 'set') {
      // Add to insert order for FIFO
      this.insertOrder.push(key)
    }
    
    // Update LRU order
    const lruIndex = this.accessOrder.indexOf(key)
    if (lruIndex > -1) {
      this.accessOrder.splice(lruIndex, 1)
    }
    this.accessOrder.push(key)
    
    // Update LFU frequency
    const currentFreq = this.accessFrequency.get(key) || 0
    this.accessFrequency.set(key, currentFreq + 1)
  }

  private removeFromAccessTracking(key: string): void {
    // Remove from LRU order
    const lruIndex = this.accessOrder.indexOf(key)
    if (lruIndex > -1) {
      this.accessOrder.splice(lruIndex, 1)
    }
    
    // Remove from FIFO order
    const fifoIndex = this.insertOrder.indexOf(key)
    if (fifoIndex > -1) {
      this.insertOrder.splice(fifoIndex, 1)
    }
    
    // Remove from LFU frequency
    this.accessFrequency.delete(key)
  }

  private updateStats(sizeChange: number, entryChange: number, operation: string): void {
    this.stats.totalSize += sizeChange
    this.stats.totalEntries += entryChange
    
    // Calculate hit rate
    const totalRequests = this.stats.hitCount + this.stats.missCount
    this.stats.hitRate = totalRequests > 0 ? (this.stats.hitCount / totalRequests) * 100 : 0
    
    // Update memory usage (rough estimate)
    this.stats.memoryUsage = this.stats.totalSize + (this.cache.size * 200) // 200 bytes overhead per entry
    
    // Update top keys
    if (operation === 'stats') {
      this.stats.topKeys = Array.from(this.cache.entries())
        .map(([key, entry]) => ({ key, accessCount: entry.accessCount }))
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, 10)
      
      // Update oldest/newest entry dates
      const entries = Array.from(this.cache.values())
      if (entries.length > 0) {
        this.stats.oldestEntry = new Date(Math.min(...entries.map(e => e.createdAt.getTime())))
        this.stats.newestEntry = new Date(Math.max(...entries.map(e => e.createdAt.getTime())))
      }
    }
  }

  private updateMetrics(
    pluginId: string,
    namespace: string,
    operation: 'get' | 'set' | 'delete',
    duration: number,
    hit?: boolean
  ): void {
    if (!this.config.metrics) return
    
    const key = `${pluginId}:${namespace}`
    let metrics = this.metrics.get(key)
    
    if (!metrics) {
      metrics = {
        pluginId,
        namespace,
        operations: {
          gets: 0,
          sets: 0,
          deletes: 0,
          hits: 0,
          misses: 0,
          evictions: 0
        },
        performance: {
          avgGetTime: 0,
          avgSetTime: 0,
          avgDeleteTime: 0,
          slowQueries: 0,
          compressionTime: 0,
          decompressionTime: 0
        },
        storage: {
          size: 0,
          entries: 0,
          memoryUsage: 0,
          compressionRatio: 1
        },
        timestamp: new Date()
      }
      this.metrics.set(key, metrics)
    }
    
    // Update operation counts
    switch (operation) {
      case 'get':
        metrics.operations.gets++
        if (hit !== undefined) {
          if (hit) {
            metrics.operations.hits++
          } else {
            metrics.operations.misses++
          }
        }
        metrics.performance.avgGetTime = this.updateAverage(
          metrics.performance.avgGetTime,
          duration,
          metrics.operations.gets
        )
        break
      case 'set':
        metrics.operations.sets++
        metrics.performance.avgSetTime = this.updateAverage(
          metrics.performance.avgSetTime,
          duration,
          metrics.operations.sets
        )
        break
      case 'delete':
        metrics.operations.deletes++
        metrics.performance.avgDeleteTime = this.updateAverage(
          metrics.performance.avgDeleteTime,
          duration,
          metrics.operations.deletes
        )
        break
    }
    
    // Mark slow queries (> 100ms)
    if (duration > 100) {
      metrics.performance.slowQueries++
    }
    
    // Update storage metrics
    this.updateStorageMetrics(metrics, pluginId, namespace)
    
    metrics.timestamp = new Date()
  }

  private updateStorageMetrics(metrics: CacheMetrics, pluginId: string, namespace: string): void {
    let size = 0
    let entries = 0
    
    this.cache.forEach((entry) => {
      if (entry.pluginId === pluginId && entry.namespace === namespace) {
        size += entry.size
        entries++
      }
    })
    
    metrics.storage.size = size
    metrics.storage.entries = entries
    metrics.storage.memoryUsage = size + (entries * 200) // Rough overhead estimate
  }

  private updateAverage(currentAvg: number, newValue: number, count: number): number {
    return ((currentAvg * (count - 1)) + newValue) / count
  }

  private async compress(data: string): Promise<string> {
    // Simple compression implementation
    // In production, you might want to use a proper compression library
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
      logger.warn('Decompression failed, using original data', { error })
      return data
    }
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    
    this.cleanupTimer = setInterval(async () => {
      await this.cleanup()
    }, this.config.cleanupInterval * 1000)
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private async loadFromPersistence(): Promise<void> {
    if (!this.config.persistence || !this.config.persistencePath) {
      return
    }
    
    try {
      // Implementation would load cache from persistent storage
      logger.info('Cache persistence loading not implemented')
    } catch (error) {
      logger.warn('Failed to load cache from persistence', { error })
    }
  }

  private async saveToPersistence(): Promise<void> {
    if (!this.config.persistence || !this.config.persistencePath) {
      return
    }
    
    try {
      // Implementation would save cache to persistent storage
      logger.info('Cache persistence saving not implemented')
    } catch (error) {
      logger.warn('Failed to save cache to persistence', { error })
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Shutdown cache manager
   */
  public async shutdown(): Promise<void> {
    this.stopCleanupTimer()
    await this.saveToPersistence()
    this.cache.clear()
    this.accessOrder = []
    this.insertOrder = []
    this.accessFrequency.clear()
    this.metrics.clear()
    
    logger.info('Cache manager shutdown')
  }
}