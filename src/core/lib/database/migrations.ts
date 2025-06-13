import mongoose, { Schema, Model } from 'mongoose'
import { promises as fs } from 'fs'
import path from 'path'
import { logger } from '@/core/lib/utils/logger'
import { database } from './connection'

export interface MigrationDefinition {
  version: string
  name: string
  description?: string
  type: 'system' | 'plugin'
  pluginId?: string
  up: (db: mongoose.Connection) => Promise<void>
  down: (db: mongoose.Connection) => Promise<void>
  dependencies?: string[]
  requiresBackup?: boolean
  estimatedDuration?: number
  breaking?: boolean
}

export interface IMigration {
  version: string
  name: string
  description?: string
  type: 'system' | 'plugin'
  pluginId?: string
  appliedAt: Date
  executionTime: number
  checksum: string
  rollbackAvailable: boolean
  dependencies: string[]
  metadata?: Record<string, any>
}

export interface MigrationDocument extends IMigration, mongoose.Document {}

export interface MigrationModel extends Model<MigrationDocument> {
  findByVersion(version: string): Promise<MigrationDocument | null>
  findByPlugin(pluginId: string): Promise<MigrationDocument[]>
  findPending(availableMigrations: MigrationDefinition[]): Promise<MigrationDefinition[]>
  getLastApplied(): Promise<MigrationDocument | null>
  isApplied(version: string): Promise<boolean>
}

const MigrationSchema = new Schema<MigrationDocument>({
  version: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['system', 'plugin'],
    required: true,
    default: 'system'
  },
  pluginId: {
    type: String,
    sparse: true,
    index: true
  },
  appliedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  executionTime: {
    type: Number,
    required: true,
    default: 0
  },
  checksum: {
    type: String,
    required: true
  },
  rollbackAvailable: {
    type: Boolean,
    default: true
  },
  dependencies: [{
    type: String
  }],
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'migrations'
})

// Indexes
MigrationSchema.index({ version: 1 })
MigrationSchema.index({ type: 1, pluginId: 1 })
MigrationSchema.index({ appliedAt: -1 })

// Static methods
MigrationSchema.statics.findByVersion = function(version: string) {
  return this.findOne({ version })
}

MigrationSchema.statics.findByPlugin = function(pluginId: string) {
  return this.find({ pluginId }).sort({ appliedAt: 1 })
}

MigrationSchema.statics.findPending = async function(availableMigrations: MigrationDefinition[]) {
  const appliedMigrations = await this.find({}, { version: 1 })
  const appliedVersions = new Set(appliedMigrations.map((m: { version: any }) => m.version))
  
  return availableMigrations.filter(migration => !appliedVersions.has(migration.version))
}

MigrationSchema.statics.getLastApplied = function() {
  return this.findOne().sort({ appliedAt: -1 })
}

MigrationSchema.statics.isApplied = async function(version: string) {
  const migration = await this.findOne({ version })
  return !!migration
}

export const Migration = mongoose.model<MigrationDocument, MigrationModel>('Migration', MigrationSchema)

export class MigrationRunner {
  private migrations: Map<string, MigrationDefinition> = new Map()
  private migrationsPath: string

  constructor(migrationsPath: string = 'migrations') {
    this.migrationsPath = migrationsPath
  }

  /**
   * Register a migration
   */
  register(migration: MigrationDefinition): void {
    if (this.migrations.has(migration.version)) {
      throw new Error(`Migration ${migration.version} is already registered`)
    }

    this.migrations.set(migration.version, migration)
    logger.debug('Migration registered', { 
      version: migration.version, 
      name: migration.name,
      type: migration.type,
      pluginId: migration.pluginId
    })
  }

