import mongoose from 'mongoose';

const detectionSchema = new mongoose.Schema(
  {
    class: {
      type: String,
      required: true,
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

const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      required: [true, 'Complaint ID is required'],
      unique: true,
      trim: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    issueType: {
      type: String,
      required: [true, 'Issue type is required'],
      enum: {
        values: ['POTHOLE', 'LEAKAGE', 'GARBAGE', 'OTHER'],
        message: '{VALUE} is not a supported issue type',
      },
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    confidence: {
      type: Number,
      min: [0, 'Confidence cannot be less than 0'],
      max: [1, 'Confidence cannot exceed 1'],
      default: 0.0,
    },
    severity: {
      type: String,
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH'],
        message: '{VALUE} is not a valid severity level',
      },
      default: 'MEDIUM',
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    latitude: {
      type: Number,
      required: false,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    longitude: {
      type: Number,
      required: false,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
        message: '{VALUE} is not a valid complaint status',
      },
      default: 'PENDING',
      index: true,
    },
    detections: {
      type: [detectionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const Complaint = mongoose.model('Complaint', complaintSchema);

export default Complaint;
