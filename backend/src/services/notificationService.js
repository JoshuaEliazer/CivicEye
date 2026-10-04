import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

export class NotificationError extends Error {
  constructor(message, code = 'NOTIFICATION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Service managing in-app notifications and complaint lifecycle event tracking.
 */
class NotificationService {
  /**
   * Create and persist a new in-app notification.
   */
  async createNotification({
    userId,
    complaint = null,
    complaintId = null,
    type,
    title,
    message,
    metadata = {},
  }) {
    if (!userId) {
      throw new NotificationError('User recipient ID is required to create a notification.', 'MISSING_RECIPIENT');
    }

    if (!type || !title || !message) {
      throw new NotificationError('Notification type, title, and message are required.', 'INVALID_NOTIFICATION_DATA');
    }

    // Resolve complaint ObjectId if a complaint document was passed
    let complaintDocId = null;
    let resolvedComplaintId = complaintId;

    if (complaint) {
      if (complaint._id) {
        complaintDocId = complaint._id;
        if (!resolvedComplaintId && complaint.complaintId) {
          resolvedComplaintId = complaint.complaintId;
        }
      } else if (mongoose.isValidObjectId(complaint)) {
        complaintDocId = complaint;
      }
    }

    const notification = new Notification({
      user: userId,
      complaint: complaintDocId,
      complaintId: resolvedComplaintId || null,
      type,
      title: title.trim(),
      message: message.trim(),
      metadata,
    });

    return await notification.save();
  }

  /**
   * Trigger notification when a citizen submits a complaint.
   */
  async notifyComplaintSubmitted(complaint, user) {
    if (!complaint) return null;

    const recipientId =
      (user && (user._id || user.id)) ||
      (complaint.user && (complaint.user._id || complaint.user)) ||
      (complaint.userId && (complaint.userId._id || complaint.userId));

    if (!recipientId) return null;

    const readableId = complaint.complaintId || 'Unknown ID';

    return await this.createNotification({
      userId: recipientId,
      complaint,
      complaintId: readableId,
      type: 'complaint_submitted',
      title: 'Complaint Submitted',
      message: `Your complaint ${readableId} has been submitted successfully.`,
      metadata: {
        issueType: complaint.issueType,
        status: complaint.status || 'submitted',
      },
    });
  }

  /**
   * Trigger notification when an administrator updates a complaint's status.
   * Ensures same-status updates do not generate duplicate notifications.
   */
  async notifyComplaintStatusChanged(complaint, oldStatus, newStatus) {
    if (!complaint) return null;

    const normOld = (oldStatus || '').trim().toLowerCase();
    const normNew = (newStatus || '').trim().toLowerCase();

    // Guard: Prevent duplicate notifications if status has not changed
    if (normOld === normNew) {
      return null;
    }

    const recipientId =
      (complaint.user && (complaint.user._id || complaint.user)) ||
      (complaint.userId && (complaint.userId._id || complaint.userId));

    if (!recipientId) return null;

    const readableId = complaint.complaintId || 'Unknown ID';

    let type;
    let title;
    let message;

    switch (normNew) {
      case 'under_review':
        type = 'complaint_under_review';
        title = 'Complaint Under Review';
        message = `Your complaint ${readableId} is now under review.`;
        break;
      case 'in_progress':
        type = 'complaint_in_progress';
        title = 'Complaint In Progress';
        message = `Your complaint ${readableId} is now in progress.`;
        break;
      case 'resolved':
        type = 'complaint_resolved';
        title = 'Complaint Resolved';
        message = `Your complaint ${readableId} has been marked as resolved.`;
        break;
      case 'rejected':
        type = 'complaint_rejected';
        title = 'Complaint Rejected';
        message = `Your complaint ${readableId} has been rejected.`;
        break;
      case 'submitted':
      case 'pending':
        type = 'complaint_submitted';
        title = 'Complaint Submitted';
        message = `Your complaint ${readableId} is currently submitted.`;
        break;
      default:
        type = 'system_alert';
        title = 'Complaint Status Updated';
        message = `Your complaint ${readableId} status changed to ${newStatus}.`;
        break;
    }

    return await this.createNotification({
      userId: recipientId,
      complaint,
      complaintId: readableId,
      type,
      title,
      message,
      metadata: {
        oldStatus: normOld,
        newStatus: normNew,
        issueType: complaint.issueType,
      },
    });
  }

  /**
   * Retrieve paginated notifications belonging exclusively to the authenticated user.
   */
  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    if (!userId) {
      throw new NotificationError('User ID is required.', 'MISSING_USER_ID');
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const query = { user: userId };
    if (unreadOnly) {
      query.isRead = false;
    }

    const [notifications, totalMatching, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('complaint', 'complaintId issueType status location createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ user: userId, isRead: false }),
    ]);

    const totalPages = Math.ceil(totalMatching / safeLimit) || 1;

    return {
      notifications,
      unreadCount,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: totalMatching,
        totalPages,
        count: notifications.length,
      },
    };
  }

  /**
   * Count unread notifications for a specific user.
   */
  async getUnreadCount(userId) {
    if (!userId) return 0;
    return await Notification.countDocuments({ user: userId, isRead: false });
  }

  /**
   * Mark a single notification as read with strict ownership validation.
   */
  async markNotificationAsRead(notificationId, userId) {
    if (!notificationId || !mongoose.isValidObjectId(notificationId)) {
      throw new NotificationError('Invalid notification ID format.', 'INVALID_NOTIFICATION_ID', 400);
    }

    const notification = await Notification.findById(notificationId);
    if (!notification) {
      throw new NotificationError('Notification not found.', 'NOTIFICATION_NOT_FOUND', 404);
    }

    // Enforce strict recipient ownership
    if (notification.user.toString() !== userId.toString()) {
      throw new NotificationError(
        'Access denied: You are not authorized to modify this notification.',
        'FORBIDDEN',
        403
      );
    }

    // Idempotent: Only update if currently unread
    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    return notification;
  }

  /**
   * Mark all unread notifications belonging to the authenticated user as read.
   */
  async markAllNotificationsAsRead(userId) {
    if (!userId) {
      throw new NotificationError('User ID is required.', 'MISSING_USER_ID');
    }

    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    return {
      modifiedCount: result.modifiedCount || 0,
    };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
