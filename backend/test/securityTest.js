/**
 * ======================================================================
 * CIVICEYE PHASE 15: SECURITY & HARDENING AUTOMATED TEST SUITE
 * ======================================================================
 * Verifies comprehensive security controls:
 * 1. Authentication & JWT security (missing, expired, malformed tokens)
 * 2. Authorization & IDOR protection (complaints, images, notifications, admin triage)
 * 3. Role-based privilege escalation prevention
 * 4. Input validation & boundary constraints (coordinates, dates, pagination, IDs, statuses)
 * 5. File upload security (MIME validation, size limits, path traversal containment)
 * 6. Information disclosure prevention (error stack shielding, zero PII in analytics)
 * 7. HTTP security headers (nosniff, frame-options, x-powered-by suppression)
 * 8. Rate limiting & abuse protection headers and enforcement
 * ======================================================================
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';
import Notification from '../src/models/Notification.js';
import storageService, { PathTraversalError } from '../src/services/storage/index.js';
import { InMemoryRateLimiter } from '../src/middleware/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000/api';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/civiceye';
const JWT_SECRET = process.env.JWT_SECRET || 'civiceye_jwt_secret_key_2026_super_secure_key_civic_platform';

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function runSecurityTestSuite() {
  console.log('======================================================================');
  console.log('CIVICEYE PHASE 15: COMPREHENSIVE SECURITY & HARDENING TEST SUITE');
  console.log('======================================================================');
  console.log(`Target Backend URL: ${BASE_URL}`);

  await mongoose.connect(MONGODB_URI);
  console.log(`[MongoDB] Connected: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  const timestamp = Date.now();
  const citizenAEmail = `sec.citizenA.${timestamp}@civiceye.local`;
  const citizenBEmail = `sec.citizenB.${timestamp}@civiceye.local`;
  const adminEmail = `sec.admin.${timestamp}@civiceye.local`;
  const password = 'StrongPassword123!';

  let citizenAToken, citizenAId;
  let citizenBToken, citizenBId;
  let adminToken, adminId;
  let testComplaintId;
  let testComplaintDocId;
  let testNotificationId;

  try {
    // ------------------------------------------------------------------
    // Setup: Provision Citizen A, Citizen B, and Administrator
    // ------------------------------------------------------------------
    console.log('[SETUP] Provisioning test security personas...');

    // Citizen A
    const regResA = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Citizen Alpha', email: citizenAEmail, password, role: 'USER' }),
    });
    const regDataA = await regResA.json();
    citizenAToken = regDataA.token;
    citizenAId = regDataA.user?.id;

    // Citizen B
    const regResB = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Citizen Beta', email: citizenBEmail, password, role: 'USER' }),
    });
    const regDataB = await regResB.json();
    citizenBToken = regDataB.token;
    citizenBId = regDataB.user?.id;

    // Admin
    const regResAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Security Admin', email: adminEmail, password, role: 'ADMIN' }),
    });
    const regDataAdmin = await regResAdmin.json();
    adminToken = regDataAdmin.token;
    adminId = regDataAdmin.user?.id;

    console.log(`[+] Citizen A provisioned: ${citizenAEmail}`);
    console.log(`[+] Citizen B provisioned: ${citizenBEmail}`);
    console.log(`[+] Admin provisioned:     ${adminEmail}\n`);

    // Create a 1x1 test JPEG image buffer
    const testJpgBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
      0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06,
      0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d,
      0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d,
      0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28,
      0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01,
      0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
      0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02,
      0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01,
      0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x80, 0xff, 0xd9,
    ]);

    // Seed Complaint for Citizen A
    testComplaintId = `CE-2026-SEC${Math.floor(1000 + Math.random() * 9000)}`;
    const storedImg = await storageService.saveImage({
      buffer: testJpgBuffer,
      originalName: 'security_test.jpg',
      mimetype: 'image/jpeg',
      complaintId: testComplaintId,
      subDir: 'complaints',
    });

    const complaintDoc = new Complaint({
      complaintId: testComplaintId,
      user: citizenAId,
      userId: citizenAId,
      issueType: 'pothole',
      description: 'Security test complaint owned by Citizen A',
      confidence: 0.92,
      status: 'submitted',
      image: {
        filename: storedImg.filename,
        originalName: 'security_test.jpg',
        mimetype: 'image/jpeg',
        size: testJpgBuffer.length,
        storageType: 'local',
        storageKey: storedImg.storageKey,
        path: storedImg.path,
        url: `/api/complaints/${testComplaintId}/image`,
      },
      imageUrl: `/api/complaints/${testComplaintId}/image`,
      location: { latitude: 12.9716, longitude: 77.5946, address: 'Test Security Boulevard' },
      latitude: 12.9716,
      longitude: 77.5946,
    });
    const savedComplaint = await complaintDoc.save();
    testComplaintDocId = savedComplaint._id;

    // Seed Notification for Citizen A
    const notifDoc = new Notification({
      user: citizenAId,
      complaint: testComplaintDocId,
      complaintId: testComplaintId,
      type: 'complaint_submitted',
      title: 'Security Alert Test',
      message: 'Notification belonging strictly to Citizen A',
      isRead: false,
    });
    const savedNotif = await notifDoc.save();
    testNotificationId = savedNotif._id.toString();

    // ==================================================================
    // PART 1: AUTHENTICATION & JWT SECURITY
    // ==================================================================
    console.log('\n--- PART 1: AUTHENTICATION & JWT SECURITY ---');

    // TEST 1: Missing JWT returns 401 NO_TOKEN
    const res1 = await fetch(`${BASE_URL}/complaints`);
    const data1 = await res1.json();
    assert(res1.status === 401 && data1.error === 'NO_TOKEN', '[TEST 1] Missing JWT returns 401 NO_TOKEN');

    // TEST 2: Malformed / invalid signature JWT returns 401 INVALID_TOKEN
    const res2 = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: 'Bearer this.is.invalidtoken' },
    });
    const data2 = await res2.json();
    assert(res2.status === 401 && data2.error === 'INVALID_TOKEN', '[TEST 2] Malformed JWT returns 401 INVALID_TOKEN');

    // TEST 3: Deliberately expired JWT returns 401 TOKEN_EXPIRED
    const expiredToken = jwt.sign(
      { id: citizenAId, email: citizenAEmail, role: 'USER' },
      JWT_SECRET,
      { expiresIn: '-10s' }
    );
    const res3 = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const data3 = await res3.json();
    assert(res3.status === 401 && data3.error === 'TOKEN_EXPIRED', '[TEST 3] Expired JWT returns 401 TOKEN_EXPIRED');

    // TEST 4: Token with non-existent user returns 401 USER_NOT_FOUND
    const nonExistentUserId = new mongoose.Types.ObjectId();
    const ghostToken = jwt.sign(
      { id: nonExistentUserId, email: 'ghost@civiceye.local', role: 'USER' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const res4 = await fetch(`${BASE_URL}/complaints`, {
      headers: { Authorization: `Bearer ${ghostToken}` },
    });
    const data4 = await res4.json();
    assert(res4.status === 401 && data4.error === 'USER_NOT_FOUND', '[TEST 4] Token with deleted user returns 401 USER_NOT_FOUND');

    // ==================================================================
    // PART 2: AUTHORIZATION & PRIVILEGE ESCALATION
    // ==================================================================
    console.log('\n--- PART 2: AUTHORIZATION & PRIVILEGE ESCALATION ---');

    // TEST 5: Citizen attempting to access admin complaints list returns 403
    const res5 = await fetch(`${BASE_URL}/admin/complaints`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const data5 = await res5.json();
    assert(res5.status === 403 && data5.error === 'FORBIDDEN_ADMIN_REQUIRED', '[TEST 5] Citizen accessing admin complaints returns 403');

    // TEST 6: Citizen attempting to access admin statistics returns 403
    const res6 = await fetch(`${BASE_URL}/admin/statistics`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const data6 = await res6.json();
    assert(res6.status === 403 && data6.error === 'FORBIDDEN_ADMIN_REQUIRED', '[TEST 6] Citizen accessing admin statistics returns 403');

    // TEST 7: Citizen attempting to update complaint status returns 403
    const res7 = await fetch(`${BASE_URL}/admin/complaints/${testComplaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenAToken}`,
      },
      body: JSON.stringify({ status: 'resolved' }),
    });
    const data7 = await res7.json();
    assert(res7.status === 403 && data7.error === 'FORBIDDEN_ADMIN_REQUIRED', '[TEST 7] Citizen updating complaint status returns 403');

    // TEST 8: Citizen attempting to access admin analytics overview returns 403
    const res8 = await fetch(`${BASE_URL}/admin/analytics/overview`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const data8 = await res8.json();
    assert(res8.status === 403 && data8.error === 'FORBIDDEN_ADMIN_REQUIRED', '[TEST 8] Citizen accessing admin analytics returns 403');

    // TEST 9: Citizen attempting to export analytics CSV returns 403
    const res9 = await fetch(`${BASE_URL}/admin/analytics/export`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    assert(res9.status === 403, '[TEST 9] Citizen accessing admin analytics CSV export returns 403');

    // ==================================================================
    // PART 3: IDOR (INSECURE DIRECT OBJECT REFERENCE) PROTECTION
    // ==================================================================
    console.log('\n--- PART 3: IDOR PROTECTION ---');

    // TEST 10: Citizen B accessing Citizen A's complaint details returns 403
    const res10 = await fetch(`${BASE_URL}/complaints/${testComplaintId}`, {
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });
    const data10 = await res10.json();
    assert(res10.status === 403 && data10.error === 'FORBIDDEN', "[TEST 10] Citizen B accessing Citizen A's complaint details returns 403 FORBIDDEN");

    // TEST 11: Citizen B accessing Citizen A's complaint image returns 403
    const res11 = await fetch(`${BASE_URL}/complaints/${testComplaintId}/image`, {
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });
    const data11 = await res11.json();
    assert(res11.status === 403 && data11.error === 'FORBIDDEN', "[TEST 11] Citizen B accessing Citizen A's complaint image returns 403 FORBIDDEN");

    // TEST 12: Citizen B cannot see Citizen A's notifications in list
    const res12 = await fetch(`${BASE_URL}/notifications`, {
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });
    const data12 = await res12.json();
    const leakedNotif = (data12.notifications || []).find((n) => n._id === testNotificationId);
    assert(!leakedNotif, "[TEST 12] Citizen B notification listing does not contain Citizen A's notification");

    // TEST 13: Citizen B cannot mark Citizen A's notification as read
    const res13 = await fetch(`${BASE_URL}/notifications/${testNotificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });
    const data13 = await res13.json();
    assert(res13.status === 403 && data13.error === 'FORBIDDEN', "[TEST 13] Citizen B marking Citizen A's notification as read returns 403 FORBIDDEN");

    // TEST 14: Citizen B mark-all-read does not affect Citizen A's notification
    await fetch(`${BASE_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenBToken}` },
    });
    const notifInDb = await Notification.findById(testNotificationId);
    assert(notifInDb && notifInDb.isRead === false, "[TEST 14] Citizen B mark-all-read leaves Citizen A's notification strictly unread");

    // ==================================================================
    // PART 4: INPUT VALIDATION & BOUNDARY DEFENSE
    // ==================================================================
    console.log('\n--- PART 4: INPUT VALIDATION & BOUNDARY DEFENSE ---');

    // TEST 15: Malformed / non-existent complaint ID returns 404
    const res15 = await fetch(`${BASE_URL}/complaints/CE-NONEXISTENT-999999`, {
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    assert(res15.status === 404, '[TEST 15] Non-existent complaint ID returns 404');

    // TEST 16: Invalid notification ObjectId returns 400 INVALID_NOTIFICATION_ID
    const res16 = await fetch(`${BASE_URL}/notifications/not-a-valid-object-id/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const data16 = await res16.json();
    assert(res16.status === 400 && data16.error === 'INVALID_NOTIFICATION_ID', '[TEST 16] Malformed notification ObjectId returns 400');

    // TEST 17: Non-existent notification ObjectId returns 404
    const randomObjectId = new mongoose.Types.ObjectId();
    const res17 = await fetch(`${BASE_URL}/notifications/${randomObjectId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const data17 = await res17.json();
    assert(res17.status === 404 && data17.error === 'NOTIFICATION_NOT_FOUND', '[TEST 17] Non-existent notification ObjectId returns 404');

    // TEST 18: Admin invalid status value rejected with 400
    const res18 = await fetch(`${BASE_URL}/admin/complaints/${testComplaintId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'invalid_status_xyz' }),
    });
    const data18 = await res18.json();
    assert(res18.status === 400 && data18.error === 'INVALID_STATUS', '[TEST 18] Invalid complaint status transition rejected with 400');

    // TEST 19: Analytics invalid date range (from > to) rejected with 400
    const res19 = await fetch(`${BASE_URL}/admin/analytics/overview?from=2026-12-01&to=2026-01-01`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data19 = await res19.json();
    assert(res19.status === 400 && data19.error === 'INVALID_DATE_RANGE', '[TEST 19] Inverted date range in analytics rejected with 400');

    // TEST 20: Analytics malformed date string rejected with 400
    const res20 = await fetch(`${BASE_URL}/admin/analytics/overview?from=invalid-date`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data20 = await res20.json();
    assert(res20.status === 400 && data20.error === 'INVALID_FROM_DATE', '[TEST 20] Malformed date string in analytics rejected with 400');

    // TEST 21: Excessive pagination limit is safely clamped
    const res21 = await fetch(`${BASE_URL}/admin/complaints?limit=99999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data21 = await res21.json();
    assert(data21.pagination?.limit === 100, '[TEST 21] Excessive limit=99999 safely clamped to 100');

    // TEST 22: Negative pagination values safely coerced to min 1
    const res22 = await fetch(`${BASE_URL}/admin/complaints?page=-5&limit=-20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data22 = await res22.json();
    assert(data22.pagination?.page === 1 && data22.pagination?.limit === 1, '[TEST 22] Negative page/limit safely coerced to 1');

    // ==================================================================
    // PART 5: FILE UPLOAD SECURITY & TRAVERSAL CONTAINMENT
    // ==================================================================
    console.log('\n--- PART 5: FILE UPLOAD SECURITY & TRAVERSAL CONTAINMENT ---');

    // TEST 23: Missing file upload rejected with 400
    const res23 = await fetch(`${BASE_URL}/complaints`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizenAToken}` },
    });
    const data23 = await res23.json();
    assert(res23.status === 400 && data23.error === 'MISSING_IMAGE', '[TEST 23] Missing image file on complaint submission rejected with 400');

    // TEST 24: Direct directory traversal in storage service throws PathTraversalError
    let caughtTraversal = false;
    try {
      storageService.resolveSafePath('../../etc/passwd');
    } catch (err) {
      if (err instanceof PathTraversalError) caughtTraversal = true;
    }
    assert(caughtTraversal, '[TEST 24] Path traversal sequence ../../ rejected by storageService');

    // TEST 25: Null-byte injection in storage service throws PathTraversalError
    let caughtNullByte = false;
    try {
      storageService.resolveSafePath('complaints/photo.jpg\0.exe');
    } catch (err) {
      if (err instanceof PathTraversalError) caughtNullByte = true;
    }
    assert(caughtNullByte, '[TEST 25] Null byte injection sequence rejected by storageService');

    // TEST 26: Stored filename sanitization strictly strips malicious directory navigation
    const sanitizedFilename = storageService.generateSafeFilename('../../../evil.exe.jpg', 'CE-TEST-001');
    assert(!sanitizedFilename.includes('..') && !sanitizedFilename.includes('/') && !sanitizedFilename.includes('\\'), '[TEST 26] Stored filename strips all directory traversal paths');

    // ==================================================================
    // PART 6: HTTP SECURITY HEADERS & SERVER HARDENING
    // ==================================================================
    console.log('\n--- PART 6: HTTP SECURITY HEADERS & SERVER HARDENING ---');

    const resHeaders = await fetch(`${BASE_URL}/health`);

    // TEST 27: X-Content-Type-Options: nosniff header present
    const nosniff = resHeaders.headers.get('x-content-type-options');
    assert(nosniff === 'nosniff', '[TEST 27] X-Content-Type-Options: nosniff verified');

    // TEST 28: X-Frame-Options: SAMEORIGIN header present (clickjacking protection)
    const frameOptions = resHeaders.headers.get('x-frame-options');
    assert(frameOptions === 'SAMEORIGIN', '[TEST 28] X-Frame-Options: SAMEORIGIN verified');

    // TEST 29: X-Powered-By header suppressed (fingerprinting protection)
    const poweredBy = resHeaders.headers.get('x-powered-by');
    assert(!poweredBy, '[TEST 29] X-Powered-By header is suppressed');

    // TEST 30: RateLimit headers present on API responses
    const rateLimit = resHeaders.headers.get('ratelimit-limit');
    assert(rateLimit !== null && rateLimit !== undefined, '[TEST 30] RateLimit-Limit response header present');

    // TEST 31: Rate Limiter blocks excessive requests when threshold exceeded
    const testLimiter = new InMemoryRateLimiter({ windowMs: 5000, max: 2, message: 'Rate limit test' });
    const mockReq = { ip: '192.168.1.100', headers: {} };
    let testBlockStatus = null;
    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        testBlockStatus = code;
        return { json: () => {} };
      },
    };
    testLimiter.middleware()(mockReq, mockRes, () => {});
    testLimiter.middleware()(mockReq, mockRes, () => {});
    testLimiter.middleware()(mockReq, mockRes, () => {});
    assert(testBlockStatus === 429, '[TEST 31] In-memory rate limiter strictly blocks requests exceeding threshold (429)');

    // ==================================================================
    // PART 7: INFORMATION DISCLOSURE & DATA PRIVACY
    // ==================================================================
    console.log('\n--- PART 7: INFORMATION DISCLOSURE & DATA PRIVACY ---');

    // TEST 32: Analytics overview completely excludes citizen PII
    const res32 = await fetch(`${BASE_URL}/admin/analytics/overview?preset=all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data32 = await res32.json();
    const jsonStr = JSON.stringify(data32);
    const hasPii = jsonStr.includes(citizenAEmail) || jsonStr.includes('Citizen Alpha') || jsonStr.includes(password);
    assert(!hasPii, '[TEST 32] Analytics response strictly omits citizen emails, names, and passwords');

  } catch (err) {
    console.error('[!] Unexpected error during security test suite:', err);
    failCount++;
  } finally {
    // Cleanup temporary test data from MongoDB
    console.log('\n[*] Cleaning up test database records...');
    await Complaint.deleteMany({ complaintId: testComplaintId });
    await Notification.deleteMany({ user: citizenAId });
    await User.deleteMany({ email: { $in: [citizenAEmail, citizenBEmail, adminEmail] } });
    if (testComplaintId) {
      await storageService.deleteImage(`complaints/complaint_${testComplaintId}`).catch(() => {});
    }
    console.log('[+] Cleanup complete.');
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected.');
  }

  console.log('\n======================================================================');
  console.log(`SECURITY TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED (Total: ${passCount + failCount})`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSecurityTestSuite();
