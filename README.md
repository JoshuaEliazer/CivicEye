# CivicEye – AI-Based Civic Issue Reporting System

CivicEye is an end-to-end full-stack Machine Learning application that enables citizens to report civic infrastructure issues (potholes, water/drain leakage, and garbage overflow) through computer-vision-based detection powered by **Ultralytics YOLO26**.

---

## Architecture Overview

```text
                    ┌─────────────────┐
                    │ React Frontend  │ (Vite, Leaflet, Axios)
                    └────────┬────────┘
                             │ HTTP/REST
                             ▼
                    ┌─────────────────┐
                    │ Express Backend │ (Node.js, JWT, Multer)
                    └───────┬─┬───────┘
                            │ │
                ┌───────────┘ └─────────────┐
                │                           │
                ▼                           ▼
        ┌──────────────┐            ┌────────────────┐
        │   MongoDB    │            │ Python FastAPI │
        └──────────────┘            └───────┬────────┘
                                            │
                                            ▼
                                    ┌─────────────────┐
                                    │   YOLO26n       │
                                    │ Pretrained /    │
                                    │ Custom Weights  │
                                    └─────────────────┘
```

- **Frontend**: React.js with Vite, React Router, Leaflet, and Axios.
- **Backend**: Node.js with Express.js, Mongoose, and Multer.
- **ML Service**: Python FastAPI with Ultralytics YOLO26 (`yolo26n.pt` baseline, fine-tunable on custom civic issue dataset).
- **Database**: MongoDB for user management and structured complaint records.

---

## Target Civic Issue Classes

```text
0: pothole
1: leakage
2: garbage
```

---

## Phase Status

- **Phase 1**: Project Setup & Foundation
- **Phase 2**: MongoDB & Backend Models
- **Phase 3**: YOLO26 Dataset & Pipeline
- **Phase 4**: FastAPI ML Service
- **Phase 5**: Express ↔ FastAPI ML Integration
- **Phase 6**: Authentication & Session Management
- **Phase 7**: Civic Complaint Reporting & Persistence
- **Phase 8**: Municipal Admin Dashboard & Triage
- **Phase 9**: Maps, Geolocation & Civic Issue Visualization
- **Phase 10**: User Dashboard & Complaint History (Completed — see [docs/dashboard.md](docs/dashboard.md))
- **Phase 11**: Image Storage & Media Management (Completed — see [docs/image-storage.md](docs/image-storage.md))
- **Phase 12**: Notifications & Complaint Status Updates (Completed — see [docs/notifications.md](docs/notifications.md))
- **Phase 14**: Production Deployment, Containerization & CI/CD Pipeline (Completed — see [docs/deployment.md](docs/deployment.md))

---

## Production / Docker Setup (Phase 14)

CivicEye provides a reproducible 4-container deployment orchestrated via **Docker Compose**:
1. **Frontend**: Production React SPA served via Alpine Nginx with reverse proxy to `/api/`.
2. **Backend**: Express.js REST API on Node.js 20 Alpine executing under non-root `node` user.
3. **ML Service**: FastAPI YOLO26 inference service running under non-root `appuser`.
4. **MongoDB**: MongoDB 7.0 database engine with healthcheck and persistent named volume.

### Prerequisites
- [Docker Engine](https://docs.docker.com/engine/install/) (v24.0+ recommended)
- [Docker Compose](https://docs.docker.com/compose/) (v2.20+ or `docker compose` plugin)

### 1. Environment Configuration
Copy the provided environment template into the root `.env`:
```bash
cp .env.example .env
```
Ensure all variables (`MONGODB_URI`, `JWT_SECRET`, `ML_SERVICE_URL`, etc.) are configured.

### 2. Build and Launch Full Stack
Run Docker Compose in build mode:
```bash
docker compose up --build
```
Or launch in detached mode:
```bash
docker compose up -d --build
```

### 3. Service Endpoints
Once healthy, services are accessible at:
- **Frontend SPA**: [http://localhost:5173](http://localhost:5173) (Health: `http://localhost:5173/healthz`)
- **Backend API**: [http://localhost:5000](http://localhost:5000) (Health: `http://localhost:5000/api/health`)
- **ML Service**: [http://localhost:8000](http://localhost:8000) (Health: `http://localhost:8000/health` | Docs: `http://localhost:8000/docs`)
- **MongoDB**: `mongodb://localhost:27017/civiceye` (Docker network hostname: `mongodb:27017`)

### 4. Stopping Containers & Data Persistence
To stop services while preserving database records and uploaded media:
```bash
docker compose down
```

> [!WARNING]
> **Data Destruction Warning**:
> Running `docker compose down -v` deletes all Docker named volumes (`mongodb_data` and `backend_uploads`). This will permanently erase your local MongoDB database and all stored complaint images. Only use the `-v` flag if you explicitly intend to reset the environment completely.

---

## Local Development Setup

To run CivicEye locally without Docker:

### 1. Python ML Service
```bash
cd ml-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
# Verify: GET http://127.0.0.1:8000/health
```

### 2. Node.js Express Backend
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
