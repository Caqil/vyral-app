// Storage providers for the social media platform
import fs from 'fs/promises'
import path from 'path'
import { v2 as cloudinary } from 'cloudinary'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { FileUpload } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { uploadConfig, LocalStorageConfig, CloudinaryConfig, S3Config } from './config'

// Storage interfaces
export interface StorageProvider {
  upload(file: FileUpload, filename: string, folder?: string): Promise<StorageResult>
  delete(filename: string, folder?: string): Promise<boolean>
  getUrl(filename: string, folder?: string): string
  exists(filename: string, folder?: string): Promise<boolean>
  getMetadata(filename: string, folder?: string): Promise<StorageMetadata | null>
  cleanup(): Promise<number>
}

export interface StorageResult {
  success: boolean
  filename: string
  path: string
  url: string
  size: number
  mimetype: string
  width?: number
  height?: number
  metadata?: Record<string, any>
  error?: string
}

export interface StorageMetadata {
  filename: string
  size: number
  mimetype: string
  lastModified: Date
  etag?: string
  width?: number
  height?: number
  metadata?: Record<string, any>
}

export interface StorageStats {
  totalFiles: number
  totalSize: number
  fileTypes: Record<string, number>
  lastCleanup: Date
  errors: number
}

// Local file system storage
export class LocalStorage implements StorageProvider {
  private config: LocalStorageConfig
  private stats: StorageStats

  constructor() {
    this.config = uploadConfig.getStorageConfig() as LocalStorageConfig
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      fileTypes: {},
      lastCleanup: new Date(),
      errors: 0
    }
    this.ensureDirectoryExists()
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.config.uploadPath, { recursive: true })
      logger.debug('Upload directory ensured', { path: this.config.uploadPath })
    } catch (error) {
      logger.error('Failed to create upload directory', { 
        path: this.config.uploadPath, 
        error: error 
      })
      throw error
    }
  }

  async upload(file: FileUpload, filename: string, folder: string = 'general'): Promise<StorageResult> {
    try {
      const folderPath = path.join(this.config.uploadPath, folder)
      await fs.mkdir(folderPath, { recursive: true })
      
      const filePath = path.join(folderPath, filename)
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      
      await fs.writeFile(filePath, buffer)
      
      const url = this.buildUrl(filename, folder)
      let width: number | undefined
      let height: number | undefined

      // Get image dimensions if it's an image
      if (file.mimetype.startsWith('image/')) {
        try {
          const sharp = await import('sharp')
          const metadata = await sharp.default(buffer).metadata()
          width = metadata.width
          height = metadata.height
        } catch (error) {
          logger.warn('Failed to get image dimensions', { filename, error: error })
        }
      }

      // Update stats
      this.updateStats(file.mimetype, file.size)

      logger.debug('File uploaded to local storage', { filename, folder, size: file.size })

      return {
        success: true,
        filename,
        path: filePath,
        url,
        size: file.size,
        mimetype: file.mimetype,
        width,
        height,
        metadata: {
          storage: 'local',
          folder,
          uploadedAt: new Date()
        }
      }
    } catch (error) {
      this.stats.errors++
      logger.error('Local storage upload failed', { filename, error: error })
      
      return {
        success: false,
        filename,
        path: '',
        url: '',
        size: 0,
        mimetype: file.mimetype,
        error: error instanceof Error ? error.message : String(error), 
      }
    }
  }

  async delete(filename: string, folder: string = 'general'): Promise<boolean> {
    try {
      const filePath = path.join(this.config.uploadPath, folder, filename)
      await fs.unlink(filePath)
      
      logger.debug('File deleted from local storage', { filename, folder })
      return true
    } catch (error) {
      logger.error('Local storage delete failed', { filename, folder, error: error })
      return false
    }
  }

  getUrl(filename: string, folder: string = 'general'): string {
    return this.buildUrl(filename, folder)
  }

  async exists(filename: string, folder: string = 'general'): Promise<boolean> {
    try {
      const filePath = path.join(this.config.uploadPath, folder, filename)
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async getMetadata(filename: string, folder: string = 'general'): Promise<StorageMetadata | null> {
    try {
      const filePath = path.join(this.config.uploadPath, folder, filename)
      const stats = await fs.stat(filePath)
      
      return {
        filename,
        size: stats.size,
        mimetype: this.getMimeTypeFromExtension(filename),
        lastModified: stats.mtime
      }
    } catch (error) {
      logger.error('Failed to get file metadata', { filename, folder, error: error })
      return null
    }
  }

  async cleanup(): Promise<number> {
    let cleanedCount = 0
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
    const now = Date.now()

    try {
      const tempFolder = path.join(this.config.uploadPath, 'temp')
      const files = await fs.readdir(tempFolder).catch(() => [])
      
      for (const file of files) {
        const filePath = path.join(tempFolder, file)
        const stats = await fs.stat(filePath)
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath)
          cleanedCount++
        }
      }

      this.stats.lastCleanup = new Date()
      logger.info('Local storage cleanup completed', { cleanedCount })
    } catch (error) {
      logger.error('Local storage cleanup failed', { error: error })
    }

    return cleanedCount
  }

  private buildUrl(filename: string, folder: string): string {
    const urlPath = `${this.config.publicPath}/${folder}/${filename}`
    return this.config.urlPrefix ? `${this.config.urlPrefix}${urlPath}` : urlPath
  }

  private updateStats(mimetype: string, size: number): void {
    this.stats.totalFiles++
    this.stats.totalSize += size
    
    const type = mimetype.split('/')[0]
    this.stats.fileTypes[type] = (this.stats.fileTypes[type] || 0) + 1
  }

  private getMimeTypeFromExtension(filename: string): string {
    const extension = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav'
    }
    return mimeTypes[extension] || 'application/octet-stream'
  }

  getStats(): StorageStats {
    return { ...this.stats }
  }
}

