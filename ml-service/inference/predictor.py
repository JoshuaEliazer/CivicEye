import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Union
import numpy as np
from PIL import Image
import io
from ultralytics import YOLO

class CivicEyePredictor:
    """
    CivicEye Ultralytics YOLO26 Inference Engine.
    Handles computer-vision-based detection for civic infrastructure issues:
    - 0: pothole
    - 1: leakage
    - 2: garbage

    Distinguishes clearly between:
    - Pretrained baseline YOLO26n (yolo26n.pt)
    - Custom-trained civic issue model (best.pt)
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        conf_threshold: float = 0.50,
        uncertain_threshold: float = 0.25
    ):
        self.conf_threshold = conf_threshold
        self.uncertain_threshold = uncertain_threshold
        self.model = None
        self.model_path = None
        self.is_custom_model = False
        self.custom_model_available = False
        self.classes_map = {0: "pothole", 1: "leakage", 2: "garbage"}

        self._initialize_model(model_path)

    def _initialize_model(self, model_path: Optional[str] = None):
        base_dir = Path(__file__).resolve().parent.parent
        custom_weights = base_dir / "model" / "best.pt"
        default_weights = base_dir / "model" / "yolo26n.pt"

        self.custom_model_available = custom_weights.exists()

        if model_path and os.path.exists(model_path):
            target_path = Path(model_path)
            self.is_custom_model = "best.pt" in str(target_path)
        elif self.custom_model_available:
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
            print(f"[CivicEyePredictor] Loaded model: {self.model_path} (Custom: {self.is_custom_model})")
        except Exception as e:
            self.model = None
            print(f"[CivicEyePredictor] Error loading YOLO26 model from {self.model_path}: {e}")

    def is_loaded(self) -> bool:
        return self.model is not None

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "loaded": self.is_loaded(),
            "model_path": self.model_path,
            "architecture": "Ultralytics YOLO26",
            "model_variant": "YOLO26n",
            "is_custom_model": self.is_custom_model,
            "custom_model_available": self.custom_model_available,
            "confidence_threshold": self.conf_threshold,
            "uncertain_threshold": self.uncertain_threshold,
            "status_message": (
                "Custom fine-tuned civic issue model active."
                if self.is_custom_model
                else "Custom trained YOLO26 model is not available yet. Using pretrained YOLO26n baseline."
            ),
            "supported_classes": list(self.classes_map.values()) if isinstance(self.classes_map, dict) else self.classes_map
        }

    def predict(
        self,
        image_input: Union[bytes, str, Path, Image.Image],
        conf_override: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Run inference on image using Ultralytics YOLO26.
        Supports bytes, file path, Path object, or PIL Image.
        Returns structured detection output with uncertainty handling.
        """
        if not self.is_loaded():
            return {
                "success": False,
                "error": "Ultralytics YOLO26 model is not loaded or unavailable."
            }

        conf = conf_override if conf_override is not None else self.conf_threshold

        try:
            # Load image based on input type
            if isinstance(image_input, (bytes, bytearray)):
                pil_img = Image.open(io.BytesIO(image_input))
            elif isinstance(image_input, (str, Path)):
                pil_img = Image.open(str(image_input))
            elif isinstance(image_input, Image.Image):
                pil_img = image_input
            else:
                raise ValueError(f"Unsupported image input type: {type(image_input)}")

            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")

            # Run YOLO26 inference down to uncertain threshold to capture low-confidence detections
            raw_results = self.model.predict(
                source=pil_img,
                conf=self.uncertain_threshold,
                verbose=False
            )

            all_detections: List[Dict[str, Any]] = []
            confident_detections: List[Dict[str, Any]] = []
            uncertain_detections: List[Dict[str, Any]] = []

            highest_conf = 0.0
            primary_issue = "none"

            if len(raw_results) > 0 and raw_results[0].boxes is not None:
                boxes = raw_results[0].boxes
                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    score = round(float(box.conf[0].item()), 4)
                    xyxy = [round(x, 2) for x in box.xyxy[0].tolist()]
                    cls_name = self.classes_map.get(cls_id, str(cls_id))

                    detection_item = {
                        "class": cls_name,
                        "class_id": cls_id,
                        "confidence": score,
                        "bbox": xyxy
                    }
                    all_detections.append(detection_item)

                    if score >= conf:
                        confident_detections.append(detection_item)
                        if score > highest_conf:
                            highest_conf = score
                            primary_issue = cls_name
                    elif score >= self.uncertain_threshold:
                        uncertain_detections.append(detection_item)

            # Scenario 1: Confident detections found
            if confident_detections:
                return {
                    "success": True,
                    "issue": primary_issue,
                    "confidence": highest_conf,
                    "is_uncertain": False,
                    "detections": confident_detections,
                    "model_info": self.get_model_info()
                }

            # Scenario 2: Only low-confidence / uncertain detections found
            if uncertain_detections:
                best_uncertain = max(uncertain_detections, key=lambda d: d["confidence"])
                return {
                    "success": True,
                    "issue": best_uncertain["class"],
                    "confidence": best_uncertain["confidence"],
                    "is_uncertain": True,
                    "message": (
                        f"Possible {best_uncertain['class']} detected with low confidence "
                        f"({int(best_uncertain['confidence'] * 100)}%). "
                        f"Please verify the result before submitting."
                    ),
                    "detections": uncertain_detections,
                    "model_info": self.get_model_info()
                }

            # Scenario 3: No detections above uncertain threshold
            return {
                "success": True,
                "issue": "none",
                "confidence": 0.0,
                "is_uncertain": False,
                "message": "No sufficiently confident civic issue detected.",
                "detections": [],
                "model_info": self.get_model_info()
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Inference execution failed: {str(e)}"
            }
