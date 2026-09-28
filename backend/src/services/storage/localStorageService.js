import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Supported MIME types and extensions
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export class StorageError extends Error {
  constructor(message, code = 'STORAGE_ERROR', statusCode = 500) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class StorageValidationError extends StorageError {
  constructor(message, code = 'INVALID_IMAGE') {
    super(message, code, 400);
    this.name = 'StorageValidationError';
  }
}

export class StorageFileNotFoundError extends StorageError {
  constructor(message = 'Image file not found on storage', code = 'IMAGE_FILE_NOT_FOUND') {
    super(message, code, 404);
    this.name = 'StorageFileNotFoundError';
  }
}

export class PathTraversalError extends StorageError {
  constructor(message = 'Invalid file path: path traversal detected', code = 'PATH_TRAVERSAL_DETECTED') {
    super(message, code, 400);
    this.name = 'PathTraversalError';
  }
}

/**
 * Local filesystem storage provider for CivicEye media management.
 */
export class LocalStorageService {
  constructor(options = {}) {
    const rawBasePath = options.basePath || process.env.LOCAL_STORAGE_PATH || 'uploads';
    // Resolve absolute path safely across Windows and Linux
    this.baseUploadDir = path.isAbsolute(rawBasePath)
      ? path.normalize(rawBasePath)
      : path.resolve(process.cwd(), rawBasePath);
    this.complaintsDir = path.join(this.baseUploadDir, 'complaints');
  }

  /**
   * Ensure storage directory exists recursively.
   */
  async ensureDirectory(dirPath = this.complaintsDir) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return dirPath;
    } catch (err) {
      throw new StorageError(`Failed to create storage directory: ${err.message}`, 'STORAGE_DIR_ERROR');
    }
  }

  /**
   * Safely resolve and validate a storageKey to prevent path traversal.
   * Ensures resolved path is strictly within baseUploadDir.
   */
  resolveSafePath(storageKey) {
    if (!storageKey || typeof storageKey !== 'string') {
      throw new PathTraversalError('Invalid storage key provided.');
    }

    // Check for null byte injection
    if (storageKey.includes('\0')) {
      throw new PathTraversalError('Path traversal detected: null byte injection.');
    }

    // Check for directory traversal sequences
    if (storageKey.includes('..') || storageKey.includes('\\..') || storageKey.includes('/..')) {
      throw new PathTraversalError('Path traversal detected: directory navigation sequence prohibited.');
    }

    // Normalize and resolve against baseUploadDir
    const normalizedKey = path.normalize(storageKey).replace(/^(\/|\\)+/, '');
    const resolvedPath = path.resolve(this.baseUploadDir, normalizedKey);

    // Strict boundary enforcement: path must start with baseUploadDir
    const normalizedBase = path.resolve(this.baseUploadDir);
    if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
      throw new PathTraversalError('Path traversal detected: target path falls outside storage root.');
    }

    return resolvedPath;
  }

  /**
   * Generate safe, unique, collision-resistant filename.
   * Format: complaint_<complaintId_or_uuid>_<timestamp>.<ext>
   */
  generateSafeFilename(originalName, complaintId) {
    const rawExt = path.extname(originalName || '').toLowerCase();
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '.jpg';
    
    // Sanitize identifier
    const safeId = complaintId
      ? String(complaintId).replace(/[^a-zA-Z0-9_-]/g, '')
      : crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const entropy = crypto.randomBytes(4).toString('hex');

    return `complaint_${safeId}_${timestamp}_${entropy}${ext}`;
  }

  /**
   * Validate image buffer, size, extension and MIME type.
   */
  validateImage(buffer, originalName, mimetype) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new StorageValidationError('Image buffer is empty or missing.', 'MISSING_IMAGE_BUFFER');
    }

    if (buffer.length > MAX_FILE_SIZE) {
      throw new StorageError(
        `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 10MB limit.`,
        'FILE_TOO_LARGE',
        413
      );
    }

    const ext = path.extname(originalName || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new StorageValidationError(
        `Unsupported file extension '${ext}'. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
        'INVALID_EXTENSION'
      );
    }

    const mime = (mimetype || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new StorageValidationError(
        `Unsupported MIME type '${mime}'. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
        'INVALID_MIME_TYPE'
      );
    }

    return { ext, mime };
  }

  /**
   * Store image buffer to local filesystem safely.
   */
  async saveImage({ buffer, originalName, mimetype, complaintId, subDir = 'complaints' }) {
    // 1. Validate image properties
    const { mime } = this.validateImage(buffer, originalName, mimetype);

    // 2. Ensure target subfolder exists
    const targetDir = path.join(this.baseUploadDir, subDir);
    await this.ensureDirectory(targetDir);

    // 3. Generate collision-resistant sanitized filename
    const filename = this.generateSafeFilename(originalName, complaintId);
    const relativeKey = path.posix.join(subDir, filename);
    const absolutePath = path.join(targetDir, filename);

    // 4. Write image to disk
    try {
      await fs.promises.writeFile(absolutePath, buffer);
    } catch (err) {
      throw new StorageError(`Failed to write image file: ${err.message}`, 'FILE_WRITE_ERROR');
    }

    // 5. Sanitize original name (strip path characters)
    const sanitizedOriginalName = path.basename(originalName || filename).substring(0, 255);

    return {
      filename,
      originalName: sanitizedOriginalName,
      mimetype: mime,
      size: buffer.length,
      storageType: 'local',
      storageKey: relativeKey,
      path: relativeKey,
      url: complaintId ? `/api/complaints/${complaintId}/image` : null,
    };
  }

  /**
   * Get safe absolute file path for a stored image.
   * Throws StorageFileNotFoundError if missing.
   */
  async getImagePath(storageKey) {
    const absolutePath = this.resolveSafePath(storageKey);

    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
      const stat = await fs.promises.stat(absolutePath);
      return {
        absolutePath,
        size: stat.size,
        filename: path.basename(absolutePath),
      };
    } catch (err) {
      if (err instanceof PathTraversalError) {
        throw err;
      }
      throw new StorageFileNotFoundError(`Physical file not found for key: ${storageKey}`);
    }
  }

  /**
   * Create a readable stream for retrieving stored image.
   */
  async getImageStream(storageKey) {
    const { absolutePath, size, filename } = await this.getImagePath(storageKey);
    const stream = fs.createReadStream(absolutePath);
    return {
      stream,
      size,
      filename,
      absolutePath,
    };
  }

  /**
   * Delete stored image file (used for rollback or cleanup).
   */
  async deleteImage(storageKey) {
    if (!storageKey) return false;
    try {
      const absolutePath = this.resolveSafePath(storageKey);
      await fs.promises.unlink(absolutePath);
      return true;
    } catch (err) {
      // If already gone or path invalid, ignore or handle gracefully
      if (err.code === 'ENOENT') {
        return false;
      }
      if (err instanceof PathTraversalError) {
        throw err;
      }
      return false;
    }
  }

  /**
   * Check if image file physically exists without throwing.
   */
  async exists(storageKey) {
    if (!storageKey) return false;
    try {
      const absolutePath = this.resolveSafePath(storageKey);
      await fs.promises.access(absolutePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export default LocalStorageService;
