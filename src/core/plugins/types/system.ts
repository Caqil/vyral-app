import { UserRole } from '@/core/types/auth'
import { LogLevel, HealthStatus } from '@/core/types/system'
import { Plugin, PluginStatus, PluginCategory, PluginEvent } from './plugin'

// Plugin System Configuration
export interface PluginSystemConfig {
  enabled: boolean
  autoInstallSystem: boolean
  allowThirdParty: boolean
  maxPlugins: number
  maxPluginSize: number
  securityScan: boolean
  sandboxMode: boolean
  debugMode: boolean
  logLevel: LogLevel
  pluginsPath: string
  systemPluginsPath: string
  tempPath: string
  timeout: number
  retryAttempts: number
  healthCheckInterval: number
  enableAnalytics: boolean
  enableMarketplace: boolean
  marketplace: PluginMarketplaceConfig
  security: PluginSecurityConfig
  performance: PluginPerformanceConfig
}

// Plugin Marketplace Configuration
export interface PluginMarketplaceConfig {
  enabled: boolean
  url: string
  apiKey?: string
  autoUpdate: boolean
  updateInterval: number
  verifiedOnly: boolean
  categories: PluginCategory[]
  allowedLicenses: string[]
  blockedPlugins: string[]
  cacheTimeout: number
}

// Plugin Security Configuration
export interface PluginSecurityConfig {
  enabled: boolean
  scanOnInstall: boolean
  scanOnUpdate: boolean
  virusScanning: boolean
  vulnerabilityChecking: boolean
  permissionAuditing: boolean
  quarantineEnabled: boolean
  allowedFileTypes: string[]
  maxFileSize: number
}

// Plugin Performance Configuration
export interface PluginPerformanceConfig {
  monitoring: boolean
  profiling: boolean
  caching: PluginCachingConfig
  lazyLoading: boolean
  preloading: string[]
  memoryOptimization: boolean
  cpuOptimization: boolean
}

export interface PluginCachingConfig {
  enabled: boolean
  strategy: CachingStrategy
  ttl: number
  maxSize: number
  compression: boolean
}

// Plugin System State
export interface PluginSystemState {
  initialized: boolean
  running: boolean
  status: SystemStatus
  config: PluginSystemConfig
  plugins: Map<string, Plugin>
  registry: PluginRegistry
  events: PluginEvent[]
  metrics: SystemMetrics
  health: SystemHealth
  errors: SystemError[]
  lastUpdate: Date
  uptime: number
  version: string
}

export interface PluginRegistry {
  total: number
  active: number
  inactive: number
  system: number
  user: number
  byCategory: Record<PluginCategory, number>
  byStatus: Record<PluginStatus, number>
  dependencies: Map<string, string[]>
}

export interface SystemMetrics {
  performance: SystemPerformanceMetrics
  resources: SystemResourceMetrics
  operations: SystemOperationMetrics
  timestamp: Date
}

export interface SystemPerformanceMetrics {
  startupTime: number
  responseTime: number
  throughput: number
  availability: number
}

export interface SystemResourceMetrics {
  memory: ResourceUsage
  cpu: ResourceUsage
  disk: ResourceUsage
  network: ResourceUsage
}

export interface ResourceUsage {
  used: number
  total: number
  percentage: number
}

export interface SystemOperationMetrics {
  installs: number
  uninstalls: number
  activations: number
  deactivations: number
  updates: number
  errors: number
}

export interface SystemHealth {
  overall: HealthStatus
  components: ComponentHealth[]
  issues: SystemIssue[]
  uptime: number
  lastCheck: Date
}

export interface ComponentHealth {
  name: string
  status: HealthStatus
  message?: string
  lastCheck: Date
}

export interface SystemIssue {
  type: IssueType
  severity: IssueSeverity
  component: string
  message: string
  timestamp: Date
  resolved: boolean
}

export interface SystemError {
  id: string
  type: SystemErrorType
  message: string
  stack?: string
  component: string
  timestamp: Date
  resolved: boolean
}

// Enums
export enum CachingStrategy {
  LRU = 'lru',
  LFU = 'lfu',
  FIFO = 'fifo',
  TTL = 'ttl'
}

export enum SystemStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  MAINTENANCE = 'maintenance'
}

export enum IssueType {
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  STABILITY = 'stability',
  CONFIGURATION = 'configuration'
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum SystemErrorType {
  INITIALIZATION = 'initialization',
  CONFIGURATION = 'configuration',
  RUNTIME = 'runtime',
  RESOURCE = 'resource',
  NETWORK = 'network',
  DATABASE = 'database',
  SECURITY = 'security',
  PLUGIN = 'plugin'
}

// Plugin System Manager Interface
export interface PluginSystemManager {
  initialize: (config: PluginSystemConfig) => Promise<boolean>
  start: () => Promise<boolean>
  stop: () => Promise<boolean>
  restart: () => Promise<boolean>
  getState: () => PluginSystemState
  getConfig: () => PluginSystemConfig
  updateConfig: (config: Partial<PluginSystemConfig>) => Promise<boolean>
  getHealth: () => SystemHealth
  getMetrics: () => SystemMetrics
  getEvents: (limit?: number) => PluginEvent[]
  clearEvents: () => Promise<boolean>
  getErrors: (limit?: number) => SystemError[]
  clearErrors: () => Promise<boolean>
  backup: (destination?: string) => Promise<string>
  restore: (backup: string) => Promise<boolean>
  cleanup: () => Promise<boolean>
}