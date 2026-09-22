# CivicEye Database Specification

## 1. Overview

CivicEye utilizes **MongoDB** via the **Mongoose** ODM for structured, document-oriented persistence of users, civic complaints, and computer-vision detection metadata.

---

## 2. Models & Schemas

### 2.1 User Model (`models/User.js`)

Represents registered citizens and administrators in the CivicEye platform.

| Field | Type | Required | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto | Primary key | Unique document identifier |
| `name` | String | Yes | Trimmed, min: 2, max: 100 | Citizen or administrator full name |
| `email` | String | Yes | Unique, lowercase, indexed, RFC regex | Account email address |
| `password` | String | Yes | Min: 6 characters | Hashed account password |
| `role` | String | Yes | Enum: `['USER', 'ADMIN']`, default: `'USER'` | Access control role |
| `createdAt` | Date | Auto | Timestamps option | Registration timestamp |
| `updatedAt` | Date | Auto | Timestamps option | Last update timestamp |

### 2.2 Complaint Model (`models/Complaint.js`)

Stores civic infrastructure issue reports submitted by citizens, enriched by Ultralytics YOLO26 detection predictions.

| Field | Type | Required | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | ObjectId | Auto | Primary key | Unique document identifier |
| `complaintId` | String | Yes | Unique, indexed (e.g. `CIV-1001`) | Human-readable tracking ID |
| `userId` | ObjectId | No | Ref: `User`, default: `null`, indexed | Submitter account reference |
| `issueType` | String | Yes | Enum: `['POTHOLE', 'LEAKAGE', 'GARBAGE', 'OTHER']` | Primary classified civic problem |
| `description` | String | Yes | Trimmed, max: 1000 characters | Citizen report description |
| `confidence` | Number | No | Min: 0.0, max: 1.0, default: 0.0 | YOLO26 detection confidence |
| `severity` | String | Yes | Enum: `['LOW', 'MEDIUM', 'HIGH']`, default: `'MEDIUM'` | Problem severity level |
| `imageUrl` | String | Yes | Trimmed | URL or file path of the evidence photo |
| `latitude` | Number | No | Min: -90, max: 90 | Geolocation latitude coordinate |
| `longitude` | Number | No | Min: -180, max: 180 | Geolocation longitude coordinate |
| `status` | String | Yes | Enum: `['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED']`, default: `'PENDING'`, indexed | Complaint resolution status |
| `detections` | Array | No | Subdocument array, default: `[]` | YOLO26 bounding boxes and classes |
| `createdAt` | Date | Auto | Timestamps option | Submission timestamp |
| `updatedAt` | Date | Auto | Timestamps option | Last status/content modification |

#### Detection Subdocument (`detections[]`)
| Field | Type | Required | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `class` | String | Yes | Trimmed | Class name (e.g. `pothole`, `leakage`, `garbage`) |
| `confidence` | Number | Yes | Min: 0.0, max: 1.0 | Detection confidence score |
| `bbox` | [Number] | Yes | Length: 4 `[x1, y1, x2, y2]` | Bounding box pixel coordinates |

---

## 3. Database Indexes

- `users.email`: Unique ascending index for rapid lookup and collision prevention during registration.
- `complaints.complaintId`: Unique ascending index for fast citizen and admin complaint search.
- `complaints.userId`: Ascending index for efficient user complaint history queries.
- `complaints.status`: Ascending index for filtering admin complaints (`PENDING`, `IN_PROGRESS`, etc.).
- `complaints.issueType`: Ascending index for categorical analytics and aggregation.
