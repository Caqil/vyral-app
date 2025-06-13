"use client";

import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  useRef,
} from "react";
import {
  Hook,
  HookContext,
  HookHandler,
  SystemEvent,
  EventCategory,
  EventListener,
} from "@/core/types";
import { Plugin } from "@/core/types/plugin";
import { logger } from "@/core/lib/utils/logger";
import { useAuth } from "./useAuth";
import { usePlugin } from "./usePlugin";

// Plugin hook management context interface
interface PluginHookContextType {
  hooks: Map<string, Hook[]>;
  events: SystemEvent[];
  listeners: Map<string, EventListener[]>;
  isLoading: boolean;
  error: string | null;

  // Hook management
  registerHook: (
    name: string,
    handler: HookHandler,
    priority?: number,
    pluginId?: string
  ) => string;
  unregisterHook: (hookId: string) => boolean;
  executeHook: (
    name: string,
    context: HookContext
  ) => Promise<HookContext | null>;
  getHooks: (name: string) => Hook[];

  // Event management
  addEventListener: (
    event: string,
    handler: EventListener["handler"],
    priority?: number,
    once?: boolean
  ) => string;
  removeEventListener: (listenerId: string) => boolean;
  emitEvent: (event: SystemEvent) => Promise<void>;

  // Plugin-specific hooks
  registerPluginHooks: (plugin: Plugin) => Promise<void>;
  unregisterPluginHooks: (pluginId: string) => Promise<void>;
  getPluginHooks: (pluginId: string) => Hook[];

  // Utility functions
  clearHooks: () => void;
  getHookStats: () => HookStats;
}

// Hook statistics interface
interface HookStats {
  totalHooks: number;
  activeHooks: number;
  hooksByType: Record<string, number>;
  eventCount: number;
  listenerCount: number;
}

// Plugin hook provider props
interface PluginHookProviderProps {
  children: ReactNode;
}

// Plugin hook state interface
interface PluginHookState {
  hooks: Map<string, Hook[]>;
  events: SystemEvent[];
  listeners: Map<string, EventListener[]>;
  hookCounter: number;
  listenerCounter: number;
  isLoading: boolean;
  error: string | null;
}

// Hook execution context
interface HookExecutionContext extends HookContext {
  hookName: string;
  pluginId?: string;
  startTime: number;
  timeout?: number;
}

// Plugin Hook Context
const PluginHookContext = createContext<PluginHookContextType | null>(null);

