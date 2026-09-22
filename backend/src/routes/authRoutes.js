import express from 'express';
import { register, login, getMe, testProtected } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get token
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user profile
 * @access  Protected (Requires Bearer token)
 */
router.get('/me', protect, getMe);

/**
 * @route   GET /api/auth/protected-test
 * @desc    Sample protected route for token verification
 * @access  Protected (Requires Bearer token)
 */
router.get('/protected-test', protect, testProtected);

export default router;
