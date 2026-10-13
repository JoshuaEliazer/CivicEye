from ultralytics import YOLO

weights = "C:/CivicEyeTraining/civiceye_yolo26n_v1/weights/best.pt"
data = "data/data.yaml"

def main():
    model = YOLO(weights)

    for conf in (0.05, 0.10, 0.15, 0.25):
        print(f"\n--- Confidence threshold: {conf:.2f} ---", flush=True)

        metrics = model.val(
            data=data,
            split="val",
            imgsz=640,
            batch=4,
            workers=0,
            device=0,
            conf=conf,
            plots=False,
            verbose=False
        )

        for i, name in model.names.items():
            if name == "leakage":
                print(
                    "Leakage metrics (P, R, mAP50, mAP50-95):",
                    metrics.box.class_result(i),
                    flush=True
                )

if __name__ == "__main__":
    main()
