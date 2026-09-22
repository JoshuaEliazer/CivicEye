# CivicEye Municipal Administration Specification

## 1. Overview

**Phase 8** introduces the **CivicEye Municipal Admin Dashboard & Complaint Management System**. This subsystem allows municipal administrators to monitor civic reports across the entire municipality, perform full-text and categorical searches, inspect computer-vision detection metrics, update complaint resolution states, and track real-time database-derived statistics.

---

## 2. Authentication & Authorization

### 2.1 Role-Based Access Control (RBAC)
- **Roles**:
  - `USER`: Regular citizen. Authorized to file complaints, view their own complaint history, and inspect their own complaints.
  - `ADMIN`: Municipal administrator. Authorized to view all complaints, change complaint resolution statuses, and view municipal statistics.
- **Server-Side Enforcement**:
  - All `/api/admin/*` endpoints are protected by the `requireAdmin` middleware.
  - The middleware verifies the JWT Bearer token via `protect` and strictly checks `req.user.role === 'ADMIN'` against the authenticated user record in MongoDB.
  - Roles submitted in request bodies or client headers are never trusted.
- **Error Codes**:
  - `401 Unauthorized` (`NO_TOKEN` | `INVALID_TOKEN` | `TOKEN_EXPIRED`): Missing, invalid, or expired JWT.
  - `403 Forbidden` (`FORBIDDEN_ADMIN_REQUIRED`): User is authenticated, but their server-side role is not `ADMIN`.

---

## 3. Admin API Endpoints

### 3.1 Get All Complaints: `GET /api/admin/complaints`
Retrieves a paginated list of complaints across all users, sorted in descending chronological order (`createdAt: -1`).

- **Access**: Protected (`ADMIN` only)
- **Query Parameters**:
  | Parameter | Type | Default | Constraints / Allowed Values | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `page` | Integer | `1` | Min: `1` | Page number |
  | `limit` | Integer | `10` | Min: `1`, Max: `100` | Number of complaints per page |
  | `search` | String | `''` | Max: 100 chars, regex escaped | Searches `complaintId`, `description`, `issueType`, `location.address`, `image.originalName` |
  | `issueType`| String | `''` | `pothole`, `leakage`, `garbage`, `other`, `none` | Filter by classified civic problem |
  | `status` | String | `''` | `submitted`, `under_review`, `in_progress`, `resolved`, `rejected` | Filter by resolution lifecycle status |

- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "complaints": [
      {
        "_id": "6ab2a5ab5fb6564bb865d62f",
        "complaintId": "CE-2026-000001",
        "user": {
          "_id": "6ab2a5ab5fb6564bb865d62e",
          "name": "Citizen Maya",
          "email": "maya@civiceye.local",
          "role": "USER",
          "createdAt": "2026-09-22T14:39:17.000Z"
        },
        "issueType": "pothole",
        "confidence": 0.885,
        "isUncertain": false,
        "status": "submitted",
        "description": "Severe road pothole on MG Road",
        "location": {
          "latitude": 12.9716,
          "longitude": 77.5946,
          "address": "MG Road, Bengaluru"
        },
        "detections": [...],
        "createdAt": "2026-09-22T14:39:17.000Z",
        "updatedAt": "2026-09-22T14:39:17.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 42,
      "totalPages": 5
    }
  }
  ```

> [!NOTE]
> Sensitive fields such as `password` and `passwordHash` are strictly excluded from populated user objects.

---

### 3.2 Get Complaint by ID: `GET /api/admin/complaints/:complaintId`
Returns complete details of any civic complaint in the database, including reporter information and YOLO26 model parameters.

- **Access**: Protected (`ADMIN` only)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "complaint": {
      "complaintId": "CE-2026-000001",
      "user": {
        "name": "Citizen Maya",
        "email": "maya@civiceye.local",
        "role": "USER"
      },
      "issueType": "pothole",
      "confidence": 0.942,
      "modelArchitecture": "Ultralytics YOLO26",
      "modelVariant": "YOLO26n",
      "status": "submitted",
      "description": "Pothole on 5th Avenue",
      "location": {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "address": "5th Avenue, Bengaluru"
      },
      "detections": [
        { "class": "pothole", "confidence": 0.942, "bbox": [100.5, 120.0, 350.2, 280.8] }
      ],
      "createdAt": "2026-09-22T14:39:17.000Z"
    }
  }
  ```
- **Error (404 Not Found)**:
  ```json
  {
    "success": false,
    "message": "Complaint with ID 'CE-9999-999999' was not found.",
    "error": "COMPLAINT_NOT_FOUND"
  }
  ```

---

### 3.3 Update Complaint Status: `PATCH /api/admin/complaints/:complaintId/status`
Allows municipal administrators to advance or modify the resolution state of a complaint.

- **Access**: Protected (`ADMIN` only)
- **Request Body**:
  ```json
  {
    "status": "in_progress"
  }
  ```
- **Allowed Statuses**: `submitted`, `under_review`, `in_progress`, `resolved`, `rejected` (case-insensitive).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Complaint status updated successfully.",
    "complaint": {
      "complaintId": "CE-2026-000001",
      "status": "in_progress",
      "updatedAt": "2026-09-22T16:15:00.000Z"
    }
  }
  ```
- **Validation Errors**:
  - Missing status: `400 Bad Request` (`MISSING_STATUS`)
  - Invalid status value: `400 Bad Request` (`INVALID_STATUS`)
  - Non-existent complaint: `404 Not Found` (`COMPLAINT_NOT_FOUND`)
  - Normal citizen attempt: `403 Forbidden` (`FORBIDDEN_ADMIN_REQUIRED`)

---

### 3.4 Live Database Statistics: `GET /api/admin/statistics`
Returns real-time aggregated counts computed directly from MongoDB.

- **Access**: Protected (`ADMIN` only)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "statistics": {
      "totalComplaints": 35,
      "submitted": 10,
      "underReview": 6,
      "inProgress": 12,
      "resolved": 5,
      "rejected": 2,
      "potholes": 18,
      "leakages": 8,
      "garbage": 7,
      "other": 2
    }
  }
  ```

---

## 4. Testing & Verification

Run the automated 21-scenario test suite:
```bash
node backend/test/adminTest.js
```
The test suite verifies unauthenticated rejections, malformed/expired token handling, role-based 403 authorization barriers, cross-user search, pagination, multi-criteria filtering, status updates, database-derived statistics validity, credential omission, and citizen isolation preservation.
