import { UserRole } from './auth'

// Core plugin interfaces
export interface Plugin {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  authorEmail?: string
  website?: string
  repository?: string
  license: string
  category: PluginCategory
  tags: string[]
  manifest: PluginManifest
  status: PluginStatus
  isSystemPlugin: boolean
  installPath: string
  size: number
  downloadCount: number
  rating: number
  reviewCount: number
  installedAt: Date
  updatedAt: Date
  lastActivatedAt?: Date
}

export interface PluginManifest {
  version: string
  name: string
  displayName: string
  description: string
  author: string
  license: string
  category: PluginCategory
  tags: string[]
  main: string
  api?: PluginAPIConfig
  ui?: PluginUIConfig
  hooks?: PluginHooks
  permissions?: PluginPermission[]
  dependencies?: PluginDependency[]
  settings?: PluginSetting[]
  assets?: PluginAsset[]
  database?: PluginDatabaseConfig
  requirements?: PluginRequirements
  metadata?: Record<string, any>
}

export interface PluginAPIConfig {
  routes: PluginRoute[]
  middleware?: string[]
  rateLimit?: PluginRateLimit
}

export interface PluginRoute {
  method: HTTPMethod
  path: string
  handler: string
  middleware?: string[]
  permissions?: string[]
  rateLimit?: PluginRateLimit
  description?: string
}

export interface PluginUIConfig {
  components: PluginComponent[]
  pages?: PluginPage[]
  hooks: PluginUIHook[]
  styles?: string[]
  assets?: string[]
}

export interface PluginComponent {
  name: string
  file: string
  props?: PluginComponentProp[]
  slots?: string[]
  description?: string
}

export interface PluginComponentProp {
  name: string
  type: string
  required: boolean
  default?: any
  description?: string
}

export interface PluginPage {
  path: string
  component: string
  title?: string
  description?: string
  permissions?: string[]
}

export interface PluginUIHook {
  name: string
  handler: string
  priority?: number
  conditions?: PluginCondition[]
}

export interface PluginHooks {
  api?: string[]
  ui?: string[]
  system?: string[]
  user?: string[]
  content?: string[]
  custom?: Record<string, string>
}

export interface PluginPermission {
  name: string
  description: string
  scope: PermissionScope
  required: boolean
  dangerous?: boolean
}

export interface PluginDependency {
  name: string
  version: string
  type: DependencyType
  required: boolean
}

export interface PluginSetting {
  key: string
  name: string
  description: string
  type: SettingType
  default?: any
  required: boolean
  options?: PluginSettingOption[]
  validation?: PluginSettingValidation
  group?: string
}

export interface PluginSettingOption {
  label: string
  value: any
  description?: string
}

export interface PluginSettingValidation {
  min?: number
  max?: number
  pattern?: string
  custom?: string
}

export interface PluginAsset {
  type: AssetType
  path: string
  publicPath?: string
  inline?: boolean
}

export interface PluginDatabaseConfig {
  models?: PluginModel[]
  migrations?: string[]
  seeders?: string[]
}

export interface PluginModel {
  name: string
  file: string
  collection?: string
}

export interface PluginRequirements {
  nodeVersion?: string
  platformVersion?: string
  plugins?: string[]
  features?: string[]
}

export interface PluginRateLimit {
  windowMs: number
  maxRequests: number
  message?: string
}

export interface PluginCondition {
  type: ConditionType
  value: any
  operator?: ComparisonOperator
}

// Plugin state and configuration
export interface PluginConfig {
  id: string
  pluginId: string
  settings: Record<string, any>
  isActive: boolean
  userId?: string
  createdAt: Date
  updatedAt: Date
}

