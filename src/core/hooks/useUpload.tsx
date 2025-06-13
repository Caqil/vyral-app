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
  UploadResponse,
  ValidationError,
} from "@/core/types";
import { logger } from "@/core/lib/utils/logger";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { StoredFile } from "../types/upload";

// Upload configuration interface
interface UploadConfig {
  maxFileSize: number;
  maxFiles: number;
  allowedTypes: string[];
  allowedExtensions: string[];
  autoUpload: boolean;
  multipleFiles: boolean;
  generateThumbnails: boolean;
  optimizeImages: boolean;
  uploadPath: string;
  acceptAttribute: string;
}

// Upload progress interface
interface UploadProgress {
  fileId: string;
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
  status:
    | "pending"
    | "uploading"
    | "processing"
    | "completed"
    | "error"
    | "cancelled";
  error?: string;
  result?: UploadResponse;
}

// Upload queue item interface
interface UploadQueueItem {
  id: string;
  file: File;
  options?: UploadOptions;
  progress: UploadProgress;
  xhr?: XMLHttpRequest;
}

// Upload options interface
interface UploadOptions {
  folder?: string;
  generateThumbnails?: boolean;
  optimize?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (result: UploadResponse) => void;
  onError?: (error: string) => void;
}

// Upload context interface
interface UploadContextType {
  config: UploadConfig;
  queue: UploadQueueItem[];
  uploadedFiles: StoredFile[];
  isUploading: boolean;
  progress: UploadProgress[];
  error: string | null;

  // File management
  uploadFile: (file: File, options?: UploadOptions) => Promise<UploadResponse>;
  uploadFiles: (
    files: File[],
    options?: UploadOptions
  ) => Promise<UploadResponse[]>;
  uploadFromUrl: (
    url: string,
    filename?: string,
    options?: UploadOptions
  ) => Promise<UploadResponse>;

  // Queue management
  addToQueue: (files: File[], options?: UploadOptions) => void;
  removeFromQueue: (fileId: string) => void;
  clearQueue: () => void;
  pauseUpload: (fileId: string) => void;
  resumeUpload: (fileId: string) => void;
  cancelUpload: (fileId: string) => void;

  // File operations
  deleteFile: (filename: string) => Promise<boolean>;
  getFileInfo: (filename: string) => Promise<StoredFile | null>;
  getFileUrl: (filename: string) => string | null;
  getUserFiles: () => Promise<StoredFile[]>;

  // Validation
  validateFile: (file: File) => ValidationError[];
  isValidFileType: (file: File) => boolean;
  isValidFileSize: (file: File) => boolean;

  // Configuration
  updateConfig: (updates: Partial<UploadConfig>) => void;
  resetConfig: () => void;
}

// Upload provider props
interface UploadProviderProps {
  children: ReactNode;
  config?: Partial<UploadConfig>;
}

// Upload state interface
interface UploadState {
  config: UploadConfig;
  queue: UploadQueueItem[];
  uploadedFiles: StoredFile[];
  isUploading: boolean;
  progress: UploadProgress[];
  error: string | null;
  queueCounter: number;
}

// Upload API endpoints
const UPLOAD_ENDPOINTS = {
  UPLOAD: "/api/upload",
  UPLOAD_MULTIPLE: "/api/upload/multiple",
  UPLOAD_URL: "/api/upload/url",
  DELETE: "/api/upload/delete",
  INFO: "/api/upload/info",
  USER_FILES: "/api/upload/user-files",
} as const;

// Default upload configuration
const DEFAULT_CONFIG: UploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "video/mp4",
    "video/webm",
    "audio/mp3",
    "audio/wav",
  ],
  allowedExtensions: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".pdf",
    ".txt",
    ".csv",
    ".mp4",
    ".webm",
    ".mp3",
    ".wav",
  ],
  autoUpload: false,
  multipleFiles: true,
  generateThumbnails: true,
  optimizeImages: true,
  uploadPath: "/uploads",
  acceptAttribute: "image/*,application/pdf,text/*,video/*,audio/*",
};

// Upload Context
const UploadContext = createContext<UploadContextType | null>(null);

