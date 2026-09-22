import multer from 'multer';
import path from 'path';

// Allowed image formats
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

// In-memory storage for efficient buffer forwarding to FastAPI
const storage = multer.memoryStorage();

// File filter for format validation
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const error = new Error(
      `Unsupported file extension '${ext}'. Allowed extensions: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`
    );
    error.statusCode = 400;
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    const error = new Error(
      `Unsupported MIME type '${mimetype}'. Allowed MIME types: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`
    );
    error.statusCode = 400;
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

/**
 * Middleware that accepts single file upload under either 'image' or 'file' field name.
 */
export const uploadSingleImage = (req, res, next) => {
  // Support either 'image' or 'file' field name
  const uploader = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  uploader(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: `File size exceeds the 10MB limit.`,
            error: 'FILE_TOO_LARGE',
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`,
          error: err.code,
        });
      }

      if (err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
          error: err.code || 'VALIDATION_ERROR',
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed.',
        error: 'UPLOAD_ERROR',
      });
    }

    // Normalize file object onto req.file regardless of whether field was 'image' or 'file'
    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        req.file = req.files.image[0];
      } else if (req.files.file && req.files.file[0]) {
        req.file = req.files.file[0];
      }
    }

    next();
  });
};
