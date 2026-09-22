import os
from pathlib import Path
from typing import Optional
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

# Initialize predictor
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.50"))
MODEL_PATH = os.getenv("MODEL_PATH", None)

predictor = CivicEyePredictor(model_path=MODEL_PATH, conf_threshold=CONFIDENCE_THRESHOLD)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@app.get("/health", tags=["Health"])
def health_check():
    """
    ML Service health and YOLO26 model status check.
    """
    return {
        "status": "ok",
        "service": "CivicEye ML Service",
        "model": {
            "loaded": predictor.is_loaded(),
            "model_path": predictor.model_path,
            "is_custom_model": predictor.is_custom_model,
            "confidence_threshold": predictor.conf_threshold,
            "architecture": "Ultralytics YOLO26"
        }
    }

@app.post("/predict", tags=["Inference"])
async def predict_issue(
    file: UploadFile = File(...),
    confidence: Optional[float] = Form(None)
):
    """
    Detect civic issues (pothole, leakage, garbage) in uploaded image using YOLO26.
    """
    if not predictor.is_loaded():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="YOLO26 model is not available or failed to load."
        )

    # Validate file extension
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{file_ext}'. Allowed formats: {list(ALLOWED_EXTENSIONS)}"
        )

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty."
            )
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Uploaded image exceeds 10MB limit."
            )

        prediction = predictor.predict(image_data=content, conf_override=confidence)
        if not prediction.get("success"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=prediction.get("error", "Image processing failed.")
            )

        return prediction

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal prediction error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
