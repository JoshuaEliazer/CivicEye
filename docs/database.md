# CivicEye Database Specification

## 1. Overview

CivicEye utilizes **MongoDB** via the **Mongoose** ODM (Object Data Modeling) library for structured, schema-validated persistence of users, civic complaints, and computer-vision detection metadata.

- **Engine**: MongoDB Community Server 7.x
- **Default Port**: `27017`
- **Default Database**: `civiceye`

---

## 2. Models & Schemas

### 2.1 User Model (`models/User.js`)

Represents registered citizens and administrators in the CivicEye platform.

| Field | Type | Required | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto | Primary key | Unique document identifier |
| `name` | String | Yes | Trimmed, min: 2, max: 100 | Citizen or administrator full name |
| `email` | String | Yes | Unique, lowercase, indexed, RFC regex | Account email address |
| `password` | String | Yes | Min: 6 characters, hashed | Salted Bcrypt hash (10 rounds) |
| `role` | String | Yes | Enum: `['USER', 'ADMIN']`, default: `'USER'` | Access control role |
| `createdAt` | Date | Auto | Timestamps option | Registration timestamp |
| `updatedAt` | Date | Auto | Timestamps option | Last update timestamp |

---

### 2.2 Complaint Model (`models/Complaint.js`)

Stores civic infrastructure issue reports submitted by citizens, enriched by Ultralytics YOLO26 detection predictions.

| Field | Type | Required | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto | Primary key | Unique document identifier |
| `complaintId` | String | Yes | Unique, indexed (e.g. `CE-2026-000001`) | Human-readable tracking ID |
| `user` | ObjectId | No | Ref: `User`, indexed | Primary submitter account reference |
| `userId` | ObjectId | No | Ref: `User`, indexed | Synchronized legacy alias for `user` |
| `issueType` | String | Yes | Enum: `['pothole', 'leakage', 'garbage', 'other', 'none']` (case-insensitive) | Primary classified civic problem |
| `description` | String | No | Trimmed, max: 1000 characters, default: `''` | Citizen problem description |
| `confidence` | Number | No | Min: 0.0, max: 1.0, default: `0.0` | YOLO26 detection confidence score |
| `isUncertain` | Boolean | No | Default: `false` | True if confidence is below confident threshold |
| `severity` | String | Yes | Enum: `['LOW', 'MEDIUM', 'HIGH']`, default: `'MEDIUM'` | Problem urgency level |
| `imageUrl` | String | No | Trimmed | URL or file path of the evidence photo |
| `image` | Object | No | Subdocument `{ originalName, mimetype, size, path }` | Evidence photo upload metadata |
| `location` | Object | No | Subdocument `{ latitude, longitude, address }` | Geospatial location details |
| `latitude` | Number | No | Min: -90, max: 90 | Direct latitude coordinate |
| `longitude` | Number | No | Min: -180, max: 180 | Direct longitude coordinate |
| `modelArchitecture` | String | No | Default: `'Ultralytics YOLO26'` | ML model architecture tag |
| `modelVariant` | String | No | Default: `'YOLO26n'` | Specific model checkpoint variant |
| `isCustomModel` | Boolean | No | Default: `false` | Custom trained vs pretrained baseline |
| `status` | String | Yes | Enum: `['submitted', 'under_review', 'in_progress', 'resolved', 'rejected', 'pending']`, default: `'submitted'`, indexed | Lifecycle state |
| `detections` | Array | No | Subdocument array, default: `[]` | YOLO26 bounding boxes and classes |
| `createdAt` | Date | Auto | Timestamps option | Submission timestamp |
| `updatedAt` | Date | Auto | Timestamps option | Last status/content modification |

#### Detection Subdocument (`detections[]`)
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `class` | String | Yes | Trimmed | Class name (e.g. `pothole`, `leakage`, `garbage`) |
| `classId` | Number | No | Default: `0` | Numeric class index |
| `confidence` | Number | Yes | Min: 0.0, max: 1.0 | Detection confidence score |
| `bbox` | [Number] | Yes | Length: 4 `[x1, y1, x2, y2]` | Bounding box pixel coordinates |

---

## 3. Database Indexes

- `users.email`: Unique ascending index for fast lookups and collision prevention during registration.
- `complaints.complaintId`: Unique ascending index for rapid complaint tracking lookups.
- `complaints.user`: Ascending index for filtering complaints submitted by a citizen.
- `complaints.userId`: Ascending index for legacy compatibility queries.
- `complaints.status`: Ascending index for filtering complaints by lifecycle status.
- `complaints.issueType`: Ascending index for analytics and categorical aggregation.
- `complaints.createdAt`: Descending sort index for efficient recent-first feeds.

---

## 4. Dual User Association Synchronization

To guarantee 100% backward compatibility with earlier project phases while conforming to Phase 7 conventions:
- The Mongoose schema provides both `user` and `userId` fields.
- A `pre('validate')` hook automatically synchronizes them:
  ```javascript
  if (this.user && !this.userId) {
    this.userId = this.user;
  } else if (this.userId && !this.user) {
    this.user = this.userId;
  }
  ```
- Population queries work seamlessly on either field.
