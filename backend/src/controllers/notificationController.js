import notificationService, { NotificationError } from '../services/notificationService.js';

/**
 * Get all notifications belonging to the authenticated user.
 * Route: GET /api/notifications
 * Access: Protected (Requires Bearer token)
 */
export const getMyNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page, limit, unreadOnly } = req.query;

    const result = await notificationService.getUserNotifications(userId, {
      page,
      limit,
      unreadOnly: unreadOnly === 'true',
    });

    return res.status(200).json({
      success: true,
      notifications: result.notifications,
      unreadCount: result.unreadCount,
      pagination: result.pagination,
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        error: err.code,
      });
    }
    return next(err);
  }
};

/**
 * Get the count of unread notifications for the authenticated user.
 * Route: GET /api/notifications/unread-count
 * Access: Protected (Requires Bearer token)
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const unreadCount = await notificationService.getUnreadCount(userId);

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        error: err.code,
      });
    }
    return next(err);
  }
};

/**
 * Mark a specific notification as read.
 * Route: PATCH /api/notifications/:notificationId/read
 * Access: Protected (Requires Bearer token; caller must own the notification)
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notificationId } = req.params;

    const notification = await notificationService.markNotificationAsRead(notificationId, userId);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notification,
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        error: err.code,
      });
    }
    return next(err);
  }
};

/**
 * Mark all notifications for the authenticated user as read.
 * Route: PATCH /api/notifications/read-all
 * Access: Protected (Requires Bearer token)
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await notificationService.markAllNotificationsAsRead(userId);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    if (err instanceof NotificationError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        error: err.code,
      });
    }
    return next(err);
  }
};

export default {
  getMyNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};
