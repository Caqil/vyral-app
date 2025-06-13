// Upload-specific validation utilities for the social media platform
import crypto from 'crypto'
import path from 'path'
import { FileUpload, ValidationError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { uploadConfig, SecurityConfig } from './config'

// Validation interfaces
export interface UploadValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: string[]
  sanitizedFilename?: string
  detectedMimeType?: string 
  fileHash?: string
}

export interface FileSecurityCheck {
  isSafe: boolean
  threats: SecurityThreat[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

export interface SecurityThreat {
  type: 'malware' | 'suspicious_extension' | 'executable' | 'script' | 'mime_mismatch' | 'size_anomaly'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  recommendation: string
}

export interface FileMetadata {
  filename: string
  size: number
  mimetype: string
  extension: string
  hash: string
  dimensions?: { width: number; height: number }
  duration?: number
  exifData?: Record<string, any>
}

// Main upload validator class
export class UploadValidator {
  private config: SecurityConfig
  private maliciousExtensions: Set<string>
  private executableExtensions: Set<string>
  private scriptExtensions: Set<string>

  constructor() {
    this.config = uploadConfig.getSecurityConfig()
    this.maliciousExtensions = new Set([
      '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js', '.jar',
      '.app', '.deb', '.pkg', '.dmg', '.run', '.msi', '.dll', '.so', '.dylib'
    ])
    this.executableExtensions = new Set([
      '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.app', '.deb', '.pkg',
      '.dmg', '.run', '.msi', '.bin', '.elf'
    ])
    this.scriptExtensions = new Set([
      '.js', '.vbs', '.ps1', '.sh', '.py', '.pl', '.rb', '.php', '.asp', '.jsp'
    ])
  }

  // Main validation method
   async validateFile(file: FileUpload, userId?: string): Promise<UploadValidationResult> {
    const errors: ValidationError[] = []
    const warnings: string[] = []
    const config = uploadConfig.getConfig()

    try {
      // Basic validation
      this.validateBasicRequirements(file, errors)
      
      // File size validation
      this.validateFileSize(file, errors)
      
      // File type validation
      this.validateFileType(file, errors, warnings)
      
      // Filename validation
      const sanitizedFilename = this.validateAndSanitizeFilename(file.filename, errors, warnings)
      
      // Security validation
      const securityCheck = await this.performSecurityCheck(file)
      if (!securityCheck.isSafe) {
        securityCheck.threats.forEach(threat => {
          errors.push({
              field: 'file',
              message: threat.description,
              code: threat.type.toUpperCase(),
              value: file.filename,
              errors: [],
              statusCode: 0,
              isOperational: false,
              name: ''
          })
        })
      }

      // MIME type detection
      const detectedMimeType = await this.detectMimeType(file)
      if (detectedMimeType && detectedMimeType !== file.mimetype) {
        warnings.push(`Detected MIME type (${detectedMimeType}) differs from declared type (${file.mimetype})`)
      }

      // Generate file hash
      const fileHash = await this.generateFileHash(file)

      // Content validation (for specific file types)
      await this.validateFileContent(file, errors, warnings)

      // User-specific validation
      if (userId) {
        await this.validateUserLimits(file, userId, errors)
      }

      const result: UploadValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitizedFilename,
        detectedMimeType: detectedMimeType || undefined,
        fileHash
      }

      if (result.isValid) {
        logger.debug('File validation passed', { 
          filename: file.filename, 
          size: file.size, 
          mimetype: file.mimetype 
        })
      } else {
        logger.warn('File validation failed', { 
          filename: file.filename, 
          errors: errors.length, 
          warnings: warnings.length 
        })
      }

      return result
    } catch (error) {
      logger.error('File validation error', { 
        filename: file.filename, 
        error: error instanceof Error ? error.message : String(error), 
      })
      
      return {
        isValid: false,
        errors: [{
            field: 'file',
            message: 'Validation failed due to internal error',
            code: 'VALIDATION_ERROR',
            value: file.filename,
            errors: [],
            statusCode: 0,
            isOperational: false,
            name: ''
        }],
        warnings: []
      }
    }
  }

  // Basic requirements validation
  private validateBasicRequirements(file: FileUpload, errors: ValidationError[]): void {
    if (!file.filename || file.filename.trim().length === 0) {
      errors.push({
          field: 'filename',
          message: 'Filename is required',
          code: 'REQUIRED_FIELD',
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    if (!file.mimetype || file.mimetype.trim().length === 0) {
      errors.push({
          field: 'mimetype',
          message: 'MIME type is required',
          code: 'REQUIRED_FIELD',
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    if (!file.file) {
      errors.push({
          field: 'file',
          message: 'File content is required',
          code: 'REQUIRED_FIELD',
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    if (file.size <= 0) {
      errors.push({
          field: 'size',
          message: 'File size must be greater than 0',
          code: 'INVALID_SIZE',
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }
  }

  // File size validation
  private validateFileSize(file: FileUpload, errors: ValidationError[]): void {
    const maxSize = uploadConfig.getConfig().maxFileSize

    if (file.size > maxSize) {
      errors.push({
          field: 'size',
          message: `File size exceeds maximum allowed size of ${this.formatBytes(maxSize)}`,
          code: 'FILE_TOO_LARGE',
          value: file.size,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    // Check for suspicious size patterns
    if (file.size < 10 && !file.filename.endsWith('.txt')) {
      errors.push({
          field: 'size',
          message: 'File size is suspiciously small',
          code: 'SUSPICIOUS_SIZE',
          value: file.size,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }
  }

  // File type validation
  private validateFileType(file: FileUpload, errors: ValidationError[], warnings: string[]): void {
    const allowedTypes = uploadConfig.getConfig().allowedTypes
    const extension = path.extname(file.filename).toLowerCase()

    if (!allowedTypes.includes(file.mimetype)) {
      errors.push({
          field: 'mimetype',
          message: `File type ${file.mimetype} is not allowed`,
          code: 'INVALID_FILE_TYPE',
          value: file.mimetype,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    // Check for dangerous extensions
    if (this.maliciousExtensions.has(extension)) {
      errors.push({
          field: 'filename',
          message: `File extension ${extension} is not allowed for security reasons`,
          code: 'DANGEROUS_EXTENSION',
          value: extension,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    // Check for executable files
    if (this.executableExtensions.has(extension)) {
      errors.push({
          field: 'filename',
          message: `Executable files are not allowed`,
          code: 'EXECUTABLE_FILE',
          value: extension,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    // Check for script files
    if (this.scriptExtensions.has(extension)) {
      warnings.push(`Script file detected: ${extension}`)
    }
  }

  // Filename validation and sanitization
  private validateAndSanitizeFilename(filename: string, errors: ValidationError[], warnings: string[]): string {
    // Check filename length
    if (filename.length > this.config.maxFilenameLength) {
      errors.push({
          field: 'filename',
          message: `Filename exceeds maximum length of ${this.config.maxFilenameLength} characters`,
          code: 'FILENAME_TOO_LONG',
          value: filename.length,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    // Check for null bytes
    if (filename.includes('\0')) {
      errors.push({
          field: 'filename',
          message: 'Filename contains null bytes',
          code: 'INVALID_FILENAME',
          value: filename,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }

    // Sanitize filename if enabled
    if (this.config.sanitizeFilenames) {
      const sanitized = this.sanitizeFilename(filename)
      if (sanitized !== filename) {
        warnings.push(`Filename was sanitized from "${filename}" to "${sanitized}"`)
      }
      return sanitized
    }

    return filename
  }

  // Security check
  private async performSecurityCheck(file: FileUpload): Promise<FileSecurityCheck> {
    const threats: SecurityThreat[] = []
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'

    // Check for malicious patterns in filename
    const filename = file.filename.toLowerCase()
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      threats.push({
        type: 'suspicious_extension',
        severity: 'high',
        description: 'Filename contains path traversal characters',
        recommendation: 'Use a sanitized filename'
      })
      riskLevel = 'high'
    }

    // Check file signature vs extension
    const detectedType = await this.detectMimeType(file)
    if (detectedType && detectedType !== file.mimetype) {
      threats.push({
        type: 'mime_mismatch',
        severity: 'medium',
        description: 'File signature does not match declared MIME type',
        recommendation: 'Verify file integrity'
      })
      if (riskLevel === 'low') riskLevel = 'medium'
    }

    // Check for embedded scripts in images
    if (file.mimetype.startsWith('image/')) {
      const hasScript = await this.checkForEmbeddedScripts(file)
      if (hasScript) {
        threats.push({
          type: 'script',
          severity: 'high',
          description: 'Image contains embedded scripts',
          recommendation: 'Strip metadata and reprocess image'
        })
        riskLevel = 'high'
      }
    }

    // Size anomaly check
    if (file.size > 100 * 1024 * 1024) { // 100MB
      threats.push({
        type: 'size_anomaly',
        severity: 'medium',
        description: 'File size is unusually large',
        recommendation: 'Verify file is legitimate'
      })
      if (riskLevel === 'low') riskLevel = 'medium'
    }

    return {
      isSafe: threats.length === 0,
      threats,
      riskLevel
    }
  }

  // MIME type detection
  private async detectMimeType(file: FileUpload): Promise<string | null> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const fileType = await import('file-type')
      const detected = await fileType.fileTypeFromBuffer(buffer)
      return detected?.mime || null
    } catch (error) {
      logger.warn('MIME type detection failed', { error: error })
      return null
    }
  }

  // File hash generation
  private async generateFileHash(file: FileUpload): Promise<string> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const hash = crypto.createHash(this.config.hashAlgorithm)
      hash.update(buffer)
      return hash.digest('hex')
    } catch (error) {
      logger.warn('Hash generation failed', { error: error })
      return ''
    }
  }

  // Content validation for specific file types
  private async validateFileContent(file: FileUpload, errors: ValidationError[], warnings: string[]): Promise<void> {
    try {
      if (file.mimetype.startsWith('image/')) {
        await this.validateImageContent(file, errors, warnings)
      } else if (file.mimetype.startsWith('video/')) {
        await this.validateVideoContent(file, errors, warnings)
      } else if (file.mimetype === 'application/pdf') {
        await this.validatePdfContent(file, errors, warnings)
      }
    } catch (error) {
      logger.warn('Content validation failed', { 
        filename: file.filename, 
        error: error instanceof Error ? error.message : String(error), 
      })
    }
  }

  // Image content validation
  private async validateImageContent(file: FileUpload, errors: ValidationError[], warnings: string[]): Promise<void> {
    try {
      const sharp = await import('sharp')
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const metadata = await sharp.default(buffer).metadata()

      // Check dimensions
      if (metadata.width && metadata.height) {
        const maxDimension = 10000 // 10k pixels
        if (metadata.width > maxDimension || metadata.height > maxDimension) {
          errors.push({
              field: 'dimensions',
              message: `Image dimensions exceed maximum allowed size`,
              code: 'DIMENSIONS_TOO_LARGE',
              value: `${metadata.width}x${metadata.height}`,
              errors: [],
              statusCode: 0,
              isOperational: false,
              name: ''
          })
        }
      }

      // Check for suspicious metadata
      if (metadata.exif) {
        const exifBuffer = metadata.exif
        const exifString = exifBuffer.toString()
        if (exifString.includes('<script>') || exifString.includes('javascript:')) {
          warnings.push('Image contains suspicious EXIF data')
        }
      }
    } catch (error) {
      errors.push({
          field: 'content',
          message: 'Invalid image file',
          code: 'INVALID_IMAGE',
          value: file.filename,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }
  }

  // Video content validation
  private async validateVideoContent(file: FileUpload, errors: ValidationError[], warnings: string[]): Promise<void> {
    // Video validation would require ffmpeg or similar
    // For now, just basic checks
    const maxDuration = 300 // 5 minutes in seconds
    
    // This is a placeholder - actual implementation would analyze video
    logger.debug('Video content validation (placeholder)', { filename: file.filename })
  }

  // PDF content validation
  private async validatePdfContent(file: FileUpload, errors: ValidationError[], warnings: string[]): Promise<void> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const pdfHeader = buffer.slice(0, 4).toString()
      
      if (pdfHeader !== '%PDF') {
        errors.push({
            field: 'content',
            message: 'Invalid PDF file',
            code: 'INVALID_PDF',
            value: file.filename,
            errors: [],
            statusCode: 0,
            isOperational: false,
            name: ''
        })
      }

      // Check for JavaScript in PDF
      const pdfString = buffer.toString('binary')
      if (pdfString.includes('/JavaScript') || pdfString.includes('/JS')) {
        warnings.push('PDF contains JavaScript')
      }
    } catch (error) {
      errors.push({
          field: 'content',
          message: 'Unable to validate PDF content',
          code: 'PDF_VALIDATION_ERROR',
          value: file.filename,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: ''
      })
    }
  }

  // User-specific validation
  private async validateUserLimits(file: FileUpload, userId: string, errors: ValidationError[]): Promise<void> {
    // This would check user-specific limits like quota, file count, etc.
    logger.debug('User limits validation (placeholder)', { userId, filename: file.filename })
  }

  // Check for embedded scripts
  private async checkForEmbeddedScripts(file: FileUpload): Promise<boolean> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const content = buffer.toString('binary')
      
      const scriptPatterns = [
        /<script/i,
        /javascript:/i,
        /onload=/i,
        /onerror=/i,
        /eval\(/i,
        /document\.write/i
      ]
      
      return scriptPatterns.some(pattern => pattern.test(content))
    } catch (error) {
      logger.warn('Script detection failed', { error: error })
      return false
    }
  }

  // Filename sanitization
  private sanitizeFilename(filename: string): string {
    // Remove or replace dangerous characters
    let sanitized = filename
      .replace(/[^\w\s.-]/g, '_') // Replace special chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .toLowerCase()

    // Ensure filename has an extension
    if (!path.extname(sanitized)) {
      const originalExt = path.extname(filename)
      if (originalExt) {
        sanitized += originalExt.toLowerCase()
      }
    }

    // Ensure filename is not empty
    if (!sanitized || sanitized === path.extname(sanitized)) {
      sanitized = `file_${Date.now()}${path.extname(filename)}`
    }

    return sanitized
  }

  // Utility methods
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Batch validation
  async validateFiles(files: FileUpload[], userId?: string): Promise<UploadValidationResult[]> {
    const results: UploadValidationResult[] = []
    
    for (const file of files) {
      const result = await this.validateFile(file, userId)
      results.push(result)
    }
    
    return results
  }

  // Get file metadata
  async getFileMetadata(file: FileUpload): Promise<FileMetadata> {
    const extension = path.extname(file.filename).toLowerCase()
    const hash = await this.generateFileHash(file)
    
    const metadata: FileMetadata = {
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      extension,
      hash
    }

    // Add dimensions for images
    if (file.mimetype.startsWith('image/')) {
      try {
        const sharp = await import('sharp')
        const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
        const imageMetadata = await sharp.default(buffer).metadata()
        
        if (imageMetadata.width && imageMetadata.height) {
          metadata.dimensions = {
            width: imageMetadata.width,
            height: imageMetadata.height
          }
        }
        
        metadata.exifData = imageMetadata.exif
      } catch (error) {
        logger.warn('Failed to extract image metadata', { error: error })
      }
    }

    return metadata
  }
}

// Export validator instance
export const uploadValidator = new UploadValidator()

// Convenience validation functions
export const validateUploadFile = (file: FileUpload, userId?: string): Promise<UploadValidationResult> => {
  return uploadValidator.validateFile(file, userId)
}

export const validateUploadFiles = (files: FileUpload[], userId?: string): Promise<UploadValidationResult[]> => {
  return uploadValidator.validateFiles(files, userId)
}

export const sanitizeUploadFilename = (filename: string): string => {
  return uploadValidator['sanitizeFilename'](filename)
}

export const getUploadFileMetadata = (file: FileUpload): Promise<FileMetadata> => {
  return uploadValidator.getFileMetadata(file)
}