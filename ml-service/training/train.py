import os
import sys
import argparse
from pathlib import Path
import yaml
import torch
from ultralytics import YOLO

def validate_dataset(data_yaml_path: Path):
    """
    Validates existence and structure of the dataset according to Section 8 of Master Prompt.
    Returns status dict with counts and integrity check.
    """
    if not data_yaml_path.exists():
        return {
            "valid": False,
            "reason": f"data.yaml not found at: {data_yaml_path}",
            "train_images": 0,
            "val_images": 0,
            "train_labels": 0,
            "val_labels": 0,
            "classes": {}
        }

    try:
        with open(data_yaml_path, "r") as f:
            data_cfg = yaml.safe_load(f)
    except Exception as e:
        return {
            "valid": False,
            "reason": f"Error parsing data.yaml: {e}",
            "train_images": 0,
            "val_images": 0,
            "train_labels": 0,
            "val_labels": 0,
            "classes": {}
        }

    base_dataset_dir = data_yaml_path.parent
    train_img_dir = base_dataset_dir / "images" / "train"
    val_img_dir = base_dataset_dir / "images" / "val"
    train_lbl_dir = base_dataset_dir / "labels" / "train"
    val_lbl_dir = base_dataset_dir / "labels" / "val"

    img_extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

    def count_files(dir_path: Path, ext_filter=None):
        if not dir_path.exists():
            return 0
        if ext_filter:
            return sum(1 for f in dir_path.iterdir() if f.is_file() and f.suffix.lower() in ext_filter)
        return sum(1 for f in dir_path.iterdir() if f.is_file())

    train_imgs = count_files(train_img_dir, img_extensions)
    val_imgs = count_files(val_img_dir, img_extensions)
    train_lbls = count_files(train_lbl_dir, {".txt"})
    val_lbls = count_files(val_lbl_dir, {".txt"})

    classes = data_cfg.get("names", {})
    required_classes = {"pothole", "leakage", "garbage"}
    provided_classes = set(classes.values()) if isinstance(classes, dict) else set(classes)

    missing_classes = required_classes - provided_classes
    if missing_classes:
        return {
            "valid": False,
            "reason": f"data.yaml missing required classes: {missing_classes}",
            "train_images": train_imgs,
            "val_images": val_imgs,
            "train_labels": train_lbls,
            "val_labels": val_lbls,
            "classes": classes
        }

    if train_imgs == 0 or val_imgs == 0:
        return {
            "valid": False,
            "reason": (
                f"Dataset contains insufficient images: "
                f"Train images: {train_imgs}, Validation images: {val_imgs}. "
                f"Annotated images must be placed in dataset/images/ and labels in dataset/labels/."
            ),
            "train_images": train_imgs,
            "val_images": val_imgs,
            "train_labels": train_lbls,
            "val_labels": val_lbls,
            "classes": classes
        }

    return {
        "valid": True,
        "reason": "Dataset structure and classes verified successfully.",
        "train_images": train_imgs,
        "val_images": val_imgs,
        "train_labels": train_lbls,
        "val_labels": val_lbls,
        "classes": classes
    }

def train(
    data_yaml: str = "dataset/data.yaml",
    model_name: str = "model/yolo26n.pt",
    epochs: int = 100,
    imgsz: int = 640,
    batch_size: int = 16,
    device: str = "auto",
    project_dir: str = "runs/train",
    name: str = "civiceye_yolo26",
    check_only: bool = False
):
    """
    Fine-tune Ultralytics YOLO26 on custom CivicEye civic issue dataset.
    Follows Master Prompt rules: strictly no fake datasets, no fake best.pt.
    """
    base_dir = Path(__file__).resolve().parent.parent
    data_path = base_dir / data_yaml
    model_path = base_dir / model_name

    print("=" * 60)
    print("CIVICEYE ULTRALYTICS YOLO26 TRAINING PIPELINE")
    print("=" * 60)

    # Validate dataset structure
    status = validate_dataset(data_path)
    print(f"[*] Checking dataset at: {data_path}")
    print(f"  - Training Images:    {status['train_images']}")
    print(f"  - Validation Images:  {status['val_images']}")
    print(f"  - Training Labels:    {status['train_labels']}")
    print(f"  - Validation Labels:  {status['val_labels']}")
    print(f"  - Classes:            {status['classes']}")
    print(f"[*] Dataset Status:     {'READY' if status['valid'] else 'INCOMPLETE / MISSING'}")

    if check_only:
        print(f"[*] Validation Details: {status['reason']}")
        return status

    if not status["valid"]:
        print("\n" + "!" * 60)
        print("DATASET VALIDATION ERROR (NO FABRICATION RULE ENFORCED)")
        print("!" * 60)
        print(f"Details: {status['reason']}")
        print("\nTo train the custom model:")
        print("  1. Add annotated training images to:   ml-service/dataset/images/train/")
        print("  2. Add corresponding YOLO labels to:    ml-service/dataset/labels/train/")
        print("  3. Add validation images to:           ml-service/dataset/images/val/")
        print("  4. Add validation YOLO labels to:      ml-service/dataset/labels/val/")
        print("  5. Re-run: python training/train.py")
        print("\nNotice: In strict compliance with the master prompt, no fake best.pt will be created.")
        print("The system will continue using baseline yolo26n.pt for inference.")
        print("!" * 60)
        return status

    # Determine device
    if device == "auto":
        device = "0" if torch.cuda.is_available() else "cpu"
    print(f"\n[*] Compute device: {device} (CUDA available: {torch.cuda.is_available()})")

    # Load baseline model
    print(f"[*] Loading pretrained YOLO26n weights from: {model_path}")
    model = YOLO(str(model_path))

    print(f"[*] Starting YOLO26 fine-tuning: epochs={epochs}, imgsz={imgsz}, batch={batch_size}...")
    results = model.train(
        data=str(data_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch_size,
        device=device,
        project=str(base_dir / project_dir),
        name=name
    )

    # Save best model to expected location model/best.pt
    save_dir = Path(results.save_dir) if hasattr(results, "save_dir") else None
    if save_dir and (save_dir / "weights" / "best.pt").exists():
        target_best = base_dir / "model" / "best.pt"
        import shutil
        shutil.copy(save_dir / "weights" / "best.pt", target_best)
        print(f"\n[+] Successfully saved trained custom weights to: {target_best}")

    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicEye YOLO26 Training Pipeline")
    parser.add_argument("--data", type=str, default="dataset/data.yaml", help="Path to data.yaml")
    parser.add_argument("--model", type=str, default="model/yolo26n.pt", help="Pretrained model weights")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="auto", help="Compute device ('cpu', '0')")
    parser.add_argument("--check-only", action="store_true", help="Only validate dataset integrity without training")
    args = parser.parse_args()

    train(
        data_yaml=args.data,
        model_name=args.model,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch_size=args.batch,
        device=args.device,
        check_only=args.check_only
    )
