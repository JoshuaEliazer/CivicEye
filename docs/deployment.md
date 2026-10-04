# CivicEye — Phase 14: Production Deployment, Containerization & CI/CD Pipeline

## 1. System Architecture

CivicEye is architected as an isolated, multi-service civic issue detection platform. In production and containerized environments, the application is orchestrated using Docker Compose across four decoupled services connected via a dedicated internal bridge network:

```
                                  [ Browser / Client ]
                                           │
                                           │ HTTP :5173
                                           ▼
                    ┌─────────────────────────────────────────────┐
                    │          Frontend Container (Nginx)         │
                    │   • Serves compiled React 18 / Vite SPA     │
                    │   • Reverse-proxies /api/ calls             │
                    └──────────────────────┬──────────────────────┘
                                           │ Internal HTTP :5000
                                           ▼
                    ┌─────────────────────────────────────────────┐
                    │          Backend Container (Express)        │
                    │   • REST API, JWT Authentication, Triage    │
                    │   • Media management abstraction            │
                    └──────────────┬──────────────────────┬───────┘
                                   │                      │
             Internal TCP :27017   │                      │  Internal HTTP :8000
                                   ▼                      ▼
        ┌────────────────────────────────────┐  ┌────────────────────────────────────┐
        │         MongoDB Container          │  │       ML Service (FastAPI)         │
        │   • Official mongo:7.0             │  │   • Python 3.11 Slim               │
        │   • Named volume: mongodb_data     │  │   • Ultralytics YOLO26 Engine      │
        └────────────────────────────────────┘  │   • Baseline model: yolo26n.pt     │
                                                └────────────────────────────────────┘
```

> [!IMPORTANT]
> **Strict Architectural Isolation**:
> - The browser communicates solely with the frontend/backend interface.
> - The frontend never directly accesses the MongoDB database or the FastAPI ML inference service.
> - The Express backend acts as the sole orchestrator between persistence (MongoDB) and inference (FastAPI).

---

## 2. Prerequisites

### Local Development (Host Mode)
- **Node.js**: v18 or v20+ (LTS recommended)
- **Python**: v3.10 or v3.11+
- **MongoDB**: Community Server v6.0 or v7.0 running on `127.0.0.1:27017`

### Production / Containerized Mode
- **Docker Engine**: v24.0+
- **Docker Compose**: v2.20+ (Compose V2 recommended)
- Minimum System Resources: 2 CPU cores, 4GB RAM, 10GB free disk space (to support PyTorch/OpenCV dependencies)

---

## 3. Environment Variables

All configuration is externalized into environment variables. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default (Dev) | Production / Docker | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | `production` | Enables production optimizations, disables stack trace leaking |
| `PORT` | `5000` | `5000` | Express HTTP listening port |
| `FRONTEND_PORT` | `5173` | `5173` (mapped to :80) | Port exposed to browser on host machine |
| `ML_SERVICE_PORT` | `8000` | `8000` | FastAPI ML inference service port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/civiceye` | `mongodb://mongodb:27017/civiceye` | MongoDB connection connection string |
| `JWT_SECRET` | *(Random secret)* | *(Cryptographic secret)* | HMAC-SHA256 signature key for authentication |
| `JWT_EXPIRES_IN` | `7d` | `7d` | Lifetime of issued citizen and administrator JWT tokens |
| `ML_SERVICE_URL` | `http://localhost:8000` | `http://ml-service:8000` | Backend-to-FastAPI inference upstream endpoint |
| `ML_SERVICE_TIMEOUT_MS` | `10000` | `10000` | Abort timeout for computer vision inference calls |
| `CORS_ORIGIN` | `*` | `http://localhost:5173,http://localhost:80` | Allowed origins for cross-origin browser requests |
| `STORAGE_TYPE` | `local` | `local` | Media storage provider identifier |
| `LOCAL_STORAGE_PATH` | `uploads` | `/app/uploads` | Path to complaint photos directory |
| `MODEL_PATH` | `model/yolo26n.pt` | `model/yolo26n.pt` | Path to active YOLO26 model weights |
| `CONFIDENCE_THRESHOLD`| `0.50` | `0.50` | Minimum confidence for detection registration |
| `VITE_API_URL` | `http://localhost:5000/api` | `/api` | Base API URL compiled into Vite frontend bundle |

