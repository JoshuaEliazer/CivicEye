import os
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
from PIL import Image
import io
from ultralytics import YOLO

class CivicEyePredictor:
    def __init__(self, model_path: Optional[str] = None, conf_threshold: float = 0.50):
        """
        CivicEye Ultralytics YOLO26 Predictor.
        Distinguishes between custom-trained civic issue model (best.pt)
        and baseline pretrained YOLO26n (yolo26n.pt).
        """
        self.conf_threshold = conf_threshold
        self.model = None
        self.model_path = None
        self.is_custom_model = False
        self.classes_map = {0: "pothole", 1: "leakage", 2: "garbage"}

        self._initialize_model(model_path)

    def _initialize_model(self, model_path: Optional[str] = None):
        base_dir = Path(__file__).resolve().parent.parent
        custom_weights = base_dir / "model" / "best.pt"
        default_weights = base_dir / "model" / "yolo26n.pt"

        if model_path and os.path.exists(model_path):
            target_path = Path(model_path)
        elif custom_weights.exists():
            target_path = custom_weights
            self.is_custom_model = True
        elif default_weights.exists():
            target_path = default_weights
            self.is_custom_model = False
        else:
            target_path = Path("yolo26n.pt")
            self.is_custom_model = False

        self.model_path = str(target_path)
        try:
            self.model = YOLO(self.model_path)
            # Update names map if model has names defined
            if hasattr(self.model, "names") and isinstance(self.model.names, dict):
                self.classes_map = self.model.names
        except Exception as e:
            self.model = None
            print(f"[CivicEyePredictor] Error loading YOLO26 model from {self.model_path}: {e}")

    def is_loaded(self) -> bool:
        return self.model is not None

    def predict(self, image_data: bytes, conf_override: Optional[float] = None) -> Dict[str, Any]:
        """
        Run inference on image bytes using Ultralytics YOLO26.
        Returns structured detection output.
        """
        if not self.is_loaded():
            return {
                "success": False,
                "error": "YOLO26 model is not loaded or unavailable."
            }

        conf = conf_override if conf_override is not None else self.conf_threshold

        try:
            pil_img = Image.open(io.BytesIO(image_data))
            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")

            # Run YOLO26 inference
            results = self.model.predict(source=pil_img, conf=conf, verbose=False)
            
            detections: List[Dict[str, Any]] = []
            highest_conf = 0.0
            primary_issue = "none"

            if len(results) > 0 and results[0].boxes is not None:
                boxes = results[0].boxes
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    score = float(box.conf[0].item())
                    xyxy = [round(x, 2) for x in box.xyxy[0].tolist()]
                    cls_name = self.classes_map.get(cls_id, str(cls_id))

                    detections.append({
                        "class": cls_name,
                        "class_id": cls_id,
                        "confidence": round(score, 4),
                        "bbox": xyxy
                    })

                    if score > highest_conf:
                        highest_conf = score
                        primary_issue = cls_name

            if not detections:
                return {
                    "success": True,
                    "issue": "none",
                    "confidence": 0.0,
                    "message": "No sufficiently confident civic issue detected.",
                    "detections": [],
                    "is_custom_model": self.is_custom_model,
                    "model_source": self.model_path,
                    "threshold_applied": conf
                }

            return {
                "success": True,
                "issue": primary_issue,
                "confidence": round(highest_conf, 4),
                "detections": detections,
                "is_custom_model": self.is_custom_model,
                "model_source": self.model_path,
                "threshold_applied": conf
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Inference failed: {str(e)}"
            }
