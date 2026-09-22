import mongoose from 'mongoose';

const detectionSchema = new mongoose.Schema(
  {
    class: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    bbox: {
      type: [Number], // [x1, y1, x2, y2]
      required: true,
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length === 4;
        },
        message: 'Bounding box must contain exactly 4 coordinates [x1, y1, x2, y2]',
      },
    },
  },
  { _id: false }
);

const imageMetaSchema = new mongoose.Schema(
  {
    originalName: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: { type: Number },
    path: { type: String, trim: true },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
    address: {
      type: String,
      trim: true,
      maxlength: [500, 'Address cannot exceed 500 characters'],
    },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: [true, 'Complaint ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    // Primary User reference (Phase 7)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // Backwards-compatible User reference (Phase 2)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    issueType: {
      type: String,
      required: [true, 'Issue type is required'],
      set: (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val),
      enum: {
        values: [
          'pothole',
          'leakage',
          'garbage',
          'other',
          'unknown',
          'none',
          // Uppercase aliases for Phase 2 compatibility
          'POTHOLE',
          'LEAKAGE',
          'GARBAGE',
          'OTHER',
          'UNKNOWN',
          'NONE',
        ],
        message: '{VALUE} is not a supported issue type',
      },
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    // ML Information
    confidence: {
      type: Number,
      min: [0, 'Confidence cannot be less than 0'],
      max: [1, 'Confidence cannot exceed 1'],
      default: 0.0,
    },
    isUncertain: {
      type: Boolean,
      default: false,
    },
    modelArchitecture: {
      type: String,
      default: 'Ultralytics YOLO26',
    },
    modelVariant: {
      type: String,
      default: 'YOLO26n',
    },
    isCustomModel: {
      type: Boolean,
      default: false,
    },
    detections: {
      type: [detectionSchema],
      default: [],
    },
    // Image Information
    image: {
      type: imageMetaSchema,
      default: () => ({}),
    },
    imageUrl: {
      type: String,
      default: function () {
        return this.image?.path || this.image?.originalName || 'uploaded-image';
      },
      trim: true,
    },
    // Location Information
    location: {
      type: locationSchema,
      default: () => ({}),
    },
    // Direct coordinates for Phase 2 backward compatibility
    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
    // Status (Phase 7 controlled enum + Phase 2 compatibility)
    status: {
      type: String,
      set: (val) => (typeof val === 'string' ? val.toLowerCase().trim() : val),
      enum: {
        values: [
          'submitted',
          'under_review',
          'in_progress',
          'resolved',
          'rejected',
          // Phase 2 compatibility values
          'pending',
          'SUBMITTED',
          'UNDER_REVIEW',
          'IN_PROGRESS',
          'RESOLVED',
          'REJECTED',
          'PENDING',
        ],
        message: '{VALUE} is not a valid complaint status',
      },
      default: 'submitted',
      index: true,
    },
    severity: {
      type: String,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'low', 'medium', 'high'],
        message: '{VALUE} is not a valid severity level',
      },
      default: 'MEDIUM',
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook to sync user and userId, and synchronize location fields
complaintSchema.pre('validate', function (next) {
  // Sync user and userId
  if (!this.user && this.userId) {
    this.user = this.userId;
  } else if (!this.userId && this.user) {
    this.userId = this.user;
  }

  // Sync direct coordinates with location subdocument
  if (this.latitude !== undefined && this.location && this.location.latitude === undefined) {
    this.location.latitude = this.latitude;
  }
  if (this.longitude !== undefined && this.location && this.location.longitude === undefined) {
    this.location.longitude = this.longitude;
  }
  if (this.location?.latitude !== undefined && this.latitude === undefined) {
    this.latitude = this.location.latitude;
  }
  if (this.location?.longitude !== undefined && this.longitude === undefined) {
    this.longitude = this.location.longitude;
  }

  // Ensure imageUrl is populated if image.originalName exists
  if (!this.imageUrl && this.image?.originalName) {
    this.imageUrl = this.image.originalName;
  }

  next();
});

const Complaint = mongoose.model('Complaint', complaintSchema);

export default Complaint;
