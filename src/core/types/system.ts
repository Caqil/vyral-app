// System configuration and management types
export interface SystemConfig {
  id: string
  key: string
  value: any
  type: ConfigType
  category: ConfigCategory
  description?: string
  isPublic: boolean
  isRequired: boolean
  defaultValue?: any
  validation?: ConfigValidation
  updatedBy?: string
  updatedAt: Date
  createdAt: Date
}

export interface ConfigValidation {
  type: ValidationType
  min?: number
  max?: number
  pattern?: string
  options?: any[]
  custom?: string
}

export interface SystemInfo {
  version: string
  buildDate: string
  nodeVersion: string
  platform: string
  architecture: string
  environment: string
  uptime: number
  memory: MemoryInfo
  disk: DiskInfo
  database: DatabaseInfo
  plugins: PluginSystemInfo
  features: string[]
  maintenance: MaintenanceInfo
}

export interface MemoryInfo {
  total: number
  used: number
  available: number
  percentage: number
  heapUsed: number
  heapTotal: number
}

export interface DiskInfo {
  total: number
  used: number
  available: number
  percentage: number
}

export interface DatabaseInfo {
  type: string
  version?: string
  connected: boolean
  connectionCount: number
  responseTime: number
  size?: number
  collections?: number
  indexes?: number
}

export interface PluginSystemInfo {
  totalPlugins: number
  activePlugins: number
  systemPlugins: number
  userPlugins: number
  errorPlugins: number
  totalSize: number
  cacheSize: number
}

export interface MaintenanceInfo {
  isMaintenanceMode: boolean
  startTime?: Date
  endTime?: Date
  reason?: string
  allowedRoles?: string[]
  message?: string
}

// System health and monitoring
export interface HealthCheck {
  service: string
  status: HealthStatus
  responseTime: number
  message?: string
  details?: Record<string, any>
  timestamp: Date
}

export interface SystemHealth {
  overall: HealthStatus
  services: HealthCheck[]
  uptime: number
  lastCheck: Date
  issues: HealthIssue[]
}

export interface HealthIssue {
  service: string
  severity: IssueSeverity
  message: string
  timestamp: Date
  resolved: boolean
  resolvedAt?: Date
}

// System logging
export interface SystemLog {
  id: string
  level: LogLevel
  service: string
  message: string
  context?: Record<string, any>
  userId?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
  timestamp: Date
}

export interface LogQuery {
  level?: LogLevel[]
  service?: string[]
  userId?: string
  sessionId?: string
  startDate?: Date
  endDate?: Date
  message?: string
  limit?: number
  offset?: number
  sortBy?: LogSortBy
  sortOrder?: 'asc' | 'desc'
}

export interface LogSummary {
  totalLogs: number
  byLevel: Record<LogLevel, number>
  byService: Record<string, number>
  timeRange: {
    start: Date
    end: Date
  }
  topErrors: LogError[]
  trends: LogTrend[]
}

export interface LogError {
  message: string
  count: number
  service: string
  lastOccurred: Date
}

export interface LogTrend {
  period: string
  count: number
  level: LogLevel
}

// System analytics
export interface SystemAnalytics {
  users: UserAnalytics
  content: ContentAnalytics
  plugins: PluginAnalytics
  performance: PerformanceAnalytics
  errors: ErrorAnalytics
  security: SecurityAnalytics
}

export interface UserAnalytics {
  totalUsers: number
  activeUsers: number
  newUsers: number
  userGrowth: GrowthData[]
  userActivity: ActivityData[]
  userRetention: RetentionData[]
  usersByRole: Record<string, number>
  usersByProvider: Record<string, number>
}

export interface ContentAnalytics {
  totalPosts: number
  totalComments: number
  totalLikes: number
  totalShares: number
  contentGrowth: GrowthData[]
  contentEngagement: EngagementData[]
  topContent: ContentData[]
  contentByType: Record<string, number>
}

export interface PluginAnalytics {
  totalPlugins: number
  activePlugins: number
  pluginUsage: PluginUsageData[]
  pluginPerformance: PluginPerformanceData[]
  pluginErrors: PluginErrorData[]
  popularPlugins: PopularPluginData[]
}

export interface PerformanceAnalytics {
  averageResponseTime: number
  requestCount: number
  errorRate: number
  throughput: number
  performance: PerformanceData[]
  slowQueries: SlowQueryData[]
  resourceUsage: ResourceUsageData[]
}

export interface ErrorAnalytics {
  totalErrors: number
  errorRate: number
  errorsByType: Record<string, number>
  errorsByService: Record<string, number>
  errorTrends: ErrorTrendData[]
  criticalErrors: CriticalErrorData[]
}

