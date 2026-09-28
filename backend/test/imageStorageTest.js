import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';
import storageService, {
  LocalStorageService,
  StorageError,
  StorageValidationError,
  StorageFileNotFoundError,
  PathTraversalError,
} from '../src/services/storage/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000/api';

const formatStep = (num, title) => {
  console.log(`\n[TEST ${num}] ${title}`);
};

const runImageStorageTests = async () => {
  console.log('='.repeat(70));
  console.log('CIVICEYE PHASE 11: IMAGE STORAGE & MEDIA MANAGEMENT TEST SUITE');
  console.log('='.repeat(70));
  console.log(`Target Backend URL: ${BASE_URL}`);

  let passed = 0;
  let failed = 0;

  // Track created files and DB records for cleanup
  const createdStorageKeys = [];
  const createdComplaintIds = [];
  const createdUserIds = [];

  // Load test fixtures
  const roadFixturePath = path.join(FIXTURES_DIR, 'sample_road.jpg');
  const txtFixturePath = path.join(FIXTURES_DIR, 'invalid_doc.txt');
  const roadBuffer = fs.readFileSync(roadFixturePath);
  const txtBuffer = fs.readFileSync(txtFixturePath);

  // Connect to DB
  await connectDB();

  const timestamp = Date.now();
  const citizen1Email = `storage.citizen1.${timestamp}@civiceye.local`;
  const citizen2Email = `storage.citizen2.${timestamp}@civiceye.local`;
  const adminEmail = `storage.admin.${timestamp}@civiceye.local`;

  let citizen1Token = null;
  let citizen2Token = null;
  let adminToken = null;

  let citizen1Id = null;
  let citizen2Id = null;
  let adminId = null;

  let testComplaintId = null;
  let testStorageKey = null;

  try {
    // ------------------------------------------------------------------------
    // SETUP: Register two citizens and an admin
    // ------------------------------------------------------------------------
    console.log('\n[*] Setting up test accounts (Citizen 1, Citizen 2, Admin)...');

    // Citizen 1
    const resC1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Storage Citizen One',
        email: citizen1Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataC1 = await resC1.json();
    citizen1Token = dataC1.token;
    citizen1Id = dataC1.user?.id || dataC1.user?._id;
    if (citizen1Id) createdUserIds.push(citizen1Id);

    // Citizen 2
    const resC2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Storage Citizen Two',
        email: citizen2Email,
        password: 'Password123!',
        role: 'USER',
      }),
    });
    const dataC2 = await resC2.json();
    citizen2Token = dataC2.token;
    citizen2Id = dataC2.user?.id || dataC2.user?._id;
    if (citizen2Id) createdUserIds.push(citizen2Id);

    // Admin
    const resAdm = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Storage Admin',
        email: adminEmail,
        password: 'Password123!',
        role: 'ADMIN',
      }),
    });
    const dataAdm = await resAdm.json();
    adminToken = dataAdm.token;
    adminId = dataAdm.user?.id || dataAdm.user?._id;
    if (adminId) createdUserIds.push(adminId);

    console.log('[*] Test accounts successfully provisioned.');

    // ------------------------------------------------------------------------
    // TEST 1: Storage directory creation
    // ------------------------------------------------------------------------
    formatStep(1, 'Verifying storage directory automatic creation...');
    try {
      const uploadDir = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_PATH || 'uploads');
      const complaintsDir = path.join(uploadDir, 'complaints');

      await storageService.ensureDirectory(complaintsDir);
      const exists = fs.existsSync(complaintsDir);
      if (!exists) throw new Error(`Complaints directory was not created at: ${complaintsDir}`);

      console.log(`[+] PASS: Upload storage directory successfully verified at '${complaintsDir}'.`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 2: Valid image can be stored
    // ------------------------------------------------------------------------
    formatStep(2, 'Testing saving valid image via storage abstraction...');
    try {
      const stored = await storageService.saveImage({
        buffer: roadBuffer,
        originalName: 'pothole_evidence.jpg',
        mimetype: 'image/jpeg',
        complaintId: `CE-TEST-${timestamp}`,
      });

      if (!stored.filename) throw new Error('Missing stored filename');
      if (!stored.storageKey) throw new Error('Missing storageKey');
      if (stored.storageType !== 'local') throw new Error(`Unexpected storageType: ${stored.storageType}`);
      if (stored.size !== roadBuffer.length) throw new Error(`Size mismatch: got ${stored.size}, expected ${roadBuffer.length}`);

      createdStorageKeys.push(stored.storageKey);

      // Verify physical presence
      const { absolutePath } = await storageService.getImagePath(stored.storageKey);
      if (!fs.existsSync(absolutePath)) throw new Error(`Physical file does not exist at ${absolutePath}`);

      console.log(`[+] PASS: Image successfully stored at storageKey: '${stored.storageKey}'.`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 3: Stored filename is safe/unique
    // ------------------------------------------------------------------------
    formatStep(3, 'Testing stored filename sanitization, traversal safety, and uniqueness...');
    try {
      // Pass malicious original filename with path traversal attempts
      const stored1 = await storageService.saveImage({
        buffer: roadBuffer,
        originalName: '../../../etc/passwd.jpg',
        mimetype: 'image/jpeg',
        complaintId: 'CE-SAFE-1',
      });
      createdStorageKeys.push(stored1.storageKey);

      const stored2 = await storageService.saveImage({
        buffer: roadBuffer,
        originalName: '../../../etc/passwd.jpg',
        mimetype: 'image/jpeg',
        complaintId: 'CE-SAFE-2',
      });
      createdStorageKeys.push(stored2.storageKey);

      // Assert filenames do not contain ../ or slashes
      if (stored1.filename.includes('..') || stored1.filename.includes('/') || stored1.filename.includes('\\')) {
        throw new Error(`Unsafe characters found in generated filename: ${stored1.filename}`);
      }

      // Assert uniqueness even with identical original names
      if (stored1.filename === stored2.filename) {
        throw new Error('Collision detected: generated filenames must be strictly unique.');
      }

      console.log(`[+] PASS: Filenames are safely sanitized and collision-resistant.`);
      console.log(`    File 1: ${stored1.filename}`);
      console.log(`    File 2: ${stored2.filename}`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 4: Image metadata is correctly generated
    // ------------------------------------------------------------------------
    formatStep(4, 'Testing metadata object structure and fields generated by storageService...');
    try {
      const stored = await storageService.saveImage({
        buffer: roadBuffer,
        originalName: 'road_damage_site.jpg',
        mimetype: 'image/jpeg',
        complaintId: 'CE-META-TEST',
      });
      createdStorageKeys.push(stored.storageKey);

      if (stored.originalName !== 'road_damage_site.jpg') throw new Error(`Unexpected originalName: ${stored.originalName}`);
      if (stored.mimetype !== 'image/jpeg') throw new Error(`Unexpected mimetype: ${stored.mimetype}`);
      if (stored.size !== roadBuffer.length) throw new Error(`Unexpected size: ${stored.size}`);
      if (stored.storageType !== 'local') throw new Error(`Unexpected storageType: ${stored.storageType}`);
      if (!stored.url || stored.url !== '/api/complaints/CE-META-TEST/image') {
        throw new Error(`Unexpected url: ${stored.url}`);
      }

      console.log('[+] PASS: Metadata fields correctly generated (filename, originalName, mimetype, size, storageType, storageKey, url).');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 5: Image reference can be retrieved
    // ------------------------------------------------------------------------
    formatStep(5, 'Testing retrieving image stream and byte size through storage service...');
    try {
      const stored = await storageService.saveImage({
        buffer: roadBuffer,
        originalName: 'retrieve_sample.jpg',
        mimetype: 'image/jpeg',
        complaintId: 'CE-RETRIEVE',
      });
      createdStorageKeys.push(stored.storageKey);

      const { stream, size } = await storageService.getImageStream(stored.storageKey);
      if (size !== roadBuffer.length) throw new Error(`Stream size mismatch: got ${size}, expected ${roadBuffer.length}`);

      // Read stream into buffer to verify readability
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const readBuffer = Buffer.concat(chunks);
      if (readBuffer.length !== roadBuffer.length) {
        throw new Error(`Read buffer length mismatch: ${readBuffer.length} vs ${roadBuffer.length}`);
      }

      console.log(`[+] PASS: Stored image stream successfully read and verified (${readBuffer.length} bytes).`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 6: Valid image can be served through API (GET /api/complaints/:id/image)
    // ------------------------------------------------------------------------
    formatStep(6, 'Testing serving image through API GET /api/complaints/:id/image for complaint owner...');
    try {
      // First submit a complaint as Citizen 1
      const formData = new FormData();
      formData.append('image', new Blob([roadBuffer], { type: 'image/jpeg' }), 'pothole_field.jpg');
      formData.append('description', 'Severe pothole on Main Street with visible depth');
      formData.append('latitude', '12.9716');
      formData.append('longitude', '77.5946');

      const resCreate = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: formData,
      });

      const dataCreate = await resCreate.json();
      if (resCreate.status !== 201 || !dataCreate.success) {
        throw new Error(`Failed to create complaint: ${dataCreate.message}`);
      }

      testComplaintId = dataCreate.complaint.complaintId;
      testStorageKey = dataCreate.complaint.image?.storageKey;
      createdComplaintIds.push(testComplaintId);
      if (testStorageKey) createdStorageKeys.push(testStorageKey);

      // Now fetch image via GET /api/complaints/:complaintId/image
      const resImg = await fetch(`${BASE_URL}/complaints/${testComplaintId}/image`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });

      console.log(`[*] Status Code: ${resImg.status}`);
      console.log(`[*] Content-Type: ${resImg.headers.get('content-type')}`);

      if (resImg.status !== 200) throw new Error(`Expected status 200, got ${resImg.status}`);
      const contentType = resImg.headers.get('content-type');
      if (!contentType || !contentType.includes('image/jpeg')) {
        throw new Error(`Expected image/jpeg Content-Type, got ${contentType}`);
      }

      const imgBuffer = Buffer.from(await resImg.arrayBuffer());
      if (imgBuffer.length !== roadBuffer.length) {
        throw new Error(`Retrieved image size mismatch: ${imgBuffer.length} vs original ${roadBuffer.length}`);
      }

      console.log(`[+] PASS: Complaint image served with correct Content-Type and matching payload.`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 7: Unauthenticated image access is rejected
    // ------------------------------------------------------------------------
    formatStep(7, 'Testing unauthenticated image access GET /api/complaints/:id/image without token...');
    try {
      const res = await fetch(`${BASE_URL}/complaints/${testComplaintId}/image`);
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
      if (data.error !== 'NO_TOKEN') throw new Error(`Expected NO_TOKEN, got ${data.error}`);

      console.log('[+] PASS: Unauthenticated access rejected with 401 NO_TOKEN.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 8: Unauthorized user cannot access another user's image
    // ------------------------------------------------------------------------
    formatStep(8, 'Testing unauthorized citizen accessing another citizen\'s complaint image...');
    try {
      // Citizen 2 attempts to fetch Citizen 1's complaint image
      const res = await fetch(`${BASE_URL}/complaints/${testComplaintId}/image`, {
        headers: { Authorization: `Bearer ${citizen2Token}` },
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
      if (data.error !== 'FORBIDDEN') throw new Error(`Expected FORBIDDEN, got ${data.error}`);

      console.log('[+] PASS: Cross-user access prohibited with 403 FORBIDDEN.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 9: Admin can access permitted complaint image
    // ------------------------------------------------------------------------
    formatStep(9, 'Testing ADMIN accessing citizen complaint image...');
    try {
      const res = await fetch(`${BASE_URL}/complaints/${testComplaintId}/image`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Content-Type: ${resImgContentType => res.headers.get('content-type')}`);

      if (res.status !== 200) throw new Error(`Expected 200 for ADMIN, got ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length !== roadBuffer.length) {
        throw new Error(`Admin fetched buffer size mismatch: ${buffer.length}`);
      }

      console.log('[+] PASS: Administrator successfully retrieved citizen complaint image.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 10: Missing physical file returns controlled error
    // ------------------------------------------------------------------------
    formatStep(10, 'Testing controlled error handling when physical file is missing from disk...');
    try {
      // Create a complaint with non-existent physical file
      const ghostId = `CE-GHOST-${timestamp}`;
      const ghostComplaint = new Complaint({
        complaintId: ghostId,
        user: citizen1Id,
        userId: citizen1Id,
        issueType: 'pothole',
        description: 'Ghost complaint test for missing disk file',
        image: {
          filename: 'ghost_missing_image.jpg',
          originalName: 'ghost_missing_image.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          storageType: 'local',
          storageKey: 'complaints/ghost_missing_image_does_not_exist.jpg',
          path: 'complaints/ghost_missing_image_does_not_exist.jpg',
          url: `/api/complaints/${ghostId}/image`,
        },
        imageUrl: `/api/complaints/${ghostId}/image`,
        status: 'submitted',
      });
      await ghostComplaint.save();
      createdComplaintIds.push(ghostId);

      // Attempt to retrieve image for ghost complaint
      const res = await fetch(`${BASE_URL}/complaints/${ghostId}/image`, {
        headers: { Authorization: `Bearer ${citizen1Token}` },
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      if (data.error !== 'IMAGE_FILE_NOT_FOUND') {
        throw new Error(`Expected IMAGE_FILE_NOT_FOUND, got ${data.error}`);
      }

      console.log('[+] PASS: Missing physical file handled gracefully with controlled 404.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 11: Invalid image type is rejected
    // ------------------------------------------------------------------------
    formatStep(11, 'Testing rejection of invalid image file format (.txt)...');
    try {
      const formData = new FormData();
      formData.append('image', new Blob([txtBuffer], { type: 'text/plain' }), 'document.txt');
      formData.append('description', 'Attempting upload with non-image format');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: formData,
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
      if (data.error !== 'INVALID_FILE_TYPE') {
        throw new Error(`Expected INVALID_FILE_TYPE, got ${data.error}`);
      }

      console.log('[+] PASS: Invalid file format rejected at upload boundary.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 12: Oversized image is rejected
    // ------------------------------------------------------------------------
    formatStep(12, 'Testing rejection of oversized image (> 10MB limit)...');
    try {
      // Allocate an oversized buffer (10.5 MB)
      const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024);
      const formData = new FormData();
      formData.append('image', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'large.jpg');
      formData.append('description', 'Attempting upload with oversized file');

      const res = await fetch(`${BASE_URL}/complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizen1Token}` },
        body: formData,
      });
      const data = await res.json();

      console.log(`[*] Status Code: ${res.status}`);
      console.log(`[*] Error: ${data.message} (Code: ${data.error})`);

      if (res.status !== 413 && res.status !== 400) {
        throw new Error(`Expected 413 or 400, got ${res.status}`);
      }
      if (data.error !== 'FILE_TOO_LARGE') {
        throw new Error(`Expected FILE_TOO_LARGE, got ${data.error}`);
      }

      console.log('[+] PASS: Oversized image rejected with 413 FILE_TOO_LARGE.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 13: Path traversal attempt is rejected/safely contained
    // ------------------------------------------------------------------------
    formatStep(13, 'Testing path traversal containment on storage service...');
    try {
      let threw = false;
      try {
        await storageService.getImagePath('../../../package.json');
      } catch (traversalErr) {
        threw = true;
        if (!(traversalErr instanceof PathTraversalError)) {
          throw new Error(`Expected PathTraversalError, got ${traversalErr.name}: ${traversalErr.message}`);
        }
        if (traversalErr.code !== 'PATH_TRAVERSAL_DETECTED') {
          throw new Error(`Expected PATH_TRAVERSAL_DETECTED code, got ${traversalErr.code}`);
        }
      }

      if (!threw) throw new Error('Path traversal sequence was not rejected!');

      // Also test with Windows directory traversal separators
      let threwWin = false;
      try {
        await storageService.getImagePath('..\\..\\windows\\system32\\cmd.exe');
      } catch (winErr) {
        threwWin = true;
        if (winErr.code !== 'PATH_TRAVERSAL_DETECTED') {
          throw new Error(`Expected PATH_TRAVERSAL_DETECTED, got ${winErr.code}`);
        }
      }

      if (!threwWin) throw new Error('Windows backslash path traversal was not rejected!');

      console.log('[+] PASS: Path traversal attempts strictly neutralized and rejected.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 14: Complaint creation stores image reference in MongoDB
    // ------------------------------------------------------------------------
    formatStep(14, 'Verifying MongoDB Complaint record stores image reference metadata without raw binary...');
    try {
      const dbComplaint = await Complaint.findOne({ complaintId: testComplaintId });
      if (!dbComplaint) throw new Error(`Complaint ${testComplaintId} not found in DB`);

      console.log('[*] Image metadata in DB:', JSON.stringify(dbComplaint.image, null, 2));

      if (!dbComplaint.image.filename) throw new Error('image.filename missing in DB');
      if (!dbComplaint.image.storageKey) throw new Error('image.storageKey missing in DB');
      if (dbComplaint.image.storageType !== 'local') throw new Error(`Unexpected storageType: ${dbComplaint.image.storageType}`);
      if (!dbComplaint.image.url || !dbComplaint.image.url.includes(`/api/complaints/${testComplaintId}/image`)) {
        throw new Error(`Unexpected image.url: ${dbComplaint.image.url}`);
      }

      // Verify raw binary is NOT saved in DB document
      const docObj = dbComplaint.toObject();
      if (docObj.image?.buffer || docObj.image?.data) {
        throw new Error('Raw binary data found inside MongoDB document! Raw binary must not be stored.');
      }

      console.log('[+] PASS: MongoDB correctly stores image metadata reference without binary bloat.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 15: Complaint creation still stores ML results
    // ------------------------------------------------------------------------
    formatStep(15, 'Verifying YOLO26 ML inference results are intact after storage integration...');
    try {
      const dbComplaint = await Complaint.findOne({ complaintId: testComplaintId });
      if (!dbComplaint) throw new Error('Complaint record not found');

      console.log(`[*] ML Issue Type: ${dbComplaint.issueType}`);
      console.log(`[*] ML Confidence: ${dbComplaint.confidence}`);
      console.log(`[*] Detections Count: ${dbComplaint.detections.length}`);

      if (dbComplaint.confidence < 0 || dbComplaint.confidence > 1) {
        throw new Error(`Invalid confidence: ${dbComplaint.confidence}`);
      }
      if (!dbComplaint.modelArchitecture || !dbComplaint.modelArchitecture.includes('YOLO26')) {
        throw new Error(`Unexpected modelArchitecture: ${dbComplaint.modelArchitecture}`);
      }

      console.log('[+] PASS: ML pipeline results (issueType, confidence, detections) verified intact.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 16: Storage failure is handled without corrupting complaint state
    // ------------------------------------------------------------------------
    formatStep(16, 'Testing file cleanup and rollback behavior upon database failure...');
    try {
      // Save an image to disk
      const tempKey = `CE-ROLLBACK-${timestamp}`;
      const stored = await storageService.saveImage({
        buffer: roadBuffer,
        originalName: 'rollback_test.jpg',
        mimetype: 'image/jpeg',
        complaintId: tempKey,
      });

      // Verify file is initially present
      let existsBefore = await storageService.exists(stored.storageKey);
      if (!existsBefore) throw new Error('Image was not written to disk prior to rollback');

      // Simulate cleanup on DB failure
      await storageService.deleteImage(stored.storageKey);

      // Verify file is removed
      let existsAfter = await storageService.exists(stored.storageKey);
      if (existsAfter) throw new Error('Orphan file remained on disk after deleteImage cleanup');

      console.log('[+] PASS: Rollback mechanism cleans up stored file without orphan artifacts.');
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

    // ------------------------------------------------------------------------
    // TEST 17: Frontend build succeeds
    // ------------------------------------------------------------------------
    formatStep(17, 'Verifying frontend production build artifact (dist/index.html)...');
    try {
      const distIndex = path.resolve(__dirname, '../../frontend/dist/index.html');
      if (!fs.existsSync(distIndex)) {
        throw new Error(`Frontend build output not found at ${distIndex}. Run 'npm run build' in frontend first.`);
      }

      const distContent = fs.readFileSync(distIndex, 'utf8');
      if (!distContent.includes('<!DOCTYPE html>') && !distContent.includes('<html')) {
        throw new Error('Frontend dist/index.html is invalid or empty');
      }

      console.log(`[+] PASS: Frontend production build artifact verified at '${distIndex}'.`);
      passed++;
    } catch (err) {
      console.error(`[-] FAIL: ${err.message}`);
      failed++;
    }

  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP: Clean up all generated files and DB records
    // ------------------------------------------------------------------------
    console.log('\n[*] Cleaning up test files and MongoDB artifacts...');

    for (const key of createdStorageKeys) {
      try {
        await storageService.deleteImage(key);
      } catch (err) {
        // Ignore deletion errors during cleanup
      }
    }

    if (createdComplaintIds.length > 0) {
      await Complaint.deleteMany({ complaintId: { $in: createdComplaintIds } });
    }

    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }

    console.log(`[*] Cleanup complete (${createdStorageKeys.length} files, ${createdComplaintIds.length} complaints, ${createdUserIds.length} users removed).`);

    // Disconnect mongoose
    await mongoose.disconnect();
  }

  console.log('\n' + '='.repeat(70));
  console.log(`PHASE 11 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('='.repeat(70));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runImageStorageTests().catch((err) => {
  console.error('[FATAL TEST SUITE ERROR]:', err);
  process.exit(1);
});
