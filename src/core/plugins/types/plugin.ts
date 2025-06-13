import { UserRole } from '@/core/types/auth'
import { PluginAPIConfig } from './api'
import { PluginHookConfiguration } from './hook'
import { PluginUIConfig } from './ui'

// Core Plugin Types
export interface Plugin {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  license: string
  category: PluginCategory
  tags: string[]
  manifest: PluginManifest
  status: PluginStatus
  isSystemPlugin: boolean
  installPath: string
  size: number
  installedAt: Date
  updatedAt: Date
  lastActivatedAt?: Date
}

// Plugin Manifest
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
  hooks?: PluginHookConfiguration
  permissions?: PluginPermission[]
  dependencies?: PluginDependency[]
  settings?: PluginSetting[]
  requirements?: PluginRequirements
}

// Plugin Permissions
export interface PluginPermission {
  name: string
  description: string
  scope: PermissionScope
  required: boolean
  dangerous?: boolean
}

// Plugin Dependencies
export interface PluginDependency {
  name: string
  version: string
  type: DependencyType
  required: boolean
}

// Plugin Settings
export interface PluginSetting {
  key: string
  name: string
  description: string
  type: SettingType
  default?: any
  required: boolean
  options?: PluginSettingOption[]
  validation?: PluginSettingValidation
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
  required?: boolean
  message?: string
}

// Plugin Requirements
export interface PluginRequirements {
  nodeVersion?: string
  platformVersion?: string
  plugins?: string[]
  features?: string[]
  permissions?: string[]
}

// Plugin State Management
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

// Plugin Errors and Logging
export interface PluginError {
  id: string
  pluginId: string
  type: PluginErrorType
  message: string
  stack?: string
  userId?: string
  resolved: boolean
  timestamp: Date
}

// Plugin Management
export interface PluginInstallRequest {
  source: PluginSource
  url?: string
  file?: File | Buffer
  autoActivate?: boolean
}

export interface PluginInstallResponse {
  success: boolean
  plugin?: Plugin
  errors?: string[]
  warnings?: string[]
}

// Enums
export enum PluginStatus {
  INSTALLED = 'installed',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ERROR = 'error',
  UPDATING = 'updating',
  INSTALLING = 'installing',
  UNINSTALLING = 'uninstalling'
}

export enum PluginCategory {
  SOCIAL = 'social',
  MEDIA = 'media',
  COMMUNICATION = 'communication',
  PRODUCTIVITY = 'productivity',
  BUSINESS = 'business',
  UTILITY = 'utility',
  ANALYTICS = 'analytics',
  SECURITY = 'security',
  INTEGRATION = 'integration',
  THEME = 'theme',
  EXTENSION = 'extension'
}

export enum PermissionScope {
  SYSTEM = 'system',
  USER = 'user',
  CONTENT = 'content',
  API = 'api',
  DATABASE = 'database',
  FILE = 'file',
  NETWORK = 'network'
}

export enum DependencyType {
  PLUGIN = 'plugin',
  NPM = 'npm',
  SYSTEM = 'system',
  FEATURE = 'feature'
}

export enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  TEXTAREA = 'textarea',
  PASSWORD = 'password',
  FILE = 'file',
  COLOR = 'color',
  DATE = 'date',
  URL = 'url',
  EMAIL = 'email',
  JSON = 'json'
}

export enum PluginErrorType {
  INITIALIZATION = 'initialization',
  CONFIGURATION = 'configuration',
  DEPENDENCY = 'dependency',
  PERMISSION = 'permission',
  RUNTIME = 'runtime',
  API = 'api',
  UI = 'ui',
  DATABASE = 'database',
  NETWORK = 'network',
  SECURITY = 'security'
}

export enum PluginSource {
  MARKETPLACE = 'marketplace',
  URL = 'url',
  FILE = 'file',
  GITHUB = 'github',
  LOCAL = 'local'
}

// Plugin Events
export interface PluginEvent {
  id: string
  type: PluginEventType
  pluginId: string
  data?: any
  user?: string
  timestamp: Date
}

export enum PluginEventType {
  INSTALLED = 'installed',
  UNINSTALLED = 'uninstalled',
  ACTIVATED = 'activated',
  DEACTIVATED = 'deactivated',
  UPDATED = 'updated',
  CONFIGURED = 'configured',
  ERROR = 'error'
}