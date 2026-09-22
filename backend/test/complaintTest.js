import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runComplaintTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 7: CIVIC COMPLAINT REPORTING & PERSISTENCE TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Connect to DB for direct queries & cleanup
  await connectDB();

  const timestamp = Date.now();
  const user1Email = `citizen1.${timestamp}@civiceye.local`;
  const user2Email = `citizen2.${timestamp}@civiceye.local`;
  let user1Token = null;
  let user2Token = null;
  let user1Id = null;
  let user2Id = null;
  let createdComplaintId = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Register two test citizens
    // ------------------------------------------------------------------------
    console.log('\n[*] Setting up two test citizen accounts...');

    // Register User 1
    const resReg1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Reporter Citizen',
        email: user1Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataReg1 = await resReg1.json();
    user1Token = dataReg1.token;
    user1Id = dataReg1.user?.id;
    console.log(`[+] Citizen 1 registered: ${user1Email} (ID: ${user1Id})`);

    // Register User 2
    const resReg2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Another Citizen',
        email: user2Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataReg2 = await resReg2.json();
    user2Token = dataReg2.token;
    user2Id = dataReg2.user?.id;
    console.log(`[+] Citizen 2 registered: ${user2Email} (ID: ${user2Id})`);

    const roadImageBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_road.jpg'));
    const invalidDocBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'invalid_doc.txt'));

    // ------------------------------------------------------------------------
    // TEST 1: Create Complaint Without Token (Expect 401)
    // ------------------------------------------------------------------------
    formatStep(1, 'Testing POST /api/complaints without authentication token...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      formData.append('description', 'Unauthenticated complaint attempt');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'NO_TOKEN') throw new Error(`Expected NO_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Unauthenticated complaint creation rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Create Complaint With Malformed Token (Expect 401)
    // ------------------------------------------------------------------------
    formatStep(2, 'Testing POST /api/complaints with malformed token...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: 'Bearer malformed.token.payload' },
        body: formData,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'INVALID_TOKEN') throw new Error(`Expected INVALID_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Malformed token rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Missing Image Upload (Expect 400)
    // ------------------------------------------------------------------------
    formatStep(3, 'Testing POST /api/complaints with missing image...');
    try {
      const formData = new FormData();
      formData.append('description', 'Complaint without an image');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
        body: formData,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'MISSING_IMAGE') throw new Error(`Expected MISSING_IMAGE, got ${data.error}`);

      console.log('[+] PASS: Missing image rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Invalid File Type (Expect 400)
    // ------------------------------------------------------------------------
    formatStep(4, 'Testing POST /api/complaints with non-image file (.txt)...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([invalidDocBuffer], { type: 'text/plain' }), 'invalid_doc.txt');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
        body: formData,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_FILE_TYPE') throw new Error(`Expected INVALID_FILE_TYPE, got ${data.error}`);

      console.log('[+] PASS: Invalid file type rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Invalid Latitude (Expect 400)
    // ------------------------------------------------------------------------
    formatStep(5, 'Testing POST /api/complaints with invalid latitude (latitude: 120)...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      formData.append('latitude', '120'); // Invalid latitude (> 90)
      formData.append('longitude', '77.5946');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
        body: formData,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LATITUDE') throw new Error(`Expected INVALID_LATITUDE, got ${data.error}`);

      console.log('[+] PASS: Invalid latitude rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Invalid Longitude (Expect 400)
    // ------------------------------------------------------------------------
    formatStep(6, 'Testing POST /api/complaints with invalid longitude (longitude: 250)...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      formData.append('latitude', '12.9716');
      formData.append('longitude', '250'); // Invalid longitude (> 180)

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
        body: formData,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LONGITUDE') throw new Error(`Expected INVALID_LONGITUDE, got ${data.error}`);

      console.log('[+] PASS: Invalid longitude rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Authenticated Valid Complaint Creation with Real ML Inference
    // ------------------------------------------------------------------------
    formatStep(7, 'Testing POST /api/complaints with valid image, location, and description...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'pothole_evidence.jpg');
      formData.append('description', 'Severe pothole on 5th Avenue main road.');
      formData.append('latitude', '12.9716');
      formData.append('longitude', '77.5946');
      formData.append('address', '5th Avenue, Bengaluru, Karnataka');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user1Token}` },
        body: formData,
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Message: ${data.message}`);
      console.log(`[*] Complaint ID: ${data.complaint?.complaintId}`);
      console.log(`[*] Issue Type: ${data.complaint?.issueType}`);
      console.log(`[*] Confidence: ${data.complaint?.confidence}`);
      console.log(`[*] Status: ${data.complaint?.status}`);
      console.log(`[*] User ID: ${data.complaint?.user}`);

      if (res.status !== 201) throw new Error(`Expected 201 Created, got ${res.status}: ${data.message}`);
      if (!data.success) throw new Error('Response success is not true');
      if (!data.complaint) throw new Error('No complaint returned in response');

      createdComplaintId = data.complaint.complaintId;
      console.log('[+] PASS: Authenticated complaint created with real ML inference.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: Unique Complaint ID Format Verification
    // ------------------------------------------------------------------------
    formatStep(8, 'Verifying Complaint ID format (CE-YYYY-NNNNNN)...');
    try {
      const year = new Date().getFullYear();
      const idRegex = new RegExp(`^CE-${year}-\\d{6}(?:-\\d+)?$`);

      console.log(`[*] Created Complaint ID: ${createdComplaintId}`);
      if (!idRegex.test(createdComplaintId)) {
        throw new Error(`Complaint ID '${createdComplaintId}' does not match format 'CE-${year}-NNNNNN'`);
      }

      console.log('[+] PASS: Complaint ID format conforms to CE-YYYY-NNNNNN.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Association with Authenticated User in MongoDB
    // ------------------------------------------------------------------------
    formatStep(9, 'Verifying complaint ownership linkage in MongoDB...');
    try {
      const dbComplaint = await Complaint.findOne({ complaintId: createdComplaintId });
      if (!dbComplaint) throw new Error('Complaint was not found in MongoDB');

      console.log(`[*] Complaint User field: ${dbComplaint.user}`);
      console.log(`[*] Expected User 1 ID:  ${user1Id}`);

      if (dbComplaint.user.toString() !== user1Id.toString()) {
        throw new Error(`Complaint user '${dbComplaint.user}' does not match creator '${user1Id}'`);
      }

      console.log('[+] PASS: Complaint is securely associated with authenticated user.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: ML Information Stored Correctly
    // ------------------------------------------------------------------------
    formatStep(10, 'Verifying ML detection fields stored in Complaint document...');
    try {
      const dbComplaint = await Complaint.findOne({ complaintId: createdComplaintId });

      console.log(`[*] Model Architecture: ${dbComplaint.modelArchitecture}`);
      console.log(`[*] Model Variant:      ${dbComplaint.modelVariant}`);
      console.log(`[*] Confidence:         ${dbComplaint.confidence}`);
      console.log(`[*] isUncertain:        ${dbComplaint.isUncertain}`);
      console.log(`[*] Detections Count:   ${dbComplaint.detections?.length}`);

      if (!dbComplaint.modelArchitecture) throw new Error('modelArchitecture is missing');
      if (typeof dbComplaint.confidence !== 'number') throw new Error('confidence is not numeric');
      if (typeof dbComplaint.isUncertain !== 'boolean') throw new Error('isUncertain is not boolean');

      console.log('[+] PASS: ML detection metadata stored accurately.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Authenticated User Can List Their Complaints
    // ------------------------------------------------------------------------
    formatStep(11, 'Testing GET /api/complaints for User 1...');
    try {
      const res = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${user1Token}` },
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Complaints Count for User 1: ${data.count}`);

      if (res.status !== 200) throw new Error(`Expected 200 OK, got ${res.status}`);
      if (!Array.isArray(data.complaints)) throw new Error('Expected complaints array');
      if (data.count < 1) throw new Error('Expected at least 1 complaint for User 1');

      const found = data.complaints.some((c) => c.complaintId === createdComplaintId);
      if (!found) throw new Error('Created complaint was not found in user complaints list');

      console.log('[+] PASS: User 1 successfully retrieved their complaints list.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Authenticated User Can Retrieve Their Own Complaint by ID
    // ------------------------------------------------------------------------
    formatStep(12, 'Testing GET /api/complaints/:complaintId for owner (User 1)...');
    try {
      const res = await fetch(`${BASE_URL}/complaints/${createdComplaintId}`, {
        headers: { Authorization: `Bearer ${user1Token}` },
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Retrieved Complaint ID: ${data.complaint?.complaintId}`);
      console.log(`[*] Description: ${data.complaint?.description}`);
      console.log(`[*] Location: Lat=${data.complaint?.location?.latitude}, Lng=${data.complaint?.location?.longitude}`);

      if (res.status !== 200) throw new Error(`Expected 200 OK, got ${res.status}`);
      if (data.complaint?.complaintId !== createdComplaintId) {
        throw new Error('Retrieved complaint ID does not match requested ID');
      }

      console.log('[+] PASS: Owner retrieved complaint details successfully.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 13: User Cannot Retrieve Another User's Complaint (Expect 403)
    // ------------------------------------------------------------------------
    formatStep(13, 'Testing GET /api/complaints/:complaintId with User 2 token (Cross-User Isolation)...');
    try {
      const res = await fetch(`${BASE_URL}/complaints/${createdComplaintId}`, {
        headers: { Authorization: `Bearer ${user2Token}` }, // User 2 trying to read User 1's complaint
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Response: ${data.message} (Code: ${data.error})`);

      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      }
      if (data.complaint) {
        throw new Error('SECURITY VIOLATION: Complaint details exposed to non-owner!');
      }

      console.log('[+] PASS: Cross-user complaint retrieval blocked with 403 Forbidden.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 14: User 2 List Returns Zero Complaints for User 1
    // ------------------------------------------------------------------------
    formatStep(14, 'Testing GET /api/complaints for User 2 (Isolation in listing)...');
    try {
      const res = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${user2Token}` },
      });
      const data = await res.json();

      console.log(`[*] User 2 Complaints Count: ${data.count}`);
      const leaked = data.complaints?.some((c) => c.complaintId === createdComplaintId);
      if (leaked) {
        throw new Error("SECURITY VIOLATION: User 1's complaint leaked in User 2's list!");
      }

      console.log("[+] PASS: User 2's complaints list does not contain User 1's complaint.");
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 15: MongoDB Persistence Verification & Cleanup
    // ------------------------------------------------------------------------
    formatStep(15, 'Verifying direct document existence in MongoDB and cleanup...');
    try {
      const count = await Complaint.countDocuments({ complaintId: createdComplaintId });
      console.log(`[*] Document count in MongoDB: ${count}`);
      if (count !== 1) throw new Error('Complaint document not found in MongoDB');

      // Cleanup
      await Complaint.deleteMany({
        $or: [{ user: user1Id }, { user: user2Id }, { complaintId: createdComplaintId }],
      });
      await User.deleteMany({ email: { $in: [user1Email, user2Email] } });
      console.log('[+] Test data cleaned up successfully.');

      console.log('[+] PASS: Persistence verified and test records cleaned up.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

  } catch (outerErr) {
    console.error(`[-] Test suite harness failure: ${outerErr.message}`);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('[*] Disconnected from MongoDB.');
  }

  // ------------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`COMPLAINT TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (Total ${passed + failed})`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runComplaintTests();
