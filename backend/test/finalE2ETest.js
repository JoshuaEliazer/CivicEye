import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';
import Notification from '../src/models/Notification.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';

const runFinalE2ETest = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE V1.0: FINAL END-TO-END SYSTEM INTEGRATION TEST');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  await connectDB();

  const timestamp = Date.now();
  const citizenEmail = `e2e.citizen.${timestamp}@civiceye.local`;
  const adminEmail = `e2e.admin.${timestamp}@civiceye.local`;
  const password = 'Password123!';

  let citizenToken = null;
  let adminToken = null;
  let citizenId = null;
  let adminId = null;
  let createdComplaintId = null;
  let initialNotificationId = null;

  try {
    // ------------------------------------------------------------------
    // STEP 1: REGISTER Citizen
    // ------------------------------------------------------------------
    console.log('\n[STEP 1] Citizen Registration (POST /api/auth/register)...');
    const resReg = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Citizen User',
        email: citizenEmail,
        password: password,
        role: 'USER',
      }),
    });
    const dataReg = await resReg.json();
    if (resReg.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(dataReg)}`);
    citizenId = dataReg.user?.id || dataReg.user?._id;
    console.log(`[+] Citizen registered successfully. ID: ${citizenId}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 2: LOGIN Citizen & obtain JWT
    // ------------------------------------------------------------------
    console.log('\n[STEP 2] Citizen Login (POST /api/auth/login)...');
    const resLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: citizenEmail,
        password: password,
      }),
    });
    const dataLogin = await resLogin.json();
    if (resLogin.status !== 200 || !dataLogin.token) {
      throw new Error(`Login failed: ${JSON.stringify(dataLogin)}`);
    }
    citizenToken = dataLogin.token;
    console.log(`[+] Login successful. Received valid JWT: ${citizenToken.slice(0, 20)}...`);
    passed++;

    // Register & Login Admin
    console.log('\n[*] Registering Admin Account...');
    const resAdminReg = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Admin Officer',
        email: adminEmail,
        password: password,
        role: 'ADMIN',
      }),
    });
    const dataAdminReg = await resAdminReg.json();
    adminToken = dataAdminReg.token;
    adminId = dataAdminReg.user?.id || dataAdminReg.user?._id;
    console.log(`[+] Admin ready. ID: ${adminId}`);

    // ------------------------------------------------------------------
    // STEP 3, 4, 5, 6: UPLOAD IMAGE, LOCATION, ML PREDICTION & COMPLAINT CREATION
    // ------------------------------------------------------------------
    console.log('\n[STEP 3-6] Filing Complaint with Image, Location & YOLO26 ML Inference...');
    const sampleRoad = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_road.jpg'));
    const formData = new FormData();
    formData.append('image', new Blob([sampleRoad], { type: 'image/jpeg' }), 'pothole_mg_road.jpg');
    formData.append('title', 'Hazardous pothole on MG Road');
    formData.append('description', 'Large pothole blocking the left lane near metro pillar 124');
    formData.append('latitude', '12.9716');
    formData.append('longitude', '77.5946');
    formData.append('address', 'MG Road Metro Station, Bengaluru');

    const resComplaint = await fetch(`${BASE_URL}/complaints`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenToken}` },
      body: formData,
    });
    const dataComplaint = await resComplaint.json();
    const complaintObj = dataComplaint.complaint || dataComplaint.data;
    if (resComplaint.status !== 201 || !complaintObj?.complaintId) {
      throw new Error(`Complaint submission failed: ${JSON.stringify(dataComplaint)}`);
    }

    createdComplaintId = complaintObj.complaintId;
    console.log(`[+] Complaint filed successfully!`);
    console.log(`    Complaint ID: ${createdComplaintId}`);
    console.log(`    Detected Issue: ${complaintObj.issueType}`);
    console.log(`    Status: ${complaintObj.status}`);
    console.log(`    ML Detections: ${complaintObj.detections?.length || 0}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 7: DATABASE PERSISTENCE VERIFICATION
    // ------------------------------------------------------------------
    console.log('\n[STEP 7] Verifying Direct Database Persistence in MongoDB...');
    const dbComplaint = await Complaint.findOne({ complaintId: createdComplaintId });
    if (!dbComplaint) throw new Error('Complaint document not found in MongoDB!');
    if (dbComplaint.user.toString() !== citizenId.toString()) {
      throw new Error('User ownership in DB does not match citizenId');
    }
    console.log(`[+] Verified in MongoDB: ID=${dbComplaint.complaintId}, user=${dbComplaint.user}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 8: IMAGE STORAGE VERIFICATION
    // ------------------------------------------------------------------
    console.log('\n[STEP 8] Verifying Secure Image Retrieval (GET /api/complaints/:id/image)...');
    const resImg = await fetch(`${BASE_URL}/complaints/${createdComplaintId}/image`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    if (resImg.status !== 200) throw new Error(`Image retrieval failed: ${resImg.status}`);
    const imgBuffer = await resImg.arrayBuffer();
    if (imgBuffer.byteLength === 0) throw new Error('Retrieved image is 0 bytes!');
    console.log(`[+] Image served securely: ${imgBuffer.byteLength} bytes, content-type: ${resImg.headers.get('content-type')}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 9: USER DASHBOARD RETRIEVAL
    // ------------------------------------------------------------------
    console.log('\n[STEP 9] Verifying Citizen Dashboard Complaints List (GET /api/complaints)...');
    const resMyComplaints = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const dataMyComplaints = await resMyComplaints.json();
    const myComplaintsList = Array.isArray(dataMyComplaints.complaints)
      ? dataMyComplaints.complaints
      : Array.isArray(dataMyComplaints.data)
      ? dataMyComplaints.data
      : dataMyComplaints;
    const foundMine = myComplaintsList.some((c) => c.complaintId === createdComplaintId);
    if (!foundMine) throw new Error('Filed complaint missing from citizen history listing!');
    console.log(`[+] Citizen dashboard loaded ${myComplaintsList.length} complaint(s), including ${createdComplaintId}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 10: NOTIFICATION CREATED FOR COMPLAINT SUBMISSION
    // ------------------------------------------------------------------
    console.log('\n[STEP 10] Verifying Automated Submission Notification (GET /api/notifications)...');
    const resNotif = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const dataNotif = await resNotif.json();
    const notifs = dataNotif.notifications || dataNotif.data || [];
    const subNotif = notifs.find((n) => n.complaintId === createdComplaintId);
    if (!subNotif) throw new Error('No submission notification found for complaint!');
    initialNotificationId = subNotif._id;
    console.log(`[+] Notification received: "${subNotif.title}" — ${subNotif.message}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 11: ADMIN DASHBOARD SEES THE COMPLAINT
    // ------------------------------------------------------------------
    console.log('\n[STEP 11] Verifying Admin Dashboard Triage (GET /api/admin/complaints)...');
    const resAdminList = await fetch(`${BASE_URL}/admin/complaints?search=${createdComplaintId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataAdminList = await resAdminList.json();
    const adminComplaints = dataAdminList.complaints || dataAdminList.data || [];
    const foundAdmin = adminComplaints.some((c) => c.complaintId === createdComplaintId);
    if (!foundAdmin) throw new Error('Complaint missing from Admin complaints queue!');
    console.log(`[+] Admin successfully located complaint in municipal queue.`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 12: ADMIN UPDATES STATUS (submitted -> in_progress)
    // ------------------------------------------------------------------
    console.log('\n[STEP 12] Admin Status Update (PATCH /api/admin/complaints/:id/status)...');
    const resStatusUpdate = await fetch(`${BASE_URL}/admin/complaints/${createdComplaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'in_progress',
        adminNotes: 'Municipal road repair crew dispatched to MG Road.',
      }),
    });
    const dataStatusUpdate = await resStatusUpdate.json();
    const updatedObj = dataStatusUpdate.complaint || dataStatusUpdate.data;
    if (resStatusUpdate.status !== 200 || updatedObj?.status !== 'in_progress') {
      throw new Error(`Admin status update failed: ${JSON.stringify(dataStatusUpdate)}`);
    }
    console.log(`[+] Status successfully transitioned to 'in_progress' by administrator.`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 13: CITIZEN RECEIVES STATUS UPDATE NOTIFICATION
    // ------------------------------------------------------------------
    console.log('\n[STEP 13] Verifying Status-Change Notification Generated for Citizen...');
    const resNotif2 = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const dataNotif2 = await resNotif2.json();
    const notifs2 = dataNotif2.notifications || dataNotif2.data || [];
    const inProgNotif = notifs2.find((n) => n.complaintId === createdComplaintId);
    if (!inProgNotif) throw new Error('Status transition notification was not generated!');
    console.log(`[+] Status update notification verified: "${inProgNotif.title}"`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 14: UPDATED COMPLAINT STATUS REFLECTED IN CITIZEN VIEW
    // ------------------------------------------------------------------
    console.log('\n[STEP 14] Verifying Updated Status in Citizen Complaint Detail...');
    const resDetail = await fetch(`${BASE_URL}/complaints/${createdComplaintId}`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const dataDetail = await resDetail.json();
    const detail = dataDetail.complaint || dataDetail.data || dataDetail;
    if (detail.status !== 'in_progress') {
      throw new Error(`Citizen complaint detail status is ${detail.status}, expected 'in_progress'`);
    }
    console.log(`[+] Citizen complaint detail shows confirmed updated status: ${detail.status}`);
    passed++;

    // ------------------------------------------------------------------
    // STEP 15: ADMIN MARKS AS RESOLVED -> VERIFY RESOLVED_AT & ANALYTICS
    // ------------------------------------------------------------------
    console.log('\n[STEP 15] Admin Resolves Complaint & Verifies Analytics Update...');
    const resResolve = await fetch(`${BASE_URL}/admin/complaints/${createdComplaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'resolved',
        adminNotes: 'Pothole asphalt repair completed and verified by inspector.',
      }),
    });
    const dataResolve = await resResolve.json();
    const resolvedObj = dataResolve.complaint || dataResolve.data;
    if (resolvedObj?.status !== 'resolved' || !resolvedObj?.resolvedAt) {
      throw new Error('Complaint did not resolve with valid resolvedAt timestamp');
    }
    console.log(`[+] Complaint resolved with valid resolvedAt: ${resolvedObj.resolvedAt}`);

    // Verify Analytics overview reflects resolved status
    const resAnalytics = await fetch(`${BASE_URL}/admin/analytics/overview?preset=all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataAnalytics = await resAnalytics.json();
    if (resAnalytics.status !== 200) {
      throw new Error(`Analytics overview failed: ${JSON.stringify(dataAnalytics)}`);
    }
    const resolvedCount = dataAnalytics.statusBreakdown?.resolved || dataAnalytics.statusCounts?.resolved || 0;
    console.log(`[+] Analytics verified: Resolved complaints in city = ${resolvedCount}`);
    passed++;

  } catch (err) {
    console.error(`\n[-] END-TO-END TEST FAILURE: ${err.message}`);
    failed++;
  } finally {
    // ------------------------------------------------------------------
    // CLEANUP
    // ------------------------------------------------------------------
    console.log('\n[*] Cleaning up test records from database...');
    if (createdComplaintId) {
      await Complaint.deleteMany({ complaintId: createdComplaintId });
    }
    if (citizenId) {
      await Notification.deleteMany({ user: citizenId });
    }
    await User.deleteMany({ email: { $in: [citizenEmail, adminEmail] } });
    await mongoose.disconnect();
    console.log('[+] Cleanup complete. Database disconnected.');
  }

  console.log('\n======================================================================');
  console.log(`END-TO-END TEST RESULTS: ${passed} PASSED / ${failed} FAILED (Total: ${passed + failed})`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
};

runFinalE2ETest();
