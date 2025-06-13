// File processing utilities for the social media platform
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import { FileUpload } from '@/core/types'
import { logger } from '@/core/lib/utils/logger'
import { uploadConfig, ThumbnailSize, ImageOptimizationConfig, WatermarkConfig } from './config'

// Processing result interfaces
export interface ProcessingResult {
  success: boolean
  originalSize: number
  processedSize: number
  processingTime: number
  error?: string
  metadata?: ProcessingMetadata
}

export interface ProcessingMetadata {
  width?: number
  height?: number
  format?: string
  hasAlpha?: boolean
  colorSpace?: string
  quality?: number
  compression?: string
  exifData?: Record<string, any>
}

export interface ImageProcessingOptions {
  optimize?: boolean
  quality?: number
  format?: 'auto' | 'jpeg' | 'png' | 'webp'
  resize?: { width?: number; height?: number; fit?: string }
  watermark?: boolean
  stripMetadata?: boolean
  progressive?: boolean
}

export interface ThumbnailProcessingOptions {
  sizes?: ThumbnailSize[]
  format?: 'auto' | 'jpeg' | 'png' | 'webp'
  quality?: number
  concurrent?: number
}

export interface VideoProcessingOptions {
  compress?: boolean
  quality?: 'low' | 'medium' | 'high'
  maxDuration?: number
  extractThumbnail?: boolean
  thumbnailTime?: string
}

export interface AudioProcessingOptions {
  compress?: boolean
  bitrate?: string
  format?: 'mp3' | 'aac' | 'ogg'
  normalize?: boolean
}

// Image processor class
export class ImageProcessor {
  private config: ImageOptimizationConfig

  constructor() {
    this.config = uploadConfig.getImageOptimizationConfig()
  }

