from ultralytics import YOLO
from pathlib import Path

weights = Path("C:/CivicEyeTraining/civiceye_yolo26n_v1/weights/best.pt")
data = Path("data/data.yaml")

if not weights.exists():
    raise FileNotFoundError(f"Model weights not found: {weights}")

if not data.exists():
    raise FileNotFoundError(f"Dataset YAML not found: {data}")

model = YOLO(str(weights))

results = model.val(
    data=str(data),
    split="test",
    imgsz=640,
    batch=4,
    workers=0,
    device=0,
    plots=True,
    project="C:/CivicEyeTraining",
    name="final_test_evaluation",
    exist_ok=True
)

print("\n=== FINAL TEST METRICS ===")
print("Precision:", results.box.mp)
print("Recall:", results.box.mr)
print("mAP50:", results.box.map50)
print("mAP50-95:", results.box.map)

print("\nPer-class mAP50:")
for i, score in enumerate(results.box.ap50):
    print(f"Class {i}: {score:.4f}")

print("\nEvaluation files: C:/CivicEyeTraining/final_test_evaluation")
