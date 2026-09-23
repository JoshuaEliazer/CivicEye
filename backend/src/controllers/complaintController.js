import Complaint from '../models/Complaint.js';
import { generateComplaintId } from '../utils/idGenerator.js';
import { predictCivicIssue, MLServiceError } from '../services/mlService.js';

/**
 * Submit a new civic complaint with image and run YOLO26 ML inference.
 * Route: POST /api/complaints
 * Access: Protected (Requires Bearer token)
 */
export const createComplaint = async (req, res, next) => {
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

    // 5. Send image through existing FastAPI YOLO26 ML Service
    const mlResult = await predictCivicIssue(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      confidenceOverride
    );

    // 6. Generate unique human-readable Complaint ID
    const complaintId = await generateComplaintId();

    // Map ML issue to schema-supported issueType
    let issueType = 'unknown';
    if (mlResult.issue && ['pothole', 'leakage', 'garbage', 'other', 'none'].includes(mlResult.issue.toLowerCase())) {
      issueType = mlResult.issue.toLowerCase();
    }

    // 7. Persist Complaint to MongoDB
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
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.originalname,
      },
      imageUrl: req.file.originalname,
      location: {
        latitude: parsedLat,
        longitude: parsedLng,
        address,
      },
      latitude: parsedLat,
      longitude: parsedLng,
      status: 'submitted',
    });

    const savedComplaint = await newComplaint.save();

    // 8. Return created complaint information
    return res.status(201).json({
      success: true,
      message: 'Civic complaint submitted successfully.',
      complaint: savedComplaint,
    });
  } catch (err) {
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
    const complaints = await Complaint.find({
      $or: [{ user: userId }, { userId: userId }],
    }).sort({ createdAt: -1 });

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
    const isOwner =
      (complaint.user && complaint.user.toString() === req.user._id.toString()) ||
      (complaint.userId && complaint.userId.toString() === req.user._id.toString());
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

export default {
  createComplaint,
  getMyComplaints,
  getComplaintById,
};
