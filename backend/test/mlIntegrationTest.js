import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { predictCivicIssue, checkMlHealth, MLServiceError } from '../src/services/mlService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runAllTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 5: EXPRESS <-> FASTAPI ML INTEGRATION TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);
  console.log(`Target ML Service:  ${process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000'}`);

  let passed = 0;
  let failed = 0;

  // ------------------------------------------------------------------------
  // TEST 1: Express API Health & Database Check
  // ------------------------------------------------------------------------
  formatStep(1, 'Testing GET /api/health (Express & Database Health)...');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Database Status: ${data.database?.status}, Ping: ${data.database?.ping}`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (data.status !== 'ok') throw new Error(`Health status expected 'ok', got ${data.status}`);
    if (!data.database?.connected) throw new Error('Database is not reported as connected');

    console.log('[+] PASS: Express API & MongoDB health check passed.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 2: Express ML Health Proxy Check (GET /api/ml/health)
  // ------------------------------------------------------------------------
  formatStep(2, 'Testing GET /api/ml/health (ML Service Proxy via Express)...');
  try {
    const res = await fetch(`${BASE_URL}/ml/health`);
    const data = await res.json();
    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Online: ${data.online}, Model Loaded: ${data.modelLoaded}`);
    console.log(`[*] Architecture: ${data.architecture}, Variant: ${data.modelVariant}`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (!data.online) throw new Error('ML Service reported offline via Express proxy');
    if (!data.modelLoaded) throw new Error('YOLO26 model reported not loaded');

    console.log('[+] PASS: Express correctly proxies FastAPI ML status without direct frontend calls.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 3: Valid Image Upload to POST /api/predict
  // ------------------------------------------------------------------------
  formatStep(3, 'Testing POST /api/predict with valid image (sample_road.jpg)...');
  try {
    const filePath = path.join(FIXTURES_DIR, 'sample_road.jpg');
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'sample_road.jpg');

    const res = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Success: ${data.success}`);
    console.log(`[*] Prediction: Issue="${data.prediction?.issue}", Confidence=${data.prediction?.confidence}`);
    console.log(`[*] Detections Count: ${data.prediction?.detections?.length}`);
    console.log(`[*] Processing Time: ${data.meta?.durationMs}ms`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${data.message}`);
    if (!data.success) throw new Error('Prediction response marked unsuccessful');
    if (!data.prediction || typeof data.prediction.confidence !== 'number') {
      throw new Error('Malformed prediction payload');
    }
    // Verify no internal local file paths leaked
    if (JSON.stringify(data).includes('C:\\') || JSON.stringify(data).includes('/home/')) {
      throw new Error('Internal server file paths leaked in response payload');
    }

    console.log('[+] PASS: Valid image processed end-to-end through Express -> FastAPI -> YOLO26.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 4: No-Detection Response with Neutral Image (sample_neutral.jpg)
  // ------------------------------------------------------------------------
  formatStep(4, 'Testing POST /api/predict with neutral image (no civic issues)...');
  try {
    const filePath = path.join(FIXTURES_DIR, 'sample_neutral.jpg');
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'sample_neutral.jpg');

    const res = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Result: Issue="${data.prediction?.issue}", Confidence=${data.prediction?.confidence}`);
    console.log(`[*] Detections: ${JSON.stringify(data.prediction?.detections)}`);

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    if (data.prediction?.issue !== 'none') {
      console.log(`[*] Notice: Model classified neutral image as '${data.prediction?.issue}'`);
    }
    if (data.prediction?.issue === 'none' && data.prediction?.detections?.length !== 0) {
      throw new Error('Expected 0 detections for "none" issue');
    }

    console.log('[+] PASS: No-detection / baseline inference handled cleanly.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 5: Invalid File Type (.txt) to POST /api/predict
  // ------------------------------------------------------------------------
  formatStep(5, 'Testing POST /api/predict with invalid file type (invalid_doc.txt)...');
  try {
    const filePath = path.join(FIXTURES_DIR, 'invalid_doc.txt');
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'text/plain' });
    formData.append('image', blob, 'invalid_doc.txt');

    const res = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Error Response: ${data.message} (Code: ${data.error})`);

    if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    if (data.success !== false) throw new Error('Expected success=false');

    console.log('[+] PASS: Invalid file type rejected at Express middleware level.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 6: Missing Image Payload
  // ------------------------------------------------------------------------
  formatStep(6, 'Testing POST /api/predict with missing image payload...');
  try {
    const formData = new FormData();
    formData.append('confidence', '0.60');

    const res = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Error Response: ${data.message} (Code: ${data.error})`);

    if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    if (data.error !== 'MISSING_IMAGE') throw new Error(`Expected error MISSING_IMAGE, got ${data.error}`);

    console.log('[+] PASS: Missing image detected and rejected with 400 Bad Request.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 7: Invalid Confidence Threshold Parameter
  // ------------------------------------------------------------------------
  formatStep(7, 'Testing POST /api/predict with invalid confidence parameter (confidence=2.5)...');
  try {
    const filePath = path.join(FIXTURES_DIR, 'sample_road.jpg');
    const fileBuffer = fs.readFileSync(filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    formData.append('image', blob, 'sample_road.jpg');
    formData.append('confidence', '2.5'); // Invalid (> 1.0)

    const res = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    console.log(`[*] Status Code: ${res.status}`);
    console.log(`[*] Error Response: ${data.message}`);

    if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    if (data.error !== 'INVALID_CONFIDENCE_PARAM') {
      throw new Error(`Expected INVALID_CONFIDENCE_PARAM, got ${data.error}`);
    }

    console.log('[+] PASS: Invalid confidence parameter rejected with 400 Bad Request.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 8: FastAPI Unavailable / Offline Graceful Handling
  // ------------------------------------------------------------------------
  formatStep(8, 'Testing ML Service unavailable graceful handling (503 Service Unavailable)...');
  try {
    const dummyBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_road.jpg'));

    // Test predictCivicIssue pointing to an unreachable port (e.g. 59999)
    const originalUrl = process.env.ML_SERVICE_URL;
    let caught503 = false;
    try {
      // Temporarily override target URL by simulating request to non-existent endpoint
      process.env.ML_SERVICE_URL = 'http://127.0.0.1:59999';
      await predictCivicIssue(dummyBuffer, 'road.jpg', 'image/jpeg', null, 1000);
    } catch (err) {
      if (err instanceof MLServiceError && err.statusCode === 503) {
        caught503 = true;
        console.log(`[*] Caught expected MLServiceError: ${err.message} (HTTP ${err.statusCode})`);
      } else {
        throw err;
      }
    } finally {
      if (originalUrl !== undefined) {
        process.env.ML_SERVICE_URL = originalUrl;
      } else {
        delete process.env.ML_SERVICE_URL;
      }
    }

    if (!caught503) throw new Error('Failed to raise 503 when ML service is offline');

    console.log('[+] PASS: Offline ML service gracefully handled without crash (HTTP 503).');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 9: FastAPI Timeout Graceful Handling (504 Gateway Timeout)
  // ------------------------------------------------------------------------
  formatStep(9, 'Testing ML Service timeout handling (504 Gateway Timeout)...');
  try {
    const dummyBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_road.jpg'));

    let caught504 = false;
    try {
      // Call with 1 millisecond timeout to guarantee abort/timeout
      await predictCivicIssue(dummyBuffer, 'road.jpg', 'image/jpeg', null, 1);
    } catch (err) {
      if (err instanceof MLServiceError && err.statusCode === 504) {
        caught504 = true;
        console.log(`[*] Caught expected timeout MLServiceError: ${err.message} (HTTP ${err.statusCode})`);
      } else {
        throw err;
      }
    }

    if (!caught504) throw new Error('Failed to raise 504 on ML service timeout');

    console.log('[+] PASS: Timeout gracefully handled with HTTP 504 Gateway Timeout.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  }

  // ------------------------------------------------------------------------
  // TEST 10: Phase 1-4 Database Regression Verification
  // ------------------------------------------------------------------------
  formatStep(10, 'Verifying MongoDB Database Connection & Schema Health...');
  try {
    const connected = await connectDB();
    if (!connected) throw new Error('Could not connect to MongoDB');

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`[*] Active MongoDB Collections: ${collections.map((c) => c.name).join(', ')}`);

    console.log('[+] PASS: MongoDB database connection remains healthy and operational.');
    passed++;
  } catch (err) {
    console.error(`[-] FAIL: ${err.message}`);
    failed++;
  } finally {
    await mongoose.disconnect();
  }

  // ------------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (Total ${passed + failed})`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runAllTests();
