// Upload configuration management for the social media platform
import { UPLOAD } from '@/core/lib/utils/constants'
import { logger } from '@/core/lib/utils/logger'

// Upload configuration interfaces
export interface UploadConfig {
  maxFileSize: number
  allowedTypes: string[]
  storage: StorageProvider
  local: LocalStorageConfig
  cloudinary: CloudinaryConfig
  s3: S3Config
  imageOptimization: ImageOptimizationConfig
  thumbnails: ThumbnailConfig
  security: SecurityConfig
  performance: PerformanceConfig
}

export interface LocalStorageConfig {
  uploadPath: string
  publicPath: string
  urlPrefix: string
  createDirectories: boolean
  preserveExtension: boolean
}

export interface CloudinaryConfig {
  cloudName: string
  apiKey: string
  apiSecret: string
  folder: string
  resourceType: 'auto' | 'image' | 'video' | 'raw'
  useFilename: boolean
  uniqueFilename: boolean
  overwrite: boolean
  transformation: CloudinaryTransformation[]
}

export interface CloudinaryTransformation {
  width?: number
  height?: number
  crop?: 'fill' | 'fit' | 'scale' | 'crop' | 'thumb'
  quality?: number | 'auto'
  format?: 'auto' | 'jpg' | 'png' | 'webp'
  gravity?: 'auto' | 'center' | 'face' | 'faces'
}

export interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  acl: 'private' | 'public-read' | 'public-read-write'
  serverSideEncryption: boolean
  storageClass: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'STANDARD_IA' | 'ONEZONE_IA'
  endpoint?: string
  pathStyle?: boolean
}

export interface ImageOptimizationConfig {
  enabled: boolean
  quality: number
  format: 'auto' | 'jpeg' | 'png' | 'webp'
  progressive: boolean
  stripMetadata: boolean
  maxWidth?: number
  maxHeight?: number
  watermark?: WatermarkConfig
}

export interface WatermarkConfig {
  enabled: boolean
  imagePath: string
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  opacity: number
  size: number
}

export interface ThumbnailConfig {
  enabled: boolean
  sizes: ThumbnailSize[]
  format: 'auto' | 'jpeg' | 'png' | 'webp'
  quality: number
  naming: 'suffix' | 'folder'
  concurrent: number
}

export interface ThumbnailSize {
  name: string
  width: number
  height: number
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
  position?: 'center' | 'top' | 'right' | 'bottom' | 'left'
}

export interface SecurityConfig {
  scanFiles: boolean
  allowedExtensions: string[]
  blockedExtensions: string[]
  maxFilenameLength: number
  sanitizeFilenames: boolean
  checkMimeType: boolean
  antivirusEnabled: boolean
  hashAlgorithm: 'md5' | 'sha1' | 'sha256'
}

export interface PerformanceConfig {
  uploadTimeout: number
  chunkSize: number
  concurrentUploads: number
  retryAttempts: number
  retryDelay: number
  cacheEnabled: boolean
  cacheTtl: number
  compressionEnabled: boolean
  compressionLevel: number
}

export type StorageProvider = 'local' | 'cloudinary' | 's3'

// Configuration manager class
export class UploadConfigManager {
  private static instance: UploadConfigManager
  private config: UploadConfig

  private constructor() {
    this.config = this.loadConfiguration()
    this.validateConfiguration()
  }

  public static getInstance(): UploadConfigManager {
    if (!UploadConfigManager.instance) {
      UploadConfigManager.instance = new UploadConfigManager()
    }
    return UploadConfigManager.instance
  }

