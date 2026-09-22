import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const getJwtSecret = () =>
  process.env.JWT_SECRET || 'civiceye_jwt_secret_key_2026_super_secure_key_civic_platform';

const getJwtExpiresIn = () => process.env.JWT_EXPIRES_IN || '7d';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Signs a JWT token containing user id, email, and role.
 */
export const signToken = (user, customExpiresIn = null) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    {
      expiresIn: customExpiresIn || getJwtExpiresIn(),
    }
  );
};

/**
 * Register a new citizen or administrator.
 * Route: POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};

    // 1. Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name is required and must be at least 2 characters long.',
        error: 'INVALID_NAME',
      });
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required.',
        error: 'INVALID_EMAIL',
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password is required and must be at least 6 characters long.',
        error: 'INVALID_PASSWORD',
      });
    }

    // 2. Validate optional role
    const normalizedRole = role ? role.toUpperCase() : 'USER';
    if (!['USER', 'ADMIN'].includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        message: `Role must be either 'USER' or 'ADMIN'. Got: ${role}`,
        error: 'INVALID_ROLE',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 3. Check for existing user with duplicate email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
        error: 'DUPLICATE_EMAIL',
      });
    }

    // 4. Create and persist user (password will be hashed via model pre-save hook)
    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: normalizedRole,
    });

    const savedUser = await newUser.save();

    // 5. Generate JWT token
    const token = signToken(savedUser);

    // 6. Return response without password
    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        createdAt: savedUser.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
        error: 'DUPLICATE_EMAIL',
      });
    }
    return next(err);
  }
};

/**
 * Authenticate existing citizen or administrator.
 * Route: POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    // 1. Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are both required.',
        error: 'MISSING_CREDENTIALS',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Query user from database
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
        error: 'INVALID_CREDENTIALS',
      });
    }

    // 3. Verify password via bcrypt
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
        error: 'INVALID_CREDENTIALS',
      });
    }

    // 4. Generate JWT token
    const token = signToken(user);

    // 5. Return sanitized user
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get profile of current authenticated user.
 * Route: GET /api/auth/me
 * Access: Protected
 */
export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    },
  });
};

/**
 * Protected test endpoint for automated test verification.
 * Route: GET /api/auth/protected-test
 * Access: Protected
 */
export const testProtected = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Protected route accessed successfully.',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role,
    },
    timestamp: new Date().toISOString(),
  });
};

export default {
  register,
  login,
  getMe,
  testProtected,
  signToken,
};
