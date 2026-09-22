# CivicEye Machine Learning Architecture Specification (Ultralytics YOLO26)

## 1. Overview & Model Selection

CivicEye utilizes the **Ultralytics YOLO26** object detection family for automated computer-vision classification and localization of municipal infrastructure hazards.

### 1.1 Why Ultralytics YOLO26?
- **State-of-the-Art Detection**: YOLO26 introduces advanced architectural refinements including optimized backbone feature extractors and anchor-free detection heads that yield superior speed-to-accuracy trade-offs for embedded and real-time municipal inspection workflows.
- **Strict Version Adherence**: Built specifically around the official released Ultralytics YOLO26 family. Obsolete YOLO versions are avoided, and unreleased iterations (e.g. YOLO27) are not used.

### 1.2 Initial Model: YOLO26n
- **Model Variant**: Nano (`YOLO26n`)
- **Base Checkpoint**: `yolo26n.pt` (5.3 MB)
- **Rationale**: `YOLO26n` provides rapid inference on commodity CPU and edge hardware while maintaining sufficient precision for initial deployment. If measured mAP proves insufficient after custom dataset training, scaling to `YOLO26s` or `YOLO26m` can be considered based on measured metrics.

---

## 2. Target Civic Issue Classes

```text
Class ID 0: pothole
Class ID 1: leakage
Class ID 2: garbage
```

The mapping is defined in `ml-service/dataset/data.yaml`:
```yaml
path: ./dataset
train: images/train
val: images/val

names:
  0: pothole
  1: leakage
  2: garbage
```

---

## 3. Dataset Requirements & Annotation Format

Each image must have a corresponding `.txt` file with identical basename located in the parallel `labels/` directory.

### Format: Standard YOLO Bounding Box
```text
<class_id> <x_center> <y_center> <width> <height>
```
All coordinates are normalized to the range `[0.0, 1.0]`.

### Directory Structure:
```text
dataset/
├── images/
│   ├── train/     # Training image files (.jpg, .png)
│   └── val/       # Validation image files (.jpg, .png)
├── labels/
│   ├── train/     # Training label files (.txt)
│   └── val/       # Validation label files (.txt)
└── data.yaml      # Dataset configuration file
```

---

## 4. Training & Fine-Tuning Pipeline

### 4.1 Training Pipeline (`ml-service/training/train.py`)
Fine-tuning is invoked via:
```bash
python training/train.py --epochs 100 --imgsz 640 --batch 16 --device auto
```

### 4.2 Dataset Integrity Pre-Flight Check
Before starting, `train.py` validates the dataset:
- Checks `data.yaml` existence and required class definitions.
- Scans `images/train` and `images/val` for valid image files.
- Scans `labels/train` and `labels/val` for corresponding annotation files.
- **No Fabrication Rule**: If images or labels are missing (count = 0), training safely halts with an honest report without generating synthetic images, fake annotations, or fake `best.pt` weights.

### 4.3 Model Output
- Checkpoints are saved under `runs/train/civiceye_yolo26/weights/`.
- The highest performing checkpoint is copied to `ml-service/model/best.pt`.
- When `model/best.pt` is absent, the inference engine falls back to `model/yolo26n.pt` and reports `is_custom_model: false`.

---

## 5. Model Evaluation (`ml-service/training/evaluate.py`)

Validation is performed strictly on real validation data:
```bash
python training/evaluate.py --model model/best.pt --data dataset/data.yaml
```

Measured metrics:
- **Precision (B)**
- **Recall (B)**
- **mAP@50**
- **mAP@50-95**
- Per-class performance

> [!NOTE]
> All metrics reported must be derived from actual model validation runs. In compliance with the No Fabrication Rule, COCO benchmark scores are never substituted for CivicEye performance metrics.

---

## 6. Standalone Inference Engine (`ml-service/inference/predictor.py`)

### 6.1 Confidence Thresholding
- Default threshold: `CONFIDENCE_THRESHOLD = 0.50` (configurable).
- Detections with `confidence >= CONFIDENCE_THRESHOLD` are classified as confident civic issue reports.
- Detections with `confidence < CONFIDENCE_THRESHOLD` are excluded from definitive classification.

### 6.2 Low-Confidence / Uncertainty Handling
- Detections between `0.25` and `CONFIDENCE_THRESHOLD` trigger the `is_uncertain: true` flag.
- Output includes a clear user advisory:
  `"Possible <class> detected with low confidence (<confidence>%). Please verify the result before submitting."`
- Protects municipal dispatchers from automated false positives.
