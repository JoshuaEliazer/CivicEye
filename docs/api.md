# CivicEye FastAPI ML Service Specification

## 1. Service Overview

The **CivicEye ML Service** is a dedicated Python FastAPI microservice responsible for computer vision inference. It executes object detection on civic problem images using **Ultralytics YOLO26**.

- **Base URL (Local)**: `http://localhost:8000`
- **Swagger / OpenAPI Documentation**: `http://localhost:8000/docs`
- **Architecture Role**: Express → FastAPI (React does not call FastAPI directly)

---

## 2. Endpoints

### 2.1 Health & Model Inspection: `GET /health`

Returns service health, model loading status, active checkpoint path, and architecture variant.

#### Request
```http
GET /health HTTP/1.1
Host: localhost:8000
Accept: application/json
```

#### Response (200 OK)
```json
{
  "status": "ok",
  "service": "CivicEye ML Service",
  "model": {
    "loaded": true,
    "model_path": "C:\\Users\\joshu\\OneDrive\\Desktop\\CivicEye\\ml-service\\model\\yolo26n.pt",
    "architecture": "Ultralytics YOLO26",
    "model_variant": "YOLO26n",
    "is_custom_model": false,
    "custom_model_available": false,
    "confidence_threshold": 0.5,
    "uncertain_threshold": 0.25,
    "status_message": "Custom trained YOLO26 model is not available yet. Using pretrained YOLO26n baseline.",
    "supported_classes": ["pothole", "leakage", "garbage"]
  }
}
```

---

### 2.2 Civic Issue Inference: `POST /predict`

Executes Ultralytics YOLO26 detection on an uploaded image.

#### Request
```http
POST /predict HTTP/1.1
Host: localhost:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...
```

#### Form Fields
| Field Name | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `file` | Binary File | **Yes** | — | Image file (`.jpg`, `.jpeg`, `.png`, `.webp`, max 10MB) |
| `confidence` | Float | No | `0.50` | Optional confidence threshold override (0.0 to 1.0) |

---

### 2.3 Response Formats

#### Case A: Confident Detection (confidence >= threshold)
```json
{
  "success": true,
  "issue": "pothole",
  "confidence": 0.9425,
  "is_uncertain": false,
  "detections": [
    {
      "class": "pothole",
      "class_id": 0,
      "confidence": 0.9425,
      "bbox": [100.5, 120.0, 350.2, 280.8]
    }
  ],
  "model_info": {
    "loaded": true,
    "model_path": "model/yolo26n.pt",
    "architecture": "Ultralytics YOLO26",
    "model_variant": "YOLO26n",
    "is_custom_model": false
  }
}
```

#### Case B: Low-Confidence / Uncertain Detection (0.25 <= confidence < threshold)
```json
{
  "success": true,
  "issue": "leakage",
  "confidence": 0.421,
  "is_uncertain": true,
  "message": "Possible leakage detected with low confidence (42%). Please verify the result before submitting.",
  "detections": [
    {
      "class": "leakage",
      "class_id": 1,
      "confidence": 0.421,
      "bbox": [45.0, 80.2, 210.0, 300.5]
    }
  ],
  "model_info": {
    "loaded": true,
    "architecture": "Ultralytics YOLO26"
  }
}
```

#### Case C: No Detection (confidence < 0.25)
```json
{
  "success": true,
  "issue": "none",
  "confidence": 0.0,
  "is_uncertain": false,
  "message": "No sufficiently confident civic issue detected.",
  "detections": [],
  "model_info": {
    "loaded": true,
    "architecture": "Ultralytics YOLO26"
  }
}
```

---

## 3. Error Responses

| Status Code | Error Detail / Condition | Example Response |
| :--- | :--- | :--- |
| **400 Bad Request** | Non-image extension or MIME type | `{"detail": "Unsupported file format '.txt'. Allowed formats: ['.jpeg', '.jpg', '.png', '.webp']"}` |
| **400 Bad Request** | Empty file uploaded (0 bytes) | `{"detail": "Uploaded image file is empty (0 bytes)."}` |
| **413 Payload Too Large**| File exceeds 10MB limit | `{"detail": "Uploaded image (12582912 bytes) exceeds the 10MB size limit."}` |
| **422 Unprocessable Content** | Corrupt or invalid image bytes | `{"detail": "Corrupt or unreadable image file: ..."}` |
| **422 Unprocessable Content** | Missing required form field `file` | Standard FastAPI validation error |
| **503 Service Unavailable** | YOLO26 model checkpoint missing | `{"detail": "Ultralytics YOLO26 model is not available or failed to load."}` |
