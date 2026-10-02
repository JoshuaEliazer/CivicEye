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

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runNotificationTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 12: NOTIFICATIONS & COMPLAINT STATUS UPDATES TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Track created records for comprehensive cleanup
  const createdUserIds = [];
  const createdComplaintIds = [];

  // Load sample road fixture for complaint submission
  const roadFixturePath = path.join(FIXTURES_DIR, 'sample_road.jpg');
  const roadBuffer = fs.readFileSync(roadFixturePath);

  // Connect directly to DB for test assertion & cleanup
  await connectDB();

  const timestamp = Date.now();
  const citizen1Email = `notif.citizen1.${timestamp}@civiceye.local`;
  const citizen2Email = `notif.citizen2.${timestamp}@civiceye.local`;
  const adminEmail = `notif.admin.${timestamp}@civiceye.local`;

  let citizen1Token = null;
  let citizen2Token = null;
  let adminToken = null;

  let citizen1Id = null;
  let citizen2Id = null;
  let adminId = null;

  let complaint1 = null;
  let complaint2 = null;
  let citizen1SubmittedNotifId = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Register test accounts (Citizen 1, Citizen 2, Admin)
    // ------------------------------------------------------------------------
    console.log('\n[*] Setting up test accounts (Citizen 1, Citizen 2, Admin)...');

    // Citizen 1
    const resC1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Notification Citizen One',
        email: citizen1Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataC1 = await resC1.json();
    citizen1Token = dataC1.token;
    citizen1Id = dataC1.user?.id || dataC1.user?._id;
    if (citizen1Id) createdUserIds.push(citizen1Id);
    console.log(`[+] Citizen 1 registered: ${citizen1Email} (ID: ${citizen1Id})`);

    // Citizen 2
    const resC2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Notification Citizen Two',
        email: citizen2Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataC2 = await resC2.json();
    citizen2Token = dataC2.token;
    citizen2Id = dataC2.user?.id || dataC2.user?._id;
    if (citizen2Id) createdUserIds.push(citizen2Id);
    console.log(`[+] Citizen 2 registered: ${citizen2Email} (ID: ${citizen2Id})`);

    // Admin
    const resAdm = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Notification Admin',
        email: adminEmail,
        password: 'Password123!',
        role: 'ADMIN',
      }),
    });
    const dataAdm = await resAdm.json();
    adminToken = dataAdm.token;
    adminId = dataAdm.user?.id || dataAdm.user?._id;
    if (adminId) createdUserIds.push(adminId);
    console.log(`[+] Admin registered: ${adminEmail} (ID: ${adminId})`);

    // ------------------------------------------------------------------------
    // TEST 1: Authenticated citizen can retrieve notifications.
    // ------------------------------------------------------------------------
    formatStep(1, 'Authenticated citizen can retrieve notifications (GET /api/notifications)...');
    try {
      const res = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, success: ${data.success}, count: ${data.count}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!data.success) throw new Error('Expected success to be true');
      if (!Array.isArray(data.notifications)) throw new Error('Expected notifications to be an array');
      if (typeof data.unreadCount !== 'number') throw new Error('Expected unreadCount to be a number');

      console.log('[+] PASS: Authenticated citizen retrieved notifications successfully.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Unauthenticated notification request returns 401.
    // ------------------------------------------------------------------------
    formatStep(2, 'Unauthenticated notification request returns 401...');
    try {
      const res = await fetch(`${BASE_URL}/notifications`);
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, error: ${data.error}`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'NO_TOKEN') throw new Error(`Expected error NO_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Unauthenticated request rejected with 401.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Invalid token returns 401.
    // ------------------------------------------------------------------------
    formatStep(3, 'Invalid token returns 401...');
    try {
      const res = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: 'Bearer invalid.bogus.jwt.token' },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, error: ${data.error}`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'INVALID_TOKEN') throw new Error(`Expected INVALID_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Invalid token rejected with 401.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Citizen receives complaint-submitted notification.
    // ------------------------------------------------------------------------
    formatStep(4, 'Citizen receives complaint-submitted notification upon creation...');
    try {
      // Citizen 1 files a complaint
      const formData = new FormData();
      formData.append('image', new Blob([roadBuffer], { type: 'image/jpeg' }), 'road.jpg');
      formData.append('description', 'Test pothole for notification suite');
      formData.append('latitude', '12.9716');
      formData.append('longitude', '77.5946');
      formData.append('address', 'MG Road, Bangalore');

      const resSubmit = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: formData,
      });
      const dataSubmit = await resSubmit.json();
      if (resSubmit.status !== 201) throw new Error(`Complaint submission failed with ${resSubmit.status}: ${dataSubmit.message}`);

      complaint1 = dataSubmit.complaint;
      createdComplaintIds.push(complaint1.complaintId);
      console.log(`[+] Created test complaint: ${complaint1.complaintId}`);

      // Verify notification in DB & via API
      const resNotif = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataNotif = await resNotif.json();
      const submittedNotif = dataNotif.notifications.find(
        (n) => n.complaintId === complaint1.complaintId && n.type === 'complaint_submitted'
      );

      if (!submittedNotif) throw new Error('complaint_submitted notification not found for newly created complaint');
      citizen1SubmittedNotifId = submittedNotif._id;
      console.log(`[*] Found notification: "${submittedNotif.title}" — "${submittedNotif.message}"`);

      console.log('[+] PASS: Complaint submission created persistent notification.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Notification contains correct complaint reference.
    // ------------------------------------------------------------------------
    formatStep(5, 'Notification contains correct complaint reference...');
    try {
      const notifDoc = await Notification.findById(citizen1SubmittedNotifId).lean();
      if (!notifDoc) throw new Error('Notification record not found in MongoDB');

      console.log(`[*] Stored complaintId string: ${notifDoc.complaintId}`);
      console.log(`[*] Stored complaint ObjectId ref: ${notifDoc.complaint}`);

      if (notifDoc.complaintId !== complaint1.complaintId) {
        throw new Error(`Expected complaintId ${complaint1.complaintId}, got ${notifDoc.complaintId}`);
      }
      if (!notifDoc.complaint) {
        throw new Error('Expected complaint ObjectId reference to be populated');
      }

      console.log('[+] PASS: Notification contains exact complaint references.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Notification contains correct user/recipient.
    // ------------------------------------------------------------------------
    formatStep(6, 'Notification contains correct user/recipient...');
    try {
      const notifDoc = await Notification.findById(citizen1SubmittedNotifId).lean();
      console.log(`[*] Notification user: ${notifDoc.user}, Expected citizen1Id: ${citizen1Id}`);

      if (notifDoc.user.toString() !== citizen1Id.toString()) {
        throw new Error(`Expected user ${citizen1Id}, got ${notifDoc.user}`);
      }

      console.log('[+] PASS: Recipient identity strictly matches authenticated citizen.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Status transition creates notification.
    // ------------------------------------------------------------------------
    formatStep(7, 'Status transition creates notification via existing admin route...');
    try {
      const resStatus = await fetch(`${BASE_URL}/admin/complaints/${complaint1.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'under_review', notes: 'Reviewing report' }),
      });
      const dataStatus = await resStatus.json();
      if (resStatus.status !== 200) throw new Error(`Status update failed: ${dataStatus.message}`);

      // Check Citizen 1's notifications
      const resNotif = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataNotif = await resNotif.json();
      const reviewNotif = dataNotif.notifications.find(
        (n) => n.complaintId === complaint1.complaintId && n.type === 'complaint_under_review'
      );

      if (!reviewNotif) throw new Error('complaint_under_review notification was not generated');
      console.log(`[*] Status transition notification generated: "${reviewNotif.title}"`);

      console.log('[+] PASS: Admin status update triggered notification.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: submitted → under_review creates notification.
    // ------------------------------------------------------------------------
    formatStep(8, 'Verify submitted -> under_review notification details...');
    try {
      const reviewNotif = await Notification.findOne({
        complaintId: complaint1.complaintId,
        type: 'complaint_under_review',
      }).lean();

      if (!reviewNotif) throw new Error('complaint_under_review notification missing in DB');
      if (reviewNotif.title !== 'Complaint Under Review') {
        throw new Error(`Expected title 'Complaint Under Review', got '${reviewNotif.title}'`);
      }
      if (!reviewNotif.message.includes(complaint1.complaintId)) {
        throw new Error('Message does not contain complaintId');
      }

      console.log('[+] PASS: submitted -> under_review notification content verified.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: under_review → in_progress creates notification.
    // ------------------------------------------------------------------------
    formatStep(9, 'under_review -> in_progress creates notification...');
    try {
      const res = await fetch(`${BASE_URL}/admin/complaints/${complaint1.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'in_progress', notes: 'Crew dispatched' }),
      });
      if (res.status !== 200) throw new Error(`Status update failed: ${res.status}`);

      const notif = await Notification.findOne({
        complaintId: complaint1.complaintId,
        type: 'complaint_in_progress',
      }).lean();

      if (!notif) throw new Error('complaint_in_progress notification not generated');
      if (notif.title !== 'Complaint In Progress') {
        throw new Error(`Expected title 'Complaint In Progress', got '${notif.title}'`);
      }

      console.log('[+] PASS: under_review -> in_progress notification verified.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: in_progress → resolved creates notification.
    // ------------------------------------------------------------------------
    formatStep(10, 'in_progress -> resolved creates notification...');
    try {
      const res = await fetch(`${BASE_URL}/admin/complaints/${complaint1.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'resolved', notes: 'Pothole filled and sealed' }),
      });
      if (res.status !== 200) throw new Error(`Status update failed: ${res.status}`);

      const notif = await Notification.findOne({
        complaintId: complaint1.complaintId,
        type: 'complaint_resolved',
      }).lean();

      if (!notif) throw new Error('complaint_resolved notification not generated');
      if (notif.title !== 'Complaint Resolved') {
        throw new Error(`Expected title 'Complaint Resolved', got '${notif.title}'`);
      }

      console.log('[+] PASS: in_progress -> resolved notification verified.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Status transition to rejected creates notification.
    // ------------------------------------------------------------------------
    formatStep(11, 'Status transition to rejected creates notification...');
    try {
      // Citizen 1 creates a second complaint to test rejection
      const formData = new FormData();
      formData.append('image', new Blob([roadBuffer], { type: 'image/jpeg' }), 'road.jpg');
      formData.append('description', 'Complaint for rejection test');

      const resSub = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: formData,
      });
      const dataSub = await resSub.json();
      complaint2 = dataSub.complaint;
      createdComplaintIds.push(complaint2.complaintId);

      // Admin rejects it
      const resRej = await fetch(`${BASE_URL}/admin/complaints/${complaint2.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected', notes: 'Private property, outside municipal jurisdiction' }),
      });
      if (resRej.status !== 200) throw new Error(`Reject failed: ${resRej.status}`);

      const notif = await Notification.findOne({
        complaintId: complaint2.complaintId,
        type: 'complaint_rejected',
      }).lean();

      if (!notif) throw new Error('complaint_rejected notification not generated');
      if (notif.title !== 'Complaint Rejected') {
        throw new Error(`Expected title 'Complaint Rejected', got '${notif.title}'`);
      }

      console.log('[+] PASS: Rejected status transition created notification.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Updating a complaint to the SAME status does NOT create duplicate notification.
    // ------------------------------------------------------------------------
    formatStep(12, 'Updating to the SAME status does NOT create duplicate notification...');
    try {
      // Count notifications before same-status patch
      const countBefore = await Notification.countDocuments({
        complaintId: complaint2.complaintId,
        type: 'complaint_rejected',
      });

      // Admin submits rejected status again
      const resSame = await fetch(`${BASE_URL}/admin/complaints/${complaint2.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'rejected', notes: 'Second rejection submit attempt' }),
      });
      if (resSame.status !== 200) throw new Error(`Same-status patch failed: ${resSame.status}`);

      const countAfter = await Notification.countDocuments({
        complaintId: complaint2.complaintId,
        type: 'complaint_rejected',
      });

      console.log(`[*] Count before: ${countBefore}, Count after: ${countAfter}`);
      if (countBefore !== countAfter) {
        throw new Error(`Duplicate notification was created! Before: ${countBefore}, After: ${countAfter}`);
      }

      console.log('[+] PASS: Duplicate status change did not create duplicate notification.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 13: Citizen can retrieve only their own notifications.
    // ------------------------------------------------------------------------
    formatStep(13, 'Citizen can retrieve only their own notifications...');
    try {
      const res = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data = await res.json();
      console.log(`[*] Citizen 2 notifications count: ${data.notifications.length}`);

      // None of Citizen 2's notifications should have user !== citizen2Id
      const foreignNotif = data.notifications.find(
        (n) => (n.user?.id || n.user?._id || n.user?.toString()) !== citizen2Id.toString()
      );

      if (foreignNotif) {
        throw new Error('Citizen 2 received a notification belonging to another user!');
      }

      console.log('[+] PASS: Citizen notification listing is strictly isolated.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 14: Citizen cannot access another user's notification.
    // ------------------------------------------------------------------------
    formatStep(14, 'Citizen cannot mark another user\'s notification as read (Cross-user protection)...');
    try {
      // Citizen 2 attempts to mark Citizen 1's notification as read
      const res = await fetch(`${BASE_URL}/notifications/${citizen1SubmittedNotifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, error: ${data.error}`);

      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      if (data.error !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN, got ${data.error}`);

      console.log('[+] PASS: Cross-user modification rejected with 403.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 15: Citizen can mark own notification as read.
    // ------------------------------------------------------------------------
    formatStep(15, 'Citizen can mark own notification as read...');
    try {
      const res = await fetch(`${BASE_URL}/notifications/${citizen1SubmittedNotifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      console.log(`[*] Status: ${res.status}, isRead: ${data.notification?.isRead}, readAt: ${data.notification?.readAt}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (!data.notification?.isRead) throw new Error('Expected isRead to be true');
      if (!data.notification?.readAt) throw new Error('Expected readAt timestamp');

      // Check idempotence
      const resRepeat = await fetch(`${BASE_URL}/notifications/${citizen1SubmittedNotifId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      if (resRepeat.status !== 200) throw new Error(`Repeat mark-read failed with ${resRepeat.status}`);

      console.log('[+] PASS: Citizen marked own notification as read (idempotent).');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 16: Marking another user's notification as read is rejected.
    // ------------------------------------------------------------------------
    formatStep(16, 'Verify that target notification was NOT altered by unauthorized attempt...');
    try {
      // Find an unread notification belonging to Citizen 1
      const unreadNotif = await Notification.findOne({
        user: citizen1Id,
        isRead: false,
      });

      if (!unreadNotif) {
        throw new Error('No unread notification found for Citizen 1 to test');
      }

      // Citizen 2 attempts to mark it read
      const res = await fetch(`${BASE_URL}/notifications/${unreadNotif._id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);

      // Verify DB record remained unread
      const verifyDoc = await Notification.findById(unreadNotif._id).lean();
      if (verifyDoc.isRead !== false) {
        throw new Error('Notification isRead was illegally modified!');
      }

      console.log('[+] PASS: Notification remained untouched after rejected cross-user request.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 17: Mark-all-read only affects authenticated user's notifications.
    // ------------------------------------------------------------------------
    formatStep(17, 'Mark-all-read only affects authenticated user\'s notifications...');
    try {
      // Citizen 2 submits a complaint -> gets 1 unread notification
      const formData = new FormData();
      formData.append('image', new Blob([roadBuffer], { type: 'image/jpeg' }), 'road.jpg');
      formData.append('description', 'Citizen 2 complaint');
      const resC2Sub = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen2Token}` },
        body: formData,
      });
      const dataC2Sub = await resC2Sub.json();
      createdComplaintIds.push(dataC2Sub.complaint.complaintId);

      // Verify Citizen 2 has at least 1 unread notification
      const c2UnreadBefore = await Notification.countDocuments({ user: citizen2Id, isRead: false });
      if (c2UnreadBefore === 0) throw new Error('Citizen 2 should have unread notification');

      // Citizen 1 calls mark-all-read
      const resMarkAll = await fetch(`${BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataMarkAll = await resMarkAll.json();
      console.log(`[*] Citizen 1 mark-all-read: modifiedCount=${dataMarkAll.modifiedCount}`);

      // Check Citizen 1 has 0 unread
      const c1UnreadAfter = await Notification.countDocuments({ user: citizen1Id, isRead: false });
      if (c1UnreadAfter !== 0) throw new Error(`Expected Citizen 1 unread to be 0, got ${c1UnreadAfter}`);

      // Check Citizen 2 unread is UNCHANGED
      const c2UnreadAfter = await Notification.countDocuments({ user: citizen2Id, isRead: false });
      if (c2UnreadAfter !== c2UnreadBefore) {
        throw new Error(`Citizen 2 unread was affected! Before: ${c2UnreadBefore}, After: ${c2UnreadAfter}`);
      }

      console.log('[+] PASS: Mark-all-read was scoped strictly to authenticated user.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 18: Unread count is accurate.
    // ------------------------------------------------------------------------
    formatStep(18, 'Unread count is accurate via GET /api/notifications/unread-count...');
    try {
      // Citizen 2 currently has unread notifications
      const dbUnreadCount = await Notification.countDocuments({ user: citizen2Id, isRead: false });
      const res = await fetch(`${BASE_URL}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data = await res.json();
      console.log(`[*] DB count: ${dbUnreadCount}, API count: ${data.unreadCount}`);

      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      if (data.unreadCount !== dbUnreadCount) {
        throw new Error(`Mismatch: DB has ${dbUnreadCount}, API returned ${data.unreadCount}`);
      }

      console.log('[+] PASS: Unread count endpoint is 100% accurate.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 19: Pagination works correctly.
    // ------------------------------------------------------------------------
    formatStep(19, 'Server-side pagination works correctly (page, limit, total)...');
    try {
      // Create 5 test notifications for Citizen 1 directly via service/model
      for (let i = 1; i <= 5; i++) {
        await Notification.create({
          user: citizen1Id,
          type: 'complaint_submitted',
          title: `Pagination Test ${i}`,
          message: `Pagination test message ${i}`,
          isRead: false,
        });
      }

      // Query page 1 limit 2
      const resP1 = await fetch(`${BASE_URL}/notifications?page=1&limit=2`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataP1 = await resP1.json();

      // Query page 2 limit 2
      const resP2 = await fetch(`${BASE_URL}/notifications?page=2&limit=2`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataP2 = await resP2.json();

      console.log(`[*] Page 1 items: ${dataP1.notifications.length}, Page 2 items: ${dataP2.notifications.length}`);
      console.log(`[*] Total: ${dataP1.pagination.total}, Total Pages: ${dataP1.pagination.totalPages}`);

      if (dataP1.notifications.length !== 2) throw new Error('Expected 2 items on page 1');
      if (dataP2.notifications.length !== 2) throw new Error('Expected 2 items on page 2');
      if (dataP1.notifications[0]._id === dataP2.notifications[0]._id) {
        throw new Error('Page 1 and Page 2 contain overlapping items!');
      }

      console.log('[+] PASS: Server-side pagination verified.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 20: Notifications are ordered newest first.
    // ------------------------------------------------------------------------
    formatStep(20, 'Notifications are ordered newest first (reverse chronological)...');
    try {
      const res = await fetch(`${BASE_URL}/notifications?limit=10`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();
      const notifs = data.notifications;

      for (let i = 0; i < notifs.length - 1; i++) {
        const current = new Date(notifs[i].createdAt).getTime();
        const next = new Date(notifs[i + 1].createdAt).getTime();
        if (current < next) {
          throw new Error(`Ordering violation: index ${i} (${notifs[i].createdAt}) is older than index ${i + 1} (${notifs[i + 1].createdAt})`);
        }
      }

      console.log(`[*] Verified reverse chronological order across ${notifs.length} notifications.`);
      console.log('[+] PASS: Notifications are ordered newest first.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 21: Missing related complaint is handled safely.
    // ------------------------------------------------------------------------
    formatStep(21, 'Missing related complaint is handled gracefully without error...');
    try {
      const fakeComplaintId = new mongoose.Types.ObjectId();
      await Notification.create({
        user: citizen1Id,
        complaint: fakeComplaintId,
        complaintId: 'CE-2026-999999',
        type: 'complaint_submitted',
        title: 'Orphaned Complaint Notification',
        message: 'This complaint was deleted or does not exist.',
        isRead: false,
      });

      const res = await fetch(`${BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();

      const orphanedNotif = data.notifications.find((n) => n.complaintId === 'CE-2026-999999');
      if (!orphanedNotif) throw new Error('Orphaned notification was not returned');
      if (orphanedNotif.complaint !== null && orphanedNotif.complaint !== undefined && orphanedNotif.complaint._id) {
        throw new Error('Expected complaint to be null for nonexistent reference');
      }

      console.log('[+] PASS: Missing related complaint handled safely with null reference.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 22: Invalid notification ID is handled safely.
    // ------------------------------------------------------------------------
    formatStep(22, 'Invalid and nonexistent notification IDs are handled safely...');
    try {
      // Malformed ID -> 400
      const resInvalid = await fetch(`${BASE_URL}/notifications/not-an-id/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataInvalid = await resInvalid.json();
      console.log(`[*] Malformed ID response: ${resInvalid.status}, ${dataInvalid.error}`);
      if (resInvalid.status !== 400) throw new Error(`Expected 400, got ${resInvalid.status}`);

      // Valid ObjectId but non-existent -> 404
      const nonExistentId = new mongoose.Types.ObjectId();
      const resNotFound = await fetch(`${BASE_URL}/notifications/${nonExistentId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const dataNotFound = await resNotFound.json();
      console.log(`[*] Non-existent ID response: ${resNotFound.status}, ${dataNotFound.error}`);
      if (resNotFound.status !== 404) throw new Error(`Expected 404, got ${resNotFound.status}`);

      console.log('[+] PASS: Invalid and nonexistent IDs handled gracefully.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 23: Frontend notification component/API integration works as expected.
    // ------------------------------------------------------------------------
    formatStep(23, 'Frontend notification contract matches expected API responses...');
    try {
      const res = await fetch(`${BASE_URL}/notifications?limit=25`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();

      if (!data.success || !Array.isArray(data.notifications)) {
        throw new Error('API contract does not supply success and notifications array');
      }
      if (typeof data.unreadCount !== 'number') {
        throw new Error('API contract does not supply numerical unreadCount');
      }

      // Check NotificationPanel item field compatibility
      if (data.notifications.length > 0) {
        const item = data.notifications[0];
        const hasRequiredFields =
          '_id' in item &&
          'type' in item &&
          'title' in item &&
          'message' in item &&
          'isRead' in item &&
          'createdAt' in item;

        if (!hasRequiredFields) {
          throw new Error('Notification document is missing fields required by NotificationPanel');
        }
      }

      console.log('[+] PASS: API contract seamlessly supports frontend NotificationPanel.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 24: Frontend production build succeeds.
    // ------------------------------------------------------------------------
    formatStep(24, 'Frontend production build verification...');
    try {
      const frontendDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
      if (!fs.existsSync(frontendDistPath)) {
        throw new Error(`Frontend dist build not found at ${frontendDistPath}`);
      }

      const distContent = fs.readFileSync(frontendDistPath, 'utf8');
      if (!distContent.includes('<html')) {
        throw new Error('Frontend dist/index.html is invalid');
      }

      console.log('[+] PASS: Frontend production build artifact verified.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Purge test records
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test data...');
    try {
      if (createdUserIds.length > 0) {
        const notifDel = await Notification.deleteMany({ user: { $in: createdUserIds } });
        console.log(`[+] Deleted ${notifDel.deletedCount} test notifications`);

        const compDel = await Complaint.deleteMany({ user: { $in: createdUserIds } });
        console.log(`[+] Deleted ${compDel.deletedCount} test complaints`);

        const userDel = await User.deleteMany({ _id: { $in: createdUserIds } });
        console.log(`[+] Deleted ${userDel.deletedCount} test users`);
      }
    } catch (cleanErr) {
      console.error(`[!] Cleanup error: ${cleanErr.message}`);
    }

    await mongoose.connection.close();
    console.log('[+] Database connection closed.');
  }

  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log(`PHASE 12 NOTIFICATION TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runNotificationTests().catch((err) => {
  console.error('[!] Fatal test error:', err);
  process.exit(1);
});