// Cloudinary storage
export class CloudinaryStorage implements StorageProvider {
  private config: CloudinaryConfig
  private stats: StorageStats

  constructor() {
    this.config = uploadConfig.getStorageConfig() as CloudinaryConfig
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      fileTypes: {},
      lastCleanup: new Date(),
      errors: 0
    }
    this.initializeCloudinary()
  }

  private initializeCloudinary(): void {
    cloudinary.config({
      cloud_name: this.config.cloudName,
      api_key: this.config.apiKey,
      api_secret: this.config.apiSecret
    })
    
    logger.debug('Cloudinary initialized', { cloudName: this.config.cloudName })
  }

  async upload(file: FileUpload, filename: string, folder: string = 'general'): Promise<StorageResult> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const folderPath = `${this.config.folder}/${folder}`
      const publicId = path.parse(filename).name

      const result: any = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: this.config.resourceType,
            folder: folderPath,
            public_id: publicId,
            use_filename: this.config.useFilename,
            unique_filename: this.config.uniqueFilename,
            overwrite: this.config.overwrite,
            transformation: this.config.transformation
          },
          (error, result) => {
            if (error) {
              reject(error)
            } else {
              resolve(result)
            }
          }
        )
        
        uploadStream.end(buffer)
      })

      // Update stats
      this.updateStats(file.mimetype, result.bytes)

      logger.debug('File uploaded to Cloudinary', { 
        filename, 
        folder, 
        publicId: result.public_id,
        size: result.bytes 
      })

      return {
        success: true,
        filename: result.public_id,
        path: result.secure_url,
        url: result.secure_url,
        size: result.bytes,
        mimetype: file.mimetype,
        width: result.width,
        height: result.height,
        metadata: {
          storage: 'cloudinary',
          folder: folderPath,
          publicId: result.public_id,
          version: result.version,
          signature: result.signature,
          uploadedAt: new Date()
        }
      }
    } catch (error) {
      this.stats.errors++
      logger.error('Cloudinary upload failed', { filename, error: error })
      
      return {
        success: false,
        filename,
        path: '',
        url: '',
        size: 0,
        mimetype: file.mimetype,
        error:error instanceof Error ? error.message : String(error), 
      }
    }
  }

  async delete(filename: string, folder: string = 'general'): Promise<boolean> {
    try {
      const publicId = `${this.config.folder}/${folder}/${filename}`
      await cloudinary.uploader.destroy(publicId)
      
      logger.debug('File deleted from Cloudinary', { publicId })
      return true
    } catch (error) {
      logger.error('Cloudinary delete failed', { filename, folder, error: error })
      return false
    }
  }

  getUrl(filename: string, folder: string = 'general'): string {
    const publicId = `${this.config.folder}/${folder}/${filename}`
    return cloudinary.url(publicId)
  }

  async exists(filename: string, folder: string = 'general'): Promise<boolean> {
    try {
      const publicId = `${this.config.folder}/${folder}/${filename}`
      await cloudinary.api.resource(publicId)
      return true
    } catch {
      return false
    }
  }

  async getMetadata(filename: string, folder: string = 'general'): Promise<StorageMetadata | null> {
    try {
      const publicId = `${this.config.folder}/${folder}/${filename}`
      const resource = await cloudinary.api.resource(publicId)
      
      return {
        filename: resource.public_id,
        size: resource.bytes,
        mimetype: resource.resource_type === 'image' ? `image/${resource.format}` : 'application/octet-stream',
        lastModified: new Date(resource.created_at),
        width: resource.width,
        height: resource.height,
        metadata: {
          version: resource.version,
          signature: resource.signature,
          format: resource.format
        }
      }
    } catch (error) {
      logger.error('Failed to get Cloudinary metadata', { filename, folder, error: error })
      return null
    }
  }

  async cleanup(): Promise<number> {
    let cleanedCount = 0
    
    try {
      // Delete resources older than 30 days with no tags
      const result = await cloudinary.api.delete_resources_by_tag('temp', { resource_type: 'auto' })
      cleanedCount = result.deleted ? Object.keys(result.deleted).length : 0
      
      this.stats.lastCleanup = new Date()
      logger.info('Cloudinary cleanup completed', { cleanedCount })
    } catch (error) {
      logger.error('Cloudinary cleanup failed', { error: error })
    }

    return cleanedCount
  }

  private updateStats(mimetype: string, size: number): void {
    this.stats.totalFiles++
    this.stats.totalSize += size
    
    const type = mimetype.split('/')[0]
    this.stats.fileTypes[type] = (this.stats.fileTypes[type] || 0) + 1
  }

  getStats(): StorageStats {
    return { ...this.stats }
  }
}