  /**
   * Load migrations from directory
   */
  async loadMigrationsFromDirectory(dirPath: string = this.migrationsPath): Promise<void> {
    try {
      const fullPath = path.resolve(dirPath)
      const exists = await fs.access(fullPath).then(() => true).catch(() => false)
      
      if (!exists) {
        logger.warn('Migrations directory not found', { path: fullPath })
        return
      }

      const files = await fs.readdir(fullPath)
      const migrationFiles = files.filter(file => 
        file.endsWith('.js') || file.endsWith('.ts')
      ).sort()

      for (const file of migrationFiles) {
        try {
          const filePath = path.join(fullPath, file)
          const migrationModule = await import(filePath)
          
          if (migrationModule.default) {
            this.register(migrationModule.default)
          } else if (migrationModule.migration) {
            this.register(migrationModule.migration)
          } else {
            logger.warn('Migration file does not export a migration', { file })
          }
        } catch (error) {
          logger.error('Failed to load migration file', { file, error })
        }
      }

      logger.info('Loaded migrations from directory', { 
        path: fullPath, 
        count: migrationFiles.length 
      })
    } catch (error) {
      logger.error('Failed to load migrations directory', { path: dirPath, error })
    }
  }

  /**
   * Get all registered migrations
   */
  getMigrations(): MigrationDefinition[] {
    return Array.from(this.migrations.values()).sort((a, b) => a.version.localeCompare(b.version))
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<MigrationDefinition[]> {
    const allMigrations = this.getMigrations()
    return await Migration.findPending(allMigrations)
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    const pendingMigrations = await this.getPendingMigrations()
    
    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations')
      return
    }

    logger.info('Running pending migrations', { count: pendingMigrations.length })

    for (const migration of pendingMigrations) {
      await this.runMigration(migration)
    }

    logger.info('All pending migrations completed successfully')
  }

