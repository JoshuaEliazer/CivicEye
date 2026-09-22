import os
from pathlib import Path
from typing import Optional
import io
from PIL import Image
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from inference.predictor import CivicEyePredictor

app = FastAPI(
    title="CivicEye ML Service",
    description="Computer Vision service powered by Ultralytics YOLO26 for civic issue detection (pothole, leakage, garbage).",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize predictor using configurable parameters
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.50"))
MODEL_PATH = os.getenv("MODEL_PATH", None)

predictor = CivicEyePredictor(model_path=MODEL_PATH, conf_threshold=CONFIDENCE_THRESHOLD)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@app.get("/health", tags=["Health"])
def health_check():
    """
    ML Service health and YOLO26 model status check.
    Reports whether model is loaded, active weights, architecture, and custom model status.
    """
    model_info = predictor.get_model_info()
    return {
        "status": "ok",
        "service": "CivicEye ML Service",
        "model": model_info
    }

@app.post("/predict", tags=["Inference"])
async def predict_issue(
    file: UploadFile = File(...),
    confidence: Optional[float] = Form(None)
):
    """
    Detect civic issues (pothole, leakage, garbage) in uploaded image using YOLO26.
    Accepts multipart/form-data with image file.
    """
    if not predictor.is_loaded():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ultralytics YOLO26 model is not available or failed to load."
        )

    # 1. Validate file extension
    filename = file.filename or ""
    file_ext = Path(filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{file_ext}'. Allowed formats: {sorted(list(ALLOWED_EXTENSIONS))}"
        )

    # 2. Validate MIME content type if provided
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported content type '{file.content_type}'. Must be one of: {sorted(list(ALLOWED_MIME_TYPES))}"
        )

    try:
        # Read file binary content
        content = await file.read()

        # 3. Check for empty upload
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded image file is empty (0 bytes)."
            )

        # 4. Check for oversized file
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Uploaded image ({len(content)} bytes) exceeds the 10MB size limit."
            )

        # 5. Verify image can be parsed by PIL (corrupt image check)
        try:
            with Image.open(io.BytesIO(content)) as img:
                img.verify()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Corrupt or unreadable image file: {str(e)}"
            )

        # 6. Execute YOLO26 prediction
        prediction = predictor.predict(image_input=content, conf_override=confidence)
        if not prediction.get("success"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=prediction.get("error", "Image inference failed.")
            )

        return prediction

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal inference error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
