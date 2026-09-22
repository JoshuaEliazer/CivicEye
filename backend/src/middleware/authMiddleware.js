import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const getJwtSecret = () =>
  process.env.JWT_SECRET || 'civiceye_jwt_secret_key_2026_super_secure_key_civic_platform';

/**
 * Protect routes: verifies JWT Bearer token and attaches user to req.user.
 */
export const protect = async (req, res, next) => {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]?.trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided. Format: Bearer <token>',
      error: 'NO_TOKEN',
    });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    // Fetch user from DB excluding password
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.',
        error: 'USER_NOT_FOUND',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authorization token has expired. Please log in again.',
        error: 'TOKEN_EXPIRED',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or malformed authorization token.',
        error: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed.',
      error: 'AUTH_FAILED',
    });
  }
};

/**
 * Authorize specific roles (e.g., 'ADMIN', 'USER').
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user?.role || 'anonymous'}' is not authorized to access this resource.`,
        error: 'FORBIDDEN_ROLE',
      });
    }
    next();
  };
};

/**
 * Middleware ensuring the requester is an authenticated administrator.
 * 1. Checks JWT validity & loads user via `protect`.
 * 2. Verifies that req.user.role === 'ADMIN'.
 */
export const requireAdmin = [
  protect,
  (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Administrator privileges required.',
        error: 'FORBIDDEN_ADMIN_REQUIRED',
      });
    }
    next();
  },
];

export default {
  protect,
  authorizeRoles,
  requireAdmin,
};
