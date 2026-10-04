# CivicEye – AI-Based Civic Issue Reporting System (V1.0)

[![CivicEye CI Pipeline](https://github.com/JoshuaEliazer/CivicEye/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshuaEliazer/CivicEye/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/badge/Release-V1.0.0-green.svg)](https://github.com/JoshuaEliazer/CivicEye/releases/tag/v1.0.0)

CivicEye is an end-to-end full-stack Machine Learning application that empowers citizens to report urban civic infrastructure hazards (potholes, water/drainage leakage, and garbage accumulation) through real-time computer vision powered by **Ultralytics YOLO26**, automated triage, interactive mapping, and comprehensive municipal administrative analytics.

---

## 1. Problem Statement & Solution

### The Problem
Urban municipalities struggle with delayed complaint intake, vague issue descriptions, manual inspection bottlenecks, and poor communication with reporting citizens. Citizens lack transparency into complaint status, while municipal engineers lack aggregated spatial data to prioritize road and drainage repairs.

### The Solution
CivicEye automates civic incident intake and lifecycle management:
1. **AI-Assisted Triage**: Computer-vision analysis automatically identifies defect types and scores confidence upon image upload.
2. **Geographic Precision**: Captures exact GPS coordinates and renders interactive maps with OpenStreetMap and Leaflet.
3. **Citizen Transparency**: Automated notifications inform citizens as municipal crews review, service, and resolve issues.
4. **Municipal Command Center**: City administrators access centralized complaint queues, status management, spatial maps, and analytics with PII-free CSV reporting.

---

## 2. Architecture Overview

```text
                    ┌─────────────────┐
                    │ React Frontend  │ (Vite, Leaflet, Axios)
                    └────────┬────────┘
                             │ HTTP/REST (Port 5173 / Port 80)
                             ▼
                    ┌─────────────────┐
                    │ Express Backend │ (Node.js, JWT, Multer)
                    └───────┬─┬───────┘
                            │ │ HTTP/REST (Port 5000)
                ┌───────────┘ └─────────────┐
                │                           │
                ▼                           ▼
        ┌──────────────┐            ┌────────────────┐
        │   MongoDB    │            │ Python FastAPI │
        └──────────────┘            └───────┬────────┘
        (Port 27017)                        │
                                            ▼
                                    ┌─────────────────┐
                                    │   YOLO26n       │
                                    │ Pretrained /    │
                                    │ Custom Weights  │
                                    └─────────────────┘
```

> [!IMPORTANT]
> **Strict Architectural Boundary**: The React browser client NEVER communicates directly with MongoDB or the FastAPI ML service. All requests are securely authenticated, validated, and proxied through the Express API gateway.

---

## 3. Technology Stack

- **Frontend**: React 18, Vite 5, JavaScript (ES Modules), Axios, React Router 6, Leaflet 1.9, OpenStreetMap, Vanilla CSS.
- **Backend**: Node.js 20, Express 4, Mongoose 8, JSON Web Tokens (`jsonwebtoken`), Bcrypt (`bcryptjs`), Multer.
- **Database**: MongoDB 7.0 for persistent storage of users, complaints, and notifications.
- **Machine Learning**: Python 3.11, FastAPI, Uvicorn, Ultralytics YOLO26 (`yolo26n.pt` baseline), PyTorch 2.2 CPU, OpenCV.
- **Deployment & Containers**: Docker, Multi-stage Dockerfiles, Docker Compose, Nginx Alpine reverse proxy.
- **CI/CD Pipeline**: GitHub Actions (`.github/workflows/ci.yml`).

---

## 4. Target Civic Issue Classes

```text
0: pothole
1: leakage
2: garbage
```

---

## 5. Development Phases & Milestones

- **Phase 1**: Project Setup & Foundation
- **Phase 2**: MongoDB & Backend Models (Completed — see [docs/database.md](docs/database.md))
- **Phase 3**: YOLO26 Dataset & Pipeline (Completed — see [docs/dataset.md](docs/dataset.md))
- **Phase 4**: FastAPI ML Service (Completed — see [docs/ml.md](docs/ml.md))
- **Phase 5**: Express ↔ FastAPI ML Integration (Completed — see [docs/api.md](docs/api.md))
- **Phase 6**: Authentication & Session Management
- **Phase 7**: Civic Complaint Reporting & Persistence
- **Phase 8**: Municipal Admin Dashboard & Triage (Completed — see [docs/admin.md](docs/admin.md))
- **Phase 9**: Maps, Geolocation & Civic Issue Visualization (Completed — see [docs/maps.md](docs/maps.md))
- **Phase 10**: User Dashboard & Complaint History (Completed — see [docs/dashboard.md](docs/dashboard.md))
- **Phase 11**: Image Storage & Media Management (Completed — see [docs/image-storage.md](docs/image-storage.md))
- **Phase 12**: Notifications & Complaint Status Updates (Completed — see [docs/notifications.md](docs/notifications.md))
- **Phase 13**: Analytics, Reporting & City Insights (Completed — see [docs/analytics.md](docs/analytics.md))
- **Phase 14**: Production Deployment, Containerization & CI/CD Pipeline (Completed — see [docs/deployment.md](docs/deployment.md))
- **Phase 15**: Security & Performance Hardening (Completed — see [docs/security-hardening.md](docs/security-hardening.md))
- **Phase 16**: Final Release & Project Completion — **CivicEye V1.0** (Completed — see [docs/v1-release-report.md](docs/v1-release-report.md))

---

## 6. End-to-End Demonstration Walkthrough

CivicEye supports two primary operational personas:

### Citizen Journey
1. **Register / Login**: Citizen signs up or logs into their account; a secure 24h JWT token is stored in `localStorage`.
2. **Capture & File Issue**: Citizen clicks "Report Issue", uploads a photo, clicks "Use My Location" or drops a pin on the Leaflet map, and writes a brief description.
3. **AI Inference**: The image is analyzed via Express → FastAPI → YOLO26. The identified category and confidence score are automatically attached.
4. **Complaint ID & Persistence**: The complaint is assigned a human-readable identifier (e.g. `CE-2026-000005`) and saved to MongoDB.
5. **Dashboard Tracking**: The citizen tracks the issue on their dashboard (`submitted` → `under_review` → `in_progress` → `resolved`).
6. **In-App Notifications**: The citizen receives instant notification badges when the complaint is filed and whenever an administrator updates its progress.

### Municipal Administrator Journey
1. **Admin Login**: Municipal engineer logs into `/admin` using authorized administrative credentials.
2. **Triage Queue**: Admin inspects incoming complaints, searches by keyword or complaint ID, and filters by status or issue type.
3. **Detail & Media Inspection**: Admin reviews high-resolution uploaded images served via authenticated endpoints.
4. **Status Dispatch**: Admin updates the complaint status (e.g., `in_progress` with notes: "Repair crew dispatched").
5. **Spatial Visualization**: Admin inspects city-wide complaint hotspots across an interactive map.
6. **City Insights**: Admin views real-time statistics (resolution rates, average resolution time in hours, category distributions) and exports audit-ready CSV reports.

---

## 7. Local Development Setup

To run CivicEye locally on your workstation:

### Prerequisites
- Node.js 20+
- Python 3.11+
- MongoDB 7.0+ (running locally on port `27017`)

### 1. Python FastAPI ML Service
```bash
cd ml-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
# Verify: GET http://127.0.0.1:8000/health
```

### 2. Node.js Express REST API Backend
```bash
cd backend
npm install
npm run dev
# Verify: GET http://localhost:5000/api/health
```

### 3. React Frontend
```bash
cd frontend
npm install
npm run dev
# Access: http://localhost:5173
```

---

## 8. Production Container Setup (Docker Compose)

CivicEye includes production container specifications orchestrated through Docker Compose:
- **`civiceye-frontend`**: Alpine Nginx serving compiled React SPA and reverse proxying `/api/`.
- **`civiceye-backend`**: Node.js 20 Alpine executing as non-root `node` user.
- **`civiceye-ml-service`**: Python 3.11 slim running Uvicorn as non-root `appuser`.
- **`civiceye-mongodb`**: MongoDB 7.0 database engine with health check and persistent volumes.

```bash
# 1. Prepare environment variables
cp .env.example .env

# 2. Build and launch services
docker compose up -d --build

# 3. Access endpoints
# Frontend: http://localhost:5173
# Backend:  http://localhost:5000/api/health
# ML:       http://localhost:8000/health
```

---

## 9. Automated Testing & Verification

CivicEye includes 15 automated test suites spanning all development phases:

```bash
# Phase 2: Database & Model Verification
node backend/test/dbVerification.js

# Phase 4: FastAPI ML Service API & Inference
python ml-service/test_api.py

# Phase 5: Express <-> FastAPI Proxy & Timeouts
node backend/test/mlIntegrationTest.js

# Phase 6: Authentication, Bcrypt Hashing & JWT
node backend/test/authTest.js

# Phase 7: Complaint Creation, Validation & Persistence
node backend/test/complaintTest.js

# Phase 8: Admin Dashboard, Triage & Status Updates
node backend/test/adminTest.js

# Phase 9: Maps, GPS Coordinates & Boundaries
node backend/test/locationTest.js

# Phase 10: Citizen Dashboard & Complaint History
node backend/test/userDashboardTest.js

# Phase 11: Media Storage, Streaming & Path Traversal
node backend/test/imageStorageTest.js

# Phase 12: Notifications, Status Changes & Read Flags
node backend/test/notificationTest.js

# Phase 13: Analytics, Filtering, Trends & CSV Export
node backend/test/analyticsTest.js

# Phase 14: Container Deployment & Configuration
node backend/test/deploymentTest.js

# Phase 15: Security & Boundary Defense (32 scenarios)
node backend/test/securityTest.js

# Phase 15: Performance & Resource Bounding (11 scenarios)
node backend/test/performanceTest.js

# Phase 16: Complete End-to-End System Journey (12 steps)
node backend/test/finalE2ETest.js

# Frontend Production Bundle Build
cd frontend && npm run build
```

---

## 10. Security & Performance Features

- **JWT Defense**: Strict 3-segment structure check, 24-hour expiration, and dynamic secret validation.
- **Role Isolation & IDOR Defense**: Citizen B cannot view or modify Citizen A's complaints, images, or notifications (HTTP 403 `FORBIDDEN`). Ordinary citizens cannot access administrative endpoints.
- **Upload Containment**: 10MB upload limit, MIME whitelisting, randomized safe filenames, and path traversal prevention via `path.resolve` directory containment.
- **HTTP Security**: Enforced `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 0`, `Referrer-Policy`, and suppression of `X-Powered-By`.
- **Sliding-Window Rate Limiting**: In-memory rate limiting guards general API (500 req/15m), auth (30 req/15m), and uploads (60 uploads/15m) with automatic memory pruning.
- **MongoDB Indexing**: Compound indexes on `{ user: 1, createdAt: -1 }`, `{ status: 1, issueType: 1, createdAt: -1 }`, and `{ user: 1, isRead: 1, createdAt: -1 }`.
- **Lean Queries**: Applied `.lean()` across all read-heavy routes to bypass Mongoose document hydration.

---

## 11. Known Limitations

1. **Docker Host Runtime**: Docker Desktop / Docker CLI is unavailable on this local Windows host (`docker : The term 'docker' is not recognized`). Runtime container execution is marked as `BLOCKED — Docker Engine/Desktop unavailable on local host`. All Dockerfiles, compose manifests, and security parameters were validated statically.
2. **ML Baseline Weights**: Pretrained YOLO26n baseline is actively utilized. When custom fine-tuned weights for specific civic defects are trained, they can be dropped into `ml-service/model/` without modifying code.
3. **Notification Delivery**: Notifications are stored and delivered within the web application. External push notifications (SMS, WhatsApp, Email) are not implemented in V1.
4. **Single-Node Rate Limiter**: The sliding-window rate limiter stores state in-memory per Node process. In multi-node distributed environments, a Redis store should be attached.

---

## 12. License

This project is licensed under the MIT License — see the LICENSE file for details.
