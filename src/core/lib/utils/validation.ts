// Comprehensive validation utilities for the social media platform
import { ValidationError } from '@/core/types'
import { VALIDATION } from './constants'

// Validation result interface
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

// Field validation rule interface
export interface ValidationRule {
  field: string
  required?: boolean
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url' | 'date'
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: RegExp
  options?: any[]
  custom?: (value: any) => boolean | string
  message?: string
}

// Validation schema interface
export interface ValidationSchema {
  [field: string]: ValidationRule | ValidationRule[]
}

// Core validation class
export class Validator {
  private errors: ValidationError[] = []

  // Reset errors for new validation
  private reset(): void {
    this.errors = []
  }

  // Add validation error
  private addError(field: string, message: string, code: string, value?: any): void {
    this.errors.push({
        field,
        message,
        code,
        value,
        errors: [],
        statusCode: 0,
        isOperational: false,
        name: ''
    })
  }

  // Validate single value against rules
  validateField(field: string, value: any, rules: ValidationRule | ValidationRule[]): ValidationResult {
    this.reset()
    
    const ruleArray = Array.isArray(rules) ? rules : [rules]
    
    for (const rule of ruleArray) {
      this.applyRule(field, value, rule)
    }
    
    return {
      isValid: this.errors.length === 0,
      errors: [...this.errors]
    }
  }

  // Validate object against schema
  validateObject(data: Record<string, any>, schema: ValidationSchema): ValidationResult {
    this.reset()
    
    // Check for required fields
    for (const [field, rules] of Object.entries(schema)) {
      const ruleArray = Array.isArray(rules) ? rules : [rules]
      const value = data[field]
      
      for (const rule of ruleArray) {
        this.applyRule(field, value, rule)
      }
    }
    
    return {
      isValid: this.errors.length === 0,
      errors: [...this.errors]
    }
  }

  // Apply single validation rule
  private applyRule(field: string, value: any, rule: ValidationRule): void {
    const { required = false, type, minLength, maxLength, min, max, pattern, options, custom, message } = rule

    // Check required
    if (required && (value === undefined || value === null || value === '')) {
      this.addError(field, message || `${field} is required`, 'REQUIRED_FIELD', value)
      return
    }

    // Skip further validation if value is empty and not required
    if (value === undefined || value === null || value === '') {
      return
    }

    // Type validation
    if (type && !this.validateType(value, type)) {
      this.addError(field, message || `${field} must be of type ${type}`, 'INVALID_TYPE', value)
      return
    }

    // String length validation
    if (typeof value === 'string') {
      if (minLength !== undefined && value.length < minLength) {
        this.addError(field, message || `${field} must be at least ${minLength} characters`, 'MIN_LENGTH', value)
      }
      if (maxLength !== undefined && value.length > maxLength) {
        this.addError(field, message || `${field} must be at most ${maxLength} characters`, 'MAX_LENGTH', value)
      }
    }

    // Numeric range validation
    if (typeof value === 'number') {
      if (min !== undefined && value < min) {
        this.addError(field, message || `${field} must be at least ${min}`, 'MIN_VALUE', value)
      }
      if (max !== undefined && value > max) {
        this.addError(field, message || `${field} must be at most ${max}`, 'MAX_VALUE', value)
      }
    }

    // Array length validation
    if (Array.isArray(value)) {
      if (minLength !== undefined && value.length < minLength) {
        this.addError(field, message || `${field} must have at least ${minLength} items`, 'MIN_ITEMS', value)
      }
      if (maxLength !== undefined && value.length > maxLength) {
        this.addError(field, message || `${field} must have at most ${maxLength} items`, 'MAX_ITEMS', value)
      }
    }

    // Pattern validation
    if (pattern && typeof value === 'string' && !pattern.test(value)) {
      this.addError(field, message || `${field} format is invalid`, 'PATTERN_MISMATCH', value)
    }

    // Options validation
    if (options && !options.includes(value)) {
      this.addError(field, message || `${field} must be one of: ${options.join(', ')}`, 'INVALID_OPTION', value)
    }

    // Custom validation
    if (custom) {
      const result = custom(value)
      if (result !== true) {
        const errorMessage = typeof result === 'string' ? result : (message || `${field} failed custom validation`)
        this.addError(field, errorMessage, 'CUSTOM_VALIDATION', value)
      }
    }
  }

  // Type validation helper
  private validateType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && !isNaN(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'array':
        return Array.isArray(value)
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'email':
        return typeof value === 'string' && VALIDATION.EMAIL.REGEX.test(value)
      case 'url':
        return typeof value === 'string' && this.isValidURL(value)
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))
      default:
        return true
    }
  }

  // URL validation helper
  private isValidURL(string: string): boolean {
    try {
      new URL(string)
      return true
    } catch {
      return false
    }
  }
}

// Singleton validator instance
export const validator = new Validator()

// Specific validation functions for common use cases

// Email validation
export const validateEmail = (email: string): ValidationResult => {
  return validator.validateField('email', email, {
    field: 'email',
    required: true,
    type: 'email',
    minLength: VALIDATION.EMAIL.MIN_LENGTH,
    maxLength: VALIDATION.EMAIL.MAX_LENGTH,
    pattern: VALIDATION.EMAIL.REGEX
  })
}

