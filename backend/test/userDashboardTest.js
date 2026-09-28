import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';

dotenv.config();

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'civiceye_jwt_secret_key_2026_super_secure_key_civic_platform';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runUserDashboardTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 10: USER DASHBOARD & COMPLAINT HISTORY TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Connect to DB for direct queries & cleanup
  await connectDB();

  const timestamp = Date.now();
  const citizen1Email = `user1.dashboard.${timestamp}@civiceye.local`;
  const citizen2Email = `user2.dashboard.${timestamp}@civiceye.local`;
  const citizenEmptyEmail = `user.empty.${timestamp}@civiceye.local`;
  const adminEmail = `admin.dashboard.${timestamp}@civiceye.local`;

  let citizen1Token = null;
  let citizen2Token = null;
  let citizenEmptyToken = null;
  let adminToken = null;

  let citizen1User = null;
  let citizen2User = null;
  let citizenEmptyUser = null;
  let adminUser = null;

  const createdUserIds = [];
  const createdComplaintIds = [];

  let complaint1 = null;
  let complaint2 = null;
  let complaintUser2 = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Register test accounts
    // ------------------------------------------------------------------------
    console.log('\n[*] Registering test citizen accounts and admin...');

    // 1. Citizen 1 (with multiple complaints)
    const res1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Aarav Patel',
        email: citizen1Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const data1 = await res1.json();
    if (!res1.ok || !data1.token) throw new Error(`Failed to create citizen 1: ${JSON.stringify(data1)}`);
    citizen1Token = data1.token;
    citizen1User = data1.user;
    createdUserIds.push(citizen1User.id);
    console.log(`[+] Citizen 1 registered: ${citizen1Email} (ID: ${citizen1User.id})`);

    // 2. Citizen 2 (isolated citizen)
    const res2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Diya Sharma',
        email: citizen2Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const data2 = await res2.json();
    if (!res2.ok || !data2.token) throw new Error(`Failed to create citizen 2: ${JSON.stringify(data2)}`);
    citizen2Token = data2.token;
    citizen2User = data2.user;
    createdUserIds.push(citizen2User.id);
    console.log(`[+] Citizen 2 registered: ${citizen2Email} (ID: ${citizen2User.id})`);

    // 3. Citizen with Empty History
    const resEmpty = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rohan Mehra',
        email: citizenEmptyEmail,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataEmpty = await resEmpty.json();
    if (!resEmpty.ok || !dataEmpty.token) throw new Error(`Failed to create empty citizen: ${JSON.stringify(dataEmpty)}`);
    citizenEmptyToken = dataEmpty.token;
    citizenEmptyUser = dataEmpty.user;
    createdUserIds.push(citizenEmptyUser.id);
    console.log(`[+] Empty Citizen registered: ${citizenEmptyEmail} (ID: ${citizenEmptyUser.id})`);

    // 4. Admin Account
    const resAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dashboard Admin',
        email: adminEmail,
        password: 'AdminPassword123!',
        role: 'ADMIN',
      }),
    });
    const dataAdmin = await resAdmin.json();
    if (!resAdmin.ok || !dataAdmin.token) throw new Error(`Failed to create admin: ${JSON.stringify(dataAdmin)}`);
    adminToken = dataAdmin.token;
    adminUser = dataAdmin.user;
    createdUserIds.push(adminUser.id);
    console.log(`[+] Admin registered: ${adminEmail} (ID: ${adminUser.id})`);

    // ------------------------------------------------------------------------
    // SETUP: Seed test complaints into MongoDB
    // ------------------------------------------------------------------------
    console.log('\n[*] Seeding test complaints with controlled attributes...');

    // Complaint 1 for Citizen 1: Pothole, submitted, with location
    complaint1 = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-777001`,
      user: citizen1User.id,
      userId: citizen1User.id,
      issueType: 'pothole',
      description: 'Dangerous pothole on Sector 4 main avenue.',
      confidence: 0.89,
      isUncertain: false,
      status: 'submitted',
      location: { latitude: 19.076, longitude: 72.8777, address: 'Sector 4 Avenue, Mumbai' },
      latitude: 19.076,
      longitude: 72.8777,
      detections: [
        { class: 'pothole', confidence: 0.89, bbox: [120, 150, 320, 360] },
      ],
      image: {
        originalName: 'pothole_sector4.jpg',
        mimetype: 'image/jpeg',
        size: 154320,
        path: 'pothole_sector4.jpg',
      },
      imageUrl: 'pothole_sector4.jpg',
    });
    await complaint1.save();
    createdComplaintIds.push(complaint1._id);

    // Complaint 2 for Citizen 1: Leakage, in_progress, resolved status test
    complaint2 = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-777002`,
      user: citizen1User.id,
      userId: citizen1User.id,
      issueType: 'leakage',
      description: 'Major pipeline rupture flooding footpath.',
      confidence: 0.94,
      isUncertain: false,
      status: 'in_progress',
      location: { latitude: 19.082, longitude: 72.881, address: 'Footpath near Water Works' },
      latitude: 19.082,
      longitude: 72.881,
      detections: [
        { class: 'leakage', confidence: 0.94, bbox: [50, 60, 200, 250] },
      ],
      image: {
        originalName: 'water_leak.png',
        mimetype: 'image/png',
        size: 210400,
        path: 'water_leak.png',
      },
      imageUrl: 'water_leak.png',
    });
    await complaint2.save();
    createdComplaintIds.push(complaint2._id);

    // Complaint for Citizen 2: Garbage, rejected
    complaintUser2 = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-777003`,
      user: citizen2User.id,
      userId: citizen2User.id,
      issueType: 'garbage',
      description: 'Dumped trash pile in vacant lot.',
      confidence: 0.78,
      isUncertain: false,
      status: 'rejected',
      location: { latitude: 28.6139, longitude: 77.209, address: 'Lot 12, New Delhi' },
      latitude: 28.6139,
      longitude: 77.209,
      detections: [
        { class: 'garbage', confidence: 0.78, bbox: [80, 90, 260, 300] },
      ],
      image: {
        originalName: 'trash_lot.jpg',
        mimetype: 'image/jpeg',
        size: 98400,
        path: 'trash_lot.jpg',
      },
      imageUrl: 'trash_lot.jpg',
    });
    await complaintUser2.save();
    createdComplaintIds.push(complaintUser2._id);

    console.log('[+] Seeded 3 test complaints across Citizen 1 and Citizen 2.');

    // ------------------------------------------------------------------------
    // TEST 1: Authenticated citizen can retrieve their complaints
    // ------------------------------------------------------------------------
    formatStep(1, 'Testing GET /api/complaints for authenticated citizen...');
    try {
      const res = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, Count: ${data.count}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!data.success) throw new Error('Expected success: true');
      if (!Array.isArray(data.complaints)) throw new Error('Expected complaints to be an array');
      if (data.count !== 2) throw new Error(`Expected count 2, got ${data.count}`);

      console.log('[+] PASS: Authenticated citizen successfully retrieved complaints list.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Unauthenticated request is rejected (401 NO_TOKEN)
    // ------------------------------------------------------------------------
    formatStep(2, 'Testing GET /api/complaints without auth token...');
    try {
      const res = await fetch(`${BASE_URL}/complaints`);
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, Error: ${data.error}`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'NO_TOKEN') throw new Error(`Expected NO_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Unauthenticated request rejected with 401.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: User receives only their own complaints (user isolation)
    // ------------------------------------------------------------------------
    formatStep(3, 'Testing strict user data isolation between citizens...');
    try {
      // Citizen 1
      const res1 = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data1 = await res1.json();

      // Citizen 2
      const res2 = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data2 = await res2.json();

      console.log(`[*] Citizen 1 complaints: ${data1.count}, Citizen 2 complaints: ${data2.count}`);

      if (data1.count !== 2) throw new Error(`Citizen 1 should have 2 complaints, got ${data1.count}`);
      if (data2.count !== 1) throw new Error(`Citizen 2 should have 1 complaint, got ${data2.count}`);

      // Verify Citizen 1 did NOT receive Citizen 2's complaint
      const c1Ids = data1.complaints.map((c) => c.complaintId);
      const c2Ids = data2.complaints.map((c) => c.complaintId);

      if (c1Ids.includes(complaintUser2.complaintId)) {
        throw new Error(`Data leakage! Citizen 1 received Citizen 2's complaint: ${complaintUser2.complaintId}`);
      }
      if (c2Ids.includes(complaint1.complaintId) || c2Ids.includes(complaint2.complaintId)) {
        throw new Error(`Data leakage! Citizen 2 received Citizen 1's complaints.`);
      }

      console.log('[+] PASS: Complete user data isolation confirmed. No cross-user leakage.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: User cannot retrieve another user's complaint (403 FORBIDDEN)
    // ------------------------------------------------------------------------
    formatStep(4, 'Testing GET /api/complaints/:complaintId against another user\'s complaint...');
    try {
      // Citizen 2 attempts to view Citizen 1's complaint
      const res = await fetch(`${BASE_URL}/complaints/${complaint1.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, Error: ${data.error}`);

      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      if (data.error !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN, got ${data.error}`);

      console.log('[+] PASS: Ownership verification strictly enforced; unauthorized access blocked.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Invalid complaint ID returns 404
    // ------------------------------------------------------------------------
    formatStep(5, 'Testing GET /api/complaints/:complaintId with non-existent ID...');
    try {
      const nonExistentId = 'CE-2026-999999-DOESNOTEXIST';
      const res = await fetch(`${BASE_URL}/complaints/${nonExistentId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, Error: ${data.error}`);

      if (res.status !== 404) throw new Error(`Expected 404 Not Found, got ${res.status}`);
      if (data.error !== 'COMPLAINT_NOT_FOUND') throw new Error(`Expected COMPLAINT_NOT_FOUND, got ${data.error}`);

      console.log('[+] PASS: Non-existent complaint ID returns 404 COMPLAINT_NOT_FOUND.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Complaint details contain expected fields
    // ------------------------------------------------------------------------
    formatStep(6, 'Testing complaint details schema and field completeness...');
    try {
      const res = await fetch(`${BASE_URL}/complaints/${complaint1.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      const c = data.complaint;

      if (!c) throw new Error('Missing complaint in response');
      if (c.complaintId !== complaint1.complaintId) throw new Error(`Mismatched complaintId`);
      if (typeof c.description !== 'string') throw new Error('Missing or invalid description');
      if (typeof c.confidence !== 'number') throw new Error('Missing or invalid confidence');
      if (!c.status) throw new Error('Missing status');
      if (!c.createdAt) throw new Error('Missing createdAt');
      if (!c.updatedAt) throw new Error('Missing updatedAt');
      if (!c.issueType) throw new Error('Missing issueType');
      if (!Array.isArray(c.detections)) throw new Error('Missing detections array');

      console.log(`[*] Complaint ID: ${c.complaintId}`);
      console.log(`[*] Fields verified: complaintId, issueType, description, confidence, status, createdAt, detections`);
      console.log('[+] PASS: All expected fields present with correct data types.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Complaint status is returned correctly
    // ------------------------------------------------------------------------
    formatStep(7, 'Testing retrieval and verification of complaint lifecycle statuses...');
    try {
      // complaint1 is 'submitted'
      const res1 = await fetch(`${BASE_URL}/complaints/${complaint1.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data1 = await res1.json();
      if (data1.complaint?.status !== 'submitted') {
        throw new Error(`Expected status 'submitted', got '${data1.complaint?.status}'`);
      }

      // complaint2 is 'in_progress'
      const res2 = await fetch(`${BASE_URL}/complaints/${complaint2.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data2 = await res2.json();
      if (data2.complaint?.status !== 'in_progress') {
        throw new Error(`Expected status 'in_progress', got '${data2.complaint?.status}'`);
      }

      // complaintUser2 is 'rejected'
      const res3 = await fetch(`${BASE_URL}/complaints/${complaintUser2.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data3 = await res3.json();
      if (data3.complaint?.status !== 'rejected') {
        throw new Error(`Expected status 'rejected', got '${data3.complaint?.status}'`);
      }

      console.log(`[*] Verified statuses: submitted, in_progress, rejected`);
      console.log('[+] PASS: Complaint statuses accurately persisted and returned.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: Complaint issue type is returned correctly
    // ------------------------------------------------------------------------
    formatStep(8, 'Testing classification issue types (pothole, leakage, garbage)...');
    try {
      const res1 = await fetch(`${BASE_URL}/complaints/${complaint1.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data1 = await res1.json();
      if (data1.complaint?.issueType !== 'pothole') {
        throw new Error(`Expected 'pothole', got '${data1.complaint?.issueType}'`);
      }

      const res2 = await fetch(`${BASE_URL}/complaints/${complaint2.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data2 = await res2.json();
      if (data2.complaint?.issueType !== 'leakage') {
        throw new Error(`Expected 'leakage', got '${data2.complaint?.issueType}'`);
      }

      const res3 = await fetch(`${BASE_URL}/complaints/${complaintUser2.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data3 = await res3.json();
      if (data3.complaint?.issueType !== 'garbage') {
        throw new Error(`Expected 'garbage', got '${data3.complaint?.issueType}'`);
      }

      console.log('[+] PASS: Verified issueType correctly maps for pothole, leakage, and garbage.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Complaint location is returned correctly
    // ------------------------------------------------------------------------
    formatStep(9, 'Testing complaint location details (latitude, longitude, address)...');
    try {
      const res = await fetch(`${BASE_URL}/complaints/${complaint1.complaintId}`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      const c = data.complaint;

      if (c.latitude !== 19.076 || c.location?.latitude !== 19.076) {
        throw new Error(`Latitude mismatch: expected 19.076, got ${c.latitude}`);
      }
      if (c.longitude !== 72.8777 || c.location?.longitude !== 72.8777) {
        throw new Error(`Longitude mismatch: expected 72.8777, got ${c.longitude}`);
      }
      if (c.location?.address !== 'Sector 4 Avenue, Mumbai') {
        throw new Error(`Address mismatch: expected 'Sector 4 Avenue, Mumbai', got '${c.location?.address}'`);
      }

      console.log(`[*] Latitude: ${c.latitude}, Longitude: ${c.longitude}`);
      console.log(`[*] Address: ${c.location?.address}`);
      console.log('[+] PASS: Complaint location coordinates and address accurately returned.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: Empty complaint list is handled correctly
    // ------------------------------------------------------------------------
    formatStep(10, 'Testing dashboard response for citizen with no complaints...');
    try {
      const res = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${citizenEmptyToken}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, Count: ${data.count}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!data.success) throw new Error('Expected success: true');
      if (!Array.isArray(data.complaints)) throw new Error('Expected array');
      if (data.complaints.length !== 0 || data.count !== 0) {
        throw new Error(`Expected empty list with count 0, got length ${data.complaints.length}`);
      }

      console.log('[+] PASS: Empty history handled cleanly with 200 OK and count: 0.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Expired or malformed JWT is rejected (401)
    // ------------------------------------------------------------------------
    formatStep(11, 'Testing rejection of expired and malformed JWT tokens...');
    try {
      // 1. Malformed token
      const resMalformed = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: 'Bearer this.is.a.malformed.fake.token' },
      });
      const dataMalformed = await resMalformed.json();
      if (resMalformed.status !== 401 || dataMalformed.error !== 'INVALID_TOKEN') {
        throw new Error(`Expected 401 INVALID_TOKEN, got ${resMalformed.status} ${dataMalformed.error}`);
      }

      // 2. Expired token
      const expiredToken = jwt.sign(
        { id: citizen1User.id, role: 'USER' },
        JWT_SECRET,
        { expiresIn: '-10s' }
      );
      const resExpired = await fetch(`${BASE_URL}/complaints`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      const dataExpired = await resExpired.json();
      if (resExpired.status !== 401 || dataExpired.error !== 'TOKEN_EXPIRED') {
        throw new Error(`Expected 401 TOKEN_EXPIRED, got ${resExpired.status} ${dataExpired.error}`);
      }

      console.log('[+] PASS: Malformed and expired JWTs rejected with 401.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Admin access does not break existing admin functionality
    // ------------------------------------------------------------------------
    formatStep(12, 'Testing admin privilege verification & backward compatibility...');
    try {
      // Admin should be able to view any complaint via /api/complaints/:complaintId
      const res1 = await fetch(`${BASE_URL}/complaints/${complaint1.complaintId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data1 = await res1.json();
      if (res1.status !== 200 || data1.complaint?.complaintId !== complaint1.complaintId) {
        throw new Error(`Admin failed to inspect citizen complaint: ${res1.status}`);
      }

      // Admin statistics endpoint should function intact
      const resStats = await fetch(`${BASE_URL}/admin/statistics`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const dataStats = await resStats.json();
      if (resStats.status !== 200 || !dataStats.statistics) {
        throw new Error(`Admin statistics failed: ${resStats.status}`);
      }

      console.log(`[*] Admin successfully inspected citizen complaint ${complaint1.complaintId}`);
      console.log(`[*] Admin statistics: totalComplaints = ${dataStats.statistics.totalComplaints}`);
      console.log('[+] PASS: Admin access and municipal management fully preserved.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test database records...');
    try {
      if (createdComplaintIds.length > 0) {
        const cRes = await Complaint.deleteMany({ _id: { $in: createdComplaintIds } });
        console.log(`[+] Deleted ${cRes.deletedCount} test complaints.`);
      }
      if (createdUserIds.length > 0) {
        const uRes = await User.deleteMany({ _id: { $in: createdUserIds } });
        console.log(`[+] Deleted ${uRes.deletedCount} test users.`);
      }
    } catch (cleanupErr) {
      console.warn('[-] Warning during test cleanup:', cleanupErr.message);
    }

    await mongoose.disconnect();
    console.log('[*] Disconnected from MongoDB.');
  }

  console.log('\n' + '='.repeat(70));
  console.log(`USER DASHBOARD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
};

runUserDashboardTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