export interface SecurityAnalytics {
  securityEvents: number
  failedLogins: number
  blockedRequests: number
  suspiciousActivity: SuspiciousActivityData[]
  vulnerabilities: VulnerabilityData[]
  securityTrends: SecurityTrendData[]
}

// Data types for analytics
export interface GrowthData {
  period: string
  value: number
  change?: number
  changePercent?: number
}

export interface ActivityData {
  period: string
  active: number
  total: number
  percentage: number
}

export interface RetentionData {
  cohort: string
  period: number
  retained: number
  total: number
  rate: number
}

export interface EngagementData {
  metric: string
  value: number
  trend: number
}

export interface ContentData {
  id: string
  type: string
  title: string
  engagement: number
  views: number
  createdAt: Date
}

export interface PluginUsageData {
  pluginId: string
  name: string
  usage: number
  users: number
  trend: number
}

export interface PluginPerformanceData {
  pluginId: string
  name: string
  responseTime: number
  errorRate: number
  memoryUsage: number
}

export interface PluginErrorData {
  pluginId: string
  name: string
  errors: number
  lastError: Date
  status: string
}

export interface PopularPluginData {
  pluginId: string
  name: string
  downloads: number
  rating: number
  reviews: number
}

export interface PerformanceData {
  timestamp: Date
  responseTime: number
  memoryUsage: number
  cpuUsage: number
  requestCount: number
}

export interface SlowQueryData {
  query: string
  duration: number
  count: number
  lastExecuted: Date
}

export interface ResourceUsageData {
  timestamp: Date
  cpu: number
  memory: number
  disk: number
  network: number
}

export interface ErrorTrendData {
  period: string
  count: number
  change: number
}

export interface CriticalErrorData {
  id: string
  message: string
  service: string
  count: number
  lastOccurred: Date
  resolved: boolean
}

export interface SuspiciousActivityData {
  type: string
  count: number
  severity: string
  lastDetected: Date
}

export interface VulnerabilityData {
  type: string
  severity: string
  count: number
  patched: number
  lastDetected: Date
}

export interface SecurityTrendData {
  period: string
  events: number
  blocked: number
  severity: string
}

// System tasks and jobs
export interface SystemTask {
  id: string
  name: string
  type: TaskType
  status: TaskStatus
  progress: number
  result?: any
  error?: string
  scheduledAt?: Date
  startedAt?: Date
  completedAt?: Date
  duration?: number
  createdBy?: string
  metadata?: Record<string, any>
}

export interface ScheduledJob {
  id: string
  name: string
  schedule: string
  enabled: boolean
  lastRun?: Date
  nextRun?: Date
  runCount: number
  failureCount: number
  lastResult?: any
  lastError?: string
  metadata?: Record<string, any>
}

// System notifications
export interface SystemNotification {
  id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  actions?: NotificationAction[]
  targetRoles?: string[]
  targetUsers?: string[]
  dismissible: boolean
  autoExpire: boolean
  expiresAt?: Date
  createdAt: Date
  readBy?: string[]
}

export interface NotificationAction {
  label: string
  action: string
  style?: 'primary' | 'secondary' | 'danger'
  url?: string
}

// System backups
export interface SystemBackup {
  id: string
  type: BackupType
  status: BackupStatus
  size: number
  location: string
  includes: string[]
  excludes: string[]
  startedAt: Date
  completedAt?: Date
  duration?: number
  error?: string
  metadata?: Record<string, any>
}

// Enums
export enum ConfigType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
  ARRAY = 'array',
  FILE = 'file',
}

export enum ConfigCategory {
  GENERAL = 'general',
  SECURITY = 'security',
  DATABASE = 'database',
  EMAIL = 'email',
  STORAGE = 'storage',
  PLUGINS = 'plugins',
  FEATURES = 'features',
  INTEGRATIONS = 'integrations',
}

export enum ValidationType {
  RANGE = 'range',
  PATTERN = 'pattern',
  OPTIONS = 'options',
  CUSTOM = 'custom',
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export enum LogSortBy {
  TIMESTAMP = 'timestamp',
  LEVEL = 'level',
  SERVICE = 'service',
  MESSAGE = 'message',
}

export enum TaskType {
  BACKUP = 'backup',
  MAINTENANCE = 'maintenance',
  MIGRATION = 'migration',
  PLUGIN_INSTALL = 'plugin_install',
  PLUGIN_UPDATE = 'plugin_update',
  CLEANUP = 'cleanup',
  EXPORT = 'export',
  IMPORT = 'import',
  CUSTOM = 'custom',
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  MAINTENANCE = 'maintenance',
  SECURITY = 'security',
  UPDATE = 'update',
}

export enum NotificationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum BackupType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  DATABASE = 'database',
  FILES = 'files',
  PLUGINS = 'plugins',
  CONFIG = 'config',
}

export enum BackupStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}