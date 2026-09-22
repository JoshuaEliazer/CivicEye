# CivicEye Architecture Specification

## 1. System Topology

```text
                        ┌───────────────────────────────┐
                        │   React Frontend (Vite)       │
                        │   (Citizen Portal & History)  │
                        └───────────────┬───────────────┘
                                        │ HTTP / REST (JWT Bearer)
                                        ▼
                        ┌───────────────────────────────┐
                        │   Express Backend (Node.js)   │
                        │   Auth, Multer, Orchestration │
                        └───┬───────────────────────┬───┘
                            │                       │
               Mongoose /   │                       │ HTTP Multipart Forwarding
               MongoDB Wire │                       │
                            ▼                       ▼
                    ┌───────────────┐       ┌───────────────────────┐
                    │    MongoDB    │       │ Python FastAPI Micro- │
                    │ (Collections: │       │ service (Port 8000)   │
                    │ users,        │       └───────────┬───────────┘
                    │ complaints)   │                   │
                    └───────────────┘                   ▼
                                            ┌───────────────────────┐
                                            │ Ultralytics YOLO26    │
                                            │ Inference Engine      │
                                            │ (yolo26n / custom)    │
                                            └───────────────────────┘
```

> [!IMPORTANT]
> The React client communicates **only** with the Express backend. React never calls FastAPI directly, and FastAPI has no direct access to MongoDB.

---

## 2. Component Boundaries & Responsibilities

### 2.1 React Frontend (`frontend/`)
- Citizen issue reporting form with file upload dropzone and preview.
- Browser HTML5 Geolocation integration (`navigator.geolocation.getCurrentPosition`) for automated coordinate capture.
- Citizen complaint list and detail cards with tracking status indicators.
- Municipal Administrator Dashboard (`/admin`) with live statistics, multi-criteria complaint filtering/search, and lifecycle status transition controls.
- JWT authentication management (`localStorage` token retention, session status, RBAC view switching).
- Communicates exclusively with Express API via `axios` at `http://localhost:5000/api`.

### 2.2 Express Backend (`backend/`)
- REST API layer providing:
  - `/api/auth`: User registration, login, JWT verification.
  - `/api/complaints`: Complaint reporting, list, and single-complaint inspection.
  - `/api/admin`: Municipal administrator complaint listing, search, status modification, and aggregate statistics.
  - `/api/predict`: Standalone ML proxy endpoint.
  - `/api/health` & `/api/ml/health`: System health and status probes.
- Middleware architecture:
  - `authMiddleware`: Enforces valid Bearer JWT tokens on protected routes (`protect`) and role-based access (`requireAdmin`, `authorizeRoles`).
  - `uploadMiddleware`: Validates file types (`.jpg`, `.jpeg`, `.png`, `.webp`) and enforces 10MB limits via Multer.
  - `errorHandler`: Structured error formatting with HTTP status codes.
- Persists complaint documents to MongoDB with linked `user` ObjectId, generated `CE-YYYY-NNNNNN` tracking ID, location data, and detection metadata.

### 2.3 Python FastAPI ML Microservice (`ml-service/`)
- Dedicated high-concurrency microservice running on Uvicorn.
- Executes Ultralytics YOLO26 computer vision inference on image files.
- Identifies civic issues across configured classes (`pothole`, `leakage`, `garbage`).
- Computes confidence scores, uncertainty flags, and bounding box pixel coordinates.

### 2.4 MongoDB Persistence Layer
- Document-oriented storage in `civiceye` database.
- `users`: Citizen credentials with Bcrypt-hashed passwords.
- `complaints`: Civic issue reports with tracking IDs, location coordinates, status, and YOLO26 detection results.

---

## 3. End-to-End Complaint Lifecycle (Phase 7)

```text
Citizen               React UI              Express API              FastAPI / YOLO26          MongoDB
   │                      │                      │                          │                     │
   │ 1. Fill report,      │                      │                          │                     │
   │    select image,     │                      │                          │                     │
   │    click Submit      │                      │                          │                     │
   ├─────────────────────►│                      │                          │                     │
   │                      │ 2. POST /complaints  │                          │                     │
   │                      │    (Bearer Token +   │                          │                     │
   │                      │     FormData)        │                          │                     │
   │                      ├─────────────────────►│                          │                     │
   │                      │                      │ 3. Verify JWT token      │                     │
   │                      │                      │    Validate form & coords│                     │
   │                      │                      │                          │                     │
   │                      │                      │ 4. Forward image to      │                     │
   │                      │                      │    POST /predict         │                     │
   │                      │                      ├─────────────────────────►│                     │
   │                      │                      │                          │ 5. YOLO26 inference │
   │                      │                      │                          │    Predicts issue,  │
   │                      │                      │                          │    conf, boxes      │
   │                      │                      │ 6. Structured prediction │                     │
   │                      │                      │◄─────────────────────────┤                     │
   │                      │                      │                          │                     │
   │                      │                      │ 7. Generate CE-YYYY-NNNN │                     │
   │                      │                      │    Save Complaint doc    │                     │
   │                      │                      ├───────────────────────────────────────────────►│
   │                      │                      │ 8. Saved successfully    │                     │
   │                      │                      │◄───────────────────────────────────────────────┤
   │                      │ 9. 201 Created       │                          │                     │
   │                      │    (Complaint JSON)  │                          │                     │
   │                      │◄─────────────────────┤                          │                     │
   │ 10. Display Tracking │                      │                          │                     │
   │     ID & details     │                      │                          │                     │
   │◄─────────────────────┤                      │                          │                     │
```

---

## 4. Security & Data Isolation Architecture

1. **Authentication Boundary**:
   - `POST /api/complaints`, `GET /api/complaints`, and `GET /api/complaints/:complaintId` are protected by `protect` middleware.
   - Unauthenticated requests are rejected immediately with `401 Unauthorized`.

2. **Data Isolation**:
   - `GET /api/complaints` filters queries strictly by `{ user: req.user._id }`. Citizens can never view complaints submitted by others.
   - `GET /api/complaints/:complaintId` checks `complaint.user.equals(req.user._id) || req.user.role === 'ADMIN'`. Non-owners receive `403 Forbidden`.

3. **No Direct Microservice Access**:
   - The FastAPI ML service is accessible only within the backend network or localhost; the frontend never interacts with it directly.