  /**
   * Run a specific migration
   */
  async runMigration(migration: MigrationDefinition): Promise<void> {
    if (!database.isConnected()) {
      throw new Error('Database not connected')
    }

    // Check if migration is already applied
    const isApplied = await Migration.isApplied(migration.version)
    if (isApplied) {
      logger.warn('Migration already applied', { version: migration.version })
      return
    }

    // Check dependencies
    await this.checkDependencies(migration)

    logger.info('Running migration', {
      version: migration.version,
      name: migration.name,
      type: migration.type,
      pluginId: migration.pluginId
    })

    const startTime = Date.now()
    const connection = database.getConnection()
    
    if (!connection) {
      throw new Error('Database connection not available')
    }

    try {
      // Create backup if required
      if (migration.requiresBackup) {
        await this.createBackup(migration)
      }

      // Run the migration
      await migration.up(connection)

      // Record migration as applied
      const executionTime = Date.now() - startTime
      const checksum = this.calculateChecksum(migration)

      await Migration.create({
        version: migration.version,
        name: migration.name,
        description: migration.description,
        type: migration.type,
        pluginId: migration.pluginId,
        appliedAt: new Date(),
        executionTime,
        checksum,
        rollbackAvailable: !!migration.down,
        dependencies: migration.dependencies || [],
        metadata: {
          estimatedDuration: migration.estimatedDuration,
          breaking: migration.breaking
        }
      })

      logger.info('Migration completed successfully', {
        version: migration.version,
        executionTime,
        name: migration.name
      })

    } catch (error: any) {
      logger.error('Migration failed', {
        version: migration.version,
        name: migration.name,
        error: error.message,
        executionTime: Date.now() - startTime
      })

      // Attempt rollback if possible
      if (migration.down) {
        try {
          logger.info('Attempting rollback', { version: migration.version })
          await migration.down(connection)
          logger.info('Rollback completed', { version: migration.version })
        } catch (rollbackError: any) {
          logger.error('Rollback failed', {
            version: migration.version,
            error: rollbackError.message
          })
        }
      }

      throw error
    }
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(version: string): Promise<void> {
    const migrationRecord = await Migration.findByVersion(version)
    if (!migrationRecord) {
      throw new Error(`Migration ${version} not found in database`)
    }

    if (!migrationRecord.rollbackAvailable) {
      throw new Error(`Migration ${version} does not support rollback`)
    }

    const migration = this.migrations.get(version)
    if (!migration || !migration.down) {
      throw new Error(`Migration ${version} rollback function not available`)
    }

    logger.info('Rolling back migration', { version, name: migration.name })

    const connection = database.getConnection()
    if (!connection) {
      throw new Error('Database connection not available')
    }

    try {
      await migration.down(connection)
      await Migration.deleteOne({ version })
      
      logger.info('Migration rolled back successfully', { version })
    } catch (error: any) {
      logger.error('Migration rollback failed', { version, error: error.message })
      throw error
    }
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<{
    total: number
    applied: number
    pending: number
    lastApplied?: string
    migrations: Array<{
      version: string
      name: string
      status: 'applied' | 'pending'
      appliedAt?: Date
      type: string
      pluginId?: string
    }>
  }> {
    const allMigrations = this.getMigrations()
    const appliedMigrations = await Migration.find().sort({ appliedAt: 1 })
    const appliedVersions = new Set(appliedMigrations.map(m => m.version))
    
    const migrations = allMigrations.map(migration => {
      const applied = appliedMigrations.find(m => m.version === migration.version)
      return {
        version: migration.version,
        name: migration.name,
        status: appliedVersions.has(migration.version) ? 'applied' as const : 'pending' as const,
        appliedAt: applied?.appliedAt,
        type: migration.type,
        pluginId: migration.pluginId
      }
    })

    const lastApplied = appliedMigrations.length > 0 
      ? appliedMigrations[appliedMigrations.length - 1].version 
      : undefined

    return {
      total: allMigrations.length,
      applied: appliedMigrations.length,
      pending: allMigrations.length - appliedMigrations.length,
      lastApplied,
      migrations
    }
  }

  /**
   * Check migration dependencies
   */
  private async checkDependencies(migration: MigrationDefinition): Promise<void> {
    if (!migration.dependencies || migration.dependencies.length === 0) {
      return
    }

    for (const dependency of migration.dependencies) {
      const isApplied = await Migration.isApplied(dependency)
      if (!isApplied) {
        throw new Error(`Migration ${migration.version} depends on ${dependency} which is not applied`)
      }
    }
  }

  /**
   * Calculate migration checksum
   */
  private calculateChecksum(migration: MigrationDefinition): string {
    const crypto = require('crypto')
    const content = `${migration.version}:${migration.name}:${migration.type}:${migration.pluginId || ''}`
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Create backup before migration
   */
  private async createBackup(migration: MigrationDefinition): Promise<void> {
    logger.info('Creating backup for migration', { version: migration.version })
    // Implementation would depend on backup strategy
    // This is a placeholder for actual backup implementation
  }
}

// Default migration runner instance
export const migrationRunner = new MigrationRunner()

// Utility functions
export const createMigration = (migration: MigrationDefinition): MigrationDefinition => {
  return migration
}

export const runMigrations = async (migrationsPath?: string): Promise<void> => {
  if (migrationsPath) {
    await migrationRunner.loadMigrationsFromDirectory(migrationsPath)
  }
  await migrationRunner.runPendingMigrations()
}

export const getMigrationStatus = () => migrationRunner.getStatus()

export const rollbackMigration = (version: string) => migrationRunner.rollbackMigration(version)

// Plugin-specific migration helpers
export const createPluginMigration = (
  pluginId: string,
  version: string,
  name: string,
  up: (db: mongoose.Connection) => Promise<void>,
  down?: (db: mongoose.Connection) => Promise<void>
): MigrationDefinition => {
  return {
    version: `${pluginId}:${version}`,
    name,
    type: 'plugin',
    pluginId,
    up,
    down: down || (async () => {
      logger.warn('No rollback function provided for plugin migration', { pluginId, version })
    })
  }
}

export const runPluginMigrations = async (pluginId: string): Promise<void> => {
  const allMigrations = migrationRunner.getMigrations()
  const pluginMigrations = allMigrations.filter(m => m.pluginId === pluginId)
  
  for (const migration of pluginMigrations) {
    const isApplied = await Migration.isApplied(migration.version)
    if (!isApplied) {
      await migrationRunner.runMigration(migration)
    }
  }
}

export const rollbackPluginMigrations = async (pluginId: string): Promise<void> => {
  const appliedMigrations = await Migration.findByPlugin(pluginId)
  
  // Rollback in reverse order
  for (let i = appliedMigrations.length - 1; i >= 0; i--) {
    const migration = appliedMigrations[i]
    await migrationRunner.rollbackMigration(migration.version)
  }
}

export default migrationRunner