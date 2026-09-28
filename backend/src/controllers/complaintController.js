import Complaint from '../models/Complaint.js';
import { generateComplaintId } from '../utils/idGenerator.js';
import { predictCivicIssue, MLServiceError } from '../services/mlService.js';
import storageService, {
  StorageError,
  StorageFileNotFoundError,
  PathTraversalError,
} from '../services/storage/index.js';

/**
 * Submit a new civic complaint with image and run YOLO26 ML inference.
 * Route: POST /api/complaints
 * Access: Protected (Requires Bearer token)
 */
export const createComplaint = async (req, res, next) => {
  let storedImage = null;

  try {
    // 1. Validate image upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'An image file is required to file a complaint.',
        error: 'MISSING_IMAGE',
      });
    }

    // 2. Validate coordinates if provided (Phase 9 strict numeric validation)
    let parsedLat = undefined;
    let parsedLng = undefined;

    const rawLat = req.body.latitude !== undefined ? req.body.latitude : req.query.latitude;
    if (rawLat !== undefined && rawLat !== null) {
      const trimmedLat = typeof rawLat === 'string' ? rawLat.trim() : rawLat;
      if (trimmedLat !== '') {
        const numLat = Number(trimmedLat);
        if (isNaN(numLat) || !Number.isFinite(numLat) || numLat < -90 || numLat > 90) {
          return res.status(400).json({
            success: false,
            message: 'Latitude must be a valid number between -90 and 90.',
            error: 'INVALID_LATITUDE',
          });
        }
        parsedLat = numLat;
      }
    }

    const rawLng = req.body.longitude !== undefined ? req.body.longitude : req.query.longitude;
    if (rawLng !== undefined && rawLng !== null) {
      const trimmedLng = typeof rawLng === 'string' ? rawLng.trim() : rawLng;
      if (trimmedLng !== '') {
        const numLng = Number(trimmedLng);
        if (isNaN(numLng) || !Number.isFinite(numLng) || numLng < -180 || numLng > 180) {
          return res.status(400).json({
            success: false,
            message: 'Longitude must be a valid number between -180 and 180.',
            error: 'INVALID_LONGITUDE',
          });
        }
        parsedLng = numLng;
      }
    }

    // 3. Validate description
    const rawDesc = req.body.description;
    let description = 'Civic issue reported via CivicEye';
    if (rawDesc && typeof rawDesc === 'string' && rawDesc.trim().length > 0) {
      if (rawDesc.trim().length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Description cannot exceed 1000 characters.',
          error: 'DESCRIPTION_TOO_LONG',
        });
      }
      description = rawDesc.trim();
    }

    const address = req.body.address ? String(req.body.address).trim().substring(0, 500) : undefined;

    // 4. Parse optional confidence threshold override
    let confidenceOverride = null;
    const rawConf = req.body.confidence || req.query.confidence;
    if (rawConf !== undefined && rawConf !== null && rawConf !== '') {
      const parsedConf = parseFloat(rawConf);
      if (!isNaN(parsedConf) && parsedConf >= 0 && parsedConf <= 1) {
        confidenceOverride = parsedConf;
      }
    }

    // 5. Generate unique human-readable Complaint ID first
    const complaintId = await generateComplaintId();

    // 6. Save image safely through storage abstraction
    try {
      storedImage = await storageService.saveImage({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        complaintId,
        subDir: 'complaints',
      });
    } catch (storageErr) {
      return res.status(storageErr.statusCode || 400).json({
        success: false,
        message: `Image storage failed: ${storageErr.message}`,
        error: storageErr.code || 'STORAGE_ERROR',
      });
    }

    // 7. Send image through existing FastAPI YOLO26 ML Service
    let mlResult;
    try {
      mlResult = await predictCivicIssue(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        confidenceOverride
      );
    } catch (mlErr) {
      // Rollback stored image if ML inference fails
      if (storedImage?.storageKey) {
        await storageService.deleteImage(storedImage.storageKey).catch(() => {});
      }
      if (mlErr instanceof MLServiceError) {
        return res.status(mlErr.statusCode).json({
          success: false,
          message: `Inference failed: ${mlErr.message}`,
          error: mlErr.code,
        });
      }
      throw mlErr;
    }

    // Map ML issue to schema-supported issueType
    let issueType = 'unknown';
    if (mlResult.issue && ['pothole', 'leakage', 'garbage', 'other', 'none'].includes(mlResult.issue.toLowerCase())) {
      issueType = mlResult.issue.toLowerCase();
    }

    // 8. Persist Complaint to MongoDB with storage metadata
    const imageUrl = `/api/complaints/${complaintId}/image`;
    const newComplaint = new Complaint({
      complaintId,
      user: req.user._id,
      userId: req.user._id,
      issueType,
      description,
      confidence: mlResult.confidence || 0.0,
      isUncertain: Boolean(mlResult.isUncertain),
      modelArchitecture: mlResult.model?.architecture || 'Ultralytics YOLO26',
      modelVariant: mlResult.model?.variant || 'YOLO26n',
      isCustomModel: Boolean(mlResult.model?.isCustomModel),
      detections: mlResult.detections || [],
      image: {
        filename: storedImage.filename,
        originalName: storedImage.originalName,
        mimetype: storedImage.mimetype,
        size: storedImage.size,
        storageType: storedImage.storageType || 'local',
        storageKey: storedImage.storageKey,
        path: storedImage.path,
        url: imageUrl,
      },
      imageUrl,
      location: {
        latitude: parsedLat,
        longitude: parsedLng,
        address,
      },
      latitude: parsedLat,
      longitude: parsedLng,
      status: 'submitted',
    });

    let savedComplaint;
    try {
      savedComplaint = await newComplaint.save();
    } catch (dbErr) {
      // Rollback: delete stored image file on DB persistence failure
      if (storedImage?.storageKey) {
        await storageService.deleteImage(storedImage.storageKey).catch(() => {});
      }
      throw dbErr;
    }

    // 9. Return created complaint information
    return res.status(201).json({
      success: true,
      message: 'Civic complaint submitted successfully.',
      complaint: savedComplaint,
    });
  } catch (err) {
    // Cleanup stored file in case of any unhandled error during creation
    if (storedImage?.storageKey) {
      await storageService.deleteImage(storedImage.storageKey).catch(() => {});
    }

    if (err instanceof MLServiceError) {
      return res.status(err.statusCode).json({
        success: false,
        message: `Inference failed: ${err.message}`,
        error: err.code,
      });
    }

    return next(err);
  }
};

