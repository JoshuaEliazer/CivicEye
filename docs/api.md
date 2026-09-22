# CivicEye REST API Specification

This document details the complete REST API for CivicEye, comprising the **Express Backend API** (`http://localhost:5000/api`) and the internal **FastAPI ML Microservice** (`http://localhost:8000`).

---

## 1. Architecture Flow

```text
React Client (Port 5173)
       │ (Authorization: Bearer <token>)
       ▼
Express API (Port 5000) ─── Auth Middleware ───► MongoDB (Port 27017)
       │ (Multipart Image Forwarding)
       ▼
FastAPI ML Service (Port 8000)
       │
       ▼
Ultralytics YOLO26 Object Detection Engine
```

> [!NOTE]
> The React frontend communicates **exclusively** with Express. It never makes direct HTTP requests to FastAPI or MongoDB.

---

## 2. Express Backend API (`http://localhost:5000/api`)

### 2.1 Complaints API (`/api/complaints`)

All complaint routes require an authenticated user session (`Authorization: Bearer <token>`).

#### 2.1.1 Submit a Civic Complaint: `POST /api/complaints`
Uploads a civic problem image, automatically runs YOLO26 detection, persists the complaint document in MongoDB linked to the authenticated user, and returns the generated Complaint ID (`CE-YYYY-NNNNNN`).

- **Authentication**: Required (`Bearer <JWT>`)
- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  | Field | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `image` | File | **Yes** | Image evidence (`.jpg`, `.jpeg`, `.png`, `.webp`, max 10MB) |
  | `description` | String | No | Citizen issue description (max 1000 characters) |
  | `latitude` | Float | No | Geographic latitude coordinate (-90 to 90) |
  | `longitude` | Float | No | Geographic longitude coordinate (-180 to 180) |
  | `address` | String | No | Street address or landmark name (max 500 characters) |

- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Civic complaint submitted successfully.",
    "complaint": {
      "complaintId": "CE-2026-000001",
      "user": "6ab293278974ba359b255e73",
      "issueType": "pothole",
      "confidence": 0.885,
      "isUncertain": false,
      "description": "Large road pothole causing traffic obstruction",
      "location": {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "address": "5th Cross, Indiranagar, Bengaluru"
      },
      "image": {
        "originalName": "sample_road.jpg",
        "mimetype": "image/jpeg",
        "size": 124532,
        "path": "uploads/complaint-1742654321-123456789.jpg"
      },
      "detections": [
        {
          "class": "pothole",
          "confidence": 0.885,
          "bbox": [100.5, 120.0, 350.2, 280.8]
        }
      ],
      "modelArchitecture": "Ultralytics YOLO26",
      "modelVariant": "YOLO26n",
      "isCustomModel": false,
      "status": "submitted",
      "createdAt": "2026-09-22T14:39:17.000Z",
      "updatedAt": "2026-09-22T14:39:17.000Z"
    }
  }
  ```

#### 2.1.2 List My Complaints: `GET /api/complaints`
Retrieves all complaints submitted by the currently authenticated user, sorted in descending chronological order (newest first). Strictly isolated from other users' records.

- **Authentication**: Required (`Bearer <JWT>`)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "count": 1,
    "complaints": [
      {
        "complaintId": "CE-2026-000001",
        "issueType": "pothole",
        "confidence": 0.885,
        "description": "Large road pothole causing traffic obstruction",
        "status": "submitted",
        "createdAt": "2026-09-22T14:39:17.000Z"
      }
    ]
  }
  ```

#### 2.1.3 Get Complaint by ID: `GET /api/complaints/:complaintId`
Retrieves full details of a specific complaint by its human-readable `complaintId` (e.g., `CE-2026-000001`).

