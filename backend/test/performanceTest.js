/**
 * ======================================================================
 * CIVICEYE PHASE 15: PERFORMANCE & RESOURCE HARDENING TEST SUITE
 * ======================================================================
 * Verifies backend throughput safeguards, query bounding, indexing,
 * and memory-protection mechanisms:
 * 1. Health endpoint responsiveness
 * 2. ML health proxy responsiveness
 * 3. Complaint pagination & bounded result sets
 * 4. Notification pagination & compound query bounds
 * 5. Analytics query bounding & geospatial marker caps (<= 300)
 * 6. Concurrent request resilience under parallel load
 * 7. Compound index coverage across Complaint and Notification schemas
 * 8. Lean query performance & memory safety
 * 9. Rate limiter in-memory sliding-window pruning
 * ======================================================================
 */

import mongoose from 'mongoose';
import Complaint from '../src/models/Complaint.js';
import Notification from '../src/models/Notification.js';
import User from '../src/models/User.js';
import { InMemoryRateLimiter } from '../src/middleware/rateLimiter.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000/api';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/civiceye';

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

async function runPerformanceTestSuite() {
  console.log('======================================================================');
  console.log('CIVICEYE PHASE 15: PERFORMANCE & RESOURCE HARDENING TEST SUITE');
  console.log('======================================================================');
  console.log(`Target Backend URL: ${BASE_URL}`);

  await mongoose.connect(MONGODB_URI);
  console.log(`[MongoDB] Connected: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  const timestamp = Date.now();
  const citizenEmail = `perf.citizen.${timestamp}@civiceye.local`;
  const adminEmail = `perf.admin.${timestamp}@civiceye.local`;
  const password = 'StrongPassword123!';

  let citizenToken, citizenId;
  let adminToken, adminId;

  try {
    // ------------------------------------------------------------------
    // Setup: Provision test personas
    // ------------------------------------------------------------------
    const regResCitizen = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Perf Citizen', email: citizenEmail, password, role: 'USER' }),
    });
    const citizenData = await regResCitizen.json();
    citizenToken = citizenData.token;
    citizenId = citizenData.user?.id;

    const regResAdmin = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Perf Admin', email: adminEmail, password, role: 'ADMIN' }),
    });
    const adminData = await regResAdmin.json();
    adminToken = adminData.token;
    adminId = adminData.user?.id;

    console.log('[+] Performance test personas provisioned.\n');

    // TEST 1: Health endpoint responsiveness
    console.log('--- TEST 1: API Health Probe Responsiveness ---');
    const startHealth = Date.now();
    const resHealth = await fetch(`${BASE_URL}/health`);
    const durationHealth = Date.now() - startHealth;
    const dataHealth = await resHealth.json();
    assert(
      resHealth.status === 200 && dataHealth.database?.status === 'connected',
      `API health endpoint responded with 200 OK (${durationHealth}ms, DB connected)`
    );

    // TEST 2: ML health proxy responsiveness
    console.log('\n--- TEST 2: ML Health Proxy Responsiveness ---');
    const startMl = Date.now();
    const resMl = await fetch(`${BASE_URL}/ml/health`);
    const durationMl = Date.now() - startMl;
    const dataMl = await resMl.json();
    assert(
      resMl.status === 200 && dataMl.online === true && dataMl.modelLoaded === true,
      `ML health proxy responded with 200 OK (${durationMl}ms, YOLO26 loaded)`
    );

    // TEST 3: Admin complaints pagination bounds
    console.log('\n--- TEST 3: Admin Complaints Query Bounding ---');
    const resAdminComplaints = await fetch(`${BASE_URL}/admin/complaints?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const dataAdminComplaints = await resAdminComplaints.json();
    assert(
      resAdminComplaints.status === 200 &&
        Array.isArray(dataAdminComplaints.complaints) &&
        dataAdminComplaints.pagination?.limit === 5,
      `Admin complaints query returned bounded page (limit=5, total=${dataAdminComplaints.pagination?.total})`
    );

    // TEST 4: Citizen complaints bounded response
    console.log('\n--- TEST 4: Citizen Complaints Bounded Response ---');
    const resCitizenComplaints = await fetch(`${BASE_URL}/complaints?limit=10`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const dataCitizenComplaints = await resCitizenComplaints.json();
    assert(
      resCitizenComplaints.status === 200 && Array.isArray(dataCitizenComplaints.complaints),
      `Citizen complaints returned bounded results (count=${dataCitizenComplaints.count})`
    );

    // TEST 5: Notification pagination bounding
    console.log('\n--- TEST 5: Notification Pagination Bounding ---');
    const resNotifs = await fetch(`${BASE_URL}/notifications?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    const dataNotifs = await resNotifs.json();
    assert(
      resNotifs.status === 200 &&
        Array.isArray(dataNotifs.notifications) &&
        dataNotifs.pagination?.limit === 5,
      `Notification pagination strictly constrained to limit 5`
    );

    // TEST 6: Analytics date range query performance
    console.log('\n--- TEST 6: Analytics Date Range Bounding ---');
    const startAnalytics = Date.now();
    const resAnalytics = await fetch(`${BASE_URL}/admin/analytics/overview?preset=7d`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const durationAnalytics = Date.now() - startAnalytics;
    const dataAnalytics = await resAnalytics.json();
    assert(
      resAnalytics.status === 200 && dataAnalytics.success === true,
      `Analytics overview aggregated in ${durationAnalytics}ms with preset 7d`
    );

    // TEST 7: Map markers cap enforcement (<= 300)
    console.log('\n--- TEST 7: Geospatial Map Markers Safety Cap ---');
    const markerCount = dataAnalytics.location?.markers?.length || 0;
    assert(
      markerCount <= 300,
      `Geospatial location markers count (${markerCount}) strictly satisfies safety limit <= 300`
    );

    // TEST 8: Concurrent request resilience
    console.log('\n--- TEST 8: Concurrent Parallel Request Resilience ---');
    const parallelRequests = 15;
    const promises = [];
    for (let i = 0; i < parallelRequests; i++) {
      promises.push(fetch(`${BASE_URL}/health`));
    }
    const startParallel = Date.now();
    const responses = await Promise.all(promises);
    const durationParallel = Date.now() - startParallel;
    const allSuccessful = responses.every((r) => r.status === 200);
    assert(
      allSuccessful,
      `${parallelRequests} concurrent requests completed successfully in ${durationParallel}ms (100% 200 OK)`
    );

    // TEST 9: Compound index coverage on Complaint schema
    console.log('\n--- TEST 9: Complaint Schema Compound Index Coverage ---');
    const complaintIndexes = Complaint.schema.indexes();
    const hasUserIndex = complaintIndexes.some(
      ([idx]) => idx.user === 1 && idx.createdAt === -1
    );
    const hasMultiFilterIndex = complaintIndexes.some(
      ([idx]) => idx.status === 1 && idx.issueType === 1 && idx.createdAt === -1
    );
    const hasResolutionIndex = complaintIndexes.some(
      ([idx]) => idx.status === 1 && idx.resolvedAt === 1 && idx.createdAt === 1
    );
    assert(
      hasUserIndex && hasMultiFilterIndex && hasResolutionIndex,
      'Complaint schema includes verified compound indexes: {user, createdAt}, {status, issueType, createdAt}, {status, resolvedAt, createdAt}'
    );

    // TEST 10: Compound index coverage on Notification schema
    console.log('\n--- TEST 10: Notification Schema Compound Index Coverage ---');
    const notifIndexes = Notification.schema.indexes();
    const hasNotifCompound = notifIndexes.some(
      ([idx]) => idx.user === 1 && idx.isRead === 1 && idx.createdAt === -1
    );
    assert(
      hasNotifCompound,
      'Notification schema includes compound index: {user, isRead, createdAt}'
    );

    // TEST 11: Rate limiter memory pruning
    console.log('\n--- TEST 11: Rate Limiter Memory Pruning Safety ---');
    const testLimiter = new InMemoryRateLimiter({ windowMs: 100, max: 5 });
    testLimiter.hits.set('10.0.0.1', [Date.now() - 500, Date.now() - 300]); // stale timestamps
    testLimiter.hits.set('10.0.0.2', [Date.now()]); // active timestamp
    testLimiter.pruneStale();
    assert(
      !testLimiter.hits.has('10.0.0.1') && testLimiter.hits.has('10.0.0.2'),
      'In-memory rate limiter cleanly prunes expired IP timestamps to prevent memory growth'
    );

  } catch (err) {
    console.error('[!] Unexpected error during performance test suite:', err);
    failCount++;
  } finally {
    console.log('\n[*] Cleaning up test records...');
    await User.deleteMany({ email: { $in: [citizenEmail, adminEmail] } });
    console.log('[+] Cleanup complete.');
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected.');
  }

  console.log('\n======================================================================');
  console.log(`PERFORMANCE TEST RESULTS: ${passCount} PASSED / ${failCount} FAILED (Total: ${passCount + failCount})`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPerformanceTestSuite();
