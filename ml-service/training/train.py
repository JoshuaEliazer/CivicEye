import os
import argparse
from pathlib import Path
import torch
from ultralytics import YOLO

def train(
    data_yaml: str = "dataset/data.yaml",
    model_name: str = "model/yolo26n.pt",
    epochs: int = 100,
    imgsz: int = 640,
    batch_size: int = 16,
    device: str = "auto",
    project_dir: str = "runs/train",
    name: str = "civiceye_yolo26"
):
    """
    Fine-tune Ultralytics YOLO26 on custom CivicEye civic issue dataset.
    """
    base_dir = Path(__file__).resolve().parent.parent
    data_path = base_dir / data_yaml
    model_path = base_dir / model_name

    if not data_path.exists():
        raise FileNotFoundError(f"Dataset config not found at: {data_path}")

    # Determine compute device
    if device == "auto":
        device = "0" if torch.cuda.is_available() else "cpu"
    print(f"[*] Training on device: {device} (CUDA Available: {torch.cuda.is_available()})")

    # Load baseline model (defaults to yolo26n.pt)
    print(f"[*] Loading pretrained YOLO26 model: {model_path}")
    model = YOLO(str(model_path))

    print(f"[*] Starting fine-tuning for {epochs} epochs at image size {imgsz}...")
    results = model.train(
        data=str(data_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch_size,
        device=device,
        project=str(base_dir / project_dir),
        name=name
    )

    # Save best weights to model/best.pt if available
    save_dir = Path(results.save_dir) if hasattr(results, "save_dir") else None
    if save_dir and (save_dir / "weights" / "best.pt").exists():
        target_best = base_dir / "model" / "best.pt"
        import shutil
        shutil.copy(save_dir / "weights" / "best.pt", target_best)
        print(f"[+] Successfully saved best model to: {target_best}")

    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicEye YOLO26 Training Pipeline")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--model", type=str, default="model/yolo26n.pt", help="Base model weights")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="auto", help="Compute device ('cpu', '0', etc.)")
    args = parser.parse_args()

    train(
        data_yaml=args.data,
        model_name=args.model,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch_size=args.batch,
        device=args.device
    )
