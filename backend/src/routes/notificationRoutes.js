import express from 'express';
import {
  getMyNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All notification routes require authenticated JWT token
router.use(protect);

/**
 * @route   GET /api/notifications
 * @desc    Get paginated notifications belonging to authenticated citizen
 * @access  Protected
 */
router.get('/', getMyNotifications);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications for authenticated citizen
 * @access  Protected
 */
router.get('/unread-count', getUnreadCount);

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all unread notifications belonging to authenticated citizen as read
 * @access  Protected
 */
router.patch('/read-all', markAllNotificationsRead);

/**
 * @route   PATCH /api/notifications/:notificationId/read
 * @desc    Mark a single notification as read (with recipient ownership validation)
 * @access  Protected
 */
router.patch('/:notificationId/read', markNotificationRead);

export default router;
