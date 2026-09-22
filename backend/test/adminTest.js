import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';

dotenv.config();

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'civiceye_jwt_secret_key_2026_super_secure_key_civic_platform';

const runAdminTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 8: ADMIN DASHBOARD & COMPLAINT MANAGEMENT TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Connect to DB for direct queries & cleanup
  await connectDB();

  const timestamp = Date.now();
  const adminEmail = `admin.${timestamp}@civiceye.local`;
  const citizenEmail = `citizen.${timestamp}@civiceye.local`;
  let adminToken = null;
  let citizenToken = null;
  let adminUser = null;
  let citizenUser = null;

  // IDs of test records for cleanup
  const createdUserIds = [];
  const createdComplaintIds = [];
  let testComplaint1 = null;
  let testComplaint2 = null;
  let testComplaint3 = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Register 1 Admin user and 1 Citizen user
    // ------------------------------------------------------------------------
    console.log('\n[*] Setting up Admin and Citizen accounts...');

    // 1. Register Admin
    const resAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Municipal Admin Officer',
        email: adminEmail,
        password: 'AdminPassword123!',
        role: 'ADMIN',
      }),
    });
    const dataAdmin = await resAdmin.json();
    if (!resAdmin.ok || !dataAdmin.token) {
      throw new Error(`Failed to create admin user: ${JSON.stringify(dataAdmin)}`);
    }
    adminToken = dataAdmin.token;
    adminUser = dataAdmin.user;
    createdUserIds.push(adminUser.id);
    console.log(`[+] Admin registered: ${adminEmail} (Role: ${adminUser.role})`);

    // 2. Register Citizen
    const resCitizen = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Regular Citizen',
        email: citizenEmail,
        password: 'CitizenPassword123!',
        role: 'USER',
      }),
    });
    const dataCitizen = await resCitizen.json();
    if (!resCitizen.ok || !dataCitizen.token) {
      throw new Error(`Failed to create citizen user: ${JSON.stringify(dataCitizen)}`);
    }
    citizenToken = dataCitizen.token;
    citizenUser = dataCitizen.user;
    createdUserIds.push(citizenUser.id);
    console.log(`[+] Citizen registered: ${citizenEmail} (Role: ${citizenUser.role})`);

    // 3. Create Seed Complaints in DB directly for isolated predictable testing
    console.log('\n[*] Seeding test complaints into MongoDB...');

    testComplaint1 = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-888001`,
      user: citizenUser.id,
      userId: citizenUser.id,
      issueType: 'pothole',
      description: 'Severe road pothole on MG Road near Metro Station.',
      confidence: 0.91,
      isUncertain: false,
      status: 'submitted',
      location: { latitude: 12.9716, longitude: 77.5946, address: 'MG Road, Bengaluru' },
      latitude: 12.9716,
      longitude: 77.5946,
      image: { originalName: 'pothole_mg_road.jpg', mimetype: 'image/jpeg', size: 102400 },
      imageUrl: 'pothole_mg_road.jpg',
      detections: [{ class: 'pothole', confidence: 0.91, bbox: [10, 20, 200, 180] }],
    });
    await testComplaint1.save();
    createdComplaintIds.push(testComplaint1.complaintId);

    testComplaint2 = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-888002`,
      user: citizenUser.id,
      userId: citizenUser.id,
      issueType: 'leakage',
      description: 'Broken water supply pipe leaking onto pavement.',
      confidence: 0.85,
      isUncertain: false,
      status: 'in_progress',
      location: { latitude: 12.9750, longitude: 77.6000, address: 'Brigade Road, Bengaluru' },
      latitude: 12.9750,
      longitude: 77.6000,
      image: { originalName: 'pipe_leakage.jpg', mimetype: 'image/jpeg', size: 85200 },
      imageUrl: 'pipe_leakage.jpg',
      detections: [{ class: 'leakage', confidence: 0.85, bbox: [40, 50, 180, 220] }],
    });
    await testComplaint2.save();
    createdComplaintIds.push(testComplaint2.complaintId);

    testComplaint3 = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-888003`,
      user: adminUser.id,
      userId: adminUser.id,
      issueType: 'garbage',
      description: 'Overflowing municipal trash bin behind city market.',
      confidence: 0.94,
      isUncertain: false,
      status: 'resolved',
      location: { latitude: 12.9600, longitude: 77.5800, address: 'City Market, Bengaluru' },
      latitude: 12.9600,
      longitude: 77.5800,
      image: { originalName: 'trash_overflow.jpg', mimetype: 'image/jpeg', size: 92400 },
      imageUrl: 'trash_overflow.jpg',
      detections: [{ class: 'garbage', confidence: 0.94, bbox: [30, 40, 300, 280] }],
    });
    await testComplaint3.save();
    createdComplaintIds.push(testComplaint3.complaintId);

    console.log(`[+] Seeded 3 test complaints: ${createdComplaintIds.join(', ')}`);

    // ------------------------------------------------------------------------
    // TEST 1: Unauthenticated request to /api/admin/complaints -> 401
    // ------------------------------------------------------------------------
    console.log('\n[TEST 1] Testing GET /api/admin/complaints without auth token...');
    const res1 = await fetch(`${BASE_URL}/admin/complaints`);
    const data1 = await res1.json();
    console.log(`[*] Status Code: ${res1.status}`);
    if (res1.status === 401 && data1.error === 'NO_TOKEN') {
      console.log('[+] PASS: Unauthenticated request rejected with 401 Unauthorized.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 401, got ${res1.status}`, data1);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Request with malformed JWT -> 401
    // ------------------------------------------------------------------------
    console.log('\n[TEST 2] Testing GET /api/admin/complaints with malformed JWT...');
    const res2 = await fetch(`${BASE_URL}/admin/complaints`, {
      headers: { Authorization: 'Bearer this.is.a.malformed.token' },
    });
    const data2 = await res2.json();
    console.log(`[*] Status Code: ${res2.status}`);
    if (res2.status === 401 && data2.error === 'INVALID_TOKEN') {
      console.log('[+] PASS: Malformed JWT rejected with 401.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 401, got ${res2.status}`, data2);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Request with expired JWT -> 401
    // ------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing GET /api/admin/complaints with expired JWT...');
    const expiredToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: 'ADMIN' },
      JWT_SECRET,
      { expiresIn: '0s' }
    );
    const res3 = await fetch(`${BASE_URL}/admin/complaints`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const data3 = await res3.json();
    console.log(`[*] Status Code: ${res3.status}`);
    if (res3.status === 401 && data3.error === 'TOKEN_EXPIRED') {
      console.log('[+] PASS: Expired token cleanly rejected with 401 TOKEN_EXPIRED.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 401, got ${res3.status}`, data3);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Normal USER accessing admin endpoint -> 403 Forbidden
    // ------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing GET /api/admin/complaints with normal citizen token (Role: USER)...');
    const res4 = await fetch(`${BASE_URL}/admin/complaints`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const data4 = await res4.json();
    console.log(`[*] Status Code: ${res4.status}`);
    if (res4.status === 403 && data4.error === 'FORBIDDEN_ADMIN_REQUIRED') {
      console.log('[+] PASS: Normal citizen access rejected with 403 Forbidden.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 403, got ${res4.status}`, data4);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: ADMIN accessing admin endpoint -> 200 OK
    // ------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing GET /api/admin/complaints with ADMIN token...');
    const res5 = await fetch(`${BASE_URL}/admin/complaints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data5 = await res5.json();
    console.log(`[*] Status Code: ${res5.status}`);
    if (res5.status === 200 && data5.success === true && Array.isArray(data5.complaints)) {
      console.log(`[+] PASS: Admin authorized successfully, returned ${data5.complaints.length} complaints.`);
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 200, got ${res5.status}`, data5);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Admin can retrieve complaints across all users
    // ------------------------------------------------------------------------
    console.log('\n[TEST 6] Verifying admin sees complaints submitted by all users...');
    const complaintIdsInResponse = data5.complaints.map((c) => c.complaintId);
    const hasCitizenComplaint = complaintIdsInResponse.includes(testComplaint1.complaintId);
    const hasAdminComplaint = complaintIdsInResponse.includes(testComplaint3.complaintId);
    if (hasCitizenComplaint && hasAdminComplaint) {
      console.log('[+] PASS: Admin sees complaints from both Citizen and Admin accounts.');
      passed++;
    } else {
      console.error(`[-] FAIL: Missing expected cross-user complaints in response.`, complaintIdsInResponse);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Pagination works (page & limit)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 7] Testing pagination on GET /api/admin/complaints?page=1&limit=2...');
    const res7 = await fetch(`${BASE_URL}/admin/complaints?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data7 = await res7.json();
    console.log(`[*] Status Code: ${res7.status}`);
    console.log(`[*] Returned: ${data7.complaints?.length} items. Total: ${data7.pagination?.total}, TotalPages: ${data7.pagination?.totalPages}`);
    if (
      res7.status === 200 &&
      data7.complaints.length === 2 &&
      data7.pagination.page === 1 &&
      data7.pagination.limit === 2 &&
      data7.pagination.total >= 3
    ) {
      console.log('[+] PASS: Pagination correctly constrained to limit 2.');
      passed++;
    } else {
      console.error(`[-] FAIL: Pagination did not match expected structure.`, data7.pagination);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: Search works (search by description / address / issueType / ID)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 8] Testing search by keyword: ?search=MG Road...');
    const res8 = await fetch(`${BASE_URL}/admin/complaints?search=MG%20Road`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data8 = await res8.json();
    console.log(`[*] Found: ${data8.complaints?.length} complaints matching 'MG Road'`);
    const searchMatch = data8.complaints?.some((c) => c.complaintId === testComplaint1.complaintId);
    if (res8.status === 200 && searchMatch) {
      console.log('[+] PASS: Search successfully located complaint by address/description.');
      passed++;
    } else {
      console.error(`[-] FAIL: Search failed to find expected complaint.`, data8);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Status filtering works (?status=in_progress)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 9] Testing status filtering: ?status=in_progress...');
    const res9 = await fetch(`${BASE_URL}/admin/complaints?status=in_progress`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data9 = await res9.json();
    console.log(`[*] Found: ${data9.complaints?.length} complaints with status=in_progress`);
    const allInProgress = data9.complaints?.every((c) => c.status === 'in_progress');
    const includesTest2 = data9.complaints?.some((c) => c.complaintId === testComplaint2.complaintId);
    if (res9.status === 200 && allInProgress && includesTest2) {
      console.log('[+] PASS: Status filter cleanly isolated in_progress complaints.');
      passed++;
    } else {
      console.error(`[-] FAIL: Status filtering failed.`, data9.complaints);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: Issue-type filtering works (?issueType=pothole)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 10] Testing issue-type filtering: ?issueType=pothole...');
    const res10 = await fetch(`${BASE_URL}/admin/complaints?issueType=pothole`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data10 = await res10.json();
    console.log(`[*] Found: ${data10.complaints?.length} pothole complaints`);
    const allPotholes = data10.complaints?.every((c) => c.issueType === 'pothole');
    const includesTest1 = data10.complaints?.some((c) => c.complaintId === testComplaint1.complaintId);
    if (res10.status === 200 && allPotholes && includesTest1) {
      console.log('[+] PASS: Issue-type filter accurately returned pothole complaints.');
      passed++;
    } else {
      console.error(`[-] FAIL: Issue-type filter failed.`, data10.complaints);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Combined filters work (status + issueType + search)
    // ------------------------------------------------------------------------
    console.log('\n[TEST 11] Testing combined filters (?status=submitted&issueType=pothole&search=Metro)...');
    const res11 = await fetch(
      `${BASE_URL}/admin/complaints?status=submitted&issueType=pothole&search=Metro`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const data11 = await res11.json();
    console.log(`[*] Found: ${data11.complaints?.length} combined matches`);
    if (
      res11.status === 200 &&
      data11.complaints?.length === 1 &&
      data11.complaints[0].complaintId === testComplaint1.complaintId
    ) {
      console.log('[+] PASS: Combined multi-criteria filter accurately pinpointed complaint.');
      passed++;
    } else {
      console.error(`[-] FAIL: Combined filter did not match expected single complaint.`, data11);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Admin can retrieve complaint details
    // ------------------------------------------------------------------------
    console.log(`\n[TEST 12] Testing GET /api/admin/complaints/${testComplaint1.complaintId}...`);
    const res12 = await fetch(`${BASE_URL}/admin/complaints/${testComplaint1.complaintId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data12 = await res12.json();
    console.log(`[*] Status Code: ${res12.status}`);
    if (
      res12.status === 200 &&
      data12.success === true &&
      data12.complaint.complaintId === testComplaint1.complaintId &&
      data12.complaint.user?.name === 'Regular Citizen'
    ) {
      console.log(`[+] PASS: Admin retrieved full details and populated reporter: ${data12.complaint.user.name}`);
      passed++;
    } else {
      console.error(`[-] FAIL: Details endpoint failed.`, data12);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 13: Invalid / malformed complaint ID request handled cleanly
    // ------------------------------------------------------------------------
    console.log('\n[TEST 13] Testing GET /api/admin/complaints/   (whitespace ID)...');
    const res13 = await fetch(`${BASE_URL}/admin/complaints/%20%20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`[*] Status Code: ${res13.status}`);
    if (res13.status === 400 || res13.status === 404) {
      console.log(`[+] PASS: Malformed complaint ID handled cleanly with HTTP ${res13.status}.`);
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 400 or 404, got ${res13.status}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 14: Unknown complaint ID returns 404
    // ------------------------------------------------------------------------
    console.log('\n[TEST 14] Testing GET /api/admin/complaints/CE-NONEXISTENT-999999...');
    const res14 = await fetch(`${BASE_URL}/admin/complaints/CE-NONEXISTENT-999999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data14 = await res14.json();
    console.log(`[*] Status Code: ${res14.status}`);
    if (res14.status === 404 && data14.error === 'COMPLAINT_NOT_FOUND') {
      console.log('[+] PASS: Unknown complaint correctly returned 404 Not Found.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 404, got ${res14.status}`, data14);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 15: Admin can update complaint status (PATCH /status)
    // ------------------------------------------------------------------------
    console.log(`\n[TEST 15] Testing PATCH /api/admin/complaints/${testComplaint1.complaintId}/status to 'in_progress'...`);
    const res15 = await fetch(`${BASE_URL}/admin/complaints/${testComplaint1.complaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    const data15 = await res15.json();
    console.log(`[*] Status Code: ${res15.status}`);
    console.log(`[*] Updated Status: ${data15.complaint?.status}`);
    if (res15.status === 200 && data15.complaint?.status === 'in_progress') {
      console.log('[+] PASS: Admin successfully updated complaint status to in_progress.');
      passed++;
    } else {
      console.error(`[-] FAIL: Status update failed.`, data15);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 16: Invalid status update returns 400 Bad Request
    // ------------------------------------------------------------------------
    console.log('\n[TEST 16] Testing status update with invalid status: "invalid_status"...');
    const res16 = await fetch(`${BASE_URL}/admin/complaints/${testComplaint1.complaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'flying_object' }),
    });
    const data16 = await res16.json();
    console.log(`[*] Status Code: ${res16.status}`);
    if (res16.status === 400 && data16.error === 'INVALID_STATUS') {
      console.log('[+] PASS: Invalid status rejected with 400 Bad Request.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 400, got ${res16.status}`, data16);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 17: Normal USER cannot update status -> 403 Forbidden
    // ------------------------------------------------------------------------
    console.log('\n[TEST 17] Testing status update with normal Citizen token...');
    const res17 = await fetch(`${BASE_URL}/admin/complaints/${testComplaint1.complaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({ status: 'resolved' }),
    });
    const data17 = await res17.json();
    console.log(`[*] Status Code: ${res17.status}`);
    if (res17.status === 403 && data17.error === 'FORBIDDEN_ADMIN_REQUIRED') {
      console.log('[+] PASS: Citizen blocked from changing status with 403 Forbidden.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 403, got ${res17.status}`, data17);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 18: Statistics endpoint works
    // ------------------------------------------------------------------------
    console.log('\n[TEST 18] Testing GET /api/admin/statistics...');
    const res18 = await fetch(`${BASE_URL}/admin/statistics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data18 = await res18.json();
    console.log(`[*] Status Code: ${res18.status}`);
    console.log(`[*] Returned Statistics:`, data18.statistics);
    if (res18.status === 200 && data18.success === true && data18.statistics) {
      console.log('[+] PASS: Statistics endpoint returned 200 with structured data.');
      passed++;
    } else {
      console.error(`[-] FAIL: Expected 200 with statistics object.`, data18);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 19: Statistics are database-derived and accurately match counts
    // ------------------------------------------------------------------------
    console.log('\n[TEST 19] Verifying statistics match direct MongoDB database queries...');
    const actualTotal = await Complaint.countDocuments({});
    const actualPotholes = await Complaint.countDocuments({ issueType: { $in: ['pothole', 'POTHOLE'] } });
    if (
      data18.statistics.totalComplaints === actualTotal &&
      data18.statistics.potholes === actualPotholes
    ) {
      console.log(`[+] PASS: Database-derived statistics verified: Total=${actualTotal}, Potholes=${actualPotholes}`);
      passed++;
    } else {
      console.error(`[-] FAIL: Statistics mismatch with database count.`, {
        apiStats: data18.statistics,
        actualTotal,
        actualPotholes,
      });
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 20: Password hash is never returned in populated reporter
    // ------------------------------------------------------------------------
    console.log('\n[TEST 20] Verifying reporter population never exposes password or password hash...');
    const res20 = await fetch(`${BASE_URL}/admin/complaints/${testComplaint1.complaintId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data20 = await res20.json();
    const reporter = data20.complaint?.user;
    if (reporter && reporter.password === undefined && reporter.passwordHash === undefined) {
      console.log('[+] PASS: Sensitive credentials strictly omitted from populated reporter.');
      passed++;
    } else {
      console.error(`[-] FAIL: Credentials found in populated user object!`, reporter);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 21: Existing citizen complaint ownership remains intact
    // ------------------------------------------------------------------------
    console.log('\n[TEST 21] Verifying Citizen GET /api/complaints is still strictly isolated...');
    const res21 = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const data21 = await res21.json();
    const citizenComplaintIds = data21.complaints?.map((c) => c.complaintId) || [];
    const hasAdminComplaintInCitizenFeed = citizenComplaintIds.includes(testComplaint3.complaintId);
    if (res21.status === 200 && !hasAdminComplaintInCitizenFeed) {
      console.log('[+] PASS: Citizen complaint isolation remains 100% intact (admin complaint not exposed).');
      passed++;
    } else {
      console.error(`[-] FAIL: Citizen saw complaints belonging to another user!`, citizenComplaintIds);
      failed++;
    }

  } catch (err) {
    console.error('\n[FATAL ERROR during test execution]:', err);
    failed++;
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test users and complaints from MongoDB...');
    try {
      if (createdComplaintIds.length > 0) {
        await Complaint.deleteMany({ complaintId: { $in: createdComplaintIds } });
      }
      if (createdUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: createdUserIds } });
      }
      console.log('[+] Cleanup complete.');
    } catch (cleanupErr) {
      console.error('[-] Error during cleanup:', cleanupErr);
    }

    await mongoose.connection.close();
    console.log('[*] Disconnected from MongoDB.\n');
  }

  console.log('='.repeat(70));
  console.log(`ADMIN TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (Total ${passed + failed})`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  }
};

runAdminTests();
