# CivicEye Architecture Specification

## 1. System Topology

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
                                    │ Custom Model    │
                                    └─────────────────┘
```

## 2. Component Boundaries & Responsibilities

### 2.1 React Frontend (`frontend/`)
- Handles user interactions, camera/image uploads, GPS capture, issue reporting forms, and administrative dashboards.
- Communicates **only** with the Express Backend REST API via `VITE_API_URL`. Never communicates directly with the Python ML service or MongoDB.

### 2.2 Express Backend (`backend/`)
- Acts as the central orchestrator and business logic layer.
- Handles user authentication (JWT + bcrypt), file uploads via Multer, complaint lifecycle management, and admin workflows.
- Forwards validated image data to the FastAPI ML service for civic issue inference.
- Stores complaint metadata, detection results, and status in MongoDB via Mongoose.

### 2.3 Python FastAPI ML Service (`ml-service/`)
- Exposes high-performance asynchronous REST endpoints (`GET /health`, `POST /predict`) for computer vision inference.
- Loads Ultralytics YOLO26 models (`yolo26n.pt` baseline or custom fine-tuned `model/best.pt`).
- Performs bounding box detection and classification across:
  - `pothole` (class 0)
  - `leakage` (class 1)
  - `garbage` (class 2)
- Returns structured JSON detection outputs with confidences and coordinate boxes.

### 2.4 Database (`mongodb`)
- Stores user credentials, profile records, and complaint objects with geospatial coordinates, status states (`PENDING`, `IN_PROGRESS`, `RESOLVED`, `REJECTED`), and detection metrics.

---

## 3. Communication Protocol

1. `Citizen` captures or selects an image in the React UI.
2. `React` sends `multipart/form-data` with description and GPS coordinates to `POST /api/complaints` in Express.
3. `Express` validates the payload and forwards the image binary to `POST /predict` in FastAPI.
4. `FastAPI` passes the image to the loaded Ultralytics YOLO26 model.
5. `YOLO26` predicts classes, confidence scores, and bounding boxes.
6. `FastAPI` returns structured detection data to `Express`.
7. `Express` synthesizes the complaint, generates a unique `complaintId`, persists the record in `MongoDB`, and responds to `React`.
