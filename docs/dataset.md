# CivicEye Dataset Preparation Guide

## 1. Directory Structure

```text
CivicEye/ml-service/dataset/
├── images/
│   ├── train/     # Training images (.jpg, .png)
│   └── val/       # Validation images (.jpg, .png)
├── labels/
│   ├── train/     # Training YOLO label files (.txt)
│   └── val/       # Validation YOLO label files (.txt)
└── data.yaml      # Dataset metadata
```

---

## 2. Classes & Mapping

| Class ID | Class Name | Target Physical Issue |
| :--- | :--- | :--- |
| `0` | `pothole` | Road surface cavities, asphalt depressions, pavement damage |
| `1` | `leakage` | Burst water mains, leaking drainage pipes, open stormwater flow |
| `2` | `garbage` | Overflowing dumpsters, roadside waste piles, scattered trash |

---

## 3. Annotation Specification

- Format: Standard normalized YOLO text format.
- File naming: Each image must have an identically named `.txt` file:
  - Image: `dataset/images/train/pothole_001.jpg`
  - Label: `dataset/labels/train/pothole_001.txt`
- Record format per line:
  ```text
  <class_id> <x_center> <y_center> <width> <height>
  ```
  Example for a pothole centered at (0.45, 0.60) with width 0.30 and height 0.20:
  ```text
  0 0.450000 0.600000 0.300000 0.200000
  ```

---

## 4. Current Dataset Status

| Split | Images Found | Labels Found | Status |
| :--- | :--- | :--- | :--- |
| **Train** | `0` | `0` | Missing |
| **Validation** | `0` | `0` | Missing |

> [!IMPORTANT]
> **No Fabrication Rule**:
> In compliance with project guidelines, no synthetic, fake, or placeholder training images or annotations have been generated. To fine-tune the YOLO26 model, place real annotated datasets into the paths above and execute:
> ```powershell
> python ml-service/training/train.py
> ```
