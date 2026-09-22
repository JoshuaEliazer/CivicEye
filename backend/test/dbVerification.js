import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Complaint from '../src/models/Complaint.js';

dotenv.config();

const runVerification = async () => {
  console.log('='.repeat(60));
  console.log('CIVICEYE PHASE 2: DATABASE & MODEL VERIFICATION TEST');
  console.log('='.repeat(60));

  const connected = await connectDB();
  if (!connected) {
    console.error('[-] FATAL: Failed to connect to MongoDB');
    process.exit(1);
  }

  try {
    // 1. Clean up potential old test artifacts
    await User.deleteMany({ email: 'test.citizen@civiceye.local' });
    await Complaint.deleteMany({ complaintId: 'CIV-TEST-001' });

    // 2. Test User Creation
    console.log('\n[TEST 1] Creating and saving test User document...');
    const testUser = new User({
      name: 'Test Citizen',
      email: 'test.citizen@civiceye.local',
      password: 'secure_hashed_password_123',
      role: 'USER',
    });
    const savedUser = await testUser.save();
    console.log(`[+] User created successfully with ID: ${savedUser._id}`);
    if (savedUser.role !== 'USER' || !savedUser.createdAt) {
      throw new Error('User schema defaults/timestamps failed validation');
    }

    // 3. Test Complaint Creation with Relation & Detections
    console.log('\n[TEST 2] Creating and saving test Complaint document...');
    const testComplaint = new Complaint({
      complaintId: 'CIV-TEST-001',
      userId: savedUser._id,
      issueType: 'POTHOLE',
      description: 'Severe road pothole detected on Main Street junction',
      confidence: 0.9425,
      severity: 'HIGH',
      imageUrl: 'https://storage.civiceye.local/test-pothole.jpg',
      latitude: 12.9716,
      longitude: 77.5946,
      status: 'PENDING',
      detections: [
        {
          class: 'pothole',
          confidence: 0.9425,
          bbox: [100.5, 120.0, 350.2, 280.8],
        },
      ],
    });
    const savedComplaint = await testComplaint.save();
    console.log(`[+] Complaint created successfully: ${savedComplaint.complaintId}`);

    // 4. Test Query and Population
    console.log('\n[TEST 3] Querying complaint and populating user relation...');
    const fetchedComplaint = await Complaint.findOne({ complaintId: 'CIV-TEST-001' }).populate('userId');
    if (!fetchedComplaint || fetchedComplaint.userId.email !== 'test.citizen@civiceye.local') {
      throw new Error('Failed to query or populate User reference on Complaint');
    }
    console.log(`[+] Complaint found, linked user: ${fetchedComplaint.userId.name} (${fetchedComplaint.userId.email})`);
    console.log(`[+] Issue Type: ${fetchedComplaint.issueType}, Status: ${fetchedComplaint.status}`);
    console.log(`[+] Bounding box coords: ${JSON.stringify(fetchedComplaint.detections[0].bbox)}`);

    // 5. Test Schema Constraints (Invalid Issue Type & Status)
    console.log('\n[TEST 4] Validating schema rejection on invalid enum values...');
    let validationPassed = false;
    try {
      const invalidComplaint = new Complaint({
        complaintId: 'CIV-INVALID-001',
        issueType: 'FLYING_OBJECT', // Invalid enum
        description: 'Invalid issue',
        imageUrl: 'https://example.com/invalid.jpg',
        status: 'UNKNOWN_STATUS', // Invalid enum
      });
      await invalidComplaint.save();
    } catch (err) {
      validationPassed = true;
      console.log(`[+] Mongoose caught expected validation error: ${err.message}`);
    }

    if (!validationPassed) {
      throw new Error('Schema validation failed to reject invalid enum values');
    }

    // 6. Clean up test records
    console.log('\n[TEST 5] Cleaning up test records...');
    await Complaint.deleteOne({ _id: savedComplaint._id });
    await User.deleteOne({ _id: savedUser._id });
    console.log('[+] Cleanup complete.');

    console.log('\n' + '='.repeat(60));
    console.log('>>> ALL DATABASE & MODEL TESTS PASSED SUCCESSFULLY! <<<');
    console.log('='.repeat(60));
  } catch (error) {
    console.error(`\n[-] Test failed with error: ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[*] Disconnected from MongoDB.');
    process.exit(0);
  }
};

runVerification();
