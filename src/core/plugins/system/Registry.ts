import { Plugin, PluginStatus, PluginCategory, PluginEvent, PluginEventType } from '@/core/plugins/types/plugin'
import { logger } from '@/core/lib/utils/logger'
import { EventEmitter } from 'events'
import * as fs from 'fs/promises'
import * as path from 'path'

export interface PluginRegistryEntry {
  plugin: Plugin
  state: PluginState
  dependencies: PluginDependencyNode[]
  dependents: string[]
  loadOrder: number
  lastActivity: Date
  metrics: PluginRegistryMetrics
  conflicts: PluginConflict[]
}

export interface PluginState {
  status: PluginStatus
  isLoaded: boolean
  isActive: boolean
  hasErrors: boolean
  errorCount: number
  lastError?: string
  lastErrorTime?: Date
  startTime?: Date
  uptime: number
  restartCount: number
  crashCount: number
  memoryUsage: number
  cpuUsage: number
  networkRequests: number
  databaseQueries: number
}

export interface PluginDependencyNode {
  pluginId: string
  version: string
  type: 'required' | 'optional'
  resolved: boolean
  resolvedVersion?: string
  circular: boolean
  depth: number
}

export interface PluginConflict {
  type: ConflictType
  conflictingPlugins: string[]
  severity: ConflictSeverity
  description: string
  resolution?: string
  canCoexist: boolean
  autoResolvable: boolean
}

export interface PluginRegistryMetrics {
  installDate: Date
  lastUpdateDate?: Date
  activationCount: number
  deactivationCount: number
  errorCount: number
  warningCount: number
  apiCallCount: number
  hookExecutionCount: number
  averageResponseTime: number
  totalExecutionTime: number
  memoryPeakUsage: number
  diskUsage: number
  userInteractions: number
  popularity: number
  reliability: number
  performance: number
}

export interface RegistryStats {
  totalPlugins: number
  activePlugins: number
  loadedPlugins: number
  errorPlugins: number
  systemPlugins: number
  userPlugins: number
  pluginsByCategory: Record<PluginCategory, number>
  pluginsByStatus: Record<PluginStatus, number>
  totalDependencies: number
  unresolvedDependencies: number
  circularDependencies: number
  totalConflicts: number
  resolvedConflicts: number
  averageLoadTime: number
  totalMemoryUsage: number
  registrySize: number
  lastUpdate: Date
}

export interface RegistryQuery {
  status?: PluginStatus[]
  category?: PluginCategory[]
  author?: string[]
  tags?: string[]
  hasErrors?: boolean
  isActive?: boolean
  installedAfter?: Date
  installedBefore?: Date
  search?: string
  sortBy?: 'name' | 'category' | 'installDate' | 'lastActivity' | 'popularity'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export enum ConflictType {
  API_COLLISION = 'api_collision',
  RESOURCE_CONFLICT = 'resource_conflict',
  DEPENDENCY_VERSION = 'dependency_version',
  PERMISSION_OVERLAP = 'permission_overlap',
  HOOK_COLLISION = 'hook_collision',
  NAMESPACE_COLLISION = 'namespace_collision',
  COMPATIBILITY = 'compatibility'
}

export enum ConflictSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export class PluginRegistry extends EventEmitter {
  private static instance: PluginRegistry
  private registry: Map<string, PluginRegistryEntry> = new Map()
  private dependencyGraph: Map<string, Set<string>> = new Map()
  private loadOrder: string[] = []
  private conflictResolver: ConflictResolver
  private persistencePath: string
  private watchTimer: NodeJS.Timeout | null = null
  private lastSaveTime: Date = new Date()
  private isDirty: boolean = false

  private constructor(persistencePath: string = './data/plugin-registry.json') {
    super()
    this.persistencePath = persistencePath
    this.conflictResolver = new ConflictResolver()
    this.startWatcher()
    this.loadFromPersistence()
  }

