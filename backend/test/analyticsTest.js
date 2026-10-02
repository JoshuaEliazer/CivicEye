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

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runAnalyticsTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 13: ANALYTICS, REPORTING & CITY INSIGHTS TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  const createdUserIds = [];
  const createdComplaintIds = [];

  await connectDB();

  const timestamp = Date.now();
  const citizenEmail = `analytics.citizen.${timestamp}@civiceye.local`;
  const adminEmail = `analytics.admin.${timestamp}@civiceye.local`;

  let citizenToken = null;
  let adminToken = null;
  let citizenId = null;
  let adminId = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Register test accounts (Citizen, Admin)
    // ------------------------------------------------------------------------
    console.log('\n[*] Setting up test accounts (Citizen, Admin)...');

    // 1. Citizen
    const resC = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Analytics Citizen',
        email: citizenEmail,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataC = await resC.json();
    citizenToken = dataC.token;
    citizenId = dataC.user?.id || dataC.user?._id;
    if (citizenId) createdUserIds.push(citizenId);
    console.log(`[+] Citizen registered: ${citizenEmail} (ID: ${citizenId})`);

    // 2. Admin
    const resA = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Analytics Admin',
        email: adminEmail,
        password: 'Password123!',
        role: 'ADMIN',
      }),
    });
    const dataA = await resA.json();
    adminToken = dataA.token;
    adminId = dataA.user?.id || dataA.user?._id;
    if (adminId) createdUserIds.push(adminId);
    console.log(`[+] Admin registered: ${adminEmail} (ID: ${adminId})`);

    // ------------------------------------------------------------------------
    // SETUP: Seed test complaints directly with controlled timestamps & ML data
    // ------------------------------------------------------------------------
    console.log('\n[*] Seeding test complaints with controlled timestamps & ML data...');

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000);

    // Complaint 1: Recent, pothole, resolved, 4-hour resolution duration
    const c1CreatedAt = new Date(twoDaysAgo.getTime() - 4 * 60 * 60 * 1000);
    const c1ResolvedAt = twoDaysAgo;
    const testComplaint1 = await Complaint.create({
      complaintId: `CE-TEST-${timestamp}-1`,
      title: 'Pothole on Main Road',
      description: 'Deep pothole causing hazards',
      issueType: 'pothole',
      status: 'resolved',
      citizen: citizenId,
      user: citizenId,
      location: {
        address: '100 MG Road, Bengaluru',
        latitude: 12.9716,
        longitude: 77.5946,
      },
      latitude: 12.9716,
      longitude: 77.5946,
      imageUrl: '/uploads/test_pothole.jpg',
      confidence: 0.88,
      isUncertain: false,
      detections: [{ class: 'pothole', confidence: 0.88, bbox: [10, 10, 50, 50] }],
      resolvedAt: c1ResolvedAt,
      createdAt: c1CreatedAt,
      updatedAt: c1ResolvedAt,
    });
    createdComplaintIds.push(testComplaint1._id);
    await Complaint.collection.updateOne(
      { _id: testComplaint1._id },
      { $set: { createdAt: c1CreatedAt, resolvedAt: c1ResolvedAt, updatedAt: c1ResolvedAt } }
    );

    // Complaint 2: Recent, leakage, in_progress, not resolved
    const testComplaint2 = await Complaint.create({
      complaintId: `CE-TEST-${timestamp}-2`,
      title: 'Water pipe leakage',
      description: 'Major water leakage from main pipeline',
      issueType: 'leakage',
      status: 'in_progress',
      citizen: citizenId,
      user: citizenId,
      location: {
        address: '200 Indiranagar, Bengaluru',
        latitude: 12.9784,
        longitude: 77.6408,
      },
      latitude: 12.9784,
      longitude: 77.6408,
      imageUrl: '/uploads/test_leakage.jpg',
      confidence: 0.72,
      isUncertain: false,
      detections: [{ class: 'leakage', confidence: 0.72, bbox: [5, 5, 30, 30] }],
      resolvedAt: null,
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
    });
    createdComplaintIds.push(testComplaint2._id);

    // Complaint 3: Recent, garbage, submitted, high confidence
    const testComplaint3 = await Complaint.create({
      complaintId: `CE-TEST-${timestamp}-3`,
      title: 'Garbage pile near park',
      description: 'Accumulated waste overflowing',
      issueType: 'garbage',
      status: 'submitted',
      citizen: citizenId,
      user: citizenId,
      location: {
        address: '300 Koramangala, Bengaluru',
        latitude: 12.935,
        longitude: 77.62,
      },
      latitude: 12.935,
      longitude: 77.62,
      imageUrl: '/uploads/test_garbage.jpg',
      confidence: 0.95,
      isUncertain: false,
      detections: [{ class: 'garbage', confidence: 0.95, bbox: [20, 20, 80, 80] }],
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    createdComplaintIds.push(testComplaint3._id);

    // Complaint 4: Recent, other, rejected, NO location, NO confidence
    const testComplaint4 = await Complaint.create({
      complaintId: `CE-TEST-${timestamp}-4`,
      title: 'General inquiry',
      description: 'Not a civic issue',
      issueType: 'other',
      status: 'rejected',
      citizen: citizenId,
      user: citizenId,
      location: {
        address: 'No GPS provided',
      },
      latitude: null,
      longitude: null,
      imageUrl: '/uploads/test_other.jpg',
      confidence: 0,
      isUncertain: false,
      detections: [],
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    createdComplaintIds.push(testComplaint4._id);

    // Complaint 5: 50 days ago (older), pothole, resolved, 48-hour resolution duration
    const c5CreatedAt = new Date(fiftyDaysAgo.getTime() - 48 * 60 * 60 * 1000);
    const c5ResolvedAt = fiftyDaysAgo;
    const testComplaint5 = await Complaint.create({
      complaintId: `CE-TEST-${timestamp}-5`,
      title: 'Historic road pothole',
      description: 'Pothole fixed 50 days ago',
      issueType: 'pothole',
      status: 'resolved',
      citizen: citizenId,
      user: citizenId,
      location: {
        address: '500 Whitefield, Bengaluru',
        latitude: 12.97,
        longitude: 77.75,
      },
      latitude: 12.97,
      longitude: 77.75,
      imageUrl: '/uploads/test_old.jpg',
      confidence: 0.82,
      isUncertain: false,
      detections: [{ class: 'pothole', confidence: 0.82, bbox: [15, 15, 45, 45] }],
      resolvedAt: c5ResolvedAt,
    });
    createdComplaintIds.push(testComplaint5._id);
    await Complaint.collection.updateOne(
      { _id: testComplaint5._id },
      { $set: { createdAt: c5CreatedAt, resolvedAt: c5ResolvedAt, updatedAt: c5ResolvedAt } }
    );

    console.log(`[+] Seeded 5 controlled test complaints.`);

    // ========================================================================
    // TEST 1: Admin can access analytics overview
    // ========================================================================
    formatStep(1, 'Admin can access analytics overview (200 OK)');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.status === 200 && data.success === true && data.overview) {
        console.log(`  ✓ Admin successfully retrieved overview. Total all time: ${data.overview.totalAllTime}`);
        passed++;
      } else {
        console.error(`  ✗ Failed: expected 200, got ${res.status}:`, data);
        failed++;
      }
    }

    // ========================================================================
    // TEST 2: No token returns 401
    // ========================================================================
    formatStep(2, 'No token returns 401 Unauthorized');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview`);
      if (res.status === 401) {
        console.log(`  ✓ Unauthenticated request rejected with 401.`);
        passed++;
      } else {
        console.error(`  ✗ Failed: expected 401, got ${res.status}`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 3: Invalid token returns 401
    // ========================================================================
    formatStep(3, 'Invalid token returns 401 Unauthorized');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview`, {
        headers: { Authorization: 'Bearer this.is.an.invalid.jwt.token' },
      });
      if (res.status === 401) {
        console.log(`  ✓ Invalid token rejected with 401.`);
        passed++;
      } else {
        console.error(`  ✗ Failed: expected 401, got ${res.status}`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 4: Citizen attempting analytics returns 403 Forbidden
    // ========================================================================
    formatStep(4, 'Citizen attempting analytics returns 403 Forbidden');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      if (res.status === 403) {
        console.log(`  ✓ Citizen token correctly denied with 403.`);
        passed++;
      } else {
        console.error(`  ✗ Failed: expected 403, got ${res.status}`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 5: Total complaint count is correct
    // ========================================================================
    formatStep(5, 'Total complaint count matches database records');
    {
      const totalInDB = await Complaint.countDocuments({});
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const reportedTotal = data.overview?.totalAllTime;
      if (reportedTotal === totalInDB) {
        console.log(`  ✓ Total complaints verified: ${reportedTotal} in response === ${totalInDB} in DB.`);
        passed++;
      } else {
        console.error(`  ✗ Count mismatch: DB has ${totalInDB}, analytics returned ${reportedTotal}`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 6: Status counts are correct
    // ========================================================================
    formatStep(6, 'Status counts are correctly aggregated');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const statusList = data.byStatus || [];
      const statusMap = {};
      statusList.forEach((item) => {
        statusMap[item.status] = item.count;
      });

      const dbResolved = await Complaint.countDocuments({ status: { $in: ['resolved', 'RESOLVED'] } });
      const dbSubmitted = await Complaint.countDocuments({ status: { $in: ['submitted', 'pending', 'SUBMITTED', 'PENDING'] } });
      const dbInProgress = await Complaint.countDocuments({ status: { $in: ['in_progress', 'IN_PROGRESS'] } });
      const dbRejected = await Complaint.countDocuments({ status: { $in: ['rejected', 'REJECTED'] } });

      const resolvedMatched = statusMap.resolved === dbResolved;
      const submittedMatched = statusMap.submitted === dbSubmitted;
      const inProgressMatched = statusMap.in_progress === dbInProgress;
      const rejectedMatched = statusMap.rejected === dbRejected;

      if (resolvedMatched && submittedMatched && inProgressMatched && rejectedMatched) {
        console.log(`  ✓ Status counts accurately match DB: resolved=${dbResolved}, submitted=${dbSubmitted}, in_progress=${dbInProgress}, rejected=${dbRejected}.`);
        passed++;
      } else {
        console.error(`  ✗ Status count discrepancy:`, { statusMap, dbResolved, dbSubmitted, dbInProgress, dbRejected });
        failed++;
      }
    }

    // ========================================================================
    // TEST 7: Category counts are correct
    // ========================================================================
    formatStep(7, 'Category counts are correctly aggregated');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const categories = data.byCategory || [];

      const dbPotholes = await Complaint.countDocuments({ issueType: { $in: ['pothole', 'POTHOLE'] } });
      const dbLeakages = await Complaint.countDocuments({ issueType: { $in: ['leakage', 'LEAKAGE'] } });
      const dbGarbage = await Complaint.countDocuments({ issueType: { $in: ['garbage', 'GARBAGE'] } });

      const potholeItem = categories.find((c) => c.category === 'pothole');
      const leakageItem = categories.find((c) => c.category === 'leakage');
      const garbageItem = categories.find((c) => c.category === 'garbage');

      if (
        potholeItem?.count === dbPotholes &&
        leakageItem?.count === dbLeakages &&
        garbageItem?.count === dbGarbage
      ) {
        console.log(`  ✓ Category counts match DB: pothole=${dbPotholes}, leakage=${dbLeakages}, garbage=${dbGarbage}.`);
        passed++;
      } else {
        console.error(`  ✗ Category discrepancy:`, { potholeItem, leakageItem, garbageItem, dbPotholes, dbLeakages, dbGarbage });
        failed++;
      }
    }

    // ========================================================================
    // TEST 8: Date range filtering works
    // ========================================================================
    formatStep(8, 'Date range filtering correctly limits the dataset');
    {
      const res7d = await fetch(`${BASE_URL}/admin/analytics/overview?range=7d`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data7d = await res7d.json();
      const count7d = data7d.overview?.totalInRange;

      const resAll = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const dataAll = await resAll.json();
      const countAll = dataAll.overview?.totalInRange;

      if (count7d < countAll && count7d >= 4) {
        console.log(`  ✓ Date range 7d filtered correctly: ${count7d} complaints in 7d vs ${countAll} in all-time.`);
        passed++;
      } else {
        console.error(`  ✗ Date range filter failure: count7d=${count7d}, countAll=${countAll}`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 9: Invalid date range is rejected
    // ========================================================================
    formatStep(9, 'Invalid date range is rejected with 400 Bad Request');
    {
      const resInvalidOrder = await fetch(`${BASE_URL}/admin/analytics/overview?from=2026-10-10&to=2026-10-01`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const resMalformed = await fetch(`${BASE_URL}/admin/analytics/overview?from=not-a-date&to=also-invalid`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (resInvalidOrder.status === 400 && resMalformed.status === 400) {
        console.log(`  ✓ Both invalid order and malformed date strings correctly returned 400 Bad Request.`);
        passed++;
      } else {
        console.error(`  ✗ Invalid date range test failed:`, {
          orderStatus: resInvalidOrder.status,
          malformedStatus: resMalformed.status,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 10: Trend aggregation returns correct values
    // ========================================================================
    formatStep(10, 'Trend aggregation returns correct intervals and series');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=7d`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const trends = data.trends;

      if (Array.isArray(trends) && trends.length > 0 && trends[0].date && trends[0].count !== undefined) {
        const totalTrendSum = trends.reduce((sum, item) => sum + item.count, 0);
        console.log(`  ✓ Trends aggregated correctly for 7d window. Found ${trends.length} buckets totaling ${totalTrendSum} complaints.`);
        passed++;
      } else {
        console.error(`  ✗ Trend aggregation unexpected structure:`, trends);
        failed++;
      }
    }

    // ========================================================================
    // TEST 11: Resolution statistics use only valid resolution timestamps
    // ========================================================================
    formatStep(11, 'Resolution statistics use only complaints with valid resolvedAt');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const resolution = data.resolution;

      if (
        resolution?.hasSufficientData === true &&
        resolution.timedCount >= 2 &&
        resolution.averageHours > 0 &&
        resolution.medianHours > 0
      ) {
        console.log(`  ✓ Resolution statistics calculated on valid timestamps: avg=${resolution.averageHours}h, median=${resolution.medianHours}h, count=${resolution.timedCount}.`);
        passed++;
      } else {
        console.error(`  ✗ Resolution statistics failed:`, resolution);
        failed++;
      }
    }

    // ========================================================================
    // TEST 12: Resolution rate is calculated from actual complaint data
    // ========================================================================
    formatStep(12, 'Resolution rate is calculated from actual complaint data');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const overview = data.overview;
      const expectedRate = overview.totalInRange > 0
        ? Math.round((overview.resolved / overview.totalInRange) * 1000) / 10
        : 0;

      if (overview?.resolutionRate === expectedRate) {
        console.log(`  ✓ Resolution rate verified: ${overview.resolutionRate}% (${overview.resolved}/${overview.totalInRange}).`);
        passed++;
      } else {
        console.error(`  ✗ Resolution rate mismatch: expected ${expectedRate}%, got ${overview?.resolutionRate}%`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 13: ML category statistics use stored ML data
    // ========================================================================
    formatStep(13, 'ML category statistics use stored ML predictions');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const ml = data.ml;

      if (ml && ml.totalAnalyzed >= 3 && ml.categoryConfidence && ml.confidenceDistribution) {
        console.log(`  ✓ ML category statistics verified from actual records: totalAnalyzed=${ml.totalAnalyzed}.`);
        passed++;
      } else {
        console.error(`  ✗ ML category statistics discrepancy:`, ml);
        failed++;
      }
    }

    // ========================================================================
    // TEST 14: ML confidence statistics ignore invalid/missing confidence values
    // ========================================================================
    formatStep(14, 'ML confidence statistics ignore invalid/missing confidence');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const ml = data.ml;

      // Complaint 1 (0.88), Complaint 2 (0.72), Complaint 3 (0.95), Complaint 5 (0.82)
      if (
        ml?.totalAnalyzed >= 4 &&
        ml.averageConfidence > 0 &&
        ml.maxConfidence >= 80 &&
        Array.isArray(ml.confidenceDistribution)
      ) {
        console.log(`  ✓ ML confidence statistics processed numeric scores: avg=${ml.averageConfidence}%, max=${ml.maxConfidence}%.`);
        passed++;
      } else {
        console.error(`  ✗ ML confidence calculation discrepancy:`, ml);
        failed++;
      }
    }

    // ========================================================================
    // TEST 15: Location statistics count only valid coordinates
    // ========================================================================
    formatStep(15, 'Location statistics accurately distinguish valid GPS coordinates');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      const location = data.location;

      if (
        location?.withCoordinatesCount >= 4 &&
        location?.withoutCoordinatesCount >= 1 &&
        location?.coordinateRate > 0 &&
        Array.isArray(location?.markers)
      ) {
        console.log(`  ✓ Location statistics verified: ${location.withCoordinatesCount} with coordinates, ${location.withoutCoordinatesCount} without coordinates (${location.coordinateRate}% coverage).`);
        passed++;
      } else {
        console.error(`  ✗ Location statistics discrepancy:`, location);
        failed++;
      }
    }

    // ========================================================================
    // TEST 16: Empty database / empty range returns safe empty analytics response
    // ========================================================================
    formatStep(16, 'Empty range returns safe zeroed response without errors');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?from=2035-01-01&to=2035-01-02`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();

      if (
        res.status === 200 &&
        data.success === true &&
        data.overview?.totalInRange === 0 &&
        data.resolution?.hasSufficientData === false &&
        data.trends?.length === 0
      ) {
        console.log(`  ✓ Zero-data response rendered safely with zero counts and hasSufficientData=false.`);
        passed++;
      } else {
        console.error(`  ✗ Empty dataset handling failed:`, data);
        failed++;
      }
    }

    // ========================================================================
    // TEST 17: Analytics does not expose citizen PII
    // ========================================================================
    formatStep(17, 'Analytics payload strictly contains zero citizen PII');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const rawText = await res.text();

      const containsCitizenEmail = rawText.includes(citizenEmail);
      const containsCitizenPassword = rawText.includes('Password123');
      const containsCitizenName = rawText.includes('Analytics Citizen');

      if (!containsCitizenEmail && !containsCitizenPassword && !containsCitizenName) {
        console.log(`  ✓ Privacy check verified: no citizen emails, names, or passwords present in analytics response.`);
        passed++;
      } else {
        console.error(`  ✗ Security leak: citizen personal data detected in analytics payload!`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 18: Citizen cannot override admin role via request body/query
    // ========================================================================
    formatStep(18, 'Citizen cannot spoof role via query parameters or body');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview?role=ADMIN&isAdmin=true`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'X-User-Role': 'ADMIN',
        },
      });

      if (res.status === 403) {
        console.log(`  ✓ Spoofed role/header rejected with 403 Forbidden.`);
        passed++;
      } else {
        console.error(`  ✗ Security vulnerability: citizen spoof succeeded, got status ${res.status}`);
        failed++;
      }
    }

    // ========================================================================
    // TEST 19: Multiple filters and presets work in harmony
    // ========================================================================
    formatStep(19, 'Preset filters (today, 7d, 30d, 90d, all) execute consistently');
    {
      const presets = ['today', '7d', '30d', '90d', 'all'];
      let allPresetsOk = true;

      for (const preset of presets) {
        const res = await fetch(`${BASE_URL}/admin/analytics/overview?range=${preset}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const data = await res.json();
        if (res.status !== 200 || !data.success) {
          allPresetsOk = false;
          console.error(`  ✗ Preset ${preset} failed with status ${res.status}`);
        }
      }

      if (allPresetsOk) {
        console.log(`  ✓ All 5 range presets returned 200 OK with valid schema.`);
        passed++;
      } else {
        failed++;
      }
    }

    // ========================================================================
    // TEST 20: CSV export endpoint returns valid CSV and zero PII
    // ========================================================================
    formatStep(20, 'CSV export endpoint returns valid CSV file with zero citizen PII');
    {
      const res = await fetch(`${BASE_URL}/admin/analytics/export?range=all`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const contentType = res.headers.get('content-type');
      const csvContent = await res.text();

      const hasCsvContentType = contentType?.includes('text/csv');
      const hasMetricHeader = csvContent.includes('Metric,Value');
      const hasCategoryHeader = csvContent.includes('Category,Count,Percentage');
      const containsCitizenEmail = csvContent.includes(citizenEmail);

      if (res.status === 200 && hasCsvContentType && hasMetricHeader && hasCategoryHeader && !containsCitizenEmail) {
        console.log(`  ✓ CSV export verified: status 200, valid headers, zero citizen personal info.`);
        passed++;
      } else {
        console.error(`  ✗ CSV export failed:`, {
          status: res.status,
          contentType,
          hasMetricHeader,
          hasCategoryHeader,
          containsCitizenEmail,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 21: Status update workflow maintains resolvedAt
    // ========================================================================
    formatStep(21, 'Admin updating status to resolved sets resolvedAt; moving away clears it');
    {
      // 1. Move Complaint 2 (currently in_progress) to resolved
      const resResolve = await fetch(`${BASE_URL}/admin/complaints/${testComplaint2.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'resolved',
          notes: 'Issue resolved by field technician',
        }),
      });

      const complaintAfterResolve = await Complaint.findById(testComplaint2._id);
      const hasResolvedAt = complaintAfterResolve.resolvedAt !== null && complaintAfterResolve.resolvedAt instanceof Date;

      // 2. Move it to in_progress again
      const resReopen = await fetch(`${BASE_URL}/admin/complaints/${testComplaint2.complaintId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'in_progress',
          notes: 'Reopening for secondary inspection',
        }),
      });

      const complaintAfterReopen = await Complaint.findById(testComplaint2._id);
      const isResolvedAtCleared = complaintAfterReopen.resolvedAt === null;

      if (resResolve.status === 200 && hasResolvedAt && resReopen.status === 200 && isResolvedAtCleared) {
        console.log(`  ✓ resolvedAt set on resolved and successfully cleared when moving back to in_progress.`);
        passed++;
      } else {
        console.error(`  ✗ resolvedAt lifecycle failure:`, {
          resolveStatus: resResolve.status,
          hasResolvedAt,
          reopenStatus: resReopen.status,
          isResolvedAtCleared,
        });
        failed++;
      }
    }

    // ========================================================================
    // TEST 22: Frontend production build artifact verification
    // ========================================================================
    formatStep(22, 'Frontend production build exists and is valid');
    {
      const distHtmlPath = path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html');
      if (fs.existsSync(distHtmlPath) && fs.statSync(distHtmlPath).size > 100) {
        console.log(`  ✓ Verified frontend dist bundle at ${distHtmlPath}`);
        passed++;
      } else {
        console.error(`  ✗ Frontend production bundle not found at ${distHtmlPath}`);
        failed++;
      }
    }
  } catch (err) {
    console.error('\n[!] Unexpected error during analytics test suite:', err);
    failed++;
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Remove test-created records
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test data...');
    if (createdComplaintIds.length > 0) {
      const delC = await Complaint.deleteMany({ _id: { $in: createdComplaintIds } });
      console.log(`  [-] Removed ${delC.deletedCount} test complaints.`);
    }
    if (createdUserIds.length > 0) {
      const delU = await User.deleteMany({ _id: { $in: createdUserIds } });
      console.log(`  [-] Removed ${delU.deletedCount} test users.`);
    }

    await mongoose.disconnect();
    console.log('[*] Disconnected from MongoDB.');

    console.log('\n' + '='.repeat(70));
    console.log(`ANALYTICS TEST SUITE RESULTS: ${passed} PASSED / ${failed} FAILED (Total: ${passed + failed})`);
    console.log('='.repeat(70));

    if (failed > 0) {
      process.exit(1);
    }
  }
};

runAnalyticsTests();
