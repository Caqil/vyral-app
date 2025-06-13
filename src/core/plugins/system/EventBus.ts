import { EventEmitter } from 'events'
import { logger } from '@/core/lib/utils/logger'
import { EventCategory } from '@/core/types'

export interface PluginEvent {
  id: string
  type: string
  category: EventCategory
  pluginId?: string
  userId?: string
  data?: any
  timestamp: Date
  source: string
  version: string
  metadata?: Record<string, any>
  context?: EventContext
}

export interface EventContext {
  requestId?: string
  sessionId?: string
  traceId?: string
  parentEventId?: string
  correlationId?: string
  tags?: string[]
  environment?: string
  ipAddress?: string
  userAgent?: string
}

export interface EventListener {
  id: string
  eventType: string
  pluginId: string
  handler: EventHandler
  priority: number
  enabled: boolean
  once: boolean
  async: boolean
  timeout?: number
  conditions?: EventCondition[]
  metadata?: Record<string, any>
  createdAt: Date
  lastTriggered?: Date
  triggerCount: number
}

export interface EventHandler {
  (event: PluginEvent): Promise<EventHandlerResult | void> | EventHandlerResult | void
}

export interface EventHandlerResult {
  success: boolean
  data?: any
  error?: string
  stopPropagation?: boolean
  modifications?: Partial<PluginEvent>
}

export interface EventCondition {
  field: string
  operator: ConditionOperator
  value: any
  negate?: boolean
}

export interface EventSubscription {
  id: string
  eventType: string
  pluginId: string
  callback: (event: PluginEvent) => void
  options: SubscriptionOptions
  createdAt: Date
  active: boolean
}

export interface SubscriptionOptions {
  priority?: number
  once?: boolean
  async?: boolean
  timeout?: number
  conditions?: EventCondition[]
  bufferSize?: number
  throttle?: number
  debounce?: number
}

export interface EventMetrics {
  totalEvents: number
  eventsByType: Record<string, number>
  eventsByCategory: Record<EventCategory, number>
  eventsByPlugin: Record<string, number>
  listenersCount: number
  activeListeners: number
  averageProcessingTime: number
  failedEvents: number
  errorRate: number
  lastEventTime?: Date
  topEvents: Array<{ type: string; count: number }>
}

export interface EventBuffer {
  events: PluginEvent[]
  maxSize: number
  currentSize: number
  oldestEvent?: Date
  newestEvent?: Date
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IN = 'in',
  NOT_IN = 'not_in',
  EXISTS = 'exists',
  MATCHES = 'matches'
}

export enum EventPriority {
  LOWEST = 0,
  LOW = 25,
  NORMAL = 50,
  HIGH = 75,
  HIGHEST = 100,
  CRITICAL = 999
}

export class PluginEventBus extends EventEmitter {
  private static instance: PluginEventBus
  private eventListeners: Map<string, EventListener[]> = new Map()
  private subscriptions: Map<string, EventSubscription[]> = new Map()
  private eventHistory: PluginEvent[] = []
  private eventBuffer: Map<string, EventBuffer> = new Map()
  private metrics: EventMetrics = {
    totalEvents: 0,
    eventsByType: {},
    eventsByCategory: {} as Record<EventCategory, number>,
    eventsByPlugin: {},
    listenersCount: 0,
    activeListeners: 0,
    averageProcessingTime: 0,
    failedEvents: 0,
    errorRate: 0,
    topEvents: []
  }
  private config: EventBusConfig = {
    maxHistorySize: 1000,
    maxBufferSize: 100,
    enableMetrics: true,
    enablePersistence: false,
    enableAsync: true,
    defaultTimeout: 5000,
    throttleInterval: 100,
    debounceInterval: 500,
    enableDebug: false
  }

  private constructor() {
    super()
    this.setMaxListeners(0) // Unlimited listeners
    this.initializeCategories()
  }

  public static getInstance(): PluginEventBus {
    if (!PluginEventBus.instance) {
      PluginEventBus.instance = new PluginEventBus()
    }
    return PluginEventBus.instance
  }