// Upload Provider Component
export function UploadProvider({
  children,
  config: configOverrides,
}: UploadProviderProps) {
  const [state, setState] = useState<UploadState>({
    config: { ...DEFAULT_CONFIG, ...configOverrides },
    queue: [],
    uploadedFiles: [],
    isUploading: false,
    progress: [],
    error: null,
    queueCounter: 0,
  });

  const { user } = useAuth();
  const uploadRefs = useRef<Map<string, XMLHttpRequest>>(new Map());

  // Load user files on mount
  useEffect(() => {
    if (user) {
      loadUserFiles();
    }
  }, [user]);

  // Process upload queue
  useEffect(() => {
    if (
      state.config.autoUpload &&
      state.queue.length > 0 &&
      !state.isUploading
    ) {
      processQueue();
    }
  }, [state.queue, state.config.autoUpload, state.isUploading]);

  // Load user files
  const loadUserFiles = useCallback(async () => {
    try {
      const files = await getUserFiles();
      setState((prev) => ({ ...prev, uploadedFiles: files }));
    } catch (error) {
      logger.error("Failed to load user files", { error });
    }
  }, []);

  // Validate file
  const validateFile = useCallback(
    (file: File): ValidationError[] => {
      const errors: ValidationError[] = [];

      // Check file size
      if (file.size > state.config.maxFileSize) {
        errors.push({
          field: "size",
          message: `File size exceeds maximum allowed size of ${formatFileSize(state.config.maxFileSize)}`,
          code: "FILE_TOO_LARGE",
          value: file.size,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: "",
        });
      }

      // Check file type
      if (!state.config.allowedTypes.includes(file.type)) {
        errors.push({
          field: "type",
          message: `File type '${file.type}' is not allowed`,
          code: "INVALID_FILE_TYPE",
          value: file.type,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: "",
        });
      }

      // Check file extension
      const extension = getFileExtension(file.name);
      if (extension && !state.config.allowedExtensions.includes(extension)) {
        errors.push({
          field: "extension",
          message: `File extension '${extension}' is not allowed`,
          code: "INVALID_FILE_EXTENSION",
          value: extension,
          errors: [],
          statusCode: 0,
          isOperational: false,
          name: "",
        });
      }

      return errors;
    },
    [state.config]
  );

  // Check if file type is valid
  const isValidFileType = useCallback(
    (file: File): boolean => {
      return state.config.allowedTypes.includes(file.type);
    },
    [state.config.allowedTypes]
  );

  // Check if file size is valid
  const isValidFileSize = useCallback(
    (file: File): boolean => {
      return file.size <= state.config.maxFileSize;
    },
    [state.config.maxFileSize]
  );

  // Upload single file
  const uploadFile = useCallback(
    async (file: File, options?: UploadOptions): Promise<UploadResponse> => {
      // Validate file
      const validationErrors = validateFile(file);
      if (validationErrors.length > 0) {
        const errorMessage = validationErrors.map((e) => e.message).join(", ");
        throw new Error(errorMessage);
      }

      return new Promise((resolve, reject) => {
        const fileId = `upload_${Date.now()}_${state.queueCounter}`;
        const xhr = new XMLHttpRequest();
        const formData = new FormData();

        // Create progress object
        const progress: UploadProgress = {
          fileId,
          filename: file.name,
          loaded: 0,
          total: file.size,
          percentage: 0,
          status: "pending",
        };

        // Add to progress tracking
        setState((prev) => ({
          ...prev,
          progress: [...prev.progress, progress],
          isUploading: true,
          queueCounter: prev.queueCounter + 1,
        }));

        // Store xhr reference for cancellation
        uploadRefs.current.set(fileId, xhr);

        // Setup form data
        formData.append("file", file);
        if (options?.folder) formData.append("folder", options.folder);
        if (options?.generateThumbnails !== undefined) {
          formData.append(
            "generateThumbnails",
            options.generateThumbnails.toString()
          );
        }
        if (options?.optimize !== undefined) {
          formData.append("optimize", options.optimize.toString());
        }

        // Upload progress handler
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100);
            const updatedProgress: UploadProgress = {
              ...progress,
              loaded: event.loaded,
              total: event.total,
              percentage,
              status: "uploading",
            };

            setState((prev) => ({
              ...prev,
              progress: prev.progress.map((p) =>
                p.fileId === fileId ? updatedProgress : p
              ),
            }));

            options?.onProgress?.(updatedProgress);
          }
        };

        // Upload complete handler
        xhr.onload = () => {
          uploadRefs.current.delete(fileId);

          if (xhr.status === 200) {
            try {
              const result: UploadResponse = JSON.parse(xhr.responseText);

              if (result.success) {
                const completedProgress: UploadProgress = {
                  ...progress,
                  percentage: 100,
                  status: "completed",
                  result,
                };

                setState((prev) => ({
                  ...prev,
                  progress: prev.progress.map((p) =>
                    p.fileId === fileId ? completedProgress : p
                  ),
                  isUploading: prev.progress
                    .filter((p) => p.fileId !== fileId)
                    .some(
                      (p) =>
                        p.status === "uploading" || p.status === "processing"
                    ),
                }));

                // Refresh user files
                loadUserFiles();

                toast.success(`${file.name} has been uploaded successfully.`);

                options?.onComplete?.(result);
                resolve(result);
              } else {
                throw new Error(result.error || "Upload failed");
              }
            } catch (error) {
              handleUploadError(fileId, error, options, reject);
            }
          } else {
            handleUploadError(
              fileId,
              new Error(`HTTP ${xhr.status}`),
              options,
              reject
            );
          }
        };

        // Upload error handler
        xhr.onerror = () => {
          handleUploadError(
            fileId,
            new Error("Network error"),
            options,
            reject
          );
        };

        // Upload abort handler
        xhr.onabort = () => {
          uploadRefs.current.delete(fileId);

          setState((prev) => ({
            ...prev,
            progress: prev.progress.map((p) =>
              p.fileId === fileId ? { ...p, status: "cancelled" } : p
            ),
            isUploading: prev.progress
              .filter((p) => p.fileId !== fileId)
              .some(
                (p) => p.status === "uploading" || p.status === "processing"
              ),
          }));

          reject(new Error("Upload cancelled"));
        };

        // Start upload
        const token = localStorage.getItem("auth_token");
        xhr.open("POST", UPLOAD_ENDPOINTS.UPLOAD);
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }

        setState((prev) => ({
          ...prev,
          progress: prev.progress.map((p) =>
            p.fileId === fileId ? { ...p, status: "uploading" } : p
          ),
        }));

        xhr.send(formData);
      });
    },
    [validateFile, state.queueCounter, toast, loadUserFiles]
  );

  // Handle upload error
  const handleUploadError = useCallback(
    (
      fileId: string,
      error: any,
      options?: UploadOptions,
      reject?: (error: Error) => void
    ) => {
      uploadRefs.current.delete(fileId);

      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";

      setState((prev) => ({
        ...prev,
        progress: prev.progress.map((p) =>
          p.fileId === fileId
            ? {
                ...p,
                status: "error",
                error: errorMessage,
              }
            : p
        ),
        error: errorMessage,
        isUploading: prev.progress
          .filter((p) => p.fileId !== fileId)
          .some((p) => p.status === "uploading" || p.status === "processing"),
      }));

      toast.error(errorMessage);

      options?.onError?.(errorMessage);
      reject?.(new Error(errorMessage));

      logger.error("Upload error", { error, fileId });
    },
    [toast]
  );

  // Upload multiple files
  const uploadFiles = useCallback(
    async (
      files: File[],
      options?: UploadOptions
    ): Promise<UploadResponse[]> => {
      const results: UploadResponse[] = [];

      for (const file of files) {
        try {
          const result = await uploadFile(file, options);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : "Upload failed",
          });
        }
      }

      return results;
    },
    [uploadFile]
  );

  // Upload from URL
  const uploadFromUrl = useCallback(
    async (
      url: string,
      filename?: string,
      options?: UploadOptions
    ): Promise<UploadResponse> => {
      try {
        const token = localStorage.getItem("auth_token");
        const response = await fetch(UPLOAD_ENDPOINTS.UPLOAD_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            filename,
            folder: options?.folder,
            generateThumbnails: options?.generateThumbnails,
            optimize: options?.optimize,
          }),
        });

        const result: UploadResponse = await response.json();

        if (result.success) {
          await loadUserFiles();

          toast(`File from URL has been uploaded successfully.`);

          options?.onComplete?.(result);
        } else {
          toast.error(result.error || "Failed to upload from URL");

          options?.onError?.(result.error || "Upload failed");
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        toast.error(errorMessage);

        options?.onError?.(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      }
    },
    [loadUserFiles, toast]
  );

  // Add files to queue
  const addToQueue = useCallback((files: File[], options?: UploadOptions) => {
    const newItems: UploadQueueItem[] = files.map((file) => ({
      id: `queue_${Date.now()}_${Math.random()}`,
      file,
      options,
      progress: {
        fileId: `queue_${Date.now()}_${Math.random()}`,
        filename: file.name,
        loaded: 0,
        total: file.size,
        percentage: 0,
        status: "pending",
      },
    }));

    setState((prev) => ({
      ...prev,
      queue: [...prev.queue, ...newItems],
    }));
  }, []);

  // Remove from queue
  const removeFromQueue = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      queue: prev.queue.filter((item) => item.id !== fileId),
    }));
  }, []);

  // Clear queue
  const clearQueue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queue: [],
    }));
  }, []);

  // Process upload queue
  const processQueue = useCallback(async () => {
    if (state.queue.length === 0 || state.isUploading) {
      return;
    }

    setState((prev) => ({ ...prev, isUploading: true }));

    for (const item of state.queue) {
      try {
        await uploadFile(item.file, item.options);
        removeFromQueue(item.id);
      } catch (error) {
        logger.error("Queue upload failed", { error, fileId: item.id });
      }
    }

    setState((prev) => ({ ...prev, isUploading: false }));
  }, [state.queue, state.isUploading, uploadFile, removeFromQueue]);

  // Cancel upload
  const cancelUpload = useCallback((fileId: string) => {
    const xhr = uploadRefs.current.get(fileId);
    if (xhr) {
      xhr.abort();
    }
  }, []);

  // Pause upload (not implemented in basic XMLHttpRequest)
  const pauseUpload = useCallback((fileId: string) => {
    // Would require chunked upload implementation
    logger.warn("Pause upload not implemented", { fileId });
  }, []);

  // Resume upload (not implemented in basic XMLHttpRequest)
  const resumeUpload = useCallback((fileId: string) => {
    // Would require chunked upload implementation
    logger.warn("Resume upload not implemented", { fileId });
  }, []);

  // Delete file
  const deleteFile = useCallback(
    async (filename: string): Promise<boolean> => {
      try {
        const token = localStorage.getItem("auth_token");
        const response = await fetch(UPLOAD_ENDPOINTS.DELETE, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ filename }),
        });

        const result = await response.json();

        if (result.success) {
          await loadUserFiles();

          toast(`${filename} has been deleted successfully.`);

          return true;
        } else {
          throw new Error(result.error || "Delete failed");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Delete failed";

        toast.error(errorMessage);

        logger.error("File delete error", { error, filename });
        return false;
      }
    },
    [loadUserFiles, toast]
  );

  // Get file info
  const getFileInfo = useCallback(
    async (filename: string): Promise<StoredFile | null> => {
      try {
        const token = localStorage.getItem("auth_token");
        const response = await fetch(
          `${UPLOAD_ENDPOINTS.INFO}/${encodeURIComponent(filename)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const result = await response.json();

        if (result.success && result.data) {
          return result.data as StoredFile;
        }

        return null;
      } catch (error) {
        logger.error("Failed to get file info", { error, filename });
        return null;
      }
    },
    []
  );

  // Get file URL
  const getFileUrl = useCallback(
    (filename: string): string | null => {
      const file = state.uploadedFiles.find((f) => f.filename === filename);
      return file?.url || null;
    },
    [state.uploadedFiles]
  );

  // Get user files
  const getUserFiles = useCallback(async (): Promise<StoredFile[]> => {
    try {
      const token = localStorage.getItem("auth_token");
      const response = await fetch(UPLOAD_ENDPOINTS.USER_FILES, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (result.success && result.data) {
        return result.data as StoredFile[];
      }

      return [];
    } catch (error) {
      logger.error("Failed to get user files", { error });
      return [];
    }
  }, []);

  // Update configuration
  const updateConfig = useCallback((updates: Partial<UploadConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  // Reset configuration
  const resetConfig = useCallback(() => {
    setState((prev) => ({
      ...prev,
      config: { ...DEFAULT_CONFIG, ...configOverrides },
    }));
  }, [configOverrides]);

  // Context value
  const contextValue: UploadContextType = {
    config: state.config,
    queue: state.queue,
    uploadedFiles: state.uploadedFiles,
    isUploading: state.isUploading,
    progress: state.progress,
    error: state.error,

    uploadFile,
    uploadFiles,
    uploadFromUrl,

    addToQueue,
    removeFromQueue,
    clearQueue,
    pauseUpload,
    resumeUpload,
    cancelUpload,

    deleteFile,
    getFileInfo,
    getFileUrl,
    getUserFiles,

    validateFile,
    isValidFileType,
    isValidFileSize,

    updateConfig,
    resetConfig,
  };

  return (
    <UploadContext.Provider value={contextValue}>
      {children}
    </UploadContext.Provider>
  );
}

// Main useUpload hook
export function useUpload(): UploadContextType {
  const context = useContext(UploadContext);

  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }

  return context;
}

// Hook for drag and drop functionality
export function useDragAndDrop(onDrop: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onDrop(files);
      }
    },
    [onDrop]
  );

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}

// Hook for file input
export function useFileInput(options?: {
  multiple?: boolean;
  accept?: string;
  onSelect?: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        options?.onSelect?.(files);
      }
      // Reset input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [options]
  );

  const fileInputProps = {
    ref: fileInputRef,
    type: "file" as const,
    multiple: options?.multiple,
    accept: options?.accept,
    onChange: handleFileSelect,
    style: { display: "none" },
  };

  return {
    openFileDialog,
    fileInputProps,
  };
}

// Utility functions
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileExtension(filename: string): string | null {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
    return null;
  }
  return filename.substring(lastDotIndex).toLowerCase();
}

export default useUpload;