  // Process single image
  async processImage(
    buffer: Buffer, 
    filename: string, 
    options: ImageProcessingOptions = {}
  ): Promise<{ buffer: Buffer; result: ProcessingResult }> {
    const startTime = Date.now()
    const originalSize = buffer.length

    try {
      let pipeline = sharp(buffer)

      // Get original metadata
      const metadata = await pipeline.metadata()
      const processingMetadata: ProcessingMetadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
        colorSpace: metadata.space,
        exifData: metadata.exif
      }

      // Apply transformations
      pipeline = await this.applyResize(pipeline, options.resize)
      pipeline = await this.applyOptimization(pipeline, options)
      pipeline = await this.applyWatermark(pipeline, options.watermark)

      // Convert to buffer
      const processedBuffer = await pipeline.toBuffer()
      const processingTime = Date.now() - startTime

      logger.debug('Image processed successfully', {
        filename,
        originalSize,
        processedSize: processedBuffer.length,
        processingTime,
        compression: ((originalSize - processedBuffer.length) / originalSize * 100).toFixed(2) + '%'
      })

      return {
        buffer: processedBuffer,
        result: {
          success: true,
          originalSize,
          processedSize: processedBuffer.length,
          processingTime,
          metadata: processingMetadata
        }
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      logger.error('Image processing failed', { 
        filename, 
        error: error instanceof Error ? error.message : String(error), 
        processingTime 
      })
      
      return {
        buffer,
        result: {
          success: false,
          originalSize,
          processedSize: originalSize,
          processingTime,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  }

  // Generate thumbnails
  async generateThumbnails(
    buffer: Buffer, 
    filename: string, 
    options: ThumbnailProcessingOptions = {}
  ): Promise<{ thumbnails: Array<{ name: string; buffer: Buffer; size: ThumbnailSize }>; results: ProcessingResult[] }> {
    const sizes = options.sizes || uploadConfig.getThumbnailConfig().sizes
    const quality = options.quality || uploadConfig.getThumbnailConfig().quality
    const concurrent = options.concurrent || uploadConfig.getThumbnailConfig().concurrent
    
    const thumbnails: Array<{ name: string; buffer: Buffer; size: ThumbnailSize }> = []
    const results: ProcessingResult[] = []

    // Process thumbnails in batches to control concurrency
    const batches = this.chunkArray(sizes, concurrent)
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (size) => {
        const startTime = Date.now()
        
        try {
          let pipeline = sharp(buffer)
          
          // Apply resize
          pipeline = pipeline.resize(size.width, size.height, {
            fit: size.fit as any,
            position: size.position as any,
            withoutEnlargement: true
          })

          // Apply format and quality
          if (options.format === 'jpeg' || this.config.format === 'jpeg') {
            pipeline = pipeline.jpeg({ quality, progressive: true })
          } else if (options.format === 'png' || this.config.format === 'png') {
            pipeline = pipeline.png({ quality, progressive: true })
          } else if (options.format === 'webp' || this.config.format === 'webp') {
            pipeline = pipeline.webp({ quality })
          }

          const thumbnailBuffer = await pipeline.toBuffer()
          const processingTime = Date.now() - startTime

          thumbnails.push({
            name: size.name,
            buffer: thumbnailBuffer,
            size
          })

          results.push({
            success: true,
            originalSize: buffer.length,
            processedSize: thumbnailBuffer.length,
            processingTime
          })

          logger.debug('Thumbnail generated', {
            filename,
            size: size.name,
            dimensions: `${size.width}x${size.height}`,
            processingTime
          })
        } catch (error) {
          const processingTime = Date.now() - startTime
          logger.error('Thumbnail generation failed', {
            filename,
            size: size.name,
            error: error instanceof Error ? error.message : String(error),
            processingTime
          })

          results.push({
            success: false,
            originalSize: buffer.length,
            processedSize: 0,
            processingTime,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      })

      await Promise.all(batchPromises)
    }

    return { thumbnails, results }
  }

  // Apply resize transformation
  private async applyResize(
    pipeline: sharp.Sharp, 
    resize?: { width?: number; height?: number; fit?: string }
  ): Promise<sharp.Sharp> {
    if (!resize) return pipeline

    const { width, height, fit = 'inside' } = resize
    
    if (width || height) {
      pipeline = pipeline.resize(width, height, {
        fit: fit as any,
        withoutEnlargement: true
      })
    }

    return pipeline
  }

  // Apply optimization settings
  private async applyOptimization(
    pipeline: sharp.Sharp, 
    options: ImageProcessingOptions
  ): Promise<sharp.Sharp> {
    const optimize = options.optimize ?? this.config.enabled
    if (!optimize) return pipeline

    const quality = options.quality ?? this.config.quality
    const format = options.format ?? this.config.format
    const progressive = options.progressive ?? this.config.progressive
    const stripMetadata = options.stripMetadata ?? this.config.stripMetadata

    // Strip metadata if requested
    if (stripMetadata) {
      pipeline = pipeline.withMetadata({})
    }

    // Apply format-specific optimizations
    switch (format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ 
          quality, 
          progressive,
          mozjpeg: true
        })
        break
      case 'png':
        pipeline = pipeline.png({ 
          quality,
          progressive,
          compressionLevel: 9
        })
        break
      case 'webp':
        pipeline = pipeline.webp({ 
          quality,
          effort: 6
        })
        break
      case 'auto':
      default:
        // Keep original format but optimize
        const metadata = await pipeline.metadata()
        if (metadata.format === 'jpeg') {
          pipeline = pipeline.jpeg({ quality, progressive })
        } else if (metadata.format === 'png') {
          pipeline = pipeline.png({ quality, progressive })
        }
        break
    }

    return pipeline
  }

  // Apply watermark
  private async applyWatermark(
    pipeline: sharp.Sharp, 
    applyWatermark?: boolean
  ): Promise<sharp.Sharp> {
    const watermark = this.config.watermark
    if (!watermark?.enabled || !applyWatermark) return pipeline

    try {
      // In a real implementation, you would load the watermark image
      // and composite it onto the main image
      logger.debug('Watermark application skipped (not implemented)')
    } catch (error) {
      logger.warn('Watermark application failed', { 
        error: error instanceof Error ? error.message : String(error) 
      })
    }

    return pipeline
  }

  // Utility method to chunk array
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }
}

// Video processor class
export class VideoProcessor {
  async processVideo(
    inputPath: string, 
    outputPath: string, 
    options: VideoProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)

      // Apply compression settings
      if (options.compress) {
        const quality = options.quality || 'medium'
        const qualitySettings = {
          low: { crf: 28, preset: 'fast' },
          medium: { crf: 23, preset: 'medium' },
          high: { crf: 18, preset: 'slow' }
        }
        
        const settings = qualitySettings[quality]
        command = command
          .videoCodec('libx264')
          .addOption('-crf', settings.crf.toString())
          .addOption('-preset', settings.preset)
      }

      // Limit duration
      if (options.maxDuration) {
        command = command.duration(options.maxDuration)
      }

