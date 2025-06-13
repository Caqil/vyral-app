import { UserRole } from '@/core/types/auth'

// Plugin Hook System Types
export interface PluginHook {
  id: string
  name: string
  pluginId: string
  handler: string
  priority: number
  enabled: boolean
  category: HookCategory
  async: boolean
  timeout?: number
  createdAt: Date
}

// Hook Context for execution
export interface PluginHookContext {
  hookName: string
  pluginId: string
  user?: PluginHookUser
  data?: any
  metadata?: Record<string, any>
  timestamp: Date
}

// Hook Handler Function Type
export interface PluginHookHandler {
  (context: PluginHookContext): Promise<PluginHookResult | null> | PluginHookResult | null
}

// Hook Result
export interface PluginHookResult {
  success: boolean
  data?: any
  error?: string
  stopPropagation?: boolean
}

// Hook Categories and Types
export interface PluginHookConfiguration {
  api?: string[]
  ui?: string[]
  system?: string[]
  user?: string[]
  content?: string[]
  custom?: Record<string, string>
}

// Hook Context Types
export interface PluginHookUser {
  id: string
  email: string
  role: UserRole
  permissions: string[]
}

// Hook Registry
export interface PluginHookRegistry {
  hooks: Map<string, PluginHook[]>
  handlers: Map<string, PluginHookHandler>
  statistics: PluginHookStatistics
}

// Hook Statistics
export interface PluginHookStatistics {
  totalHooks: number
  activeHooks: number
  executionCount: number
  successCount: number
  errorCount: number
  averageExecutionTime: number
}

// Enums
export enum HookCategory {
  API = 'api',
  UI = 'ui',
  SYSTEM = 'system',
  USER = 'user',
  CONTENT = 'content',
  CUSTOM = 'custom'
}

// Hook Manager Interface
export interface PluginHookManager {
  register: (hook: PluginHook, handler: PluginHookHandler) => Promise<boolean>
  unregister: (hookId: string) => Promise<boolean>
  execute: (hookName: string, context: PluginHookContext) => Promise<PluginHookResult[]>
  list: (category?: HookCategory, pluginId?: string) => PluginHook[]
  stats: () => PluginHookStatistics
}