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

const runLocationTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 9: MAPS, GEOLOCATION & LOCATION TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Connect to MongoDB for direct query verification and cleanup
  await connectDB();

  const timestamp = Date.now();
  const citizen1Email = `citizen1.loc.${timestamp}@civiceye.local`;
  const citizen2Email = `citizen2.loc.${timestamp}@civiceye.local`;
  const adminEmail = `admin.loc.${timestamp}@civiceye.local`;

  let citizen1Token = null;
  let citizen2Token = null;
  let adminToken = null;
  let citizen1Id = null;
  let citizen2Id = null;
  let adminId = null;
  let createdComplaintId = null;
  const createdComplaintIds = [];

  try {
    // ------------------------------------------------------------------------
    // SETUP: Create test accounts and load image fixture
    // ------------------------------------------------------------------------
    console.log('\n[*] Registering test citizens and municipal admin...');

    // 1. Citizen 1
    const resReg1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Location Citizen One',
        email: citizen1Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataReg1 = await resReg1.json();
    citizen1Token = dataReg1.token;
    citizen1Id = dataReg1.user?.id || dataReg1.user?._id;
    console.log(`[+] Citizen 1: ${citizen1Email} (Token acquired)`);

    // 2. Citizen 2
    const resReg2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Location Citizen Two',
        email: citizen2Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataReg2 = await resReg2.json();
    citizen2Token = dataReg2.token;
    citizen2Id = dataReg2.user?.id || dataReg2.user?._id;
    console.log(`[+] Citizen 2: ${citizen2Email} (Token acquired)`);

    // 3. Municipal Admin
    const resAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Location Admin Officer',
        email: adminEmail,
        password: 'Password123!',
        role: 'ADMIN',
      }),
    });
    const dataAdmin = await resAdmin.json();
    adminToken = dataAdmin.token;
    adminId = dataAdmin.user?.id || dataAdmin.user?._id;
    console.log(`[+] Municipal Admin: ${adminEmail} (Token acquired)`);

    const roadImageBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_road.jpg'));

    // ------------------------------------------------------------------------
    // TEST 1: Unauthenticated Complaint Request -> 401
    // ------------------------------------------------------------------------
    formatStep(1, 'Testing POST /api/complaints without authentication token -> Expect 401');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Unauthenticated location submission');
      form.append('latitude', '16.5062');
      form.append('longitude', '80.6480');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'NO_TOKEN') throw new Error(`Expected error NO_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Unauthenticated request rejected with 401 NO_TOKEN.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Authenticated user can retrieve own complaints
    // ------------------------------------------------------------------------
    formatStep(2, 'Testing GET /api/complaints with citizen token -> Expect 200 array');
    try {
      const res = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(data.complaints)) throw new Error('Response complaints is not an array');

      console.log(`[+] PASS: Retrieved ${data.complaints.length} complaints for authenticated citizen.`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Complaint with valid latitude -> accepted (201)
    // ------------------------------------------------------------------------
    formatStep(3, 'Submitting complaint with valid coordinates -> Expect 201 Created');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Pothole on Main Boulevard with valid latitude');
      form.append('latitude', '16.506200');
      form.append('longitude', '80.648000');
      form.append('address', 'MG Road Cross 4, Vijayawada');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${data.message}`);
      if (!data.complaint) throw new Error('Missing complaint in response');
      if (data.complaint.latitude !== 16.5062) throw new Error(`Latitude mismatch: ${data.complaint.latitude}`);
      if (data.complaint.longitude !== 80.648) throw new Error(`Longitude mismatch: ${data.complaint.longitude}`);

      createdComplaintId = data.complaint.complaintId;
      createdComplaintIds.push(createdComplaintId);

      console.log(`[+] Complaint filed: ${createdComplaintId}`);
      console.log(`[+] Latitude: ${data.complaint.latitude}, Longitude: ${data.complaint.longitude}`);
      console.log('[+] PASS: Complaint with valid coordinates accepted.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Complaint with valid negative / international coordinates -> accepted (201)
    // ------------------------------------------------------------------------
    formatStep(4, 'Submitting complaint with negative coordinates -> Expect 201 Created');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road2.jpg');
      form.append('description', 'Southern hemisphere location test');
      form.append('latitude', '-33.8688');
      form.append('longitude', '151.2093');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${data.message}`);
      if (data.complaint.latitude !== -33.8688) throw new Error(`Latitude mismatch: ${data.complaint.latitude}`);
      if (data.complaint.longitude !== 151.2093) throw new Error(`Longitude mismatch: ${data.complaint.longitude}`);

      createdComplaintIds.push(data.complaint.complaintId);
      console.log('[+] PASS: Complaint with negative coordinates accepted.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Latitude > 90 -> rejected with 400
    // ------------------------------------------------------------------------
    formatStep(5, 'Submitting latitude > 90 (e.g. 90.0001) -> Expect 400 INVALID_LATITUDE');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Out of bounds latitude test');
      form.append('latitude', '90.0001');
      form.append('longitude', '80.0000');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LATITUDE') throw new Error(`Expected INVALID_LATITUDE, got ${data.error}`);

      console.log('[+] PASS: Latitude > 90 rejected with 400 INVALID_LATITUDE.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Latitude < -90 -> rejected with 400
    // ------------------------------------------------------------------------
    formatStep(6, 'Submitting latitude < -90 (e.g. -91.5) -> Expect 400 INVALID_LATITUDE');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Negative out of bounds latitude test');
      form.append('latitude', '-91.5');
      form.append('longitude', '80.0000');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LATITUDE') throw new Error(`Expected INVALID_LATITUDE, got ${data.error}`);

      console.log('[+] PASS: Latitude < -90 rejected with 400 INVALID_LATITUDE.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Longitude > 180 -> rejected with 400
    // ------------------------------------------------------------------------
    formatStep(7, 'Submitting longitude > 180 (e.g. 180.001) -> Expect 400 INVALID_LONGITUDE');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Out of bounds longitude test');
      form.append('latitude', '16.0000');
      form.append('longitude', '180.001');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LONGITUDE') throw new Error(`Expected INVALID_LONGITUDE, got ${data.error}`);

      console.log('[+] PASS: Longitude > 180 rejected with 400 INVALID_LONGITUDE.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: Longitude < -180 -> rejected with 400
    // ------------------------------------------------------------------------
    formatStep(8, 'Submitting longitude < -180 (e.g. -185) -> Expect 400 INVALID_LONGITUDE');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Negative out of bounds longitude test');
      form.append('latitude', '16.0000');
      form.append('longitude', '-185.0');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LONGITUDE') throw new Error(`Expected INVALID_LONGITUDE, got ${data.error}`);

      console.log('[+] PASS: Longitude < -180 rejected with 400 INVALID_LONGITUDE.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Non-numeric latitude -> rejected with 400
    // ------------------------------------------------------------------------
    formatStep(9, 'Submitting non-numeric latitude (e.g. "invalid_lat") -> Expect 400 INVALID_LATITUDE');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'String latitude test');
      form.append('latitude', 'invalid_lat');
      form.append('longitude', '80.0000');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LATITUDE') throw new Error(`Expected INVALID_LATITUDE, got ${data.error}`);

      console.log('[+] PASS: Non-numeric latitude safely rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: Non-numeric longitude -> rejected with 400
    // ------------------------------------------------------------------------
    formatStep(10, 'Submitting non-numeric longitude (e.g. "not_a_coord") -> Expect 400 INVALID_LONGITUDE');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'String longitude test');
      form.append('latitude', '16.5062');
      form.append('longitude', 'not_a_coord');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: form,
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_LONGITUDE') throw new Error(`Expected INVALID_LONGITUDE, got ${data.error}`);

      console.log('[+] PASS: Non-numeric longitude safely rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Admin can retrieve complaints with location
    // ------------------------------------------------------------------------
    formatStep(11, 'Testing GET /api/admin/complaints with Admin token -> Expect location fields');
    try {
      const res = await fetch(`${BASE_URL}/admin/complaints`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!Array.isArray(data.complaints)) throw new Error('Response complaints is not an array');

      const matching = data.complaints.find((c) => c.complaintId === createdComplaintId);
      if (!matching) throw new Error(`Created complaint ${createdComplaintId} not found in admin complaints`);
      if (matching.latitude !== 16.5062 || matching.longitude !== 80.648) {
        throw new Error('Location coordinates missing or mismatched in admin response');
      }

      console.log(`[+] Admin received complaint ${matching.complaintId} with coordinates: [${matching.latitude}, ${matching.longitude}]`);
      console.log('[+] PASS: Admin retrieved complaints with full location metadata.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Normal user cannot access admin complaint endpoint -> 403
    // ------------------------------------------------------------------------
    formatStep(12, 'Testing GET /api/admin/complaints with Citizen token -> Expect 403 Forbidden');
    try {
      const res = await fetch(`${BASE_URL}/admin/complaints`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}, Error: ${data.error}`);

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (data.error !== 'FORBIDDEN_ADMIN_REQUIRED') {
        throw new Error(`Expected FORBIDDEN_ADMIN_REQUIRED, got ${data.error}`);
      }

      console.log('[+] PASS: Citizen strictly forbidden from admin complaints endpoint.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 13: Complaint coordinates persist in MongoDB accurately
    // ------------------------------------------------------------------------
    formatStep(13, 'Verifying location persistence in MongoDB document...');
    try {
      const doc = await Complaint.findOne({ complaintId: createdComplaintId });
      if (!doc) throw new Error(`Complaint ${createdComplaintId} not found in database`);

      console.log(`[*] MongoDB Document direct latitude: ${doc.latitude}, longitude: ${doc.longitude}`);
      console.log(`[*] MongoDB location subdocument: ${JSON.stringify(doc.location)}`);

      if (doc.latitude !== 16.5062 || doc.longitude !== 80.648) {
        throw new Error('Direct coordinate fields in MongoDB do not match submitted values');
      }
      if (doc.location.latitude !== 16.5062 || doc.location.longitude !== 80.648) {
        throw new Error('Location subdocument coordinates in MongoDB do not match submitted values');
      }
      if (doc.location.address !== 'MG Road Cross 4, Vijayawada') {
        throw new Error('Location address in MongoDB does not match submitted value');
      }

      console.log('[+] PASS: Coordinates and address persist accurately in MongoDB.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 14: Existing complaint ownership isolation still works
    // ------------------------------------------------------------------------
    formatStep(14, 'Verifying citizen complaint isolation (Citizen 2 cannot see Citizen 1 complaint)...');
    try {
      const res = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data = await res.json();
      console.log(`[*] Citizen 2 complaints count: ${data.complaints.length}`);

      const foundOtherUserComplaint = data.complaints.some((c) => c.complaintId === createdComplaintId);
      if (foundOtherUserComplaint) {
        throw new Error('Data leak: Citizen 2 received Citizen 1 complaint!');
      }

      console.log("[+] PASS: Ownership isolation verified: Citizen 2's list does not include Citizen 1's report.");
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 15: Existing complaint creation still works with YOLO26 ML inference
    // ------------------------------------------------------------------------
    formatStep(15, 'Verifying complete complaint creation pipeline with YOLO26 ML inference...');
    try {
      const form = new FormData();
      form.append('image', new Blob([roadImageBuffer], { type: 'image/jpeg' }), 'road.jpg');
      form.append('description', 'Pothole detection verification');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen2Token}` },
        body: form,
      });
      const data = await res.json();

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${data.message}`);
      if (!data.complaint?.complaintId) throw new Error('Missing complaintId in created record');
      if (data.complaint.confidence === undefined || data.complaint.confidence === null) {
        throw new Error('ML confidence missing from created complaint');
      }

      createdComplaintIds.push(data.complaint.complaintId);
      console.log(`[+] Created: ${data.complaint.complaintId}, ML Issue: ${data.complaint.issueType}, Conf: ${(data.complaint.confidence * 100).toFixed(1)}%`);
      console.log('[+] PASS: Complaint creation pipeline with YOLO26 inference operates normally.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // CLEANUP: Clean up test accounts and complaints
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test database records...');
    await Complaint.deleteMany({ complaintId: { $in: createdComplaintIds } });
    await User.deleteMany({ email: { $in: [citizen1Email, citizen2Email, adminEmail] } });
    console.log(`[+] Removed ${createdComplaintIds.length} test complaint(s) and 3 test user(s).`);

  } catch (outerErr) {
    console.error(`[-] Location test harness error: ${outerErr.message}`);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('[*] Disconnected from MongoDB.');
  }

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`LOCATION TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runLocationTests();