---

## 4. Docker Container Setup

Each service utilizes a custom, production-oriented Dockerfile:

### A. Frontend (`frontend/Dockerfile`)
- **Stage 1 (Build)**: Node.js 20 Alpine environment installs dependencies via `npm ci` and compiles static assets to `/app/dist` using `npm run build`.
- **Stage 2 (Runtime)**: Lightweight `nginx:alpine` image serves static assets and reverse-proxies `/api/` requests to `http://backend:5000/api/`. Includes Gzip compression and security headers.
- **Port**: Container listens on port `80`; Docker Compose maps host `5173:80`.

### B. Backend (`backend/Dockerfile`)
- **Base Image**: `node:20-alpine`
- **Security**: Creates uploads directory `/app/uploads/complaints` and drops privileges to unprivileged `USER node`.
- **Dependencies**: Production-only (`npm ci --omit=dev`).
- **Port**: Exposes `5000`.

### C. ML Service (`ml-service/Dockerfile`)
- **Base Image**: `python:3.11-slim`
- **System Dependencies**: Installs minimal `libgl1`, `libglib2.0-0`, and `curl` for OpenCV and healthcheck probes.
- **Security**: Runs under non-root system user `appuser` (UID 1000).
- **Execution**: Starts Uvicorn production server without development `--reload` flag:
  ```bash
  uvicorn main:app --host 0.0.0.0 --port 8000
  ```

### D. Database (`mongodb`)
- **Image**: Official `mongo:7.0`
- **Database**: Default initialized database `civiceye`.
- **Data Persistence**: Backed by named volume `mongodb_data`.

---

## 5. Port Mapping Summary

| Service | Internal Container Port | Host Port (Exposed) | Access URL |
| :--- | :--- | :--- | :--- |
| **Frontend** | `80` | `5173` | `http://localhost:5173` |
| **Backend** | `5000` | `5000` | `http://localhost:5000/api` |
| **ML Service**| `8000` | `8000` | `http://localhost:8000` |
| **MongoDB** | `27017` | `27017` | `mongodb://localhost:27017` |

---

## 6. Container Health Checks & Startup Ordering

Docker Compose uses explicit readiness probes with `condition: service_healthy` to guarantee that services initialize in the correct order:

1. **MongoDB**:
   ```bash
   mongosh --quiet --eval "db.adminCommand('ping').ok" | grep 1
   ```
2. **ML Service**:
   ```bash
   curl -f http://localhost:8000/health || exit 1
   ```
3. **Backend**:
   Depends on `mongodb: condition: service_healthy` and `ml-service: condition: service_healthy`.
   ```bash
   curl -f http://localhost:5000/api/health || exit 1
   ```
4. **Frontend**:
   Depends on `backend: condition: service_healthy`.
   ```bash
   wget -q -O - http://localhost/healthz || exit 1
   ```

This prevents race conditions where the backend fails to connect to MongoDB or FastAPI during cold container starts.

---

## 7. Persistent Data & Volumes

CivicEye defines two named Docker volumes:

```yaml
volumes:
  mongodb_data:
    driver: local
  backend_uploads:
    driver: local
```

- **`mongodb_data`**: Mapped to `/data/db` in the MongoDB container. Preserves all users, civic complaints, status logs, and notifications across container restarts and rebuilds.
- **`backend_uploads`**: Mapped to `/app/uploads` in the Express backend container. Preserves citizen-uploaded photos and media evidence.

> [!WARNING]
> Running `docker compose down -v` deletes named volumes and will permanently erase local database records and uploaded images. Use standard `docker compose down` to stop containers safely while preserving data.

