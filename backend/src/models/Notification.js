import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // The recipient user of the notification (strictly enforced from JWT)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for a notification'],
      index: true,
    },
    // Associated complaint document reference (if applicable)
    complaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
      default: null,
      index: true,
    },
    // Human-readable complaint ID (e.g., 'CE-2026-000001') for display & navigation
    complaintId: {
      type: String,
      trim: true,
      default: null,
    },
    // Standardized notification event types
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: {
        values: [
          'complaint_submitted',
          'complaint_under_review',
          'complaint_in_progress',
          'complaint_resolved',
          'complaint_rejected',
          'system_alert',
        ],
        message: '{VALUE} is not a valid notification type',
      },
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal query performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

// Clean serialization to JSON
notificationSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
