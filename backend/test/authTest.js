import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';

dotenv.config();

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'civiceye_jwt_secret_key_2026_super_secure_key_civic_platform';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runAuthTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 6: AUTHENTICATION & USER MANAGEMENT TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  const testEmail = `citizen.${Date.now()}@civiceye.local`;
  const testPassword = 'Password123!';
  const testName = 'Citizen Maya';
  let activeToken = null;

  // Connect to DB for cleanup & direct hash inspection
  await connectDB();

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Successful Registration
    // ------------------------------------------------------------------------
    formatStep(1, 'Testing POST /api/auth/register with valid citizen details...');
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testName,
          email: testEmail,
          password: testPassword,
          role: 'USER',
        }),
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Message: ${data.message}`);
      console.log(`[*] User: ID=${data.user?.id}, Name=${data.user?.name}, Role=${data.user?.role}`);
      console.log(`[*] Token received: ${data.token ? 'Yes (JWT string)' : 'No'}`);

      if (res.status !== 201) throw new Error(`Expected 201 Created, got ${res.status}: ${data.message}`);
      if (!data.success) throw new Error('Response success flag is not true');
      if (!data.token) throw new Error('No JWT token returned upon registration');
      if (data.user?.password) throw new Error('SECURITY VIOLATION: Password hash exposed in response!');
      if (data.user?.email !== testEmail.toLowerCase()) throw new Error('Email mismatch in response');

      activeToken = data.token;
      console.log('[+] PASS: Citizen successfully registered and token generated.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Password Hashing Verification in Database
    // ------------------------------------------------------------------------
    formatStep(2, 'Verifying Bcrypt Password Hashing directly in MongoDB...');
    try {
      const dbUser = await User.findOne({ email: testEmail.toLowerCase() });
      if (!dbUser) throw new Error('User was not found in MongoDB');
      console.log(`[*] Stored Password in DB: ${dbUser.password}`);

      if (dbUser.password === testPassword) {
        throw new Error('SECURITY VIOLATION: Password stored in plaintext!');
      }

      if (!dbUser.password.startsWith('$2a$') && !dbUser.password.startsWith('$2b$')) {
        throw new Error('Stored password does not appear to be a valid Bcrypt hash!');
      }

      const match = await dbUser.comparePassword(testPassword);
      if (!match) throw new Error('comparePassword() returned false for correct password');

      console.log('[+] PASS: Password verified as salted Bcrypt hash ($2a$/$2b$).');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Duplicate Registration Rejection
    // ------------------------------------------------------------------------
    formatStep(3, 'Testing POST /api/auth/register with duplicate email...');
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Imposter Citizen',
          email: testEmail, // duplicate
          password: 'AnotherPassword456',
        }),
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error caught: ${data.message} (Code: ${data.error})`);

      if (res.status !== 409 && res.status !== 400) {
        throw new Error(`Expected 409 Conflict, got ${res.status}`);
      }
      if (data.success !== false) throw new Error('Expected success=false for duplicate email');

      console.log('[+] PASS: Duplicate registration properly rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Missing & Invalid Fields Validation
    // ------------------------------------------------------------------------
    formatStep(4, 'Testing POST /api/auth/register with missing/invalid fields...');
    try {
      // 4a. Short password (< 6 chars)
      const resShortPass = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Short Pass',
          email: 'shortpass@civiceye.local',
          password: '123',
        }),
      });
      const dataShortPass = await resShortPass.json();
      if (resShortPass.status !== 400) throw new Error('Expected 400 for short password');
      console.log(`[*] 4a Short password caught: ${dataShortPass.message}`);

      // 4b. Invalid email format
      const resBadEmail = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Email',
          email: 'not-an-email',
          password: 'ValidPassword123',
        }),
      });
      const dataBadEmail = await resBadEmail.json();
      if (resBadEmail.status !== 400) throw new Error('Expected 400 for invalid email format');
      console.log(`[*] 4b Invalid email format caught: ${dataBadEmail.message}`);

      // 4c. Missing name
      const resMissingName = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'noname@civiceye.local',
          password: 'ValidPassword123',
        }),
      });
      const dataMissingName = await resMissingName.json();
      if (resMissingName.status !== 400) throw new Error('Expected 400 for missing name');
      console.log(`[*] 4c Missing name caught: ${dataMissingName.message}`);

      console.log('[+] PASS: All invalid input fields cleanly rejected with 400 Bad Request.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Successful Login
    // ------------------------------------------------------------------------
    formatStep(5, 'Testing POST /api/auth/login with valid credentials...');
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Message: ${data.message}`);
      console.log(`[*] User: ${data.user?.name} (${data.user?.email})`);
      console.log(`[*] JWT Token: ${data.token ? data.token.substring(0, 30) + '...' : 'None'}`);

      if (res.status !== 200) throw new Error(`Expected 200 OK, got ${res.status}: ${data.message}`);
      if (!data.success) throw new Error('Expected success=true on valid login');
      if (!data.token) throw new Error('Expected JWT token on login');
      if (data.user?.password) throw new Error('SECURITY VIOLATION: Password hash exposed in login response');

      activeToken = data.token;
      console.log('[+] PASS: Login successful and JWT token received.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Invalid Login Credentials
    // ------------------------------------------------------------------------
    formatStep(6, 'Testing POST /api/auth/login with wrong password & non-existent user...');
    try {
      // 6a. Wrong password
      const resWrongPass = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'IncorrectPassword999!',
        }),
      });
      const dataWrongPass = await resWrongPass.json();
      if (resWrongPass.status !== 401) throw new Error(`Expected 401, got ${resWrongPass.status}`);
      console.log(`[*] 6a Wrong password caught: ${dataWrongPass.message}`);

      // 6b. Non-existent email
      const resNonExistent = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ghost.user.does.not.exist@civiceye.local',
          password: 'AnyPassword123!',
        }),
      });
      const dataNonExistent = await resNonExistent.json();
      if (resNonExistent.status !== 401) throw new Error(`Expected 401, got ${resNonExistent.status}`);
      console.log(`[*] 6b Non-existent user caught: ${dataNonExistent.message}`);

      console.log('[+] PASS: Invalid credentials rejected with 401 Unauthorized.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Protected Route Without Token (Expect 401)
    // ------------------------------------------------------------------------
    formatStep(7, 'Testing GET /api/auth/me without authorization token...');
    try {
      const res = await fetch(`${BASE_URL}/auth/me`);
      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error Response: ${data.message} (Code: ${data.error})`);

      if (res.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
      if (data.error !== 'NO_TOKEN') throw new Error(`Expected error NO_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Protected route rejected unauthenticated request.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: Protected Route With Valid Token
    // ------------------------------------------------------------------------
    formatStep(8, 'Testing GET /api/auth/me with valid Bearer token...');
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Authenticated User: ${data.user?.name}, Email: ${data.user?.email}, Role: ${data.user?.role}`);

      if (res.status !== 200) throw new Error(`Expected 200 OK, got ${res.status}: ${data.message}`);
      if (!data.success) throw new Error('Expected success=true');
      if (data.user?.email !== testEmail.toLowerCase()) throw new Error('Token resolved to incorrect user');
      if (data.user?.password) throw new Error('SECURITY VIOLATION: Password hash exposed in profile');

      console.log('[+] PASS: Protected route verified token and returned user profile.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Protected Route With Malformed / Invalid Token
    // ------------------------------------------------------------------------
    formatStep(9, 'Testing GET /api/auth/me with malformed / invalid signature token...');
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
          Authorization: 'Bearer this.is.an.invalid.token.signature',
        },
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'INVALID_TOKEN') throw new Error(`Expected INVALID_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Malformed token rejected with 401 Unauthorized.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: Protected Route With Expired Token
    // ------------------------------------------------------------------------
    formatStep(10, 'Testing GET /api/auth/me with deliberately expired token...');
    try {
      // Craft a token that expired 10 seconds ago
      const expiredToken = jwt.sign(
        { id: new mongoose.Types.ObjectId(), email: 'expired@civiceye.local', role: 'USER' },
        JWT_SECRET,
        { expiresIn: '-10s' }
      );

      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${expiredToken}`,
        },
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'TOKEN_EXPIRED') throw new Error(`Expected TOKEN_EXPIRED, got ${data.error}`);

      console.log('[+] PASS: Expired token cleanly rejected with TOKEN_EXPIRED code.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Protected Test Route (GET /api/auth/protected-test)
    // ------------------------------------------------------------------------
    formatStep(11, 'Testing GET /api/auth/protected-test verification route...');
    try {
      const res = await fetch(`${BASE_URL}/auth/protected-test`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      const data = await res.json();
      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Verified payload: ${JSON.stringify(data.user)}`);

      if (res.status !== 200) throw new Error(`Expected 200 OK, got ${res.status}`);
      if (!data.success) throw new Error('Expected success=true');

      console.log('[+] PASS: Protected test route returns verification payload.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // Cleanup Test User
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test citizen record from database...');
    await User.deleteMany({ email: testEmail.toLowerCase() });
    console.log('[+] Cleanup complete.');

  } catch (outerErr) {
    console.error(`[-] Unexpected test harness failure: ${outerErr.message}`);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('[*] Disconnected from MongoDB.');
  }

  // ------------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------------
  console.log('\n' + '='.repeat(70));
  console.log(`AUTH TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (Total ${passed + failed})`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runAuthTests();