  private loadConfiguration(): UploadConfig {
    const storage = (process.env.UPLOAD_STORAGE as StorageProvider) || 'local'
    
    return {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || UPLOAD.MAX_FILE_SIZE.toString()),
      allowedTypes: this.parseAllowedTypes(),
      storage,
      local: this.loadLocalConfig(),
      cloudinary: this.loadCloudinaryConfig(),
      s3: this.loadS3Config(),
      imageOptimization: this.loadImageOptimizationConfig(),
      thumbnails: this.loadThumbnailConfig(),
      security: this.loadSecurityConfig(),
      performance: this.loadPerformanceConfig()
    }
  }

  private parseAllowedTypes(): string[] {
    const defaultTypes = [
      ...UPLOAD.ALLOWED_IMAGE_TYPES,
      ...UPLOAD.ALLOWED_DOCUMENT_TYPES,
      ...UPLOAD.ALLOWED_VIDEO_TYPES
    ]
    
    const envTypes = process.env.ALLOWED_FILE_TYPES
    if (envTypes) {
      return envTypes.split(',').map(type => type.trim())
    }
    
    return defaultTypes
  }

  private loadLocalConfig(): LocalStorageConfig {
    return {
      uploadPath: process.env.UPLOAD_PATH || './uploads',
      publicPath: process.env.PUBLIC_PATH || '/uploads',
      urlPrefix: process.env.UPLOAD_URL_PREFIX || '',
      createDirectories: process.env.CREATE_DIRECTORIES !== 'false',
      preserveExtension: process.env.PRESERVE_EXTENSION !== 'false'
    }
  }

  private loadCloudinaryConfig(): CloudinaryConfig {
    return {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
      folder: process.env.CLOUDINARY_FOLDER || 'uploads',
      resourceType: (process.env.CLOUDINARY_RESOURCE_TYPE as any) || 'auto',
      useFilename: process.env.CLOUDINARY_USE_FILENAME !== 'false',
      uniqueFilename: process.env.CLOUDINARY_UNIQUE_FILENAME !== 'false',
      overwrite: process.env.CLOUDINARY_OVERWRITE === 'true',
      transformation: this.parseCloudinaryTransformations()
    }
  }

  private parseCloudinaryTransformations(): CloudinaryTransformation[] {
    const transformations = process.env.CLOUDINARY_TRANSFORMATIONS
    if (!transformations) return []
    
    try {
      return JSON.parse(transformations)
    } catch {
      logger.warn('Invalid Cloudinary transformations format')
      return []
    }
  }

  private loadS3Config(): S3Config {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || '',
      acl: (process.env.S3_ACL as any) || 'public-read',
      serverSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION === 'true',
      storageClass: (process.env.S3_STORAGE_CLASS as any) || 'STANDARD',
      endpoint: process.env.S3_ENDPOINT,
      pathStyle: process.env.S3_PATH_STYLE === 'true'
    }
  }

  private loadImageOptimizationConfig(): ImageOptimizationConfig {
    return {
      enabled: process.env.IMAGE_OPTIMIZATION !== 'false',
      quality: parseInt(process.env.IMAGE_QUALITY || '80'),
      format: (process.env.IMAGE_FORMAT as any) || 'auto',
      progressive: process.env.IMAGE_PROGRESSIVE !== 'false',
      stripMetadata: process.env.STRIP_METADATA !== 'false',
      maxWidth: process.env.MAX_IMAGE_WIDTH ? parseInt(process.env.MAX_IMAGE_WIDTH) : undefined,
      maxHeight: process.env.MAX_IMAGE_HEIGHT ? parseInt(process.env.MAX_IMAGE_HEIGHT) : undefined,
      watermark: this.loadWatermarkConfig()
    }
  }

  private loadWatermarkConfig(): WatermarkConfig {
    return {
      enabled: process.env.WATERMARK_ENABLED === 'true',
      imagePath: process.env.WATERMARK_IMAGE || '',
      position: (process.env.WATERMARK_POSITION as any) || 'bottom-right',
      opacity: parseInt(process.env.WATERMARK_OPACITY || '50'),
      size: parseInt(process.env.WATERMARK_SIZE || '20')
    }
  }

  private loadThumbnailConfig(): ThumbnailConfig {
    return {
      enabled: process.env.GENERATE_THUMBNAILS !== 'false',
      sizes: this.parseThumbnailSizes(),
      format: (process.env.THUMBNAIL_FORMAT as any) || 'auto',
      quality: parseInt(process.env.THUMBNAIL_QUALITY || '80'),
      naming: (process.env.THUMBNAIL_NAMING as any) || 'suffix',
      concurrent: parseInt(process.env.THUMBNAIL_CONCURRENT || '3')
    }
  }

  private parseThumbnailSizes(): ThumbnailSize[] {
    const sizesEnv = process.env.THUMBNAIL_SIZES
    if (sizesEnv) {
      try {
        return JSON.parse(sizesEnv)
      } catch {
        logger.warn('Invalid thumbnail sizes format, using defaults')
      }
    }
    
    return UPLOAD.THUMBNAIL_SIZES.map(size => ({
      name: size.name,
      width: size.width,
      height: size.height,
      fit: 'cover' as const
    }))
  }

  private loadSecurityConfig(): SecurityConfig {
    return {
      scanFiles: process.env.SCAN_FILES === 'true',
      allowedExtensions: this.parseExtensions(process.env.ALLOWED_EXTENSIONS),
      blockedExtensions: this.parseExtensions(process.env.BLOCKED_EXTENSIONS || '.exe,.bat,.cmd,.scr,.pif'),
      maxFilenameLength: parseInt(process.env.MAX_FILENAME_LENGTH || '255'),
      sanitizeFilenames: process.env.SANITIZE_FILENAMES !== 'false',
      checkMimeType: process.env.CHECK_MIME_TYPE !== 'false',
      antivirusEnabled: process.env.ANTIVIRUS_ENABLED === 'true',
      hashAlgorithm: (process.env.HASH_ALGORITHM as any) || 'sha256'
    }
  }

  private parseExtensions(extensions: string | undefined): string[] {
    if (!extensions) return []
    return extensions.split(',').map(ext => ext.trim().toLowerCase())
  }

  private loadPerformanceConfig(): PerformanceConfig {
    return {
      uploadTimeout: parseInt(process.env.UPLOAD_TIMEOUT || '300000'), // 5 minutes
      chunkSize: parseInt(process.env.CHUNK_SIZE || '1048576'), // 1MB
      concurrentUploads: parseInt(process.env.CONCURRENT_UPLOADS || '3'),
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
      cacheEnabled: process.env.CACHE_ENABLED !== 'false',
      cacheTtl: parseInt(process.env.CACHE_TTL || '3600'), // 1 hour
      compressionEnabled: process.env.COMPRESSION_ENABLED === 'true',
      compressionLevel: parseInt(process.env.COMPRESSION_LEVEL || '6')
    }
  }

  private validateConfiguration(): void {
    const { config } = this
    const errors: string[] = []

    // Validate storage provider
    if (!['local', 'cloudinary', 's3'].includes(config.storage)) {
      errors.push(`Invalid storage provider: ${config.storage}`)
    }

    // Validate storage-specific configs
    if (config.storage === 'cloudinary') {
      if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
        errors.push('Cloudinary configuration is incomplete')
      }
    }

    if (config.storage === 's3') {
      if (!config.s3.accessKeyId || !config.s3.secretAccessKey || !config.s3.bucket) {
        errors.push('S3 configuration is incomplete')
      }
    }

    // Validate file size
    if (config.maxFileSize <= 0) {
      errors.push('Maximum file size must be greater than 0')
    }

    // Validate allowed types
    if (config.allowedTypes.length === 0) {
      errors.push('At least one file type must be allowed')
    }

    if (errors.length > 0) {
      const errorMessage = `Upload configuration errors: ${errors.join(', ')}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }

    logger.info('Upload configuration validated successfully', {
      storage: config.storage,
      maxFileSize: config.maxFileSize,
      allowedTypes: config.allowedTypes.length
    })
  }

  // Getters for configuration
  public getConfig(): UploadConfig {
    return { ...this.config }
  }

  public getStorageConfig(): LocalStorageConfig | CloudinaryConfig | S3Config {
    switch (this.config.storage) {
      case 'local':
        return this.config.local
      case 'cloudinary':
        return this.config.cloudinary
      case 's3':
        return this.config.s3
      default:
        throw new Error(`Unknown storage provider: ${this.config.storage}`)
    }
  }

  public getImageOptimizationConfig(): ImageOptimizationConfig {
    return this.config.imageOptimization
  }

  public getThumbnailConfig(): ThumbnailConfig {
    return this.config.thumbnails
  }

  public getSecurityConfig(): SecurityConfig {
    return this.config.security
  }

  public getPerformanceConfig(): PerformanceConfig {
    return this.config.performance
  }

  // Configuration updates
  public updateConfig(updates: Partial<UploadConfig>): void {
    this.config = { ...this.config, ...updates }
    this.validateConfiguration()
    logger.info('Upload configuration updated')
  }

  public setStorageProvider(provider: StorageProvider): void {
    this.config.storage = provider
    this.validateConfiguration()
    logger.info('Storage provider changed', { provider })
  }
 public isImageFile(mimetype: string): boolean {
    return (UPLOAD.ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimetype)
  }

  public isVideoFile(mimetype: string): boolean {
    return (UPLOAD.ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimetype)
  }
  public isAllowedType(mimetype: string): boolean {
    return this.config.allowedTypes.includes(mimetype)
  }

  public isFileSizeValid(size: number): boolean {
    return size > 0 && size <= this.config.maxFileSize
  }

  public getThumbnailSize(name: string): ThumbnailSize | undefined {
    return this.config.thumbnails.sizes.find(size => size.name === name)
  }

  public shouldOptimizeImage(mimetype: string): boolean {
    return this.config.imageOptimization.enabled && this.isImageFile(mimetype)
  }

  public shouldGenerateThumbnails(mimetype: string): boolean {
    return this.config.thumbnails.enabled && this.isImageFile(mimetype)
  }
}

// Export singleton instance
export const uploadConfig = UploadConfigManager.getInstance()