import express from 'express';
import {
  createComplaint,
  getMyComplaints,
  getComplaintById,
} from '../controllers/complaintController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadSingleImage } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/complaints
 * @desc    Submit a new civic complaint with image and run YOLO26 detection
 * @access  Protected (Requires Bearer token)
 */
router.post('/', protect, uploadSingleImage, createComplaint);

/**
 * @route   GET /api/complaints
 * @desc    Get all complaints submitted by the authenticated citizen
 * @access  Protected (Requires Bearer token)
 */
router.get('/', protect, getMyComplaints);

/**
 * @route   GET /api/complaints/:complaintId
 * @desc    Get specific complaint details by public complaint ID
 * @access  Protected (Requires Bearer token; caller must be owner or ADMIN)
 */
router.get('/:complaintId', protect, getComplaintById);

export default router;
