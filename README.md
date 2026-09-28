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


---

## Quick Start (Phase 1)

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
