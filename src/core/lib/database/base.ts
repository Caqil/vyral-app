import mongoose, { Document, Model, Schema, Connection, ClientSession } from 'mongoose'
import { logger } from '@/core/lib/utils/logger'
import { database } from './connection'
import { AppError } from '@/core/types'
import { ERROR_MESSAGES } from '../utils/constants'

export interface BaseDocument extends Document {
  createdAt: Date
  updatedAt: Date
}

export interface QueryOptions {
  populate?: string | string[] | Record<string, any>
  sort?: string | Record<string, any>
  limit?: number
  skip?: number
  select?: string | Record<string, any>
  lean?: boolean
  session?: ClientSession
}

export interface PaginationOptions {
  page?: number
  limit?: number
  sort?: Record<string, any>
  populate?: string | string[] | Record<string, any>
  select?: string | Record<string, any>
}

export interface PaginationResult<T> {
  docs: T[]
  totalDocs: number
  limit: number
  page: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
  nextPage: number | null
  prevPage: number | null
  pagingCounter: number
}

export interface IndexDefinition {
  keys: Record<string, 1 | -1 | 'text' | '2dsphere'>
  options?: Record<string, any>
}

export interface DatabaseTransaction {
  session: ClientSession
  commit(): Promise<void>
  abort(): Promise<void>
}

/**
 * Base database utility class with common operations
 */
export class DatabaseBase {
  protected connection: Connection

  constructor(connection?: Connection) {
    this.connection = connection || mongoose.connection
  }

  /**
   * Start a database transaction
   */
  async startTransaction(): Promise<DatabaseTransaction> {
    const session = await mongoose.startSession()
    session.startTransaction()

    return {
      session,
      commit: async () => {
        await session.commitTransaction()
        session.endSession()
      },
      abort: async () => {
        await session.abortTransaction()
        session.endSession()
      }
    }
  }

  /**
   * Execute operations within a transaction
   */
  async withTransaction<T>(
    operations: (session: ClientSession) => Promise<T>
  ): Promise<T> {
    const session = await mongoose.startSession()

    try {
      const result = await session.withTransaction(async () => {
        return await operations(session)
      })

      return result
    } catch (error) {
      logger.error('Transaction failed', ERROR_MESSAGES)
      throw error
    } finally {
      session.endSession()
    }
  }

  /**
   * Create indexes for a collection
   */
  async createIndexes(
    collectionName: string, 
    indexes: IndexDefinition[]
  ): Promise<void> {
    try {
      const collection = this.connection.collection(collectionName)
      
      for (const index of indexes) {
        await collection.createIndex(index.keys, index.options)
        logger.debug('Index created', { 
          collection: collectionName, 
          keys: index.keys,
          options: index.options 
        })
      }

      logger.info('All indexes created successfully', { 
        collection: collectionName, 
        count: indexes.length 
      })
    } catch (error) {
      logger.error('Failed to create indexes', { 
        collection: collectionName, 
        error 
      })
      throw error
    }
  }

