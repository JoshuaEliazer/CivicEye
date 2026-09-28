import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';

dotenv.config();

const BASE_URL = process.env.TEST_API_URL || 'http://127.0.0.1:5000/api';

const runVerification = async () => {
  console.log('='.repeat(70));
  console.log('MANUAL USER DASHBOARD 22-STEP VERIFICATION SCRIPT');
  console.log('='.repeat(70));

  await connectDB();

  const timestamp = Date.now();
  const user1Email = `user.manual1.${timestamp}@civiceye.local`;
  const user2Email = `user.manual2.${timestamp}@civiceye.local`;
  const adminEmail = `admin.manual.${timestamp}@civiceye.local`;

  let user1Token, user2Token, adminToken;
  let user1Id, user2Id, adminId;
  let complaintId1;

  const createdUserIds = [];
  const createdComplaintIds = [];

  try {
    // 1 & 2: Register/login as a normal USER
    console.log('\n[STEP 1 & 2] Registering and authenticating Citizen User 1...');
    const regRes1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Kavita Krishnan',
        email: user1Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const regData1 = await regRes1.json();
    user1Token = regData1.token;
    user1Id = regData1.user?.id;
    createdUserIds.push(user1Id);
    console.log(`[+] Citizen 1 logged in. Name: ${regData1.user?.name}, Email: ${user1Email}`);

    // Seed a complaint for User 1
    const complaintDoc = new Complaint({
      complaintId: `CE-${new Date().getFullYear()}-990001`,
      user: user1Id,
      userId: user1Id,
      issueType: 'pothole',
      description: 'Dangerous pothole on Ring Road near flyover junction.',
      confidence: 0.92,
      isUncertain: false,
      status: 'in_progress',
      location: { latitude: 13.0827, longitude: 80.2707, address: 'Ring Road, Chennai' },
      latitude: 13.0827,
      longitude: 80.2707,
      image: {
        originalName: 'ring_road_pothole.jpg',
        mimetype: 'image/jpeg',
        size: 180000,
        path: 'ring_road_pothole.jpg',
      },
      imageUrl: 'ring_road_pothole.jpg',
      detections: [{ class: 'pothole', confidence: 0.92, bbox: [100, 100, 300, 300] }],
    });
    await complaintDoc.save();
    complaintId1 = complaintDoc.complaintId;
    createdComplaintIds.push(complaintDoc._id);
    console.log(`[+] Seeded complaint ${complaintId1} for User 1`);

    // 3: Open /dashboard (GET /api/complaints with User 1 token)
    console.log('\n[STEP 3] Fetching dashboard complaints for User 1...');
    const dashRes = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const dashData = await dashRes.json();
    console.log(`[+] Dashboard returned HTTP ${dashRes.status}, count: ${dashData.count}`);

    // 4: Verify user's name is displayed
    console.log('\n[STEP 4] Verifying User Name...');
    console.log(`[+] User name: "${regData1.user?.name}" (Expected: Kavita Krishnan)`);
    if (regData1.user?.name !== 'Kavita Krishnan') throw new Error('User name mismatch');

    // 5: Verify complaint summary counts
    console.log('\n[STEP 5] Verifying Complaint Summary Counts...');
    const total = dashData.complaints.length;
    const inProgress = dashData.complaints.filter((c) => c.status === 'in_progress').length;
    const pending = dashData.complaints.filter((c) => ['submitted', 'pending', 'under_review'].includes(c.status)).length;
    const resolved = dashData.complaints.filter((c) => c.status === 'resolved').length;
    const rejected = dashData.complaints.filter((c) => c.status === 'rejected').length;
    console.log(`[+] Counts: Total=${total}, InProgress=${inProgress}, Pending=${pending}, Resolved=${resolved}, Rejected=${rejected}`);
    if (total !== 1 || inProgress !== 1) throw new Error('Summary count mismatch');

    // 6: Verify existing complaints appear
    console.log('\n[STEP 6] Verifying existing complaints appear...');
    if (dashData.complaints.length === 0) throw new Error('Complaint did not appear');
    const c1 = dashData.complaints[0];
    console.log(`[+] Complaint found in list: ${c1.complaintId}`);

    // 7: Verify complaint IDs
    console.log('\n[STEP 7] Verifying complaint ID...');
    console.log(`[+] Complaint ID: ${c1.complaintId}`);
    if (c1.complaintId !== complaintId1) throw new Error('Complaint ID mismatch');

    // 8: Verify issue types
    console.log('\n[STEP 8] Verifying issue type...');
    console.log(`[+] Issue Type: ${c1.issueType}`);
    if (c1.issueType !== 'pothole') throw new Error('Issue type mismatch');

    // 9: Verify confidence values
    console.log('\n[STEP 9] Verifying confidence value...');
    console.log(`[+] Confidence: ${(c1.confidence * 100).toFixed(1)}%`);
    if (c1.confidence !== 0.92) throw new Error('Confidence mismatch');

    // 10: Verify statuses
    console.log('\n[STEP 10] Verifying status...');
    console.log(`[+] Status: ${c1.status}`);
    if (c1.status !== 'in_progress') throw new Error('Status mismatch');

    // 11: Verify dates
    console.log('\n[STEP 11] Verifying dates...');
    console.log(`[+] CreatedAt: ${c1.createdAt}, UpdatedAt: ${c1.updatedAt}`);
    if (!c1.createdAt) throw new Error('Missing createdAt date');

    // 12 & 13: Open one complaint and verify complete details
    console.log('\n[STEP 12 & 13] Opening complaint details (GET /api/complaints/:complaintId)...');
    const detailRes = await fetch(`${BASE_URL}/complaints/${complaintId1}`, {
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const detailData = await detailRes.json();
    console.log(`[+] Detail response HTTP ${detailRes.status}: success=${detailData.success}`);
    const cd = detailData.complaint;
    console.log(`[+] Full details: ID=${cd.complaintId}, Description="${cd.description}", Model=${cd.modelArchitecture}`);

    // 14: Verify location / map
    console.log('\n[STEP 14] Verifying location coordinates and address...');
    console.log(`[+] Latitude: ${cd.latitude}, Longitude: ${cd.longitude}, Address: "${cd.location?.address}"`);
    if (cd.latitude !== 13.0827 || cd.longitude !== 80.2707) throw new Error('Coordinates mismatch');

    // 15: Verify image reference
    console.log('\n[STEP 15] Verifying image reference...');
    console.log(`[+] Image URL/Path: ${cd.imageUrl || cd.image?.path}`);
    if (!cd.imageUrl && !cd.image?.path) throw new Error('Missing image reference');

    // 16 & 17 & 18: Logout & verify unauthenticated access to /dashboard is blocked
    console.log('\n[STEP 16, 17, 18] Simulating logout & testing unauthenticated access...');
    const unauthRes = await fetch(`${BASE_URL}/complaints`);
    console.log(`[+] Unauthenticated GET /api/complaints returned HTTP ${unauthRes.status}`);
    if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

    // 19 & 20: Login as another USER & verify User 1's complaints are NOT visible
    console.log('\n[STEP 19 & 20] Logging in as User 2 & testing user isolation...');
    const regRes2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Deepak Verma',
        email: user2Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const regData2 = await regRes2.json();
    user2Token = regData2.token;
    user2Id = regData2.user?.id;
    createdUserIds.push(user2Id);

    const user2DashRes = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    const user2DashData = await user2DashRes.json();
    console.log(`[+] User 2 complaints count: ${user2DashData.count}`);
    if (user2DashData.count !== 0) throw new Error('User 2 saw User 1 complaints!');

    const user2CrossRes = await fetch(`${BASE_URL}/complaints/${complaintId1}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    console.log(`[+] User 2 accessing User 1 complaint directly returned HTTP ${user2CrossRes.status} (Expected 403)`);
    if (user2CrossRes.status !== 403) throw new Error('User 2 was not blocked with 403 Forbidden!');

    // 21 & 22: Login as ADMIN & verify admin dashboard works
    console.log('\n[STEP 21 & 22] Logging in as ADMIN & verifying admin dashboard...');
    const regAdminRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Chief Admin',
        email: adminEmail,
        password: 'AdminPassword123!',
        role: 'ADMIN',
      }),
    });
    const regAdminData = await regAdminRes.json();
    adminToken = regAdminData.token;
    adminId = regAdminData.user?.id;
    createdUserIds.push(adminId);

    const adminStatsRes = await fetch(`${BASE_URL}/admin/statistics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminStatsData = await adminStatsRes.json();
    console.log(`[+] Admin statistics returned HTTP ${adminStatsRes.status}: totalComplaints=${adminStatsData.statistics?.totalComplaints}`);

    const adminComplaintsRes = await fetch(`${BASE_URL}/admin/complaints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminComplaintsData = await adminComplaintsRes.json();
    console.log(`[+] Admin complaints list returned HTTP ${adminComplaintsRes.status}: count=${adminComplaintsData.complaints?.length}`);

    if (adminStatsRes.status !== 200 || adminComplaintsRes.status !== 200) {
      throw new Error('Admin endpoints failed!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('>>> ALL 22 MANUAL VERIFICATION STEPS COMPLETED & VERIFIED! <<<');
    console.log('='.repeat(70));
  } finally {
    console.log('\n[*] Cleaning up manual test data from MongoDB...');
    if (createdComplaintIds.length > 0) {
      await Complaint.deleteMany({ _id: { $in: createdComplaintIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    await mongoose.disconnect();
    console.log('[*] Cleanup complete.');
  }
};

runVerification().catch((err) => {
  console.error('[-] Verification failed:', err);
  process.exit(1);
});