- **Authentication**: Required (`Bearer <JWT>`)
- **Access Control**: Owner or `ADMIN` role. Non-owners receive `403 Forbidden`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "complaint": {
      "complaintId": "CE-2026-000001",
      "user": {
        "_id": "6ab293278974ba359b255e73",
        "name": "Citizen Maya",
        "email": "maya@civiceye.local",
        "role": "USER"
      },
      "issueType": "pothole",
      "confidence": 0.885,
      "status": "submitted",
      "description": "Large road pothole causing traffic obstruction",
      "location": {
        "latitude": 12.9716,
        "longitude": 77.5946,
        "address": "5th Cross, Indiranagar, Bengaluru"
      },
      "detections": [...],
      "createdAt": "2026-09-22T14:39:17.000Z"
    }
  }
  ```

---

### 2.2 Authentication API (`/api/auth`)

#### 2.2.1 Register: `POST /api/auth/register`
- **Body**: `{"name": "string", "email": "string", "password": "string", "role": "USER | ADMIN"}`
- **Response (201 Created)**: Returns created user profile and signed JWT token.

#### 2.2.2 Login: `POST /api/auth/login`
- **Body**: `{"email": "string", "password": "string"}`
- **Response (200 OK)**: Returns verified user profile and signed JWT token.

#### 2.2.3 Current Session: `GET /api/auth/me`
- **Authentication**: Required (`Bearer <JWT>`)
- **Response (200 OK)**: Returns authenticated citizen profile.

---

### 2.3 ML Proxy & Diagnostics API

#### 2.3.1 Standalone Issue Inference: `POST /api/predict`
- **Content-Type**: `multipart/form-data` (`image` or `file`)
- **Response (200 OK)**: Structured YOLO26 prediction without creating a complaint document.

#### 2.3.2 ML Service Status: `GET /api/ml/health`
- **Response (200 OK)**: Returns upstream FastAPI health and YOLO26 model status.

#### 2.3.3 Express & Database Health: `GET /api/health`
- **Response (200 OK)**: Checks Express runtime and MongoDB connection state.

---

## 3. FastAPI ML Microservice (`http://localhost:8000`)

### 3.1 Health Check: `GET /health`
- **Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "service": "CivicEye ML Service",
    "model": {
      "loaded": true,
      "model_path": "model/yolo26n.pt",
      "architecture": "Ultralytics YOLO26",
      "model_variant": "YOLO26n",
      "is_custom_model": false,
      "confidence_threshold": 0.5,
      "uncertain_threshold": 0.25,
      "supported_classes": ["pothole", "leakage", "garbage"]
    }
  }
  ```

### 3.2 Detection Inference: `POST /predict`
- **Content-Type**: `multipart/form-data`
- **Fields**: `file` (binary image, required), `confidence` (float, optional)
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "issue": "pothole",
    "confidence": 0.9425,
    "is_uncertain": false,
    "detections": [
      {
        "class": "pothole",
        "class_id": 0,
        "confidence": 0.9425,
        "bbox": [100.5, 120.0, 350.2, 280.8]
      }
    ],
    "model_info": {
      "architecture": "Ultralytics YOLO26",
      "model_variant": "YOLO26n"
    }
  }
  ```

---

## 4. Error Code Reference

| Status | Code | Description |
| :--- | :--- | :--- |
| **400** | `MISSING_IMAGE` | No image file provided in multipart payload |
| **400** | `INVALID_FILE_TYPE` | Uploaded file is not `.jpg`, `.jpeg`, `.png`, or `.webp` |
| **400** | `INVALID_LATITUDE` | Latitude coordinate is outside `-90` to `90` |
| **400** | `INVALID_LONGITUDE` | Longitude coordinate is outside `-180` to `180` |
| **401** | `NO_TOKEN` | Missing `Authorization: Bearer <token>` header |
| **401** | `INVALID_TOKEN` | Token signature is invalid or malformed |
| **401** | `TOKEN_EXPIRED` | JWT token expiration timestamp has passed |
| **403** | `FORBIDDEN` | Caller does not own the requested complaint and is not admin |
| **404** | `COMPLAINT_NOT_FOUND` | No complaint matches the provided `complaintId` |
| **409** | `DUPLICATE_EMAIL` | Account email already registered |
| **503** | `ML_SERVICE_OFFLINE` | FastAPI ML service is unreachable |
| **504** | `ML_SERVICE_TIMEOUT` | FastAPI ML service took longer than timeout threshold |