  public static getInstance(persistencePath?: string): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry(persistencePath)
    }
    return PluginRegistry.instance
  }

  /**
   * Register a plugin
   */
  public async registerPlugin(plugin: Plugin): Promise<boolean> {
    try {
      logger.info('Registering plugin', {
        pluginId: plugin.id,
        name: plugin.name,
        version: plugin.version,
        category: plugin.category
      })

      // Check if plugin already exists
      if (this.registry.has(plugin.id)) {
        logger.warn('Plugin already registered, updating', { pluginId: plugin.id })
        return await this.updatePlugin(plugin)
      }

      // Resolve dependencies
      const dependencies = await this.resolveDependencies(plugin)
      
      // Check for conflicts
      const conflicts = await this.detectConflicts(plugin)
      
      // Calculate load order
      const loadOrder = this.calculateLoadOrder(plugin.id, dependencies)

      // Create registry entry
      const entry: PluginRegistryEntry = {
        plugin,
        state: this.createInitialState(),
        dependencies,
        dependents: [],
        loadOrder,
        lastActivity: new Date(),
        metrics: this.createInitialMetrics(),
        conflicts
      }

      // Add to registry
      this.registry.set(plugin.id, entry)
      
      // Update dependency graph
      this.updateDependencyGraph(plugin.id, dependencies)
      
      // Update dependents
      this.updateDependents(plugin.id, dependencies)
      
      // Recalculate load order for all plugins
      this.recalculateLoadOrder()

      // Mark as dirty for persistence
      this.markDirty()

      // Emit event
      this.emit('plugin:registered', { plugin, entry })

      // Log conflicts if any
      if (conflicts.length > 0) {
        logger.warn('Plugin has conflicts', {
          pluginId: plugin.id,
          conflictCount: conflicts.length,
          conflicts: conflicts.map(c => ({ type: c.type, severity: c.severity }))
        })
      }

      logger.info('Plugin registered successfully', {
        pluginId: plugin.id,
        loadOrder,
        dependencyCount: dependencies.length,
        conflictCount: conflicts.length
      })

      return true
    } catch (error) {
      logger.error('Failed to register plugin', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('plugin:register_failed', { plugin, error })
      return false
    }
  }

  /**
   * Unregister a plugin
   */
  public async unregisterPlugin(pluginId: string): Promise<boolean> {
    try {
      const entry = this.registry.get(pluginId)
      if (!entry) {
        logger.warn('Plugin not found in registry', { pluginId })
        return false
      }

      // Check if plugin has dependents
      if (entry.dependents.length > 0) {
        logger.error('Cannot unregister plugin with dependents', {
          pluginId,
          dependents: entry.dependents
        })
        
        throw new Error(`Plugin has dependents: ${entry.dependents.join(', ')}`)
      }

      // Remove from registry
      this.registry.delete(pluginId)
      
      // Update dependency graph
      this.dependencyGraph.delete(pluginId)
      
      // Remove from dependents of dependencies
      this.removeDependentReferences(pluginId)
      
      // Recalculate load order
      this.recalculateLoadOrder()

      // Mark as dirty
      this.markDirty()

      // Emit event
      this.emit('plugin:unregistered', { pluginId, plugin: entry.plugin })

      logger.info('Plugin unregistered successfully', { pluginId })
      return true
    } catch (error) {
      logger.error('Failed to unregister plugin', {
        pluginId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('plugin:unregister_failed', { pluginId, error })
      return false
    }
  }

  /**
   * Update plugin information
   */
  public async updatePlugin(plugin: Plugin): Promise<boolean> {
    try {
      const entry = this.registry.get(plugin.id)
      if (!entry) {
        logger.warn('Plugin not found for update', { pluginId: plugin.id })
        return false
      }

      const oldVersion = entry.plugin.version
      const newVersion = plugin.version

      // Update plugin data
      entry.plugin = plugin
      entry.lastActivity = new Date()
      entry.metrics.lastUpdateDate = new Date()

      // Re-resolve dependencies if version changed
      if (oldVersion !== newVersion) {
        entry.dependencies = await this.resolveDependencies(plugin)
        this.updateDependencyGraph(plugin.id, entry.dependencies)
        this.updateDependents(plugin.id, entry.dependencies)
        
        // Re-check conflicts
        entry.conflicts = await this.detectConflicts(plugin)
        
        // Recalculate load order
        this.recalculateLoadOrder()
      }

      // Mark as dirty
      this.markDirty()

      // Emit event
      this.emit('plugin:updated', { 
        plugin, 
        entry, 
        versionChanged: oldVersion !== newVersion 
      })

      logger.info('Plugin updated successfully', {
        pluginId: plugin.id,
        oldVersion,
        newVersion,
        versionChanged: oldVersion !== newVersion
      })

      return true
    } catch (error) {
      logger.error('Failed to update plugin', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('plugin:update_failed', { plugin, error })
      return false
    }
  }

  /**
   * Get plugin by ID
   */
  public getPlugin(pluginId: string): Plugin | null {
    const entry = this.registry.get(pluginId)
    return entry ? entry.plugin : null
  }

  /**
   * Get plugin registry entry
   */
  public getPluginEntry(pluginId: string): PluginRegistryEntry | null {
    return this.registry.get(pluginId) || null
  }

  /**
   * Get all plugins
   */
  public getAllPlugins(): Plugin[] {
    return Array.from(this.registry.values()).map(entry => entry.plugin)
  }

  /**
   * Query plugins
   */
  public queryPlugins(query: RegistryQuery): Plugin[] {
    let results = Array.from(this.registry.values())

    // Apply filters
    if (query.status && query.status.length > 0) {
      results = results.filter(entry => query.status!.includes(entry.plugin.status))
    }

    if (query.category && query.category.length > 0) {
      results = results.filter(entry => query.category!.includes(entry.plugin.category))
    }

    if (query.author && query.author.length > 0) {
      results = results.filter(entry => query.author!.includes(entry.plugin.author))
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(entry => 
        query.tags!.some(tag => entry.plugin.tags.includes(tag))
      )
    }

    if (query.hasErrors !== undefined) {
      results = results.filter(entry => entry.state.hasErrors === query.hasErrors)
    }

    if (query.isActive !== undefined) {
      results = results.filter(entry => entry.state.isActive === query.isActive)
    }

    if (query.installedAfter) {
      results = results.filter(entry => entry.plugin.installedAt >= query.installedAfter!)
    }

    if (query.installedBefore) {
      results = results.filter(entry => entry.plugin.installedAt <= query.installedBefore!)
    }

    if (query.search) {
      const searchTerm = query.search.toLowerCase()
      results = results.filter(entry => 
        entry.plugin.name.toLowerCase().includes(searchTerm) ||
        entry.plugin.displayName.toLowerCase().includes(searchTerm) ||
        entry.plugin.description.toLowerCase().includes(searchTerm) ||
        entry.plugin.author.toLowerCase().includes(searchTerm) ||
        entry.plugin.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      )
    }

    // Sort results
    if (query.sortBy) {
      results.sort((a, b) => {
        let aValue: any, bValue: any

        switch (query.sortBy) {
          case 'name':
            aValue = a.plugin.name
            bValue = b.plugin.name
            break
          case 'category':
            aValue = a.plugin.category
            bValue = b.plugin.category
            break
          case 'installDate':
            aValue = a.plugin.installedAt
            bValue = b.plugin.installedAt
            break
          case 'lastActivity':
            aValue = a.lastActivity
            bValue = b.lastActivity
            break
          case 'popularity':
            aValue = a.metrics.popularity
            bValue = b.metrics.popularity
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
      results = results.slice(query.offset)
    }

    if (query.limit) {
      results = results.slice(0, query.limit)
    }

    return results.map(entry => entry.plugin)
  }

  /**
   * Get plugins in load order
   */
  public getPluginsInLoadOrder(): Plugin[] {
    const sortedEntries = Array.from(this.registry.values())
      .sort((a, b) => a.loadOrder - b.loadOrder)
    
    return sortedEntries.map(entry => entry.plugin)
  }

  /**
   * Get plugin dependencies
   */
  public getPluginDependencies(pluginId: string): PluginDependencyNode[] {
    const entry = this.registry.get(pluginId)
    return entry ? entry.dependencies : []
  }

  /**
   * Get plugin dependents
   */
  public getPluginDependents(pluginId: string): string[] {
    const entry = this.registry.get(pluginId)
    return entry ? entry.dependents : []
  }

  /**
   * Update plugin state
   */
  public updatePluginState(pluginId: string, stateUpdate: Partial<PluginState>): boolean {
    const entry = this.registry.get(pluginId)
    if (!entry) {
      return false
    }

    // Update state
    Object.assign(entry.state, stateUpdate)
    entry.lastActivity = new Date()

    // Update uptime if status changed to active
    if (stateUpdate.isActive === true && !entry.state.startTime) {
      entry.state.startTime = new Date()
    }

    // Calculate uptime
    if (entry.state.startTime) {
      entry.state.uptime = Date.now() - entry.state.startTime.getTime()
    }

    // Mark as dirty
    this.markDirty()

    // Emit event
    this.emit('plugin:state_updated', { pluginId, state: entry.state })

    return true
  }

  /**
   * Record plugin event
   */
  public recordPluginEvent(pluginId: string, event: PluginEvent): void {
    const entry = this.registry.get(pluginId)
    if (!entry) {
      logger.warn('Plugin not found for event recording', { pluginId })
      return
    }

    // Update metrics based on event
    this.updateMetricsFromEvent(entry, event)
    
    // Update last activity
    entry.lastActivity = new Date()

    // Mark as dirty
    this.markDirty()

    // Emit registry event
    this.emit('plugin:event_recorded', { pluginId, event })
  }

  /**
   * Get registry statistics
   */
  public getStats(): RegistryStats {
    const entries = Array.from(this.registry.values())
    
    const stats: RegistryStats = {
      totalPlugins: entries.length,
      activePlugins: entries.filter(e => e.state.isActive).length,
      loadedPlugins: entries.filter(e => e.state.isLoaded).length,
      errorPlugins: entries.filter(e => e.state.hasErrors).length,
      systemPlugins: entries.filter(e => e.plugin.isSystemPlugin).length,
      userPlugins: entries.filter(e => !e.plugin.isSystemPlugin).length,
      pluginsByCategory: {} as Record<PluginCategory, number>,
      pluginsByStatus: {} as Record<PluginStatus, number>,
      totalDependencies: entries.reduce((sum, e) => sum + e.dependencies.length, 0),
      unresolvedDependencies: entries.reduce((sum, e) => sum + e.dependencies.filter(d => !d.resolved).length, 0),
      circularDependencies: entries.reduce((sum, e) => sum + e.dependencies.filter(d => d.circular).length, 0),
      totalConflicts: entries.reduce((sum, e) => sum + e.conflicts.length, 0),
      resolvedConflicts: entries.reduce((sum, e) => sum + e.conflicts.filter(c => c.resolution).length, 0),
      averageLoadTime: entries.reduce((sum, e) => sum + e.metrics.averageResponseTime, 0) / entries.length || 0,
      totalMemoryUsage: entries.reduce((sum, e) => sum + e.state.memoryUsage, 0),
      registrySize: this.calculateRegistrySize(),
      lastUpdate: this.lastSaveTime
    }

    // Initialize category counters
    Object.values(PluginCategory).forEach(category => {
      stats.pluginsByCategory[category] = 0
    })

    // Initialize status counters
    Object.values(PluginStatus).forEach(status => {
      stats.pluginsByStatus[status] = 0
    })

    // Count by category and status
    entries.forEach(entry => {
      stats.pluginsByCategory[entry.plugin.category]++
      stats.pluginsByStatus[entry.plugin.status]++
    })

    return stats
  }

  /**
   * Validate registry integrity
   */
  public async validateIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = []
    
    try {
      // Check for circular dependencies
      const circularDeps = this.findCircularDependencies()
      if (circularDeps.length > 0) {
        issues.push(`Found ${circularDeps.length} circular dependencies`)
      }

      // Check for broken dependency references
      for (const [pluginId, entry] of this.registry.entries()) {
        for (const dep of entry.dependencies) {
          if (!this.registry.has(dep.pluginId)) {
            issues.push(`Plugin ${pluginId} depends on non-existent plugin ${dep.pluginId}`)
          }
        }

        for (const dependent of entry.dependents) {
          if (!this.registry.has(dependent)) {
            issues.push(`Plugin ${pluginId} has non-existent dependent ${dependent}`)
          }
        }
      }

      // Check for duplicate load orders
      const loadOrders = Array.from(this.registry.values()).map(e => e.loadOrder)
      const duplicates = loadOrders.filter((order, index) => loadOrders.indexOf(order) !== index)
      if (duplicates.length > 0) {
        issues.push(`Found duplicate load orders: ${duplicates.join(', ')}`)
      }

      // Check for plugin files existence
      for (const [pluginId, entry] of this.registry.entries()) {
        try {
          await fs.access(entry.plugin.installPath)
        } catch (error) {
          issues.push(`Plugin ${pluginId} install path does not exist: ${entry.plugin.installPath}`)
        }
      }

      return {
        valid: issues.length === 0,
        issues
      }
    } catch (error) {
      issues.push(`Integrity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return { valid: false, issues }
    }
  }

  /**
   * Export registry data
   */
  public exportRegistry(): any {
    const data = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      plugins: Array.from(this.registry.entries()).map(([id, entry]) => ({
        id,
        plugin: entry.plugin,
        state: entry.state,
        dependencies: entry.dependencies,
        dependents: entry.dependents,
        loadOrder: entry.loadOrder,
        lastActivity: entry.lastActivity.toISOString(),
        metrics: entry.metrics,
        conflicts: entry.conflicts
      }))
    }

    return data
  }

  /**
   * Import registry data
   */
  public async importRegistry(data: any): Promise<boolean> {
    try {
      if (!data || !data.plugins || !Array.isArray(data.plugins)) {
        throw new Error('Invalid registry data format')
      }

      // Clear current registry
      this.registry.clear()
      this.dependencyGraph.clear()
      this.loadOrder = []

      // Import plugins
      for (const pluginData of data.plugins) {
        const entry: PluginRegistryEntry = {
          plugin: pluginData.plugin,
          state: pluginData.state,
          dependencies: pluginData.dependencies,
          dependents: pluginData.dependents,
          loadOrder: pluginData.loadOrder,
          lastActivity: new Date(pluginData.lastActivity),
          metrics: pluginData.metrics,
          conflicts: pluginData.conflicts
        }

        this.registry.set(pluginData.id, entry)
      }

      // Rebuild dependency graph
      this.rebuildDependencyGraph()
      
      // Recalculate load order
      this.recalculateLoadOrder()

      // Mark as dirty
      this.markDirty()

      logger.info('Registry imported successfully', {
        pluginCount: data.plugins.length
      })

      this.emit('registry:imported', { pluginCount: data.plugins.length })
      return true
    } catch (error) {
      logger.error('Failed to import registry', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      this.emit('registry:import_failed', { error })
      return false
    }
  }

  // Private methods
  private async resolveDependencies(plugin: Plugin): Promise<PluginDependencyNode[]> {
    const dependencies: PluginDependencyNode[] = []
    
    if (!plugin.manifest.dependencies) {
      return dependencies
    }

    for (const dep of plugin.manifest.dependencies) {
      if (dep.type !== 'plugin') continue

      const node: PluginDependencyNode = {
        pluginId: dep.name,
        version: dep.version,
        type: dep.required ? 'required' : 'optional',
        resolved: false,
        circular: false,
        depth: 0
      }

      // Check if dependency is resolved
      const depEntry = this.registry.get(dep.name)
      if (depEntry) {
        node.resolved = true
        node.resolvedVersion = depEntry.plugin.version
        
        // Check for circular dependency
        node.circular = this.hasCircularDependency(plugin.id, dep.name)
      }

      dependencies.push(node)
    }

    return dependencies
  }

  private async detectConflicts(plugin: Plugin): Promise<PluginConflict[]> {
    return this.conflictResolver.detectConflicts(plugin, this.getAllPlugins())
  }

  private calculateLoadOrder(pluginId: string, dependencies: PluginDependencyNode[]): number {
    let maxDepOrder = 0
    
    for (const dep of dependencies) {
      if (dep.resolved && !dep.circular) {
        const depEntry = this.registry.get(dep.pluginId)
        if (depEntry) {
          maxDepOrder = Math.max(maxDepOrder, depEntry.loadOrder)
        }
      }
    }
    
    return maxDepOrder + 1
  }

  private createInitialState(): PluginState {
    return {
      status: PluginStatus.INSTALLED,
      isLoaded: false,
      isActive: false,
      hasErrors: false,
      errorCount: 0,
      uptime: 0,
      restartCount: 0,
      crashCount: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      networkRequests: 0,
      databaseQueries: 0
    }
  }

  private createInitialMetrics(): PluginRegistryMetrics {
    return {
      installDate: new Date(),
      activationCount: 0,
      deactivationCount: 0,
      errorCount: 0,
      warningCount: 0,
      apiCallCount: 0,
      hookExecutionCount: 0,
      averageResponseTime: 0,
      totalExecutionTime: 0,
      memoryPeakUsage: 0,
      diskUsage: 0,
      userInteractions: 0,
      popularity: 0,
      reliability: 100,
      performance: 100
    }
  }

  private updateDependencyGraph(pluginId: string, dependencies: PluginDependencyNode[]): void {
    const deps = new Set(dependencies.filter(d => d.resolved).map(d => d.pluginId))
    this.dependencyGraph.set(pluginId, deps)
  }

  private updateDependents(pluginId: string, dependencies: PluginDependencyNode[]): void {
    // Add this plugin as a dependent to its dependencies
    for (const dep of dependencies) {
      if (dep.resolved) {
        const depEntry = this.registry.get(dep.pluginId)
        if (depEntry && !depEntry.dependents.includes(pluginId)) {
          depEntry.dependents.push(pluginId)
        }
      }
    }
  }

  private removeDependentReferences(pluginId: string): void {
    for (const entry of this.registry.values()) {
      const index = entry.dependents.indexOf(pluginId)
      if (index > -1) {
        entry.dependents.splice(index, 1)
      }
    }
  }

  private recalculateLoadOrder(): void {
    const sorted = this.topologicalSort()
    
    sorted.forEach((pluginId, index) => {
      const entry = this.registry.get(pluginId)
      if (entry) {
        entry.loadOrder = index
      }
    })
  }

  private topologicalSort(): string[] {
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const sorted: string[] = []
    
    const visit = (pluginId: string) => {
      if (visiting.has(pluginId)) {
        // Circular dependency detected
        return
      }
      
      if (visited.has(pluginId)) {
        return
      }
      
      visiting.add(pluginId)
      
      const deps = this.dependencyGraph.get(pluginId) || new Set()
      for (const dep of deps) {
        visit(dep)
      }
      
      visiting.delete(pluginId)
      visited.add(pluginId)
      sorted.push(pluginId)
    }
    
    for (const pluginId of this.registry.keys()) {
      visit(pluginId)
    }
    
    return sorted
  }

  private hasCircularDependency(pluginId: string, targetId: string): boolean {
    const visited = new Set<string>()
    
    const hasPath = (from: string, to: string): boolean => {
      if (from === to) return true
      if (visited.has(from)) return false
      
      visited.add(from)
      
      const deps = this.dependencyGraph.get(from) || new Set()
      for (const dep of deps) {
        if (hasPath(dep, to)) {
          return true
        }
      }
      
      return false
    }
    
    return hasPath(targetId, pluginId)
  }

  private findCircularDependencies(): string[] {
    const cycles: string[] = []
    const visited = new Set<string>()
    const recStack = new Set<string>()
    
    const dfs = (pluginId: string): boolean => {
      visited.add(pluginId)
      recStack.add(pluginId)
      
      const deps = this.dependencyGraph.get(pluginId) || new Set()
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (dfs(dep)) {
            cycles.push(`${pluginId} -> ${dep}`)
            return true
          }
        } else if (recStack.has(dep)) {
          cycles.push(`${pluginId} -> ${dep}`)
          return true
        }
      }
      
      recStack.delete(pluginId)
      return false
    }
    
    for (const pluginId of this.registry.keys()) {
      if (!visited.has(pluginId)) {
        dfs(pluginId)
      }
    }
    
    return cycles
  }

  private rebuildDependencyGraph(): void {
    this.dependencyGraph.clear()
    
    for (const [pluginId, entry] of this.registry.entries()) {
      const deps = new Set(entry.dependencies.filter(d => d.resolved).map(d => d.pluginId))
      this.dependencyGraph.set(pluginId, deps)
    }
  }

  private updateMetricsFromEvent(entry: PluginRegistryEntry, event: PluginEvent): void {
    const metrics = entry.metrics
    
    switch (event.type) {
      case PluginEventType.ACTIVATED:
        metrics.activationCount++
        break
      case PluginEventType.DEACTIVATED:
        metrics.deactivationCount++
        break
      case PluginEventType.ERROR:
        metrics.errorCount++
        entry.state.hasErrors = true
        entry.state.errorCount++
        entry.state.lastError = event.data?.message || 'Unknown error'
        entry.state.lastErrorTime = event.timestamp
        break
    }
    
    // Update reliability score
    const totalEvents = metrics.activationCount + metrics.deactivationCount + metrics.errorCount
    if (totalEvents > 0) {
      metrics.reliability = ((totalEvents - metrics.errorCount) / totalEvents) * 100
    }
  }

  private calculateRegistrySize(): number {
    return JSON.stringify(this.exportRegistry()).length
  }

  private markDirty(): void {
    this.isDirty = true
  }

  private startWatcher(): void {
    this.watchTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveToPersistence()
      }
    }, 30000) // Save every 30 seconds if dirty
  }

  private stopWatcher(): void {
    if (this.watchTimer) {
      clearInterval(this.watchTimer)
      this.watchTimer = null
    }
  }

  private async loadFromPersistence(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistencePath, 'utf-8')
      const registryData = JSON.parse(data)
      await this.importRegistry(registryData)
      
      logger.info('Registry loaded from persistence', {
        path: this.persistencePath,
        pluginCount: this.registry.size
      })
    } catch (error) {
      logger.info('No existing registry found, starting fresh', {
        path: this.persistencePath
      })
    }
  }

  private async saveToPersistence(): Promise<void> {
    try {
      const data = JSON.stringify(this.exportRegistry(), null, 2)
      await fs.writeFile(this.persistencePath, data, 'utf-8')
      
      this.isDirty = false
      this.lastSaveTime = new Date()
      
      logger.debug('Registry saved to persistence', {
        path: this.persistencePath,
        size: data.length
      })
    } catch (error) {
      logger.error('Failed to save registry to persistence', {
        path: this.persistencePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Shutdown registry
   */
  public async shutdown(): Promise<void> {
    this.stopWatcher()
    
    if (this.isDirty) {
      await this.saveToPersistence()
    }
    
    this.registry.clear()
    this.dependencyGraph.clear()
    this.loadOrder = []
    this.removeAllListeners()
    
    logger.info('Plugin registry shutdown')
  }
}

class ConflictResolver {
  public detectConflicts(plugin: Plugin, existingPlugins: Plugin[]): PluginConflict[] {
    const conflicts: PluginConflict[] = []
    
    for (const existing of existingPlugins) {
      if (existing.id === plugin.id) continue
      
      // Check for API collisions
      if (this.hasAPICollision(plugin, existing)) {
        conflicts.push({
          type: ConflictType.API_COLLISION,
          conflictingPlugins: [plugin.id, existing.id],
          severity: ConflictSeverity.HIGH,
          description: `API route conflicts between ${plugin.name} and ${existing.name}`,
          canCoexist: false,
          autoResolvable: false
        })
      }
      
      // Check for namespace collisions
      if (this.hasNamespaceCollision(plugin, existing)) {
        conflicts.push({
          type: ConflictType.NAMESPACE_COLLISION,
          conflictingPlugins: [plugin.id, existing.id],
          severity: ConflictSeverity.MEDIUM,
          description: `Namespace conflicts between ${plugin.name} and ${existing.name}`,
          canCoexist: true,
          autoResolvable: true,
          resolution: 'Use plugin-specific namespaces'
        })
      }
    }
    
    return conflicts
  }
  
  private hasAPICollision(plugin1: Plugin, plugin2: Plugin): boolean {
    if (!plugin1.manifest.api?.routes || !plugin2.manifest.api?.routes) {
      return false
    }
    
    const routes1 = plugin1.manifest.api.routes.map(r => `${r.method}:${r.path}`)
    const routes2 = plugin2.manifest.api.routes.map(r => `${r.method}:${r.path}`)
    
    return routes1.some(route => routes2.includes(route))
  }
  
  private hasNamespaceCollision(plugin1: Plugin, plugin2: Plugin): boolean {
    return plugin1.name === plugin2.name || plugin1.displayName === plugin2.displayName
  }
}