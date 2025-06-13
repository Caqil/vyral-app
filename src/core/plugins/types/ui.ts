import { UserRole } from '@/core/types/auth'
import { ReactNode, ComponentType } from 'react'

// Plugin UI Configuration
export interface PluginUIConfig {
  components: PluginComponent[]
  pages?: PluginPage[]
  hooks: PluginUIHook[]
  routes?: PluginRoute[]
  navigation?: PluginNavigation[]
  widgets?: PluginWidget[]
  styles?: string[]
  assets?: string[]
}

// Plugin Component
export interface PluginComponent {
  name: string
  file: string
  displayName?: string
  description?: string
  category: ComponentCategory
  props?: PluginComponentProp[]
  slots?: string[]
  permissions?: string[]
  roles?: UserRole[]
  examples?: PluginComponentExample[]
}

// Plugin Component Properties
export interface PluginComponentProp {
  name: string
  type: PropType
  required: boolean
  default?: any
  description?: string
  options?: PropOption[]
  validation?: PropValidation
}

export interface PropOption {
  label: string
  value: any
  description?: string
}

export interface PropValidation {
  min?: number
  max?: number
  pattern?: string
  required?: boolean
  message?: string
}

// Plugin Component Examples
export interface PluginComponentExample {
  title: string
  description?: string
  props?: Record<string, any>
  code: string
}

// Plugin Pages
export interface PluginPage {
  path: string
  component: string
  title?: string
  description?: string
  permissions?: string[]
  roles?: UserRole[]
  metadata?: PageMetadata
}

export interface PageMetadata {
  title?: string
  description?: string
  keywords?: string[]
  author?: string
  created?: Date
  updated?: Date
}

// Plugin UI Hooks
export interface PluginUIHook {
  name: string
  handler: string
  priority?: number
  conditions?: PluginUICondition[]
}

// Plugin UI Conditions
export interface PluginUICondition {
  type: UIConditionType
  field: string
  operator: ConditionOperator
  value: any
}

// Plugin Routes
export interface PluginRoute {
  path: string
  name?: string
  component?: string
  redirect?: string
  children?: PluginRoute[]
  meta?: RouteMeta
}

export interface RouteMeta {
  title?: string
  permissions?: string[]
  roles?: UserRole[]
  layout?: string
  protected?: boolean
}

// Plugin Navigation
export interface PluginNavigation {
  id: string
  label: string
  icon?: string
  path?: string
  order?: number
  parent?: string
  children?: PluginNavigation[]
  permissions?: string[]
  roles?: UserRole[]
  visible?: boolean
}

// Plugin Widgets
export interface PluginWidget {
  id: string
  name: string
  component: string
  title?: string
  description?: string
  category?: WidgetCategory
  size?: WidgetSize
  configurable?: boolean
  refreshable?: boolean
  permissions?: string[]
  roles?: UserRole[]
  settings?: PluginComponentProp[]
}

export interface WidgetSize {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

// Enums
export enum ComponentCategory {
  BASIC = 'basic',
  FORM = 'form',
  DATA_DISPLAY = 'data_display',
  FEEDBACK = 'feedback',
  NAVIGATION = 'navigation',
  LAYOUT = 'layout',
  MEDIA = 'media'
}

export enum PropType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  FUNCTION = 'function',
  NODE = 'node',
  COMPONENT = 'component'
}

export enum UIConditionType {
  USER_ROLE = 'user_role',
  USER_PERMISSION = 'user_permission',
  FEATURE_FLAG = 'feature_flag',
  THEME = 'theme',
  DEVICE = 'device',
  SCREEN_SIZE = 'screen_size',
  PLUGIN_ACTIVE = 'plugin_active',
  PLUGIN_SETTING = 'plugin_setting'
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  IN = 'in',
  NOT_IN = 'not_in'
}

export enum WidgetCategory {
  ANALYTICS = 'analytics',
  CONTENT = 'content',
  SOCIAL = 'social',
  MEDIA = 'media',
  PRODUCTIVITY = 'productivity',
  SYSTEM = 'system'
}