/**
 * List all complaints belonging to the authenticated citizen.
 * Route: GET /api/complaints
 * Access: Protected (Requires Bearer token)
 */
export const getMyComplaints = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Filter strictly by authenticated user's ID
    const query = {
      $or: [{ user: userId }, { userId: userId }],
    };

    // Optional query filters for citizen dashboard
    if (req.query.status) {
      query.status = req.query.status.toLowerCase().trim();
    }

    if (req.query.issueType) {
      query.issueType = req.query.issueType.toLowerCase().trim();
    }

    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const sanitized = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(sanitized, 'i');
      query.$and = [
        {
          $or: [
            { complaintId: searchRegex },
            { description: searchRegex },
            { 'location.address': searchRegex },
          ],
        },
      ];
    }

    const complaints = await Complaint.find(query).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get details of a single complaint by complaint ID.
 * Route: GET /api/complaints/:complaintId
 * Access: Protected (Requires Bearer token; caller must be owner or ADMIN)
 */
export const getComplaintById = async (req, res, next) => {
  try {
    const { complaintId } = req.params;

    const complaint = await Complaint.findOne({ complaintId });
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint with ID '${complaintId}' was not found.`,
        error: 'COMPLAINT_NOT_FOUND',
      });
    }

    // Verify ownership or ADMIN authorization
    const complaintOwnerId =
      (complaint.user && (complaint.user._id ? complaint.user._id.toString() : complaint.user.toString())) ||
      (complaint.userId && (complaint.userId._id ? complaint.userId._id.toString() : complaint.userId.toString()));
    const isOwner = complaintOwnerId === req.user._id.toString();
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not authorized to view this complaint.',
        error: 'FORBIDDEN',
      });
    }

    return res.status(200).json({
      success: true,
      complaint,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Retrieve stored complaint image with role-based and ownership authorization.
 * Route: GET /api/complaints/:complaintId/image
 * Access: Protected (Requires Bearer token or ?token=)
 */
export const getComplaintImage = async (req, res, next) => {
  try {
    const { complaintId } = req.params;

    const complaint = await Complaint.findOne({ complaintId });
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint with ID '${complaintId}' was not found.`,
        error: 'COMPLAINT_NOT_FOUND',
      });
    }

    // Verify ownership or ADMIN authorization
    const complaintOwnerId =
      (complaint.user && (complaint.user._id ? complaint.user._id.toString() : complaint.user.toString())) ||
      (complaint.userId && (complaint.userId._id ? complaint.userId._id.toString() : complaint.userId.toString()));
    const isOwner = complaintOwnerId === req.user._id.toString();
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not authorized to access this complaint image.',
        error: 'FORBIDDEN',
      });
    }

    // Check if complaint has image reference
    const storageKey =
      complaint.image?.storageKey ||
      (complaint.image?.filename ? `complaints/${complaint.image.filename}` : null) ||
      complaint.image?.path;

    if (!storageKey) {
      return res.status(404).json({
        success: false,
        message: `No stored image reference found for complaint '${complaintId}'.`,
        error: 'IMAGE_NOT_FOUND',
      });
    }

    try {
      const { stream, size } = await storageService.getImageStream(storageKey);
      const mime = complaint.image?.mimetype || 'image/jpeg';

      res.setHeader('Content-Type', mime);
      if (size) res.setHeader('Content-Length', size);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${complaint.image?.filename || `${complaintId}.jpg`}"`
      );

      return stream.pipe(res);
    } catch (err) {
      if (err instanceof StorageFileNotFoundError) {
        return res.status(404).json({
          success: false,
          message: 'Physical image file was not found on the storage server.',
          error: 'IMAGE_FILE_NOT_FOUND',
        });
      }
      if (err instanceof PathTraversalError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid image key: path traversal sequence detected.',
          error: 'PATH_TRAVERSAL_DETECTED',
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to stream complaint image.',
        error: 'STORAGE_RETRIEVAL_ERROR',
      });
    }
  } catch (err) {
    return next(err);
  }
};

export default {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  getComplaintImage,
};

