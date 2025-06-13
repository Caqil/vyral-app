import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'
import { v2 as cloudinary } from 'cloudinary'
import { FileUpload, UploadResponse, ValidationError } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { HookManager } from '@/core/plugins/system/HookManager'

export interface UploadConfig {
  maxFileSize: number
  allowedTypes: string[]
  storage: 'local' | 'cloudinary' | 's3'
  uploadPath: string
  publicPath: string
  imageOptimization: boolean
  generateThumbnails: boolean
  thumbnailSizes: { width: number; height: number; name: string }[]
}

export interface ProcessedFile {
  original: FileData
  optimized?: FileData
  thumbnails?: FileData[]
}

export interface FileData {
  filename: string
  path: string
  url: string
  size: number
  mimetype: string
  width?: number
  height?: number
}

export interface UploadHooks {
  beforeUpload?: (file: FileUpload, userId?: string) => Promise<FileUpload | null>
  afterUpload?: (result: ProcessedFile, userId?: string) => Promise<void>
  beforeDelete?: (filename: string, userId?: string) => Promise<boolean>
  afterDelete?: (filename: string, userId?: string) => Promise<void>
  onUploadError?: (error: Error, file: FileUpload, userId?: string) => Promise<void>
}

export interface StoredFile {
  id: string
  filename: string
  originalName: string
  mimetype: string
  size: number
  path: string
  url: string
  userId?: string
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export class UploadService {
  private static instance: UploadService
  private config: UploadConfig
  private hooks: UploadHooks = {}
  private hookManager: HookManager
  private uploadedFiles: Map<string, StoredFile> = new Map()
  private userFiles: Map<string, string[]> = new Map()

  private constructor() {
    this.hookManager = HookManager.getInstance()
    this.config = this.loadConfig()
    this.initializeStorage()
    this.registerHooks()
  }

  public static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService()
    }
    return UploadService.instance
  }

  private loadConfig(): UploadConfig {
    return {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
      allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mp3,audio/wav,application/pdf').split(','),
      storage: (process.env.UPLOAD_STORAGE as any) || 'local',
      uploadPath: process.env.UPLOAD_PATH || path.join(process.cwd(), 'public', 'uploads'),
      publicPath: process.env.PUBLIC_PATH || '/uploads',
      imageOptimization: process.env.IMAGE_OPTIMIZATION === 'true',
      generateThumbnails: process.env.GENERATE_THUMBNAILS === 'true',
      thumbnailSizes: [
        { width: 150, height: 150, name: 'thumb' },
        { width: 300, height: 300, name: 'small' },
        { width: 600, height: 600, name: 'medium' },
        { width: 1200, height: 1200, name: 'large' }
      ]
    }
  }

  private initializeStorage(): void {
    if (this.config.storage === 'cloudinary') {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      })
    }

    logger.info('Upload service initialized', { storage: this.config.storage })
  }

  private registerHooks(): void {
    this.hookManager.registerHook('upload.beforeUpload', this.executeBeforeUpload.bind(this))
    this.hookManager.registerHook('upload.afterUpload', this.executeAfterUpload.bind(this))
    this.hookManager.registerHook('upload.beforeDelete', this.executeBeforeDelete.bind(this))
    this.hookManager.registerHook('upload.afterDelete', this.executeAfterDelete.bind(this))
    this.hookManager.registerHook('upload.onError', this.executeOnUploadError.bind(this))
  }

  async uploadFile(file: FileUpload, userId?: string, options?: { 
    folder?: string; 
    generateThumbnails?: boolean; 
    optimize?: boolean 
  }): Promise<UploadResponse> {
    try {
      logger.info('Starting file upload', { 
        filename: file.filename, 
        size: file.size, 
        type: file.mimetype, 
        userId 
      })

      // Execute before upload hook
      const processedFile = await this.executeBeforeUpload(file, userId)
      if (!processedFile) {
        throw new ValidationError('File upload blocked by plugin')
      }

      // Validate file
      await this.validateFile(processedFile)

      // Generate unique filename
      const filename = await this.generateUniqueFilename(processedFile.filename, processedFile.mimetype)
      
      // Process and store file
      const result = await this.processAndStoreFile(processedFile, filename, userId, options)

      // Store file metadata
      const storedFile = await this.storeFileMetadata(result, userId)

      // Execute after upload hook
      await this.executeAfterUpload(result, userId)

      logger.info('File uploaded successfully', { 
        filename: result.original.filename, 
        url: result.original.url, 
        userId 
      })

      return {
        success: true,
        url: result.original.url,
        filename: result.original.filename,
        size: result.original.size,
        type: result.original.mimetype
      }
    } catch (error) {
      logger.error('File upload failed', { error: error, filename: file.filename, userId })
      
      await this.executeOnUploadError(error, file, userId)
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error), 
      }
    }
  }

  async uploadMultipleFiles(files: FileUpload[], userId?: string, options?: { 
    folder?: string; 
    generateThumbnails?: boolean; 
    optimize?: boolean 
  }): Promise<UploadResponse[]> {
    const results: UploadResponse[] = []

    for (const file of files) {
      const result = await this.uploadFile(file, userId, options)
      results.push(result)
    }

    return results
  }

  async deleteFile(filename: string, userId?: string): Promise<boolean> {
    try {
      const fileId = this.findFileIdByFilename(filename)
      const storedFile = fileId ? this.uploadedFiles.get(fileId) : null
      
      if (!storedFile) {
        throw new ValidationError('File not found')
      }

      // Check permissions
      if (storedFile.userId && storedFile.userId !== userId) {
        throw new ValidationError('Unauthorized to delete this file')
      }

      // Execute before delete hook
      const canDelete = await this.executeBeforeDelete(filename, userId)
      if (!canDelete) {
        throw new ValidationError('File deletion blocked by plugin')
      }

      // Delete from storage
      await this.deleteFromStorage(storedFile)

      // Remove from metadata
      this.uploadedFiles.delete(fileId)
      
      // Remove from user files
      if (storedFile.userId) {
        const userFileList = this.userFiles.get(storedFile.userId) || []
        const updatedList = userFileList.filter(id => id !== fileId)
        this.userFiles.set(storedFile.userId, updatedList)
      }

      // Execute after delete hook
      await this.executeAfterDelete(filename, userId)

      logger.info('File deleted successfully', { filename, userId })
      return true
    } catch (error) {
      logger.error('File deletion failed', { error: error, filename, userId })
      return false
    }
  }

  async getFile(filename: string): Promise<StoredFile | null> {
    const fileId = this.findFileIdByFilename(filename)
    return fileId ? this.uploadedFiles.get(fileId) || null : null
  }

  async getUserFiles(userId: string, limit?: number, offset?: number): Promise<StoredFile[]> {
    const userFileIds = this.userFiles.get(userId) || []
    const files = userFileIds
      .map(id => this.uploadedFiles.get(id))
      .filter(file => file !== undefined) as StoredFile[]
    
    // Sort by creation date (newest first)
    files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Apply pagination
    const start = offset || 0
    const end = limit ? start + limit : undefined
    
    return files.slice(start, end)
  }

  async getFileStats(userId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    fileTypes: Record<string, number>;
    storageUsed: number;
  }> {
    let files: StoredFile[]
    
    if (userId) {
      files = await this.getUserFiles(userId)
    } else {
      files = Array.from(this.uploadedFiles.values())
    }

    const totalFiles = files.length
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const fileTypes: Record<string, number> = {}
    
    files.forEach(file => {
      const type = file.mimetype.split('/')[0]
      fileTypes[type] = (fileTypes[type] || 0) + 1
    })

    return {
      totalFiles,
      totalSize,
      fileTypes,
      storageUsed: totalSize
    }
  }

  async cleanupOrphanedFiles(): Promise<number> {
    try {
      let cleanedCount = 0
      const now = new Date()
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours

      // Find files older than maxAge with no associated user
      for (const [fileId, file] of this.uploadedFiles.entries()) {
        if (!file.userId && (now.getTime() - file.createdAt.getTime()) > maxAge) {
          await this.deleteFromStorage(file)
          this.uploadedFiles.delete(fileId)
          cleanedCount++
        }
      }

      logger.info('Orphaned files cleaned up', { count: cleanedCount })
      return cleanedCount
    } catch (error) {
      logger.error('Cleanup failed', { error: error})
      return 0
    }
  }

  // Private methods
  private async validateFile(file: FileUpload): Promise<void> {
    // Check file size
    if (file.size > this.config.maxFileSize) {
      throw new ValidationError(`File size exceeds maximum allowed size of ${this.config.maxFileSize} bytes`)
    }

    // Check file type
    if (!this.config.allowedTypes.includes(file.mimetype)) {
      throw new ValidationError(`File type ${file.mimetype} is not allowed`)
    }

    // Check filename
    if (!file.filename || file.filename.length === 0) {
      throw new ValidationError('Filename is required')
    }

    // Check for malicious files
    if (this.isMaliciousFile(file)) {
      throw new ValidationError('File appears to be malicious')
    }
  }

  private isMaliciousFile(file: FileUpload): boolean {
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.js', '.vbs', '.jar']
    const extension = path.extname(file.filename.toLowerCase())
    return dangerousExtensions.includes(extension)
  }

  private async generateUniqueFilename(originalFilename: string, mimetype: string): Promise<string> {
    const timestamp = Date.now()
    const randomBytes = crypto.randomBytes(8).toString('hex')
    const extension = path.extname(originalFilename)
    const baseName = path.basename(originalFilename, extension)
    
    return `${baseName}-${timestamp}-${randomBytes}${extension}`
  }

  private async processAndStoreFile(
    file: FileUpload, 
    filename: string, 
    userId?: string, 
    options?: any
  ): Promise<ProcessedFile> {
    const folder = options?.folder || 'general'
    const isImage = file.mimetype.startsWith('image/')
    
    // Create processed file result
    const result: ProcessedFile = {
      original: await this.storeFile(file, filename, folder)
    }

    // Optimize image if requested and applicable
    if (isImage && (options?.optimize || this.config.imageOptimization)) {
      result.optimized = await this.optimizeImage(file, filename, folder)
    }

    // Generate thumbnails if requested and applicable
    if (isImage && (options?.generateThumbnails || this.config.generateThumbnails)) {
      result.thumbnails = await this.generateThumbnails(file, filename, folder)
    }

    return result
  }

  private async storeFile(file: FileUpload, filename: string, folder: string): Promise<FileData> {
    switch (this.config.storage) {
      case 'local':
        return await this.storeFileLocally(file, filename, folder)
      case 'cloudinary':
        return await this.storeFileOnCloudinary(file, filename, folder)
      case 's3':
        return await this.storeFileOnS3(file, filename, folder)
      default:
        throw new Error(`Unsupported storage type: ${this.config.storage}`)
    }
  }

  private async storeFileLocally(file: FileUpload, filename: string, folder: string): Promise<FileData> {
    const folderPath = path.join(this.config.uploadPath, folder)
    await fs.mkdir(folderPath, { recursive: true })
    
    const filePath = path.join(folderPath, filename)
    const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
    
    await fs.writeFile(filePath, buffer)
    
    const url = `${this.config.publicPath}/${folder}/${filename}`
    
    // Get image dimensions if it's an image
    let width, height
    if (file.mimetype.startsWith('image/')) {
      try {
        const metadata = await sharp(buffer).metadata()
        width = metadata.width
        height = metadata.height
      } catch (error) {
        logger.warn('Failed to get image dimensions', { filename, error: error })
      }
    }

    return {
      filename,
      path: filePath,
      url,
      size: file.size,
      mimetype: file.mimetype,
      width,
      height
    }
  }

  private async storeFileOnCloudinary(file: FileUpload, filename: string, folder: string): Promise<FileData> {
    const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
    
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: folder,
          public_id: path.parse(filename).name,
          use_filename: true,
          unique_filename: false
        },
        (error, result) => {
          if (error) {
            reject(error)
          } else if (result) {
            resolve({
              filename: result.public_id,
              path: result.secure_url,
              url: result.secure_url,
              size: result.bytes,
              mimetype: file.mimetype,
              width: result.width,
              height: result.height
            })
          }
        }
      )
      
      uploadStream.end(buffer)
    })
  }

  private async storeFileOnS3(file: FileUpload, filename: string, folder: string): Promise<FileData> {
    // S3 implementation would go here
    throw new Error('S3 storage not implemented yet')
  }

  private async optimizeImage(file: FileUpload, filename: string, folder: string): Promise<FileData> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const optimizedBuffer = await sharp(buffer)
        .jpeg({ quality: 80, progressive: true })
        .toBuffer()

      const optimizedFilename = filename.replace(/\.[^/.]+$/, '-optimized.jpg')
      const optimizedFile: FileUpload = {
        file: optimizedBuffer,
        filename: optimizedFilename,
        mimetype: 'image/jpeg',
        size: optimizedBuffer.length
      }

      return await this.storeFile(optimizedFile, optimizedFilename, folder)
    } catch (error) {
      logger.warn('Image optimization failed', { filename, error: error })
      throw error
    }
  }

  private async generateThumbnails(file: FileUpload, filename: string, folder: string): Promise<FileData[]> {
    const thumbnails: FileData[] = []
    const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())

    for (const size of this.config.thumbnailSizes) {
      try {
        const thumbnailBuffer = await sharp(buffer)
          .resize(size.width, size.height, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer()

        const thumbnailFilename = filename.replace(/\.[^/.]+$/, `-${size.name}.jpg`)
        const thumbnailFile: FileUpload = {
          file: thumbnailBuffer,
          filename: thumbnailFilename,
          mimetype: 'image/jpeg',
          size: thumbnailBuffer.length
        }

        const thumbnail = await this.storeFile(thumbnailFile, thumbnailFilename, folder)
        thumbnails.push(thumbnail)
      } catch (error) {
        logger.warn('Thumbnail generation failed', { filename, size: size.name, error: error })
      }
    }

    return thumbnails
  }

  private async storeFileMetadata(result: ProcessedFile, userId?: string): Promise<StoredFile> {
    const fileId = this.generateId()
    const storedFile: StoredFile = {
      id: fileId,
      filename: result.original.filename,
      originalName: result.original.filename,
      mimetype: result.original.mimetype,
      size: result.original.size,
      path: result.original.path,
      url: result.original.url,
      userId,
      metadata: {
        optimized: result.optimized,
        thumbnails: result.thumbnails,
        width: result.original.width,
        height: result.original.height
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }

    this.uploadedFiles.set(fileId, storedFile)

    if (userId) {
      if (!this.userFiles.has(userId)) {
        this.userFiles.set(userId, [])
      }
      this.userFiles.get(userId)!.push(fileId)
    }

    return storedFile
  }

  private async deleteFromStorage(file: StoredFile): Promise<void> {
    switch (this.config.storage) {
      case 'local':
        await this.deleteFileLocally(file)
        break
      case 'cloudinary':
        await this.deleteFileFromCloudinary(file)
        break
      case 's3':
        await this.deleteFileFromS3(file)
        break
    }
  }

  private async deleteFileLocally(file: StoredFile): Promise<void> {
    try {
      await fs.unlink(file.path)
      
      // Delete thumbnails and optimized versions
      if (file.metadata?.thumbnails) {
        for (const thumbnail of file.metadata.thumbnails) {
          try {
            await fs.unlink(thumbnail.path)
          } catch (error) {
            logger.warn('Failed to delete thumbnail', { path: thumbnail.path })
          }
        }
      }
      
      if (file.metadata?.optimized) {
        try {
          await fs.unlink(file.metadata.optimized.path)
        } catch (error) {
          logger.warn('Failed to delete optimized image', { path: file.metadata.optimized.path })
        }
      }
    } catch (error) {
      logger.warn('Failed to delete file from local storage', { path: file.path, error: error })
    }
  }

  private async deleteFileFromCloudinary(file: StoredFile): Promise<void> {
    try {
      const publicId = file.filename.replace(/\.[^/.]+$/, '')
      await cloudinary.uploader.destroy(publicId)
    } catch (error) {
      logger.warn('Failed to delete file from Cloudinary', { filename: file.filename, error: error })
    }
  }

  private async deleteFileFromS3(file: StoredFile): Promise<void> {
    // S3 deletion implementation would go here
    logger.warn('S3 deletion not implemented yet')
  }

  private findFileIdByFilename(filename: string): string | null {
    for (const [fileId, file] of this.uploadedFiles.entries()) {
      if (file.filename === filename) {
        return fileId
      }
    }
    return null
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  // Hook execution methods
  private async executeBeforeUpload(file: FileUpload, userId?: string): Promise<FileUpload | null> {
    if (this.hooks.beforeUpload) {
      return await this.hooks.beforeUpload(file, userId)
    }
    return file
  }

  private async executeAfterUpload(result: ProcessedFile, userId?: string): Promise<void> {
    if (this.hooks.afterUpload) {
      await this.hooks.afterUpload(result, userId)
    }
  }

  private async executeBeforeDelete(filename: string, userId?: string): Promise<boolean> {
    if (this.hooks.beforeDelete) {
      return await this.hooks.beforeDelete(filename, userId)
    }
    return true
  }

  private async executeAfterDelete(filename: string, userId?: string): Promise<void> {
    if (this.hooks.afterDelete) {
      await this.hooks.afterDelete(filename, userId)
    }
  }

  private async executeOnUploadError(error: Error, file: FileUpload, userId?: string): Promise<void> {
    if (this.hooks.onUploadError) {
      await this.hooks.onUploadError(error, file, userId)
    }
  }
}