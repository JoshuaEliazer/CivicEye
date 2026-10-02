import express from 'express';
import { getOverview, exportCSV } from '../controllers/analyticsController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Enforce admin-level authorization on all /api/admin/analytics routes
router.use(requireAdmin);

/**
 * @route   GET /api/admin/analytics/overview
 * @desc    Get complete administrative city analytics and trends
 * @access  Protected (ADMIN only)
 */
router.get('/overview', getOverview);

/**
 * @route   GET /api/admin/analytics/export
 * @desc    Download aggregated analytics report as CSV
 * @access  Protected (ADMIN only)
 */
router.get('/export', exportCSV);

export default router;