// AWS S3 storage
export class S3Storage implements StorageProvider {
  private config: S3Config
  private client!: S3Client
  private stats: StorageStats

  constructor() {
    this.config = uploadConfig.getStorageConfig() as S3Config
    this.stats = {
      totalFiles: 0,
      totalSize: 0,
      fileTypes: {},
      lastCleanup: new Date(),
      errors: 0
    }
    this.initializeS3()
  }

  private initializeS3(): void {
    this.client = new S3Client({
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      },
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.pathStyle
    })
    
    logger.debug('S3 client initialized', { region: this.config.region, bucket: this.config.bucket })
  }

  async upload(file: FileUpload, filename: string, folder: string = 'general'): Promise<StorageResult> {
    try {
      const buffer = Buffer.isBuffer(file.file) ? file.file : Buffer.from(await file.file.arrayBuffer())
      const key = `${folder}/${filename}`
      
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
        ACL: this.config.acl,
        StorageClass: this.config.storageClass,
        ServerSideEncryption: this.config.serverSideEncryption ? 'AES256' : undefined,
        Metadata: {
          originalName: file.filename,
          uploadedAt: new Date().toISOString()
        }
      })

      await this.client.send(command)
      
      const url = this.buildS3Url(key)
      
      // Update stats
      this.updateStats(file.mimetype, file.size)

      logger.debug('File uploaded to S3', { filename, folder, key, size: file.size })

      return {
        success: true,
        filename,
        path: key,
        url,
        size: file.size,
        mimetype: file.mimetype,
        metadata: {
          storage: 's3',
          bucket: this.config.bucket,
          key,
          uploadedAt: new Date()
        }
      }
    } catch (error) {
      this.stats.errors++
      logger.error('S3 upload failed', { filename, error: error })
      
      return {
        success: false,
        filename,
        path: '',
        url: '',
        size: 0,
        mimetype: file.mimetype,
        error:error instanceof Error ? error.message : String(error), 
      }
    }
  }

  async delete(filename: string, folder: string = 'general'): Promise<boolean> {
    try {
      const key = `${folder}/${filename}`
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      })

      await this.client.send(command)
      
      logger.debug('File deleted from S3', { key })
      return true
    } catch (error) {
      logger.error('S3 delete failed', { filename, folder, error: error })
      return false
    }
  }

  getUrl(filename: string, folder: string = 'general'): string {
    const key = `${folder}/${filename}`
    return this.buildS3Url(key)
  }

  async exists(filename: string, folder: string = 'general'): Promise<boolean> {
    try {
      const key = `${folder}/${filename}`
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      })

      await this.client.send(command)
      return true
    } catch {
      return false
    }
  }

  async getMetadata(filename: string, folder: string = 'general'): Promise<StorageMetadata | null> {
    try {
      const key = `${folder}/${filename}`
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      })

      const response = await this.client.send(command)
      
      return {
        filename,
        size: response.ContentLength || 0,
        mimetype: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified || new Date(),
        etag: response.ETag,
        metadata: response.Metadata
      }
    } catch (error) {
      logger.error('Failed to get S3 metadata', { filename, folder, error: error })
      return null
    }
  }

  async cleanup(): Promise<number> {
    // S3 cleanup would involve listing and deleting old objects
    // This is a simplified implementation
    logger.info('S3 cleanup not implemented')
    return 0
  }

  private buildS3Url(key: string): string {
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.config.bucket}/${key}`
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`
  }

  private updateStats(mimetype: string, size: number): void {
    this.stats.totalFiles++
    this.stats.totalSize += size
    
    const type = mimetype.split('/')[0]
    this.stats.fileTypes[type] = (this.stats.fileTypes[type] || 0) + 1
  }

  getStats(): StorageStats {
    return { ...this.stats }
  }
}

// Storage factory
export class StorageFactory {
  static createStorage(): StorageProvider {
    const storageType = uploadConfig.getConfig().storage
    
    switch (storageType) {
      case 'local':
        return new LocalStorage()
      case 'cloudinary':
        return new CloudinaryStorage()
      case 's3':
        return new S3Storage()
      default:
        throw new Error(`Unknown storage type: ${storageType}`)
    }
  }
}

// Export storage instance
export const storage = StorageFactory.createStorage()