# ================================================================
# CivicEye ML Service - Production Dockerfile (Python 3.11 Slim)
# ================================================================

FROM python:3.11-slim AS production

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV MODEL_PATH=model/yolo26n.pt
ENV CONFIDENCE_THRESHOLD=0.50

# Install minimal OS dependencies required for OpenCV, PyTorch CPU, and healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root application user for container security
RUN useradd -m -u 1000 -s /bin/bash appuser

# Set application working directory
WORKDIR /app

# Copy requirements file first for layer caching
COPY requirements.txt ./

# Upgrade pip and install Python packages (PyTorch CPU compatible)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application modules and pre-loaded YOLO26 baseline model
COPY main.py ./
COPY inference/ ./inference/
COPY model/ ./model/

# Set ownership of application files to non-root appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose FastAPI ML service port
EXPOSE 8000

# Container healthcheck querying FastAPI /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Launch FastAPI application using production Uvicorn server without auto-reload
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