      command
        .output(outputPath)
        .on('end', () => {
          const processingTime = Date.now() - startTime
          logger.info('Video processing completed', { inputPath, outputPath, processingTime })
          
          resolve({
            success: true,
            originalSize: 0, // Will be set by caller
            processedSize: 0, // Will be set by caller
            processingTime
          })
        })
        .on('error', (error: { message: string | undefined }) => {
          const processingTime = Date.now() - startTime
          logger.error('Video processing failed', { 
            error: error instanceof Error ? error.message : String(error), 
            processingTime 
          })
          
          resolve({
            success: false,
            originalSize: 0,
            processedSize: 0,
            processingTime,
            error: error instanceof Error ? error.message : String(error)
          })
        })
        .run()
    })
  }

  async extractThumbnail(
    inputPath: string, 
    outputPath: string, 
    time: string = '00:00:01'
  ): Promise<ProcessingResult> {
    const startTime = Date.now()

    return new Promise((resolve) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: [time],
          filename: 'thumbnail.jpg',
          folder: outputPath,
          size: '320x240'
        })
        .on('end', () => {
          const processingTime = Date.now() - startTime
          logger.info('Video thumbnail extracted', { inputPath, outputPath, processingTime })
          
          resolve({
            success: true,
            originalSize: 0,
            processedSize: 0,
            processingTime
          })
        })
        .on('error', (error: { message: string | undefined }) => {
          const processingTime = Date.now() - startTime
          logger.error('Video thumbnail extraction failed', { 
            error: error instanceof Error ? error.message : String(error), 
            processingTime 
          })
          
          resolve({
            success: false,
            originalSize: 0,
            processedSize: 0,
            processingTime,
            error: error instanceof Error ? error.message : String(error)
          })
        })
    })
  }
}

// Audio processor class
export class AudioProcessor {
  async processAudio(
    inputPath: string, 
    outputPath: string, 
    options: AudioProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now()

    return new Promise((resolve) => {
      let command = ffmpeg(inputPath)

      // Apply format and compression
      if (options.format) {
        command = command.audioCodec(this.getAudioCodec(options.format))
      }

      if (options.bitrate) {
        command = command.audioBitrate(options.bitrate)
      }

      // Normalize audio
      if (options.normalize) {
        command = command.audioFilters('loudnorm')
      }

      command
        .output(outputPath)
        .on('end', () => {
          const processingTime = Date.now() - startTime
          logger.info('Audio processing completed', { inputPath, outputPath, processingTime })
          
          resolve({
            success: true,
            originalSize: 0,
            processedSize: 0,
            processingTime
          })
        })
        .on('error', (error: { message: string | undefined }) => {
          const processingTime = Date.now() - startTime
          logger.error('Audio processing failed', { 
            error: error instanceof Error ? error.message : String(error), 
            processingTime 
          })
          
          resolve({
            success: false,
            originalSize: 0,
            processedSize: 0,
            processingTime,
            error: error instanceof Error ? error.message : String(error)
          })
        })
        .run()
    })
  }

  private getAudioCodec(format: string): string {
    const codecs = {
      mp3: 'libmp3lame',
      aac: 'aac',
      ogg: 'libvorbis'
    }
    return codecs[format as keyof typeof codecs] || 'libmp3lame'
  }
}

// Document processor class
export class DocumentProcessor {
  async processDocument(
    buffer: Buffer, 
    filename: string, 
    mimetype: string
  ): Promise<ProcessingResult> {
    const startTime = Date.now()
    
    try {
      // Document processing would go here
      // For PDF: extract text, generate thumbnails
      // For DOC/DOCX: convert to PDF, extract text
      
      const processingTime = Date.now() - startTime
      
      logger.debug('Document processed', { filename, mimetype, processingTime })
      
      return {
        success: true,
        originalSize: buffer.length,
        processedSize: buffer.length,
        processingTime
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Document processing failed', { 
        filename, 
        error: error instanceof Error ? error.message : String(error), 
        processingTime 
      })
      
      return {
        success: false,
        originalSize: buffer.length,
        processedSize: 0,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// File processor factory
export class FileProcessorFactory {
  static createProcessor(mimetype: string) {
    if (mimetype.startsWith('image/')) {
      return new ImageProcessor()
    } else if (mimetype.startsWith('video/')) {
      return new VideoProcessor()
    } else if (mimetype.startsWith('audio/')) {
      return new AudioProcessor()
    } else if (mimetype === 'application/pdf' || mimetype.includes('document')) {
      return new DocumentProcessor()
    }
    
    throw new Error(`No processor available for mimetype: ${mimetype}`)
  }

  static canProcess(mimetype: string): boolean {
    return mimetype.startsWith('image/') || 
           mimetype.startsWith('video/') || 
           mimetype.startsWith('audio/') ||
           mimetype === 'application/pdf' ||
           mimetype.includes('document')
  }
}

// Export processor instances
export const imageProcessor = new ImageProcessor()
export const videoProcessor = new VideoProcessor()
export const audioProcessor = new AudioProcessor()
export const documentProcessor = new DocumentProcessor()