from pathlib import Path
from ultralytics import YOLO

model = YOLO("C:/CivicEyeTraining/civiceye_yolo26n_v1/weights/best.pt")

files = sorted(Path("data/valid/images").glob("leakage_*"))[:20]
print("Leakage images selected:", len(files))

if not files:
    raise SystemExit("No leakage validation images found. Check data/valid/images.")

model.predict(
    source=[str(p) for p in files],
    imgsz=640,
    conf=0.05,
    iou=0.7,
    device=0,
    save=True,
    project="C:/CivicEyeTraining",
    name="leakage_prediction_review",
    exist_ok=True,
    verbose=False
)

print("Predictions saved to C:/CivicEyeTraining/leakage_prediction_review")