---

## 8. Development Mode vs. Docker Mode

### Development Mode (Host)
No Docker installation is required to develop locally:

```bash
# Terminal 1: MongoDB (Run as service or daemon)
mongod

# Terminal 2: FastAPI ML Service
cd ml-service
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 3: Express Backend
cd backend
npm run dev

# Terminal 4: React Vite Frontend
cd frontend
npm run dev
```

### Production Docker Mode
Single-command orchestration of the entire stack:

```bash
# Build and launch all 4 containers in detached mode
docker compose up --build -d

# View unified streaming logs
docker compose logs -f

# Verify container health
docker compose ps

# Graceful shutdown
docker compose down
```

---

## 9. CI/CD Pipeline (GitHub Actions)

The repository includes an automated Continuous Integration workflow at `.github/workflows/ci.yml`.

### Workflow Triggers
- Pushes to the `main` branch.
- Pull requests targeting `main`.

### Pipeline Jobs
1. **`backend-test`**:
   - Provisions a MongoDB 7.0 service container with live health probes.
   - Installs dependencies using `npm ci`.
   - Executes database foundation tests and deployment configuration checks.
2. **`frontend-build`**:
   - Sets up Node.js 20 environment.
   - Executes `npm ci` and `npm run build`.
   - Validates that production bundle artifacts exist in `dist/index.html`.
3. **`ml-service-test`**:
   - Installs OpenCV system dependencies and Python 3.11.
   - Installs PyTorch CPU wheels (`--extra-index-url https://download.pytorch.org/whl/cpu`).
   - Verifies baseline YOLO26 weights (`model/yolo26n.pt`).
   - Executes FastAPI endpoint test suite (`test_api.py`).
4. **`docker-validation`**:
   - Runs `docker compose config --quiet` to validate Compose syntax and environment interpolation.
   - Confirms presence of all required Dockerfiles and Nginx configurations.

---

## 10. Security & Hardening

1. **Non-Root Execution**:
   - Backend container runs as unprivileged user `node`.
   - ML service container runs as unprivileged user `appuser` (UID 1000).
2. **Credential Protection**:
   - `.gitignore` and `.dockerignore` strictly exclude `.env`, `.env.*`, and temporary secrets.
   - `.env.example` contains placeholder tokens only.
3. **Configurable CORS**:
   - Express server restricts origin access using `CORS_ORIGIN` in production, eliminating open wildcard vulnerabilities.
4. **Error Stack Shielding**:
   - In production (`NODE_ENV=production`), server error responses omit internal stack traces.
5. **Path Traversal Containment**:
   - Media storage abstraction strictly neutralizes relative directory traversal attempts (`..`).
6. **Graceful Shutdown**:
   - Express catches `SIGTERM` and `SIGINT` signals, closing the HTTP listener and severing MongoDB connections cleanly before termination.

---

## 11. Troubleshooting & Diagnostics

### View Service Logs
```bash
# All services
docker compose logs -f

# Specific container
docker compose logs -f backend
docker compose logs -f ml-service
docker compose logs -f mongodb
```

### Inspect Container Health
```bash
docker compose ps
```

### Reset Containers without Losing Data
```bash
docker compose down
docker compose up -d
```

### Clean Rebuild
```bash
docker compose build --no-cache
docker compose up -d
```

---

## 12. Deployment Limitations & Future Roadmap

- **Public Cloud Hosting**: This phase configures deployment readiness and multi-container orchestration. CivicEye is not automatically deployed to public cloud providers (AWS, GCP, Azure, Render, Railway).
- **Object Storage Migration**: Media files are stored on local persistent Docker volumes (`backend_uploads`). Migration to AWS S3 or Google Cloud Storage represents a future infrastructure enhancement.
- **GPU Acceleration**: Production Docker containers execute YOLO26 inference on CPU. High-throughput civic monitoring deployments can mount NVIDIA GPUs via the NVIDIA Container Toolkit.
