import io
import sys
from pathlib import Path
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

# Add ml-service root to sys.path
base_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(base_dir))

from main import app

client = TestClient(app)

def generate_test_image_bytes():
    """Generates a valid test JPEG image in memory."""
    img = Image.new("RGB", (640, 640), color=(60, 60, 60))
    draw = ImageDraw.Draw(img)
    draw.rectangle([150, 150, 450, 450], fill=(30, 30, 30), outline=(20, 20, 20))
    draw.line([(0, 320), (640, 320)], fill=(255, 215, 0), width=5)

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def run_api_tests():
    print("=" * 60)
    print("CIVICEYE PHASE 4: FASTAPI ML SERVICE AUTOMATED TEST SUITE")
    print("=" * 60)

    # TEST 1: Health Check Endpoint
    print("\n[TEST 1] Testing GET /health...")
    res_health = client.get("/health")
    print(f"[*] Status Code: {res_health.status_code}")
    data_health = res_health.json()
    assert res_health.status_code == 200, f"Expected 200, got {res_health.status_code}"
    assert data_health["status"] == "ok"
    assert data_health["model"]["loaded"] is True
    assert data_health["model"]["architecture"] == "Ultralytics YOLO26"
    print(f"[+] Health verified: Model loaded={data_health['model']['loaded']}, Path={data_health['model']['model_path']}")

    # TEST 2: Valid Image Upload to POST /predict
    print("\n[TEST 2] Testing POST /predict with valid JPEG image...")
    img_bytes = generate_test_image_bytes()
    files = {"file": ("test_road.jpg", img_bytes, "image/jpeg")}
    res_predict = client.post("/predict", files=files)
    print(f"[*] Status Code: {res_predict.status_code}")
    data_predict = res_predict.json()
    assert res_predict.status_code == 200, f"Expected 200, got {res_predict.status_code}"
    assert data_predict["success"] is True
    assert "issue" in data_predict
    assert "confidence" in data_predict
    assert "detections" in data_predict
    assert "model_info" in data_predict
    print(f"[+] Predict verified: Success={data_predict['success']}, Issue={data_predict['issue']}, Detections={len(data_predict['detections'])}")

    # TEST 3: Invalid File Extension (e.g. .txt)
    print("\n[TEST 3] Testing POST /predict with non-image file (.txt)...")
    bad_file = {"file": ("document.txt", b"This is plain text.", "text/plain")}
    res_bad_ext = client.post("/predict", files=bad_file)
    print(f"[*] Status Code: {res_bad_ext.status_code}")
    assert res_bad_ext.status_code == 400, f"Expected 400, got {res_bad_ext.status_code}"
    print(f"[+] Expected 400 Bad Request caught: {res_bad_ext.json()['detail']}")

    # TEST 4: Empty File (0 Bytes)
    print("\n[TEST 4] Testing POST /predict with empty image file (0 bytes)...")
    empty_file = {"file": ("empty.jpg", b"", "image/jpeg")}
    res_empty = client.post("/predict", files=empty_file)
    print(f"[*] Status Code: {res_empty.status_code}")
    assert res_empty.status_code == 400, f"Expected 400, got {res_empty.status_code}"
    print(f"[+] Expected 400 Bad Request caught: {res_empty.json()['detail']}")

    # TEST 5: Corrupt Image Data
    print("\n[TEST 5] Testing POST /predict with corrupt image data...")
    corrupt_bytes = b"\xFF\xD8\xFF\xE0RandomJunkNotAValidJPEGFileContents"
    corrupt_file = {"file": ("corrupt.jpg", corrupt_bytes, "image/jpeg")}
    res_corrupt = client.post("/predict", files=corrupt_file)
    print(f"[*] Status Code: {res_corrupt.status_code}")
    assert res_corrupt.status_code == 422, f"Expected 422, got {res_corrupt.status_code}"
    print(f"[+] Expected 422 Unprocessable Entity caught: {res_corrupt.json()['detail']}")

    # TEST 6: Missing File Payload
    print("\n[TEST 6] Testing POST /predict with missing file payload...")
    res_missing = client.post("/predict")
    print(f"[*] Status Code: {res_missing.status_code}")
    assert res_missing.status_code == 422, f"Expected 422, got {res_missing.status_code}"
    print(f"[+] Expected 422 Validation Error caught for missing file.")

    print("\n" + "=" * 60)
    print(">>> ALL 6 FASTAPI ML SERVICE TESTS PASSED SUCCESSFULLY! <<<")
    print("=" * 60)

if __name__ == "__main__":
    run_api_tests()
