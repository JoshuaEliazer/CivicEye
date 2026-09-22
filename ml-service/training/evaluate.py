import os
import argparse
from pathlib import Path
from ultralytics import YOLO
from train import validate_dataset

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
    data_path = base_dir / data_yaml

    # 1. Pre-flight dataset check
    status = validate_dataset(data_path)
    if not status["valid"] or status["val_images"] == 0:
        print("=" * 60)
        print("EVALUATION NOTICE (NO FABRICATION RULE ENFORCED)")
        print("=" * 60)
        print(f"Validation images found: {status['val_images']}")
        print(f"Reason: Cannot evaluate without an annotated validation dataset.")
        print("Master prompt rule: All performance metrics must come from actual validation results.")
        print("No metrics (mAP, Precision, Recall) will be fabricated.")
        print("=" * 60)
        return None

    target_model = base_dir / model_path
    is_custom = True
    if not target_model.exists():
        fallback_model = base_dir / "model" / "yolo26n.pt"
        if fallback_model.exists():
            print(f"[!] Notice: Custom model '{target_model}' not found. Evaluating baseline '{fallback_model}'")
            target_model = fallback_model
            is_custom = False
        else:
            raise FileNotFoundError(f"No model checkpoint found at: {target_model}")

    print(f"[*] Evaluating YOLO26 model: {target_model} (Custom Model: {is_custom})")
    model = YOLO(str(target_model))

    metrics = model.val(
        data=str(data_path),
        imgsz=imgsz,
        device=device if device != "auto" else None
    )

    print("\n" + "=" * 60)
    print("CIVICEYE YOLO26 MODEL VALIDATION METRICS (ACTUAL MEASUREMENTS)")
    print("=" * 60)
    print(f"Model Evaluated: {target_model.name} ({'Custom Fine-Tuned' if is_custom else 'Pretrained Baseline'})")
    print(f"Validation Set:  {status['val_images']} images")
    print(f"Precision (B):   {metrics.box.mp:.4f}")
    print(f"Recall (B):      {metrics.box.mr:.4f}")
    print(f"mAP@50:          {metrics.box.map50:.4f}")
    print(f"mAP@50-95:       {metrics.box.map:.4f}")
    print("=" * 60)

    return metrics

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicEye YOLO26 Model Evaluation")
    parser.add_argument("--model", type=str, default="model/best.pt", help="Path to weights (.pt)")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    args = parser.parse_args()

    evaluate(model_path=args.model, data_yaml=args.data, imgsz=args.imgsz)