 /**
   * Emit an event asynchronously with plugin system features
   */
  public async emitAsync(
    eventType: string,
    data?: any,
    context?: Partial<EventContext>,
    pluginId?: string
  ): Promise<boolean> {
    const startTime = Date.now()
    
    try {
      const event: PluginEvent = {
        id: this.generateEventId(),
        type: eventType,
        category: this.getCategoryFromEventType(eventType),
        pluginId,
        data,
        timestamp: new Date(),
        source: 'plugin-system',
        version: '1.0.0',
        context: {
          requestId: this.generateRequestId(),
          ...context
        }
      }

      // Add to history
      this.addToHistory(event)
      
      // Update metrics
      this.updateMetrics(event, startTime)
      
      // Get listeners for this event type
      const eventListeners = this.getEventListeners(eventType)
      
      if (eventListeners.length === 0) {
        if (this.config.enableDebug) {
          logger.debug('No listeners for event type', { eventType })
        }
        return true
      }

      // Process listeners by priority
      const sortedListeners = eventListeners
        .filter(listener => listener.enabled)
        .sort((a, b) => b.priority - a.priority)

      let eventModified = false
      let stopPropagation = false

      for (const listener of sortedListeners) {
        if (stopPropagation) break

        try {
          // Check conditions
          if (!this.checkConditions(event, listener.conditions)) {
            continue
          }

          // Execute handler
          const result = await this.executeHandler(listener, event)
          
          if (result) {
            if (result.stopPropagation) {
              stopPropagation = true
            }
            
            if (result.modifications) {
              Object.assign(event, result.modifications)
              eventModified = true
            }
          }

          // Update listener stats
          listener.lastTriggered = new Date()
          listener.triggerCount++

          // Remove once listeners
          if (listener.once) {
            this.removeEventListener(listener.id)
          }

        } catch (error) {
          logger.error('Event listener error', {
            eventType,
            listenerId: listener.id,
            pluginId: listener.pluginId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          
          this.metrics.failedEvents++
          
          // Use emitAsync for recursive calls to avoid conflicts
          this.emitAsync('system:error', {
            type: 'listener_error',
            eventType,
            listenerId: listener.id,
            pluginId: listener.pluginId,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      // Process subscriptions
      await this.processSubscriptions(event)

      // Emit to Node.js EventEmitter (synchronous)
      super.emit(eventType, event)
      super.emit('*', event) // Wildcard listener

      if (this.config.enableDebug) {
        logger.debug('Event emitted', {
          eventType,
          eventId: event.id,
          listenersCount: sortedListeners.length,
          processingTime: Date.now() - startTime,
          eventModified,
          stopPropagation
        })
      }

      return true
    } catch (error) {
      logger.error('Failed to emit event', {
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      this.metrics.failedEvents++
      return false
    }
  }

  /**
   * Synchronous emit that delegates to Node.js EventEmitter
   * Use this for simple, synchronous event emissions
   */
  public override emit(eventName: string | symbol, ...args: any[]): boolean {
    return super.emit(eventName, ...args)
  }

  /**
   * Convenience method for plugin events - delegates to emitAsync
   */
  public async emitPluginEvent(
    eventType: string,
    data?: any,
    context?: Partial<EventContext>,
    pluginId?: string
  ): Promise<boolean> {
    return this.emitAsync(eventType, data, context, pluginId)
  }

  /**
   * Add event listener
   */
  public addEventListener(
    eventType: string,
    pluginId: string,
    handler: EventHandler,
    options: Partial<SubscriptionOptions> = {}
  ): string {
    const listener: EventListener = {
      id: this.generateListenerId(),
      eventType,
      pluginId,
      handler,
      priority: options.priority || EventPriority.NORMAL,
      enabled: true,
      once: options.once || false,
      async: options.async !== false,
      timeout: options.timeout || this.config.defaultTimeout,
      conditions: options.conditions,
      createdAt: new Date(),
      triggerCount: 0
    }

    const listeners = this.eventListeners.get(eventType) || []
    listeners.push(listener)
    this.eventListeners.set(eventType, listeners)
    
    this.metrics.listenersCount++
    this.metrics.activeListeners++

    logger.debug('Event listener added', {
      eventType,
      pluginId,
      listenerId: listener.id,
      priority: listener.priority
    })

    return listener.id
  }

  /**
   * Remove event listener
   */
  public removeEventListener(listenerId: string): boolean {
    for (const [eventType, listeners] of this.eventListeners.entries()) {
      const index = listeners.findIndex(l => l.id === listenerId)
      if (index > -1) {
        const listener = listeners[index]
        listeners.splice(index, 1)
        
        if (listeners.length === 0) {
          this.eventListeners.delete(eventType)
        } else {
          this.eventListeners.set(eventType, listeners)
        }
        
        this.metrics.activeListeners--
        
        logger.debug('Event listener removed', {
          eventType,
          pluginId: listener.pluginId,
          listenerId
        })
        
        return true
      }
    }
    
    return false
  }

  /**
   * Remove all listeners for plugin
   */
  public removePluginListeners(pluginId: string): number {
    let removed = 0
    
    for (const [eventType, listeners] of this.eventListeners.entries()) {
      const originalLength = listeners.length
      const filteredListeners = listeners.filter(l => l.pluginId !== pluginId)
      
      if (filteredListeners.length !== originalLength) {
        removed += originalLength - filteredListeners.length
        
        if (filteredListeners.length === 0) {
          this.eventListeners.delete(eventType)
        } else {
          this.eventListeners.set(eventType, filteredListeners)
        }
      }
    }
    
    this.metrics.activeListeners -= removed
    
    logger.info('Plugin listeners removed', { pluginId, removed })
    
    return removed
  }

  /**
   * Subscribe to events with callback
   */
  public subscribe(
    eventType: string,
    pluginId: string,
    callback: (event: PluginEvent) => void,
    options: SubscriptionOptions = {}
  ): string {
    const subscription: EventSubscription = {
      id: this.generateSubscriptionId(),
      eventType,
      pluginId,
      callback,
      options,
      createdAt: new Date(),
      active: true
    }

    const subscriptions = this.subscriptions.get(eventType) || []
    subscriptions.push(subscription)
    this.subscriptions.set(eventType, subscriptions)

    // Setup event buffer if needed
    if (options.bufferSize) {
      this.setupEventBuffer(eventType, options.bufferSize)
    }

    logger.debug('Event subscription created', {
      eventType,
      pluginId,
      subscriptionId: subscription.id
    })

    return subscription.id
  }

  /**
   * Unsubscribe from events
   */
  public unsubscribe(subscriptionId: string): boolean {
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(s => s.id === subscriptionId)
      if (index > -1) {
        subscriptions.splice(index, 1)
        
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType)
        } else {
          this.subscriptions.set(eventType, subscriptions)
        }
        
        logger.debug('Event subscription removed', {
          eventType,
          subscriptionId
        })
        
        return true
      }
    }
    
    return false
  }

  /**
   * Get event history
   */
  public getEventHistory(
    eventType?: string,
    pluginId?: string,
    limit?: number
  ): PluginEvent[] {
    let events = [...this.eventHistory]
    
    if (eventType) {
      events = events.filter(e => e.type === eventType)
    }
    
    if (pluginId) {
      events = events.filter(e => e.pluginId === pluginId)
    }
    
    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    if (limit) {
      events = events.slice(0, limit)
    }
    
    return events
  }

  /**
   * Get event metrics
   */
  public getMetrics(): EventMetrics {
    // Update calculated fields
    const totalRequests = this.metrics.totalEvents
    this.metrics.errorRate = totalRequests > 0 
      ? (this.metrics.failedEvents / totalRequests) * 100 
      : 0

    // Update top events
    this.metrics.topEvents = Object.entries(this.metrics.eventsByType)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return { ...this.metrics }
  }

  /**
   * Get listeners for event type
   */
  public getListeners(eventType?: string): EventListener[] {
    if (eventType) {
      return this.eventListeners.get(eventType) || []
    }
    
    const allListeners: EventListener[] = []
    this.eventListeners.forEach(listeners => allListeners.push(...listeners))
    return allListeners
  }

  /**
   * Get subscriptions for plugin
   */
  public getPluginSubscriptions(pluginId: string): EventSubscription[] {
    const subscriptions: EventSubscription[] = []
    
    this.subscriptions.forEach(subs => {
      subs
        .filter(s => s.pluginId === pluginId)
        .forEach(s => subscriptions.push(s))
    })
    
    return subscriptions
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = []
    logger.info('Event history cleared')
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<EventBusConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.info('Event bus configuration updated', { config: this.config })
  }

  // Private methods
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateListenerId(): string {
    return `lsn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getCategoryFromEventType(eventType: string): EventCategory {
    const categoryMap: Record<string, EventCategory> = {
      'auth': EventCategory.AUTH,
      'user': EventCategory.USER,
      'content': EventCategory.CONTENT,
      'plugin': EventCategory.PLUGIN,
      'system': EventCategory.SYSTEM,
      'security': EventCategory.SECURITY,
      'api': EventCategory.API,
      'database': EventCategory.DATABASE
    }

    const prefix = eventType.split(':')[0] || eventType.split('.')[0]
    return categoryMap[prefix] || EventCategory.SYSTEM
  }

  private initializeCategories(): void {
    Object.values(EventCategory).forEach(category => {
      this.metrics.eventsByCategory[category] = 0
    })
  }

  private addToHistory(event: PluginEvent): void {
    this.eventHistory.push(event)
    
    // Trim history if too large
    if (this.eventHistory.length > this.config.maxHistorySize) {
      this.eventHistory.shift()
    }
    
    // Add to event buffer if exists
    const buffer = this.eventBuffer.get(event.type)
    if (buffer) {
      buffer.events.push(event)
      buffer.currentSize++
      buffer.newestEvent = event.timestamp
      
      if (!buffer.oldestEvent) {
        buffer.oldestEvent = event.timestamp
      }
      
      // Trim buffer if too large
      if (buffer.events.length > buffer.maxSize) {
        const removed = buffer.events.shift()
        buffer.currentSize--
        
        if (removed && buffer.events.length > 0) {
          buffer.oldestEvent = buffer.events[0].timestamp
        }
      }
    }
  }

  private updateMetrics(event: PluginEvent, startTime: number): void {
    if (!this.config.enableMetrics) return

    this.metrics.totalEvents++
    this.metrics.eventsByType[event.type] = (this.metrics.eventsByType[event.type] || 0) + 1
    this.metrics.eventsByCategory[event.category]++
    
    if (event.pluginId) {
      this.metrics.eventsByPlugin[event.pluginId] = (this.metrics.eventsByPlugin[event.pluginId] || 0) + 1
    }
    
    // Update average processing time
    const processingTime = Date.now() - startTime
    this.metrics.averageProcessingTime = 
      ((this.metrics.averageProcessingTime * (this.metrics.totalEvents - 1)) + processingTime) / this.metrics.totalEvents
    
    this.metrics.lastEventTime = event.timestamp
  }

  private getEventListeners(eventType: string): EventListener[] {
    const directListeners = this.eventListeners.get(eventType) || []
    const wildcardListeners = this.eventListeners.get('*') || []
    
    return [...directListeners, ...wildcardListeners]
  }

  private checkConditions(event: PluginEvent, conditions?: EventCondition[]): boolean {
    if (!conditions || conditions.length === 0) {
      return true
    }

    return conditions.every(condition => {
      const value = this.getEventValue(event, condition.field)
      const result = this.evaluateCondition(value, condition.operator, condition.value)
      return condition.negate ? !result : result
    })
  }

  private getEventValue(event: PluginEvent, field: string): any {
    const parts = field.split('.')
    let value: any = event

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part]
      } else {
        return undefined
      }
    }

    return value
  }

  private evaluateCondition(value: any, operator: ConditionOperator, compareValue: any): boolean {
    switch (operator) {
      case ConditionOperator.EQUALS:
        return value === compareValue
      case ConditionOperator.NOT_EQUALS:
        return value !== compareValue
      case ConditionOperator.GREATER_THAN:
        return value > compareValue
      case ConditionOperator.LESS_THAN:
        return value < compareValue
      case ConditionOperator.CONTAINS:
        return String(value).includes(String(compareValue))
      case ConditionOperator.NOT_CONTAINS:
        return !String(value).includes(String(compareValue))
      case ConditionOperator.STARTS_WITH:
        return String(value).startsWith(String(compareValue))
      case ConditionOperator.ENDS_WITH:
        return String(value).endsWith(String(compareValue))
      case ConditionOperator.IN:
        return Array.isArray(compareValue) && compareValue.includes(value)
      case ConditionOperator.NOT_IN:
        return Array.isArray(compareValue) && !compareValue.includes(value)
      case ConditionOperator.EXISTS:
        return value !== undefined && value !== null
      case ConditionOperator.MATCHES:
        return new RegExp(String(compareValue)).test(String(value))
      default:
        return false
    }
  }

  private async executeHandler(listener: EventListener, event: PluginEvent): Promise<EventHandlerResult | void> {
    const timeout = listener.timeout || this.config.defaultTimeout
    
    if (listener.async) {
      return Promise.race([
        Promise.resolve(listener.handler(event)),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Handler timeout')), timeout)
        )
      ])
    } else {
      return listener.handler(event)
    }
  }

  private async processSubscriptions(event: PluginEvent): Promise<void> {
    const subscriptions = this.subscriptions.get(event.type) || []
    const wildcardSubscriptions = this.subscriptions.get('*') || []
    
    const allSubscriptions = [...subscriptions, ...wildcardSubscriptions]
      .filter(s => s.active)

    for (const subscription of allSubscriptions) {
      try {
        // Check conditions
        if (subscription.options.conditions && 
            !this.checkConditions(event, subscription.options.conditions)) {
          continue
        }

        // Apply throttling/debouncing if configured
        if (subscription.options.throttle || subscription.options.debounce) {
          // Implementation would handle throttling/debouncing
          // For now, just call the callback
        }

        subscription.callback(event)

        // Remove once subscriptions
        if (subscription.options.once) {
          this.unsubscribe(subscription.id)
        }

      } catch (error) {
        logger.error('Subscription callback error', {
          subscriptionId: subscription.id,
          pluginId: subscription.pluginId,
          eventType: event.type,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
  }

  private setupEventBuffer(eventType: string, maxSize: number): void {
    if (!this.eventBuffer.has(eventType)) {
      this.eventBuffer.set(eventType, {
        events: [],
        maxSize,
        currentSize: 0
      })
    }
  }

  /**
   * Wait for specific event
   */
  public waitForEvent(
    eventType: string,
    pluginId: string,
    timeout: number = 10000,
    conditions?: EventCondition[]
  ): Promise<PluginEvent> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`))
      }, timeout)

      const listenerId = this.addEventListener(
        eventType,
        pluginId,
        (event) => {
          clearTimeout(timeoutId)
          resolve(event)
        },
        { once: true, conditions }
      )

      // Cleanup on timeout
      setTimeout(() => {
        this.removeEventListener(listenerId)
      }, timeout + 100)
    })
  }

  /**
   * Shutdown event bus
   */
  public shutdown(): void {
    this.eventListeners.clear()
    this.subscriptions.clear()
    this.eventHistory = []
    this.eventBuffer.clear()
    this.removeAllListeners()
    
    logger.info('Event bus shutdown')
  }
}

interface EventBusConfig {
  maxHistorySize: number
  maxBufferSize: number
  enableMetrics: boolean
  enablePersistence: boolean
  enableAsync: boolean
  defaultTimeout: number
  throttleInterval: number
  debounceInterval: number
  enableDebug: boolean
}