export interface PluginData {
  id: string
  pluginId: string
  key: string
  value: any
  userId?: string
  isGlobal: boolean
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface PluginLog {
  id: string
  pluginId: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  userId?: string
  timestamp: Date
}

export interface PluginError {
  id: string
  pluginId: string
  error: string
  stack?: string
  context?: Record<string, any>
  userId?: string
  resolved: boolean
  timestamp: Date
}

// Plugin marketplace
export interface PluginMarketplace {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: PluginCategory
  tags: string[]
  price: number
  currency: string
  downloadUrl: string
  screenshots: string[]
  documentation: string
  changelog: string
  rating: number
  reviewCount: number
  downloadCount: number
  verified: boolean
  featured: boolean
  publishedAt: Date
  updatedAt: Date
}

export interface PluginReview {
  id: string
  pluginId: string
  userId: string
  rating: number
  title?: string
  comment?: string
  version: string
  helpful: number
  verified: boolean
  createdAt: Date
  updatedAt: Date
}

// Plugin management
export interface PluginInstallRequest {
  source: PluginSource
  url?: string
  file?: File | Buffer
  config?: Record<string, any>
  autoActivate?: boolean
}

export interface PluginInstallResponse {
  success: boolean
  plugin?: Plugin
  errors?: string[]
  warnings?: string[]
}

export interface PluginUpdateRequest {
  pluginId: string
  version?: string
  force?: boolean
  backup?: boolean
}

export interface PluginBackup {
  id: string
  pluginId: string
  version: string
  config: Record<string, any>
  data: Record<string, any>
  createdAt: Date
}

// Plugin security
export interface PluginSecurity {
  id: string
  pluginId: string
  scanResults: SecurityScanResult[]
  riskLevel: SecurityRiskLevel
  lastScanned: Date
  approved: boolean
  approvedBy?: string
  approvedAt?: Date
}

export interface SecurityScanResult {
  type: SecurityScanType
  severity: SecuritySeverity
  message: string
  file?: string
  line?: number
  recommendation?: string
}

// Enums
export enum PluginStatus {
  INSTALLED = 'installed',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  UPDATING = 'updating',
  UNINSTALLING = 'uninstalling',
}

export enum PluginCategory {
  SOCIAL = 'social',
  MEDIA = 'media',
  COMMUNICATION = 'communication',
  PRODUCTIVITY = 'productivity',
  ENTERTAINMENT = 'entertainment',
  BUSINESS = 'business',
  UTILITY = 'utility',
  ANALYTICS = 'analytics',
  SECURITY = 'security',
  INTEGRATION = 'integration',
  THEME = 'theme',
  EXTENSION = 'extension',
}

export enum HTTPMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

export enum PermissionScope {
  SYSTEM = 'system',
  USER = 'user',
  CONTENT = 'content',
  API = 'api',
  DATABASE = 'database',
  FILE = 'file',
  NETWORK = 'network',
}

export enum DependencyType {
  PLUGIN = 'plugin',
  NPM = 'npm',
  SYSTEM = 'system',
  FEATURE = 'feature',
}

export enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  MULTISELECT = 'multiselect',
  TEXTAREA = 'textarea',
  PASSWORD = 'password',
  FILE = 'file',
  COLOR = 'color',
  DATE = 'date',
  URL = 'url',
  EMAIL = 'email',
  JSON = 'json',
}

export enum AssetType {
  CSS = 'css',
  JS = 'js',
  IMAGE = 'image',
  FONT = 'font',
  ICON = 'icon',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
}

export enum ConditionType {
  USER_ROLE = 'user_role',
  USER_PERMISSION = 'user_permission',
  PLUGIN_ACTIVE = 'plugin_active',
  SETTING_VALUE = 'setting_value',
  CUSTOM = 'custom',
}

export enum ComparisonOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IN = 'in',
  NOT_IN = 'not_in',
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export enum PluginSource {
  MARKETPLACE = 'marketplace',
  URL = 'url',
  FILE = 'file',
  GITHUB = 'github',
  LOCAL = 'local',
}

export enum SecurityRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum SecurityScanType {
  MALWARE = 'malware',
  VULNERABILITY = 'vulnerability',
  PERMISSION = 'permission',
  CODE_QUALITY = 'code_quality',
  DEPENDENCY = 'dependency',
  RESOURCE = 'resource',
}

export enum SecuritySeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Plugin hooks for extensibility
export interface PluginSystemHooks {
  beforeInstall?: (plugin: Plugin) => Promise<boolean>
  afterInstall?: (plugin: Plugin) => Promise<void>
  beforeUninstall?: (pluginId: string) => Promise<boolean>
  afterUninstall?: (pluginId: string) => Promise<void>
  beforeActivate?: (pluginId: string) => Promise<boolean>
  afterActivate?: (plugin: Plugin) => Promise<void>
  beforeDeactivate?: (pluginId: string) => Promise<boolean>
  afterDeactivate?: (pluginId: string) => Promise<void>
  beforeUpdate?: (pluginId: string, version: string) => Promise<boolean>
  afterUpdate?: (plugin: Plugin, previousVersion: string) => Promise<void>
  onError?: (pluginId: string, error: Error) => Promise<void>
  onSettingsChange?: (pluginId: string, settings: Record<string, any>) => Promise<void>
}