// Password validation
export const validatePassword = (password: string): ValidationResult => {
  return validator.validateField('password', password, {
    field: 'password',
    required: true,
    type: 'string',
    minLength: VALIDATION.PASSWORD.MIN_LENGTH,
    maxLength: VALIDATION.PASSWORD.MAX_LENGTH,
    custom: (value: string) => {
      if (!VALIDATION.PASSWORD.REGEX.test(value)) {
        return 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      }
      return true
    }
  })
}

// Username validation
export const validateUsername = (username: string): ValidationResult => {
  return validator.validateField('username', username, {
    field: 'username',
    required: true,
    type: 'string',
    minLength: VALIDATION.USERNAME.MIN_LENGTH,
    maxLength: VALIDATION.USERNAME.MAX_LENGTH,
    pattern: VALIDATION.USERNAME.REGEX,
    message: 'Username can only contain letters, numbers, and underscores'
  })
}

// Plugin ID validation
export const validatePluginId = (pluginId: string): ValidationResult => {
  return validator.validateField('pluginId', pluginId, {
    field: 'pluginId',
    required: true,
    type: 'string',
    pattern: VALIDATION.PLUGIN_ID.REGEX,
    message: 'Plugin ID can only contain letters, numbers, hyphens, and underscores'
  })
}

// Version validation
export const validateVersion = (version: string): ValidationResult => {
  return validator.validateField('version', version, {
    field: 'version',
    required: true,
    type: 'string',
    pattern: VALIDATION.VERSION.REGEX,
    message: 'Version must follow semantic versioning format (x.y.z)'
  })
}

// Configuration key validation
export const validateConfigKey = (key: string): ValidationResult => {
  return validator.validateField('key', key, {
    field: 'key',
    required: true,
    type: 'string',
    pattern: VALIDATION.CONFIG_KEY.REGEX,
    message: 'Config key can only contain letters, numbers, dots, and underscores'
  })
}

// File type validation
export const validateFileType = (filename: string, allowedTypes: string[]): ValidationResult => {
  const extension = filename.toLowerCase().split('.').pop()
  const mimeType = getMimeTypeFromExtension(extension || '')
  
  return validator.validateField('file', mimeType, {
    field: 'file',
    required: true,
    options: allowedTypes,
    message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
  })
}

// File size validation
export const validateFileSize = (size: number, maxSize: number): ValidationResult => {
  return validator.validateField('fileSize', size, {
    field: 'fileSize',
    required: true,
    type: 'number',
    max: maxSize,
    message: `File size exceeds maximum allowed size of ${formatBytes(maxSize)}`
  })
}

// Pagination validation
export const validatePagination = (page?: number, limit?: number): ValidationResult => {
  const validator = new Validator()
  const result = validator.validateObject({ page, limit }, {
    page: {
      field: 'page',
      required: false,
      type: 'number',
      min: 1,
      message: 'Page must be a positive number'
    },
    limit: {
      field: 'limit',
      required: false,
      type: 'number',
      min: 1,
      max: 100,
      message: 'Limit must be between 1 and 100'
    }
  })
  
  return result
}

// User registration validation
export const validateUserRegistration = (data: {
  email: string
  password: string
  username?: string
  name?: string
}): ValidationResult => {
  return validator.validateObject(data, {
    email: {
      field: 'email',
      required: true,
      type: 'email',
      minLength: VALIDATION.EMAIL.MIN_LENGTH,
      maxLength: VALIDATION.EMAIL.MAX_LENGTH
    },
    password: {
      field: 'password',
      required: true,
      type: 'string',
      minLength: VALIDATION.PASSWORD.MIN_LENGTH,
      maxLength: VALIDATION.PASSWORD.MAX_LENGTH,
      custom: (value: string) => VALIDATION.PASSWORD.REGEX.test(value) || 'Password must contain uppercase, lowercase, number, and special character'
    },
    username: {
      field: 'username',
      required: false,
      type: 'string',
      minLength: VALIDATION.USERNAME.MIN_LENGTH,
      maxLength: VALIDATION.USERNAME.MAX_LENGTH,
      pattern: VALIDATION.USERNAME.REGEX
    },
    name: {
      field: 'name',
      required: false,
      type: 'string',
      maxLength: 100
    }
  })
}

// Plugin manifest validation
export const validatePluginManifest = (manifest: any): ValidationResult => {
  return validator.validateObject(manifest, {
    name: {
      field: 'name',
      required: true,
      type: 'string',
      minLength: 3,
      maxLength: 50
    },
    version: {
      field: 'version',
      required: true,
      type: 'string',
      pattern: VALIDATION.VERSION.REGEX
    },
    description: {
      field: 'description',
      required: true,
      type: 'string',
      maxLength: 1000
    },
    author: {
      field: 'author',
      required: true,
      type: 'string',
      maxLength: 100
    },
    permissions: {
      field: 'permissions',
      required: false,
      type: 'array'
    },
    dependencies: {
      field: 'dependencies',
      required: false,
      type: 'object'
    }
  })
}

// Helper functions
export const getMimeTypeFromExtension = (extension: string): string => {
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'json': 'application/json',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'ogg': 'video/ogg'
  }
  
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
}

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Sanitization functions
export const sanitizeString = (input: string): string => {
  return input.trim().replace(/[<>]/g, '')
}

export const sanitizeEmail = (email: string): string => {
  return email.toLowerCase().trim()
}

export const sanitizeUsername = (username: string): string => {
  return username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '')
}

// Create custom validator with schema
export const createValidator = (schema: ValidationSchema) => {
  return (data: Record<string, any>): ValidationResult => {
    return validator.validateObject(data, schema)
  }
}