// Common hook names (constants)
export const HOOK_NAMES = {
  // Authentication hooks
  AUTH_BEFORE_SIGNIN: "auth.beforeSignin",
  AUTH_AFTER_SIGNIN: "auth.afterSignin",
  AUTH_BEFORE_SIGNUP: "auth.beforeSignup",
  AUTH_AFTER_SIGNUP: "auth.afterSignup",
  AUTH_BEFORE_SIGNOUT: "auth.beforeSignout",
  AUTH_AFTER_SIGNOUT: "auth.afterSignout",

  // User hooks
  USER_BEFORE_CREATE: "user.beforeCreate",
  USER_AFTER_CREATE: "user.afterCreate",
  USER_BEFORE_UPDATE: "user.beforeUpdate",
  USER_AFTER_UPDATE: "user.afterUpdate",
  USER_BEFORE_DELETE: "user.beforeDelete",
  USER_AFTER_DELETE: "user.afterDelete",

  // Content hooks
  CONTENT_BEFORE_CREATE: "content.beforeCreate",
  CONTENT_AFTER_CREATE: "content.afterCreate",
  CONTENT_BEFORE_UPDATE: "content.beforeUpdate",
  CONTENT_AFTER_UPDATE: "content.afterUpdate",
  CONTENT_BEFORE_DELETE: "content.beforeDelete",
  CONTENT_AFTER_DELETE: "content.afterDelete",

  // Upload hooks
  UPLOAD_BEFORE_UPLOAD: "upload.beforeUpload",
  UPLOAD_AFTER_UPLOAD: "upload.afterUpload",
  UPLOAD_BEFORE_DELETE: "upload.beforeDelete",
  UPLOAD_AFTER_DELETE: "upload.afterDelete",
  UPLOAD_ON_ERROR: "upload.onError",

  // Plugin hooks
  PLUGIN_BEFORE_INSTALL: "plugin.beforeInstall",
  PLUGIN_AFTER_INSTALL: "plugin.afterInstall",
  PLUGIN_BEFORE_UNINSTALL: "plugin.beforeUninstall",
  PLUGIN_AFTER_UNINSTALL: "plugin.afterUninstall",
  PLUGIN_BEFORE_ACTIVATE: "plugin.beforeActivate",
  PLUGIN_AFTER_ACTIVATE: "plugin.afterActivate",
  PLUGIN_BEFORE_DEACTIVATE: "plugin.beforeDeactivate",
  PLUGIN_AFTER_DEACTIVATE: "plugin.afterDeactivate",

  // System hooks
  SYSTEM_STARTUP: "system.startup",
  SYSTEM_SHUTDOWN: "system.shutdown",
  SYSTEM_ERROR: "system.error",
  SYSTEM_MAINTENANCE: "system.maintenance",

  // UI hooks
  UI_BEFORE_RENDER: "ui.beforeRender",
  UI_AFTER_RENDER: "ui.afterRender",
  UI_COMPONENT_MOUNT: "ui.componentMount",
  UI_COMPONENT_UNMOUNT: "ui.componentUnmount",
} as const;

