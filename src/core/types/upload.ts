// Upload-related types for the platform

export interface FileUpload {
  file: File | Buffer
  filename: string
  mimetype: string
  size: number
  encoding?: string
}

export interface UploadResponse {
  success: boolean
  url?: string
  filename?: string
  size?: number
  type?: string
  error?: string
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

export interface UploadHooks {
  beforeUpload?: (file: FileUpload, userId?: string) => Promise<FileUpload | null>
  afterUpload?: (result: ProcessedFile, userId?: string) => Promise<void>
  beforeDelete?: (filename: string, userId?: string) => Promise<boolean>
  afterDelete?: (filename: string, userId?: string) => Promise<void>
  onUploadError?: (error: Error, file: FileUpload, userId?: string) => Promise<void>
}

// Upload validation types
export interface UploadValidation {
  maxFileSize: number
  allowedTypes: string[]
  allowedExtensions: string[]
  minImageWidth?: number
  maxImageWidth?: number
  minImageHeight?: number
  maxImageHeight?: number
  requireImage?: boolean
}

// Upload progress types
export interface UploadProgress {
  fileId: string
  filename: string
  loaded: number
  total: number
  percentage: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled'
  error?: string
  startTime?: Date
  endTime?: Date
  speed?: number
  estimatedTimeRemaining?: number
}

// Upload queue types
export interface UploadQueueItem {
  id: string
  file: File
  options?: UploadOptions
  progress: UploadProgress
  priority: number
  retryCount: number
  maxRetries: number
}

export interface UploadOptions {
  folder?: string
  generateThumbnails?: boolean
  optimize?: boolean
  priority?: number
  tags?: string[]
  metadata?: Record<string, any>
  onProgress?: (progress: UploadProgress) => void
  onComplete?: (result: UploadResponse) => void
  onError?: (error: string) => void
}

// Storage provider types
export interface StorageProvider {
  name: 'local' | 'cloudinary' | 's3' | 'custom'
  config: LocalStorageConfig | CloudinaryConfig | S3Config | CustomStorageConfig
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
  resourceType: 'auto' | 'image' | 'raw' | 'video'
  useFilename: boolean
  uniqueFilename: boolean
  overwrite: boolean
  transformation?: CloudinaryTransformation[]
}

export interface CloudinaryTransformation {
  width?: number
  height?: number
  crop?: string
  quality?: string | number
  format?: string
  [key: string]: any
}

export interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  acl?: string
  serverSideEncryption?: boolean
  storageClass?: string
  endpoint?: string
  pathStyle?: boolean
}

export interface CustomStorageConfig {
  endpoint: string
  credentials?: Record<string, any>
  options?: Record<string, any>
}

// Upload statistics types
export interface UploadStats {
  totalUploads: number
  totalSize: number
  avgFileSize: number
  successRate: number
  topFileTypes: { type: string; count: number }[]
  uploadsToday: number
  uploadsThisWeek: number
  uploadsThisMonth: number
}

// File management types
export interface FileFilter {
  type?: string[]
  size?: { min?: number; max?: number }
  dateRange?: { start?: Date; end?: Date }
  tags?: string[]
  folder?: string
  userId?: string
}

export interface FileSortOptions {
  field: 'name' | 'size' | 'type' | 'createdAt' | 'updatedAt'
  order: 'asc' | 'desc'
}

export interface FileSearchParams {
  query?: string
  filter?: FileFilter
  sort?: FileSortOptions
  page?: number
  limit?: number
}

// Batch operations
export interface BatchOperation {
  type: 'delete' | 'move' | 'copy' | 'tag' | 'compress'
  fileIds: string[]
  options?: Record<string, any>
}

export interface BatchOperationResult {
  operation: BatchOperation
  success: boolean
  results: Array<{
    fileId: string
    success: boolean
    error?: string
  }>
  summary: {
    total: number
    successful: number
    failed: number
  }
}

// Error types
export enum UploadErrorCode {
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  INVALID_FILE_EXTENSION = 'INVALID_FILE_EXTENSION',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  DUPLICATE_FILE = 'DUPLICATE_FILE'
}

export interface UploadError {
  code: UploadErrorCode
  message: string
  fileId?: string
  filename?: string
  details?: Record<string, any>
}