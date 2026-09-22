import express from 'express';
import {
  getAllComplaints,
  getAdminComplaintById,
  updateComplaintStatus,
  getAdminStatistics,
} from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce admin-level authorization on all /api/admin routes
router.use(requireAdmin);

/**
 * @route   GET /api/admin/complaints
 * @desc    Get all complaints across all users (with pagination, search, and filtering)
 * @access  Protected (ADMIN only)
 */
router.get('/complaints', getAllComplaints);

/**
 * @route   GET /api/admin/complaints/:complaintId
 * @desc    Get detailed complaint record with populated reporter information
 * @access  Protected (ADMIN only)
 */
router.get('/complaints/:complaintId', getAdminComplaintById);

/**
 * @route   PATCH /api/admin/complaints/:complaintId/status
 * @desc    Update complaint resolution status
 * @access  Protected (ADMIN only)
 */
router.patch('/complaints/:complaintId/status', updateComplaintStatus);

/**
 * @route   GET /api/admin/statistics
 * @desc    Get live database-derived complaint statistics
 * @access  Protected (ADMIN only)
 */
router.get('/statistics', getAdminStatistics);

export default router;