// Plugin Hook Provider Component
export function PluginHookProvider({ children }: PluginHookProviderProps) {
  const [state, setState] = useState<PluginHookState>({
    hooks: new Map(),
    events: [],
    listeners: new Map(),
    hookCounter: 0,
    listenerCounter: 0,
    isLoading: false,
    error: null,
  });

  const { user } = useAuth();
  const { activePlugins } = usePlugin();
  const hookExecutionTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Register a hook
  const registerHook = useCallback(
    (
      name: string,
      handler: HookHandler,
      priority: number = 0,
      pluginId?: string
    ): string => {
      const hookId = `hook_${Date.now()}_${state.hookCounter}`;

      const hook: Hook = {
        name: hookId,
        handler,
        priority,
        pluginId,
        enabled: true,
      };

      setState((prev) => {
        const newHooks = new Map(prev.hooks);
        if (!newHooks.has(name)) {
          newHooks.set(name, []);
        }

        const hookList = [...newHooks.get(name)!, hook];
        // Sort by priority (higher priority first)
        hookList.sort((a, b) => b.priority! - a.priority!);
        newHooks.set(name, hookList);

        return {
          ...prev,
          hooks: newHooks,
          hookCounter: prev.hookCounter + 1,
        };
      });

      logger.info("Hook registered", { hookId, name, priority, pluginId });
      return hookId;
    },
    [state.hookCounter]
  );

  // Unregister a hook
  const unregisterHook = useCallback((hookId: string): boolean => {
    let found = false;

    setState((prev) => {
      const newHooks = new Map(prev.hooks);

      for (const [name, hooks] of newHooks.entries()) {
        const filteredHooks = hooks.filter((hook) => hook.name !== hookId);
        if (filteredHooks.length !== hooks.length) {
          found = true;
          newHooks.set(name, filteredHooks);
        }
      }

      return { ...prev, hooks: newHooks };
    });

    if (found) {
      logger.info("Hook unregistered", { hookId });
    }

    return found;
  }, []);
  const executeHook = useCallback(
    async (name: string, context: HookContext): Promise<HookContext | null> => {
      const hooks = state.hooks.get(name) || [];

      if (hooks.length === 0) {
        return context;
      }

      let currentContext = context;
      const executionContext: HookExecutionContext = {
        ...context,
        hookName: name,
        startTime: Date.now(),
        timeout: 30000, // 30 second timeout
      };

      logger.debug("Executing hooks", {
        hookName: name,
        hookCount: hooks.length,
      });

      for (const hook of hooks) {
        if (!hook.enabled) {
          continue;
        }

        try {
          // Set execution timeout
          const timeoutId = setTimeout(() => {
            logger.warn("Hook execution timeout", {
              hookName: name,
              hookId: hook.name,
              pluginId: hook.pluginId,
            });
          }, executionContext.timeout!);

          hookExecutionTimeouts.current.set(hook.name, timeoutId);

          const result = await hook.handler({
            ...currentContext,
            metadata: {
              ...currentContext.metadata,
              pluginId: hook.pluginId,
              hookName: name,
              executionId: hook.name,
            },
          });

          // Clear timeout
          clearTimeout(timeoutId);
          hookExecutionTimeouts.current.delete(hook.name);

          if (result === null) {
            // Hook blocked execution
            logger.info("Hook blocked execution", {
              hookName: name,
              hookId: hook.name,
              pluginId: hook.pluginId,
            });
            return null;
          }

          if (result) {
            currentContext = result;
          }

          logger.debug("Hook executed successfully", {
            hookName: name,
            hookId: hook.name,
            pluginId: hook.pluginId,
            executionTime: Date.now() - executionContext.startTime,
          });
        } catch (error) {
          logger.error("Hook execution error", {
            error,
            hookName: name,
            hookId: hook.name,
            pluginId: hook.pluginId,
          });

          // Emit error event
          await emitEvent({
            type: "hook.error",
            category: EventCategory.PLUGIN,
            data: {
              error,
              hookName: name,
              hookId: hook.name,
              pluginId: hook.pluginId,
            },
            userId: user?.id,
            pluginId: hook.pluginId,
            timestamp: new Date(),
          });

          // Continue with next hook unless it's a critical error
          if (error instanceof Error && error.message.includes("CRITICAL")) {
            return null;
          }
        }
      }

      return currentContext;
    },
    [state.hooks, user?.id]
  );

  // Get hooks by name
  const getHooks = useCallback(
    (name: string): Hook[] => {
      return state.hooks.get(name) || [];
    },
    [state.hooks]
  );

  // Add event listener
  const addEventListener = useCallback(
    (
      event: string,
      handler: EventListener["handler"],
      priority: number = 0,
      once: boolean = false
    ): string => {
      const listenerId = `listener_${Date.now()}_${state.listenerCounter}`;

      const listener: EventListener = {
        event,
        handler,
        priority,
        once,
      };

      setState((prev) => {
        const newListeners = new Map(prev.listeners);
        if (!newListeners.has(event)) {
          newListeners.set(event, []);
        }

        const listenerList = [
          ...newListeners.get(event)!,
          { ...listener, id: listenerId },
        ];
        // Sort by priority (higher priority first)
        listenerList.sort((a, b) => b.priority! - a.priority!);
        newListeners.set(event, listenerList);

        return {
          ...prev,
          listeners: newListeners,
          listenerCounter: prev.listenerCounter + 1,
        };
      });

      logger.debug("Event listener added", {
        listenerId,
        event,
        priority,
        once,
      });
      return listenerId;
    },
    [state.listenerCounter]
  );

  // Remove event listener
  const removeEventListener = useCallback((listenerId: string): boolean => {
    let found = false;

    setState((prev) => {
      const newListeners = new Map(prev.listeners);

      for (const [event, listeners] of newListeners.entries()) {
        const filteredListeners = listeners.filter(
          (listener: any) => listener.id !== listenerId
        );
        if (filteredListeners.length !== listeners.length) {
          found = true;
          newListeners.set(event, filteredListeners);
        }
      }

      return { ...prev, listeners: newListeners };
    });

    if (found) {
      logger.debug("Event listener removed", { listenerId });
    }

    return found;
  }, []);

  // Emit event
  const emitEvent = useCallback(
    async (event: SystemEvent): Promise<void> => {
      const listeners = state.listeners.get(event.type) || [];

      if (listeners.length === 0) {
        return;
      }

      // Add event to history
      setState((prev) => ({
        ...prev,
        events: [...prev.events.slice(-99), event], // Keep last 100 events
      }));

      logger.debug("Emitting event", {
        eventType: event.type,
        listenerCount: listeners.length,
      });

      const removeOnceListeners: string[] = [];

      for (const listener of listeners) {
        try {
          await listener.handler(event);

          if (listener.once) {
            removeOnceListeners.push((listener as any).id);
          }

          logger.debug("Event listener executed", {
            eventType: event.type,
            listenerId: (listener as any).id,
          });
        } catch (error) {
          logger.error("Event listener error", {
            error,
            eventType: event.type,
            listenerId: (listener as any).id,
          });
        }
      }

      // Remove once listeners
      for (const listenerId of removeOnceListeners) {
        removeEventListener(listenerId);
      }
    },
    [state.listeners, removeEventListener]
  );

  // Register plugin hooks
  const registerPluginHooks = useCallback(
    async (plugin: Plugin): Promise<void> => {
      try {
        if (!plugin.manifest.hooks) {
          return;
        }

        const { hooks } = plugin.manifest;

        // Register API hooks
        if (hooks.api) {
          for (const hookName of hooks.api) {
            // This would load the actual hook handler from the plugin
            const handler: HookHandler = async (context) => {
              // Plugin hook execution would be implemented here
              logger.debug("Plugin API hook executed", {
                pluginId: plugin.id,
                hookName,
              });
              return context;
            };

            registerHook(hookName, handler, 0, plugin.id);
          }
        }

        // Register UI hooks
        if (hooks.ui) {
          for (const hookName of hooks.ui) {
            const handler: HookHandler = async (context) => {
              logger.debug("Plugin UI hook executed", {
                pluginId: plugin.id,
                hookName,
              });
              return context;
            };

            registerHook(hookName, handler, 0, plugin.id);
          }
        }

        // Register system hooks
        if (hooks.system) {
          for (const hookName of hooks.system) {
            const handler: HookHandler = async (context) => {
              logger.debug("Plugin system hook executed", {
                pluginId: plugin.id,
                hookName,
              });
              return context;
            };

            registerHook(hookName, handler, 0, plugin.id);
          }
        }

        // Register custom hooks
        if (hooks.custom) {
          for (const [hookName, handlerPath] of Object.entries(hooks.custom)) {
            const handler: HookHandler = async (context) => {
              logger.debug("Plugin custom hook executed", {
                pluginId: plugin.id,
                hookName,
                handlerPath,
              });
              return context;
            };

            registerHook(hookName, handler, 0, plugin.id);
          }
        }

        logger.info("Plugin hooks registered", { pluginId: plugin.id });
      } catch (error) {
        logger.error("Plugin hook registration error", {
          error,
          pluginId: plugin.id,
        });
        throw error;
      }
    },
    [registerHook]
  );

  // Unregister plugin hooks
  const unregisterPluginHooks = useCallback(
    async (pluginId: string): Promise<void> => {
      setState((prev) => {
        const newHooks = new Map(prev.hooks);

        for (const [name, hooks] of newHooks.entries()) {
          const filteredHooks = hooks.filter(
            (hook) => hook.pluginId !== pluginId
          );
          newHooks.set(name, filteredHooks);
        }

        return { ...prev, hooks: newHooks };
      });

      logger.info("Plugin hooks unregistered", { pluginId });
    },
    []
  );

  // Get plugin hooks
  const getPluginHooks = useCallback(
    (pluginId: string): Hook[] => {
      const pluginHooks: Hook[] = [];

      for (const hooks of state.hooks.values()) {
        pluginHooks.push(...hooks.filter((hook) => hook.pluginId === pluginId));
      }

      return pluginHooks;
    },
    [state.hooks]
  );

  // Clear all hooks
  const clearHooks = useCallback(() => {
    setState((prev) => ({
      ...prev,
      hooks: new Map(),
      listeners: new Map(),
      events: [],
    }));

    // Clear timeouts
    for (const timeout of hookExecutionTimeouts.current.values()) {
      clearTimeout(timeout);
    }
    hookExecutionTimeouts.current.clear();

    logger.info("All hooks cleared");
  }, []);

  // Get hook statistics
  const getHookStats = useCallback((): HookStats => {
    let totalHooks = 0;
    let activeHooks = 0;
    const hooksByType: Record<string, number> = {};

    for (const [name, hooks] of state.hooks.entries()) {
      totalHooks += hooks.length;
      activeHooks += hooks.filter((hook) => hook.enabled).length;
      hooksByType[name] = hooks.length;
    }

    let listenerCount = 0;
    for (const listeners of state.listeners.values()) {
      listenerCount += listeners.length;
    }

    return {
      totalHooks,
      activeHooks,
      hooksByType,
      eventCount: state.events.length,
      listenerCount,
    };
  }, [state.hooks, state.listeners, state.events]);

  // Auto-register hooks for active plugins
  useEffect(() => {
    const registerActivePluginHooks = async () => {
      for (const plugin of activePlugins) {
        try {
          await registerPluginHooks(plugin);
        } catch (error) {
          logger.error("Failed to register plugin hooks", {
            error,
            pluginId: plugin.id,
          });
        }
      }
    };

    if (activePlugins.length > 0) {
      registerActivePluginHooks();
    }
  }, [activePlugins, registerPluginHooks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all timeouts
      for (const timeout of hookExecutionTimeouts.current.values()) {
        clearTimeout(timeout);
      }
      hookExecutionTimeouts.current.clear();
    };
  }, []);

  // Context value
  const contextValue: PluginHookContextType = {
    hooks: state.hooks,
    events: state.events,
    listeners: state.listeners,
    isLoading: state.isLoading,
    error: state.error,

    registerHook,
    unregisterHook,
    executeHook,
    getHooks,

    addEventListener,
    removeEventListener,
    emitEvent,

    registerPluginHooks,
    unregisterPluginHooks,
    getPluginHooks,

    clearHooks,
    getHookStats,
  };

  return (
    <PluginHookContext.Provider value={contextValue}>
      {children}
    </PluginHookContext.Provider>
  );
}