  /**
   * Drop indexes for a collection
   */
  async dropIndexes(
    collectionName: string, 
    indexNames: string[]
  ): Promise<void> {
    try {
      const collection = this.connection.collection(collectionName)
      
      for (const indexName of indexNames) {
        await collection.dropIndex(indexName)
        logger.debug('Index dropped', { collection: collectionName, index: indexName })
      }

      logger.info('Indexes dropped successfully', { 
        collection: collectionName, 
        count: indexNames.length 
      })
    } catch (error) {
      logger.error('Failed to drop indexes', { 
        collection: collectionName, 
        error 
      })
      throw error
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName: string): Promise<Record<string, any>> {
    try {
      const collection = this.connection.collection(collectionName)
      const stats = await collection.stats()
      return stats
    } catch (error) {
      logger.error('Failed to get collection stats', { 
        collection: collectionName, 
        error 
      })
      throw error
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<Record<string, any>> {
    try {
      const admin = this.connection.db.admin()
      const stats = await admin.dbStats()
      return stats
    } catch (error) {
      logger.error('Failed to get database stats', error)
      throw error
    }
  }

  /**
   * Check if collection exists
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections = await this.connection.db.listCollections().toArray()
      return collections.some(col => col.name === collectionName)
    } catch (error) {
      logger.error('Failed to check collection existence', { 
        collection: collectionName, 
        error 
      })
      return false
    }
  }

  /**
   * Drop collection if exists
   */
  async dropCollection(collectionName: string): Promise<boolean> {
    try {
      if (await this.collectionExists(collectionName)) {
        await this.connection.db.dropCollection(collectionName)
        logger.info('Collection dropped', { collection: collectionName })
        return true
      }
      return false
    } catch (error) {
      logger.error('Failed to drop collection', { 
        collection: collectionName, 
        error 
      })
      throw error
    }
  }

  /**
   * Aggregate pipeline with error handling
   */
  async aggregate<T = any>(
    collectionName: string,
    pipeline: Record<string, any>[],
    options?: Record<string, any>
  ): Promise<T[]> {
    try {
      const collection = this.connection.collection(collectionName)
      const results = await collection.aggregate(pipeline, options).toArray()
      return results as T[]
    } catch (error) {
      logger.error('Aggregation failed', { 
        collection: collectionName, 
        pipeline, 
        error 
      })
      throw error
    }
  }

  /**
   * Bulk operations with error handling
   */
  async bulkWrite(
    collectionName: string,
    operations: any[],
    options?: Record<string, any>
  ): Promise<any> {
    try {
      const collection = this.connection.collection(collectionName)
      const result = await collection.bulkWrite(operations, options)
      
      logger.debug('Bulk write completed', {
        collection: collectionName,
        operations: operations.length,
        inserted: result.insertedCount,
        modified: result.modifiedCount,
        deleted: result.deletedCount
      })

      return result
    } catch (error) {
      logger.error('Bulk write failed', { 
        collection: collectionName, 
        operations: operations.length, 
        error 
      })
      throw error
    }
  }
}

/**
 * Base repository class for common CRUD operations
 */
export class BaseRepository<TDocument extends BaseDocument> {
  protected model: Model<TDocument>
  protected db: DatabaseBase

  constructor(model: Model<TDocument>) {
    this.model = model
    this.db = new DatabaseBase()
  }

  /**
   * Find documents with advanced options
   */
  async find(
    filter: Record<string, any> = {},
    options: QueryOptions = {}
  ): Promise<TDocument[]> {
    try {
      let query = this.model.find(filter)

      if (options.populate) {
        query = query.populate(options.populate)
      }

      if (options.sort) {
        query = query.sort(options.sort)
      }

      if (options.limit) {
        query = query.limit(options.limit)
      }

      if (options.skip) {
        query = query.skip(options.skip)
      }

      if (options.select) {
        query = query.select(options.select)
      }

      if (options.lean) {
        query = query.lean()
      }

      if (options.session) {
        query = query.session(options.session)
      }

      return await query.exec()
    } catch (error) {
      logger.error('Find operation failed', { 
        model: this.model.modelName, 
        filter, 
        error 
      })
      throw new AppError('Database query failed', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Find one document
   */
  async findOne(
    filter: Record<string, any>,
    options: QueryOptions = {}
  ): Promise<TDocument | null> {
    try {
      let query = this.model.findOne(filter)

      if (options.populate) {
        query = query.populate(options.populate)
      }

      if (options.select) {
        query = query.select(options.select)
      }

      if (options.session) {
        query = query.session(options.session)
      }

      return await query.exec()
    } catch (error) {
      logger.error('FindOne operation failed', { 
        model: this.model.modelName, 
        filter, 
        error 
      })
      throw new AppError('Database query failed', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Find by ID
   */
  async findById(
    id: string,
    options: QueryOptions = {}
  ): Promise<TDocument | null> {
    try {
      let query = this.model.findById(id)

      if (options.populate) {
        query = query.populate(options.populate)
      }

      if (options.select) {
        query = query.select(options.select)
      }

      return await query.exec()
    } catch (error) {
      logger.error('FindById operation failed', { 
        model: this.model.modelName, 
        id, 
        error 
      })
      throw new AppError('Database query failed', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Create document
   */
  async create(
    data: Partial<TDocument>,
    options: { session?: ClientSession } = {}
  ): Promise<TDocument> {
    try {
      const [document] = await this.model.create([data], options)
      logger.debug('Document created', { 
        model: this.model.modelName, 
        id: document._id 
      })
      return document
    } catch (error) {
      logger.error('Create operation failed', { 
        model: this.model.modelName, 
        error 
      })
      throw new AppError('Failed to create document', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Update document
   */
  async updateById(
    id: string,
    update: Partial<TDocument>,
    options: { session?: ClientSession; new?: boolean } = {}
  ): Promise<TDocument | null> {
    try {
      const document = await this.model.findByIdAndUpdate(
        id,
        update,
        { new: true, ...options }
      )

      if (document) {
        logger.debug('Document updated', { 
          model: this.model.modelName, 
          id 
        })
      }

      return document
    } catch (error) {
      logger.error('Update operation failed', { 
        model: this.model.modelName, 
        id, 
        error 
      })
      throw new AppError('Failed to update document', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Delete document
   */
  async deleteById(
    id: string,
    options: { session?: ClientSession } = {}
  ): Promise<TDocument | null> {
    try {
      const document = await this.model.findByIdAndDelete(id, options)
      
      if (document) {
        logger.debug('Document deleted', { 
          model: this.model.modelName, 
          id 
        })
      }

      return document
    } catch (error) {
      logger.error('Delete operation failed', { 
        model: this.model.modelName, 
        id, 
        error 
      })
      throw new AppError('Failed to delete document', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Count documents
   */
  async count(filter: Record<string, any> = {}): Promise<number> {
    try {
      return await this.model.countDocuments(filter)
    } catch (error) {
      logger.error('Count operation failed', { 
        model: this.model.modelName, 
        filter, 
        error 
      })
      throw new AppError('Database query failed', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Paginated find
   */
  async paginate(
    filter: Record<string, any> = {},
    options: PaginationOptions = {}
  ): Promise<PaginationResult<TDocument>> {
    try {
      const page = Math.max(1, options.page || 1)
      const limit = Math.max(1, Math.min(100, options.limit || 10))
      const skip = (page - 1) * limit

      let query = this.model.find(filter)

      if (options.populate) {
        query = query.populate(options.populate)
      }

      if (options.sort) {
        query = query.sort(options.sort)
      }

      if (options.select) {
        query = query.select(options.select)
      }

      const [docs, totalDocs] = await Promise.all([
        query.skip(skip).limit(limit).exec(),
        this.model.countDocuments(filter)
      ])

      const totalPages = Math.ceil(totalDocs / limit)
      const hasNextPage = page < totalPages
      const hasPrevPage = page > 1

      return {
        docs,
        totalDocs,
        limit,
        page,
        totalPages,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null,
        pagingCounter: skip + 1
      }
    } catch (error) {
      logger.error('Pagination failed', { 
        model: this.model.modelName, 
        filter, 
        options, 
        error 
      })
      throw new AppError('Database query failed', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Execute aggregation pipeline
   */
  async aggregate<T = any>(pipeline: Record<string, any>[]): Promise<T[]> {
    try {
      const results = await this.model.aggregate(pipeline)
      return results
    } catch (error) {
      logger.error('Aggregation failed', { 
        model: this.model.modelName, 
        pipeline, 
        error 
      })
      throw new AppError('Database aggregation failed', 500, 'DATABASE_ERROR')
    }
  }

  /**
   * Bulk operations
   */
  async bulkWrite(
    operations: any[],
    options: { session?: ClientSession } = {}
  ): Promise<any> {
    try {
      const result = await this.model.bulkWrite(operations, options)
      
      logger.debug('Bulk write completed', {
        model: this.model.modelName,
        operations: operations.length,
        inserted: result.insertedCount,
        modified: result.modifiedCount,
        deleted: result.deletedCount
      })

      return result
    } catch (error) {
      logger.error('Bulk write failed', { 
        model: this.model.modelName, 
        operations: operations.length, 
        error 
      })
      throw new AppError('Bulk operation failed', 500, 'DATABASE_ERROR')
    }
  }
}

/**
 * Database health checker
 */
export class DatabaseHealthChecker {
  private db: DatabaseBase

  constructor() {
    this.db = new DatabaseBase()
  }

  /**
   * Comprehensive health check
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded'
    checks: Record<string, { status: boolean; message?: string; duration?: number }>
    overall: {
      uptime: number
      connections: number
      responseTime: number
    }
  }> {
    const checks: Record<string, { status: boolean; message?: string; duration?: number }> = {}
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy'

    // Connection check
    const startTime = Date.now()
    try {
      const isConnected = database.isConnected()
      checks.connection = {
        status: isConnected,
        message: isConnected ? 'Connected' : 'Not connected',
        duration: Date.now() - startTime
      }
      
      if (!isConnected) {
        overallStatus = 'unhealthy'
      }
    } catch (error: any) {
      checks.connection = {
        status: false,
        message: error.message,
        duration: Date.now() - startTime
      }
      overallStatus = 'unhealthy'
    }

    // Ping check
    const pingStart = Date.now()
    try {
      const pingSuccess = await database.ping()
      checks.ping = {
        status: pingSuccess,
        duration: Date.now() - pingStart
      }
      
      if (!pingSuccess && overallStatus === 'healthy') {
        overallStatus = 'degraded'
      }
    } catch (error: any) {
      checks.ping = {
        status: false,
        message: error.message,
        duration: Date.now() - pingStart
      }
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded'
      }
    }

    // Stats check
    try {
      const stats = await this.db.getDatabaseStats()
      checks.stats = {
        status: true,
        message: `Collections: ${stats.collections || 0}`
      }
    } catch (error: any) {
      checks.stats = {
        status: false,
        message: error.message
      }
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded'
      }
    }

    const dbStats = database.getStats()
    
    return {
      status: overallStatus,
      checks,
      overall: {
        uptime: dbStats.uptime,
        connections: dbStats.collections,
        responseTime: checks.ping?.duration || 0
      }
    }
  }
}

// Utility functions
export const createBaseRepository = <T extends BaseDocument>(
  model: Model<T>
): BaseRepository<T> => {
  return new BaseRepository(model)
}

export const withTransaction = async <T>(
  operations: (session: ClientSession) => Promise<T>
): Promise<T> => {
  const db = new DatabaseBase()
  return db.withTransaction(operations)
}

export const checkDatabaseHealth = async () => {
  const healthChecker = new DatabaseHealthChecker()
  return healthChecker.checkHealth()
}

// Export instances
export const databaseBase = new DatabaseBase()
export const healthChecker = new DatabaseHealthChecker()

// Common schema plugins
export const timestampPlugin = (schema: Schema) => {
  schema.add({
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  })

  schema.pre('save', function() {
    if (this.isModified() && !this.isNew) {
      this.updatedAt = new Date()
    }
  })

  schema.pre(['updateOne', 'findOneAndUpdate'], function() {
    this.set({ updatedAt: new Date() })
  })
}

export const softDeletePlugin = (schema: Schema) => {
  schema.add({
    deletedAt: {
      type: Date,
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false
    }
  })

  schema.methods.softDelete = function() {
    this.deletedAt = new Date()
    this.isDeleted = true
    return this.save()
  }

  schema.methods.restore = function() {
    this.deletedAt = null
    this.isDeleted = false
    return this.save()
  }

  // Modify queries to exclude soft-deleted documents by default
  schema.pre(/^find/, function() {
    if (!this.getQuery().includeDeleted) {
      this.where({ isDeleted: { $ne: true } })
    }
  })
}

export default DatabaseBase