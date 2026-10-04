import {
  LocalStorageService,
  StorageError,
  StorageValidationError,
  StorageFileNotFoundError,
  PathTraversalError,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from './localStorageService.js';

/**
 * Storage Service Factory & Facade
 * Provides a unified image-storage interface decoupling controller logic
 * from physical storage backends (Local Filesystem, S3, Cloudinary, etc.)
 */
class StorageService {
  constructor() {
    this.storageType = (process.env.STORAGE_TYPE || 'local').toLowerCase();
    this.provider = this.initProvider(this.storageType);
  }

  initProvider(type) {
    switch (type) {
      case 'local':
        return new LocalStorageService({
          basePath: process.env.LOCAL_STORAGE_PATH || 'uploads',
        });
      // Placeholders for future cloud providers (Phase 12+)
      // case 's3':
      //   return new S3StorageService();
      // case 'cloudinary':
      //   return new CloudinaryStorageService();
      default:
        console.warn(`[StorageService] Unknown STORAGE_TYPE '${type}'. Defaulting to 'local'.`);
        return new LocalStorageService();
    }
  }

  /**
   * Save an uploaded image through the configured storage provider.
   * @param {Object} options
   * @param {Buffer} options.buffer
   * @param {string} options.originalName
   * @param {string} options.mimetype
   * @param {string} [options.complaintId]
   * @param {string} [options.subDir]
   * @returns {Promise<{ filename: string, originalName: string, mimetype: string, size: number, storageType: string, storageKey: string, path: string, url: string }>}
   */
  async saveImage(options) {
    return this.provider.saveImage(options);
  }

  /**
   * Get file path information for a stored image.
   * @param {string} storageKey
   * @returns {Promise<{ absolutePath: string, size: number, filename: string }>}
   */
  async getImagePath(storageKey) {
    return this.provider.getImagePath(storageKey);
  }

  /**
   * Get readable stream for stored image.
   * @param {string} storageKey
   * @returns {Promise<{ stream: NodeJS.ReadableStream, size: number, filename: string, absolutePath: string }>}
   */
  async getImageStream(storageKey) {
    return this.provider.getImageStream(storageKey);
  }

  /**
   * Delete stored image file (used for rollback or cleanup).
   * @param {string} storageKey
   * @returns {Promise<boolean>}
   */
  async deleteImage(storageKey) {
    return this.provider.deleteImage(storageKey);
  }

  /**
   * Check if image exists in storage.
   * @param {string} storageKey
   * @returns {Promise<boolean>}
   */
  async exists(storageKey) {
    return this.provider.exists(storageKey);
  }

  /**
   * Resolve safe canonical path (delegates to provider).
   */
  resolveSafePath(storageKey) {
    if (typeof this.provider.resolveSafePath === 'function') {
      return this.provider.resolveSafePath(storageKey);
    }
  }

  /**
   * Generate safe filename (delegates to provider).
   */
  generateSafeFilename(originalName, complaintId) {
    if (typeof this.provider.generateSafeFilename === 'function') {
      return this.provider.generateSafeFilename(originalName, complaintId);
    }
  }

  /**
   * Ensure directory exists (local storage helper).
   */
  async ensureDirectory(dirPath) {
    if (typeof this.provider.ensureDirectory === 'function') {
      return this.provider.ensureDirectory(dirPath);
    }
  }
}

// Export singleton instance and error classes
export const storageService = new StorageService();

export {
  LocalStorageService,
  StorageError,
  StorageValidationError,
  StorageFileNotFoundError,
  PathTraversalError,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};

export default storageService;