// Main usePluginHook hook
export function usePluginHook(): PluginHookContextType {
  const context = useContext(PluginHookContext);

  if (!context) {
    throw new Error("usePluginHook must be used within a PluginHookProvider");
  }

  return context;
}

// Hook for specific hook management
export function useHook(hookName: string) {
  const { registerHook, unregisterHook, executeHook, getHooks } =
    usePluginHook();

  const hooks = getHooks(hookName);

  const registerHookHandler = useCallback(
    (handler: HookHandler, priority?: number, pluginId?: string) => {
      return registerHook(hookName, handler, priority, pluginId);
    },
    [registerHook, hookName]
  );

  const executeHookHandler = useCallback(
    (context: HookContext) => {
      return executeHook(hookName, context);
    },
    [executeHook, hookName]
  );

  return {
    hooks,
    register: registerHookHandler,
    unregister: unregisterHook,
    execute: executeHookHandler,
  };
}

// Hook for event management
export function useEvent(eventType: string) {
  const { addEventListener, removeEventListener, emitEvent } = usePluginHook();

  const addListener = useCallback(
    (handler: EventListener["handler"], priority?: number, once?: boolean) => {
      return addEventListener(eventType, handler, priority, once);
    },
    [addEventListener, eventType]
  );

  const emit = useCallback(
    (data: any, category: EventCategory = EventCategory.SYSTEM) => {
      const event: SystemEvent = {
        type: eventType,
        category,
        data,
        timestamp: new Date(),
      };
      return emitEvent(event);
    },
    [emitEvent, eventType]
  );

  return {
    addListener,
    removeListener: removeEventListener,
    emit,
  };
}

export default usePluginHook;
