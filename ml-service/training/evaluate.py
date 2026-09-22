import os
import argparse
from pathlib import Path
from ultralytics import YOLO

def evaluate(
    model_path: str = "model/best.pt",
    data_yaml: str = "dataset/data.yaml",
    imgsz: int = 640,
    device: str = "auto"
):
    """
    Evaluate YOLO26 model on CivicEye validation dataset.
    Extracts real, un-fabricated validation metrics.
    """
    base_dir = Path(__file__).resolve().parent.parent
    target_model = base_dir / model_path
    if not target_model.exists():
        fallback_model = base_dir / "model" / "yolo26n.pt"
        if fallback_model.exists():
            print(f"[!] Warning: {target_model} not found. Falling back to baseline {fallback_model}")
            target_model = fallback_model
        else:
            raise FileNotFoundError(f"Model checkpoint not found at: {target_model}")

    data_path = base_dir / data_yaml
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset config not found at: {data_path}")

    print(f"[*] Evaluating YOLO26 model: {target_model}")
    model = YOLO(str(target_model))

    metrics = model.val(
        data=str(data_path),
        imgsz=imgsz,
        device=device if device != "auto" else None
    )

    print("\n" + "="*50)
    print("CIVICEYE MODEL VALIDATION METRICS (ACTUAL MEASUREMENTS)")
    print("="*50)
    print(f"Precision (B):   {metrics.box.mp:.4f}")
    print(f"Recall (B):      {metrics.box.mr:.4f}")
    print(f"mAP@50:          {metrics.box.map50:.4f}")
    print(f"mAP@50-95:       {metrics.box.map:.4f}")
    print("="*50)

    return metrics

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicEye YOLO26 Model Evaluation")
    parser.add_argument("--model", type=str, default="model/best.pt", help="Path to weights (.pt)")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    args = parser.parse_args()

    evaluate(model_path=args.model, data_yaml=args.data, imgsz=args.imgsz)
