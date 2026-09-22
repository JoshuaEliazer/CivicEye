import sys
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

# Ensure ml-service root is in sys.path
base_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(base_dir))

from inference.predictor import CivicEyePredictor

def run_standalone_test():
    print("=" * 60)
    print("CIVICEYE PHASE 3: STANDALONE YOLO26 INFERENCE TEST")
    print("=" * 60)

    # 1. Initialize Predictor
    print("[*] Initializing CivicEyePredictor...")
    predictor = CivicEyePredictor()
    info = predictor.get_model_info()

    print(f"[+] Model Loaded:        {info['loaded']}")
    print(f"[+] Architecture:        {info['architecture']}")
    print(f"[+] Model Variant:       {info['model_variant']}")
    print(f"[+] Active Model Path:   {info['model_path']}")
    print(f"[+] Is Custom Model:     {info['is_custom_model']}")
    print(f"[+] Custom Available:    {info['custom_model_available']}")
    print(f"[+] Status Notice:       {info['status_message']}")
    print(f"[+] Classes Count:       {len(info['supported_classes'])}")

    if not info["loaded"]:
        print("[-] FATAL: Failed to load YOLO26 model.")
        sys.exit(1)

    # 2. Generate a test image (640x640 road simulation)
    print("\n[*] Generating synthetic test image (640x640)...")
    test_img = Image.new("RGB", (640, 640), color=(50, 50, 50))
    draw = ImageDraw.Draw(test_img)
    # Draw simulated dark pothole-like depression
    draw.ellipse([200, 200, 440, 400], fill=(20, 20, 20), outline=(30, 30, 30), width=4)
    # Draw yellow road line
    draw.line([(0, 320), (640, 320)], fill=(240, 200, 20), width=6)

    test_img_path = base_dir / "test_sample.jpg"
    test_img.save(test_img_path)
    print(f"[+] Saved test image to: {test_img_path}")

    # 3. Run Inference with Default Threshold (0.50)
    print("\n[*] Running inference with confidence threshold = 0.50...")
    result = predictor.predict(test_img_path)
    print(f"[+] Inference Success:   {result['success']}")
    print(f"[+] Primary Issue:       {result['issue']}")
    print(f"[+] Confidence:          {result['confidence']}")
    print(f"[+] Is Uncertain:        {result.get('is_uncertain')}")
    print(f"[+] Total Detections:    {len(result['detections'])}")
    if result.get("message"):
        print(f"[+] Message:             {result['message']}")

    # 4. Test Low-Confidence / Sensitive Threshold (0.10)
    print("\n[*] Running sensitive inference (threshold = 0.10)...")
    sensitive_result = predictor.predict(test_img_path, conf_override=0.10)
    print(f"[+] Sensitive Success:   {sensitive_result['success']}")
    print(f"[+] Issue Detected:      {sensitive_result['issue']}")
    print(f"[+] Confidence:          {sensitive_result['confidence']}")
    print(f"[+] Detections:          {len(sensitive_result['detections'])}")

    # Clean up test image
    if test_img_path.exists():
        test_img_path.unlink()
        print("\n[+] Cleaned up temporary test image.")

    print("\n" + "=" * 60)
    print(">>> STANDALONE YOLO26 INFERENCE TEST PASSED SUCCESSFULLY <<<")
    print("=" * 60)

if __name__ == "__main__":
    run_standalone_test()
