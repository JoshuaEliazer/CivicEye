import Complaint from '../models/Complaint.js';

// Allowed statuses and issue types for strict query and update validation
const ALLOWED_STATUSES = [
  'submitted',
  'under_review',
  'in_progress',
  'resolved',
  'rejected',
  'pending',
];

const ALLOWED_ISSUE_TYPES = [
  'pothole',
  'leakage',
  'garbage',
  'other',
  'none',
  'unknown',
];

/**
 * Escapes regex special characters to prevent regex injection attacks.
 */
const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 * Get all complaints across all users with search, filtering, and pagination.
 * Route: GET /api/admin/complaints
 * Access: Protected (ADMIN only)
 */
export const getAllComplaints = async (req, res, next) => {
  try {
    // 1. Parse and validate pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    // 2. Build secure query object
    const query = {};

    // 2a. Issue Type Filter
    if (req.query.issueType && typeof req.query.issueType === 'string') {
      const normalizedIssue = req.query.issueType.trim().toLowerCase();
      if (ALLOWED_ISSUE_TYPES.includes(normalizedIssue)) {
        query.issueType = normalizedIssue;
      }
    }

    // 2b. Status Filter
    if (req.query.status && typeof req.query.status === 'string') {
      const normalizedStatus = req.query.status.trim().toLowerCase();
      if (ALLOWED_STATUSES.includes(normalizedStatus)) {
        if (normalizedStatus === 'submitted') {
          query.status = { $in: ['submitted', 'pending'] };
        } else {
          query.status = normalizedStatus;
        }
      }
    }

    // 2c. Safe Search across complaintId, description, issueType, address
    if (req.query.search && typeof req.query.search === 'string') {
      const trimmedSearch = req.query.search.trim().substring(0, 100);
      if (trimmedSearch.length > 0) {
        const searchRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
        query.$or = [
          { complaintId: searchRegex },
          { issueType: searchRegex },
          { description: searchRegex },
          { 'location.address': searchRegex },
          { 'image.originalName': searchRegex },
        ];
      }
    }

    // 3. Query total count matching filter
    const total = await Complaint.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;

    // 4. Retrieve complaints with safe reporter population (passwords strictly excluded)
    const complaints = await Complaint.find(query)
      .populate('user', 'name email role createdAt')
      .populate('userId', 'name email role createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      complaints,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get full complaint details for an administrator.
 * Route: GET /api/admin/complaints/:complaintId
 * Access: Protected (ADMIN only)
 */
export const getAdminComplaintById = async (req, res, next) => {
  try {
    const { complaintId } = req.params;

    if (!complaintId || typeof complaintId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID provided.',
        error: 'INVALID_COMPLAINT_ID',
      });
    }

    const complaint = await Complaint.findOne({ complaintId: complaintId.trim() })
      .populate('user', 'name email role createdAt')
      .populate('userId', 'name email role createdAt');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint with ID '${complaintId}' was not found.`,
        error: 'COMPLAINT_NOT_FOUND',
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
 * Update complaint status by an administrator.
 * Route: PATCH /api/admin/complaints/:complaintId/status
 * Access: Protected (ADMIN only)
 */
export const updateComplaintStatus = async (req, res, next) => {
  try {
    const { complaintId } = req.params;
    const { status } = req.body;

    // 1. Validate status parameter
    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Status is required and must be a string.',
        error: 'MISSING_STATUS',
      });
    }

    const normalizedStatus = status.trim().toLowerCase();
    const VALID_UPDATE_STATUSES = ['submitted', 'under_review', 'in_progress', 'resolved', 'rejected'];

    if (!VALID_UPDATE_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Allowed statuses: ${VALID_UPDATE_STATUSES.join(', ')}`,
        error: 'INVALID_STATUS',
      });
    }

    // 2. Find and update the complaint
    const complaint = await Complaint.findOne({ complaintId: complaintId?.trim() });
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint with ID '${complaintId}' was not found.`,
        error: 'COMPLAINT_NOT_FOUND',
      });
    }

    complaint.status = normalizedStatus;
    const updatedComplaint = await complaint.save();

    // Populate user reference for the response
    await updatedComplaint.populate('user', 'name email role createdAt');

    return res.status(200).json({
      success: true,
      message: 'Complaint status updated successfully.',
      complaint: updatedComplaint,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get database-derived complaint statistics.
 * Route: GET /api/admin/statistics
 * Access: Protected (ADMIN only)
 */
export const getAdminStatistics = async (req, res, next) => {
  try {
    // Execute live database counts in parallel
    const [
      totalComplaints,
      submittedCount,
      underReviewCount,
      inProgressCount,
      resolvedCount,
      rejectedCount,
      potholesCount,
      leakagesCount,
      garbageCount,
      otherCount,
    ] = await Promise.all([
      Complaint.countDocuments({}),
      Complaint.countDocuments({ status: { $in: ['submitted', 'pending', 'SUBMITTED', 'PENDING'] } }),
      Complaint.countDocuments({ status: { $in: ['under_review', 'UNDER_REVIEW'] } }),
      Complaint.countDocuments({ status: { $in: ['in_progress', 'IN_PROGRESS'] } }),
      Complaint.countDocuments({ status: { $in: ['resolved', 'RESOLVED'] } }),
      Complaint.countDocuments({ status: { $in: ['rejected', 'REJECTED'] } }),
      Complaint.countDocuments({ issueType: { $in: ['pothole', 'POTHOLE'] } }),
      Complaint.countDocuments({ issueType: { $in: ['leakage', 'LEAKAGE'] } }),
      Complaint.countDocuments({ issueType: { $in: ['garbage', 'GARBAGE'] } }),
      Complaint.countDocuments({
        issueType: {
          $in: ['other', 'OTHER', 'none', 'NONE', 'unknown', 'UNKNOWN'],
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      statistics: {
        totalComplaints,
        submitted: submittedCount,
        underReview: underReviewCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
        rejected: rejectedCount,
        potholes: potholesCount,
        leakages: leakagesCount,
        garbage: garbageCount,
        other: otherCount,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export default {
  getAllComplaints,
  getAdminComplaintById,
  updateComplaintStatus,
  getAdminStatistics,
};
